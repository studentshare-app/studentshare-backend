import { fetchDashboard, safeParseDashboard } from '@/features/home/api/home'
import { DASHBOARD_CACHE_KEY } from '@/features/home/constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

// ── Module-level store — survives every tab remount ───────────────────────
// Keyed by userId so account switching always gets a clean slate.
// Nothing here resets unless the userId changes to one we've never seen.
const _hasEverLoaded: Record<string, boolean> = {}
const _cachedData:    Record<string, any>     = {}

export function useHomeDashboard({
  userId,
  queryClient,
}: {
  userId: string | null
  queryClient: QueryClient
}) {
  // ── Initialise directly from module-level store ───────────────────────
  // These useState initialisers run once per mount. Because the module-level
  // objects persist across remounts, returning to the tab gets real values
  // immediately — no async gap, no skeleton flash.
  const [hasEverLoaded, setHasEverLoaded] = useState<boolean>(
    () => (userId ? (_hasEverLoaded[userId] ?? false) : false)
  )
  const [cachedDashboard, setCachedDashboard] = useState<any>(
    () => (userId ? (_cachedData[userId] ?? null) : null)
  )
  // If module-level data exists, we're already cache-ready — skip AsyncStorage
  const [cacheReady, setCacheReady] = useState<boolean>(
    () => (userId ? (_hasEverLoaded[userId] ?? false) : false)
  )

  // ── Handle userId change (account switch) ─────────────────────────────
  // This only does real work when the user ID itself changes, not on remounts
  // (remounts keep the same userId so this effect doesn't re-fire).
  useEffect(() => {
    const alreadyLoaded = userId ? (_hasEverLoaded[userId] ?? false) : false
    const alreadyCached = userId ? (_cachedData[userId]    ?? null)  : null

    setHasEverLoaded(alreadyLoaded)
    setCachedDashboard(alreadyCached)
    // If module-level data exists for this user, mark ready immediately
    setCacheReady(alreadyLoaded)
  }, [userId])

  // ── AsyncStorage read — only on genuine cold start ────────────────────
  // Skipped entirely if we already have module-level data for this user.
  // This means returning to the tab NEVER hits AsyncStorage again.
  useEffect(() => {
    if (!userId) {
      setCacheReady(true)
      return
    }

    // Already populated from a previous session in this JS process — skip
    if (_hasEverLoaded[userId]) return

    const userCacheKey = `${DASHBOARD_CACHE_KEY}_${userId}`

    AsyncStorage.getItem(userCacheKey)
      .then(raw => {
        const parsed = safeParseDashboard(raw)
        if (parsed) {
          // Populate module-level store so next remount is instant
          _cachedData[userId]    = parsed
          _hasEverLoaded[userId] = true
          setCachedDashboard(parsed)
          setHasEverLoaded(true)
        }
      })
      .catch(() => {})
      .finally(() => setCacheReady(true))
  }, [userId])

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', userId],
    queryFn: async () => {
      const fresh = await fetchDashboard(userId!)

      if (fresh) {
        const userCacheKey = `${DASHBOARD_CACHE_KEY}_${userId!}`
        const toCache = { ...fresh, profile: { ...fresh.profile } }
        void AsyncStorage.setItem(userCacheKey, JSON.stringify(toCache)).catch(() => {})

        // Keep module-level store in sync with latest network data
        _cachedData[userId!] = fresh
      }

      // Mark loaded even if fresh is null — means server confirmed no profile.
      // Safe to show setup screen now instead of skeleton.
      if (userId) {
        _hasEverLoaded[userId] = true
      }
      setHasEverLoaded(true)

      return fresh
    },
    enabled: !!userId && cacheReady,
    staleTime: 2 * 60 * 1000,
    gcTime:    10 * 60 * 1000,
    refetchOnMount: false,
    placeholderData: cachedDashboard ?? undefined,
    retry: (n: number) => n < 1,
  })

  const effectiveData = data ?? cachedDashboard ?? null

  const refreshDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard', userId] })
  }, [queryClient, userId])

  return {
    cacheReady,
    isLoading,
    hasEverLoaded,
    effectiveData,
    profile:         effectiveData?.profile            ?? null,
    recentMaterials: effectiveData?.materials          ?? [],
    stats:           effectiveData?.stats              ?? { total: 0, courses: 0 },
    classId:         effectiveData?.profile?.class_id  ?? null,
    collegeId:       effectiveData?.profile?.college_id ?? null,
    collegeName:     effectiveData?.profile?.college?.name ?? undefined,
    refreshDashboard,
  }
}