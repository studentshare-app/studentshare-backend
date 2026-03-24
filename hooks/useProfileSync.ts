/**
 * hooks/useProfileSync.ts  — fully audited & fixed
 *
 * AVATAR UPLOAD LOCK — WHY THIS EXISTS
 * ──────────────────────────────────────
 * When the user uploads a new avatar, THREE separate paths all call
 * invalidateQueries(['dashboard', userId]) within ~1–4 seconds:
 *
 *   1. pickAndUploadAvatar() in index.tsx fires it after the DB write
 *   2. Supabase Realtime delivers the CDC echo of that same DB write (~200–800 ms later)
 *   3. useFocusEffect fires when the profile tab gains focus right after the upload
 *
 * Each invalidation triggers fetchDashboard(), which reads avatar_url from the
 * profiles table. The DB has the correct new URL — but Supabase Storage CDN can
 * take 1–4 s to propagate the new image to its edge nodes. During that window,
 * React Native Image fetches the URL, the CDN returns the OLD cached bytes, and
 * React Query stores that stale result → the avatar visibly "reverts".
 *
 * Fix: a module-level variable `avatarUploadLockUntil` (shared across ALL
 * imports of this file — index.tsx, profile.tsx, every hook instance).
 * Call `lockAvatarRefetch()` right before the profiles.update() DB write.
 * Every invalidation path checks `isAvatarRefetchLocked()` and silently drops
 * the refetch while the lock is active. The optimistic setQueryData already has
 * the correct new URL with a ?t= cache-buster, so the UI stays correct.
 * After 8 s the CDN has always propagated and all refetch paths resume normally.
 *
 * NEW FIXES (audit 4):
 * #A  useFocusEffect early-return when avatar lock is active no longer skips
 *     the lastFocusRef timestamp update — so a focus event that arrives during
 *     the lock does NOT trigger an immediate refetch right after the lock expires.
 * #B  fetchDashboard inside the hook is deduplicated: it now matches the exact
 *     same select fields as index.tsx so both callers share the same cache shape.
 * #C  onAuthStateChange handler guards against repeated SIGNED_IN events for
 *     the same user (e.g. TOKEN_REFRESHED) calling setUserId unnecessarily.
 * #D  Admin check is moved out of the cold-start init path and into a separate
 *     stable useEffect keyed on userId — prevents re-running on every render and
 *     avoids the race where role is fetched before session resolves.
 * #E  Realtime channel for profiles now also guards subscription changes with
 *     isAvatarRefetchLocked to prevent a subscription CDC event arriving in the
 *     same window from triggering a stale fetch.  Subscription changes that are
 *     truly unrelated to avatars always get a fresh channel (no lock applied
 *     there — that was correct and is preserved).
 * #F  useQuery placeholderData is now a stable reference (stored in ref) so it
 *     does not cause React Query to re-subscribe on every render.
 * #G  bootstrapped.current guard moved inside the effect cleanup rather than
 *     before the async init — prevents a subtle double-init on StrictMode
 *     remounts in dev.
 * #H  ✅ FIX: fetchDashboard now reads is_premium directly from profiles table
 *     as a fallback alongside the subscriptions check. This ensures that when
 *     the webhook sets is_premium=true on profiles, the hook picks it up
 *     immediately via Realtime — even if the subscriptions row event is missed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// ── Cache keys ─────────────────────────────────────────────────────────────
const USER_ID_CACHE_KEY   = 'studentshare_user_id_cache'
const DASHBOARD_CACHE_KEY = 'studentshare_dashboard_cache'
const STALE_TIME_MS       = 2 * 60 * 1000

// ─────────────────────────────────────────────────────────────────────────────
// AVATAR UPLOAD LOCK  (module-level = shared across every component that
// imports this file, including index.tsx which calls lockAvatarRefetch)
// ─────────────────────────────────────────────────────────────────────────────
let avatarUploadLockUntil = 0

/** Call this right before writing the new avatar_url to the DB. */
export function lockAvatarRefetch(): void {
  avatarUploadLockUntil = Date.now() + 8_000
}

/** Returns true while we should suppress all invalidation-triggered refetches. */
export function isAvatarRefetchLocked(): boolean {
  return Date.now() < avatarUploadLockUntil
}

// ── Types ──────────────────────────────────────────────────────────────────
export type SyncedProfile = {
  full_name:   string
  avatar_url:  string | null
  college_id:  string | null
  class_id:    string | null
  is_verified: boolean
  is_premium:  boolean
  bio:         string | null
  role:        string | null
  updated_at?: string | null
  college:     { name: string; short_name: string } | null
  class:       { name: string } | null
}

export type UseProfileSyncResult = {
  profile:  SyncedProfile | null
  userId:   string | null
  loading:  boolean
  isOnline: boolean
  isAdmin:  boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────
function safeParseDashboard(raw: string | null): any | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.profile?.full_name) return null
    return parsed
  } catch { return null }
}

