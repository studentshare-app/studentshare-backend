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
 *        authenticated + no college_id         → /(auth)/college-selection
 *        authenticated + has college_id        → /(tabs)
 */

import { DatabaseProvider } from '@/contexts/DatabaseContext'
import { supabase } from '@/core/api/supabase'
import { PremiumProvider } from '@/core/entitlements/PremiumProvider'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Slot, useRootNavigationState, useRouter, usePathname } from 'expo-router'
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

// Dynamic session key based on Supabase URL — matches how Supabase stores it
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
    return !!(parsed?.refresh_token || parsed?.currentSession?.refresh_token)
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

// ── Check if user has completed profile setup ─────────────────────────────────
async function hasCompletedProfile(userId: string): Promise<{ complete: boolean; collegeId?: string }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('college_id, class_id')
      .eq('id', userId)
      .single()

    if (error || !data) {
      console.log('[AuthCheck] Profile missing or error:', error?.message)
      return { complete: false }
    }

    if (!data.college_id) {
      console.log('[AuthCheck] Profile incomplete: No college')
      return { complete: false }
    }

    if (!data.class_id) {
      console.log('[AuthCheck] Profile incomplete: No class')
      return { complete: false, collegeId: data.college_id }
    }

    console.log('[AuthCheck] Profile complete')
    return { complete: true }
  } catch (err) {
    console.error('[AuthCheck] Profile fetch exception:', err)
    return { complete: false } // Fail-closed: require setup on error
  }
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
          // ✅ Ignore SIGNED_OUT when offline
          const net = await NetInfo.fetch().catch(() => ({ isConnected: true }))
          if (!net.isConnected) {
            console.log('[Auth] SIGNED_OUT received while offline — ignoring to prevent accidental logout')
            return
          }

          if (signOutTimer.current) clearTimeout(signOutTimer.current)

          signOutTimer.current = setTimeout(async () => {
            const { data: { session: current } } =
              await supabase.auth.getSession()

            if (!current) {
              const hasRefresh = await hasStoredRefreshToken()
              if (!hasRefresh) {
                // ✅ Clear cached profile IDs so the next user gets a fresh sync
                await AsyncStorage.removeItem('user_profile_ids').catch(() => {})
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

  const pathname = usePathname()

  // ── Auth routes that are allowed even if not logged in ──────────────────────
  const isAuthRoute = (path: string) => {
    return (
      path.includes('(auth)') ||
      path.includes('/auth/') ||
      ['/login', '/signup', '/forgot-password', '/onboarding', '/reset-password', '/college-selection', '/class-selection'].some(sub => path.includes(sub))
    )
  }

  // NAVIGATION — reactive authority for routing
  useEffect(() => {
    // In cold start, we wait for everything. 
    // On status changes (like login), we want to re-evaluate navigation.
    if (status === 'loading' || onboardingDone === null || !navReady) return

    // ✅ Never interrupt the OAuth callback route prematurely.
    // Let callback.tsx handle the token exchange. Once the session is recovered,
    // status will become 'authenticated' and RootLayout will gracefully handle routing.
    const navigate = async () => {
      // 1. If currently on the callback route, wait for the session to be established.
      // Once authenticated, we proceed to navigation to handle profile checks.
      if (pathname === '/auth/callback' && status !== 'authenticated') return

      if (status === 'authenticated') {
        const { data: { session } } = await supabase.auth.getSession()
        const userId = session?.user?.id

        if (userId) {
          const profileResult = await hasCompletedProfile(userId)
          
          if (!profileResult.complete) {
            if (profileResult.collegeId) {
              console.log('[NAV] → Class Selection (class missing)')
              router.replace({ pathname: '/(auth)/class-selection', params: { college_id: profileResult.collegeId } } as any)
            } else {
              console.log('[NAV] → College Selection (college missing)')
              router.replace('/(auth)/college-selection' as any)
            }
          } else {
            // Only redirect to tabs if at the root or on an auth screen that is no longer needed
            const isLandingPath = pathname === '/' || isAuthRoute(pathname) || pathname === '/index'
            if (!isLandingPath || pathname.includes('(tabs)')) return

            console.log('[NAV] → Tabs (profile complete)')
            router.replace('/(tabs)' as any)
          }
        }
      } else {
        // If on any auth screen, stay there and let it handle its own state.
        if (isAuthRoute(pathname)) return
        console.log('[NAV] → Login (unauthenticated, current:', pathname, ')')
        router.replace('/(auth)/login' as any)
      }

      setTimeout(() => {
        SplashScreen.hideAsync().catch(() => {})
      }, 150)
    }

    navigate()
  }, [status, onboardingDone, navReady, pathname])

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