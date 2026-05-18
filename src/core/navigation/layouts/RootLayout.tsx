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

async function getStoredUserId(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(SUPABASE_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.user?.id || parsed?.currentSession?.user?.id || null
  } catch {
    return null
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
async function hasCompletedProfile(userId: string): Promise<{ complete: boolean; collegeId?: string; isOffline?: boolean }> {
  const cacheKey = `profile_complete_${userId}`
  try {
    // 1. FAST PATH: Check local cache
    const cached = await AsyncStorage.getItem(cacheKey)
    if (cached === 'true') {
      return { complete: true }
    }

    // 2. NETWORK FETCH WITH TIMEOUT
    const fetchPromise = supabase
      .from('profiles')
      .select('college_id, class_id')
      .eq('id', userId)
      .single()

    const { data, error } = await withTimeout(Promise.resolve(fetchPromise), 3000, { error: new Error('timeout') } as any)

    if (error || !data) {
      console.log('[AuthCheck] Profile missing or error/timeout:', error?.message)
      // If we got an error or timeout while fetching, and there's no cache, 
      // assume offline/slow-network and let them through rather than trapping them in auth.
      return { complete: false, isOffline: true }
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
    // Update Cache
    await AsyncStorage.setItem(cacheKey, 'true').catch(() => {})
    return { complete: true }
  } catch (err) {
    console.error('[AuthCheck] Profile fetch exception:', err)
    return { complete: false, isOffline: true } // Fail-closed but allow offline access fallback
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
        // Fast path for immediate offline/online resolution
        // Read directly from cache to bypass any NetInfo/Supabase blocking
        const hasRefresh = await hasStoredRefreshToken()
        if (hasRefresh) return 'authenticated'

        // If no cached token found, fallback to checking Supabase (with a short timeout)
        const sessionResult = await withTimeout(
          supabase.auth.getSession(),
          1500,
          { data: { session: null }, error: new Error('timeout') } as any
        )

        const { data: { session }, error } = sessionResult

        if (error) {
          return 'unauthenticated'
        }

        if (session) return 'authenticated'
        return 'unauthenticated'

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
    // Wait until auth status, onboarding flag, and the navigator are all resolved.
    if (status === 'loading' || onboardingDone === null || !navReady) return

    const navigate = async () => {
      // ── Guard 1: Never interrupt the OAuth callback ────────────────────────
      // Let callback.tsx exchange the code and explicitly route the user once
      // the session is active.
      if (pathname === '/auth/callback') return


      // ── Guard 2: Never interrupt onboarding screens ────────────────────────
      // college-selection and class-selection own their own routing chain
      // (college → class → tabs). If RootLayout re-fires while the user is
      // on those screens it will race against the DB write, see the profile
      // as still incomplete, and loop back — so we stand down entirely.
      const isOnboardingInProgress =
        pathname.includes('college-selection') ||
        pathname.includes('class-selection')

      if (isOnboardingInProgress) {
        // Hide splash but don't touch the navigation stack
        setTimeout(() => { SplashScreen.hideAsync().catch(() => {}) }, 150)
        return
      }

      if (status === 'authenticated') {
        const userId = await getStoredUserId()

        if (userId) {
          const profileResult = await hasCompletedProfile(userId)

          if (!profileResult.complete) {
            if (profileResult.isOffline) {
              // Assume profile complete to avoid layout freeze/trap when offline 
              console.log('[NAV] → Tabs (Offline session fallback)')
              const isLandingPath = pathname === '/' || isAuthRoute(pathname) || pathname === '/index'
              if (isLandingPath && !pathname.includes('(tabs)')) {
                router.replace('/(tabs)' as any)
              }
            } else if (profileResult.collegeId) {
              console.log('[NAV] → Class Selection (class missing)')
              router.replace({ pathname: '/(auth)/class-selection', params: { college_id: profileResult.collegeId } } as any)
            } else {
              console.log('[NAV] → College Selection (college missing)')
              router.replace('/(auth)/college-selection' as any)
            }
          } else {
            // Only redirect to tabs when on a root / auth landing screen
            const isLandingPath =
              pathname === '/' || isAuthRoute(pathname) || pathname === '/index'
            if (!isLandingPath || pathname.includes('(tabs)')) {
              // already there or elsewhere
            } else {
              console.log('[NAV] → Tabs (profile complete)')
              router.replace('/(tabs)' as any)
            }
          }
        } else {
          // No user id locally, might be unauth fallback
          if (!isAuthRoute(pathname)) {
            console.log('[NAV] → Login (no user id)')
            router.replace('/(auth)/login' as any)
          }
        }
      } else {
        // Unauthenticated: if already on an auth screen let it handle itself
        if (isAuthRoute(pathname)) {
          // do nothing
        } else {
          console.log('[NAV] → Login (unauthenticated, current:', pathname, ')')
          router.replace('/(auth)/login' as any)
        }
      }

      // Hide splash rapidly once navigation has evaluated
      setTimeout(() => {
        SplashScreen.hideAsync().catch(() => {})
      }, 50)
    }

    navigate()
  // pathname is intentionally included so we can re-evaluate routing when the
  // route changes (e.g. after the callback screen completes the exchange).
  // The onboarding guard above prevents the problematic re-triggers.
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