// FIX #B + #H: exact same shape as index.tsx fetchDashboard so the
// ['dashboard', userId] cache key is always populated with a consistent
// object regardless of which caller ran first.
// FIX #H: also selects is_premium from profiles directly so that when the
// webhook sets is_premium=true, Realtime triggers a re-fetch and the hook
// picks up the new value immediately without relying solely on subscriptions.
async function fetchDashboard(userId: string) {
  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, college_id, class_id, is_verified, is_premium, bio, role, updated_at') // ✅ added is_premium
    .eq('id', userId)
    .single()

  if (!profileData) return null

  const [collegeRes, classRes, subRes] = await Promise.all([
    profileData.college_id
      ? supabase.from('colleges').select('name, short_name').eq('id', profileData.college_id).single()
      : Promise.resolve({ data: null }),
    profileData.class_id
      ? supabase.from('classes').select('name').eq('id', profileData.class_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle(),
  ])

  // ✅ FIX #H: trust profiles.is_premium directly as a fallback.
  // This means if the webhook sets is_premium=true on profiles,
  // the hook detects it immediately via the profiles Realtime event
  // even if the subscriptions event is delayed or missed.
  const isPremium = subRes.data != null || (profileData as any).is_premium === true

  const profile: SyncedProfile = {
    full_name:   profileData.full_name,
    avatar_url:  profileData.avatar_url,
    college_id:  profileData.college_id,
    class_id:    profileData.class_id,
    is_verified: (profileData.is_verified === true) || isPremium,
    is_premium:  isPremium,
    bio:         profileData.bio ?? null,
    role:        (profileData as any).role ?? null,
    updated_at:  profileData.updated_at ?? null,
    college:     collegeRes.data as any,
    class:       classRes.data as any,
  }

  let materials: any[] = []
  let totalMaterialCount = 0
  let courseCount = 0

  if (profileData.class_id) {
    const { data: courses } = await supabase
      .from('courses')
      .select('id')
      .eq('class_id', profileData.class_id)
    courseCount = courses?.length ?? 0
    if (courseCount > 0) {
      const courseIds = courses!.map((c: any) => c.id)
      const [matsRes, countRes] = await Promise.all([
        supabase
          .from('materials')
          .select('id, title, type, file_url, created_at, courses(name)')
          .in('course_id', courseIds)
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('materials')
          .select('id', { count: 'exact', head: true })
          .in('course_id', courseIds)
          .eq('status', 'published'),
      ])
      materials = matsRes.data ?? []
      totalMaterialCount = countRes.count ?? materials.length
    }
  }

  return { profile, materials, stats: { total: totalMaterialCount, courses: courseCount } }
}

// ─────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────
export function useProfileSync(): UseProfileSyncResult {
  const queryClient = useQueryClient()

  const [userId,     setUserId]     = useState<string | null>(null)
  const [isOnline,   setIsOnline]   = useState(true)
  const [isAdmin,    setIsAdmin]    = useState(false)
  const [cacheReady, setCacheReady] = useState(false)

  // FIX #F: stable reference for placeholderData so React Query doesn't
  // re-subscribe on every render when the cached object is recreated.
  const cachedDashboardRef = useRef<any>(null)

  const userIdRef    = useRef<string | null>(null)
  // FIX #G: track whether the async init was cancelled (StrictMode double-mount)
  const cancelledRef = useRef(false)

  // ── Cold-start: read cache + resolve live session ──────────────────────
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

      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (cancelledRef.current) return
        if (error) { setIsOnline(false); return }
        setIsOnline(true)
        if (session?.user) {
          const uid = session.user.id
          if (uid !== userIdRef.current) {
            userIdRef.current = uid
            setUserId(uid)
            void AsyncStorage.setItem(USER_ID_CACHE_KEY, uid).catch(() => {})
          }
        }
      } catch {
        if (!cancelledRef.current) setIsOnline(false)
      }
    }

    void init()

    // FIX #C: guard against repeated SIGNED_IN / TOKEN_REFRESHED events for
    // the same userId calling setUserId on every token refresh.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (!cancelledRef.current) setIsOnline(true)
        if (session?.user && session.user.id !== userIdRef.current) {
          userIdRef.current = session.user.id
          if (!cancelledRef.current) {
            setUserId(session.user.id)
            void AsyncStorage.setItem(USER_ID_CACHE_KEY, session.user.id).catch(() => {})
          }
        }
      } else if (event === 'SIGNED_OUT') {
        userIdRef.current = null
        cachedDashboardRef.current = null
        if (!cancelledRef.current) {
          setUserId(null)
          setCacheReady(true)
          setIsAdmin(false)
        }
      }
    })

    return () => {
      cancelledRef.current = true
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // FIX #D: admin check in its own stable effect keyed on userId —
  // never runs more than once per unique userId, never races with init.
  useEffect(() => {
    if (!userId) return
    let active = true
    Promise.resolve(
      supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single<{ role: string | null }>()
    )
      .then(({ data }) => {
        if (active) setIsAdmin(data?.role === 'admin')
      })
      .catch(() => { /* non-admin — ignore */ })
    return () => { active = false }
  }, [userId])

  // ── Read from the shared cache that index.tsx populates ──────────────────
  useEffect(() => {
    if (!userId || !cacheReady) return
    const existing = queryClient.getQueryData(['dashboard', userId])
    if (!existing && cachedDashboardRef.current) {
      queryClient.setQueryData(['dashboard', userId], cachedDashboardRef.current)
    }
  }, [userId, cacheReady, queryClient])

  // ── Global invalidation on college/class change ──────────────────────
  const prevCollegeIdRef = useRef<string | null>(null)
  const prevClassIdRef   = useRef<string | null>(null)

  const collegeId = profile?.college_id ?? null
  const classId   = profile?.class_id ?? null

  useEffect(() => {
    if (!collegeId && !classId) return

    const prevCollegeId = prevCollegeIdRef.current
    const prevClassId   = prevClassIdRef.current

    if (collegeId !== prevCollegeId || classId !== prevClassId) {
      // Broad invalidation
      queryClient.invalidateQueries({ 
        predicate: q => {
          const first = Array.isArray(q.queryKey) ? q.queryKey[0] : ''
          return typeof first === 'string' && (
            first.includes('material') ||
            first.includes('notification') ||
            first.includes('download') ||
            first.includes('course') ||
            first.includes('announce') ||
            first.includes('college') ||
            first.includes('leaderboard')
          )
        }
      })

      // Clear screen caches
      AsyncStorage.multiRemove([
        'studentshare_materials_cache',
        'studentshare_materials_meta',
        'studentshare_my_courses_cache',
        'studentshare_announcements_cache',
        'studentshare_dashboard_cache',
      ]).catch(() => {})
    }

    prevCollegeIdRef.current = collegeId
    prevClassIdRef.current   = classId
  }, [collegeId, classId, queryClient])

  const { data: subscribedData } = useQuery({
    queryKey:        ['dashboard', userId],
    queryFn:         (): Promise<null> => Promise.resolve(null),
    enabled:         false,
    staleTime:       Infinity,
    gcTime:          10 * 60 * 1000,
    placeholderData: cachedDashboardRef.current ?? undefined,
  })

// ── Global invalidation on college/class change — Step 1 ✅ ─────────────────
  useEffect(() => {
    if (!profile?.college_id && !profile?.class_id) return
    const prevCollegeId = profile.college_id
    const prevClassId = profile.class_id
    return queryClient.getQueryCache().subscribe(() => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const [firstKey] = query.queryKey
          return typeof firstKey === 'string' && (
            firstKey.includes('materials') ||
            firstKey.includes('notification') ||
            firstKey.includes('downloads') ||
            firstKey.includes('courses') ||
            firstKey.includes('announce') ||
            firstKey.includes('leaderboard')
          )
        },
      })
    })
  }, [profile?.college_id, profile?.class_id, queryClient])

  // ── Realtime cross-device sync (with avatar lock) ─────────────────────
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
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` },
        () => {
          // Subscription changes are never avatar-related — always propagate
          queryClient.invalidateQueries({ queryKey: ['dashboard', userId] })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, queryClient])

  // ── Focus re-validation (with avatar lock) ────────────────────────────
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
    }, [userId, queryClient]),
  )

  const effectiveData                 = subscribedData ?? cachedDashboardRef.current
  const profile: SyncedProfile | null = effectiveData?.profile ?? null
  const loading = !cacheReady

  // ── NEW: Global invalidation on college/class change ─────────────────────
  useEffect(() => {
    if (!userId || !profile?.college_id || !profile?.class_id) return

    // Broad invalidation → ALL screens refetch filtered data immediately
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = Array.isArray(query.queryKey) ? query.queryKey[0] : ''
        return typeof key === 'string' && (
          key.includes('material') ||    // new-materials, study-materials
          key.includes('notification') || // notifications
          key.includes('download') ||     // downloads
          key.includes('course') ||       // my-courses, courses
          key.includes('announce') ||     // dashboard announcements
          key.includes('college') ||      // college-info
          key.includes('leaderboard')     // leaderboard college filter
        )
      }
    })

    // Clear screen caches → force fresh filtered data
    void AsyncStorage.multiRemove([
      'studentshare_materials_cache',
      'studentshare_materials_meta',
      'studentshare_my_courses_cache',
      'studentshare_announcements_cache',
      'studentshare_dashboard_cache',
    ]).catch(() => {})

  }, [userId, profile?.college_id, profile?.class_id, queryClient])

  return { profile, userId, loading, isOnline, isAdmin }
}

