/**
 * features/home/hooks/useStudyPlannerSnapshot.ts
 *
 * Fix 6: Storage keys are now scoped to userId.
 * - Accept userId (string | null) as a parameter
 * - Keys become `${KEYS.BLOCKS}_${userId}` / `${KEYS.GOALS}_${userId}`
 * - When userId changes, state resets and re-reads from new user's keys
 * - When userId is null, hook returns empty defaults and stays dormant
 *
 * NOTE: The study-planner screen must also write to the same scoped keys.
 * Pass userId into that screen's storage writes using the same pattern:
 *   `ss_planner_blocks_${userId}` / `ss_study_goals_${userId}`
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Storage key roots (must match study-planner.tsx scoped keys) ──────────
const KEYS = {
  BLOCKS: 'ss_planner_blocks',
  GOALS:  'ss_study_goals',
} as const

// ─── Minimal types (mirrors study-planner.tsx) ─────────────────────────────
type BlockType = 'lecture' | 'revision' | 'practice' | 'assignment' | 'other'

export type PlannerBlock = {
  id: string
  subject: string
  type: BlockType
  date: string        // 'YYYY-MM-DD'
  startTime: string   // 'HH:MM'
  endTime: string     // 'HH:MM'
  color: string
  completed?: boolean
}

type StudyGoals = {
  weekly_hours: number
  weekly_tasks: number
  daily_pomodoros: number
  streak_target: number
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function getWeekDays(ref: Date): Date[] {
  const day  = ref.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon  = new Date(ref)
  mon.setDate(ref.getDate() + diff)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return d
  })
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function blockDurationMins(b: PlannerBlock): number {
  const [sh, sm] = b.startTime.split(':').map(Number)
  const [eh, em] = b.endTime.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

function getWeeklyBlockHours(blocks: PlannerBlock[]): number {
  const week = getWeekDays(new Date()).map(toISO)
  return blocks
    .filter(b => week.includes(b.date) && b.completed)
    .reduce((sum, b) => sum + blockDurationMins(b) / 60, 0)
}

// ─── Block type display labels ─────────────────────────────────────────────
export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  lecture:    'Lecture',
  revision:   'Revision',
  practice:   'Practice',
  assignment: 'Assignment',
  other:      'Other',
}

// ─── Derived schedule item shape (what HomeScreen consumes) ────────────────
export type HomeScheduleItem = {
  id: string
  hour: string
  period: string
  title: string
  meta: string
  tagLabel: string
  tagColor: string
  tagBg: string
  dotColor: string
  color: string
  cancelled: boolean
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function deriveScheduleItem(block: PlannerBlock): HomeScheduleItem {
  const [hStr] = block.startTime.split(':')
  const h24    = parseInt(hStr, 10)
  const h12    = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  const period = h24 < 12 ? 'AM' : 'PM'

  const nowMins   = new Date().getHours() * 60 + new Date().getMinutes()
  const [sh, sm]  = block.startTime.split(':').map(Number)
  const [eh, em]  = block.endTime.split(':').map(Number)
  const startMins = sh * 60 + sm
  const endMins   = eh * 60 + em
  const durMins   = blockDurationMins(block)

  let tagLabel: string
  let tagColor: string
  let tagBg: string

  if (nowMins >= startMins && nowMins < endMins) {
    tagLabel = 'Live now'; tagColor = '#FB923C'; tagBg = '#2A1208'
  } else if (nowMins >= endMins) {
    tagLabel = 'Done';     tagColor = '#4A5168'; tagBg = '#161A22'
  } else {
    tagLabel = 'Upcoming'; tagColor = '#5B8DEF'; tagBg = '#0D1A35'
  }

  return {
    id:        block.id,
    hour:      String(h12).padStart(2, '0'),
    period,
    title:     block.subject,
    meta:      `${BLOCK_TYPE_LABELS[block.type]} · ${formatDuration(durMins)}`,
    tagLabel, tagColor, tagBg,
    dotColor:  block.color,
    color:     block.color,
    cancelled: false,
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────
const DEFAULT_GOAL_HOURS = 25

export type StudyPlannerSnapshot = {
  weeklyHours:     number
  weeklyGoalHours: number
  todayBlocks:     HomeScheduleItem[]
  isLoaded:        boolean
  refresh:         () => Promise<void>
}

export function useStudyPlannerSnapshot(userId: string | null): StudyPlannerSnapshot {
  const [weeklyHours,     setWeeklyHours]     = useState(0)
  const [weeklyGoalHours, setWeeklyGoalHours] = useState(DEFAULT_GOAL_HOURS)
  const [todayBlocks,     setTodayBlocks]     = useState<HomeScheduleItem[]>([])
  const [isLoaded,        setIsLoaded]        = useState(false)

  const loadingRef  = useRef(false)
  const isLoadedRef = useRef(false)

  // ── Scoped keys — derived from userId ────────────────────────────────
  const blocksKey = userId ? `${KEYS.BLOCKS}_${userId}` : null
  const goalsKey  = userId ? `${KEYS.GOALS}_${userId}`  : null

  // ── Reset when userId changes ─────────────────────────────────────────
  useEffect(() => {
    setWeeklyHours(0)
    setWeeklyGoalHours(DEFAULT_GOAL_HOURS)
    setTodayBlocks([])
    setIsLoaded(false)
    loadingRef.current  = false
    isLoadedRef.current = false
  }, [userId])

  // ── Stable refresh function — recreated only when keys change ─────────
  const refreshRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    refreshRef.current = async () => {
      if (loadingRef.current) return
      if (!blocksKey || !goalsKey) {
        // No userId — return empty defaults
        setWeeklyHours(0)
        setWeeklyGoalHours(DEFAULT_GOAL_HOURS)
        setTodayBlocks([])
        if (!isLoadedRef.current) { isLoadedRef.current = true; setIsLoaded(true) }
        return
      }

      loadingRef.current = true
      try {
        const [rawBlocks, rawGoals] = await Promise.all([
          AsyncStorage.getItem(blocksKey),
          AsyncStorage.getItem(goalsKey),
        ])

        const blocks: PlannerBlock[] = rawBlocks ? JSON.parse(rawBlocks) : []
        const goals: StudyGoals      = rawGoals
          ? JSON.parse(rawGoals)
          : { weekly_hours: DEFAULT_GOAL_HOURS } as StudyGoals

        const today  = todayISO()
        const sorted = blocks
          .filter(b => b.date === today)
          .sort((a, b) => a.startTime.localeCompare(b.startTime))

        setWeeklyHours(getWeeklyBlockHours(blocks))
        setWeeklyGoalHours(goals.weekly_hours ?? DEFAULT_GOAL_HOURS)
        setTodayBlocks(sorted.map(deriveScheduleItem))
      } catch {
        // silently fail — stale data remains on screen
      } finally {
        loadingRef.current = false
        if (!isLoadedRef.current) {
          isLoadedRef.current = true
          setIsLoaded(true)
        }
      }
    }
  }, [blocksKey, goalsKey])

  const refresh = useCallback(() => refreshRef.current(), [])

  // Run on mount and whenever keys change (userId changed)
  useEffect(() => { refreshRef.current() }, [blocksKey, goalsKey])

  return { weeklyHours, weeklyGoalHours, todayBlocks, isLoaded, refresh }
}