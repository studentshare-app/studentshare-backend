import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/core/api/supabase'
import { ANNOUNCEMENTS_KEY } from '@/features/home/constants'
import { fetchAnnouncements, safeParseAnnouncements } from '@/features/home/api/home'
import type { Announcement } from '@/features/home/types'

export function useAnnouncements({
  userId,
  classId,
  collegeId,
  queryClient,
}: {
  userId: string | null
  classId: string | null
  collegeId: string | null
  queryClient: QueryClient
}) {
  const [cachedAnnouncements, setCachedAnnouncements] = useState<Announcement[]>([])
  const [showAnnouncements, setShowAnnouncements] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(ANNOUNCEMENTS_KEY)
      .then(raw => {
        const parsed = safeParseAnnouncements(raw)
        if (parsed.length) setCachedAnnouncements(parsed)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!userId) return
    const ch = supabase.channel(`announcements-rt-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        void AsyncStorage.removeItem(ANNOUNCEMENTS_KEY).catch(() => {})
        queryClient.invalidateQueries({ queryKey: ['announcements', classId, collegeId] })
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [userId, classId, collegeId, queryClient])

  const { data: announcements = cachedAnnouncements } = useQuery({
    queryKey: ['announcements', classId, collegeId],
    queryFn: async () => {
      const fresh = await fetchAnnouncements(classId, collegeId)
      void AsyncStorage.setItem(ANNOUNCEMENTS_KEY, JSON.stringify(fresh)).catch(() => {})
      return fresh
    },
    enabled: !!userId && !!(classId || collegeId),
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    placeholderData: cachedAnnouncements.length > 0 ? cachedAnnouncements : undefined,
  })

  useEffect(() => {
    if (announcements.some(a => a.priority === 'high')) {
      setShowAnnouncements(true)
    }
  }, [announcements])

  const queryKey = ['announcements', classId, collegeId] as const

  // ── Stable references — safe to use as useFocusEffect deps ─────────────
  const refreshAnnouncements = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['announcements', classId, collegeId] })
    void AsyncStorage.removeItem(ANNOUNCEMENTS_KEY).catch(() => {})
  }, [queryClient, classId, collegeId])

  const applyOptimisticAnnouncements = useCallback(
    (updater: (items: Announcement[]) => Announcement[]) => {
      queryClient.setQueryData<Announcement[]>(queryKey, prev => updater(prev ?? []))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, classId, collegeId]
  )

  return {
    announcements,
    showAnnouncements,
    setShowAnnouncements,
    announcementQueryKey: queryKey,
    refreshAnnouncements,
    applyOptimisticAnnouncements,
  }
}