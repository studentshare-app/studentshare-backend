/**
 * lib/leaderboard.ts
 * Single source of truth for all leaderboard logic.
 *
 * KEY FIX: All students are always ranked regardless of whether they have
 * activity in the selected period. Period filtering only affects the score
 * calculation (so "Weekly" shows who earned the most THIS week), but every
 * student from the college/global pool always appears in the list.
 */

import { supabase } from './supabase'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export type LeaderboardEntry = {
  id: string
  full_name: string
  avatar_url: string | null
  is_verified: boolean
  score: number
  rank: number
  downloads?: number
  quizzes?: number
  ai_sessions?: number
  streak?: number
  movement?: number
  college_name?: string
}

export type CollegeEntry = {
  id: string
  name: string
  short_name: string
  student_count: number
  total_score: number
  avg_score: number
  rank: number
  movement?: number
}

export type LeaderScope  = 'college' | 'global' | 'colleges'
export type LeaderPeriod = 'weekly' | 'monthly' | 'alltime'

// ─────────────────────────────────────────────
// Scoring — edit values here, propagates everywhere
// ─────────────────────────────────────────────
export const SCORING = {
  DOWNLOAD_PTS:   2,
  QUIZ_PTS:       5,
  AI_SESSION_PTS: 3,
  STREAK_PTS:     1,
} as const

export function computeScore(
  downloadCount: number,
  activity: { quizzes: number; ai_sessions: number; streak: number },
): number {
  return (
    downloadCount        * SCORING.DOWNLOAD_PTS   +
    activity.quizzes     * SCORING.QUIZ_PTS       +
    activity.ai_sessions * SCORING.AI_SESSION_PTS +
    activity.streak      * SCORING.STREAK_PTS
  )
}

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────
export function getPeriodFromDate(period: LeaderPeriod): string | null {
  const now = new Date()
  if (period === 'weekly') {
    const day  = now.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(now)
    monday.setUTCDate(now.getUTCDate() + diff)
    return monday.toISOString().slice(0, 10)
  }
  if (period === 'monthly') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString().slice(0, 10)
  }
  return null // alltime — no date filter
}

export function getPrevSnapshotDate(period: LeaderPeriod): string {
  const now = new Date()
  if (period === 'weekly') {
    const day  = now.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    const thisMonday = new Date(now)
    thisMonday.setUTCDate(now.getUTCDate() + diff)
    const prevMonday = new Date(thisMonday)
    prevMonday.setUTCDate(thisMonday.getUTCDate() - 7)
    return prevMonday.toISOString().slice(0, 10)
  }
  if (period === 'monthly') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    return d.toISOString().slice(0, 10)
  }
  const y = new Date(now)
  y.setUTCDate(now.getUTCDate() - 1)
  return y.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────
// Activity fetchers
// ─────────────────────────────────────────────
export async function getDownloadCounts(
  userIds: string[],
  period: LeaderPeriod = 'alltime',
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  if (!userIds.length) return counts

  // Pre-seed every user at 0 so they always appear even with no activity
  userIds.forEach(id => { counts[id] = 0 })

  const fromDate = getPeriodFromDate(period)
  try {
    if (fromDate) {
      const { data } = await supabase.rpc('count_downloads_by_users_period', {
        user_ids: userIds,
        from_date: fromDate,
      })
      if (Array.isArray(data) && data.length > 0) {
        data.forEach((row: any) => { counts[row.user_id] = row.download_count })
        return counts
      }
    } else {
      const { data } = await supabase.rpc('count_downloads_by_users', { user_ids: userIds })
      if (Array.isArray(data) && data.length > 0) {
        data.forEach((row: any) => { counts[row.user_id] = row.download_count })
        return counts
      }
    }
  } catch {}

  // Fallback: manual count from material_downloads table
  const q = supabase
    .from('material_downloads')
    .select('user_id')
    .in('user_id', userIds)
    .limit(5000)
  const { data } = fromDate ? await q.gte('downloaded_at', fromDate) : await q
  data?.forEach((d: any) => {
    counts[d.user_id] = (counts[d.user_id] || 0) + 1
  })
  return counts
}

