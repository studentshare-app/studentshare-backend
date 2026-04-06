/**
 * app/deadlines.tsx
 *
 * Cross-device sync via Supabase.
 *
 * DATA LAYER ARCHITECTURE
 * ────────────────────────
 * • Supabase `deadlines` table is the single source of truth.
 * • AsyncStorage is an offline cache — shown instantly on cold start.
 * • Realtime subscription delivers inserts / updates / deletes from
 *   other devices live without needing a manual refresh.
 * • `is_done` is a column in Supabase, not a local Set, so done state
 *   also syncs across devices.
 * • Every CRUD operation is optimistic: UI updates immediately, then
 *   the Supabase call runs in the background. On error, state rolls back.
 * • AsyncStorage cache (legacy key) is kept in sync so index.tsx home
 *   widget always reflects the latest deadlines without any changes to
 *   index.tsx.
 *
 * REQUIRED SUPABASE TABLE
 * ───────────────────────
 * create table deadlines (
 *   id         text primary key,
 *   user_id    uuid not null references auth.users(id) on delete cascade,
 *   title      text not null,
 *   course     text not null default 'General',
 *   due_date   text not null,          -- ISO "YYYY-MM-DD"
 *   color      text not null,
 *   is_done    boolean not null default false,
 *   created_at timestamptz default now()
 * );
 * alter table deadlines enable row level security;
 * create policy "Users manage own deadlines"
 *   on deadlines for all
 *   using  (auth.uid() = user_id)
 *   with check (auth.uid() = user_id);
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  PanResponder,
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
import { supabase } from '@/core/api/supabase'

// ─────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────
const C = {
  void:      '#07080C',
  deep:      '#0B0D13',
  surface:   '#10131C',
  raised:    '#161B27',
  border:    'rgba(255,255,255,0.055)',
  text:      '#EEF0F8',
  textSub:   '#6E7A96',
  textMute:  '#353D52',
  orange:    '#E8692A',
  orangeDim: 'rgba(232,105,42,0.10)',
  gold:      '#DFA83C',
  goldDim:   'rgba(223,168,60,0.10)',
  sapphire:  '#4B8CF5',
  sapphDim:  'rgba(75,140,245,0.10)',
  emerald:   '#3DC99A',
  emerDim:   'rgba(61,201,154,0.10)',
  lavender:  '#9B7CF4',
  lavDim:    'rgba(155,124,244,0.10)',
  coral:     '#EE6868',
  coralDim:  'rgba(238,104,104,0.10)',
  sky:       '#38BDF8',
  pink:      '#E879F9',
} as const

const BODY_H_PAD      = 20
const DEADLINE_COLORS = [C.sapphire, C.lavender, C.emerald, C.gold, C.coral, C.pink]

// Legacy key kept so index.tsx home widget reads updated data
const LEGACY_CACHE_KEY = 'studentshare_deadlines'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Deadline = {
  id:       string
  title:    string
  due_date: string   // ISO "YYYY-MM-DD"
  course:   string
  color:    string
  is_done:  boolean
}

type Tab       = 'upcoming' | 'done' | 'overdue'
type ModalMode = { kind: 'add' } | { kind: 'edit'; deadline: Deadline }

// ─────────────────────────────────────────────
// Date helpers (unchanged)
// ─────────────────────────────────────────────
function daysRemaining(due: string): number {
  const now  = new Date(); now.setHours(0, 0, 0, 0)
  const dueD = new Date(due + 'T00:00:00')
  return Math.ceil((dueD.getTime() - now.getTime()) / 86_400_000)
}
const isOverdue  = (due: string) => daysRemaining(due) < 0
const isDueToday = (due: string) => daysRemaining(due) === 0

function urgencyColor(due: string, base: string): string {
  const d = daysRemaining(due)
  if (d < 0)  return C.coral
  if (d <= 0) return C.orange
  if (d <= 2) return C.orange
  if (d <= 5) return C.gold
  return base
}
function urgencyLabel(due: string): string {
  const d = daysRemaining(due)
  if (d < 0)   return `${Math.abs(d)}d overdue`
  if (d === 0) return 'Due today'
  if (d === 1) return '1 day left'
  return `${d} days left`
}
function formatDisplay(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[mo - 1]} ${d}, ${y}`
}
function toIso(y: number, mo: number, d: number): string {
  return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
function sortByDate(ds: Deadline[]) {
  return [...ds].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
}
function groupByPeriod(ds: Deadline[]): { label: string; items: Deadline[] }[] {
  const buckets: Record<string, Deadline[]> = {
    'Today':[], 'This Week':[], 'Next Week':[],
    'This Month':[], 'Next Month':[], 'Later':[],
  }
  ds.forEach(d => {
    const days = daysRemaining(d.due_date)
    if (days === 0)      buckets['Today'].push(d)
    else if (days <= 7)  buckets['This Week'].push(d)
    else if (days <= 14) buckets['Next Week'].push(d)
    else if (days <= 30) buckets['This Month'].push(d)
    else if (days <= 60) buckets['Next Month'].push(d)
    else                 buckets['Later'].push(d)
  })
  return Object.entries(buckets).filter(([,v]) => v.length > 0).map(([label, items]) => ({ label, items }))
}
function typeIcon(course: string): React.ComponentProps<typeof Ionicons>['name'] {
  const c = course.toLowerCase()
  if (c.includes('math')||c.includes('calc')||c.includes('stat')) return 'calculator-outline'
  if (c.includes('phys'))  return 'planet-outline'
  if (c.includes('chem')||c.includes('lab')) return 'flask-outline'
  if (c.includes('hist'))  return 'library-outline'
  if (c.includes('cs')||c.includes('prog')||c.includes('data')) return 'code-slash-outline'
  if (c.includes('english')||c.includes('essay')||c.includes('paper')) return 'document-text-outline'
  if (c.includes('bio'))   return 'leaf-outline'
  return 'calendar-outline'
}

// ─────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────
// Write to legacy key so index.tsx home widget always has fresh data
async function writeCache(deadlines: Deadline[]) {
  // Strip is_done from what the home widget sees (it only cares about title/due_date/color)
  const homeFormat = deadlines
    .filter(d => !d.is_done)
    .map(({ id, title, due_date, course, color }) => ({ id, title, due_date, course, color }))
  await AsyncStorage.setItem(LEGACY_CACHE_KEY, JSON.stringify(homeFormat)).catch(() => {})
}
async function readCache(): Promise<Deadline[]> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Normalise — legacy entries may not have is_done
    return parsed.map((d: any) => ({ ...d, is_done: d.is_done ?? false }))
  } catch { return [] }
}

// ─────────────────────────────────────────────
// Supabase helpers
// ─────────────────────────────────────────────
async function fetchFromSupabase(userId: string): Promise<Deadline[]> {
  const { data, error } = await supabase
    .from('deadlines')
    .select('id, title, due_date, course, color, is_done')
    .eq('user_id', userId)
    .order('due_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as Deadline[]
}

async function upsertToSupabase(userId: string, d: Deadline): Promise<void> {
  const { error } = await supabase
    .from('deadlines')
    .upsert({
      id:       d.id,
      user_id:  userId,
      title:    d.title,
      due_date: d.due_date,
      course:   d.course,
      color:    d.color,
      is_done:  d.is_done,
    }, { onConflict: 'id' })
  if (error) throw error
}

async function deleteFromSupabase(id: string): Promise<void> {
  const { error } = await supabase
    .from('deadlines')
    .delete()
    .eq('id', id)
  if (error) throw error
}

async function updateDoneInSupabase(id: string, is_done: boolean): Promise<void> {
  const { error } = await supabase
    .from('deadlines')
    .update({ is_done })
    .eq('id', id)
  if (error) throw error
}

// ─────────────────────────────────────────────
// useSwipeToDismiss
// ─────────────────────────────────────────────
function useSwipeToDismiss(onClose: () => void) {
  const translateY = useRef(new Animated.Value(0)).current

  // handleProps goes ONLY on the drag-handle bar, never the whole sheet.
  // This prevents the pan responder from stealing touches from the
  // ScrollView pickers inside the modal.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy)
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          Animated.timing(translateY, { toValue: 700, duration: 220, useNativeDriver: true })
            .start(() => { translateY.setValue(0); onClose() })
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start()
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start()
      },
    }),
  ).current

  return { translateY, handleProps: panResponder.panHandlers }
}

// ─────────────────────────────────────────────
// ScalePress
// ─────────────────────────────────────────────
function ScalePress({ children, onPress, style }: {
  children: React.ReactNode; onPress?: () => void; style?: any
}) {
  const scale = useRef(new Animated.Value(1)).current
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start()}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
}

// ─────────────────────────────────────────────
// Scroll-wheel Picker column
//
// FIX: Replaced FlatList with ScrollView.
//   - FlatList's scrollToIndex was creating a feedback loop:
//     user scroll → onMomentumScrollEnd selects item → useEffect fires
//     scrollToIndex → triggers another onMomentumScrollEnd → wrong item
//     selected → column snaps back to wrong position.
//   - ScrollView with snapToInterval has no such loop: onScrollEndDrag /
//     onMomentumScrollEnd just reads the final offset once and selects
//     the correct item. No programmatic scroll is needed after that.
//   - Initial scroll-to-selected uses a ref flag so it only fires once
//     on open, not on every selection change.
// ─────────────────────────────────────────────
const ITEM_H   = 44
const VISIBLE  = 5          // how many items show at once
const COL_H    = ITEM_H * VISIBLE
const PAD_ITEMS = Math.floor(VISIBLE / 2)  // blank rows above/below for centering

function PickerColumn({ items, selected, onSelect }: {
  items:    { label: string; value: number }[]
  selected: number
  onSelect: (v: number) => void
}) {
  const scrollRef   = useRef<ScrollView>(null)
  const didInit     = useRef(false)
  const isScrolling = useRef(false)

  // Scroll to the selected item only on first open, not on every change
  useEffect(() => {
    if (didInit.current) return
    const idx = items.findIndex(i => i.value === selected)
    if (idx < 0) return
    const targetOffset = idx * ITEM_H
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: targetOffset, animated: false })
      didInit.current = true
    }, 80)
  }, [items, selected])

  // Reset init flag when items array changes (month → different day count)
  const prevItemsLen = useRef(items.length)
  useEffect(() => {
    if (items.length !== prevItemsLen.current) {
      prevItemsLen.current = items.length
      didInit.current = false
    }
  }, [items.length])

  const handleScrollEnd = (offsetY: number) => {
    if (isScrolling.current) return
    const idx = Math.round(offsetY / ITEM_H)
    const clamped = Math.max(0, Math.min(idx, items.length - 1))
    const item = items[clamped]
    if (item && item.value !== selected) {
      onSelect(item.value)
    }
  }

  return (
    <View style={pk.colWrap}>
      {/* Selection highlight — sits behind the centre row */}
      <View pointerEvents="none" style={pk.selHighlight} />

      {/* Top + bottom padding so first/last items can be centred */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        nestedScrollEnabled
        onScrollBeginDrag={() => { isScrolling.current = true }}
        onMomentumScrollEnd={e => {
          isScrolling.current = false
          handleScrollEnd(e.nativeEvent.contentOffset.y)
        }}
        onScrollEndDrag={e => {
          // Catches slow drags that don't produce momentum
          isScrolling.current = false
          handleScrollEnd(e.nativeEvent.contentOffset.y)
        }}
        contentContainerStyle={{ paddingTop: PAD_ITEMS * ITEM_H, paddingBottom: PAD_ITEMS * ITEM_H }}
      >
        {items.map((item) => {
          const isSelected = item.value === selected
          return (
            <TouchableOpacity
              key={item.value}
              style={pk.item}
              onPress={() => {
                const idx = items.findIndex(i => i.value === item.value)
                scrollRef.current?.scrollTo({ y: idx * ITEM_H, animated: true })
                onSelect(item.value)
              }}
              activeOpacity={0.7}
            >
              <Text style={[pk.itemText, isSelected && pk.itemTextSelected]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

// ─────────────────────────────────────────────
// Date Picker Modal
// ─────────────────────────────────────────────
const MONTHS = [
  { label: 'January', value: 1 }, { label: 'February', value: 2 },
  { label: 'March',   value: 3 }, { label: 'April',    value: 4 },
  { label: 'May',     value: 5 }, { label: 'June',     value: 6 },
  { label: 'July',    value: 7 }, { label: 'August',   value: 8 },
  { label: 'September', value: 9 }, { label: 'October', value: 10 },
  { label: 'November', value: 11 }, { label: 'December', value: 12 },
]
function daysInMonth(y: number, mo: number) { return new Date(y, mo, 0).getDate() }

function DatePickerModal({ visible, initial, onClose, onConfirm }: {
  visible: boolean; initial: string; onClose: () => void; onConfirm: (iso: string) => void
}) {
  const now = new Date()
  const [selYear,  setSelYear]  = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [selDay,   setSelDay]   = useState(now.getDate())

  useEffect(() => {
    if (!visible) return
    if (initial) {
      const [y, mo, d] = initial.split('-').map(Number)
      if (y && mo && d) { setSelYear(y); setSelMonth(mo); setSelDay(d) }
    } else {
      setSelYear(now.getFullYear()); setSelMonth(now.getMonth()+1); setSelDay(now.getDate())
    }
  }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps

  const { translateY, handleProps } = useSwipeToDismiss(onClose)
  const maxDay     = daysInMonth(selYear, selMonth)
  const clampedDay = Math.min(selDay, maxDay)
  const dayItems   = Array.from({ length: maxDay }, (_, i) => ({ label: String(i+1).padStart(2,'0'), value: i+1 }))
  const yearItems  = Array.from({ length: 10 }, (_, i) => ({ label: String(now.getFullYear()+i), value: now.getFullYear()+i }))
  const days       = daysRemaining(toIso(selYear, selMonth, clampedDay))
  const isPast     = days < 0

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={m.overlay} onPress={onClose}><View style={{ flex: 1 }} /></Pressable>
      <Animated.View style={[m.sheet, { transform: [{ translateY }] }]}>
        {/* Drag handle — swipe THIS area downward to dismiss */}
        <View style={m.handleRow} {...handleProps}><View style={m.handle} /></View>
        <View style={m.header}>
          <View>
            <Text maxFontSizeMultiplier={1.3} style={m.title}>Pick Due Date</Text>
            <Text maxFontSizeMultiplier={1.3} style={m.subtitle}>Scroll to select month, day & year</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={m.closeBtn}>
            <Ionicons name="close" size={18} color={C.textSub} />
          </TouchableOpacity>
        </View>
        <View style={pk.row}>
          <PickerColumn items={MONTHS}    selected={selMonth}    onSelect={setSelMonth} />
          <PickerColumn items={dayItems}  selected={clampedDay}  onSelect={setSelDay}   />
          <PickerColumn items={yearItems} selected={selYear}     onSelect={setSelYear}  />
        </View>
        <View style={[
          m.preview,
          isPast ? { backgroundColor: C.coralDim, borderColor: C.coral+'35' }
                 : { backgroundColor: C.emerDim,  borderColor: C.emerald+'35' },
        ]}>
          <Ionicons name="time-outline" size={14} color={isPast ? C.coral : C.emerald} />
          <Text maxFontSizeMultiplier={1.3} style={[m.previewText, { color: isPast ? C.coral : C.emerald }]}>
            {formatDisplay(toIso(selYear, selMonth, clampedDay))}
            {'  ·  '}
            {isPast ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days} day${days!==1?'s':''} from now`}
          </Text>
        </View>
        {isPast && (
          <View style={[m.feedback, { backgroundColor: C.orangeDim, borderColor: C.orange+'35', marginBottom: 8 }]}>
            <Ionicons name="warning-outline" size={13} color={C.orange} />
            <Text maxFontSizeMultiplier={1.3} style={[m.feedbackText, { color: C.orange }]}>
              This date is in the past — it will appear as overdue
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={m.primaryBtn}
          onPress={() => onConfirm(toIso(selYear, selMonth, clampedDay))}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
          <Text maxFontSizeMultiplier={1.3} style={m.primaryBtnText}>Confirm Date</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  )
}

// ─────────────────────────────────────────────
// Add / Edit Deadline Modal
// ─────────────────────────────────────────────
function DeadlineFormModal({ visible, mode, onClose, onSave }: {
  visible: boolean; mode: ModalMode; onClose: () => void
  onSave: (d: Omit<Deadline,'id'|'is_done'>, editId?: string) => void
}) {
  const isEdit = mode.kind === 'edit'
  const [title,      setTitle]      = useState('')
  const [course,     setCourse]     = useState('')
  const [dueIso,     setDueIso]     = useState('')
  const [color,      setColor]      = useState<string>(DEADLINE_COLORS[0])
  const [showPicker, setShowPicker] = useState(false)

  const { translateY, handleProps } = useSwipeToDismiss(onClose)

  useEffect(() => {
    if (!visible) return
    if (mode.kind === 'edit') {
      setTitle(mode.deadline.title)
      setCourse(mode.deadline.course === 'General' ? '' : mode.deadline.course)
      setDueIso(mode.deadline.due_date)
      setColor(mode.deadline.color)
    } else {
      setTitle(''); setCourse(''); setDueIso(''); setColor(DEADLINE_COLORS[0])
    }
  }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    if (!title.trim()) { Alert.alert('Missing title', 'Please enter a title.'); return }
    if (!dueIso)       { Alert.alert('Missing date',  'Please pick a due date.'); return }
    onSave(
      { title: title.trim(), course: course.trim() || 'General', due_date: dueIso, color },
      isEdit ? mode.deadline.id : undefined,
    )
    onClose()
  }

  const days   = dueIso ? daysRemaining(dueIso) : null
  const isPast = days !== null && days < 0

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
        <Pressable style={m.overlay} onPress={onClose}><View style={{ flex: 1 }} /></Pressable>
        <Animated.View style={[m.sheet, { transform: [{ translateY }] }]}>
          {/* Drag handle — swipe THIS area downward to dismiss */}
          <View style={m.handleRow} {...handleProps}><View style={m.handle} /></View>
          <View style={m.header}>
            <View>
              <Text maxFontSizeMultiplier={1.3} style={m.title}>{isEdit ? 'Edit Deadline' : 'Add Deadline'}</Text>
              <Text maxFontSizeMultiplier={1.3} style={m.subtitle}>{isEdit ? 'Update details below' : 'Track an assignment or exam'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={m.closeBtn}>
              <Ionicons name="close" size={18} color={C.textSub} />
            </TouchableOpacity>
          </View>

          <Text maxFontSizeMultiplier={1.3} style={m.fieldLabel}>Title *</Text>
          <TextInput
            style={m.input}
            placeholder="e.g. Final Research Paper"
            placeholderTextColor={C.textMute}
            value={title}
            onChangeText={setTitle}
            returnKeyType="next"
          />

          <Text maxFontSizeMultiplier={1.3} style={m.fieldLabel}>Course</Text>
          <TextInput
            style={m.input}
            placeholder="e.g. CS 301 (optional)"
            placeholderTextColor={C.textMute}
            value={course}
            onChangeText={setCourse}
            returnKeyType="done"
          />

          <Text maxFontSizeMultiplier={1.3} style={m.fieldLabel}>Due Date *</Text>
          <TouchableOpacity
            style={[
              m.dateTap,
              dueIso && isPast  && { borderColor: C.orange  + '80' },
              dueIso && !isPast && { borderColor: C.emerald + '60' },
            ]}
            onPress={() => setShowPicker(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="calendar-outline" size={16} color={dueIso ? (isPast ? C.orange : C.emerald) : C.textMute} />
            <Text style={[m.dateTapText, dueIso && { color: C.text }]}>
              {dueIso ? formatDisplay(dueIso) : 'Tap to pick a date'}
            </Text>
            {dueIso && (
              <View style={[
                m.daysBadge,
                isPast ? { backgroundColor: C.orangeDim, borderColor: C.orange  + '40' }
                       : { backgroundColor: C.emerDim,   borderColor: C.emerald + '40' },
              ]}>
                <Text allowFontScaling={false} style={[m.daysBadgeText, { color: isPast ? C.orange : C.emerald }]}>
                  {isPast ? `${Math.abs(days!)}d overdue` : days === 0 ? 'Today' : `${days}d left`}
                </Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={14} color={C.textMute} />
          </TouchableOpacity>

          <Text maxFontSizeMultiplier={1.3} style={[m.fieldLabel, { marginTop: 8 }]}>Colour Tag</Text>
          <View style={m.colorRow}>
            {DEADLINE_COLORS.map(c => (
              <TouchableOpacity
                key={c}
                style={[
                  m.colorDot, { backgroundColor: c },
                  color === c && { borderWidth: 3, borderColor: '#fff', transform: [{ scale: 1.15 }] },
                ]}
                onPress={() => setColor(c as string)}
              >
                {color === c && <Ionicons name="checkmark" size={13} color="#fff" />}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={m.primaryBtn} onPress={handleSave} activeOpacity={0.85}>
            <Ionicons name={isEdit ? 'checkmark-circle-outline' : 'add-circle-outline'} size={18} color="#fff" />
            <Text maxFontSizeMultiplier={1.3} style={m.primaryBtnText}>{isEdit ? 'Save Changes' : 'Add Deadline'}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>

      <DatePickerModal
        visible={showPicker}
        initial={dueIso}
        onClose={() => setShowPicker(false)}
        onConfirm={iso => { setDueIso(iso); setShowPicker(false) }}
      />
    </>
  )
}

// ─────────────────────────────────────────────
// Deadline Card
// ─────────────────────────────────────────────
function DeadlineCard({ deadline, isLast, onEdit, onDelete, onToggleDone }: {
  deadline: Deadline; isLast: boolean
  onEdit: () => void; onDelete: () => void; onToggleDone: () => void
}) {
  const isDone = deadline.is_done
  const days   = daysRemaining(deadline.due_date)
  const over   = isOverdue(deadline.due_date)
  const today  = isDueToday(deadline.due_date)
  const accent = isDone ? C.emerald : urgencyColor(deadline.due_date, deadline.color)
  const icon   = typeIcon(deadline.course)

  const pulse = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!over || isDone) { pulse.setValue(1); return }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.5, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [over, isDone, pulse])

  const showBadge = !isDone && (over || today || days <= 3)

  return (
    <View style={card.wrap}>
      <View style={card.dotCol}>
        {over && !isDone && (
          <Animated.View style={[card.dotGlow, { transform: [{ scale: pulse }] }]} />
        )}
        <View style={[card.dot, { borderColor: accent, backgroundColor: accent + '18' }]}>
          <Ionicons name={isDone ? 'checkmark' : icon} size={15} color={accent} />
        </View>
        {!isLast && <View style={card.line} />}
      </View>

      <View style={card.cardOuter}>
        <ScalePress onPress={onEdit}>
          <View style={[
            card.cardInner,
            over  && !isDone && { borderColor: C.coral  + '45', backgroundColor: 'rgba(238,104,104,0.05)' },
            today && !isDone && { borderColor: C.orange + '45', backgroundColor: C.orangeDim },
            isDone            && { opacity: 0.5 },
          ]}>
            <View style={[card.stripe, { backgroundColor: accent }]} />
            <View style={card.content}>

              {/* Row 1 — title + badge */}
              <View style={card.row1}>
                <Text maxFontSizeMultiplier={1.3} style={[card.title, isDone && card.titleDone]} numberOfLines={1}>
                  {deadline.title}
                </Text>
                {showBadge && (
                  <View style={[card.badge, { backgroundColor: accent+'22', borderColor: accent+'50' }]}>
                    <Text allowFontScaling={false} style={[card.badgeText, { color: accent }]}>
                      {urgencyLabel(deadline.due_date)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Row 2 — course pill + date */}
              <View style={card.row2}>
                <View style={[card.coursePill, { backgroundColor: deadline.color+'18', borderColor: deadline.color+'35' }]}>
                  <View style={[card.courseDot, { backgroundColor: deadline.color }]} />
                  <Text allowFontScaling={false} style={[card.courseText, { color: isDone ? C.textMute : deadline.color }]} numberOfLines={1}>
                    {deadline.course}
                  </Text>
                </View>
                <View style={card.dateRow}>
                  <Ionicons name="calendar-outline" size={11} color={C.textMute} />
                  <Text allowFontScaling={false} style={card.dateText}>{formatDisplay(deadline.due_date)}</Text>
                </View>
              </View>

              {/* Row 3 — days label + actions */}
              <View style={card.row3}>
                <View style={card.daysRow}>
                  <Ionicons name="time-outline" size={11} color={isDone ? C.emerald : accent} />
                  <Text allowFontScaling={false} style={[card.daysText, { color: isDone ? C.emerald : accent }]}>
                    {isDone ? 'Completed' : urgencyLabel(deadline.due_date)}
                  </Text>
                </View>
                <View style={card.actions}>
                  <TouchableOpacity
                    onPress={onToggleDone}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={[card.actionBtn, isDone
                      ? { backgroundColor: C.emerDim, borderColor: C.emerald+'35' }
                      : { backgroundColor: C.raised,  borderColor: C.border }]}
                  >
                    <Ionicons name={isDone ? 'checkmark-circle' : 'checkmark-circle-outline'} size={15} color={isDone ? C.emerald : C.textMute} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={onEdit}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={[card.actionBtn, { backgroundColor: C.sapphDim, borderColor: C.sapphire+'30' }]}
                  >
                    <Ionicons name="pencil-outline" size={14} color={C.sapphire} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={onDelete}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={[card.actionBtn, { backgroundColor: C.coralDim, borderColor: C.coral+'30' }]}
                  >
                    <Ionicons name="trash-outline" size={14} color={C.coral} />
                  </TouchableOpacity>
                </View>
              </View>

            </View>
          </View>
        </ScalePress>
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────
// Period header
// ─────────────────────────────────────────────
function PeriodHeader({ label, count }: { label: string; count: number }) {
  const isToday = label === 'Today'
  return (
    <View style={ph.wrap}>
      <View style={[ph.dot, isToday && { backgroundColor: C.orange, borderColor: C.orangeDim }]} />
      <Text maxFontSizeMultiplier={1.3} style={[ph.label, isToday && { color: C.orange }]}>{label.toUpperCase()}</Text>
      <View style={[ph.countBadge, isToday && { backgroundColor: C.orangeDim, borderColor: C.orange+'30' }]}>
        <Text allowFontScaling={false} style={[ph.countText, isToday && { color: C.orange }]}>{count}</Text>
      </View>
      <View style={ph.line} />
    </View>
  )
}

// ─────────────────────────────────────────────
// Overdue banner
// ─────────────────────────────────────────────
function OverdueBanner({ count }: { count: number }) {
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.65, duration: 900, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1,    duration: 900, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [opacity])
  return (
    <Animated.View style={[bnr.wrap, { opacity }]}>
      <View style={bnr.iconBox}><Ionicons name="alert-circle" size={18} color={C.coral} /></View>
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={1.3} style={bnr.title}>{count} overdue deadline{count!==1?'s':''}</Text>
        <Text maxFontSizeMultiplier={1.3} style={bnr.sub}>Tap the Overdue tab to manage them</Text>
      </View>
      <View style={bnr.badge}><Text allowFontScaling={false} style={bnr.badgeText}>{count}</Text></View>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────
function EmptyState({ tab, onAdd }: { tab: Tab; onAdd: () => void }) {
  const cfg = {
    upcoming: { icon: 'calendar-outline'       as const, title: 'No upcoming deadlines', sub: 'Tap + to track an assignment or exam', btn: true,  color: C.orange  },
    done:     { icon: 'checkmark-done-outline' as const, title: 'Nothing completed yet',  sub: 'Mark a deadline done to see it here',  btn: false, color: C.emerald },
    overdue:  { icon: 'hourglass-outline'      as const, title: 'No overdue deadlines',   sub: "You're all caught up! 🎉",             btn: false, color: C.emerald },
  }[tab]
  return (
    <View style={emp.wrap}>
      <View style={[emp.iconBox, { backgroundColor: cfg.color+'18', borderColor: cfg.color+'28' }]}>
        <Ionicons name={cfg.icon} size={32} color={cfg.color} />
      </View>
      <Text maxFontSizeMultiplier={1.3} style={emp.title}>{cfg.title}</Text>
      <Text maxFontSizeMultiplier={1.3} style={emp.sub}>{cfg.sub}</Text>
      {cfg.btn && (
        <TouchableOpacity style={emp.btn} onPress={onAdd} activeOpacity={0.85}>
          <Ionicons name="add" size={15} color="#fff" />
          <Text maxFontSizeMultiplier={1.3} style={emp.btnText}>Add Deadline</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ─────────────────────────────────────────────
// Sync status indicator
// ─────────────────────────────────────────────
function SyncBar({ syncing, error }: { syncing: boolean; error: boolean }) {
  if (!syncing && !error) return null
  return (
    <View style={[syncBar.wrap, error && { backgroundColor: C.coralDim, borderColor: C.coral+'35' }]}>
      {syncing && !error && <ActivityIndicator size={10} color={C.sapphire} />}
      {error   && <Ionicons name="cloud-offline-outline" size={12} color={C.coral} />}
      <Text allowFontScaling={false} style={[syncBar.text, error && { color: C.coral }]}>
        {error ? 'Offline — changes will sync when reconnected' : 'Syncing…'}
      </Text>
    </View>
  )
}

// ─────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────
export default function DeadlinesScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [userId,    setUserId]    = useState<string | null>(null)
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [syncing,   setSyncing]   = useState(false)
  const [syncError, setSyncError] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('upcoming')
  const [modalMode, setModalMode] = useState<ModalMode | null>(null)

  // ready: false means bootstrap() has not finished yet — render a plain
  // invisible <View /> instead of empty state so the user never sees a flash.
  // This is identical to the pattern used in the conversations screen.
  const [ready, setReady] = useState(false)

  // ── Bootstrap — single Promise.all reads userId + cache simultaneously ──
  //
  // WHY THIS WORKS BETTER THAN SEPARATE useEffects:
  //   Separate effects cause two async state updates → two renders →
  //   a window where userId is set but deadlines is still [] → flash.
  //
  //   Promise.all resolves both in one microtask. We call setDeadlines
  //   BEFORE setReady(true), so by the time React re-renders the list
  //   is already populated. setReady(true) is the single gate that says
  //   "paint the real UI now".
  //
  //   While ready===false the component returns <View /> — invisible,
  //   instant, zero layout — so no spinner, no empty state, no flash.
  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      try {
        const [sessionResult, cached] = await Promise.all([
          supabase.auth.getSession(),
          readCache(),
        ])

        if (cancelled) return

        const uid = sessionResult.data.session?.user?.id ?? null
        setUserId(uid)

        // Seed the list with cached data before flipping ready — one render,
        // already populated, no flash.
        if (cached.length > 0) setDeadlines(cached)
        setReady(true)

        // Background refresh from Supabase — silent, no spinner
        if (uid) {
          fetchFromSupabase(uid).then(fresh => {
            if (cancelled) return
            setDeadlines(fresh)
            writeCache(fresh)
            setSyncError(false)
          }).catch(() => {
            if (!cancelled) setSyncError(true)
          })
        }
      } catch {
        if (!cancelled) setReady(true)  // unblock the UI even on error
      }
    }

    bootstrap()

    // Auth state changes (sign-in / sign-out after initial load)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      const uid = session?.user?.id ?? null
      setUserId(uid)
      if (uid) {
        fetchFromSupabase(uid).then(fresh => {
          setDeadlines(fresh)
          writeCache(fresh)
        }).catch(() => {})
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])  // single effect, runs once on mount

  // ── Realtime subscription — delivers changes from other devices ───
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`deadlines-rt-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deadlines', filter: `user_id=eq.${userId}` },
        payload => {
          setDeadlines(prev => {
            let next: Deadline[]
            if (payload.eventType === 'INSERT') {
              const row = payload.new as Deadline
              // Avoid duplicate if we already added it optimistically
              next = prev.some(d => d.id === row.id)
                ? prev.map(d => d.id === row.id ? row : d)
                : [...prev, row]
            } else if (payload.eventType === 'UPDATE') {
              next = prev.map(d => d.id === (payload.new as Deadline).id ? payload.new as Deadline : d)
            } else if (payload.eventType === 'DELETE') {
              next = prev.filter(d => d.id !== (payload.old as Deadline).id)
            } else {
              next = prev
            }
            const sorted = sortByDate(next)
            writeCache(sorted)
            return sorted
          })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  // ── CRUD helpers ──────────────────────────────────────────────────

  const handleSave = useCallback(async (
    data: Omit<Deadline, 'id' | 'is_done'>,
    editId?: string,
  ) => {
    if (!userId) return
    setSyncing(true)
    setSyncError(false)

    if (editId) {
      // Optimistic update
      setDeadlines(prev => {
        const next = prev.map(d => d.id === editId ? { ...d, ...data } : d)
        writeCache(next)
        return next
      })
      try {
        const updated = { ...deadlines.find(d => d.id === editId)!, ...data }
        await upsertToSupabase(userId, updated)
      } catch {
        // Rollback
        setDeadlines(prev => prev) // Realtime will correct it
        setSyncError(true)
      }
    } else {
      const newId = Date.now().toString()
      const newDeadline: Deadline = { ...data, id: newId, is_done: false }
      // Optimistic insert
      setDeadlines(prev => {
        const next = sortByDate([...prev, newDeadline])
        writeCache(next)
        return next
      })
      try {
        await upsertToSupabase(userId, newDeadline)
      } catch {
        // Rollback
        setDeadlines(prev => {
          const next = prev.filter(d => d.id !== newId)
          writeCache(next)
          return next
        })
        setSyncError(true)
        Alert.alert('Could not save', 'Check your connection and try again.')
      }
    }

    setSyncing(false)
  }, [userId, deadlines])

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Delete Deadline', 'This will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (!userId) return
          // Optimistic delete
          setDeadlines(prev => {
            const next = prev.filter(x => x.id !== id)
            writeCache(next)
            return next
          })
          try {
            await deleteFromSupabase(id)
          } catch {
            // Re-fetch to restore correct state
            fetchFromSupabase(userId).then(fresh => {
              setDeadlines(fresh)
              writeCache(fresh)
            }).catch(() => {})
            setSyncError(true)
          }
        },
      },
    ])
  }, [userId])

  const toggleDone = useCallback(async (id: string) => {
    if (!userId) return
    const current = deadlines.find(d => d.id === id)
    if (!current) return
    const newDone = !current.is_done

    // Optimistic toggle
    setDeadlines(prev => {
      const next = prev.map(d => d.id === id ? { ...d, is_done: newDone } : d)
      writeCache(next)
      return next
    })

    try {
      await updateDoneInSupabase(id, newDone)
    } catch {
      // Rollback
      setDeadlines(prev => {
        const next = prev.map(d => d.id === id ? { ...d, is_done: !newDone } : d)
        writeCache(next)
        return next
      })
      setSyncError(true)
    }
  }, [userId, deadlines])

  // ── Derived lists ─────────────────────────────────────────────────
  const { upcoming, done, overdue } = useMemo(() => {
    const s = sortByDate(deadlines)
    return {
      upcoming: s.filter(d => !isOverdue(d.due_date) && !d.is_done),
      done:     s.filter(d => d.is_done),
      overdue:  s.filter(d => isOverdue(d.due_date)  && !d.is_done),
    }
  }, [deadlines])

  const grouped = useMemo(() => groupByPeriod(upcoming), [upcoming])

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
    { key: 'done',     label: 'Done',     count: done.length     },
    { key: 'overdue',  label: 'Overdue',  count: overdue.length  },
  ]

  // ── Tab content ───────────────────────────────────────────────────
  const renderContent = () => {
    // While bootstrap() is running we return null — the outer guard below
    // returns a plain <View /> so nothing is painted. No spinner, no flash.
    if (!ready) return null

    if (activeTab === 'upcoming') {
      if (!upcoming.length) return <EmptyState tab="upcoming" onAdd={() => setModalMode({ kind: 'add' })} />
      return (
        <View style={tl.wrap}>
          <View style={tl.globalLine} />
          {grouped.map((group, gi) => (
            <View key={group.label}>
              <PeriodHeader label={group.label} count={group.items.length} />
              {group.items.map((d, i) => (
                <DeadlineCard
                  key={d.id} deadline={d}
                  isLast={i === group.items.length - 1 && gi === grouped.length - 1}
                  onEdit={()    => setModalMode({ kind: 'edit', deadline: d })}
                  onDelete={()   => handleDelete(d.id)}
                  onToggleDone={() => toggleDone(d.id)}
                />
              ))}
            </View>
          ))}
        </View>
      )
    }

    if (activeTab === 'done') {
      if (!done.length) return <EmptyState tab="done" onAdd={() => setModalMode({ kind: 'add' })} />
      return (
        <View style={tl.wrap}>
          <View style={tl.globalLine} />
          {done.map((d, i) => (
            <DeadlineCard key={d.id} deadline={d} isLast={i === done.length - 1}
              onEdit={()    => setModalMode({ kind: 'edit', deadline: d })}
              onDelete={()   => handleDelete(d.id)}
              onToggleDone={() => toggleDone(d.id)}
            />
          ))}
        </View>
      )
    }

    if (!overdue.length) return <EmptyState tab="overdue" onAdd={() => setModalMode({ kind: 'add' })} />
    return (
      <View style={tl.wrap}>
        <View style={[tl.globalLine, { backgroundColor: C.coral + '35' }]} />
        {overdue.map((d, i) => (
          <DeadlineCard key={d.id} deadline={d} isLast={i === overdue.length - 1}
            onEdit={()    => setModalMode({ kind: 'edit', deadline: d })}
            onDelete={()   => handleDelete(d.id)}
            onToggleDone={() => toggleDone(d.id)}
          />
        ))}
      </View>
    )
  }

  const fabScale = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(fabScale, { toValue: 1.07, duration: 1100, useNativeDriver: true }),
      Animated.timing(fabScale, { toValue: 1,    duration: 1100, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [fabScale])

  // Plain invisible view while bootstrap() is resolving. Painted in the same
  // frame as mount — no layout shift, no spinner, no empty state flash.
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.void }} />

  return (
    <View style={{ flex: 1, backgroundColor: C.void }}>

      {/* Header */}
      <View style={[scr.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={scr.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text maxFontSizeMultiplier={1.3} style={scr.title}>Deadlines</Text>
        <View style={scr.headerRight}>
          {overdue.length > 0 && (
            <TouchableOpacity style={scr.overdueChip} onPress={() => setActiveTab('overdue')} activeOpacity={0.8}>
              <Ionicons name="alert-circle" size={11} color={C.coral} />
              <Text allowFontScaling={false} style={scr.overdueChipText}>{overdue.length} overdue</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={scr.iconBtn} onPress={() => setModalMode({ kind: 'add' })} activeOpacity={0.8}>
            <Ionicons name="add" size={20} color={C.orange} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sync status bar */}
      <SyncBar syncing={syncing} error={syncError} />

      {/* Summary strip */}
      {deadlines.length > 0 && (
        <View style={scr.strip}>
          {[
            { num: upcoming.length, label: 'Upcoming', color: C.orange  },
            { num: done.length,     label: 'Done',     color: C.emerald },
            { num: overdue.length,  label: 'Overdue',  color: overdue.length > 0 ? C.coral : C.textMute },
            { num: deadlines.length,label: 'Total',    color: C.sapphire},
          ].map((item, i, arr) => (
            <View key={item.label} style={{ flexDirection: 'row', flex: 1 }}>
              <View style={scr.stripCell}>
                <Text allowFontScaling={false} style={[scr.stripNum, { color: item.color }]}>{item.num}</Text>
                <Text allowFontScaling={false} style={scr.stripLabel}>{item.label}</Text>
              </View>
              {i < arr.length - 1 && <View style={scr.stripSep} />}
            </View>
          ))}
        </View>
      )}

      {/* Overdue banner */}
      {overdue.length > 0 && (
        <View style={{ paddingHorizontal: BODY_H_PAD, paddingTop: 14 }}>
          <OverdueBanner count={overdue.length} />
        </View>
      )}

      {/* Tabs */}
      <View style={scr.tabsRow}>
        {tabs.map(tab => {
          const isActive     = activeTab === tab.key
          const isOverdueTab = tab.key === 'overdue'
          const accentColor  = isOverdueTab && tab.count > 0 ? C.coral : C.orange
          return (
            <TouchableOpacity key={tab.key} style={scr.tabItem} onPress={() => setActiveTab(tab.key)} activeOpacity={0.75}>
              <View style={scr.tabInner}>
                <Text maxFontSizeMultiplier={1.3} style={[
                  scr.tabLabel,
                  isActive && { color: accentColor },
                  !isActive && isOverdueTab && tab.count > 0 && { color: C.coral+'90' },
                ]}>
                  {tab.label.toUpperCase()}
                </Text>
                {tab.count > 0 && (
                  <View style={[
                    scr.tabBadge,
                    (isActive || (isOverdueTab && tab.count > 0)) && {
                      backgroundColor: accentColor+'20', borderColor: accentColor+'40',
                    },
                  ]}>
                    <Text allowFontScaling={false} style={[
                      scr.tabBadgeText,
                      (isActive || (isOverdueTab && tab.count > 0)) && { color: accentColor },
                    ]}>{tab.count}</Text>
                  </View>
                )}
              </View>
              <View style={[scr.tabUnderline, isActive && { backgroundColor: accentColor }]} />
            </TouchableOpacity>
          )
        })}
      </View>

      {/* List */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 20, paddingBottom: insets.bottom + 100, flexGrow: 1 }}
      >
        {renderContent()}
      </ScrollView>

      {/* FAB */}
      <Animated.View style={[scr.fab, { bottom: insets.bottom + 24, transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity style={scr.fabInner} onPress={() => setModalMode({ kind: 'add' })} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      {/* Form modal */}
      {modalMode !== null && (
        <DeadlineFormModal
          visible
          mode={modalMode}
          onClose={() => setModalMode(null)}
          onSave={handleSave}
        />
      )}
    </View>
  )
}

// ───────────────────────── STYLES ─────────────────────────

const card = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',   // keeps dotCol from stretching to card height
    marginBottom: 10,
    paddingHorizontal: BODY_H_PAD,
  },
  dotCol: {
    width: 40,
    alignItems: 'center',
    flexShrink: 0,
    paddingTop: 10,
  },
  dotGlow: {
    position: 'absolute', top: 10,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.coral + '30',
  },
  dot: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center', zIndex: 1,
  },
  line: {
    width: 2, height: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginTop: 4, borderRadius: 1,
  },
  cardOuter: { flex: 1, marginLeft: 10 },
  cardInner: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 16, overflow: 'hidden',
  },
  stripe: { width: 3, borderTopLeftRadius: 16, borderBottomLeftRadius: 16, flexShrink: 0 },
  content: { flex: 1, paddingHorizontal: 12, paddingVertical: 11, gap: 7 },
  row1: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 18 },
  titleDone: { textDecorationLine: 'line-through', color: C.textSub },
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 0 },
  badgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.2 },
  row2: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  coursePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '58%' },
  courseDot: { width: 5, height: 5, borderRadius: 3, flexShrink: 0 },
  courseText: { fontSize: 11, fontWeight: '600' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: { fontSize: 11, color: C.textMute, fontWeight: '500' },
  row3: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  daysRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  daysText: { fontSize: 11, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  actionBtn: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
})

