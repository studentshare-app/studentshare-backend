/**
 * hooks/usePremiumGuard.ts
 *
 * Reads premium status from useProfileSync (which already syncs from Supabase
 * and caches via React Query). We additionally persist the last-known value in
 * AsyncStorage so the gate works correctly when the user is fully offline and
 * React Query has no cached data (e.g. first cold start with no network).
 *
 * FREE_LIMIT: 5 items per section (blocks, tasks, goals, pomodoro sessions)
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useRef, useState } from 'react'
import { useProfileSync } from './useProfileSync'

const PREMIUM_CACHE_KEY = 'ss_is_premium_cache'
export const FREE_LIMIT = 5

export type PremiumGuardResult = {
  isPremium:      boolean
  isPremiumReady: boolean   // false only on very first cold start before cache resolves
  canAdd:         (currentCount: number) => boolean
}

export function usePremiumGuard(): PremiumGuardResult {
  const { profile, loading } = useProfileSync()

  // Start with null = unknown, then resolve from cache or live profile
  const [isPremium, setIsPremium] = useState<boolean | null>(null)
  const resolvedRef = useRef(false)

  // Step 1 — read the AsyncStorage cache immediately (works offline)
  useEffect(() => {
    AsyncStorage.getItem(PREMIUM_CACHE_KEY)
      .then(raw => {
        if (raw !== null && !resolvedRef.current) {
          setIsPremium(raw === 'true')
        }
      })
      .catch(() => {})
  }, [])

  // Step 2 — once live profile loads, use that as the source of truth
  // and persist it so the next offline session also gets the right value
  useEffect(() => {
    if (loading || profile === null) return
    const live = profile.is_premium === true
    resolvedRef.current = true
    setIsPremium(live)
    AsyncStorage.setItem(PREMIUM_CACHE_KEY, String(live)).catch(() => {})
  }, [profile, loading])

  const resolved = isPremium !== null
  const premium  = isPremium === true

  return {
    isPremium:      premium,
    isPremiumReady: resolved,
    // Returns true if the user can still add (is premium OR under the free limit)
    canAdd: (currentCount: number) => premium || currentCount < FREE_LIMIT,
  }
}