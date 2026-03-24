/**
 * app/_layout.tsx  — Root layout & AuthGuard
 *
 * Offline behaviour matrix:
 *   Valid token   + offline → /(tabs)        ✅ getSession() reads AsyncStorage
 *   Expired token + offline → /(tabs)        ✅ refresh token fallback
 *   No session    + offline → /(auth)/login  ✅
 *   Bad token     + online  → /(auth)/login  ✅ clears stale storage
 *   Expired token + online  → /(tabs)        ✅ Supabase refreshes automatically
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Slot, useNavigationContainerRef, useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useRef, useState } from 'react'
import { AppState, LogBox, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { PremiumProvider } from '../contexts/PremiumContext'

WebBrowser.maybeCompleteAuthSession()

// TODO: Remove when the library that triggers this warning is upgraded.
// Suppresses: "setLayoutAnimationEnabledExperimental is deprecated"
LogBox.ignoreLogs(['setLayoutAnimationEnabledExperimental'])

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

// ── Supabase session storage key ──────────────────────────────────────────────
// Supabase v2 stores the session under a key derived from the project URL.
// We read it directly ONLY in the offline expired-token fallback — nowhere else.
const SUPABASE_SESSION_KEY =
  'sb-' +
  (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '')
    .replace('https://', '')
    .replace('.supabase.co', '') +
  '-auth-token'

/**
 * hasStoredRefreshToken
 *
 * Why this exists:
 *   When the device is offline AND the JWT access token has expired (default
 *   Supabase lifetime: 1 hour), supabase.auth.getSession() returns null because
 *   it cannot hit the network to exchange the refresh token.  Without this
 *   check, a user who hasn't opened the app in over an hour while offline gets
 *   incorrectly bounced to the login screen — even though they have a valid
 *   refresh token sitting in AsyncStorage.
 *
 *   Solution: peek at AsyncStorage directly. If a refresh token is present,
 *   treat the user as authenticated. Supabase will exchange it automatically
 *   the moment connectivity is restored.
 */
async function hasStoredRefreshToken(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SUPABASE_SESSION_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    // Supabase v2 shape: { currentSession: { refresh_token: string } }
    return !!parsed?.currentSession?.refresh_token
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Root layout
// ─────────────────────────────────────────────────────────────────────────────
export default function RootLayout() {
  const router        = useRouter()
  const navigationRef = useNavigationContainerRef()

  const [status,   setStatus]   = useState<AuthStatus>('loading')
  const [navReady, setNavReady] = useState(false)

  const navigatedRef = useRef(false)
  const wasAuthRef   = useRef(false)
  const signOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Wait for the navigation stack to be genuinely ready ───────────────────
  // Replaces the old onLayout + setTimeout(50ms) race condition.
  // setNavReady(true) only fires when Expo Router's stack is provably ready.
  useEffect(() => {
    if (navigationRef.isReady()) {
      setNavReady(true)
      return
    }
    const unsubscribe = navigationRef.addListener('state', () => {
      if (navigationRef.isReady()) {
        setNavReady(true)
        unsubscribe()
      }
    })
    return unsubscribe
  }, [navigationRef])

  // ── Initial session check + auth state subscription ───────────────────────
  useEffect(() => {
    const MIN_MS = 800 // Keep splash visible at least this long on fast devices

    const doSessionCheck = async (): Promise<AuthStatus> => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          const msg = error.message?.toLowerCase() ?? ''
          const isHardTokenError =
            msg.includes('refresh token') ||
            msg.includes('invalid token') ||
            msg.includes('not found') ||
            msg.includes('jwt')

          if (isHardTokenError) {
            // Genuinely invalid token — wipe local state and send to login.
            await supabase.auth.signOut().catch(() => {})
            await AsyncStorage.multiRemove([
              'studentshare_user_id_cache',
              'studentshare_dashboard_cache',
              'studentshare_announcements_cache',
              'studentshare_seen_material_ids',
            ]).catch(() => {})
            return 'unauthenticated'
          }
          // Other errors (network timeout, etc.) fall through to the
          // refresh-token fallback below.
        }

        if (session) return 'authenticated'

        // ── Offline / expired-token fallback ─────────────────────────────
        // getSession() returned null. This happens when the device is offline
        // and the access token has expired. Check AsyncStorage for a refresh
        // token — if one exists, keep the user authenticated and let Supabase
        // exchange it when connectivity is restored.
        const hasRefresh = await hasStoredRefreshToken()
        if (hasRefresh) return 'authenticated'

        return 'unauthenticated'
      } catch {
        // Even if getSession() threw unexpectedly, do the refresh-token check
        // before giving up — better to keep a valid user logged in.
        const hasRefresh = await hasStoredRefreshToken()
        return hasRefresh ? 'authenticated' : 'unauthenticated'
      }
    }

    // Race session check against minimum display time so the splash is never
    // dismissed in under MIN_MS ms regardless of how fast the device is.
    const timerPromise = new Promise<null>(resolve =>
      setTimeout(() => resolve(null), MIN_MS)
    )

    Promise.all([doSessionCheck(), timerPromise]).then(([authStatus]) => {
      if (authStatus === 'authenticated') wasAuthRef.current = true
      setStatus(authStatus)
    })

    // ── Real-time auth state listener ─────────────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (signOutTimer.current) {
          clearTimeout(signOutTimer.current)
          signOutTimer.current = null
        }
        wasAuthRef.current   = true
        navigatedRef.current = false
        setStatus('authenticated')
        return
      }

      if (event === 'SIGNED_OUT') {
        // Debounce: Supabase fires SIGNED_OUT briefly during token rotation on
        // poor connections. Re-check before actually logging the user out.
        if (signOutTimer.current) clearTimeout(signOutTimer.current)
        signOutTimer.current = setTimeout(async () => {
          try {
            const { data: { session: current } } = await supabase.auth.getSession()
            if (current) return // Token refreshed — stay authenticated

            // Also check refresh token before logging out offline users.
            const hasRefresh = await hasStoredRefreshToken()
            if (hasRefresh) return

            wasAuthRef.current   = false
            navigatedRef.current = false
            setStatus('unauthenticated')
          } catch {
            wasAuthRef.current   = false
            navigatedRef.current = false
            setStatus('unauthenticated')
          }
        }, 300)
      }
    })

    // ── AppState: re-validate session when app comes to foreground ────────
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      supabase.auth.getSession()
        .then(({ data: { session } }) => {
          if (session) {
            wasAuthRef.current = true
            setStatus('authenticated')
          } else if (!wasAuthRef.current) {
            setStatus('unauthenticated')
          }
        })
        .catch(() => {})
    })

    return () => {
      subscription.unsubscribe()
      appStateSub.remove()
      if (signOutTimer.current) clearTimeout(signOutTimer.current)
    }
  }, [])

  // ── Navigate once BOTH session resolved AND nav stack ready ───────────────
  useEffect(() => {
    if (status === 'loading') return
    if (!navReady)            return
    if (navigatedRef.current) return

    navigatedRef.current = true

    if (status === 'authenticated') {
      router.replace('/(tabs)')
    } else {
      router.replace('/(auth)/login')
    }
  }, [status, navReady, router])

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        {/*
          PremiumProvider outside Slot so every screen shares one reactive
          instance — upgrading updates all mounted screens simultaneously.
        */}
        <PremiumProvider>
          <View style={{ flex: 1 }}>
            <Slot />
          </View>
        </PremiumProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}