/**
 * lib/leaderboard.ts
 * Production-ready leaderboard logic using Supabase RPCs.
 * 
 * This file replaces the client-side calculation with high-performance 
 * database-side aggregation.
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
  college_id?: string
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
// Board fetchers
// ─────────────────────────────────────────────

/**
 * Fetches ranked students within a specific college.
 */
export async function fetchCollegeLeaderboard(
  collegeId: string | null,
  period: LeaderPeriod = 'weekly',
  search: string | null = null,
): Promise<LeaderboardEntry[]> {
  if (!collegeId) return []

  const { data, error } = await supabase.rpc('sq_get_leaderboard', {
    p_period: period,
    p_college_id: collegeId,
    p_limit: 200,
    p_search: search || null
  })

  if (error) {
    console.error('[fetchCollegeLeaderboard] RPC error:', error)
    return []
  }

  return (data || []) as LeaderboardEntry[]
}

/**
 * Fetches ranked students across the entire campus.
 */
export async function fetchGlobalLeaderboard(
  period: LeaderPeriod = 'weekly',
  search: string | null = null,
  sortByMovement: boolean = false
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('sq_get_leaderboard', {
    p_period: period,
    p_limit: 500,
    p_search: search || null,
    p_sort_by_movement: sortByMovement
  })

  if (error) {
    console.error('[fetchGlobalLeaderboard] RPC error:', error)
    return []
  }

  return (data || []) as LeaderboardEntry[]
}

/**
 * Fetches ranked colleges based on average student performance.
 */
export async function fetchCollegesLeaderboard(
  period: LeaderPeriod = 'weekly',
): Promise<CollegeEntry[]> {
  const { data, error } = await supabase.rpc('sq_get_colleges_leaderboard', {
    p_period: period,
    p_limit: 50
  })

  if (error) {
    console.error('[fetchCollegesLeaderboard] RPC error:', error)
    return []
  }

  return (data || []) as CollegeEntry[]
}

// ─────────────────────────────────────────────
// Legacy Helpers (Kept for compatibility if needed)
// ─────────────────────────────────────────────
export const SCORING = {
  DOWNLOAD_PTS:   2,
  QUIZ_PTS:       5,
  AI_SESSION_PTS: 3,
  STREAK_PTS:     1,
} as const