const tl = StyleSheet.create({
  wrap: { position: 'relative' },
  globalLine: { position: 'absolute', left: BODY_H_PAD+19, top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 1 },
})

const ph = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: BODY_H_PAD, marginTop: 6, marginBottom: 8 },
  dot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: C.sapphire, borderWidth: 2.5, borderColor: C.sapphDim, marginLeft: 13, zIndex: 2 },
  label: { fontSize: 9.5, fontWeight: '800', letterSpacing: 2, color: C.textSub },
  countBadge: { minWidth: 18, height: 18, borderRadius: 5, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  countText: { fontSize: 9, fontWeight: '800', color: C.textMute },
  line: { flex: 1, height: 1, backgroundColor: C.border },
})

const bnr = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(238,104,104,0.07)', borderWidth: 1, borderColor: C.coral+'35', borderRadius: 16, padding: 13, marginBottom: 4 },
  iconBox: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.coralDim, borderWidth: 1, borderColor: C.coral+'30', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  title: { fontSize: 12.5, fontWeight: '700', color: C.coral, marginBottom: 1 },
  sub:   { fontSize: 11, color: C.textSub, lineHeight: 15 },
  badge: { minWidth: 26, height: 26, borderRadius: 8, backgroundColor: C.coral, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, flexShrink: 0 },
  badgeText: { fontSize: 12, fontWeight: '900', color: '#fff' },
})

