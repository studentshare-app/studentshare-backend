import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/core/api/supabase'

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
  if (!b.startTime || !b.endTime) return 0
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
  const startTime = block.startTime || "00:00"
  const endTime   = block.endTime || "00:00"
  
  const [hStr] = startTime.split(':')
  const h24    = parseInt(hStr, 10)
  const h12    = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  const period = h24 < 12 ? 'AM' : 'PM'

  const now       = new Date()
  const nowMins   = now.getHours() * 60 + now.getMinutes()
  const [sh, sm]  = startTime.split(':').map(Number)
  const [eh, em]  = endTime.split(':').map(Number)
  const startMins = sh * 60 + sm
  const endMins   = eh * 60 + em
  const durMins   = blockDurationMins(block)

  let tagLabel: string
  let tagColor: string
  let tagBg: string

  if (block.completed) {
    tagLabel = 'Done';     tagColor = '#4A5168'; tagBg = 'rgba(74, 81, 104, 0.12)'
  } else if (nowMins >= startMins && nowMins < endMins) {
    tagLabel = 'Ongoing'; tagColor = '#FB923C'; tagBg = 'rgba(251, 146, 60, 0.12)'
  } else if (nowMins >= endMins) {
    tagLabel = 'Ended';   tagColor = '#EE6868'; tagBg = 'rgba(238, 104, 104, 0.12)'
  } else {
    tagLabel = 'Upcoming'; tagColor = '#5B8DEF'; tagBg = 'rgba(91, 141, 239, 0.12)'
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

  const refreshRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    refreshRef.current = async () => {
      if (loadingRef.current || !userId || !blocksKey || !goalsKey) {
        if (!userId) {
          setWeeklyHours(0)
          setWeeklyGoalHours(DEFAULT_GOAL_HOURS)
          setTodayBlocks([])
          if (!isLoadedRef.current) { isLoadedRef.current = true; setIsLoaded(true) }
        }
        return
      }

      loadingRef.current = true
      try {
        // 1. AsyncStorage cache (for instant load)
        const [rawBlocks, rawGoals] = await Promise.all([
          AsyncStorage.getItem(blocksKey),
          AsyncStorage.getItem(goalsKey),
        ])

        let blocks: PlannerBlock[] = rawBlocks ? JSON.parse(rawBlocks) : []
        let goals: StudyGoals      = rawGoals 
          ? JSON.parse(rawGoals) 
          : { weekly_hours: DEFAULT_GOAL_HOURS } as StudyGoals

        // 2. Supabase Sync (background refresh)
        const [blocksRes, profileRes] = await Promise.all([
          supabase.from('planner_blocks').select('*').eq('user_id', userId).order('date', { ascending: false }),
          supabase.from('profiles').select('study_goals').eq('id', userId).single(),
        ])

        if (blocksRes.data && blocksRes.data.length > 0) {
          // Map snake_case from DB to camelCase for UI
          const syncedBlocks: PlannerBlock[] = blocksRes.data.map((b: any) => ({
            id: b.id,
            subject: b.subject,
            type: b.type,
            date: b.date,
            startTime: b.start_time,
            endTime: b.end_time,
            color: b.color,
            completed: b.completed
          }))
          blocks = syncedBlocks
          void AsyncStorage.setItem(blocksKey, JSON.stringify(blocks)).catch(() => {})
        }

        if (profileRes.data?.study_goals) {
          goals = profileRes.data.study_goals as StudyGoals
          void AsyncStorage.setItem(goalsKey, JSON.stringify(goals)).catch(() => {})
        }

        const today  = todayISO()
        const sorted = blocks
          .filter(b => b.date === today)
          .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""))

        setWeeklyHours(getWeeklyBlockHours(blocks))
        setWeeklyGoalHours(goals.weekly_hours ?? DEFAULT_GOAL_HOURS)
        setTodayBlocks(sorted.map(deriveScheduleItem))
      } catch (err) {
        console.error('[useStudyPlannerSnapshot] refresh error:', err)
      } finally {
        loadingRef.current = false
        if (!isLoadedRef.current) {
          isLoadedRef.current = true
          setIsLoaded(true)
        }
      }
    }
  }, [userId, blocksKey, goalsKey])

  const refresh = useCallback(() => refreshRef.current(), [])

  // Run on mount and whenever userId changes
  useEffect(() => { 
    if (userId) refreshRef.current() 
  }, [userId, blocksKey, goalsKey])

  return { weeklyHours, weeklyGoalHours, todayBlocks, isLoaded, refresh }
}