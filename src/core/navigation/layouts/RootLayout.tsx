/**
 * Root Layout - Auth + Onboarding + Sync + Offline + Realtime Ready
 *
 * Navigation authority: This layout is the SOLE decision-maker for initial
 * navigation on cold start. Auth screens (login, signup) handle their own
 * post-success navigation; this layout does NOT re-navigate on SIGNED_IN.
 *
 * Flow:
 *   1. Resolve auth status (session / refresh token check)
 *   2. Resolve onboarding status (AsyncStorage key)
 *   3. Navigate:
 *        unauthenticated + onboarding NOT done → /(auth)/onboarding
 *        unauthenticated + onboarding done     → /(auth)/login
 *        authenticated                         → /(tabs)
 */

import { DatabaseProvider } from '@/contexts/DatabaseContext'
import { supabase } from '@/core/api/supabase'
import { PremiumProvider } from '@/core/entitlements/PremiumProvider'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Slot, useRootNavigationState, useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useRef, useState } from 'react'
import { AppState, LogBox, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SyncIndicator } from '@/components/SyncIndicator'

import { triggerSync } from '@/core/sync'
import { processMaterialDownloads } from '@/core/sync/fileSyncService'
import { startRealtime, stopRealtime } from '@/core/sync/realtimeService'
import NetInfo from '@react-native-community/netinfo'
import * as SplashScreen from 'expo-splash-screen'

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {})

WebBrowser.maybeCompleteAuthSession()
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

const SUPABASE_SESSION_KEY =
  'sb-' +
  (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '')
    .replace('https://', '')
    .replace('.supabase.co', '') +
  '-auth-token'

async function hasStoredRefreshToken(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SUPABASE_SESSION_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return !!parsed?.currentSession?.refresh_token
  } catch {
    return false
  }
}

// ── Onboarding key – must match the one in OnboardingScreen ──────────────────
const ONBOARDING_KEY = 'onboarding_complete'

// ── Auth check with timeout to prevent hanging when offline ──────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

export default function RootLayout() {
  const router = useRouter()
  const navigationState = useRootNavigationState()
  const navReady = !!navigationState?.key

  const [status, setStatus] = useState<AuthStatus>('loading')
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null)
  const [hasHandledInitialNav, setHasHandledInitialNav] = useState(false)

  const navigatedRef = useRef(false)
  const signOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncingRef = useRef(false)

  // AUTH + ONBOARDING CHECK
  useEffect(() => {
    const doSessionCheck = async (): Promise<AuthStatus> => {
      try {
        // ✅ Check network first — if offline, skip Supabase call entirely
        const netState = await withTimeout(
          NetInfo.fetch(),
          2000,
          { isConnected: false } as any
        )
        const isOnline = netState.isConnected

        if (!isOnline) {
          // Offline — use stored token to determine auth status
          console.log('[Auth] Offline — checking stored token')
          const hasRefresh = await hasStoredRefreshToken()
          return hasRefresh ? 'authenticated' : 'unauthenticated'
        }

        // Online — check Supabase session with a timeout fallback
        const sessionResult = await withTimeout(
          supabase.auth.getSession(),
          5000,
          { data: { session: null }, error: new Error('timeout') } as any
        )

        const { data: { session }, error } = sessionResult

        if (error) {
          const msg = error.message?.toLowerCase() ?? ''
          const isHardError =
            msg.includes('invalid') ||
            msg.includes('jwt') ||
            msg.includes('refresh')

          if (isHardError) {
            await supabase.auth.signOut().catch(() => {})
            return 'unauthenticated'
          }

          // Soft error (e.g. timeout) — fall back to stored token
          const hasRefresh = await hasStoredRefreshToken()
          return hasRefresh ? 'authenticated' : 'unauthenticated'
        }

        if (session) return 'authenticated'

        const hasRefresh = await hasStoredRefreshToken()
        return hasRefresh ? 'authenticated' : 'unauthenticated'

      } catch {
        // Any unexpected error — fall back to stored token
        const hasRefresh = await hasStoredRefreshToken()
        return hasRefresh ? 'authenticated' : 'unauthenticated'
      }
    }

    const init = async () => {
      const [authResult, onboardingRaw] = await Promise.all([
        doSessionCheck(),
        AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null),
      ])
      setOnboardingDone(onboardingRaw === 'true')
      setStatus(authResult)
    }

    init()

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange(async (event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setStatus('authenticated')
        }

        if (event === 'SIGNED_OUT') {
          if (signOutTimer.current) clearTimeout(signOutTimer.current)

          signOutTimer.current = setTimeout(async () => {
            const { data: { session: current } } =
              await supabase.auth.getSession()

            if (!current) {
              const hasRefresh = await hasStoredRefreshToken()
              if (!hasRefresh) {
                navigatedRef.current = false
                setHasHandledInitialNav(false)
                setStatus('unauthenticated')
              }
            }
          }, 300)
        }
      })

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && status === 'authenticated') {
        runSync()
      }
    })

    return () => {
      subscription.unsubscribe()
      appStateSub.remove()
      if (signOutTimer.current) clearTimeout(signOutTimer.current)
    }
  }, [])

  // SYNC ENGINE
  const runSync = async () => {
    if (syncingRef.current) return
    syncingRef.current = true

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id

      if (!userId) return

      await triggerSync(userId)
      await processMaterialDownloads()

    } catch (err) {
      console.warn('Sync failed:', err)
    } finally {
      syncingRef.current = false
    }
  }

  // START SYNC + REALTIME
  useEffect(() => {
    if (status !== 'authenticated') return

    let unsubscribeNetInfo: any

    const init = async () => {
      await runSync()

      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id

      if (userId) {
        startRealtime(userId)
      }
    }

    init()

    unsubscribeNetInfo = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        runSync()
      }
    })

    return () => {
      unsubscribeNetInfo && unsubscribeNetInfo()
      stopRealtime()
    }
  }, [status])

  // NAVIGATION — sole authority for cold-start routing
  useEffect(() => {
    if (status === 'loading') return
    if (onboardingDone === null) return
    if (!navReady) return
    if (navigatedRef.current) return

    navigatedRef.current = true

    if (status === 'authenticated') {
      console.log('[NAV] → /(tabs)  (authenticated)')
      router.replace('/(tabs)' as any)
    } else if (!onboardingDone) {
      console.log('[NAV] → /(auth)/onboarding  (first launch)')
      router.replace('/(auth)/onboarding' as any)
    } else {
      console.log('[NAV] → /(auth)/login  (unauthenticated)')
      router.replace('/(auth)/login' as any)
    }

    setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {})
    }, 150)
  }, [status, onboardingDone, navReady])

  return (
    <DatabaseProvider>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <SyncIndicator />
          <PremiumProvider>
            <View style={{ flex: 1 }}>
              <Slot />
            </View>
          </PremiumProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </DatabaseProvider>
  )
}