export async function getActivityCounts(
  userIds: string[],
  period: LeaderPeriod = 'alltime',
): Promise<Record<string, { quizzes: number; ai_sessions: number; streak: number }>> {
  const result: Record<string, { quizzes: number; ai_sessions: number; streak: number }> = {}
  if (!userIds.length) return result

  // Pre-seed every user at 0
  userIds.forEach(id => {
    result[id] = { quizzes: 0, ai_sessions: 0, streak: 0 }
  })

  const fromDate = getPeriodFromDate(period)
  try {
    let q = supabase
      .from('user_activity')
      .select('user_id, activity_type')
      .in('user_id', userIds)
      .in('activity_type', ['quiz_completed', 'ai_session', 'daily_login'])
      .limit(50000)
    if (fromDate) q = q.gte('created_at', fromDate) as any
    const { data } = await q
    data?.forEach((row: any) => {
      if (!result[row.user_id]) result[row.user_id] = { quizzes: 0, ai_sessions: 0, streak: 0 }
      if (row.activity_type === 'quiz_completed') result[row.user_id].quizzes++
      if (row.activity_type === 'ai_session')     result[row.user_id].ai_sessions++
      if (row.activity_type === 'daily_login')    result[row.user_id].streak++
    })
  } catch {}
  return result
}

// ─────────────────────────────────────────────
// Board fetchers
// ─────────────────────────────────────────────
export async function fetchCollegeLeaderboard(
  collegeId: string | null,
  period: LeaderPeriod = 'weekly',
): Promise<LeaderboardEntry[]> {
  if (!collegeId) return []

  // Fetch ALL students in this college — no score filter, everyone appears
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, is_verified')
    .eq('college_id', collegeId)
    .not('full_name', 'is', null)
    .limit(200)

  if (error) console.warn('[fetchCollegeLeaderboard] profiles error:', error.message)
  if (!profiles?.length) return []

  const userIds = profiles.map((p: any) => p.id)

  const [downloadCounts, activityCounts] = await Promise.all([
    getDownloadCounts(userIds, period),
    getActivityCounts(userIds, period),
  ])

  const ranked = profiles
    .map((p: any) => {
      const dl  = downloadCounts[p.id] ?? 0
      const act = activityCounts[p.id] ?? { quizzes: 0, ai_sessions: 0, streak: 0 }
      return {
        ...p,
        downloads:   dl,
        quizzes:     act.quizzes,
        ai_sessions: act.ai_sessions,
        streak:      act.streak,
        score:       computeScore(dl, act),
      }
    })
    // Stable sort: by score desc, then name asc so ties are deterministic
    .sort((a: any, b: any) => b.score - a.score || a.full_name.localeCompare(b.full_name))
    .map((p: any, i: number) => ({ ...p, rank: i + 1 }))

  // Attach movement from last period's snapshot
  const prevDate = getPrevSnapshotDate(period)
  const { data: snapshots } = await supabase
    .from('leaderboard_snapshots')
    .select('user_id, college_rank')
    .in('user_id', userIds)
    .eq('period', period)
    .eq('snapshot_date', prevDate)

  const prevRankMap: Record<string, number> = {}
  snapshots?.forEach((s: any) => {
    if (s.college_rank != null) prevRankMap[s.user_id] = s.college_rank
  })

  return ranked.map((e: any) => {
    const prev = prevRankMap[e.id]
    return { ...e, movement: prev !== undefined ? prev - e.rank : undefined }
  })
}

