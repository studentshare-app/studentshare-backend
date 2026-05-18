import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import NetInfo from '@react-native-community/netinfo'

// ── Cache keys ──────────────────────────────────────────────────────
const USER_ID_CACHE_KEY = 'studentshare_user_id_cache'
const STALE_TIME_MS = 2 * 60 * 1000

import { isAvatarRefetchLocked } from '@/core/utils/avatarLock'
import { fetchDashboard } from '@/features/home/api/home'
import { DASHBOARD_CACHE_KEY } from '@/features/home/constants'

// ── Types ────────────────────────────────────────────────────────────
export type SyncedProfile = {
  full_name: string
  avatar_url: string | null
  college_id: string | null
  class_id: string | null
  is_verified: boolean
  is_premium: boolean
  bio: string | null
  role: string | null
  updated_at?: string | null
  college: { name: string; short_name: string } | null
  class: { name: string } | null
}

export type UseProfileSyncResult = {
  profile: SyncedProfile | null
  stats: any | null
  userId: string | null
  loading: boolean
  isOnline: boolean
  isAdmin: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────
function safeParseDashboard(raw: string | null): any | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.profile?.full_name) return null
    return parsed
  } catch {
    return null
  }
}

// ── Hook ─────────────────────────────────────────────────────────────
export function useProfileSync(): UseProfileSyncResult {
  const queryClient = useQueryClient()

  const [userId, setUserId] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [cacheReady, setCacheReady] = useState(false)

  const cachedDashboardRef = useRef<any>(null)
  const userIdRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)
  // ✅ Track active channel to prevent duplicate subscriptions
  const channelRef = useRef<any>(null)

  // ── INIT ──────────────────────────────────────────────────────────
  useEffect(() => {
    cancelledRef.current = false

    const init = async () => {
      const cachedId = await AsyncStorage.getItem(USER_ID_CACHE_KEY).catch(() => null)
      const userCacheKey = cachedId ? `${DASHBOARD_CACHE_KEY}_${cachedId}` : DASHBOARD_CACHE_KEY
      const rawDash = await AsyncStorage.getItem(userCacheKey).catch(() => null)

      if (cancelledRef.current) return

      const parsed = safeParseDashboard(rawDash)
      if (parsed) {
        cachedDashboardRef.current = parsed
      }

      if (cachedId) {
        userIdRef.current = cachedId
        setUserId(cachedId)
      }

      setCacheReady(true)

      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user && session.user.id !== userIdRef.current) {
        userIdRef.current = session.user.id
        setUserId(session.user.id)
        await AsyncStorage.setItem(USER_ID_CACHE_KEY, session.user.id)
      }

      const net = await NetInfo.fetch()
      setIsOnline(net.isConnected ?? true)
    }

    init()

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          if (session.user.id !== userIdRef.current) {
            userIdRef.current = session.user.id
            setUserId(session.user.id)
          }
        }

        if (event === 'SIGNED_OUT') {
          const net = await NetInfo.fetch().catch(() => ({ isConnected: true }))
          if (!net.isConnected) {
            console.log('[Sync] SIGNED_OUT received while offline — skipping cache wipe')
            return
          }

          queryClient.clear()
          const oldUserId = userIdRef.current
          userIdRef.current = null
          cachedDashboardRef.current = null

          const keysToRemove = [
            USER_ID_CACHE_KEY,
            DASHBOARD_CACHE_KEY,
            'studentshare_materials_cache',
            'studentshare_materials_meta',
            'studentshare_my_courses_cache',
            'studentshare_announcements_cache',
          ]
          if (oldUserId) {
            keysToRemove.push(`${DASHBOARD_CACHE_KEY}_${oldUserId}`)
          }
          AsyncStorage.multiRemove(keysToRemove).catch(() => {})

          setUserId(null)
          setIsAdmin(false)
        }
      })

    const netSub = NetInfo.addEventListener((state: any) => {
      setIsOnline(state.isConnected ?? true)
    })

    return () => {
      cancelledRef.current = true
      subscription.unsubscribe()
      netSub()
    }
  }, [])

  // ── ADMIN CHECK ───────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return

    let active = true

    supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (active) setIsAdmin(data?.role === 'admin')
      })

    return () => {
      active = false
    }
  }, [userId])

  // ── QUERY CACHE ACCESS ────────────────────────────────────────────
  const { data: subscribedData } = useQuery({
    queryKey: ['dashboard', userId],
    queryFn: async () => {
      if (!userId) return null
      const fresh = await fetchDashboard(userId)
      if (fresh) {
        const userCacheKey = `${DASHBOARD_CACHE_KEY}_${userId}`
        void AsyncStorage.setItem(userCacheKey, JSON.stringify(fresh)).catch(() => {})
        cachedDashboardRef.current = fresh
      }
      return fresh
    },
    enabled: !!userId && cacheReady,
    staleTime: STALE_TIME_MS,
    placeholderData: cachedDashboardRef.current ?? undefined,
  })

  const effectiveData = subscribedData ?? cachedDashboardRef.current
  const profile: SyncedProfile | null = effectiveData?.profile ?? null

  // ── REALTIME SYNC ─────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return

    // ✅ Remove any existing channel before creating a new one
    // This prevents the "cannot add callbacks after subscribe()" error
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    // ✅ Use a unique channel name with timestamp to avoid conflicts
    const channelName = `profile-sync-${userId}-${Date.now()}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        () => {
          if (isAvatarRefetchLocked()) return
          queryClient.invalidateQueries({ queryKey: ['dashboard', userId] })
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [userId])

  // ── FOCUS REFRESH ─────────────────────────────────────────────────
  const lastFocusRef = useRef(Date.now())

  useFocusEffect(
    useCallback(() => {
      const now = Date.now()
      const elapsed = now - lastFocusRef.current
      lastFocusRef.current = now

      if (isAvatarRefetchLocked()) return

      if (userId && elapsed > STALE_TIME_MS) {
        queryClient.invalidateQueries({ queryKey: ['dashboard', userId] })
      }
    }, [userId])
  )

  // ── GLOBAL INVALIDATION ───────────────────────────────────────────
  useEffect(() => {
    if (!userId || !profile?.college_id || !profile?.class_id) return

    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = Array.isArray(query.queryKey) ? query.queryKey[0] : ''
        return typeof key === 'string' && (
          key.includes('material') ||
          key.includes('notification') ||
          key.includes('download') ||
          key.includes('course') ||
          key.includes('announce') ||
          key.includes('college') ||
          key.includes('leaderboard')
        )
      }
    })

    AsyncStorage.multiRemove([
      'studentshare_materials_cache',
      'studentshare_materials_meta',
      'studentshare_my_courses_cache',
      'studentshare_announcements_cache',
    ]).catch(() => {})

  }, [userId, profile?.college_id, profile?.class_id, queryClient])

  return {
    profile,
    stats: effectiveData?.stats ?? null,
    userId,
    loading: !cacheReady,
    isOnline,
    isAdmin,
  }
}