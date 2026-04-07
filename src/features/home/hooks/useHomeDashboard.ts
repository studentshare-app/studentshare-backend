import { fetchDashboard, safeParseDashboard } from '@/features/home/api/home'
import { DASHBOARD_CACHE_KEY } from '@/features/home/constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useMaterials, useCourses } from '@/hooks/useLocalQueries'

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
  const [hasEverLoaded, setHasEverLoaded] = useState<boolean>(
    () => (userId ? (_hasEverLoaded[userId] ?? false) : false)
  )
  const [cachedDashboard, setCachedDashboard] = useState<any>(
    () => (userId ? (_cachedData[userId] ?? null) : null)
  )
  const [cacheReady, setCacheReady] = useState<boolean>(
    () => (userId ? (_hasEverLoaded[userId] ?? false) : false)
  )

  // ── Reactive Counts from WatermelonDB ────────────────────────────────
  const { records: localMaterials } = useMaterials()
  const { records: localCourses }   = useCourses()

  const reactiveStats = {
    total:   localMaterials.length,
    courses: localCourses.length,
  }

  // ── Handle userId change ─────────────────────────────────────────────
  useEffect(() => {
    const alreadyLoaded = userId ? (_hasEverLoaded[userId] ?? false) : false
    const alreadyCached = userId ? (_cachedData[userId]    ?? null)  : null

    setHasEverLoaded(alreadyLoaded)
    setCachedDashboard(alreadyCached)
    setCacheReady(alreadyLoaded)
  }, [userId])

  // ── AsyncStorage read ────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setCacheReady(true)
      return
    }
    if (_hasEverLoaded[userId]) return

    const userCacheKey = `${DASHBOARD_CACHE_KEY}_${userId}`

    AsyncStorage.getItem(userCacheKey)
      .then(raw => {
        const parsed = safeParseDashboard(raw)
        if (parsed) {
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
        _cachedData[userId!] = fresh
      }
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
    stats:           reactiveStats, // Override with reactive version
    classId:         effectiveData?.profile?.class_id  ?? null,
    collegeId:       effectiveData?.profile?.college_id ?? null,
    collegeName:     effectiveData?.profile?.college?.name ?? undefined,
    refreshDashboard,
  }
}