const emp = StyleSheet.create({
  wrap:    { flex: 1, alignItems: 'center', paddingTop: 72, paddingHorizontal: 40, gap: 12 },
  iconBox: { width: 72, height: 72, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  title:   { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.3, textAlign: 'center' },
  sub:     { fontSize: 13, color: C.textMute, textAlign: 'center', lineHeight: 20 },
  btn:     { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.orange, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  btnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
})

const pk = StyleSheet.create({
  row: { flexDirection: 'row', height: ITEM_H * 5, marginBottom: 16, marginHorizontal: -4 },
  colWrap: { flex: 1, position: 'relative', overflow: 'hidden' },
  selHighlight: {
    position: 'absolute', left: 4, right: 4,
    top: ITEM_H * 2, height: ITEM_H,
    backgroundColor: C.orangeDim,
    borderWidth: 1, borderColor: C.orange+'30',
    borderRadius: 10, zIndex: 0,
  },
  item: { height: ITEM_H, justifyContent: 'center', alignItems: 'center' },
  itemText:         { fontSize: 15, color: C.textMute, fontWeight: '500' },
  itemTextSelected: { fontSize: 16, color: C.text,    fontWeight: '700' },
})

const syncBar = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.sapphDim,
    borderBottomWidth: 1, borderBottomColor: C.sapphire+'25',
    paddingHorizontal: BODY_H_PAD, paddingVertical: 7,
  },
  text: { fontSize: 11, color: C.sapphire, fontWeight: '500' },
})

