/**
 * app/(tabs)/study-planner.tsx
 * Study Planner — production screen
 *
 * Tabs: Schedule · Tasks · Focus · Goals
 * Persistence: AsyncStorage-first, Supabase sync when online
 * Header: fully custom, no Stack header
 *
 * PREMIUM GATE:
 * Free users can add up to 5 blocks, tasks, and goals.
 * After 5, every "add" button and the Focus "start" button
 * shows PremiumGateModal instead of performing the action.
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useProfileSync } from '../../hooks/useProfileSync'
import { usePremiumGuard, FREE_LIMIT } from '../../hooks/usePremiumGuard'
import { PremiumGateModal } from '../../components/PremiumGateModal'
import { SwipeToDismiss } from '../../components/SwipeToDismiss'

// ─────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────
const C = {
  void:      '#08090C',
  deep:      '#0C0E14',
  surface:   '#111318',
  raised:    '#161A22',
  border:    '#1E2330',
  borderHi:  '#2A3145',
  text:      '#EEF0F6',
  textSub:   '#8B93A8',
  textMute:  '#4A5168',
  gold:      '#F0C060',
  goldGlow:  '#D4983A',
  goldDim:   '#2A1E08',
  sapphire:  '#5B8DEF',
  sapphGlow: '#2D5AB8',
  sapphDim:  '#0D1A35',
  emerald:   '#44D4A0',
  emerDim:   '#0A2C1E',
  coral:     '#FF7B7B',
  coralDim:  '#2A0E0E',
  lavender:  '#A78BFA',
  lavDim:    '#1E1040',
  orange:    '#FB923C',
  orangeDim: '#2A1208',
  sky:       '#38BDF8',
  skyDim:    '#0D1E2A',
  pink:      '#E879F9',
  pinkDim:   '#260830',
} as const

// ─────────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────────
const KEYS = {
  BLOCKS:  'ss_planner_blocks',
  TASKS:   'ss_planner_tasks',
  GOALS:   'ss_study_goals',
  STATS:   'ss_planner_stats',
} as const

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type TabKey = 'schedule' | 'tasks' | 'focus' | 'goals'
type BlockType = 'lecture' | 'revision' | 'practice' | 'assignment' | 'other'

type TimeBlock = {
  id: string
  subject: string
  type: BlockType
  date: string
  startTime: string
  endTime: string
  color: string
}

type PlannerTask = {
  id: string
  title: string
  course: string
  dueDate: string
  done: boolean
  color: string
  priority: 'high' | 'normal' | 'low'
}

type StudyGoals = {
  weekly_hours: number
  weekly_tasks: number
  daily_pomodoros: number
  streak_target: number
}

type PlannerStats = {
  total_hours: number
  total_tasks: number
  total_pomodoros: number
  streak: number
  last_active: string
  sessions_today: number
  focused_mins_today: number
}

type PomoMode = 'focus' | 'short' | 'long'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const DEFAULT_GOALS: StudyGoals = {
  weekly_hours: 25,
  weekly_tasks: 10,
  daily_pomodoros: 4,
  streak_target: 7,
}

const DEFAULT_STATS: PlannerStats = {
  total_hours: 0,
  total_tasks: 0,
  total_pomodoros: 0,
  streak: 0,
  last_active: '',
  sessions_today: 0,
  focused_mins_today: 0,
}

const POMO_DURATIONS: Record<PomoMode, number> = {
  focus: 25 * 60,
  short: 5 * 60,
  long:  15 * 60,
}

const POMO_LABELS: Record<PomoMode, string> = {
  focus: 'Focus session',
  short: 'Short break',
  long:  'Long break',
}

const BLOCK_COLORS: Record<BlockType, string> = {
  lecture:    C.sapphire,
  revision:   C.emerald,
  practice:   C.gold,
  assignment: C.coral,
  other:      C.lavender,
}

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  lecture:    'Lecture',
  revision:   'Revision',
  practice:   'Practice',
  assignment: 'Assignment',
  other:      'Other',
}

const TASK_PRIORITY_COLORS: Record<string, string> = {
  high:   C.coral,
  normal: C.sapphire,
  low:    C.emerald,
}

const TASK_COLORS = [C.sapphire, C.emerald, C.gold, C.coral, C.lavender, C.sky, C.pink, C.orange]

// ─────────────────────────────────────────────
// Safe Supabase runner
// ─────────────────────────────────────────────
const sbRun = (q: unknown) => Promise.resolve(q).catch(() => {})

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function getWeekDays(referenceDate: Date): Date[] {
  const day = referenceDate.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(referenceDate)
  monday.setDate(referenceDate.getDate() + diff)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function blockDurationMins(block: TimeBlock): number {
  const [sh, sm] = block.startTime.split(':').map(Number)
  const [eh, em] = block.endTime.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function isOverdue(isoDate: string): boolean { return isoDate < todayISO() }
function isToday(isoDate: string): boolean   { return isoDate === todayISO() }
function isTomorrow(isoDate: string): boolean {
  const t = new Date(); t.setDate(t.getDate() + 1)
  return isoDate === toISO(t)
}

function dueDateLabel(isoDate: string): { label: string; urgent: boolean } {
  if (isOverdue(isoDate)) return { label: 'Overdue',  urgent: true  }
  if (isToday(isoDate))   return { label: 'Today',    urgent: true  }
  if (isTomorrow(isoDate))return { label: 'Tomorrow', urgent: false }
  return {
    label: new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    urgent: false,
  }
}

function getWeeklyBlockHours(blocks: TimeBlock[]): number {
  const week = getWeekDays(new Date()).map(toISO)
  return blocks
    .filter(b => week.includes(b.date))
    .reduce((sum, b) => sum + blockDurationMins(b) / 60, 0)
}

function getWeeklyTasksDone(tasks: PlannerTask[]): number {
  const week = getWeekDays(new Date()).map(toISO)
  return tasks.filter(t => t.done && week.some(d => d === t.dueDate)).length
}

// ─────────────────────────────────────────────
// ScalePress
// ─────────────────────────────────────────────
function ScalePress({
  children, onPress, style, disabled,
}: {
  children: React.ReactNode
  onPress?: () => void
  style?: any
  disabled?: boolean
}) {
  const scale = useRef(new Animated.Value(1)).current
  const onIn  = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
  const onOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 4 }).start()
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut} disabled={disabled}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
}

// ─────────────────────────────────────────────
// Tag Chip
// ─────────────────────────────────────────────
function TagChip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[g.tagChip, { backgroundColor: color + '18', borderColor: color + '35' }]}>
      <Text allowFontScaling={false} style={[g.tagChipText, { color }]}>{label}</Text>
    </View>
  )
}

// ─────────────────────────────────────────────
// Section Header
// ─────────────────────────────────────────────
function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={g.sectionHead}>
      <Text maxFontSizeMultiplier={1.2} style={g.sectionTitle}>{title}</Text>
      {onAction && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Text maxFontSizeMultiplier={1.2} style={g.sectionAction}>{action ?? 'See all'} ›</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ─────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────
function EmptyState({
  icon, title, sub, cta, onCta,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  title: string; sub: string; cta: string; onCta: () => void
}) {
  return (
    <View style={g.emptyState}>
      <View style={g.emptyIconBox}>
        <Ionicons name={icon} size={28} color={C.textMute} />
      </View>
      <Text maxFontSizeMultiplier={1.2} style={g.emptyTitle}>{title}</Text>
      <Text maxFontSizeMultiplier={1.2} style={g.emptySub}>{sub}</Text>
      <TouchableOpacity style={g.emptyBtn} onPress={onCta} activeOpacity={0.85}>
        <Ionicons name="add" size={15} color={C.void} />
        <Text maxFontSizeMultiplier={1.2} style={g.emptyBtnText}>{cta}</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─────────────────────────────────────────────
// Free limit badge
// ─────────────────────────────────────────────
function FreeLimitBadge({ count, onUpgrade }: { count: number; onUpgrade: () => void }) {
  if (count < FREE_LIMIT) return null
  return (
    <TouchableOpacity style={g.limitBadge} onPress={onUpgrade} activeOpacity={0.85}>
      <Ionicons name="lock-closed" size={11} color={C.gold} />
      <Text allowFontScaling={false} style={g.limitBadgeText}>
        Free limit reached · <Text style={{ textDecorationLine: 'underline' }}>Upgrade</Text>
      </Text>
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────
// Progress Ring
// ─────────────────────────────────────────────
function ProgressRing({
  pct, size, stroke, color, children,
}: {
  pct: number; size: number; stroke: number; color: string; children?: React.ReactNode
}) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start()
  }, [pct])
  const half = size / 2
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: half, borderWidth: stroke, borderColor: C.border }} />
      <Animated.View style={{
        position: 'absolute', width: size, height: size, borderRadius: half,
        borderWidth: stroke,
        borderTopColor:    color,
        borderRightColor:  pct > 25 ? color : 'transparent',
        borderBottomColor: pct > 50 ? color : 'transparent',
        borderLeftColor:   pct > 75 ? color : 'transparent',
        transform: [{ rotate: '-90deg' }],
      }} />
      <View style={{ zIndex: 2 }}>{children}</View>
    </View>
  )
}

// ─────────────────────────────────────────────
// ADD BLOCK MODAL
// ─────────────────────────────────────────────
const BLOCK_TYPES: BlockType[] = ['lecture', 'revision', 'practice', 'assignment', 'other']
const TIME_OPTIONS = Array.from({ length: 24 * 2 }, (_, i) => {
  const h = Math.floor(i / 2)
  const mv = i % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${mv}`
})

function AddBlockModal({
  visible, onClose, onAdd, selectedDate,
}: {
  visible: boolean
  onClose: () => void
  onAdd: (b: Omit<TimeBlock, 'id'>) => void
  selectedDate: string
}) {
  const [subject,   setSubject]   = useState('')
  const [type,      setType]      = useState<BlockType>('lecture')
  const [startTime, setStartTime] = useState('08:00')
  const [endTime,   setEndTime]   = useState('09:30')

  useEffect(() => {
    if (!visible) { setSubject(''); setType('lecture'); setStartTime('08:00'); setEndTime('09:30') }
  }, [visible])

  const handleAdd = () => {
    if (!subject.trim()) { Alert.alert('Required', 'Please enter a subject.'); return }
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    if (eh * 60 + em <= sh * 60 + sm) { Alert.alert('Invalid time', 'End time must be after start time.'); return }
    onAdd({ subject: subject.trim(), type, date: selectedDate, startTime, endTime, color: BLOCK_COLORS[type] })
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={m.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={m.sheet}>
            <View style={m.handle} />
            <View style={m.sheetHeader}>
              <View>
                <Text maxFontSizeMultiplier={1.2} style={m.sheetTitle}>Add Time Block</Text>
                <Text maxFontSizeMultiplier={1.2} style={m.sheetSub}>
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <TouchableOpacity style={m.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={17} color={C.textSub} />
              </TouchableOpacity>
            </View>

            <Text style={m.fieldLabel}>Subject / Course</Text>
            <TextInput style={m.input} placeholder="e.g. Linear Algebra" placeholderTextColor={C.textMute} value={subject} onChangeText={setSubject} autoFocus />

            <Text style={m.fieldLabel}>Block type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4, marginBottom: 18 }}>
              {BLOCK_TYPES.map(t => (
                <TouchableOpacity key={t} style={[m.typeBtn, type === t && { backgroundColor: BLOCK_COLORS[t] + '20', borderColor: BLOCK_COLORS[t] + '60' }]} onPress={() => setType(t)} activeOpacity={0.8}>
                  <View style={[m.typeDot, { backgroundColor: BLOCK_COLORS[t] }]} />
                  <Text style={[m.typeBtnText, type === t && { color: BLOCK_COLORS[t] }]}>{BLOCK_TYPE_LABELS[t]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={m.fieldLabel}>Start time</Text>
                <ScrollView style={m.timePicker} showsVerticalScrollIndicator={false}>
                  {TIME_OPTIONS.map(t => (
                    <TouchableOpacity key={t} style={[m.timeOption, startTime === t && m.timeOptionActive]} onPress={() => setStartTime(t)}>
                      <Text style={[m.timeOptionText, startTime === t && { color: C.sapphire, fontWeight: '700' }]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={m.fieldLabel}>End time</Text>
                <ScrollView style={m.timePicker} showsVerticalScrollIndicator={false}>
                  {TIME_OPTIONS.map(t => (
                    <TouchableOpacity key={t} style={[m.timeOption, endTime === t && m.timeOptionActive]} onPress={() => setEndTime(t)}>
                      <Text style={[m.timeOptionText, endTime === t && { color: C.sapphire, fontWeight: '700' }]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <TouchableOpacity style={m.primaryBtn} onPress={handleAdd}>
              <Ionicons name="add-circle-outline" size={17} color={C.void} />
              <Text style={m.primaryBtnText}>Add Block</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────
// ADD TASK MODAL
// ─────────────────────────────────────────────
function AddTaskModal({
  visible, onClose, onAdd,
}: {
  visible: boolean
  onClose: () => void
  onAdd: (t: Omit<PlannerTask, 'id' | 'done'>) => void
}) {
  const [title,    setTitle]    = useState('')
  const [course,   setCourse]   = useState('')
  const [dueDate,  setDueDate]  = useState(todayISO())
  const [priority, setPriority] = useState<PlannerTask['priority']>('normal')
  const [color,    setColor]    = useState(TASK_COLORS[0])

  useEffect(() => {
    if (!visible) { setTitle(''); setCourse(''); setDueDate(todayISO()); setPriority('normal'); setColor(TASK_COLORS[0]) }
  }, [visible])

  const handleAdd = () => {
    if (!title.trim()) { Alert.alert('Required', 'Please enter a task title.'); return }
    onAdd({ title: title.trim(), course: course.trim() || 'General', dueDate, priority, color })
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={m.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={[m.sheet, { paddingBottom: 36 }]}>
            <View style={m.handle} />
            <View style={m.sheetHeader}>
              <View>
                <Text style={m.sheetTitle}>Add Task</Text>
                <Text style={m.sheetSub}>Track assignments & study tasks</Text>
              </View>
              <TouchableOpacity style={m.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={17} color={C.textSub} />
              </TouchableOpacity>
            </View>

            <Text style={m.fieldLabel}>Task title *</Text>
            <TextInput style={m.input} placeholder="e.g. Submit Lab Report" placeholderTextColor={C.textMute} value={title} onChangeText={setTitle} autoFocus />

            <Text style={m.fieldLabel}>Course (optional)</Text>
            <TextInput style={m.input} placeholder="e.g. Physics 101" placeholderTextColor={C.textMute} value={course} onChangeText={setCourse} />

            <Text style={m.fieldLabel}>Due date</Text>
            <TextInput style={m.input} placeholder="YYYY-MM-DD" placeholderTextColor={C.textMute} value={dueDate} onChangeText={setDueDate} />

            <Text style={m.fieldLabel}>Priority</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
              {(['high', 'normal', 'low'] as const).map(p => (
                <TouchableOpacity key={p} style={[m.priorityBtn, priority === p && { backgroundColor: TASK_PRIORITY_COLORS[p] + '20', borderColor: TASK_PRIORITY_COLORS[p] + '60' }]} onPress={() => setPriority(p)}>
                  <Text style={[m.priorityText, priority === p && { color: TASK_PRIORITY_COLORS[p] }]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={m.fieldLabel}>Colour</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 22 }}>
              {TASK_COLORS.map(c => (
                <TouchableOpacity key={c} style={[m.colorDot, { backgroundColor: c }, color === c && { borderWidth: 2.5, borderColor: '#fff' }]} onPress={() => setColor(c)} />
              ))}
            </View>

            <TouchableOpacity style={m.primaryBtn} onPress={handleAdd}>
              <Ionicons name="add-circle-outline" size={17} color={C.void} />
              <Text style={m.primaryBtnText}>Add Task</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────
// EDIT GOALS MODAL
// ─────────────────────────────────────────────
function EditGoalsModal({
  visible, onClose, goals, onSave,
}: {
  visible: boolean
  onClose: () => void
  goals: StudyGoals
  onSave: (g: StudyGoals) => void
}) {
  const [draft, setDraft] = useState<StudyGoals>(goals)
  useEffect(() => { if (visible) setDraft(goals) }, [visible])

  const field = (label: string, key: keyof StudyGoals, unit: string, icon: React.ComponentProps<typeof Ionicons>['name'], color: string) => (
    <View style={eg.row} key={key}>
      <View style={[eg.iconBox, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={eg.label}>{label}</Text>
        <Text style={eg.unit}>{draft[key]} {unit}</Text>
      </View>
      <View style={eg.stepper}>
        <TouchableOpacity style={eg.stepBtn} onPress={() => setDraft(p => ({ ...p, [key]: Math.max(1, p[key] - 1) }))}>
          <Ionicons name="remove" size={16} color={C.textSub} />
        </TouchableOpacity>
        <TextInput style={eg.stepInput} value={String(draft[key])} keyboardType="number-pad"
          onChangeText={v => { const n = parseInt(v); if (!isNaN(n) && n > 0) setDraft(p => ({ ...p, [key]: n })) }} />
        <TouchableOpacity style={eg.stepBtn} onPress={() => setDraft(p => ({ ...p, [key]: p[key] + 1 }))}>
          <Ionicons name="add" size={16} color={C.textSub} />
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={m.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={[m.sheet, { paddingBottom: 40 }]}>
            <View style={m.handle} />
            <View style={m.sheetHeader}>
              <View>
                <Text style={m.sheetTitle}>Edit Goals</Text>
                <Text style={m.sheetSub}>Set your weekly & daily targets</Text>
              </View>
              <TouchableOpacity style={m.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={17} color={C.textSub} />
              </TouchableOpacity>
            </View>
            {field('Study hours / week', 'weekly_hours',    'hours',   'time-outline',             C.sapphire)}
            {field('Tasks / week',       'weekly_tasks',    'tasks',   'checkmark-circle-outline', C.emerald)}
            {field('Pomodoros / day',    'daily_pomodoros', 'sessions','timer-outline',            C.gold)}
            {field('Streak target',      'streak_target',   'days',    'flame-outline',            C.coral)}
            <TouchableOpacity style={[m.primaryBtn, { marginTop: 24 }]} onPress={() => { onSave(draft); onClose() }}>
              <Text style={m.primaryBtnText}>Save Goals</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────
// SCHEDULE TAB
// ─────────────────────────────────────────────
function ScheduleTab({
  blocks, onAddBlock, onDeleteBlock, stats, goals, canAddBlock, onGate,
}: {
  blocks: TimeBlock[]
  onAddBlock: (b: Omit<TimeBlock, 'id'>) => void
  onDeleteBlock: (id: string) => void
  stats: PlannerStats
  goals: StudyGoals
  canAddBlock: boolean
  onGate: () => void
}) {
  const today = new Date()
  const [weekRef,      setWeekRef]      = useState(today)
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [showAdd,      setShowAdd]      = useState(false)

  const weekDays    = useMemo(() => getWeekDays(weekRef), [weekRef])
  const dayBlocks   = useMemo(() => blocks.filter(b => b.date === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime)), [blocks, selectedDate])
  const weeklyHours = useMemo(() => getWeeklyBlockHours(blocks), [blocks])
  const weekPct     = Math.min((weeklyHours / goals.weekly_hours) * 100, 100)
  const DAY_NAMES   = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

  const handleAddPress = () => { if (!canAddBlock) { onGate(); return } setShowAdd(true) }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={sc.overviewCard}>
        <LinearGradient colors={[C.sapphDim, C.emerDim + '80']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={sc.overviewRow}>
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={1.2} style={sc.overviewLabel}>This week</Text>
            <Text maxFontSizeMultiplier={1.2} style={sc.overviewHours}>
              {weeklyHours.toFixed(1)}<Text style={sc.overviewHoursSub}>h / {goals.weekly_hours}h</Text>
            </Text>
            <View style={sc.progressTrack}>
              <View style={[sc.progressFill, { width: `${weekPct}%` as any, backgroundColor: weekPct >= 100 ? C.emerald : C.sapphire }]} />
            </View>
          </View>
          <View style={sc.overviewRight}>
            <View style={sc.streakBox}>
              <Text maxFontSizeMultiplier={1.2} style={sc.streakNum}>{stats.streak}</Text>
              <Text allowFontScaling={false} style={sc.streakLabel}>🔥 streak</Text>
            </View>
          </View>
        </View>
        <View style={sc.streakDots}>
          {weekDays.map((d, i) => {
            const iso = toISO(d)
            const hasBlocks = blocks.some(b => b.date === iso)
            const isTod  = iso === todayISO()
            const isPast = iso < todayISO()
            return (
              <View key={i} style={sc.streakDotCol}>
                <Text allowFontScaling={false} style={sc.streakDotDay}>{DAY_NAMES[i]}</Text>
                <View style={[sc.streakDot, hasBlocks && isPast && sc.streakDotDone, isTod && sc.streakDotToday, hasBlocks && isTod && { borderColor: C.sapphire }]}>
                  {hasBlocks && <View style={[sc.streakDotInner, { backgroundColor: isTod ? C.sapphire : C.emerald }]} />}
                </View>
              </View>
            )
          })}
        </View>
      </View>

      <View style={sc.weekNav}>
        <TouchableOpacity style={sc.weekNavBtn} onPress={() => { const d = new Date(weekRef); d.setDate(d.getDate() - 7); setWeekRef(d) }}>
          <Ionicons name="chevron-back" size={18} color={C.textSub} />
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sc.weekDays}>
          {weekDays.map((d, i) => {
            const iso = toISO(d)
            const isSelected = iso === selectedDate
            const isTod = iso === todayISO()
            const hasBlocks = blocks.some(b => b.date === iso)
            return (
              <TouchableOpacity key={i} style={sc.dayCol} onPress={() => setSelectedDate(iso)} activeOpacity={0.8}>
                <Text allowFontScaling={false} style={[sc.dayName, isSelected && { color: C.sapphire }]}>{DAY_NAMES[i]}</Text>
                <View style={[sc.dayNumBox, isSelected && sc.dayNumBoxActive, isTod && !isSelected && sc.dayNumBoxToday]}>
                  <Text maxFontSizeMultiplier={1.2} style={[sc.dayNum, isSelected && { color: '#fff' }, isTod && !isSelected && { color: C.sapphire }]}>{d.getDate()}</Text>
                </View>
                {hasBlocks && <View style={[sc.dayDot, { backgroundColor: isSelected ? C.gold : C.sapphire }]} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
        <TouchableOpacity style={sc.weekNavBtn} onPress={() => { const d = new Date(weekRef); d.setDate(d.getDate() + 7); setWeekRef(d) }}>
          <Ionicons name="chevron-forward" size={18} color={C.textSub} />
        </TouchableOpacity>
      </View>

      <View style={g.sectionHead}>
        <Text maxFontSizeMultiplier={1.2} style={g.sectionTitle}>
          {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </Text>
        {/* GATE: turns gold + lock icon when at limit */}
        <TouchableOpacity style={[sc.addBlockBtn, !canAddBlock && sc.addBlockBtnLocked]} onPress={handleAddPress} activeOpacity={0.85}>
          <Ionicons name={canAddBlock ? 'add' : 'lock-closed'} size={15} color={canAddBlock ? C.sapphire : C.gold} />
          <Text maxFontSizeMultiplier={1.2} style={[sc.addBlockBtnText, !canAddBlock && { color: C.gold }]}>Add block</Text>
        </TouchableOpacity>
      </View>

      <FreeLimitBadge count={blocks.length} onUpgrade={onGate} />

      {dayBlocks.length === 0 ? (
        <EmptyState icon="calendar-outline" title="No blocks yet" sub="Add a study session, lecture or practice block for this day." cta="Add time block" onCta={handleAddPress} />
      ) : (
        <View style={{ gap: 10 }}>
          {dayBlocks.map(block => (
            <ScalePress key={block.id}>
              <View style={[sc.block, { borderLeftColor: block.color }]}>
                <View style={[sc.blockAccent, { backgroundColor: block.color + '15' }]} />
                <View style={[sc.blockIconBox, { backgroundColor: block.color + '15', borderColor: block.color + '25' }]}>
                  <Ionicons name={block.type === 'lecture' ? 'school-outline' : block.type === 'revision' ? 'refresh-outline' : block.type === 'practice' ? 'barbell-outline' : block.type === 'assignment' ? 'document-text-outline' : 'ellipsis-horizontal'} size={18} color={block.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={1.2} style={sc.blockSubject} numberOfLines={1}>{block.subject}</Text>
                  <Text allowFontScaling={false} style={sc.blockTime}>{block.startTime} — {block.endTime} · {formatDuration(blockDurationMins(block))}</Text>
                </View>
                <TagChip label={BLOCK_TYPE_LABELS[block.type]} color={block.color} />
                <TouchableOpacity onPress={() => Alert.alert('Delete block', `Remove "${block.subject}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => onDeleteBlock(block.id) }])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 4 }}>
                  <Ionicons name="close-circle" size={18} color={C.textMute} />
                </TouchableOpacity>
              </View>
            </ScalePress>
          ))}
        </View>
      )}
      <AddBlockModal visible={showAdd} onClose={() => setShowAdd(false)} onAdd={onAddBlock} selectedDate={selectedDate} />
    </ScrollView>
  )
}

// ─────────────────────────────────────────────
// TASKS TAB
// ─────────────────────────────────────────────
function TasksTab({
  tasks, onAddTask, onToggleTask, onDeleteTask, goals, canAddTask, onGate,
}: {
  tasks: PlannerTask[]
  onAddTask: (t: Omit<PlannerTask, 'id' | 'done'>) => void
  onToggleTask: (id: string) => void
  onDeleteTask: (id: string) => void
  goals: StudyGoals
  canAddTask: boolean
  onGate: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter]   = useState<'all' | 'pending' | 'done'>('all')

  const sorted = useMemo(() => {
    const priorityOrder = { high: 0, normal: 1, low: 2 }
    return [...tasks]
      .filter(t => filter === 'all' ? true : filter === 'pending' ? !t.done : t.done)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        if (isOverdue(a.dueDate) !== isOverdue(b.dueDate)) return isOverdue(a.dueDate) ? -1 : 1
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) return priorityOrder[a.priority] - priorityOrder[b.priority]
        return a.dueDate.localeCompare(b.dueDate)
      })
  }, [tasks, filter])

  const donePct  = tasks.length > 0 ? Math.round((tasks.filter(t => t.done).length / tasks.length) * 100) : 0
  const weekDone = getWeeklyTasksDone(tasks)

  const handleAddPress = () => { if (!canAddTask) { onGate(); return } setShowAdd(true) }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={tk.summaryCard}>
        <LinearGradient colors={[C.emerDim, C.sapphDim + '60']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <ProgressRing pct={donePct} size={72} stroke={5} color={C.emerald}>
            <Text maxFontSizeMultiplier={1.2} style={tk.ringPct}>{donePct}%</Text>
          </ProgressRing>
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={1.2} style={tk.summaryTitle}>Task progress</Text>
            <Text maxFontSizeMultiplier={1.2} style={tk.summarySub}>{tasks.filter(t => t.done).length} of {tasks.length} complete</Text>
            <View style={tk.weekBadge}>
              <Ionicons name="calendar-outline" size={11} color={C.emerald} />
              <Text allowFontScaling={false} style={tk.weekBadgeText}>{weekDone}/{goals.weekly_tasks} this week</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={tk.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
          {(['all', 'pending', 'done'] as const).map(f => (
            <TouchableOpacity key={f} style={[tk.filterPill, filter === f && tk.filterPillActive]} onPress={() => setFilter(f)} activeOpacity={0.8}>
              <Text style={[tk.filterPillText, filter === f && tk.filterPillTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {/* GATE */}
        <TouchableOpacity style={[tk.addBtn, !canAddTask && tk.addBtnLocked]} onPress={handleAddPress} activeOpacity={0.85}>
          <Ionicons name={canAddTask ? 'add' : 'lock-closed'} size={16} color={canAddTask ? C.sapphire : C.gold} />
          <Text maxFontSizeMultiplier={1.2} style={[tk.addBtnText, !canAddTask && { color: C.gold }]}>Add</Text>
        </TouchableOpacity>
      </View>

      <FreeLimitBadge count={tasks.length} onUpgrade={onGate} />

      {sorted.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" title={filter === 'done' ? 'No completed tasks' : 'No tasks yet'} sub={filter === 'done' ? 'Completed tasks will appear here.' : 'Add assignments, readings and study tasks.'} cta="Add task" onCta={handleAddPress} />
      ) : (
        <View style={{ gap: 8 }}>
          {sorted.map(task => {
            const { label, urgent } = dueDateLabel(task.dueDate)
            return (
              <ScalePress key={task.id}>
                <View style={[tk.taskRow, task.done && tk.taskRowDone]}>
                  <View style={[tk.taskLeft, { borderLeftColor: task.color }]}>
                    <TouchableOpacity style={[tk.checkbox, task.done && { backgroundColor: C.emerald, borderColor: C.emerald }]} onPress={() => onToggleTask(task.id)} activeOpacity={0.8}>
                      {task.done && <Ionicons name="checkmark" size={13} color={C.void} />}
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text maxFontSizeMultiplier={1.2} style={[tk.taskTitle, task.done && tk.taskTitleDone]} numberOfLines={2}>{task.title}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        {task.course !== 'General' && <Text allowFontScaling={false} style={tk.taskCourse}>{task.course}</Text>}
                        <TagChip label={task.priority.toUpperCase()} color={TASK_PRIORITY_COLORS[task.priority]} />
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <Text allowFontScaling={false} style={[tk.dueLabel, urgent && !task.done && { color: C.coral }]}>{label}</Text>
                      <TouchableOpacity onPress={() => Alert.alert('Delete task', `Remove "${task.title}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => onDeleteTask(task.id) }])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="trash-outline" size={14} color={C.textMute} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </ScalePress>
            )
          })}
        </View>
      )}
      <AddTaskModal visible={showAdd} onClose={() => setShowAdd(false)} onAdd={onAddTask} />
    </ScrollView>
  )
}

