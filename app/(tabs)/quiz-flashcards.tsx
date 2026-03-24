/**
 * app/(tabs)/quiz-flashcards.tsx
 *
 * AI Quiz & Flashcard Generator — Premium Feature
 * Redesigned to match index.tsx dark editorial theme.
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { supabase } from '../../lib/supabase'
import { usePremium } from '../../contexts/PremiumContext'
import React from 'react'
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// ─────────────────────────────────────────────
// Design Tokens — exact copy from index.tsx
// ─────────────────────────────────────────────
const C = {
  void:      '#07080C',
  deep:      '#0B0D13',
  surface:   '#10131C',
  raised:    '#161B27',
  lift2:     '#1C2232',
  border:    'rgba(255,255,255,0.055)',
  borderHi:  'rgba(255,255,255,0.10)',
  text:      '#EEF0F8',
  textSub:   '#6E7A96',
  textMute:  '#353D52',
  orange:    '#E8692A',
  orange2:   '#F07840',
  orangeDim: 'rgba(232,105,42,0.10)',
  orangeGlow:'rgba(232,105,42,0.18)',
  gold:      '#DFA83C',
  goldDim:   'rgba(223,168,60,0.10)',
  goldGlow:  '#B8841E',
  sapphire:  '#4B8CF5',
  sapphDim:  'rgba(75,140,245,0.10)',
  sapphGlow: '#2D5AB8',
  emerald:   '#3DC99A',
  emerDim:   'rgba(61,201,154,0.10)',
  lavender:  '#9B7CF4',
  lavDim:    'rgba(155,124,244,0.10)',
  coral:     '#EE6868',
  coralDim:  'rgba(238,104,104,0.10)',
  silver:    '#C0C8D8',
  silverDim: '#1A1E26',
  bronze:    '#CD7F44',
  bronzeDim: '#221408',
  amber:     '#FBBD34',
  sky:       '#38BDF8',
  skyDim:    'rgba(56,189,248,0.10)',
  pink:      '#E879F9',
  pinkDim:   'rgba(232,121,249,0.10)',
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const GROQ_API   = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
const TRIES_KEY         = 'studentshare_quiz_tries_used'
const QUIZ_HISTORY_KEY  = 'studentshare_quiz_history'
const SR_DATA_KEY       = 'studentshare_sr_data'
const ANALYTICS_KEY     = 'studentshare_analytics'
const STREAK_KEY        = 'studentshare_study_streak'
const FREE_TRIES        = 5
const MAX_SAVED         = 20
const { width: SCREEN_W } = Dimensions.get('window')

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type InputMode    = 'topic' | 'text' | 'pdf'
type ContentType  = 'flashcards' | 'mcq' | 'truefalse' | 'fillin' | 'mixed'
type DiffLevel    = 'easy' | 'medium' | 'hard'
type CardQty      = 10 | 25 | 50
type SRDifficulty = 'easy' | 'medium' | 'hard'

type SRCard = {
  cardId:       string
  interval:     number
  easeFactor:   number
  repetitions:  number
  nextReview:   string
  lastReview:   string
}

type CardStat = {
  cardId:   string
  correct:  number
  wrong:    number
  lastSeen: string
}

type StreakDay = {
  date:      string
  studied:   boolean
  correct:   number
  total:     number
}

type SavedQuiz = {
  id:      string
  title:   string
  type:    ContentType
  items:   any[]
  savedAt: string
  source:  'material' | 'topic' | 'text' | 'pdf' | 'image'
  scoreHistory?: { date: string; pct: number }[]
}

type Flashcard = { front: string; back: string }
type MCQItem   = { question: string; options: string[]; correct: number; explanation: string }
type TFItem    = { statement: string; answer: boolean; explanation: string }
type FillItem  = { sentence: string; answer: string; hint: string }

type GeneratedContent =
  | { type: 'flashcards'; items: Flashcard[] }
  | { type: 'mcq';        items: MCQItem[]   }
  | { type: 'truefalse';  items: TFItem[]    }
  | { type: 'fillin';     items: FillItem[]  }
  | { type: 'mixed';      items: (MCQItem | TFItem | FillItem)[] }

// ─── Mastery levels ──────────────────────────────────────────────────────
const MASTERY_LEVELS = [
  { min: 0,  max: 39,  label: 'Beginner',   color: C.coral,    emoji: '🌱', desc: 'Keep going — every expert started here!'    },
  { min: 40, max: 59,  label: 'Developing', color: C.gold,     emoji: '📚', desc: 'You are building a solid foundation!'       },
  { min: 60, max: 74,  label: 'Competent',  color: C.sapphire, emoji: '⚡', desc: 'Good grasp — push for the next level!'      },
  { min: 75, max: 89,  label: 'Proficient', color: C.lavender, emoji: '🎯', desc: 'Impressive! You clearly know this material.' },
  { min: 90, max: 100, label: 'Master',     color: C.emerald,  emoji: '🏆', desc: 'Outstanding! You have mastered this topic!' },
]
function getMastery(correct: number, total: number) {
  if (total === 0) return MASTERY_LEVELS[0]
  const pct = Math.round((correct / total) * 100)
  return MASTERY_LEVELS.find(l => pct >= l.min && pct <= l.max) ?? MASTERY_LEVELS[0]
}

const CHEER_CORRECT = ['🔥 Nailed it!', '✅ Correct! Keep it up!', '🎉 Excellent!', '💪 You got it!', '⭐ Spot on!', '🚀 Outstanding!']
const CHEER_WRONG   = ["💡 Almost! Review that one.", "📖 Don't worry — mistakes teach!", "🌟 Keep pushing!", "💪 You'll get the next one!", "🔄 Review & try again!"]
function getCheer(correct: boolean, streak: number): string {
  if (correct) {
    if (streak >= 5) return `🔥🔥 On fire! ${streak} in a row!`
    if (streak >= 3) return `⚡ ${streak}-streak! Incredible!`
    return CHEER_CORRECT[Math.floor(Math.random() * CHEER_CORRECT.length)]
  }
  return CHEER_WRONG[Math.floor(Math.random() * CHEER_WRONG.length)]
}

// ─────────────────────────────────────────────
// SM-2 Spaced Repetition
// ─────────────────────────────────────────────
function sm2Update(card: SRCard, difficulty: SRDifficulty): SRCard {
  const q = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 3 : 1
  let { interval, easeFactor, repetitions } = card
  if (q >= 3) {
    if (repetitions === 0)      interval = 1
    else if (repetitions === 1) interval = 6
    else                        interval = Math.round(interval * easeFactor)
    repetitions += 1
  } else {
    repetitions = 0; interval = 1
  }
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + interval)
  return { ...card, interval, easeFactor, repetitions, nextReview: nextReview.toISOString(), lastReview: new Date().toISOString() }
}
function createSRCard(cardId: string): SRCard {
  return { cardId, interval: 1, easeFactor: 2.5, repetitions: 0, nextReview: new Date().toISOString(), lastReview: new Date().toISOString() }
}
function isDueToday(card: SRCard): boolean {
  return new Date(card.nextReview) <= new Date()
}

// ─────────────────────────────────────────────
// Donut Chart — dark-native
// ─────────────────────────────────────────────
function DonutChart({ correct, wrong, total, pct }: { correct: number; wrong: number; total: number; pct: number }) {
  const SIZE = 112, THICKNESS = 16, OUTER = SIZE / 2, INNER = OUTER - THICKNESS
  function Arc({ degrees, color, rotation }: { degrees: number; color: string; rotation: number }) {
    if (degrees <= 0) return null
    const slices: React.ReactElement[] = []
    let remaining = Math.min(degrees, 360), rot = rotation
    while (remaining > 0) {
      const slice = Math.min(remaining, 180)
      slices.push(<View key={rot} style={[donutS.halfClip, { transform: [{ rotate: `${rot}deg` }] }]}><View style={[donutS.halfDisk, { backgroundColor: color, transform: [{ rotate: `${Math.min(slice, 180)}deg` }] }]} /></View>)
      rot += slice; remaining -= slice
    }
    return <>{slices}</>
  }
  const correctDeg = total > 0 ? (correct / total) * 360 : 0
  const wrongDeg   = total > 0 ? (wrong   / total) * 360 : 0
  return (
    <View style={[donutS.container, { width: SIZE, height: SIZE }]}>
      <View style={[donutS.ring, { backgroundColor: C.raised }]} />
      <Arc degrees={correctDeg} color={C.emerald}  rotation={0} />
      <Arc degrees={wrongDeg}   color={C.coral}    rotation={correctDeg} />
      <View style={[donutS.hole, { width: INNER * 2, height: INNER * 2, borderRadius: INNER, backgroundColor: C.surface }]}>
        <Text style={donutS.pctText}>{pct}%</Text>
        <Text style={donutS.pctLabel}>correct</Text>
      </View>
    </View>
  )
}
const donutS = StyleSheet.create({
  container: { position: 'relative', justifyContent: 'center', alignItems: 'center' },
  ring:      { position: 'absolute', width: '100%', height: '100%', borderRadius: 999 },
  halfClip:  { position: 'absolute', width: '100%', height: '100%', overflow: 'hidden' },
  halfDisk:  { position: 'absolute', width: '100%', height: '100%', borderRadius: 999, top: 0, left: 0, transformOrigin: '50% 50%' },
  hole:      { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  pctText:   { fontSize: 18, fontWeight: '800', color: C.text },
  pctLabel:  { fontSize: 10, color: C.textMute, marginTop: -2 },
})

// ─────────────────────────────────────────────
// Sparkline — dark-native
// ─────────────────────────────────────────────
function Sparkline({ data }: { data: { date: string; pct: number }[] }) {
  if (!data || data.length < 2) return (
    <View style={sparkS.empty}><Text style={sparkS.emptyText}>Not enough data yet</Text></View>
  )
  const W = SCREEN_W - 80, H = 48
  const max = Math.max(...data.map(d => d.pct), 100)
  const points = data.map((d, i) => ({ x: (i / (data.length - 1)) * W, y: H - (d.pct / max) * H }))
  return (
    <View style={[sparkS.wrap, { width: W, height: H + 20 }]}>
      {[0, 50, 100].map(pct => (
        <View key={pct} style={[sparkS.guideLine, { bottom: (pct / 100) * H + 10 }]}>
          <Text style={sparkS.guideLabel}>{pct}%</Text>
        </View>
      ))}
      {points.map((p, i) => (
        <View key={i} style={[sparkS.dot, { left: p.x - 4, top: p.y + 6, backgroundColor: data[i].pct >= 75 ? C.emerald : data[i].pct >= 50 ? C.gold : C.coral }]} />
      ))}
      <View style={[sparkS.lastLabel, { left: points[points.length - 1].x - 16, top: points[points.length - 1].y - 8 }]}>
        <Text style={sparkS.lastLabelText}>{data[data.length - 1].pct}%</Text>
      </View>
    </View>
  )
}
const sparkS = StyleSheet.create({
  wrap:          { position: 'relative', marginVertical: 4 },
  guideLine:     { position: 'absolute', left: 28, right: 0, height: 1, backgroundColor: C.border },
  guideLabel:    { position: 'absolute', left: -26, top: -8, fontSize: 9, color: C.textMute, fontWeight: '600' },
  dot:           { position: 'absolute', width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: C.surface },
  lastLabel:     { position: 'absolute', backgroundColor: C.raised, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: C.border },
  lastLabelText: { fontSize: 9, color: C.text, fontWeight: '800' },
  empty:         { padding: 12, alignItems: 'center' },
  emptyText:     { fontSize: 12, color: C.textMute },
})

// ─────────────────────────────────────────────
// Streak Calendar — dark-native
// ─────────────────────────────────────────────
function StreakCalendar({ streakDays }: { streakDays: StreakDay[] }) {
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i))
    const key = d.toISOString().slice(0, 10)
    const found = streakDays.find(s => s.date === key)
    return { date: key, studied: found?.studied ?? false, pct: found ? Math.round((found.correct / Math.max(found.total, 1)) * 100) : 0 }
  })
  const currentStreak = (() => { let s = 0; for (let i = last14.length - 1; i >= 0; i--) { if (last14[i].studied) s++; else break; } return s })()
  return (
    <View style={calS.wrap}>
      <View style={calS.header}>
        <Text style={calS.title}>Study Streak</Text>
        <View style={calS.streakBadge}>
          <Text style={calS.streakFire}>🔥</Text>
          <Text style={calS.streakCount}>{currentStreak} day{currentStreak !== 1 ? 's' : ''}</Text>
        </View>
      </View>
      <View style={calS.grid}>
        {last14.map((day, i) => {
          const isToday = i === 13
          const color = day.studied ? (day.pct >= 75 ? C.emerald : day.pct >= 50 ? C.gold : C.sapphire) : C.raised
          return <View key={day.date} style={[calS.cell, { backgroundColor: color }, isToday && calS.cellToday]}>{isToday && <View style={calS.todayDot} />}</View>
        })}
      </View>
      <View style={calS.legend}>
        {[{ color: C.emerald, label: '≥75%' }, { color: C.gold, label: '≥50%' }, { color: C.sapphire, label: '<50%' }, { color: C.raised, label: 'Not studied' }].map(l => (
          <View key={l.label} style={calS.legendItem}>
            <View style={[calS.legendDot, { backgroundColor: l.color, borderWidth: 1, borderColor: C.border }]} />
            <Text style={calS.legendText}>{l.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
const calS = StyleSheet.create({
  wrap:        { backgroundColor: C.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, gap: 12 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:       { fontSize: 13, fontWeight: '800', color: C.text },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.orangeDim, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: C.orange + '30' },
  streakFire:  { fontSize: 13 },
  streakCount: { fontSize: 12, fontWeight: '800', color: C.orange },
  grid:        { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  cell:        { width: 18, height: 18, borderRadius: 4 },
  cellToday:   { borderWidth: 2, borderColor: C.lavender },
  todayDot:    { position: 'absolute', top: -4, right: -4, width: 5, height: 5, borderRadius: 3, backgroundColor: C.lavender },
  legend:      { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:   { width: 8, height: 8, borderRadius: 2 },
  legendText:  { fontSize: 10, color: C.textMute, fontWeight: '600' },
})

// ─────────────────────────────────────────────
// Weak Cards List — dark-native
// ─────────────────────────────────────────────
function WeakCardsList({ cardStats, savedQuizzes }: { cardStats: CardStat[]; savedQuizzes: SavedQuiz[] }) {
  const weak = cardStats.filter(s => s.wrong > 0).sort((a, b) => b.wrong - a.wrong).slice(0, 5)
  if (weak.length === 0) return (
    <View style={weakS.empty}>
      <Text style={weakS.emptyEmoji}>🏆</Text>
      <Text style={weakS.emptyTitle}>No weak cards yet</Text>
      <Text style={weakS.emptyText}>Cards you miss will appear here for targeted review</Text>
    </View>
  )
  return (
    <View style={weakS.wrap}>
      <Text style={weakS.title}>Weak Cards <Text style={weakS.titleSub}>(most missed)</Text></Text>
      {weak.map((stat, i) => {
        const [quizId, cardIdx] = stat.cardId.split('_idx_')
        const quiz  = savedQuizzes.find(q => q.id === quizId)
        const card  = quiz?.items[parseInt(cardIdx, 10)]
        const total = stat.correct + stat.wrong
        const pct   = Math.round((stat.correct / total) * 100)
        const label = card ? ('front' in card ? card.front : 'question' in card ? card.question : 'statement' in card ? card.statement : card.sentence) : 'Unknown card'
        return (
          <View key={stat.cardId} style={weakS.row}>
            <View style={weakS.rankBox}><Text style={weakS.rank}>#{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={weakS.label} numberOfLines={2}>{label}</Text>
              <View style={weakS.meta}>
                <Text style={weakS.metaText}>{stat.wrong}✗  {stat.correct}✓</Text>
                <View style={[weakS.pctBadge, { backgroundColor: pct < 50 ? C.coralDim : C.emerDim, borderColor: pct < 50 ? C.coral + '40' : C.emerald + '40' }]}>
                  <Text style={[weakS.pctText, { color: pct < 50 ? C.coral : C.emerald }]}>{pct}%</Text>
                </View>
              </View>
            </View>
          </View>
        )
      })}
    </View>
  )
}
const weakS = StyleSheet.create({
  wrap:       { backgroundColor: C.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, gap: 10 },
  title:      { fontSize: 13, fontWeight: '800', color: C.text },
  titleSub:   { fontWeight: '400', color: C.textMute },
  row:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border },
  rankBox:    { width: 26, height: 26, borderRadius: 8, backgroundColor: C.coralDim, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.coral + '30' },
  rank:       { fontSize: 11, fontWeight: '800', color: C.coral },
  label:      { fontSize: 12, fontWeight: '600', color: C.text, lineHeight: 17 },
  meta:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  metaText:   { fontSize: 11, color: C.textMute },
  pctBadge:   { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  pctText:    { fontSize: 10, fontWeight: '800' },
  empty:      { backgroundColor: C.raised, borderRadius: 16, padding: 20, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.border },
  emptyEmoji: { fontSize: 28 },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: C.text },
  emptyText:  { fontSize: 12, color: C.textMute, textAlign: 'center', lineHeight: 17 },
})

// ─────────────────────────────────────────────
// Premium Modal
// ─────────────────────────────────────────────
function PremiumModal({ visible, onClose, onUpgrade }: { visible: boolean; onClose: () => void; onUpgrade: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={pmS.backdrop} onPress={onClose}>
        <Pressable style={pmS.sheet} onPress={e => e.stopPropagation()}>
          <View style={pmS.blob1} /><View style={pmS.blob2} />
          <View style={pmS.iconBox}><Ionicons name="lock-closed" size={32} color={C.gold} /></View>
          <Text style={pmS.title}>Free limit reached</Text>
          <Text style={pmS.sub}>You've used all {FREE_TRIES} free generations.{'\n'}Upgrade to Premium for unlimited AI quizzes and flashcards.</Text>
          {['Unlimited quiz & flashcard generation', 'All content types — MCQ, True/False, Fill-in', 'Generate from PDFs and pasted text', 'Access your saved sets forever'].map((perk, i) => (
            <View key={i} style={pmS.perkRow}>
              <Ionicons name="checkmark-circle" size={15} color={C.emerald} />
              <Text style={pmS.perkText}>{perk}</Text>
            </View>
          ))}
          <TouchableOpacity style={pmS.upgradeBtn} onPress={onUpgrade} activeOpacity={0.85}>
            <Ionicons name="star" size={16} color={C.void} />
            <Text style={pmS.upgradeBtnText}>Upgrade to Premium</Text>
          </TouchableOpacity>
          <TouchableOpacity style={pmS.dismissBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={pmS.dismissText}>Maybe later</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
const pmS = StyleSheet.create({
  backdrop:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: C.deep, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 40, gap: 12, overflow: 'hidden', borderTopWidth: 1, borderColor: C.border },
  blob1:          { position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: C.goldDim },
  blob2:          { position: 'absolute', bottom: -20, left: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: C.lavDim },
  iconBox:        { width: 72, height: 72, borderRadius: 22, backgroundColor: C.goldDim, borderWidth: 1.5, borderColor: C.gold + '30', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 4 },
  title:          { fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center' },
  sub:            { fontSize: 14, color: C.textSub, textAlign: 'center', lineHeight: 22, marginBottom: 4 },
  perkRow:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkText:       { fontSize: 13, color: C.textSub, lineHeight: 20 },
  upgradeBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.gold, borderRadius: 14, paddingVertical: 15, marginTop: 8 },
  upgradeBtnText: { fontSize: 15, fontWeight: '800', color: C.void },
  dismissBtn:     { alignItems: 'center', paddingVertical: 8 },
  dismissText:    { fontSize: 13, color: C.textMute, fontWeight: '600' },
})

// ─────────────────────────────────────────────
// Flip Card — dark-native with SM-2 buttons
// ─────────────────────────────────────────────
function FlipCard({ front, back, onDifficulty, srCard }: { front: string; back: string; onDifficulty?: (d: SRDifficulty) => void; srCard?: SRCard }) {
  const flip = useRef(new Animated.Value(0)).current
  const [flipped, setFlipped] = useState(false)
  const frontInterp = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] })
  const backInterp  = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] })
  function toggle() {
    Animated.spring(flip, { toValue: flipped ? 0 : 1, useNativeDriver: true, tension: 60, friction: 8 }).start()
    setFlipped(f => !f)
  }
  const nextReviewLabel = srCard ? (() => {
    const days = Math.round((new Date(srCard.nextReview).getTime() - Date.now()) / 86400000)
    if (days <= 0) return 'Due now'; if (days === 1) return 'Due tomorrow'; return `Due in ${days}d`
  })() : null
  return (
    <View style={{ marginBottom: 14 }}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.9} style={flipS.container}>
        <Animated.View style={[flipS.face, flipS.front, { transform: [{ rotateY: frontInterp }] }]}>
          <View style={flipS.labelRow}>
            <Text style={flipS.label}>FRONT</Text>
            <Ionicons name="sync-outline" size={13} color={C.textMute} />
          </View>
          <Text style={flipS.frontText}>{front}</Text>
          <Text style={flipS.tapHint}>Tap to reveal answer</Text>
          {nextReviewLabel && (
            <View style={flipS.srPill}>
              <Ionicons name="time-outline" size={10} color={C.lavender} />
              <Text style={flipS.srPillText}>{nextReviewLabel}</Text>
            </View>
          )}
        </Animated.View>
        <Animated.View style={[flipS.face, flipS.back, { transform: [{ rotateY: backInterp }] }]}>
          <View style={flipS.labelRow}>
            <Text style={[flipS.label, { color: C.lavender }]}>BACK</Text>
            <Ionicons name="sync-outline" size={13} color={C.lavender} />
          </View>
          <Text style={flipS.backText}>{back}</Text>
        </Animated.View>
      </TouchableOpacity>
      {flipped && onDifficulty && (
        <View style={flipS.diffRow}>
          <Text style={flipS.diffLabel}>How well did you know it?</Text>
          <View style={flipS.diffBtns}>
            {([
              { key: 'hard',   label: 'Hard',   color: C.coral,    bg: C.coralDim, border: C.coral + '40' },
              { key: 'medium', label: 'Medium', color: C.gold,     bg: C.goldDim,  border: C.gold  + '40' },
              { key: 'easy',   label: 'Easy',   color: C.emerald,  bg: C.emerDim,  border: C.emerald + '40' },
            ] as { key: SRDifficulty; label: string; color: string; bg: string; border: string }[]).map(d => (
              <TouchableOpacity key={d.key} style={[flipS.diffBtn, { backgroundColor: d.bg, borderColor: d.border }]}
                onPress={() => { onDifficulty(d.key); setFlipped(false); flip.setValue(0) }} activeOpacity={0.75}>
                <Text style={[flipS.diffBtnText, { color: d.color }]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  )
}
const flipS = StyleSheet.create({
  container:   { width: '100%', height: 190 },
  face:        { position: 'absolute', width: '100%', height: '100%', borderRadius: 18, padding: 22, backfaceVisibility: 'hidden', justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  front:       { backgroundColor: C.surface, borderColor: C.border },
  back:        { backgroundColor: C.raised,  borderColor: C.lavender + '30' },
  labelRow:    { position: 'absolute', top: 14, right: 16, flexDirection: 'row', alignItems: 'center', gap: 4 },
  label:       { fontSize: 9, fontWeight: '800', color: C.textMute, letterSpacing: 1.2 },
  frontText:   { fontSize: 16, fontWeight: '700', color: C.text, textAlign: 'center', lineHeight: 24 },
  backText:    { fontSize: 15, fontWeight: '600', color: C.lavender, textAlign: 'center', lineHeight: 22 },
  tapHint:     { position: 'absolute', bottom: 14, fontSize: 11, color: C.textMute },
  srPill:      { position: 'absolute', bottom: 14, right: 16, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.lavDim, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: C.lavender + '30' },
  srPillText:  { fontSize: 9, color: C.lavender, fontWeight: '700' },
  diffRow:     { marginTop: 12, gap: 8 },
  diffLabel:   { fontSize: 11, fontWeight: '700', color: C.textSub, textAlign: 'center' },
  diffBtns:    { flexDirection: 'row', gap: 8 },
  diffBtn:     { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  diffBtnText: { fontSize: 13, fontWeight: '800' },
})

// ─────────────────────────────────────────────
// MCQ Card — dark-native
// ─────────────────────────────────────────────
function MCQCard({ item, onAnswer, onRegenerate, priorAnswer }: { item: MCQItem; onAnswer?: (correct: boolean) => void; onRegenerate?: () => void; priorAnswer?: boolean }) {
  const [selected, setSelected] = useState<number | null>(priorAnswer === true ? (item.correct ?? 0) : null)
  const isLocked = priorAnswer !== undefined
  const answered = selected !== null || isLocked
  function handleSelect(i: number) { if (answered) return; setSelected(i); onAnswer?.(i === item.correct) }
  const options = Array.isArray(item?.options) ? item.options : []
  if (!item?.question || options.length === 0) {
    return (
      <View style={mcqS.card}>
        <Text style={mcqS.question}>⚠️ This card could not be displayed. Tap refresh to replace it.</Text>
        {onRegenerate && <TouchableOpacity onPress={onRegenerate} style={mcqS.cardHeader}><Ionicons name="refresh-outline" size={16} color={C.sapphire} /><Text style={{ fontSize: 13, color: C.sapphire, fontWeight: '600' }}>Replace card</Text></TouchableOpacity>}
      </View>
    )
  }
  return (
    <View style={mcqS.card}>
      <View style={mcqS.cardHeader}>
        <Text style={mcqS.question}>{item.question}</Text>
        {onRegenerate && <TouchableOpacity onPress={onRegenerate} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="refresh-outline" size={16} color={C.textMute} /></TouchableOpacity>}
      </View>
      {options.map((opt, i) => {
        const isCorrect = i === item.correct, isSelected = selected === i
        let bg = C.raised, border = C.border, textColor = C.text
        if (answered) {
          if (isCorrect)       { bg = C.emerDim;  border = C.emerald + '40'; textColor = C.emerald }
          else if (isSelected) { bg = C.coralDim; border = C.coral + '40';   textColor = C.coral   }
        }
        return (
          <TouchableOpacity key={i} style={[mcqS.option, { backgroundColor: bg, borderColor: border }]} onPress={() => handleSelect(i)} activeOpacity={answered ? 1 : 0.75}>
            <View style={[mcqS.optLetter, { backgroundColor: border + '60' }]}>
              <Text style={[mcqS.optLetterText, { color: textColor }]}>{['A','B','C','D'][i]}</Text>
            </View>
            <Text style={[mcqS.optText, { color: textColor }]}>{opt}</Text>
            {answered && isCorrect  && <Ionicons name="checkmark-circle" size={17} color={C.emerald} />}
            {answered && isSelected && !isCorrect && <Ionicons name="close-circle" size={17} color={C.coral} />}
          </TouchableOpacity>
        )
      })}
      {answered && (
        <View style={mcqS.explanation}>
          <Ionicons name="information-circle-outline" size={14} color={C.sapphire} />
          <Text style={mcqS.explanationText}>{item.explanation ?? ''}</Text>
        </View>
      )}
    </View>
  )
}
const mcqS = StyleSheet.create({
  card:            { backgroundColor: C.surface, borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: C.border, gap: 10 },
  cardHeader:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  question:        { flex: 1, fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 21, marginBottom: 4 },
  option:          { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 13, padding: 13 },
  optLetter:       { width: 26, height: 26, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  optLetterText:   { fontSize: 11, fontWeight: '800' },
  optText:         { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 19, color: C.text },
  explanation:     { flexDirection: 'row', gap: 6, backgroundColor: C.sapphDim, borderRadius: 11, padding: 11, marginTop: 4, alignItems: 'flex-start', borderWidth: 1, borderColor: C.sapphire + '25' },
  explanationText: { flex: 1, fontSize: 12, color: C.sapphire, lineHeight: 18 },
})

// ─────────────────────────────────────────────
// True/False Card — dark-native
// ─────────────────────────────────────────────
function TFCard({ item, onAnswer, onRegenerate, priorAnswer }: { item: TFItem; onAnswer?: (correct: boolean) => void; onRegenerate?: () => void; priorAnswer?: boolean }) {
  const [selected, setSelected] = useState<boolean | null>(priorAnswer === true ? item.answer : null)
  const isLocked = priorAnswer !== undefined
  const answered = selected !== null || isLocked
  function handleSelect(val: boolean) { if (answered) return; setSelected(val); onAnswer?.(val === item.answer) }
  if (!item?.statement) {
    return <View style={tfS.card}><Text style={tfS.statement}>⚠️ This card could not be displayed.</Text>{onRegenerate && <TouchableOpacity onPress={onRegenerate} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="refresh-outline" size={16} color={C.sapphire} /><Text style={{ fontSize: 13, color: C.sapphire, fontWeight: '600' }}>Replace card</Text></TouchableOpacity>}</View>
  }
  return (
    <View style={tfS.card}>
      <View style={tfS.cardHeader}>
        <Text style={tfS.statement}>{item.statement}</Text>
        {onRegenerate && <TouchableOpacity onPress={onRegenerate} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="refresh-outline" size={16} color={C.textMute} /></TouchableOpacity>}
      </View>
      <View style={tfS.btnRow}>
        {[true, false].map(val => {
          const isCorrect = val === item.answer, isSelected = selected === val
          let bg = C.raised, border = C.border, textColor = C.textSub
          if (answered) {
            if (isCorrect)       { bg = C.emerDim;  border = C.emerald + '40'; textColor = C.emerald }
            else if (isSelected) { bg = C.coralDim; border = C.coral + '40';   textColor = C.coral   }
          } else if (isSelected) { bg = C.sapphDim; border = C.sapphire + '40'; textColor = C.sapphire }
          return (
            <TouchableOpacity key={String(val)} style={[tfS.btn, { backgroundColor: bg, borderColor: border }]} onPress={() => handleSelect(val)} activeOpacity={answered ? 1 : 0.75}>
              <Ionicons name={val ? 'checkmark-circle-outline' : 'close-circle-outline'} size={20} color={textColor} />
              <Text style={[tfS.btnText, { color: textColor }]}>{val ? 'True' : 'False'}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
      {answered && (
        <View style={tfS.explanation}>
          <Ionicons name="bulb-outline" size={14} color={C.gold} />
          <Text style={tfS.explanationText}>{item.explanation}</Text>
        </View>
      )}
    </View>
  )
}
const tfS = StyleSheet.create({
  card:            { backgroundColor: C.surface, borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: C.border, gap: 12 },
  cardHeader:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  statement:       { flex: 1, fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 21 },
  btnRow:          { flexDirection: 'row', gap: 10 },
  btn:             { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1.5, borderRadius: 13, paddingVertical: 13 },
  btnText:         { fontSize: 14, fontWeight: '700' },
  explanation:     { flexDirection: 'row', gap: 6, backgroundColor: C.goldDim, borderRadius: 11, padding: 11, alignItems: 'flex-start', borderWidth: 1, borderColor: C.gold + '25' },
  explanationText: { flex: 1, fontSize: 12, color: C.gold, lineHeight: 18 },
})

// ─────────────────────────────────────────────
// Fill in the Blank Card — dark-native
// ─────────────────────────────────────────────
function FillCard({ item, onAnswer, onRegenerate, priorAnswer }: { item: FillItem; onAnswer?: (correct: boolean) => void; onRegenerate?: () => void; priorAnswer?: boolean }) {
  const [input,   setInput]   = useState(priorAnswer !== undefined ? (item?.answer ?? '') : '')
  const [checked, setChecked] = useState(priorAnswer !== undefined)
  const isCorrect = input.trim().toLowerCase() === (item?.answer ?? '').toLowerCase()
  function handleCheck() { if (!checked && input.trim()) { setChecked(true); onAnswer?.(input.trim().toLowerCase() === (item?.answer ?? '').toLowerCase()) } }
  if (!item?.sentence || !item?.answer) {
    return <View style={fillS.card}><Text style={fillS.sentence}>⚠️ This card could not be displayed.</Text>{onRegenerate && <TouchableOpacity onPress={onRegenerate} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="refresh-outline" size={16} color={C.sapphire} /><Text style={{ fontSize: 13, color: C.sapphire, fontWeight: '600' }}>Replace card</Text></TouchableOpacity>}</View>
  }
  return (
    <View style={fillS.card}>
      <View style={fillS.cardHeader}>
        <Text style={fillS.sentence}>{item.sentence.replace('___', '________')}</Text>
        {onRegenerate && <TouchableOpacity onPress={onRegenerate} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="refresh-outline" size={16} color={C.textMute} /></TouchableOpacity>}
      </View>
      <Text style={fillS.hint}>Hint: {item.hint}</Text>
      <View style={fillS.inputRow}>
        <TextInput
          style={[fillS.input, checked && (isCorrect ? fillS.inputCorrect : fillS.inputWrong)]}
          value={input} onChangeText={setInput}
          placeholder="Type your answer…" placeholderTextColor={C.textMute}
          editable={!checked} autoCapitalize="none"
        />
        <TouchableOpacity style={[fillS.checkBtn, checked && fillS.checkBtnDone]} onPress={handleCheck} activeOpacity={0.8}>
          <Text style={fillS.checkBtnText}>{checked ? (isCorrect ? '✓' : '✗') : 'Check'}</Text>
        </TouchableOpacity>
      </View>
      {checked && !isCorrect && (
        <View style={fillS.answerReveal}>
          <Text style={fillS.answerText}>Answer: <Text style={{ fontWeight: '700', color: C.emerald }}>{item.answer}</Text></Text>
        </View>
      )}
    </View>
  )
}
const fillS = StyleSheet.create({
  card:          { backgroundColor: C.surface, borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: C.border, gap: 10 },
  cardHeader:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sentence:      { flex: 1, fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 21 },
  hint:          { fontSize: 12, color: C.textMute, fontStyle: 'italic' },
  inputRow:      { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input:         { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, fontSize: 14, color: C.text, backgroundColor: C.raised },
  inputCorrect:  { borderColor: C.emerald + '60', backgroundColor: C.emerDim },
  inputWrong:    { borderColor: C.coral + '60',   backgroundColor: C.coralDim },
  checkBtn:      { backgroundColor: C.sapphire, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  checkBtnDone:  { backgroundColor: C.raised, borderWidth: 1, borderColor: C.border },
  checkBtnText:  { fontSize: 13, fontWeight: '700', color: C.text },
  answerReveal:  { backgroundColor: C.emerDim, borderRadius: 11, padding: 11, borderWidth: 1, borderColor: C.emerald + '30' },
  answerText:    { fontSize: 13, color: C.textSub },
})

// ─────────────────────────────────────────────
// Analytics Screen — fully dark
// ─────────────────────────────────────────────
function AnalyticsScreen({ savedQuizzes, cardStats, streakDays, onClose }: { savedQuizzes: SavedQuiz[]; cardStats: CardStat[]; streakDays: StreakDay[]; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  const [selectedQuiz, setSelectedQuiz] = useState<SavedQuiz | null>(savedQuizzes[0] ?? null)
  const totalAnswered = cardStats.reduce((s, c) => s + c.correct + c.wrong, 0)
  const totalCorrect  = cardStats.reduce((s, c) => s + c.correct, 0)
  const overallPct    = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0
  return (
    <View style={[anS.root, { paddingTop: insets.top }]}>
      <View style={anS.header}>
        <View style={anS.blob1} /><View style={anS.blob2} />
        <TouchableOpacity style={anS.backBtn} onPress={onClose}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>
        <View style={anS.brandRow}>
          <View style={anS.brandLogo}><Text style={{ fontSize: 14 }}>🎓</Text></View>
          <Text style={anS.brandWord}>student<Text style={anS.brandAccent}>share</Text></Text>
        </View>
        <Text style={anS.title}>Analytics</Text>
        <Text style={anS.sub}>Your study performance over time</Text>
        <View style={anS.pillsRow}>
          <View style={anS.pill}>
            <Text style={anS.pillVal}>{totalAnswered}</Text>
            <Text style={anS.pillLabel}>Total answered</Text>
          </View>
          <View style={[anS.pill, { backgroundColor: C.emerDim, borderColor: C.emerald + '25' }]}>
            <Text style={[anS.pillVal, { color: C.emerald }]}>{overallPct}%</Text>
            <Text style={anS.pillLabel}>Overall accuracy</Text>
          </View>
          <View style={[anS.pill, { backgroundColor: C.goldDim, borderColor: C.gold + '25' }]}>
            <Text style={[anS.pillVal, { color: C.gold }]}>{savedQuizzes.length}</Text>
            <Text style={anS.pillLabel}>Saved sets</Text>
          </View>
        </View>
      </View>
      <ScrollView contentContainerStyle={[anS.body, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <StreakCalendar streakDays={streakDays} />
        <View style={anS.scoreSection}>
          <Text style={anS.sectionTitle}>Score History</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {savedQuizzes.map(q => (
                <TouchableOpacity key={q.id} style={[anS.quizChip, selectedQuiz?.id === q.id && anS.quizChipActive]} onPress={() => setSelectedQuiz(q)}>
                  <Text style={[anS.quizChipText, selectedQuiz?.id === q.id && anS.quizChipTextActive]} numberOfLines={1}>{q.title.length > 18 ? q.title.slice(0, 18) + '…' : q.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          {selectedQuiz ? <View style={anS.sparkWrap}><Sparkline data={selectedQuiz.scoreHistory ?? []} /></View> : <Text style={anS.emptyText}>No quiz sets saved yet</Text>}
        </View>
        <WeakCardsList cardStats={cardStats} savedQuizzes={savedQuizzes} />
        {savedQuizzes.length > 0 && (
          <View style={anS.breakdownSection}>
            <Text style={anS.sectionTitle}>Set Breakdown</Text>
            {savedQuizzes.map(q => {
              const setStats   = cardStats.filter(s => s.cardId.startsWith(q.id))
              const setCorrect = setStats.reduce((s, c) => s + c.correct, 0)
              const setTotal   = setStats.reduce((s, c) => s + c.correct + c.wrong, 0)
              const setPct     = setTotal > 0 ? Math.round((setCorrect / setTotal) * 100) : null
              const mastery    = setPct !== null ? getMastery(setCorrect, setTotal) : null
              const iconColor  = q.type === 'flashcards' ? C.lavender : q.type === 'mcq' ? C.sapphire : q.type === 'truefalse' ? C.emerald : C.gold
              const iconBg     = q.type === 'flashcards' ? C.lavDim   : q.type === 'mcq' ? C.sapphDim  : q.type === 'truefalse' ? C.emerDim  : C.goldDim
              return (
                <View key={q.id} style={anS.breakdownRow}>
                  <View style={[anS.breakdownIcon, { backgroundColor: iconBg }]}>
                    <Ionicons name={(q.type === 'flashcards' ? 'albums-outline' : q.type === 'mcq' ? 'list-outline' : q.type === 'truefalse' ? 'checkmark-circle-outline' : 'create-outline') as any} size={14} color={iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={anS.breakdownTitle} numberOfLines={1}>{q.title}</Text>
                    <Text style={anS.breakdownMeta}>{q.items.length} cards · {setTotal} answered</Text>
                  </View>
                  {mastery && setPct !== null
                    ? <View style={[anS.masteryBadge, { backgroundColor: mastery.color + '18', borderColor: mastery.color + '40' }]}><Text style={[anS.masteryBadgeText, { color: mastery.color }]}>{mastery.emoji} {setPct}%</Text></View>
                    : <Text style={anS.notStarted}>Not started</Text>}
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
const anS = StyleSheet.create({
  root:             { flex: 1, backgroundColor: C.void },
  header:           { backgroundColor: C.deep, paddingHorizontal: 20, paddingBottom: 22, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: C.border },
  blob1:            { position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: C.lavDim },
  blob2:            { position: 'absolute', bottom: -30, left: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: C.sapphDim },
  backBtn:          { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', marginBottom: 14, alignSelf: 'flex-start' },
  brandRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  brandLogo:        { width: 28, height: 28, borderRadius: 9, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center' },
  brandWord:        { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3, fontFamily: 'serif' },
  brandAccent:      { color: C.orange, fontStyle: 'italic' },
  title:            { fontSize: 24, fontWeight: '900', color: C.text, fontFamily: 'serif', letterSpacing: -0.5 },
  sub:              { fontSize: 13, color: C.textSub, marginTop: 4, marginBottom: 18 },
  pillsRow:         { flexDirection: 'row', gap: 10 },
  pill:             { flex: 1, backgroundColor: C.surface, borderRadius: 13, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  pillVal:          { fontSize: 18, fontWeight: '800', color: C.text },
  pillLabel:        { fontSize: 10, color: C.textMute, marginTop: 2, textAlign: 'center' },
  body:             { padding: 16, gap: 14 },
  sectionTitle:     { fontSize: 11, fontWeight: '800', color: C.textMute, letterSpacing: 2.2, textTransform: 'uppercase', marginBottom: 12 },
  scoreSection:     { backgroundColor: C.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  sparkWrap:        { paddingLeft: 28 },
  quizChip:         { backgroundColor: C.raised, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: C.border, maxWidth: 140 },
  quizChipActive:   { backgroundColor: C.lavDim, borderColor: C.lavender + '50' },
  quizChipText:     { fontSize: 12, fontWeight: '600', color: C.textSub },
  quizChipTextActive:{ color: C.lavender },
  emptyText:        { fontSize: 12, color: C.textMute, textAlign: 'center', padding: 10 },
  breakdownSection: { backgroundColor: C.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, gap: 4 },
  breakdownRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.border },
  breakdownIcon:    { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  breakdownTitle:   { fontSize: 12, fontWeight: '700', color: C.text },
  breakdownMeta:    { fontSize: 11, color: C.textMute, marginTop: 1 },
  masteryBadge:     { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  masteryBadgeText: { fontSize: 11, fontWeight: '800' },
  notStarted:       { fontSize: 11, color: C.textMute, fontWeight: '600' },
})

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────
export default function QuizFlashcardsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { isOnline } = useNetworkStatus()
  const params = useLocalSearchParams<{ material_id?: string; title?: string; file_url?: string; type?: string; auto_generate?: string }>()
  const isAutoMode = params.auto_generate === '1' && !!params.file_url

  // ── Core state ────────────────────────────────────────────────────────
  const [triesUsed,        setTriesUsed]        = useState(0)
  const [triesLoaded,      setTriesLoaded]      = useState(false)
  const { isPremium }    = usePremium()
  const [showPremiumModal, setShowPremiumModal] = useState(false)
  const [inputMode,        setInputMode]        = useState<InputMode>('topic')
  const [contentType,      setContentType]      = useState<ContentType>('flashcards')
  const [diffLevel,        setDiffLevel]        = useState<DiffLevel>('medium')
  const [cardQty,          setCardQty]          = useState<CardQty>(25)
  const [topicText,        setTopicText]        = useState('')
  const [pasteText,        setPasteText]        = useState('')
  const [pdfBase64,        setPdfBase64]        = useState<string | null>(null)
  const [pdfName,          setPdfName]          = useState<string | null>(null)
  const [pdfUri,           setPdfUri]           = useState<string | null>(null)
  const [loading,          setLoading]          = useState(false)
  const [autoLoading,      setAutoLoading]      = useState(false)
  const [result,           setResult]           = useState<GeneratedContent | null>(null)
  const [currentQuizId,    setCurrentQuizId]    = useState<string | null>(null)
  const lastGenerationContext = useRef<{ docText: string | null; docTitle: string | null; inputMode: InputMode; sourceText: string } | null>(null)
  const [error,            setError]            = useState<string | null>(null)
  const [currentCard,      setCurrentCard]      = useState(0)
  const [autoFetchFail,    setAutoFetchFail]    = useState(false)
  const [savedQuizzes,     setSavedQuizzes]     = useState<SavedQuiz[]>([])
  const [folderOpen,       setFolderOpen]       = useState(false)
  const folderAnim = useRef(new Animated.Value(0)).current

  // ── Analytics / SR state ─────────────────────────────────────────────
  const [srData,        setSrData]        = useState<Record<string, SRCard>>({})
  const [cardStats,     setCardStats]     = useState<CardStat[]>([])
  const [streakDays,    setStreakDays]    = useState<StreakDay[]>([])
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [dueReviewMode, setDueReviewMode] = useState(false)
  const [dueCards,      setDueCards]      = useState<number[]>([])

  // ── Session stats ─────────────────────────────────────────────────────
  const [answeredCards,  setAnsweredCards]  = useState<Record<number, boolean>>({})
  const [sessionCorrect, setSessionCorrect] = useState(0)
  const [sessionWrong,   setSessionWrong]   = useState(0)
  const [streak,         setStreak]         = useState(0)
  const [cheerMsg,       setCheerMsg]       = useState<string | null>(null)
  const [showStats,      setShowStats]      = useState(false)
  const cheerAnim  = useRef(new Animated.Value(0)).current
  const cheerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const progressAnim     = useRef(new Animated.Value(0)).current
  const cardProgressAnim = useRef(new Animated.Value(0)).current

  // ── Load persisted data ───────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [rawTries, rawHistory, rawSR, rawAnalytics, rawStreak] = await Promise.all([
        AsyncStorage.getItem(TRIES_KEY), AsyncStorage.getItem(QUIZ_HISTORY_KEY),
        AsyncStorage.getItem(SR_DATA_KEY), AsyncStorage.getItem(ANALYTICS_KEY), AsyncStorage.getItem(STREAK_KEY),
      ])
      setTriesUsed(rawTries ? parseInt(rawTries, 10) : 0); setTriesLoaded(true)
      if (rawHistory)   { try { setSavedQuizzes(JSON.parse(rawHistory))   } catch {} }
      if (rawSR)        { try { setSrData(JSON.parse(rawSR))              } catch {} }
      if (rawAnalytics) { try { setCardStats(JSON.parse(rawAnalytics))    } catch {} }
      if (rawStreak)    { try { setStreakDays(JSON.parse(rawStreak))      } catch {} }
    }
    init()
  }, [])

  useEffect(() => {
    Animated.timing(progressAnim, { toValue: triesUsed / FREE_TRIES, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start()
  }, [triesUsed])

  useEffect(() => {
    if (!result) return
    Animated.timing(cardProgressAnim, { toValue: (currentCard + 1) / result.items.length, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start()
  }, [currentCard, result])

  useEffect(() => {
    if (result) { setAnsweredCards({}); setSessionCorrect(0); setSessionWrong(0); setStreak(0); setCheerMsg(null); setShowStats(false) }
  }, [result])

  useEffect(() => {
    if (!result || !currentQuizId) return
    const due = result.items.map((_, i) => { const id = `${currentQuizId}_idx_${i}`; const card = srData[id]; return card ? (isDueToday(card) ? i : -1) : i }).filter(i => i >= 0)
    setDueCards(due)
  }, [result, srData, currentQuizId])

  // ── Answer handling ───────────────────────────────────────────────────
  function handleAnswer(correct: boolean) {
    const cardIndex = currentCard
    setAnsweredCards(prev => {
      const previous = prev[cardIndex]
      if (previous === correct) return prev
      if (previous === undefined) {
        if (correct) { setSessionCorrect(c => c + 1); setStreak(s => { const next = s + 1; showCheer(getCheer(true, next)); return next }) }
        else         { setSessionWrong(w => w + 1); setStreak(0); showCheer(getCheer(false, 0)) }
      } else {
        if (correct) { setSessionCorrect(c => c + 1); setSessionWrong(w => Math.max(0, w - 1)); setStreak(s => { const next = s + 1; showCheer(getCheer(true, next)); return next }) }
        else         { setSessionCorrect(c => Math.max(0, c - 1)); setSessionWrong(w => w + 1); setStreak(0); showCheer(getCheer(false, 0)) }
      }
      return { ...prev, [cardIndex]: correct }
    })
    if (currentQuizId) updateCardStat(`${currentQuizId}_idx_${currentCard}`, correct)
  }

  async function handleSRDifficulty(difficulty: SRDifficulty) {
    if (!currentQuizId) return
    const cardId   = `${currentQuizId}_idx_${currentCard}`
    const existing = srData[cardId] ?? createSRCard(cardId)
    const updated  = sm2Update(existing, difficulty)
    const newSrData = { ...srData, [cardId]: updated }
    setSrData(newSrData)
    await AsyncStorage.setItem(SR_DATA_KEY, JSON.stringify(newSrData))
    handleAnswer(difficulty !== 'hard')
    if (currentCard < (result?.items.length ?? 0) - 1) setCurrentCard(c => c + 1)
  }

  async function updateCardStat(cardId: string, correct: boolean) {
    setCardStats(prev => {
      const existing = prev.find(s => s.cardId === cardId)
      let updated: CardStat[]
      if (existing) { updated = prev.map(s => s.cardId === cardId ? { ...s, correct: s.correct + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1), lastSeen: new Date().toISOString() } : s) }
      else          { updated = [...prev, { cardId, correct: correct ? 1 : 0, wrong: correct ? 0 : 1, lastSeen: new Date().toISOString() }] }
      AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(updated))
      return updated
    })
    await updateStreakDay(true, correct ? 1 : 0, 1)
  }

  async function updateStreakDay(studied: boolean, correct: number, total: number) {
    const today = new Date().toISOString().slice(0, 10)
    setStreakDays(prev => {
      const existing = prev.find(d => d.date === today)
      let updated = existing
        ? prev.map(d => d.date === today ? { ...d, studied: true, correct: d.correct + correct, total: d.total + total } : d)
        : [...prev, { date: today, studied, correct, total }]
      updated = updated.slice(-60)
      AsyncStorage.setItem(STREAK_KEY, JSON.stringify(updated))
      return updated
    })
  }

  function showCheer(msg: string) {
    if (cheerTimer.current) clearTimeout(cheerTimer.current)
    setCheerMsg(msg); cheerAnim.setValue(0)
    Animated.sequence([
      Animated.spring(cheerAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.delay(1800),
      Animated.timing(cheerAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setCheerMsg(null))
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  async function incrementTries() { const next = triesUsed + 1; setTriesUsed(next); await AsyncStorage.setItem(TRIES_KEY, String(next)) }

  async function saveQuiz(generated: GeneratedContent, label: string, source: SavedQuiz['source']): Promise<string> {
    const id = Date.now().toString()
    const entry: SavedQuiz = { id, title: label, type: generated.type as ContentType, items: generated.items, savedAt: new Date().toISOString(), source, scoreHistory: [] }
    const updated = [entry, ...savedQuizzes].slice(0, MAX_SAVED)
    setSavedQuizzes(updated); await AsyncStorage.setItem(QUIZ_HISTORY_KEY, JSON.stringify(updated)); return id
  }

  async function persistSessionScore(quizId: string, correct: number, total: number) {
    if (total === 0) return
    const pct  = Math.round((correct / total) * 100)
    const date = new Date().toISOString().slice(0, 10)
    setSavedQuizzes(prev => {
      const updated = prev.map(q => q.id === quizId ? { ...q, scoreHistory: [...(q.scoreHistory ?? []), { date, pct }].slice(-20) } : q)
      AsyncStorage.setItem(QUIZ_HISTORY_KEY, JSON.stringify(updated))
      return updated
    })
  }

  async function deleteSavedQuiz(id: string) {
    const updated = savedQuizzes.filter(q => q.id !== id); setSavedQuizzes(updated); await AsyncStorage.setItem(QUIZ_HISTORY_KEY, JSON.stringify(updated))
  }

  async function fetchDocumentContent(materialId?: string, fileUrl?: string): Promise<string | null> {
    if (!materialId && !fileUrl) return null
    if (materialId) { const { data } = await supabase.from('materials').select('content_text').eq('id', materialId).single(); if (data?.content_text) return data.content_text }
    if (fileUrl)    { const { data } = await supabase.from('materials').select('content_text').eq('file_url', fileUrl).single(); if (data?.content_text) return data.content_text }
    return null
  }

  function buildPrompts(mode: InputMode, content: string, docText?: string | null, docTitle?: string | null): { system: string; user: string } {
    const qty       = cardQty
    const diffLabel = diffLevel === 'easy' ? 'basic recall and definition-level' : diffLevel === 'medium' ? 'intermediate comprehension and application' : 'advanced analysis, synthesis, and evaluation'
    const isMixed   = contentType === 'mixed'
    const typeLabel = isMixed ? 'mixed quiz questions' : contentType === 'flashcards' ? 'flashcards' : contentType === 'mcq' ? 'multiple choice questions' : contentType === 'truefalse' ? 'true/false questions' : 'fill-in-the-blank questions'
    const jsonSchema = isMixed
      ? `{"mixed":[{"_type":"mcq","question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."},{"_type":"truefalse","statement":"...","answer":true,"explanation":"..."},{"_type":"fillin","sentence":"sentence with ___","answer":"word","hint":"..."}]}`
      : contentType === 'flashcards' ? '{"flashcards":[{"front":"...","back":"..."}]}'
      : contentType === 'mcq'        ? '{"mcq":[{"question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."}]}'
      : contentType === 'truefalse'  ? '{"truefalse":[{"statement":"...","answer":true,"explanation":"..."}]}'
      : '{"fillin":[{"sentence":"sentence with ___ blank","answer":"word","hint":"..."}]}'
    const diffInstruction = `Questions must be at ${diffLabel} difficulty.`
    let system: string
    if (docText) {
      system = `You are an expert educator. The student is studying a document called "${docTitle ?? 'this material'}".\n\nHere is the full content:\n---\n${docText.slice(0, 28000)}\n---\n\nGenerate exactly ${qty} ${typeLabel} that test understanding of the EDUCATIONAL CONTENT.\n${diffInstruction}\n\nRULES: Focus ONLY on subject matter. IGNORE document metadata, authors, page numbers, references.\n${isMixed ? `Distribute items roughly equally among mcq, truefalse, and fillin. Each item MUST have a "_type" field.` : ''}\n\nReturn ONLY valid JSON: ${jsonSchema}\nNo markdown, no explanation, pure JSON only.`
    } else {
      system = `You are an expert educator. Generate exactly ${qty} ${typeLabel}.\n${diffInstruction}\n${isMixed ? `Distribute items equally among mcq, truefalse, and fillin. Each item MUST have a "_type" field.` : ''}\nReturn ONLY valid JSON: ${jsonSchema}\nNo markdown, no explanation, pure JSON only.`
    }
    const user = mode === 'topic' ? `Topic: ${content}` : `Text:\n${content.slice(0, 28000)}`
    return { system, user }
  }

  async function callAPI(systemPrompt: string, userContent: string): Promise<GeneratedContent> {
    const res  = await fetch(GROQ_API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.EXPO_PUBLIC_GROQ_API_KEY ?? ''}` }, body: JSON.stringify({ model: GROQ_MODEL, max_tokens: 8000, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }] }) })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message ?? 'API error')
    const raw   = data.choices?.[0]?.message?.content ?? ''
    const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    let parsed: any
    try { parsed = JSON.parse(clean) } catch { throw new Error('Could not parse the response. Please try again.') }
    if (parsed.flashcards) return { type: 'flashcards', items: parsed.flashcards }
    if (parsed.mcq)        return { type: 'mcq',        items: parsed.mcq        }
    if (parsed.truefalse)  return { type: 'truefalse',  items: parsed.truefalse  }
    if (parsed.fillin)     return { type: 'fillin',     items: parsed.fillin     }
    if (parsed.mixed)      return { type: 'mixed',      items: parsed.mixed      }
    throw new Error('Unexpected response format. Please try again.')
  }

  async function handleRegenerateCard(index: number) {
    if (!result || !currentQuizId) return
    const ctx = lastGenerationContext.current
    try {
      const item     = result.items[index]
      const typeHint = result.type === 'mixed' ? (item as any)._type ?? 'mcq' : result.type
      const singleSchema = typeHint === 'flashcards' ? '{"flashcards":[{"front":"...","back":"..."}]}' : typeHint === 'mcq' ? '{"mcq":[{"question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."}]}' : typeHint === 'truefalse' ? '{"truefalse":[{"statement":"...","answer":true,"explanation":"..."}]}' : '{"fillin":[{"sentence":"sentence with ___","answer":"word","hint":"..."}]}'
      let sysPrompt: string, usrPrompt: string
      if (ctx?.docText) { sysPrompt = `You are an expert educator. Here is a document excerpt:\n---\n${ctx.docText.slice(0, 28000)}\n---\nGenerate exactly 1 NEW and UNIQUE ${typeHint} card. Return ONLY valid JSON: ${singleSchema}.`; usrPrompt = `Replace this card: ${JSON.stringify(item)}` }
      else if (ctx?.docTitle) { sysPrompt = `Generate exactly 1 NEW and UNIQUE ${typeHint} card about: "${ctx.docTitle}". Return ONLY valid JSON: ${singleSchema}.`; usrPrompt = `Replace: ${JSON.stringify(item)}` }
      else { const existing = result.items.slice(0, 5).map((it: any) => it.front ?? it.question ?? it.statement ?? it.sentence ?? '').join('; '); sysPrompt = `Generate 1 NEW ${typeHint} card fitting this set: "${existing}". Return ONLY valid JSON: ${singleSchema}.`; usrPrompt = `Replace: ${JSON.stringify(item)}` }
      const res = await callAPI(sysPrompt, usrPrompt); const newItem = res.items[0]; if (!newItem) return
      setResult(prev => { if (!prev) return prev; const newItems = [...prev.items]; newItems[index] = newItem; return { ...prev, items: newItems } as GeneratedContent })
      setAnsweredCards(prev => { const next = { ...prev }; delete next[index]; return next })
    } catch {}
  }

  async function handleRegenerateFullSet() {
    if (isLocked) { setShowPremiumModal(true); return }
    if (!isOnline) { setError('You are offline. Connect to generate new quizzes.'); return }
    const ctx = lastGenerationContext.current
    setAutoLoading(true); setError(null); setCurrentCard(0); setAnsweredCards({})
    try {
      if (!ctx) { setResult(null); setAutoLoading(false); return }
      const prompts   = buildPrompts(ctx.inputMode, ctx.sourceText, ctx.docText, ctx.docTitle)
      const generated = await callAPI(prompts.system, prompts.user)
      await incrementTries()
      const label = ctx.docTitle ?? ctx.sourceText.slice(0, 40)
      const qid   = await saveQuiz(generated, label, ctx.inputMode)
      setCurrentQuizId(qid); cardProgressAnim.setValue(1 / generated.items.length); setResult(generated)
    } catch (e: any) { setError(e?.message ?? 'Generation failed. Please try again.') }
    finally { setAutoLoading(false) }
  }

  async function triggerAutoGenerate() {
    if (isLocked) { setShowPremiumModal(true); return }
    if (!isOnline) { setError('You are offline. Connect to generate new quizzes.'); return }
    setAutoLoading(true); setError(null); setResult(null); setCurrentCard(0)
    const title = params.title ?? 'this material'
    try {
      let docText: string | null = null
      if ((params.type ?? '') !== 'tutorial') {
        docText = await fetchDocumentContent(params.material_id, params.file_url)
        if (!docText) setAutoFetchFail(true)
      }
      const prompts = buildPrompts('topic', title, docText, title)
      lastGenerationContext.current = { docText, docTitle: title, inputMode: 'topic', sourceText: title }
      const generated = await callAPI(prompts.system, prompts.user)
      await incrementTries()
      const qid = await saveQuiz(generated, params.title ?? 'Material', 'material')
      setCurrentQuizId(qid); cardProgressAnim.setValue(1 / generated.items.length); setResult(generated)
    } catch (e: any) { setError(e?.message ?? 'Generation failed. Please try again.') }
    finally { setAutoLoading(false) }
  }

  async function handleGenerate() {
    if (isLocked) { setShowPremiumModal(true); return }
    if (!isOnline) { setError('You are offline. Connect to generate new quizzes.'); return }
    setError(null); setLoading(true); setResult(null); setCurrentCard(0)
    try {
      let prompts = buildPrompts('topic', '')
      if (inputMode === 'topic') {
        if (!topicText.trim()) throw new Error('Please enter a topic.')
        prompts = buildPrompts('topic', topicText.trim(), null, topicText.trim())
        lastGenerationContext.current = { docText: null, docTitle: topicText.trim(), inputMode: 'topic', sourceText: topicText.trim() }
      } else if (inputMode === 'text') {
        if (!pasteText.trim()) throw new Error('Please paste some text.')
        prompts = buildPrompts('text', pasteText.trim(), pasteText.trim(), 'Pasted Text')
        lastGenerationContext.current = { docText: pasteText.trim(), docTitle: 'Pasted Text', inputMode: 'text', sourceText: pasteText.trim() }
      } else if (inputMode === 'pdf') {
        if (!pdfUri) throw new Error('Please select a PDF.')
        if (!pdfBase64) throw new Error('PDF could not be read.')
        const extractedText = extractTextFromPdfBase64(pdfBase64)
        if (!extractedText || extractedText.trim().length < 30) throw new Error('Could not extract text from this PDF. Try the Paste Text option instead.')
        prompts = buildPrompts('topic', pdfName ?? 'PDF', extractedText, pdfName ?? 'PDF')
        lastGenerationContext.current = { docText: extractedText, docTitle: pdfName ?? 'PDF', inputMode: 'pdf', sourceText: pdfName ?? 'PDF' }
      }
      const generated = await callAPI(prompts.system, prompts.user)
      await incrementTries()
      const label = inputMode === 'topic' ? topicText.trim() : inputMode === 'text' ? (pasteText.trim().slice(0, 40) + '…') : (pdfName ?? 'PDF')
      const qid   = await saveQuiz(generated, label, inputMode)
      setCurrentQuizId(qid); cardProgressAnim.setValue(1 / generated.items.length); setResult(generated)
    } catch (e: any) { setError(e?.message ?? 'Something went wrong. Please try again.') }
    finally { setLoading(false) }
  }

  function extractTextFromPdfBase64(base64: string): string {
    try {
      const binary = atob(base64); const textChunks: string[] = []
      const btEtRegex = /BT[\s\S]*?ET/g; let btMatch: RegExpExecArray | null
      while ((btMatch = btEtRegex.exec(binary)) !== null) {
        const block = btMatch[0]
        const tjRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g; let m: RegExpExecArray | null
        while ((m = tjRegex.exec(block)) !== null) { const t = decodePdfString(m[1]); if (t.trim()) textChunks.push(t) }
        const tjArrRegex = /\[([^\]]*)\]\s*TJ/g
        while ((m = tjArrRegex.exec(block)) !== null) { const inner = m[1]; const strRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g; let s: RegExpExecArray | null; while ((s = strRegex.exec(inner)) !== null) { const t = decodePdfString(s[1]); if (t.trim()) textChunks.push(t) } }
      }
      const apoRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*['"]/g; let ap: RegExpExecArray | null
      while ((ap = apoRegex.exec(binary)) !== null) { const t = decodePdfString(ap[1]); if (t.trim().length > 2) textChunks.push(t) }
      return textChunks.join(' ').replace(/\s+/g, ' ').trim().slice(0, 25000)
    } catch { return '' }
  }
  function decodePdfString(raw: string): string {
    return raw.replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8))).replace(/\\n/g, ' ').replace(/\\r/g, ' ').replace(/\\t/g, ' ').replace(/\\\\/g, '\\').replace(/\\[()]/g, m => m[1]).replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
  }

  async function pickPDF() {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' })
    if (res.canceled) return
    const asset = res.assets[0]; setPdfUri(asset.uri); setPdfName(asset.name)
    const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }).catch(() => null)
    if (b64) setPdfBase64(b64)
  }

  const remaining = FREE_TRIES - triesUsed
  const isLocked  = triesLoaded && !isPremium && triesUsed >= FREE_TRIES

  // ── Analytics screen ──────────────────────────────────────────────────
  if (showAnalytics) {
    return <AnalyticsScreen savedQuizzes={savedQuizzes} cardStats={cardStats} streakDays={streakDays} onClose={() => setShowAnalytics(false)} />
  }

  // ── Result view ────────────────────────────────────────────────────────
  if (result) {
    const items   = dueReviewMode ? dueCards.map(i => result.items[i]) : result.items
    const indices = dueReviewMode ? dueCards : result.items.map((_, i) => i)
    const total   = items.length
    const answered = Object.keys(answeredCards).length
    const mastery  = getMastery(sessionCorrect, answered)
    const pct      = answered > 0 ? Math.round((sessionCorrect / answered) * 100) : 0

    function handleBack() {
      if (currentQuizId && answered > 0) persistSessionScore(currentQuizId, sessionCorrect, answered)
      setResult(null); setCurrentCard(0); setDueReviewMode(false)
    }

    return (
      <View style={S.root}>

        {/* Hero */}
        <View style={[S.resultHero, { paddingTop: insets.top + 10 }]}>
          <View style={S.heroBlob1} /><View style={S.heroBlob2} />
          <View style={S.resultBrandRow}>
            <TouchableOpacity style={S.backBtn} onPress={handleBack}>
              <Ionicons name="arrow-back" size={20} color={C.text} />
            </TouchableOpacity>
            <View style={S.resultBrandCenter}>
              <View style={S.resultBrandLogoRow}>
                <View style={S.resultBrandDot} />
                <Text style={S.resultBrandName}>StudentShare</Text>
                <View style={S.resultBrandDot} />
              </View>
              <Text style={S.resultBrandTagline}>AI Study Assistant</Text>
            </View>
            <View style={S.resultCountPill}>
              <Text style={S.resultCountText}>{currentCard + 1}/{total}</Text>
            </View>
          </View>
          <View style={S.resultHeroDivider} />
          <View style={S.resultInfoRow}>
            <View style={S.resultTypeIconBox}>
              <Ionicons name={(result.type === 'flashcards' ? 'albums-outline' : result.type === 'mcq' ? 'list-outline' : result.type === 'truefalse' ? 'checkmark-circle-outline' : result.type === 'mixed' ? 'grid-outline' : 'create-outline') as any} size={16} color={C.lavender} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.resultHeroType}>
                {result.type === 'flashcards' ? 'Flashcards' : result.type === 'mcq' ? 'Multiple Choice' : result.type === 'truefalse' ? 'True / False' : result.type === 'mixed' ? 'Mixed Quiz' : 'Fill in the Blank'}
                {dueReviewMode ? ' · Due Review' : ''}
              </Text>
              {params.title ? <Text style={S.resultHeroMaterial} numberOfLines={1}>{params.title}</Text> : null}
            </View>
            {result.type === 'flashcards' && dueCards.length > 0 && (
              <TouchableOpacity style={[S.dueToggle, dueReviewMode && S.dueToggleActive]} onPress={() => { setDueReviewMode(d => !d); setCurrentCard(0) }}>
                <Ionicons name="time-outline" size={12} color={dueReviewMode ? C.text : C.lavender} />
                <Text style={[S.dueToggleText, dueReviewMode && { color: C.text }]}>{dueCards.length} due</Text>
              </TouchableOpacity>
            )}
            <View style={S.savedPill}>
              <Ionicons name="bookmark" size={10} color={C.lavender} />
              <Text style={S.savedPillText}>Saved</Text>
            </View>
          </View>
        </View>

        {/* Progress bar */}
        <View style={S.progressBar}>
          <Animated.View style={[S.progressFill, { width: cardProgressAnim.interpolate({ inputRange: [0,1], outputRange: ['0%','100%'] }) }]} />
        </View>

        {/* Mastery strip */}
        {answered > 0 && (
          <View style={[S.masteryStrip, { backgroundColor: mastery.color + '12', borderBottomColor: mastery.color + '25' }]}>
            <Text style={S.masteryEmoji}>{mastery.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[S.masteryLabel, { color: mastery.color }]}>{mastery.label}</Text>
              <Text style={S.masteryDesc}>{mastery.desc}</Text>
            </View>
            <TouchableOpacity style={[S.statsToggleBtn, { borderColor: mastery.color + '40' }]} onPress={() => setShowStats(s => !s)}>
              <Ionicons name={showStats ? 'bar-chart' : 'bar-chart-outline'} size={16} color={mastery.color} />
            </TouchableOpacity>
          </View>
        )}

        {/* Cheer toast */}
        {cheerMsg && (
          <Animated.View style={[S.cheerToast, { opacity: cheerAnim, transform: [{ translateY: cheerAnim.interpolate({ inputRange: [0,1], outputRange: [-12,0] }) }, { scale: cheerAnim.interpolate({ inputRange: [0,1], outputRange: [0.85,1] }) }] }]}>
            <Text style={S.cheerText}>{cheerMsg}</Text>
          </Animated.View>
        )}

        <ScrollView contentContainerStyle={S.resultBody} showsVerticalScrollIndicator={false}>

          {/* Stats panel */}
          {showStats && (
            <View style={S.statsPanel}>
              <Text style={S.statsPanelTitle}>{result.type === 'flashcards' ? 'Flashcard Review Stats' : 'Session Statistics'}</Text>
              <View style={S.statsRow}>
                <DonutChart correct={sessionCorrect} wrong={sessionWrong} total={answered} pct={pct} />
                <View style={S.statsLegend}>
                  {[
                    { color: C.emerald,  val: sessionCorrect,      label: result.type === 'flashcards' ? 'Got it' : 'Correct'   },
                    { color: C.coral,    val: sessionWrong,         label: result.type === 'flashcards' ? 'Still learning' : 'Missed' },
                    { color: C.textMute, val: total - answered,     label: 'Remaining' },
                  ].map(l => (
                    <View key={l.label} style={S.statsLegendRow}>
                      <View style={[S.statsLegendDot, { backgroundColor: l.color }]} />
                      <View><Text style={S.statsLegendVal}>{l.val}</Text><Text style={S.statsLegendLabel}>{l.label}</Text></View>
                    </View>
                  ))}
                  <View style={[S.statsLevelBadge, { backgroundColor: mastery.color + '18', borderColor: mastery.color + '40' }]}>
                    <Text style={[S.statsLevelText, { color: mastery.color }]}>{mastery.emoji} {mastery.label}</Text>
                  </View>
                </View>
              </View>
              <View style={S.masteryBarWrap}>
                {MASTERY_LEVELS.map((lvl, i) => (
                  <View key={i} style={[S.masteryBarSegment, { backgroundColor: pct >= lvl.min ? lvl.color : C.raised }, i === 0 && { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }, i === MASTERY_LEVELS.length - 1 && { borderTopRightRadius: 4, borderBottomRightRadius: 4 }]} />
                ))}
              </View>
              <View style={S.masteryBarLabels}>
                {MASTERY_LEVELS.map((lvl, i) => (
                  <Text key={i} style={[S.masteryBarLabel, pct >= lvl.min && pct <= lvl.max && { color: lvl.color, fontWeight: '800' }]}>{lvl.label}</Text>
                ))}
              </View>
            </View>
          )}

          {/* Navigation */}
          <View style={S.navRow}>
            <TouchableOpacity style={[S.navBtn, currentCard === 0 && S.navBtnDisabled]} onPress={() => currentCard > 0 && setCurrentCard(c => c - 1)}>
              <Ionicons name="chevron-back" size={18} color={currentCard === 0 ? C.textMute : C.orange} />
            </TouchableOpacity>
            <Text style={S.navLabel}>Card {currentCard + 1} of {total}</Text>
            <TouchableOpacity style={[S.navBtn, currentCard === total - 1 && S.navBtnDisabled]} onPress={() => currentCard < total - 1 && setCurrentCard(c => c + 1)}>
              <Ionicons name="chevron-forward" size={18} color={currentCard === total - 1 ? C.textMute : C.orange} />
            </TouchableOpacity>
          </View>

          {/* Current card */}
          {result.type === 'flashcards' && (() => {
            const realIdx  = indices[currentCard]
            const srCardId = currentQuizId ? `${currentQuizId}_idx_${realIdx}` : undefined
            return <FlipCard key={currentCard} front={(items[currentCard] as Flashcard).front} back={(items[currentCard] as Flashcard).back} onDifficulty={handleSRDifficulty} srCard={srCardId ? srData[srCardId] : undefined} />
          })()}
          {result.type === 'mcq'       && <MCQCard  item={items[currentCard] as MCQItem}  key={currentCard} onAnswer={handleAnswer} onRegenerate={() => handleRegenerateCard(indices[currentCard])} priorAnswer={answeredCards[currentCard]} />}
          {result.type === 'truefalse' && <TFCard   item={items[currentCard] as TFItem}   key={currentCard} onAnswer={handleAnswer} onRegenerate={() => handleRegenerateCard(indices[currentCard])} priorAnswer={answeredCards[currentCard]} />}
          {result.type === 'fillin'    && <FillCard  item={items[currentCard] as FillItem} key={currentCard} onAnswer={handleAnswer} onRegenerate={() => handleRegenerateCard(indices[currentCard])} priorAnswer={answeredCards[currentCard]} />}
          {result.type === 'mixed' && (() => {
            const item  = items[currentCard] as any
            const prior = answeredCards[currentCard]
            const regen = () => handleRegenerateCard(indices[currentCard])
            const isTF   = item._type === 'truefalse' || (typeof item.answer === 'boolean' && item.statement !== undefined)
            const isFill = item._type === 'fillin'    || (item.sentence !== undefined && item.hint !== undefined)
            const isMCQ  = item._type === 'mcq'       || (Array.isArray(item.options) && item.options.length > 0)
            if (isTF)   return <TFCard   item={item} key={currentCard} onAnswer={handleAnswer} onRegenerate={regen} priorAnswer={prior} />
            if (isFill) return <FillCard  item={item} key={currentCard} onAnswer={handleAnswer} onRegenerate={regen} priorAnswer={prior} />
            if (isMCQ)  return <MCQCard  item={item} key={currentCard} onAnswer={handleAnswer} onRegenerate={regen} priorAnswer={prior} />
            return (
              <View key={currentCard} style={{ backgroundColor: C.coralDim, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.coral + '30' }}>
                <Text style={{ fontSize: 13, color: C.coral, fontWeight: '600' }}>⚠️ Card format not recognised. Tap refresh to replace it.</Text>
                <TouchableOpacity onPress={regen} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  <Ionicons name="refresh-outline" size={16} color={C.sapphire} />
                  <Text style={{ fontSize: 13, color: C.sapphire, fontWeight: '600' }}>Replace card</Text>
                </TouchableOpacity>
              </View>
            )
          })()}

          {result.type === 'flashcards' && (
            <Text style={S.flashAssessHint}>
              {answered > 0 ? `${answered} of ${total} rated · flip each card and rate to complete` : 'Flip each card then rate Hard / Medium / Easy to track progress'}
            </Text>
          )}

          {/* Card strip */}
          <View style={S.cardStrip}>
            {items.map((_, i) => {
              const isAnswered = answeredCards[i] !== undefined
              const wasCorrect = answeredCards[i] === true
              return (
                <TouchableOpacity key={i} style={[S.stripDot, i === currentCard && S.stripDotActive, i !== currentCard && isAnswered && { backgroundColor: wasCorrect ? C.emerald : C.coral, width: 8 }]} onPress={() => setCurrentCard(i)} />
              )
            })}
          </View>

          {/* Session complete */}
          {answered >= total && (
            <View style={S.completeBlock}>
              <View style={S.completeBlob1} /><View style={S.completeBlob2} />
              <View style={[S.completeMasteryBadge, { borderColor: mastery.color + '50', backgroundColor: mastery.color + '12' }]}>
                <Text style={S.completeMasteryEmoji}>{mastery.emoji}</Text>
                <View>
                  <Text style={[S.completeMasteryLabel, { color: mastery.color }]}>{mastery.label}</Text>
                  <Text style={S.completeMasteryDesc}>{mastery.desc}</Text>
                </View>
              </View>
              <View style={S.completeScoreRow}>
                <View style={S.completeScorePill}>
                  <Text style={S.completeScoreVal}>{sessionCorrect}</Text>
                  <Text style={S.completeScoreLabel}>{result.type === 'flashcards' ? 'Got it' : 'Correct'}</Text>
                </View>
                <View style={[S.completeScorePill, { backgroundColor: C.coralDim, borderColor: C.coral + '40' }]}>
                  <Text style={[S.completeScoreVal, { color: C.coral }]}>{sessionWrong}</Text>
                  <Text style={[S.completeScoreLabel, { color: C.coral }]}>{result.type === 'flashcards' ? 'Still learning' : 'Missed'}</Text>
                </View>
                <View style={[S.completeScorePill, { backgroundColor: C.lavDim, borderColor: C.lavender + '40' }]}>
                  <Text style={[S.completeScoreVal, { color: C.lavender }]}>{pct}%</Text>
                  <Text style={[S.completeScoreLabel, { color: C.lavender }]}>Score</Text>
                </View>
              </View>
              <Text style={S.completeSubtitle}>{result.type === 'flashcards' ? 'You have rated all cards. Want a fresh set to keep drilling?' : 'You have completed all questions. Ready for a new round?'}</Text>
              <TouchableOpacity style={[S.completeRegenBtn, autoLoading && { opacity: 0.7 }]} onPress={handleRegenerateFullSet} disabled={autoLoading} activeOpacity={0.85}>
                {autoLoading ? <><ActivityIndicator size="small" color={C.text} /><Text style={S.completeRegenBtnText}>Generating…</Text></> : <><Ionicons name="sparkles" size={16} color={C.text} /><Text style={S.completeRegenBtnText}>Generate New Set</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={S.completeBackBtn} onPress={handleBack} activeOpacity={0.7}>
                <Ionicons name="arrow-back-outline" size={14} color={C.textMute} />
                <Text style={S.completeBackBtnText}>Back to generator</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    )
  }

  // ── Input / Generator view ─────────────────────────────────────────────
  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      {/* Hero */}
      <View style={S.hero}>
        <View style={S.heroBlob1} /><View style={S.heroBlob2} />
        <TouchableOpacity style={S.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>
        <View style={S.heroRow}>
          <View>
            {/* Brand wordmark */}
            <View style={S.brandRow}>
              <View style={S.brandLogo}><Text style={{ fontSize: 14 }}>🎓</Text></View>
              <Text style={S.brandWord}>student<Text style={S.brandAccent}>share</Text></Text>
            </View>
            <View style={S.premiumPill}>
              <Ionicons name="star" size={10} color={C.gold} />
              <Text style={S.premiumPillText}>PREMIUM FEATURE</Text>
            </View>
            <Text style={S.heroTitle}>Quiz & Cards</Text>
            <Text style={S.heroSub}>AI-powered study tools</Text>
          </View>
          <View style={{ gap: 8, alignItems: 'flex-end' }}>
            <TouchableOpacity style={S.analyticsBtn} onPress={() => setShowAnalytics(true)} activeOpacity={0.8}>
              <Ionicons name="bar-chart-outline" size={14} color={C.lavender} />
              <Text style={S.analyticsBtnText}>Analytics</Text>
            </TouchableOpacity>
            {triesLoaded && !isPremium && (
              <View style={S.triesBox}>
                <View style={S.triesDots}>
                  {Array.from({ length: FREE_TRIES }).map((_, i) => (
                    <View key={i} style={[S.triesDot, { backgroundColor: i < triesUsed ? C.coral + '35' : remaining <= 1 ? C.coral : remaining <= 2 ? C.gold : C.sapphire }]} />
                  ))}
                </View>
                <Text style={[S.triesLabel, { color: isLocked ? C.coral : remaining <= 2 ? C.gold : C.sapphire }]}>
                  {isLocked ? 'Upgrade for more' : `${remaining} free left`}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={[S.body, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {isAutoMode && (
          <View style={S.autoBanner}>
            <Ionicons name="document-text" size={15} color={C.lavender} />
            <View style={{ flex: 1 }}>
              <Text style={S.autoBannerLabel}>MATERIAL</Text>
              <Text style={S.autoBannerText} numberOfLines={2}>{params.title}</Text>
            </View>
          </View>
        )}
        {autoFetchFail && (
          <View style={S.warnBanner}>
            <Ionicons name="information-circle-outline" size={15} color={C.gold} />
            <Text style={S.warnBannerText}>No extracted text found — generating from title instead. Open the material in AI chat to trigger extraction, then try again.</Text>
          </View>
        )}

        {/* Content type */}
        <Text style={S.sectionLabel}>CONTENT TYPE</Text>
        <View style={S.typeRow}>
          {([
            { key: 'flashcards', icon: 'layers-outline',            label: 'Flashcards' },
            { key: 'mcq',        icon: 'list-outline',             label: 'Quiz'       },
            { key: 'truefalse',  icon: 'checkmark-circle-outline', label: 'True/False' },
            { key: 'fillin',     icon: 'create-outline',           label: 'Fill Blank' },
            { key: 'mixed',      icon: 'grid-outline',             label: 'Mixed'      },
          ] as { key: ContentType; icon: any; label: string }[]).map(t => (
            <TouchableOpacity key={t.key} style={[S.typeBtn, contentType === t.key && S.typeBtnActive]} onPress={() => setContentType(t.key)} activeOpacity={0.75}>
              <Ionicons name={t.icon} size={18} color={contentType === t.key ? C.lavender : C.textMute} />
              <Text style={[S.typeBtnText, contentType === t.key && S.typeBtnTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Difficulty */}
        <Text style={S.sectionLabel}>DIFFICULTY</Text>
        <View style={S.diffRow}>
          {([
            { key: 'easy',   label: '🌱 Easy',  color: C.emerald,  bg: C.emerDim,  border: C.emerald + '40' },
            { key: 'medium', label: '⚡ Medium', color: C.gold,     bg: C.goldDim,  border: C.gold    + '40' },
            { key: 'hard',   label: '🔥 Hard',  color: C.coral,    bg: C.coralDim, border: C.coral   + '40' },
          ] as { key: DiffLevel; label: string; color: string; bg: string; border: string }[]).map(d => (
            <TouchableOpacity key={d.key} style={[S.diffLevelBtn, diffLevel === d.key && { backgroundColor: d.bg, borderColor: d.border }]} onPress={() => setDiffLevel(d.key)} activeOpacity={0.75}>
              <Text style={[S.diffLevelText, diffLevel === d.key && { color: d.color }]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Card quantity */}
        <Text style={S.sectionLabel}>NUMBER OF CARDS</Text>
        <View style={S.qtyRow}>
          {([10, 25, 50] as CardQty[]).map(q => (
            <TouchableOpacity key={q} style={[S.qtyBtn, cardQty === q && S.qtyBtnActive]} onPress={() => setCardQty(q)} activeOpacity={0.75}>
              <Text style={[S.qtyBtnText, cardQty === q && S.qtyBtnTextActive]}>{q}</Text>
              <Text style={[S.qtyBtnSub, cardQty === q && { color: C.orange }]}>{q === 10 ? 'Quick' : q === 25 ? 'Standard' : 'Deep Dive'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Input mode */}
        {!isAutoMode && (
          <>
            <Text style={S.sectionLabel}>INPUT SOURCE</Text>
            <View style={S.modeRow}>
              {([
                { key: 'topic', icon: 'bulb-outline',     label: 'Topic' },
                { key: 'text',  icon: 'document-outline', label: 'Text'  },
                { key: 'pdf',   icon: 'document-text',    label: 'PDF'   },
              ] as { key: InputMode; icon: any; label: string }[]).map(m => (
                <TouchableOpacity key={m.key} style={[S.modeBtn, inputMode === m.key && S.modeBtnActive]} onPress={() => setInputMode(m.key)} activeOpacity={0.75}>
                  <Ionicons name={m.icon} size={16} color={inputMode === m.key ? C.orange : C.textMute} />
                  <Text style={[S.modeBtnText, inputMode === m.key && S.modeBtnTextActive]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {inputMode === 'topic' && (
              <TextInput style={S.textInput} value={topicText} onChangeText={setTopicText} placeholder="e.g. Photosynthesis, World War II, Calculus derivatives..." placeholderTextColor={C.textMute} multiline />
            )}
            {inputMode === 'text' && (
              <TextInput style={[S.textInput, { height: 140 }]} value={pasteText} onChangeText={setPasteText} placeholder="Paste your notes or reading material here..." placeholderTextColor={C.textMute} multiline textAlignVertical="top" />
            )}
            {inputMode === 'pdf' && (
              <View>
                <TouchableOpacity style={S.uploadBtn} onPress={pickPDF} activeOpacity={0.8}>
                  <Ionicons name="document-text-outline" size={22} color={C.sapphire} />
                  <Text style={S.uploadBtnText}>{pdfName ?? 'Tap to select a PDF'}</Text>
                </TouchableOpacity>
                <Text style={S.inputHint}>Supports text-based PDFs. Text is extracted automatically before generating.</Text>
              </View>
            )}
          </>
        )}

        {error && (
          <View style={S.errorBox}>
            <Ionicons name="warning-outline" size={15} color={C.coral} />
            <Text style={S.errorText}>{error}</Text>
          </View>
        )}

        {/* Saved Sets Folder */}
        {savedQuizzes.length > 0 && (
          <View style={S.folderWrap}>
            <TouchableOpacity
              style={[S.folderHeader, folderOpen && S.folderHeaderOpen]}
              onPress={() => { const toValue = folderOpen ? 0 : 1; setFolderOpen(!folderOpen); Animated.spring(folderAnim, { toValue, useNativeDriver: true, tension: 60, friction: 10 }).start() }}
              activeOpacity={0.8}
            >
              <View style={S.folderIconBox}>
                <Ionicons name={folderOpen ? 'folder-open' : 'folder'} size={18} color={C.lavender} />
              </View>
              <View style={S.folderTitleBox}>
                <Text style={S.folderTitle}>Saved Sets</Text>
                <Text style={S.folderSub}>{savedQuizzes.length} set{savedQuizzes.length !== 1 ? 's' : ''} saved</Text>
              </View>
              <Animated.View style={{ transform: [{ rotate: folderAnim.interpolate({ inputRange: [0,1], outputRange: ['0deg','90deg'] }) }] }}>
                <Ionicons name="chevron-forward" size={16} color={C.textMute} />
              </Animated.View>
            </TouchableOpacity>
            {folderOpen && (
              <Animated.View style={[S.folderContents, { opacity: folderAnim, transform: [{ translateY: folderAnim.interpolate({ inputRange: [0,1], outputRange: [-8,0] }) }] }]}>
                {savedQuizzes.map((q, index) => {
                  const iconColor = q.type === 'flashcards' ? C.lavender : q.type === 'mcq' ? C.sapphire : q.type === 'truefalse' ? C.emerald : C.gold
                  const iconBg    = q.type === 'flashcards' ? C.lavDim   : q.type === 'mcq' ? C.sapphDim  : q.type === 'truefalse' ? C.emerDim  : C.goldDim
                  return (
                    <View key={q.id} style={[S.historyCard, index === savedQuizzes.length - 1 && { borderBottomWidth: 0 }]}>
                      <TouchableOpacity style={S.historyCardMain} onPress={() => { setResult({ type: q.type, items: q.items } as GeneratedContent); setCurrentQuizId(q.id); setCurrentCard(0); setAnsweredCards({}); cardProgressAnim.setValue(1 / q.items.length) }} activeOpacity={0.75}>
                        <View style={[S.historyTypeIcon, { backgroundColor: iconBg }]}>
                          <Ionicons name={(q.type === 'flashcards' ? 'brain-outline' : q.type === 'mcq' ? 'list-outline' : q.type === 'truefalse' ? 'checkmark-circle-outline' : 'create-outline') as any} size={16} color={iconColor} />
                        </View>
                        <View style={S.historyCardInfo}>
                          <Text style={S.historyCardTitle} numberOfLines={1}>{q.title}</Text>
                          <View style={S.historyCardMeta}>
                            <Text style={[S.historyCardType, { color: iconColor }]}>{q.type === 'flashcards' ? 'Flashcards' : q.type === 'mcq' ? 'Quiz' : q.type === 'truefalse' ? 'True/False' : q.type === 'mixed' ? 'Mixed' : 'Fill Blank'}</Text>
                            <Text style={S.historyCardDot}>·</Text>
                            <Text style={S.historyCardCount}>{q.items.length} cards</Text>
                            <Text style={S.historyCardDot}>·</Text>
                            <Text style={S.historyCardDate}>{new Date(q.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>
                            {q.scoreHistory && q.scoreHistory.length > 0 && (
                              <><Text style={S.historyCardDot}>·</Text><Text style={[S.historyCardDate, { color: q.scoreHistory[q.scoreHistory.length - 1].pct >= 75 ? C.emerald : C.gold }]}>{q.scoreHistory[q.scoreHistory.length - 1].pct}% last</Text></>
                            )}
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={C.textMute} />
                      </TouchableOpacity>
                      <TouchableOpacity style={S.historyDeleteBtn} onPress={() => deleteSavedQuiz(q.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="trash-outline" size={14} color={C.coral} />
                      </TouchableOpacity>
                    </View>
                  )
                })}
              </Animated.View>
            )}
          </View>
        )}

        {/* Generate button */}
        <TouchableOpacity
          style={[S.generateBtn, isLocked && S.generateBtnLocked, (loading || autoLoading || (!isOnline && !isLocked)) && S.generateBtnDisabled]}
          onPress={isAutoMode ? triggerAutoGenerate : handleGenerate}
          disabled={loading || autoLoading}
          activeOpacity={0.85}
        >
          {loading || autoLoading ? (
            <View style={S.generateBtnInner}><ActivityIndicator color={C.text} /><Text style={S.generateBtnText}>{autoLoading ? 'Analysing material…' : inputMode === 'pdf' ? 'Reading PDF…' : 'Generating…'}</Text></View>
          ) : isLocked ? (
            <View style={S.generateBtnInner}><Ionicons name="lock-closed" size={18} color={C.void} /><Text style={[S.generateBtnText, { color: C.void }]}>Upgrade to Generate</Text></View>
          ) : !isOnline ? (
            <View style={S.generateBtnInner}><Ionicons name="cloud-offline-outline" size={18} color={C.text} /><Text style={S.generateBtnText}>Offline — can't generate</Text></View>
          ) : (
            <View style={S.generateBtnInner}><Ionicons name="sparkles" size={18} color={C.text} /><Text style={S.generateBtnText}>Generate {cardQty} {contentType === 'flashcards' ? 'Cards' : 'Questions'}</Text></View>
          )}
        </TouchableOpacity>

      </ScrollView>

      <PremiumModal visible={showPremiumModal} onClose={() => setShowPremiumModal(false)} onUpgrade={() => { setShowPremiumModal(false); router.push('/subscription' as any) }} />
    </View>
  )
}

// ─────────────────────────────────────────────
// Styles — full dark editorial system
// ─────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.void },

  // ── Hero / input screen ───────────────────────────────────────────────
  hero:      { backgroundColor: C.deep, paddingHorizontal: 20, paddingBottom: 20, paddingTop: 10, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: C.border },
  heroBlob1: { position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: C.lavDim },
  heroBlob2: { position: 'absolute', bottom: -30, left: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: C.sapphDim },
  backBtn:   { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', marginBottom: 14, alignSelf: 'flex-start' },
  heroRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },

  brandRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  brandLogo:   { width: 28, height: 28, borderRadius: 9, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 4 },
  brandWord:   { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3, fontFamily: 'serif' },
  brandAccent: { color: C.orange, fontStyle: 'italic' },

  premiumPill:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.goldDim, borderWidth: 1, borderColor: C.gold + '30', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 },
  premiumPillText: { fontSize: 9, fontWeight: '800', color: C.gold, letterSpacing: 0.8 },
  heroTitle:       { fontSize: 24, fontWeight: '900', color: C.text, letterSpacing: -0.5, fontFamily: 'serif' },
  heroSub:         { fontSize: 12, color: C.textMute, marginTop: 2 },

  analyticsBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.lavDim, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.lavender + '25' },
  analyticsBtnText: { fontSize: 11, fontWeight: '700', color: C.lavender },

  triesBox:  { alignItems: 'flex-end', gap: 5 },
  triesDots: { flexDirection: 'row', gap: 5 },
  triesDot:  { width: 10, height: 10, borderRadius: 5 },
  triesLabel:{ fontSize: 10, fontWeight: '700' },

  body: { padding: 18, gap: 14 },

  autoBanner:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.lavDim, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: C.lavender + '25' },
  autoBannerLabel: { fontSize: 9, fontWeight: '800', color: C.lavender, letterSpacing: 0.8, marginBottom: 2 },
  autoBannerText:  { fontSize: 13, fontWeight: '700', color: C.text, lineHeight: 18 },

  warnBanner:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.goldDim, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: C.gold + '25' },
  warnBannerText:{ flex: 1, fontSize: 12, color: C.gold, lineHeight: 18 },

  sectionLabel: { fontSize: 9.5, fontWeight: '700', color: C.textMute, letterSpacing: 2.5, textTransform: 'uppercase' },

  typeRow:          { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  typeBtn:          { flex: 1, minWidth: 60, alignItems: 'center', gap: 5, paddingVertical: 11, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border },
  typeBtnActive:    { backgroundColor: C.lavDim, borderColor: C.lavender + '50' },
  typeBtnText:      { fontSize: 9, fontWeight: '700', color: C.textMute, textAlign: 'center' },
  typeBtnTextActive:{ color: C.lavender },

  diffRow:       { flexDirection: 'row', gap: 8 },
  diffLevelBtn:  { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border },
  diffLevelText: { fontSize: 12, fontWeight: '700', color: C.textMute },

  qtyRow:          { flexDirection: 'row', gap: 8 },
  qtyBtn:          { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, gap: 2 },
  qtyBtnActive:    { backgroundColor: C.orangeDim, borderColor: C.orange + '40' },
  qtyBtnText:      { fontSize: 16, fontWeight: '800', color: C.textMute },
  qtyBtnTextActive:{ color: C.orange },
  qtyBtnSub:       { fontSize: 9, fontWeight: '600', color: C.textMute },

  modeRow:          { flexDirection: 'row', gap: 8 },
  modeBtn:          { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 12, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border },
  modeBtnActive:    { backgroundColor: C.orangeDim, borderColor: C.orange + '40' },
  modeBtnText:      { fontSize: 10, fontWeight: '700', color: C.textMute },
  modeBtnTextActive:{ color: C.orange },

  textInput: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 14, fontSize: 14, color: C.text, minHeight: 80, lineHeight: 21 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.sapphDim, borderWidth: 1.5, borderColor: C.sapphire + '30', borderRadius: 14, padding: 16, borderStyle: 'dashed' },
  uploadBtnText:{ flex: 1, fontSize: 13, color: C.sapphire, fontWeight: '600' },
  inputHint: { fontSize: 11, color: C.textMute, marginTop: 6, paddingHorizontal: 2, lineHeight: 16 },

  errorBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.coralDim, borderRadius: 13, padding: 13, borderWidth: 1, borderColor: C.coral + '30' },
  errorText: { flex: 1, fontSize: 13, color: C.coral, lineHeight: 19 },

  generateBtn:         { alignItems: 'center', justifyContent: 'center', backgroundColor: C.lavender, borderRadius: 16, paddingVertical: 17, shadowColor: C.lavender, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  generateBtnDisabled: { opacity: 0.55 },
  generateBtnLocked:   { backgroundColor: C.gold, shadowColor: C.gold },
  generateBtnInner:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  generateBtnText:     { fontSize: 15, fontWeight: '800', color: C.text },

  // ── Folder ────────────────────────────────────────────────────────────
  folderWrap:      { borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: C.lavender + '30', shadowColor: C.lavender, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 8, elevation: 2 },
  folderHeader:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.lavDim, padding: 15 },
  folderHeaderOpen:{ backgroundColor: C.lavDim },
  folderIconBox:   { width: 36, height: 36, borderRadius: 11, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  folderTitleBox:  { flex: 1 },
  folderTitle:     { fontSize: 14, fontWeight: '800', color: C.text },
  folderSub:       { fontSize: 11, color: C.lavender, marginTop: 1 },
  folderContents:  { backgroundColor: C.surface },

  historyCard:       { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.border },
  historyCardMain:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  historyTypeIcon:   { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  historyCardInfo:   { flex: 1 },
  historyCardTitle:  { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 3 },
  historyCardMeta:   { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  historyCardType:   { fontSize: 11, fontWeight: '600' },
  historyCardDot:    { fontSize: 11, color: C.textMute },
  historyCardCount:  { fontSize: 11, color: C.textMute },
  historyCardDate:   { fontSize: 11, color: C.textMute },
  historyDeleteBtn:  { paddingHorizontal: 13, paddingVertical: 13, borderLeftWidth: 1, borderLeftColor: C.border },

  // ── Result view ───────────────────────────────────────────────────────
  resultBody:       { padding: 18, paddingBottom: 48, gap: 16 },
  resultCountPill:  { backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.border },
  resultCountText:  { fontSize: 12, fontWeight: '700', color: C.text },

  progressBar:  { height: 3, backgroundColor: C.raised },
  progressFill: { height: 3, backgroundColor: C.emerald },

  navRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn:         { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  navBtnDisabled: { borderColor: C.border, opacity: 0.4 },
  navLabel:       { fontSize: 13, fontWeight: '600', color: C.textSub },

  cardStrip:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', paddingVertical: 4 },
  stripDot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border },
  stripDotActive:  { backgroundColor: C.lavender, width: 20, borderColor: C.lavender },

  resultHero:         { backgroundColor: C.deep, paddingHorizontal: 18, paddingBottom: 14, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: C.border },
  resultBrandRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  resultBrandCenter:  { flex: 1, alignItems: 'center' },
  resultBrandLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultBrandDot:     { width: 5, height: 5, borderRadius: 3, backgroundColor: C.orange },
  resultBrandName:    { fontSize: 13, fontWeight: '900', color: C.text, letterSpacing: 3, textTransform: 'uppercase', fontFamily: 'serif' },
  resultBrandTagline: { fontSize: 9, fontWeight: '600', color: C.textMute, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 2, textAlign: 'center' },
  resultHeroDivider:  { height: 1, backgroundColor: C.border, marginBottom: 12 },
  resultInfoRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  resultTypeIconBox:  { width: 34, height: 34, borderRadius: 11, backgroundColor: C.lavDim, borderWidth: 1, borderColor: C.lavender + '30', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  resultHeroType:     { fontSize: 15, fontWeight: '800', color: C.text },
  resultHeroMaterial: { fontSize: 11, color: C.textMute, marginTop: 2 },

  dueToggle:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.lavDim, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: C.lavender + '30' },
  dueToggleActive:{ backgroundColor: C.lavender, borderColor: C.lavender },
  dueToggleText:  { fontSize: 10, fontWeight: '700', color: C.lavender },

  savedPill:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.lavDim, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: C.lavender + '25' },
  savedPillText: { fontSize: 10, fontWeight: '700', color: C.lavender },

  masteryStrip:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1 },
  masteryEmoji:    { fontSize: 22 },
  masteryLabel:    { fontSize: 13, fontWeight: '800' },
  masteryDesc:     { fontSize: 11, color: C.textMute, marginTop: 1 },
  statsToggleBtn:  { width: 34, height: 34, borderRadius: 11, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },

  cheerToast: { position: 'absolute', bottom: 24, left: 0, right: 0, zIndex: 99, alignItems: 'center' },
  cheerText:  { backgroundColor: C.raised, color: C.text, fontSize: 13, fontWeight: '700', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },

  statsPanel:       { backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.border, gap: 14 },
  statsPanelTitle:  { fontSize: 14, fontWeight: '800', color: C.text },
  statsRow:         { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statsLegend:      { flex: 1, gap: 10 },
  statsLegendRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statsLegendDot:   { width: 12, height: 12, borderRadius: 6 },
  statsLegendVal:   { fontSize: 18, fontWeight: '800', color: C.text },
  statsLegendLabel: { fontSize: 11, color: C.textMute, marginTop: -2 },
  statsLevelBadge:  { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 4 },
  statsLevelText:   { fontSize: 12, fontWeight: '800' },
  masteryBarWrap:   { flexDirection: 'row', gap: 3, height: 8 },
  masteryBarSegment:{ flex: 1, height: 8 },
  masteryBarLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  masteryBarLabel:  { fontSize: 9, color: C.textMute, fontWeight: '600', flex: 1, textAlign: 'center' },

  flashAssessHint: { fontSize: 11, color: C.textMute, textAlign: 'center', marginTop: 6, fontStyle: 'italic' },

  // ── Complete block ────────────────────────────────────────────────────
  completeBlock:         { borderRadius: 22, borderWidth: 1.5, borderColor: C.lavender + '30', backgroundColor: C.surface, padding: 20, gap: 14, overflow: 'hidden', marginTop: 4 },
  completeBlob1:         { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: C.lavDim },
  completeBlob2:         { position: 'absolute', bottom: -30, left: -30, width: 110, height: 110, borderRadius: 55, backgroundColor: C.emerDim },
  completeMasteryBadge:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 15 },
  completeMasteryEmoji:  { fontSize: 32 },
  completeMasteryLabel:  { fontSize: 16, fontWeight: '800' },
  completeMasteryDesc:   { fontSize: 12, color: C.textSub, marginTop: 2, lineHeight: 17 },
  completeScoreRow:      { flexDirection: 'row', gap: 8 },
  completeScorePill:     { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 13, backgroundColor: C.emerDim, borderWidth: 1, borderColor: C.emerald + '40', gap: 2 },
  completeScoreVal:      { fontSize: 20, fontWeight: '800', color: C.emerald },
  completeScoreLabel:    { fontSize: 10, fontWeight: '600', color: C.emerald },
  completeSubtitle:      { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 19 },
  completeRegenBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.lavender, borderRadius: 15, paddingVertical: 16, shadowColor: C.lavender, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 12, elevation: 5 },
  completeRegenBtnText:  { fontSize: 15, fontWeight: '800', color: C.text },
  completeBackBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  completeBackBtnText:   { fontSize: 13, color: C.textMute, fontWeight: '600' },
})