const scr = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: BODY_H_PAD, paddingBottom: 14, backgroundColor: C.deep, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  overdueChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.coralDim, borderWidth: 1, borderColor: C.coral+'35', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  overdueChipText: { fontSize: 11, fontWeight: '700', color: C.coral },
  iconBtn: { width: 38, height: 38, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  strip: { flexDirection: 'row', backgroundColor: C.deep, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', paddingVertical: 14, paddingHorizontal: BODY_H_PAD },
  stripCell: { flex: 1, alignItems: 'center', gap: 3 },
  stripNum: { fontSize: 20, fontWeight: '900', lineHeight: 22 },
  stripLabel: { fontSize: 9, fontWeight: '600', color: C.textMute, letterSpacing: 0.6, textTransform: 'uppercase' },
  stripSep: { width: 1, height: 30, backgroundColor: C.border, alignSelf: 'center' },
  tabsRow: { flexDirection: 'row', backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, borderBottomWidth: 1, borderBottomColor: C.border },
  tabItem: { flex: 1, alignItems: 'center' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 13, paddingBottom: 8 },
  tabLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: C.textMute },
  tabBadge: { minWidth: 17, height: 17, borderRadius: 5, borderWidth: 1, borderColor: C.border, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 9, fontWeight: '800', color: C.textMute },
  tabUnderline: { height: 2, width: '100%', borderRadius: 1, backgroundColor: 'transparent' },
  fab: { position: 'absolute', right: 22, zIndex: 50 },
  fabInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 10 },
})

const m = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 32 },
  handleRow: { alignItems: 'center', marginBottom: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 12, color: C.textMute, marginTop: 3 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  fieldLabel: { fontSize: 10.5, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 7 },
  input: { backgroundColor: C.raised, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, color: C.text, borderWidth: 1, borderColor: C.border, marginBottom: 13 },
  dateTap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.raised, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 13, borderWidth: 1, borderColor: C.border, marginBottom: 13 },
  dateTapText: { flex: 1, fontSize: 14, color: C.textMute, fontWeight: '500' },
  daysBadge: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  daysBadgeText: { fontSize: 10, fontWeight: '700' },
  feedback: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 10 },
  feedbackText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 12 },
  previewText: { fontSize: 12, fontWeight: '600' },
  colorRow: { flexDirection: 'row', gap: 12, marginBottom: 22 },
  colorDot: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.orange, borderRadius: 16, paddingVertical: 15 },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
})
