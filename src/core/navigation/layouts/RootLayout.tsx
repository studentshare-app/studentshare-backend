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
 *        authenticated                         → /(tabs)/index
 */

import { DatabaseProvider } from '@/contexts/DatabaseContext'
import { supabase } from '@/core/api/supabase'
import { PremiumProvider } from '@/core/entitlements/PremiumProvider'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Slot, useRootNavigationState, useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useRef, useState } from 'react'
import { AppState, LogBox, Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { triggerSync } from '@/core/sync'
import { processMaterialDownloads } from '@/core/sync/fileSyncService'
import { startRealtime, stopRealtime } from '@/core/sync/realtimeService'
import NetInfo from '@react-native-community/netinfo'

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

// ── Onboarding key — must match the one in OnboardingScreen ───────────────
const ONBOARDING_KEY = 'onboarding_complete'

export default function RootLayout() {
  const router = useRouter()
  const navigationState = useRootNavigationState()
  const navReady = !!navigationState?.key

  const [status, setStatus] = useState<AuthStatus>('loading')
  // null = not yet checked, true/false = resolved
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null)

  const navigatedRef = useRef(false)
  const signOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncingRef = useRef(false)

  // AUTH + ONBOARDING CHECK
  useEffect(() => {
    const doSessionCheck = async (): Promise<AuthStatus> => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()

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
        }

        if (session) return 'authenticated'

        const hasRefresh = await hasStoredRefreshToken()
        return hasRefresh ? 'authenticated' : 'unauthenticated'

      } catch {
        const hasRefresh = await hasStoredRefreshToken()
        return hasRefresh ? 'authenticated' : 'unauthenticated'
      }
    }

    // Resolve both auth and onboarding status in parallel
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
          // ✅ Do NOT reset navigatedRef here.
          // Login/Signup screens already call router.replace() on success.
          // Resetting navigatedRef caused the nav effect to fire a second
          // router.replace() that conflicted, briefly hitting +not-found.
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
                // ✅ Reset navigatedRef so the nav effect fires again
                // and redirects the user back to auth/onboarding.
                navigatedRef.current = false
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
  }, [status])

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
    if (onboardingDone === null) return   // still checking onboarding
    if (!navReady) return
    if (navigatedRef.current) return

    navigatedRef.current = true

    if (status === 'authenticated') {
      console.log('[NAV] → /(tabs)/index  (authenticated)')
      router.replace('/(tabs)/index' as any)
    } else if (!onboardingDone) {
      console.log('[NAV] → /(auth)/onboarding  (first launch)')
      router.replace('/(auth)/onboarding' as any)
    } else {
      console.log('[NAV] → /(auth)/login  (unauthenticated)')
      router.replace('/(auth)/login' as any)
    }
  }, [status, onboardingDone, navReady, router])

  // LOADING SCREEN — wait for auth + onboarding resolution
  if (!navReady || status === 'loading' || onboardingDone === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0F', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#F0F0F8', fontSize: 18, fontWeight: '600' }}>
          Loading...
        </Text>
      </View>
    )
  }

  return (
    <DatabaseProvider>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
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