// ─────────────────────────────────────────────
// FOCUS TAB
// ─────────────────────────────────────────────
function FocusTab({
  stats, goals, onSessionComplete, userId, canFocus, onGate,
}: {
  stats: PlannerStats
  goals: StudyGoals
  onSessionComplete: (mode: PomoMode) => void
  userId: string | null
  canFocus: boolean
  onGate: () => void
}) {
  const [mode,      setMode]      = useState<PomoMode>('focus')
  const [remaining, setRemaining] = useState(POMO_DURATIONS.focus)
  const [running,   setRunning]   = useState(false)
  const [subject,   setSubject]   = useState('General')
  const [editSubj,  setEditSubj]  = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const totalSecs   = POMO_DURATIONS[mode]
  const pct         = ((totalSecs - remaining) / totalSecs) * 100

  const ringAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(ringAnim, { toValue: pct, duration: 300, useNativeDriver: false, easing: Easing.linear }).start()
  }, [pct])

  const start = useCallback(() => {
    // GATE: block start if free user hit session limit
    if (!canFocus) { onGate(); return }
    setRunning(true)
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          setRunning(false)
          if (mode === 'focus') {
            onSessionComplete(mode)
            if (userId) sbRun(supabase.from('user_activity').insert({ user_id: userId, activity_type: 'ai_session' }))
          }
          Alert.alert(mode === 'focus' ? '🎉 Session complete!' : '⏰ Break over!', mode === 'focus' ? `Great work on "${subject}"! Take a break.` : 'Ready to focus again?')
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [mode, subject, userId, onSessionComplete, canFocus, onGate])

  const pause      = useCallback(() => { clearInterval(intervalRef.current!); setRunning(false) }, [])
  const reset      = useCallback(() => { clearInterval(intervalRef.current!); setRunning(false); setRemaining(POMO_DURATIONS[mode]) }, [mode])
  const switchMode = useCallback((newMode: PomoMode) => { clearInterval(intervalRef.current!); setRunning(false); setMode(newMode); setRemaining(POMO_DURATIONS[newMode]) }, [])

  useEffect(() => { return () => clearInterval(intervalRef.current!) }, [])

  const sessionsPct = Math.min((stats.sessions_today / goals.daily_pomodoros) * 100, 100)
  const ringSize    = 200
  const stroke      = 8

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={fo.modeRow}>
        {(['focus', 'short', 'long'] as const).map(md => (
          <TouchableOpacity key={md} style={[fo.modeBtn, mode === md && fo.modeBtnActive]} onPress={() => switchMode(md)} activeOpacity={0.8}>
            <Text style={[fo.modeBtnText, mode === md && fo.modeBtnTextActive]}>{md === 'focus' ? 'Focus' : md === 'short' ? 'Short break' : 'Long break'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={fo.timerCard}>
        <LinearGradient colors={mode === 'focus' ? [C.sapphDim, C.lavDim] : mode === 'short' ? [C.emerDim, C.skyDim + '60'] : [C.goldDim, C.orangeDim + '60']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={fo.ringWrap}>
          <View style={[fo.ringTrack, { width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderWidth: stroke }]} />
          <Animated.View style={[fo.ringFill, {
            width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderWidth: stroke,
            borderTopColor:    mode === 'focus' ? C.sapphire : mode === 'short' ? C.emerald : C.gold,
            borderRightColor:  pct > 25 ? (mode === 'focus' ? C.sapphire : mode === 'short' ? C.emerald : C.gold) : 'transparent',
            borderBottomColor: pct > 50 ? (mode === 'focus' ? C.sapphire : mode === 'short' ? C.emerald : C.gold) : 'transparent',
            borderLeftColor:   pct > 75 ? (mode === 'focus' ? C.sapphire : mode === 'short' ? C.emerald : C.gold) : 'transparent',
          }]} />
          <View style={fo.ringCenter}>
            <Text maxFontSizeMultiplier={1.2} style={fo.timerText}>{formatTime(remaining)}</Text>
            <Text allowFontScaling={false} style={fo.timerLabel}>{POMO_LABELS[mode]}</Text>
          </View>
        </View>

        <View style={fo.sessionDots}>
          {Array.from({ length: goals.daily_pomodoros }, (_, i) => (
            <View key={i} style={[fo.sessionDot, i < stats.sessions_today && fo.sessionDotDone]} />
          ))}
        </View>
        <Text allowFontScaling={false} style={fo.sessionHint}>
          {stats.sessions_today}/{goals.daily_pomodoros} sessions today{stats.sessions_today >= goals.daily_pomodoros ? '  🎉' : ''}
        </Text>

        {editSubj ? (
          <TextInput style={fo.subjectInput} value={subject} onChangeText={setSubject} onBlur={() => setEditSubj(false)} autoFocus placeholder="Subject..." placeholderTextColor={C.textMute} />
        ) : (
          <TouchableOpacity style={fo.subjectRow} onPress={() => setEditSubj(true)} activeOpacity={0.8}>
            <Ionicons name="book-outline" size={14} color={C.textMute} />
            <Text maxFontSizeMultiplier={1.2} style={fo.subjectText}>{subject}</Text>
            <Ionicons name="pencil-outline" size={12} color={C.textMute} />
          </TouchableOpacity>
        )}

        {/* GATE: play button shows lock when free user is at session limit */}
        <View style={fo.controls}>
          <TouchableOpacity style={fo.resetBtn} onPress={reset} activeOpacity={0.8}>
            <Ionicons name="refresh" size={18} color={C.textSub} />
          </TouchableOpacity>
          <ScalePress
            onPress={running ? pause : start}
            style={[fo.playBtn, { backgroundColor: !canFocus && !running ? C.goldDim : mode === 'focus' ? C.sapphire : mode === 'short' ? C.emerald : C.gold }]}
          >
            {!canFocus && !running
              ? <Ionicons name="lock-closed" size={26} color={C.gold} />
              : <Ionicons name={running ? 'pause' : 'play'} size={26} color={C.void} />
            }
          </ScalePress>
          <TouchableOpacity style={fo.resetBtn} onPress={() => switchMode(mode === 'focus' ? 'short' : 'focus')} activeOpacity={0.8}>
            <Ionicons name="play-skip-forward-outline" size={18} color={C.textSub} />
          </TouchableOpacity>
        </View>

        {!canFocus && !running && (
          <TouchableOpacity onPress={onGate} style={fo.gateHint}>
            <Ionicons name="flash" size={12} color={C.gold} />
            <Text allowFontScaling={false} style={fo.gateHintText}>Upgrade for unlimited sessions</Text>
          </TouchableOpacity>
        )}
      </View>

      <FreeLimitBadge count={stats.sessions_today} onUpgrade={onGate} />

      <SectionHead title="Today's stats" />
      <View style={fo.statsRow}>
        {[
          { label: 'Sessions', val: String(stats.sessions_today),   color: C.sapphire, icon: 'timer-outline'       as const },
          { label: 'Focused',  val: `${stats.focused_mins_today}m`, color: C.emerald,  icon: 'trending-up-outline' as const },
          { label: 'Streak',   val: `${stats.streak}🔥`,            color: C.gold,     icon: 'flame-outline'       as const },
        ].map(item => (
          <View key={item.label} style={fo.statCard}>
            <View style={[fo.statIconBox, { backgroundColor: item.color + '15' }]}>
              <Ionicons name={item.icon} size={16} color={item.color} />
            </View>
            <Text maxFontSizeMultiplier={1.2} style={[fo.statVal, { color: item.color }]}>{item.val}</Text>
            <Text allowFontScaling={false} style={fo.statLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={fo.goalBar}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text maxFontSizeMultiplier={1.2} style={fo.goalBarLabel}>Daily goal</Text>
          <Text maxFontSizeMultiplier={1.2} style={fo.goalBarPct}>{Math.round(sessionsPct)}%</Text>
        </View>
        <View style={fo.goalBarTrack}>
          <View style={[fo.goalBarFill, { width: `${sessionsPct}%` as any }]} />
        </View>
        <Text allowFontScaling={false} style={fo.goalBarSub}>{stats.sessions_today} of {goals.daily_pomodoros} sessions complete</Text>
      </View>
    </ScrollView>
  )
}

// ─────────────────────────────────────────────
// GOALS TAB
// ─────────────────────────────────────────────
function GoalsTab({
  stats, goals, tasks, blocks, onEditGoals, isPremium, onGate,
}: {
  stats: PlannerStats
  goals: StudyGoals
  tasks: PlannerTask[]
  blocks: TimeBlock[]
  onEditGoals: () => void
  isPremium: boolean
  onGate: () => void
}) {
  const weeklyHours = useMemo(() => getWeeklyBlockHours(blocks), [blocks])
  const weeklyTasks = useMemo(() => getWeeklyTasksDone(tasks), [tasks])
  const hoursPct    = Math.min((weeklyHours / goals.weekly_hours) * 100, 100)
  const tasksPct    = Math.min((weeklyTasks / goals.weekly_tasks) * 100, 100)
  const pomoPct     = Math.min((stats.sessions_today / goals.daily_pomodoros) * 100, 100)
  const streakPct   = Math.min((stats.streak / goals.streak_target) * 100, 100)

  const goalItems = [
    { label: 'Weekly study hours', current: `${weeklyHours.toFixed(1)}h`, target: `${goals.weekly_hours}h`,    pct: hoursPct,  color: C.sapphire, icon: 'time-outline'              as const, done: hoursPct  >= 100 },
    { label: 'Weekly tasks',       current: String(weeklyTasks),          target: String(goals.weekly_tasks),   pct: tasksPct,  color: C.emerald,  icon: 'checkmark-circle-outline'  as const, done: tasksPct  >= 100 },
    { label: 'Daily Pomodoros',    current: String(stats.sessions_today), target: String(goals.daily_pomodoros),pct: pomoPct,   color: C.gold,     icon: 'timer-outline'             as const, done: pomoPct   >= 100 },
    { label: 'Study streak',       current: `${stats.streak} days`,       target: `${goals.streak_target} days`,pct: streakPct, color: C.coral,    icon: 'flame-outline'             as const, done: streakPct >= 100 },
  ]

  // GATE: editing goals is premium only
  const handleEditGoals = () => { if (!isPremium) { onGate(); return } onEditGoals() }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <SectionHead title="Weekly goals" action={isPremium ? 'Edit' : '🔒 Edit'} onAction={handleEditGoals} />
      <View style={{ gap: 12 }}>
        {goalItems.map(item => (
          <View key={item.label} style={gl.goalCard}>
            {item.done && <View style={gl.doneSticker}><Ionicons name="checkmark" size={11} color={C.void} /></View>}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <ProgressRing pct={item.pct} size={60} stroke={5} color={item.color}>
                <Text allowFontScaling={false} style={[gl.ringPct, { color: item.color }]}>{Math.round(item.pct)}%</Text>
              </ProgressRing>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Ionicons name={item.icon} size={14} color={item.color} />
                  <Text maxFontSizeMultiplier={1.2} style={gl.goalLabel}>{item.label}</Text>
                </View>
                <View style={gl.goalBarTrack}>
                  <View style={[gl.goalBarFill, { width: `${item.pct}%` as any, backgroundColor: item.color }]} />
                </View>
                <Text allowFontScaling={false} style={gl.goalMeta}>{item.current} / {item.target}{item.done ? '  ✓ Goal reached!' : ''}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      <View style={{ marginTop: 26 }}>
        <SectionHead title="All-time stats" />
      </View>
      <View style={gl.allTimeGrid}>
        {[
          { label: 'Hours studied', val: stats.total_hours.toFixed(1), color: C.sapphire, icon: 'school-outline'         as const },
          { label: 'Tasks done',    val: String(stats.total_tasks),    color: C.emerald,  icon: 'checkmark-done-outline'  as const },
          { label: 'Pomodoros',     val: String(stats.total_pomodoros),color: C.gold,     icon: 'timer-outline'           as const },
          { label: 'Best streak',   val: `${stats.streak}🔥`,          color: C.coral,    icon: 'flame-outline'           as const },
        ].map(item => (
          <View key={item.label} style={gl.allTimeCard}>
            <View style={[gl.allTimeIconBox, { backgroundColor: item.color + '15' }]}>
              <Ionicons name={item.icon} size={18} color={item.color} />
            </View>
            <Text maxFontSizeMultiplier={1.2} style={[gl.allTimeVal, { color: item.color }]}>{item.val}</Text>
            <Text allowFontScaling={false} style={gl.allTimeLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* GATE: customize goals button */}
      <TouchableOpacity style={[gl.editGoalsBtn, !isPremium && gl.editGoalsBtnLocked]} onPress={handleEditGoals} activeOpacity={0.85}>
        <Ionicons name={isPremium ? 'settings-outline' : 'lock-closed-outline'} size={16} color={isPremium ? C.sapphire : C.gold} />
        <Text maxFontSizeMultiplier={1.2} style={[gl.editGoalsBtnText, !isPremium && { color: C.gold }]}>
          {isPremium ? 'Customize goals' : 'Unlock goal customization'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function StudyPlannerScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { userId, isOnline } = useProfileSync()

  // ── Premium guard ──────────────────────────────────────────────────────
  const { isPremium, canAdd } = usePremiumGuard()
  const [showGate,    setShowGate]    = useState(false)
  const [gateFeature, setGateFeature] = useState('schedule blocks')

  const openGate = useCallback((feature: string) => {
    setGateFeature(feature)
    setShowGate(true)
  }, [])

  const [activeTab,     setActiveTab]     = useState<TabKey>('schedule')
  const [blocks,        setBlocks]        = useState<TimeBlock[]>([])
  const [tasks,         setTasks]         = useState<PlannerTask[]>([])
  const [goals,         setGoals]         = useState<StudyGoals>(DEFAULT_GOALS)
  const [stats,         setStats]         = useState<PlannerStats>(DEFAULT_STATS)
  const [loaded,        setLoaded]        = useState(false)
  const [showEditGoals, setShowEditGoals] = useState(false)

  const TABS: { key: TabKey; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
    { key: 'schedule', label: 'Schedule', icon: 'calendar'        },
    { key: 'tasks',    label: 'Tasks',    icon: 'checkmark-circle' },
    { key: 'focus',    label: 'Focus',    icon: 'timer'            },
    { key: 'goals',    label: 'Goals',    icon: 'trophy'           },
  ]

  useEffect(() => {
    const load = async () => {
      try {
        const [rawBlocks, rawTasks, rawGoals, rawStats] = await Promise.all([
          AsyncStorage.getItem(KEYS.BLOCKS),
          AsyncStorage.getItem(KEYS.TASKS),
          AsyncStorage.getItem(KEYS.GOALS),
          AsyncStorage.getItem(KEYS.STATS),
        ])
        if (rawBlocks) setBlocks(JSON.parse(rawBlocks))
        if (rawTasks)  setTasks(JSON.parse(rawTasks))
        if (rawGoals)  setGoals(JSON.parse(rawGoals))
        if (rawStats)  setStats(JSON.parse(rawStats))
      } catch {}
      setLoaded(true)
    }
    load()
  }, [])

  useEffect(() => {
    if (!loaded) return
    AsyncStorage.setItem(KEYS.BLOCKS, JSON.stringify(blocks)).catch(() => {})
    if (isOnline && userId) sbRun(supabase.from('planner_blocks').upsert(blocks.map(b => ({ ...b, user_id: userId }))))
  }, [blocks, loaded])

  useEffect(() => {
    if (!loaded) return
    AsyncStorage.setItem(KEYS.TASKS, JSON.stringify(tasks)).catch(() => {})
    if (isOnline && userId) sbRun(supabase.from('planner_tasks').upsert(tasks.map(t => ({ ...t, user_id: userId }))))
  }, [tasks, loaded])

  useEffect(() => {
    if (!loaded) return
    AsyncStorage.setItem(KEYS.GOALS, JSON.stringify(goals)).catch(() => {})
    if (isOnline && userId) sbRun(supabase.from('profiles').update({ study_goals: goals }).eq('id', userId!))
  }, [goals, loaded])

  useEffect(() => {
    if (!loaded) return
    AsyncStorage.setItem(KEYS.STATS, JSON.stringify(stats)).catch(() => {})
  }, [stats, loaded])

  useEffect(() => {
    if (!loaded) return
    const today = todayISO()
    if (stats.last_active === today) return
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    const newStreak = stats.last_active === toISO(yesterday) ? stats.streak + 1 : 1
    setStats(p => ({ ...p, streak: newStreak, last_active: today, sessions_today: 0, focused_mins_today: 0 }))
  }, [loaded])

  const addBlock    = useCallback((b: Omit<TimeBlock, 'id'>) => { setBlocks(prev => [...prev, { ...b, id: Date.now().toString() }]) }, [])
  const deleteBlock = useCallback((id: string) => { setBlocks(prev => prev.filter(b => b.id !== id)); if (isOnline && userId) sbRun(supabase.from('planner_blocks').delete().eq('id', id).eq('user_id', userId)) }, [isOnline, userId])
  const addTask     = useCallback((t: Omit<PlannerTask, 'id' | 'done'>) => { setTasks(prev => [...prev, { ...t, id: Date.now().toString(), done: false }]) }, [])
  const toggleTask  = useCallback((id: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t
      const newDone = !t.done
      if (newDone) setStats(p => ({ ...p, total_tasks: p.total_tasks + 1 }))
      return { ...t, done: newDone }
    }))
  }, [])
  const deleteTask  = useCallback((id: string) => { setTasks(prev => prev.filter(t => t.id !== id)); if (isOnline && userId) sbRun(supabase.from('planner_tasks').delete().eq('id', id).eq('user_id', userId)) }, [isOnline, userId])
  const handleSessionComplete = useCallback((mode: PomoMode) => {
    if (mode !== 'focus') return
    setStats(p => ({ ...p, sessions_today: p.sessions_today + 1, total_pomodoros: p.total_pomodoros + 1, focused_mins_today: p.focused_mins_today + 25, total_hours: p.total_hours + 25 / 60 }))
  }, [])
  const saveGoals = useCallback((g: StudyGoals) => setGoals(g), [])

  const TAB_COLORS: Record<TabKey, string> = {
    schedule: C.sapphire,
    tasks:    C.emerald,
    focus:    C.gold,
    goals:    C.lavender,
  }

  return (
    <SwipeToDismiss>
    <View style={[root.screen, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <View style={root.header}>
        <View style={root.headerGlow} />
        <TouchableOpacity style={root.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={20} color={C.textSub} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={1.2} style={root.headerTitle}>Study Planner</Text>
          <Text allowFontScaling={false} style={root.headerSub}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>
        {isPremium ? (
          <View style={root.premiumBadge}>
            <Text allowFontScaling={false} style={root.premiumBadgeText}>👑 Premium</Text>
          </View>
        ) : (
          <TouchableOpacity style={root.settingsBtn} onPress={() => openGate('features')} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="options-outline" size={20} color={C.textSub} />
          </TouchableOpacity>
        )}
        {!isOnline && (
          <View style={root.offlinePill}>
            <Ionicons name="cloud-offline-outline" size={11} color={C.gold} />
            <Text allowFontScaling={false} style={root.offlineText}>Offline</Text>
          </View>
        )}
      </View>

      {/* TAB BAR */}
      <View style={root.tabBar}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key
          const color    = TAB_COLORS[tab.key]
          return (
            <TouchableOpacity key={tab.key} style={root.tabItem} onPress={() => setActiveTab(tab.key)} activeOpacity={0.8}>
              <Ionicons name={isActive ? tab.icon : `${tab.icon}-outline` as any} size={18} color={isActive ? color : C.textMute} />
              <Text allowFontScaling={false} style={[root.tabLabel, isActive && { color, fontWeight: '700' }]}>{tab.label}</Text>
              {isActive && <View style={[root.tabUnderline, { backgroundColor: color }]} />}
            </TouchableOpacity>
          )
        })}
      </View>

      {/* TAB CONTENT */}
      <View style={root.body}>
        {activeTab === 'schedule' && (
          <ScheduleTab blocks={blocks} onAddBlock={addBlock} onDeleteBlock={deleteBlock} stats={stats} goals={goals}
            canAddBlock={canAdd(blocks.length)} onGate={() => openGate('schedule blocks')} />
        )}
        {activeTab === 'tasks' && (
          <TasksTab tasks={tasks} onAddTask={addTask} onToggleTask={toggleTask} onDeleteTask={deleteTask} goals={goals}
            canAddTask={canAdd(tasks.length)} onGate={() => openGate('tasks')} />
        )}
        {activeTab === 'focus' && (
          <FocusTab stats={stats} goals={goals} onSessionComplete={handleSessionComplete} userId={userId}
            canFocus={canAdd(stats.sessions_today)} onGate={() => openGate('focus sessions')} />
        )}
        {activeTab === 'goals' && (
          <GoalsTab stats={stats} goals={goals} tasks={tasks} blocks={blocks}
            onEditGoals={() => setShowEditGoals(true)} isPremium={isPremium} onGate={() => openGate('goal customization')} />
        )}
      </View>

      <EditGoalsModal visible={showEditGoals} onClose={() => setShowEditGoals(false)} goals={goals} onSave={saveGoals} />

      {/* PREMIUM GATE MODAL */}
      <PremiumGateModal
        visible={showGate}
        onClose={() => setShowGate(false)}
        onUpgrade={() => { setShowGate(false); router.push('/subscription' as any) }}
        limitedFeature={gateFeature}
      />
    </View>
    </SwipeToDismiss>
  )
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const root = StyleSheet.create({
  screen:           { flex: 1, backgroundColor: C.void },
  header:           { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, position: 'relative', overflow: 'hidden' },
  headerGlow:       { position: 'absolute', top: -60, left: '30%', width: 200, height: 120, borderRadius: 100, backgroundColor: C.sapphire + '08' },
  backBtn:          { width: 36, height: 36, borderRadius: 12, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  headerTitle:      { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  headerSub:        { fontSize: 11, color: C.textMute, marginTop: 1 },
  settingsBtn:      { width: 36, height: 36, borderRadius: 12, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  premiumBadge:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.goldDim, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.gold + '35' },
  premiumBadgeText: { fontSize: 11, fontWeight: '700', color: C.gold },
  offlinePill:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.goldDim, borderRadius: 100, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: C.gold + '30' },
  offlineText:      { fontSize: 10, fontWeight: '700', color: C.gold },
  tabBar:           { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.deep },
  tabItem:          { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3, position: 'relative' },
  tabLabel:         { fontSize: 10, color: C.textMute, fontWeight: '500' },
  tabUnderline:     { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 2, borderRadius: 1 },
  body:             { flex: 1, paddingHorizontal: 18, paddingTop: 18 },
})

const g = StyleSheet.create({
  sectionHead:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle:   { fontSize: 15, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  sectionAction:  { fontSize: 13, fontWeight: '600', color: C.sapphire },
  tagChip:        { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  tagChipText:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  emptyState:     { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyIconBox:   { width: 64, height: 64, borderRadius: 20, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle:     { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  emptySub:       { fontSize: 13, color: C.textMute, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  emptyBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.sapphire, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12, marginTop: 8 },
  emptyBtnText:   { fontSize: 14, fontWeight: '700', color: C.void },
  limitBadge:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.goldDim, borderWidth: 1, borderColor: C.gold + '30', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 14 },
  limitBadgeText: { fontSize: 12, fontWeight: '600', color: C.gold },
})

const sc = StyleSheet.create({
  overviewCard:     { borderRadius: 22, padding: 18, marginBottom: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  overviewRow:      { flexDirection: 'row', gap: 18, alignItems: 'center', marginBottom: 16 },
  overviewLabel:    { fontSize: 11, color: C.textMute, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  overviewHours:    { fontSize: 30, fontWeight: '800', color: C.text, letterSpacing: -1 },
  overviewHoursSub: { fontSize: 14, fontWeight: '400', color: C.textMute },
  progressTrack:    { height: 4, backgroundColor: C.border, borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  progressFill:     { height: '100%', borderRadius: 2 },
  overviewRight:    { flexShrink: 0 },
  streakBox:        { alignItems: 'center', backgroundColor: C.goldDim, borderWidth: 1, borderColor: C.gold + '25', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  streakNum:        { fontSize: 26, fontWeight: '800', color: C.gold, lineHeight: 28 },
  streakLabel:      { fontSize: 11, color: C.goldGlow, marginTop: 2 },
  streakDots:       { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  streakDotCol:     { alignItems: 'center', gap: 4 },
  streakDotDay:     { fontSize: 9, color: C.textMute, fontWeight: '600' },
  streakDot:        { width: 24, height: 24, borderRadius: 8, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  streakDotDone:    { borderColor: C.emerald + '40' },
  streakDotToday:   { borderColor: C.sapphire + '60', backgroundColor: C.sapphDim },
  streakDotInner:   { width: 8, height: 8, borderRadius: 4 },
  weekNav:          { flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 6 },
  weekNavBtn:       { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  weekDays:         { gap: 6, paddingHorizontal: 4 },
  dayCol:           { alignItems: 'center', gap: 5 },
  dayName:          { fontSize: 9, fontWeight: '700', color: C.textMute, letterSpacing: 0.5 },
  dayNumBox:        { width: 36, height: 36, borderRadius: 11, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  dayNumBoxActive:  { backgroundColor: C.sapphire, borderColor: C.sapphire },
  dayNumBoxToday:   { borderColor: C.sapphire + '60', backgroundColor: C.sapphDim },
  dayNum:           { fontSize: 13, fontWeight: '700', color: C.textSub },
  dayDot:           { width: 4, height: 4, borderRadius: 2 },
  addBlockBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.sapphDim, borderWidth: 1, borderColor: C.sapphire + '35', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addBlockBtnLocked:{ backgroundColor: C.goldDim, borderColor: C.gold + '35' },
  addBlockBtnText:  { fontSize: 12, fontWeight: '700', color: C.sapphire },
  block:            { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 14, borderLeftWidth: 3, overflow: 'hidden', position: 'relative' },
  blockAccent:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.4 },
  blockIconBox:     { width: 40, height: 40, borderRadius: 13, borderWidth: 1, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  blockSubject:     { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 3 },
  blockTime:        { fontSize: 11, color: C.textMute },
})

const tk = StyleSheet.create({
  summaryCard:          { borderRadius: 22, padding: 18, marginBottom: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  ringPct:              { fontSize: 14, fontWeight: '800', color: C.emerald },
  summaryTitle:         { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 3 },
  summarySub:           { fontSize: 12, color: C.textMute, marginBottom: 8 },
  weekBadge:            { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.emerDim, borderWidth: 1, borderColor: C.emerald + '25', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  weekBadgeText:        { fontSize: 11, color: C.emerald, fontWeight: '600' },
  filterRow:            { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  filterPill:           { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, borderWidth: 1, borderColor: C.border, backgroundColor: C.raised },
  filterPillActive:     { backgroundColor: C.sapphDim, borderColor: C.sapphire + '50' },
  filterPillText:       { fontSize: 12, fontWeight: '600', color: C.textMute },
  filterPillTextActive: { color: C.sapphire },
  addBtn:               { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.sapphDim, borderWidth: 1, borderColor: C.sapphire + '35', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginLeft: 'auto' },
  addBtnLocked:         { backgroundColor: C.goldDim, borderColor: C.gold + '35' },
  addBtnText:           { fontSize: 12, fontWeight: '700', color: C.sapphire },
  taskRow:              { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  taskRowDone:          { opacity: 0.6 },
  taskLeft:             { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderLeftWidth: 3 },
  checkbox:             { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: C.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
  taskTitle:            { fontSize: 14, fontWeight: '600', color: C.text, lineHeight: 20 },
  taskTitleDone:        { textDecorationLine: 'line-through', color: C.textMute },
  taskCourse:           { fontSize: 11, color: C.textMute },
  dueLabel:             { fontSize: 11, fontWeight: '600', color: C.textMute },
})

const fo = StyleSheet.create({
  modeRow:         { flexDirection: 'row', backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 3, marginBottom: 18 },
  modeBtn:         { flex: 1, paddingVertical: 8, borderRadius: 11, alignItems: 'center' },
  modeBtnActive:   { backgroundColor: C.sapphire },
  modeBtnText:     { fontSize: 11.5, fontWeight: '600', color: C.textMute },
  modeBtnTextActive:{ color: '#fff' },
  timerCard:       { borderRadius: 24, padding: 24, marginBottom: 22, overflow: 'hidden', borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  ringWrap:        { width: 200, height: 200, position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  ringTrack:       { position: 'absolute', borderColor: C.border },
  ringFill:        { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  ringCenter:      { alignItems: 'center' },
  timerText:       { fontSize: 44, fontWeight: '800', color: C.text, letterSpacing: -2, lineHeight: 48 },
  timerLabel:      { fontSize: 12, color: C.textMute, marginTop: 4 },
  sessionDots:     { flexDirection: 'row', gap: 8, marginBottom: 6 },
  sessionDot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: C.border },
  sessionDotDone:  { backgroundColor: C.sapphire },
  sessionHint:     { fontSize: 11, color: C.textMute, marginBottom: 14 },
  subjectRow:      { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 9, marginBottom: 18 },
  subjectText:     { flex: 1, fontSize: 13, fontWeight: '600', color: C.textSub },
  subjectInput:    { backgroundColor: C.raised, borderWidth: 1, borderColor: C.sapphire + '60', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 9, fontSize: 13, color: C.text, marginBottom: 18, alignSelf: 'stretch' },
  controls:        { flexDirection: 'row', alignItems: 'center', gap: 20 },
  resetBtn:        { width: 44, height: 44, borderRadius: 14, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  playBtn:         { width: 68, height: 68, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  gateHint:        { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
  gateHintText:    { fontSize: 12, color: C.gold, fontWeight: '600' },
  statsRow:        { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard:        { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14, alignItems: 'center', gap: 6 },
  statIconBox:     { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  statVal:         { fontSize: 18, fontWeight: '800' },
  statLabel:       { fontSize: 10, color: C.textMute },
  goalBar:         { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16 },
  goalBarLabel:    { fontSize: 13, fontWeight: '700', color: C.text },
  goalBarPct:      { fontSize: 13, fontWeight: '700', color: C.sapphire },
  goalBarTrack:    { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  goalBarFill:     { height: '100%', backgroundColor: C.sapphire, borderRadius: 3 },
  goalBarSub:      { fontSize: 11, color: C.textMute },
})

const gl = StyleSheet.create({
  goalCard:         { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 16, position: 'relative', overflow: 'hidden' },
  doneSticker:      { position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderRadius: 10, backgroundColor: C.emerald, justifyContent: 'center', alignItems: 'center' },
  ringPct:          { fontSize: 12, fontWeight: '800' },
  goalLabel:        { fontSize: 13, fontWeight: '600', color: C.text },
  goalBarTrack:     { height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden', marginVertical: 6 },
  goalBarFill:      { height: '100%', borderRadius: 2 },
  goalMeta:         { fontSize: 11, color: C.textMute },
  allTimeGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  allTimeCard:      { width: '47%', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, alignItems: 'center', gap: 8 },
  allTimeIconBox:   { width: 40, height: 40, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  allTimeVal:       { fontSize: 22, fontWeight: '800' },
  allTimeLabel:     { fontSize: 11, color: C.textMute, textAlign: 'center' },
  editGoalsBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.sapphDim, borderWidth: 1, borderColor: C.sapphire + '35', borderRadius: 16, paddingVertical: 14, marginTop: 8 },
  editGoalsBtnLocked:{ backgroundColor: C.goldDim, borderColor: C.gold + '35' },
  editGoalsBtnText: { fontSize: 14, fontWeight: '700', color: C.sapphire },
})

const eg = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14, marginBottom: 12 },
  iconBox:   { width: 40, height: 40, borderRadius: 13, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  label:     { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 2 },
  unit:      { fontSize: 11, color: C.textMute },
  stepper:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 3 },
  stepBtn:   { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  stepInput: { width: 38, textAlign: 'center', fontSize: 14, fontWeight: '700', color: C.text },
})

const m = StyleSheet.create({
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet:            { backgroundColor: C.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 48, maxHeight: '92%' },
  handle:           { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 22 },
  sheetHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  sheetTitle:       { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  sheetSub:         { fontSize: 13, color: C.textMute, marginTop: 3 },
  closeBtn:         { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  fieldLabel:       { fontSize: 11, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 },
  input:            { backgroundColor: C.raised, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.text, borderWidth: 1, borderColor: C.border, marginBottom: 18 },
  typeBtn:          { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.raised },
  typeDot:          { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  typeBtnText:      { fontSize: 12, fontWeight: '600', color: C.textSub },
  timePicker:       { height: 120, backgroundColor: C.raised, borderRadius: 13, borderWidth: 1, borderColor: C.border, marginBottom: 22 },
  timeOption:       { paddingVertical: 9, paddingHorizontal: 14 },
  timeOptionActive: { backgroundColor: C.sapphDim },
  timeOptionText:   { fontSize: 13, color: C.textSub },
  priorityBtn:      { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  priorityText:     { fontSize: 13, fontWeight: '700', color: C.textMute },
  colorDot:         { width: 30, height: 30, borderRadius: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 },
  primaryBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.gold, borderRadius: 16, paddingVertical: 15 },
  primaryBtnText:   { fontSize: 15, fontWeight: '800', color: C.void },
})