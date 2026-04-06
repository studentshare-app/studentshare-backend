import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ── Cache keys ─────────────────────────────────────────
const USER_ID_CACHE_KEY = 'studentshare_user_id_cache'
const DASHBOARD_CACHE_KEY = 'studentshare_dashboard_cache'
const STALE_TIME_MS = 2 * 60 * 1000

// ── Avatar Lock ───────────────────────────────────────
let avatarUploadLockUntil = 0

export function lockAvatarRefetch() {
  avatarUploadLockUntil = Date.now() + 8000
}

export function isAvatarRefetchLocked() {
  return Date.now() < avatarUploadLockUntil
}

// ── Types ─────────────────────────────────────────────
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
  userId: string | null
  loading: boolean
  isOnline: boolean
  isAdmin: boolean
}

// ── Helpers ───────────────────────────────────────────
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

// ── Hook ──────────────────────────────────────────────
export function useProfileSync(): UseProfileSyncResult {
  const queryClient = useQueryClient()

  const [userId, setUserId] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [cacheReady, setCacheReady] = useState(false)

  const cachedDashboardRef = useRef<any>(null)
  const userIdRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)

  // ── INIT ────────────────────────────────────────────
  useEffect(() => {
    cancelledRef.current = false

    const init = async () => {
      const [cachedId, rawDash] = await Promise.all([
        AsyncStorage.getItem(USER_ID_CACHE_KEY).catch(() => null),
        AsyncStorage.getItem(DASHBOARD_CACHE_KEY).catch(() => null),
      ])

      if (cancelledRef.current) return

      const parsed = safeParseDashboard(rawDash)
      if (parsed) cachedDashboardRef.current = parsed

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
    }

    init()

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          if (session.user.id !== userIdRef.current) {
            userIdRef.current = session.user.id
            setUserId(session.user.id)
          }
        }

        if (event === 'SIGNED_OUT') {
          // ✅ Wipe ALL in-memory React Query cache — prevents previous user's
          // data being served as placeholderData to the next login
          queryClient.clear()

          // ✅ Clear cached userId ref so init() doesn't re-hydrate old user
          userIdRef.current = null
          cachedDashboardRef.current = null

          // ✅ Remove all persistent keys — dashboard is now user-scoped in
          // useHomeDashboard, but also wipe the legacy unscoped key if it
          // still exists on the device
          AsyncStorage.multiRemove([
            USER_ID_CACHE_KEY,
            DASHBOARD_CACHE_KEY,
            'studentshare_materials_cache',
            'studentshare_materials_meta',
            'studentshare_my_courses_cache',
            'studentshare_announcements_cache',
          ]).catch(() => {})

          setUserId(null)
          setIsAdmin(false)
        }
      })

    return () => {
      cancelledRef.current = true
      subscription.unsubscribe()
    }
  }, [])

  // ── ADMIN CHECK ─────────────────────────────────────
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

  // ── QUERY CACHE ACCESS ──────────────────────────────
  const { data: subscribedData } = useQuery({
    queryKey: ['dashboard', userId],
    queryFn: () => Promise.resolve(null),
    enabled: false,
    staleTime: Infinity,
    placeholderData: cachedDashboardRef.current ?? undefined,
  })

  const effectiveData = subscribedData ?? cachedDashboardRef.current
  const profile: SyncedProfile | null = effectiveData?.profile ?? null

  // ── REALTIME SYNC ───────────────────────────────────
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`profile-sync-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        () => {
          if (isAvatarRefetchLocked()) return
          queryClient.invalidateQueries({ queryKey: ['dashboard', userId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  // ── FOCUS REFRESH ───────────────────────────────────
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

  // ── GLOBAL INVALIDATION ─────────────────────────────
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

    // ✅ dashboard cache is now user-scoped in useHomeDashboard — removed from here
    AsyncStorage.multiRemove([
      'studentshare_materials_cache',
      'studentshare_materials_meta',
      'studentshare_my_courses_cache',
      'studentshare_announcements_cache',
    ]).catch(() => {})

  }, [userId, profile?.college_id, profile?.class_id, queryClient])

  return {
    profile,
    userId,
    loading: !cacheReady,
    isOnline,
    isAdmin,
  }
}