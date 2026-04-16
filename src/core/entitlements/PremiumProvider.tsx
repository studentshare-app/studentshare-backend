/**
 * contexts/PremiumContext.tsx
 *
 * SINGLE SOURCE OF TRUTH for premium status across the entire app.
 *
 * HOW IT WORKS:
 *  1. On mount, reads AsyncStorage cache for instant cold-start value
 *  2. Queries Supabase (subscriptions + profiles.is_premium + role)
 *  3. Subscribes to Realtime on both `subscriptions` and `profiles` tables
 *  4. Re-checks whenever the app comes back to foreground (AppState)
 *  5. Exposes refresh() so payment-pending.tsx can force an immediate re-check
 *
 * PREMIUM LOGIC (mirrors every existing screen):
 *   isPremium = subscriptions row with status='active'
 *            OR profiles.is_premium === true
 *            OR profiles.role === 'admin'
 *
 * USAGE — any screen or component, one line:
 *   const { isPremium, isLoading } = usePremium()
 *
 * ADDING A NEW PREMIUM FEATURE:
 *   Just call usePremium() in the new screen. Nothing else needed.
 *   When the user upgrades, every mounted component updates automatically.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { supabase } from '@/core/api/supabase'
import NetInfo from '@react-native-community/netinfo'

// ── Cache key ────────────────────────────────────────────────────────────────
const PREMIUM_CACHE_KEY = 'studentshare_is_premium_v1'

// ── Context shape ─────────────────────────────────────────────────────────────
type PremiumContextValue = {
  isPremium: boolean
  isLoading: boolean
  refresh: () => Promise<void>
}

const PremiumContext = createContext<PremiumContextValue>({
  isPremium: false,
  isLoading: true,
  refresh: async () => {},
})

// ── Core check ────────────────────────────────────────────────────────────────
async function checkPremium(userId: string): Promise<boolean> {
  const [subRes, profileRes] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('is_premium, role')
      .eq('id', userId)
      .single(),
  ])

  return (
    subRes.data != null ||
    profileRes.data?.is_premium === true ||
    profileRes.data?.role === 'admin'
  )
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [isPremium, setIsPremium] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const userIdRef  = useRef<string | null>(null)
  const mountedRef = useRef(true)

  // ── Hydrate from cache immediately, then verify with Supabase ────────────
  useEffect(() => {
    mountedRef.current = true

    const init = async () => {
      // 1. Read cache for instant render
      try {
        const cached = await AsyncStorage.getItem(PREMIUM_CACHE_KEY)
        if (cached !== null && mountedRef.current) {
          setIsPremium(cached === 'true')
          setIsLoading(false)
        }
      } catch {}

      // 2. Get current user
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          if (mountedRef.current) { setIsPremium(false); setIsLoading(false) }
          await AsyncStorage.setItem(PREMIUM_CACHE_KEY, 'false').catch(() => {})
          return
        }

        userIdRef.current = session.user.id

        // 3. Live check
        const result = await checkPremium(session.user.id)
        if (mountedRef.current) { setIsPremium(result); setIsLoading(false) }
        await AsyncStorage.setItem(PREMIUM_CACHE_KEY, String(result)).catch(() => {})
      } catch {
        if (mountedRef.current) setIsLoading(false)
      }
    }

    void init()

    // ── Auth state changes (sign-in / sign-out) ───────────────────────────
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        // ✅ Ignore SIGNED_OUT when offline — Supabase fires this when it
        // can't refresh the token, but the user is still logged in locally
        const net = await NetInfo.fetch().catch(() => ({ isConnected: true }))
        if (!net.isConnected) {
          console.log('[PremiumProvider] SIGNED_OUT received while offline — ignoring')
          return
        }

        userIdRef.current = null
        if (mountedRef.current) { setIsPremium(false); setIsLoading(false) }
        await AsyncStorage.setItem(PREMIUM_CACHE_KEY, 'false').catch(() => {})
        return
      }

      if (event === 'SIGNED_IN' && session.user.id !== userIdRef.current) {
        userIdRef.current = session.user.id
        try {
          const result = await checkPremium(session.user.id)
          if (mountedRef.current) { setIsPremium(result); setIsLoading(false) }
          await AsyncStorage.setItem(PREMIUM_CACHE_KEY, String(result)).catch(() => {})
        } catch {}
      }
    })

    return () => {
      mountedRef.current = false
      authSub.unsubscribe()
    }
  }, [])

  // ── Realtime: subscriptions table ────────────────────────────────────────
  useEffect(() => {
    if (!userIdRef.current) return

    const userId = userIdRef.current

    const channel = supabase
      .channel(`premium-watch-${userId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'subscriptions',
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          if (!mountedRef.current) return
          try {
            const result = await checkPremium(userId)
            if (mountedRef.current) setIsPremium(result)
            await AsyncStorage.setItem(PREMIUM_CACHE_KEY, String(result)).catch(() => {})
          } catch {}
        },
      )
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'profiles',
          filter: `id=eq.${userId}`,
        },
        async () => {
          if (!mountedRef.current) return
          try {
            const result = await checkPremium(userId)
            if (mountedRef.current) setIsPremium(result)
            await AsyncStorage.setItem(PREMIUM_CACHE_KEY, String(result)).catch(() => {})
          } catch {}
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userIdRef.current])

  // ── AppState: re-check when app comes back to foreground ─────────────────
  useEffect(() => {
    const handler = async (state: AppStateStatus) => {
      if (state !== 'active' || !userIdRef.current || !mountedRef.current) return
      try {
        const result = await checkPremium(userIdRef.current)
        if (mountedRef.current) setIsPremium(result)
        await AsyncStorage.setItem(PREMIUM_CACHE_KEY, String(result)).catch(() => {})
      } catch {}
    }

    const sub = AppState.addEventListener('change', handler)
    return () => sub.remove()
  }, [])

  // ── Manual refresh (called by payment-pending after upgrade confirmed) ───
  const refresh = useCallback(async () => {
    if (!userIdRef.current) return
    try {
      const result = await checkPremium(userIdRef.current)
      if (mountedRef.current) setIsPremium(result)
      await AsyncStorage.setItem(PREMIUM_CACHE_KEY, String(result)).catch(() => {})
    } catch {}
  }, [])

  return (
    <PremiumContext.Provider value={{ isPremium, isLoading, refresh }}>
      {children}
    </PremiumContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePremium(): PremiumContextValue {
  return useContext(PremiumContext)
}