export async function fetchGlobalLeaderboard(
  period: LeaderPeriod = 'weekly',
): Promise<LeaderboardEntry[]> {
  // Fetch ALL students globally
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, is_verified, college_id')
    .not('full_name', 'is', null)
    .limit(500)

  if (error) console.warn('[fetchGlobalLeaderboard] profiles error:', error.message)
  if (!profiles?.length) return []

  // Resolve college short names
  const collegeIds = [...new Set(profiles.map((p: any) => p.college_id).filter(Boolean))] as string[]
  const collegeMap: Record<string, string> = {}
  if (collegeIds.length) {
    const { data: colleges } = await supabase
      .from('colleges')
      .select('id, short_name')
      .in('id', collegeIds)
    colleges?.forEach((c: any) => { collegeMap[c.id] = c.short_name })
  }

  const userIds = profiles.map((p: any) => p.id)

  const [downloadCounts, activityCounts] = await Promise.all([
    getDownloadCounts(userIds, period),
    getActivityCounts(userIds, period),
  ])

  const ranked = profiles
    .map((p: any) => {
      const dl  = downloadCounts[p.id] ?? 0
      const act = activityCounts[p.id] ?? { quizzes: 0, ai_sessions: 0, streak: 0 }
      return {
        ...p,
        downloads:    dl,
        quizzes:      act.quizzes,
        ai_sessions:  act.ai_sessions,
        streak:       act.streak,
        score:        computeScore(dl, act),
        college_name: p.college_id ? collegeMap[p.college_id] : undefined,
      }
    })
    .sort((a: any, b: any) => b.score - a.score || a.full_name.localeCompare(b.full_name))
    .map((p: any, i: number) => ({ ...p, rank: i + 1 }))

  // Attach movement
  const prevDate = getPrevSnapshotDate(period)
  const { data: snapshots } = await supabase
    .from('leaderboard_snapshots')
    .select('user_id, global_rank')
    .in('user_id', userIds)
    .eq('period', period)
    .eq('snapshot_date', prevDate)

  const prevRankMap: Record<string, number> = {}
  snapshots?.forEach((s: any) => {
    if (s.global_rank != null) prevRankMap[s.user_id] = s.global_rank
  })

  return ranked.map((e: any) => {
    const prev = prevRankMap[e.id]
    return { ...e, movement: prev !== undefined ? prev - e.rank : undefined }
  })
}

export async function fetchCollegesLeaderboard(
  period: LeaderPeriod = 'weekly',
): Promise<CollegeEntry[]> {
  const { data: colleges, error } = await supabase
    .from('colleges')
    .select('id, name, short_name')
    .limit(50)

  if (error) console.warn('[fetchCollegesLeaderboard] colleges error:', error.message)
  if (!colleges?.length) return []

  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, college_id')
    .not('college_id', 'is', null)
    .limit(5000)

  if (!allProfiles?.length) return []

  const userIds = allProfiles.map((p: any) => p.id)

  const [downloadCounts, activityCounts] = await Promise.all([
    getDownloadCounts(userIds, period),
    getActivityCounts(userIds, period),
  ])

  // Aggregate scores per college
  const agg: Record<string, { total: number; count: number }> = {}
  allProfiles.forEach((p: any) => {
    if (!p.college_id) return
    if (!agg[p.college_id]) agg[p.college_id] = { total: 0, count: 0 }
    const dl  = downloadCounts[p.id] ?? 0
    const act = activityCounts[p.id] ?? { quizzes: 0, ai_sessions: 0, streak: 0 }
    agg[p.college_id].total += computeScore(dl, act)
    agg[p.college_id].count += 1
  })

  // Include ALL colleges — even those with 0 total score
  const ranked: CollegeEntry[] = colleges
    .map((c: any) => {
      const data = agg[c.id] ?? { total: 0, count: 0 }
      return {
        id:            c.id,
        name:          c.name,
        short_name:    c.short_name,
        student_count: data.count,
        total_score:   data.total,
        avg_score:     data.count > 0 ? data.total / data.count : 0,
        rank:          0,
      }
    })
    .sort((a: CollegeEntry, b: CollegeEntry) =>
      b.avg_score - a.avg_score || a.short_name.localeCompare(b.short_name)
    )
    .map((c: CollegeEntry, i: number) => ({ ...c, rank: i + 1 }))

  // Attach movement
  const collegeIds = ranked.map(c => c.id)
  const prevDate   = getPrevSnapshotDate(period)
  const { data: snapshots } = await supabase
    .from('leaderboard_college_snapshots')
    .select('college_id, college_rank')
    .in('college_id', collegeIds)
    .eq('period', period)
    .eq('snapshot_date', prevDate)

  const prevRankMap: Record<string, number> = {}
  snapshots?.forEach((s: any) => {
    if (s.college_rank != null) prevRankMap[s.college_id] = s.college_rank
  })

  return ranked.map((e: CollegeEntry) => {
    const prev = prevRankMap[e.id]
    return { ...e, movement: prev !== undefined ? prev - e.rank : undefined }
  })
}