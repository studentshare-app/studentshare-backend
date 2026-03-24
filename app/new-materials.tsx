/**
 * app/new-materials.tsx — Offline-First Class Materials Screen
 * Redesigned to match home screen (index.tsx) design language.
 *
 * RECENCY STRATEGY:
 *  R1  Only materials uploaded within the last 7 days are shown
 *  R2  If zero results, falls back to latest 5 materials regardless of date
 *  R3  Fallback is visually separated with a "MOST RECENT" section header
 *
 * NO-FLASH STRATEGY (no React Query):
 *  F1  Single bootstrap useEffect — reads AsyncStorage first, sets data, then
 *      calls setReady(true). The first render after ready already has content.
 *  F2  ready state gates skeletons — skeletons only show for the ~10ms before
 *      AsyncStorage resolves. On return visits the cache is instant → no flash.
 *  F3  classIdRef — ref alongside state so onRefresh always has the latest
 *      classId even if called before state settles.
 *  F4  Background live fetch runs after cache is shown — zero perceived delay.
 *
 * OFFLINE STRATEGY:
 *  O1  On every successful fetch, materials are written to AsyncStorage
 *  O2  Cache shown immediately on every visit — no empty frame ever
 *  O3  "NEW" badge on unseen items, auto-marked after 3s
 *  O4  Gold offline banner (matching home) when device has no connectivity
 *  O5  Pull-to-refresh disabled offline
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
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import {
  addBookmark,
  fetchBookmarkedIds,
  removeBookmark,
} from '../lib/queries/screens'

// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens — matches home screen exactly
// ─────────────────────────────────────────────────────────────────────────────
const C: Record<string, string> = {
  void:       '#07080C',
  deep:       '#0B0D13',
  surface:    '#10131C',
  raised:     '#161B27',
  lift2:      '#1C2232',
  border:     'rgba(255,255,255,0.055)',
  borderHi:   'rgba(255,255,255,0.10)',
  text:       '#EEF0F8',
  textSub:    '#6E7A96',
  textMute:   '#353D52',
  orange:     '#E8692A',
  orange2:    '#F07840',
  orangeDim:  'rgba(232,105,42,0.10)',
  orangeGlow: 'rgba(232,105,42,0.18)',
  gold:       '#DFA83C',
  goldDim:    'rgba(223,168,60,0.10)',
  goldGlow:   '#B8841E',
  sapphire:   '#4B8CF5',
  sapphDim:   'rgba(75,140,245,0.10)',
  sapphGlow:  '#2D5AB8',
  emerald:    '#3DC99A',
  emerDim:    'rgba(61,201,154,0.10)',
  lavender:   '#9B7CF4',
  lavDim:     'rgba(155,124,244,0.10)',
  coral:      '#EE6868',
  coralDim:   'rgba(238,104,104,0.10)',
  silver:     '#C0C8D8',
  silverDim:  '#1A1E26',
  bronze:     '#CD7F44',
  bronzeDim:  '#221408',
  amber:      '#FBBD34',
  sky:        '#38BDF8',
  skyDim:     'rgba(56,189,248,0.10)',
  pink:       '#E879F9',
  pinkDim:    'rgba(232,121,249,0.10)',
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type MaterialRecord = {
  id:            string
  title:         string
  type:          'past_question' | 'slide' | 'book' | 'tutorial'
  file_url:      string
  file_size:     number | null
  is_premium:    boolean
  academic_year: string | null
  content_text:  string | null
  cover_url:     string | null
  lecturer_id:   string | null
  created_at:    string
  courses: {
    name:     string
    code:     string
    class_id: string
  } | null
  lecturers?: { name: string } | null
}

type FilterType = 'all' | 'past_question' | 'slide' | 'book' | 'tutorial'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  past_question: { label: 'Past Q',    color: C.sapphire, bg: C.sapphDim, borderColor: 'rgba(75,140,245,0.20)',  icon: 'document-text' as const },
  slide:         { label: 'Slides',    color: C.lavender, bg: C.lavDim,   borderColor: 'rgba(155,124,244,0.20)', icon: 'easel'          as const },
  book:          { label: 'Books',     color: C.emerald,  bg: C.emerDim,  borderColor: 'rgba(61,201,154,0.20)',  icon: 'book'           as const },
  tutorial:      { label: 'Tutorials', color: C.gold,     bg: C.goldDim,  borderColor: 'rgba(223,168,60,0.20)',  icon: 'play-circle'    as const },
}

const FILTER_TABS: { key: FilterType; label: string; emoji: string }[] = [
  { key: 'all',           label: 'All',       emoji: '▤'  },
  { key: 'past_question', label: 'Past Q',    emoji: '📄' },
  { key: 'slide',         label: 'Slides',    emoji: '🖥'  },
  { key: 'book',          label: 'Books',     emoji: '📖' },
  { key: 'tutorial',      label: 'Tutorials', emoji: '▶'  },
]

// 7-day recency window — professional standard
const RECENCY_MS          = 7 * 24 * 60 * 60 * 1000
const FALLBACK_LIMIT      = 5

const MATERIALS_CACHE_KEY = 'studentshare_materials_cache'
const MATERIALS_META_KEY  = 'studentshare_materials_meta'
const SEEN_IDS_KEY        = 'studentshare_materials_seen_ids'
const PROFILE_CACHE_KEY   = 'studentshare_user_id_cache'
const CLASS_CACHE_KEY     = 'studentshare_class_id_cache'

const BODY_H_PAD = 22

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)   return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fmtSize(bytes: number | null): string | null {
  if (!bytes) return null
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function safeParseMaterials(raw: string | null): MaterialRecord[] {
  if (!raw) return []
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : [] } catch { return [] }
}

function safeParseSeenIds(raw: string | null): Set<string> {
  if (!raw) return new Set()
  try { const p = JSON.parse(raw); return new Set(Array.isArray(p) ? p : []) } catch { return new Set() }
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase fetch — 7-day recency filter applied server-side
// ─────────────────────────────────────────────────────────────────────────────
async function fetchMaterialsByClassId(
  classId: string,
): Promise<{ recent: MaterialRecord[]; fallback: MaterialRecord[]; isFallback: boolean }> {
  const sevenDaysAgo = new Date(Date.now() - RECENCY_MS).toISOString()

  const { data: recentData, error: recentError } = await supabase
    .from('materials')
    .select(`
      id, title, type, file_url, file_size, is_premium,
      academic_year, content_text, cover_url, lecturer_id,
      created_at,
      courses ( name, code, class_id ),
      lecturers ( name )
    `)
    .eq('status', 'published')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })

  if (recentError) throw new Error(recentError.message)

  const recent = ((recentData ?? []).filter(
    (m: any) => m.courses?.class_id === classId,
  ) as unknown) as MaterialRecord[]

  if (recent.length > 0) return { recent, fallback: [], isFallback: false }

  // Fallback: latest 5 regardless of date
  const { data: fallbackData, error: fallbackError } = await supabase
    .from('materials')
    .select(`
      id, title, type, file_url, file_size, is_premium,
      academic_year, content_text, cover_url, lecturer_id,
      created_at,
      courses ( name, code, class_id ),
      lecturers ( name )
    `)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(50)

  if (fallbackError) throw new Error(fallbackError.message)

  const fallback = ((fallbackData ?? [])
    .filter((m: any) => m.courses?.class_id === classId)
    .slice(0, FALLBACK_LIMIT) as unknown) as MaterialRecord[]

  return { recent: [], fallback, isFallback: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared components — identical to home screen
// ─────────────────────────────────────────────────────────────────────────────
function SectionHead({ title, link, onLink }: { title: string; link?: string; onLink?: () => void }) {
  return (
    <View style={sh.wrap}>
      <View style={sh.labelRow}>
        <View style={sh.line} />
        <Text style={sh.title}>{title.toUpperCase()}</Text>
      </View>
      {onLink && (
        <TouchableOpacity onPress={onLink} activeOpacity={0.7}>
          <Text style={sh.link}>{link}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}
const sh = StyleSheet.create({
  wrap:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line:     { width: 14, height: 1, backgroundColor: C.orange, opacity: 0.7 },
  title:    { fontSize: 9.5, fontWeight: '700', color: C.textMute, letterSpacing: 2.8 },
  link:     { fontSize: 10.5, fontWeight: '600', color: C.orange, letterSpacing: 0.3 },
})

function TagChip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[tc.chip, { backgroundColor: bg, borderColor: color + '30' }]}>
      <Text style={[tc.text, { color }]}>{label}</Text>
    </View>
  )
}
const tc = StyleSheet.create({
  chip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
})

function OfflineBanner() {
  return (
    <View style={ob.wrap}>
      <Ionicons name="cloud-offline-outline" size={13} color={C.gold} />
      <Text style={ob.text}>Offline — showing cached materials</Text>
    </View>
  )
}
const ob = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: 'rgba(223,168,60,0.12)',
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: C.gold + '30',
  },
  text: { fontSize: 12, fontWeight: '600', color: C.gold },
})

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton card
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonCard({ index }: { index: number }) {
  const pulse = useRef(new Animated.Value(0.35)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.7,  duration: 750, delay: index * 80, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])
  return (
    <Animated.View style={[sk.card, { opacity: pulse }]}>
      <View style={sk.iconBox} />
      <View style={sk.body}>
        <View style={sk.pill} />
        <View style={sk.titleBar} />
        <View style={sk.subBar} />
        <View style={sk.metaRow}>
          <View style={sk.metaChip} />
          <View style={sk.metaChip} />
        </View>
      </View>
      <View style={sk.actions}>
        <View style={sk.actionBtn} />
        <View style={sk.actionBtn} />
        <View style={sk.actionBtn} />
      </View>
    </Animated.View>
  )
}
const sk = StyleSheet.create({
  card:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 20, padding: 14, gap: 12, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  iconBox:   { width: 52, height: 52, borderRadius: 14, backgroundColor: C.raised, flexShrink: 0 },
  body:      { flex: 1, gap: 7 },
  pill:      { width: 48, height: 14, borderRadius: 6, backgroundColor: C.raised },
  titleBar:  { width: '80%', height: 14, borderRadius: 6, backgroundColor: C.raised },
  subBar:    { width: '50%', height: 10, borderRadius: 5, backgroundColor: C.raised },
  metaRow:   { flexDirection: 'row', gap: 8, marginTop: 2 },
  metaChip:  { width: 48, height: 10, borderRadius: 5, backgroundColor: C.raised },
  actions:   { gap: 8 },
  actionBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.raised },
})

// ─────────────────────────────────────────────────────────────────────────────
// Material card
// ─────────────────────────────────────────────────────────────────────────────
function MaterialCard({
  item, index, isNew, isBookmarked, bookmarkLoading,
  onOpen, onChat, onToggleBookmark, onQuiz,
}: {
  item:             MaterialRecord
  index:            number
  isNew:            boolean
  isBookmarked:     boolean
  bookmarkLoading:  boolean
  onOpen:           () => void
  onChat:           () => void
  onToggleBookmark: () => void
  onQuiz:           () => void
}) {
  const opacity    = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(16)).current
  const cfg        = TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.past_question
  const isBook     = item.type === 'book'
  const size       = fmtSize(item.file_size)

  useEffect(() => {
    const delay = Math.min(index, 5) * 65
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 320, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 320, delay, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <TouchableOpacity style={card.wrap} activeOpacity={0.78} onPress={onOpen}>
        <View style={[card.accentLine, { backgroundColor: cfg.color }]} />

        {isBook && item.cover_url ? (
          <Image source={{ uri: item.cover_url }} style={card.cover} resizeMode="cover" />
        ) : (
          <View style={[card.iconBox, { backgroundColor: cfg.bg, borderColor: cfg.color + '20' }]}>
            <Ionicons name={cfg.icon} size={22} color={cfg.color} />
          </View>
        )}

        <View style={card.body}>
          <View style={card.badgeRow}>
            <TagChip label={cfg.label} color={cfg.color} bg={cfg.bg} />
            {isNew && (
              <View style={card.newBadge}>
                <Text style={card.newBadgeText}>NEW</Text>
              </View>
            )}
            {item.is_premium && (
              <View style={card.premiumPill}>
                <Ionicons name="lock-closed" size={9} color={C.gold} />
                <Text style={card.premiumPillText}>Premium</Text>
              </View>
            )}
            {item.content_text && (
              <View style={card.aiBadge}>
                <Text style={card.aiBadgeText}>✦ AI</Text>
              </View>
            )}
          </View>

          <Text style={card.title} numberOfLines={2}>{item.title}</Text>
          <Text style={card.course} numberOfLines={1}>
            {item.courses?.name ?? '—'}
            {item.lecturers?.name ? `  ·  ${item.lecturers.name}` : ''}
          </Text>

          <View style={card.metaRow}>
            {item.academic_year && item.type !== 'book' && (
              <View style={card.metaChip}>
                <Ionicons name="calendar-outline" size={10} color={C.textMute} />
                <Text style={card.metaText}>{item.academic_year}</Text>
              </View>
            )}
            {size && (
              <View style={card.metaChip}>
                <Ionicons name="document-outline" size={10} color={C.textMute} />
                <Text style={card.metaText}>{size}</Text>
              </View>
            )}
            <View style={card.metaChip}>
              <Ionicons name="time-outline" size={10} color={C.textMute} />
              <Text style={card.metaText}>{timeAgo(item.created_at)}</Text>
            </View>
          </View>
        </View>

        <View style={card.actions}>
          <TouchableOpacity
            style={[card.actionBtn, isBookmarked && card.actionBtnBookmarkActive]}
            onPress={onToggleBookmark}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {bookmarkLoading
              ? <ActivityIndicator size="small" color={C.gold} />
              : <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={15} color={C.gold} />
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={card.actionBtnChat}
            onPress={onChat}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="sparkles" size={15} color={C.sapphire} />
          </TouchableOpacity>

          <TouchableOpacity
            style={card.actionBtnQuiz}
            onPress={onQuiz}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={"school-outline" as any} size={15} color={C.lavender} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

const card = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 20,
    borderWidth: 1, borderColor: C.border,
    padding: 14, gap: 12, marginBottom: 10,
    position: 'relative', overflow: 'hidden',
  },
  accentLine: { position: 'absolute', left: 0, top: 14, bottom: 14, width: 2, borderRadius: 1, opacity: 0.7 },
  cover:   { width: 52, height: 72, borderRadius: 10, backgroundColor: C.raised, flexShrink: 0 },
  iconBox: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1, flexShrink: 0 },
  body:    { flex: 1, gap: 5 },

  badgeRow:        { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  newBadge:        { backgroundColor: C.emerDim, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: C.emerald + '40' },
  newBadgeText:    { fontSize: 9, fontWeight: '900', color: C.emerald, letterSpacing: 0.6 },
  premiumPill:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.goldDim, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: C.gold + '30' },
  premiumPillText: { fontSize: 10, fontWeight: '700', color: C.gold },
  aiBadge:         { backgroundColor: C.emerDim, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: C.emerald + '30' },
  aiBadgeText:     { fontSize: 10, fontWeight: '700', color: C.emerald },

  title:  { fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 20 },
  course: { fontSize: 12, color: C.textMute },

  metaRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 10, color: C.textMute },

  actions:                { gap: 8, flexShrink: 0 },
  actionBtn:              { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  actionBtnBookmarkActive:{ backgroundColor: C.goldDim, borderColor: C.gold + '40' },
  actionBtnChat:          { width: 34, height: 34, borderRadius: 10, backgroundColor: C.sapphDim, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.sapphire + '30' },
  actionBtnQuiz:          { width: 34, height: 34, borderRadius: 10, backgroundColor: C.lavDim,   justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.lavender + '30' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function NewMaterialsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // ── Core data state ────────────────────────────────────────────────────────
  const [ready,      setReady]      = useState(false)
  const [recent,     setRecent]     = useState<MaterialRecord[]>([])
  const [fallback,   setFallback]   = useState<MaterialRecord[]>([])
  const [isFallback, setIsFallback] = useState(false)
  const [isOnline,   setIsOnline]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // ── Auth / class ───────────────────────────────────────────────────────────
  const [userId,  setUserId]  = useState<string | null>(null)
  const [classId, setClassId] = useState<string | null>(null)
  // Ref keeps classId accessible in callbacks without stale closure
  const classIdRef = useRef<string | null>(null)

  // ── UI ─────────────────────────────────────────────────────────────────────
  const [filter,          setFilter]          = useState<FilterType>('all')
  const [search,          setSearch]          = useState('')
  const [bookmarkedIds,   setBookmarkedIds]   = useState<Set<string>>(new Set())
  const [bookmarkLoading, setBookmarkLoading] = useState<string | null>(null)

  // ── Seen-ids tracking ──────────────────────────────────────────────────────
  const seenIdsRef    = useRef<Set<string>>(new Set())
  const seenLoadedRef = useRef(false)

  // ── Hero entrance animation ────────────────────────────────────────────────
  const heroOpacity = useRef(new Animated.Value(0)).current
  const heroY       = useRef(new Animated.Value(-10)).current

  // ── Derived ───────────────────────────────────────────────────────────────
  const allMaterials: MaterialRecord[] = isFallback ? fallback : recent

  // ─────────────────────────────────────────────────────────────────────────
  // liveFetch — shared by bootstrap and pull-to-refresh
  // ─────────────────────────────────────────────────────────────────────────
  const liveFetch = useCallback(async (cid: string, cancelled = false) => {
    try {
      const result = await fetchMaterialsByClassId(cid)
      if (cancelled) return
      setIsOnline(true)
      setRecent(result.recent)
      setFallback(result.fallback)
      setIsFallback(result.isFallback)
      const toCache = result.isFallback ? result.fallback : result.recent
      void AsyncStorage.setItem(MATERIALS_CACHE_KEY, JSON.stringify(toCache)).catch(() => {})
      void AsyncStorage.setItem(MATERIALS_META_KEY,  JSON.stringify({ isFallback: result.isFallback })).catch(() => {})
    } catch {
      if (!cancelled) setIsOnline(false)
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // SINGLE BOOTSTRAP — cache first, live fetch in background
  //
  // Key guarantee: setReady(true) is called AFTER cache data is in state.
  // So the first render after ready=true already has content — zero flash.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      // Step 1 — read all AsyncStorage in parallel
      const [rawMaterials, rawMeta, rawSeen, cachedUserId, cachedClassId] = await Promise.all([
        AsyncStorage.getItem(MATERIALS_CACHE_KEY).catch(() => null),
        AsyncStorage.getItem(MATERIALS_META_KEY).catch(() => null),
        AsyncStorage.getItem(SEEN_IDS_KEY).catch(() => null),
        AsyncStorage.getItem(PROFILE_CACHE_KEY).catch(() => null),
        AsyncStorage.getItem(CLASS_CACHE_KEY).catch(() => null),
      ])

      if (cancelled) return

      // Step 2 — hydrate state synchronously before setReady
      const cachedList = safeParseMaterials(rawMaterials)
      let cachedIsFallback = false
      try { const m = JSON.parse(rawMeta ?? '{}'); cachedIsFallback = !!m.isFallback } catch {}

      if (cachedList.length > 0) {
        if (cachedIsFallback) { setFallback(cachedList); setIsFallback(true) }
        else                  { setRecent(cachedList);   setIsFallback(false) }
      }

      seenIdsRef.current    = safeParseSeenIds(rawSeen)
      seenLoadedRef.current = true

      const resolvedClassId = cachedClassId ?? null
      if (cachedUserId)    setUserId(cachedUserId)
      if (resolvedClassId) { setClassId(resolvedClassId); classIdRef.current = resolvedClassId }

      // Step 3 — mark ready: first post-ready render already has cached data
      setReady(true)

      // Step 4 — animate hero in
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(heroY,       { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start()

      // Step 5 — resolve live session in background
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (cancelled) return
        if (error || !session?.user) { setIsOnline(false); return }

        setIsOnline(true)
        const uid = session.user.id
        setUserId(uid)
        void AsyncStorage.setItem(PROFILE_CACHE_KEY, uid).catch(() => {})

        let cid = resolvedClassId
        if (!cid) {
          const { data: profile } = await supabase
            .from('profiles').select('class_id').eq('id', uid).single()
          cid = profile?.class_id ?? null
          if (cid) void AsyncStorage.setItem(CLASS_CACHE_KEY, cid).catch(() => {})
        }

        if (!cid || cancelled) return
        setClassId(cid)
        classIdRef.current = cid

        void fetchBookmarkedIds(uid)
          .then(ids => { if (!cancelled) setBookmarkedIds(ids) })
          .catch(() => {})

        // Step 6 — live fetch silently updates behind cache
        await liveFetch(cid, cancelled)
      } catch {
        if (!cancelled) setIsOnline(false)
      }
    }

    bootstrap()
    return () => { cancelled = true }
  }, [liveFetch])

  // ── Pull-to-refresh ───────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    if (!isOnline) return
    const cid = classIdRef.current
    if (!cid) return
    setRefreshing(true)
    await liveFetch(cid)
    setRefreshing(false)
  }, [isOnline, liveFetch])

  // ── NEW badge ─────────────────────────────────────────────────────────────
  const newIds = useMemo(() => {
    if (!seenLoadedRef.current) return new Set<string>()
    return new Set(allMaterials.filter(m => !seenIdsRef.current.has(m.id)).map(m => m.id))
  }, [allMaterials])

  useEffect(() => {
    if (!allMaterials.length || !seenLoadedRef.current) return
    const timer = setTimeout(() => {
      allMaterials.forEach(m => seenIdsRef.current.add(m.id))
      void AsyncStorage.setItem(SEEN_IDS_KEY, JSON.stringify([...seenIdsRef.current])).catch(() => {})
    }, 3000)
    return () => clearTimeout(timer)
  }, [allMaterials])

  // ── Filter + search ───────────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = filter === 'all' ? allMaterials : allMaterials.filter(m => m.type === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        m =>
          m.title.toLowerCase().includes(q) ||
          (m.courses?.name ?? '').toLowerCase().includes(q) ||
          (m.courses?.code ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [allMaterials, filter, search])

  const counts = useMemo(() =>
    allMaterials.reduce<Record<string, number>>((acc, m) => {
      acc[m.type] = (acc[m.type] || 0) + 1; return acc
    }, {}),
  [allMaterials])

  // ── Bookmark toggle ───────────────────────────────────────────────────────
  const toggleBookmark = useCallback(async (item: MaterialRecord) => {
    if (!userId) return
    const was = bookmarkedIds.has(item.id)
    setBookmarkedIds(prev => { const n = new Set(prev); was ? n.delete(item.id) : n.add(item.id); return n })
    setBookmarkLoading(item.id)
    try {
      if (was) await removeBookmark(userId, item.id)
      else     await addBookmark(userId, item.id)
    } catch {
      setBookmarkedIds(prev => { const n = new Set(prev); was ? n.add(item.id) : n.delete(item.id); return n })
      Alert.alert('Bookmark error', 'Could not update bookmark. Try again.')
    } finally { setBookmarkLoading(null) }
  }, [userId, bookmarkedIds])

  // ── Open material ─────────────────────────────────────────────────────────
  const openMaterial = useCallback((item: MaterialRecord) => {
    seenIdsRef.current.add(item.id)
    void AsyncStorage.setItem(SEEN_IDS_KEY, JSON.stringify([...seenIdsRef.current])).catch(() => {})
    router.push({
      pathname: '/viewer' as any,
      params: {
        file_url: item.file_url, title: item.title,
        color: TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG]?.color ?? C.sapphire,
        material_id: item.id,
      },
    })
  }, [router])

  // ── Quiz ──────────────────────────────────────────────────────────────────
  const openQuiz = useCallback((item: MaterialRecord) => {
    router.push({
      pathname: '/quiz-flashcards' as any,
      params: { material_id: item.id, title: item.title, file_url: item.file_url, type: item.type, auto_generate: '1' },
    })
  }, [router])

  // Skeletons only shown before AsyncStorage resolves (~10ms first visit, never on return)
  const showSkeletons = !ready
  const NAV_H = insets.top + 58

  return (
    <View style={S.root}>

      {/* ════ FIXED NAV BAR — identical structure to home ════ */}
      <View style={[S.nav, { paddingTop: insets.top + 10 }]}>
        <View style={S.orbOrange} />
        <View style={S.orbBlue} />
        <View style={S.orbPurple} />

        {/* Back — left, before brand */}
        <TouchableOpacity style={S.navBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={16} color={C.textSub} />
        </TouchableOpacity>

        {/* Brand */}
        <View style={S.navBrand}>
          <View style={S.navLogo}>
            <Text style={{ fontSize: 16 }}>🎓</Text>
          </View>
          <Text style={S.navWordmark}>
            student<Text style={S.navWordmarkAccent}>share</Text>
          </Text>
        </View>

        <View style={{ flex: 1 }} />
      </View>

      {!isOnline && allMaterials.length > 0 && <OfflineBanner />}

      {/* ════ HERO ════ */}
      <Animated.View
        style={[S.hero, { paddingTop: NAV_H + 18 }, { opacity: heroOpacity, transform: [{ translateY: heroY }] }]}
      >
        <View style={S.blob1} />
        <View style={S.blob2} />

        <View style={S.heroTitleRow}>
          <Text style={S.heroTitle}>Class Materials</Text>
          {newIds.size > 0 && (
            <View style={S.heroNewBadge}>
              <Text style={S.heroNewBadgeText}>{newIds.size} new</Text>
            </View>
          )}
        </View>

        <Text style={S.heroSub}>
          {showSkeletons
            ? 'Loading…'
            : isFallback
              ? `Nothing new this week · showing ${fallback.length} most recent`
              : `${allMaterials.length} material${allMaterials.length !== 1 ? 's' : ''} in the last 7 days`
          }
        </Text>

        {!showSkeletons && allMaterials.length > 0 && (
          <View style={S.summaryRow}>
            {(Object.entries(TYPE_CONFIG) as [keyof typeof TYPE_CONFIG, (typeof TYPE_CONFIG)[keyof typeof TYPE_CONFIG]][]).map(([key, cfg]) => {
              const n = counts[key] || 0
              if (!n) return null
              const active = filter === key
              return (
                <TouchableOpacity
                  key={key}
                  style={[S.summaryChip, { backgroundColor: active ? cfg.bg : C.surface }, active && { borderColor: cfg.color + '40' }]}
                  onPress={() => setFilter(prev => prev === key ? 'all' : key)}
                  activeOpacity={0.75}
                >
                  <Ionicons name={cfg.icon} size={11} color={active ? cfg.color : C.textMute} />
                  <Text style={[S.summaryChipText, { color: active ? cfg.color : C.textSub }]}>{n} {cfg.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        <View style={S.searchWrap}>
          <Ionicons name="search" size={14} color={C.textMute} style={{ marginLeft: 13 }} />
          <TextInput
            style={S.searchInput}
            placeholder="Search by title or course…"
            placeholderTextColor={C.textMute}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={{ paddingRight: 13 }}>
              <Ionicons name="close-circle" size={16} color={C.textMute} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={S.filterScroll} style={S.filterBar}
        >
          {FILTER_TABS.map(tab => {
            const active   = filter === tab.key
            const tabCount = tab.key === 'all' ? allMaterials.length : (counts[tab.key] || 0)
            return (
              <TouchableOpacity
                key={tab.key}
                style={[S.filterPill, active && S.filterPillActive]}
                onPress={() => setFilter(tab.key)}
                activeOpacity={0.75}
              >
                <Text style={S.filterEmoji}>{tab.emoji}</Text>
                <Text style={[S.filterLabel, active && S.filterLabelActive]}>{tab.label}</Text>
                {tabCount > 0 && (
                  <View style={[S.filterCount, active && S.filterCountActive]}>
                    <Text style={[S.filterCountText, active && S.filterCountTextActive]}>{tabCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </Animated.View>

      {/* ════ LIST ════ */}
      {showSkeletons ? (
        <FlatList
          data={Array(6).fill(null)}
          keyExtractor={(_, i) => `skel_${i}`}
          contentContainerStyle={S.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ index }) => <SkeletonCard index={index} />}
        />
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={item => item.id}
          contentContainerStyle={[S.list, displayed.length === 0 && S.listEmpty]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            isOnline ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.orange} colors={[C.orange]} />
            ) : undefined
          }
          ListHeaderComponent={
            isFallback && displayed.length > 0 ? (
              <View style={S.fallbackHeader}>
                <View style={S.fallbackDivider} />
                <SectionHead title="Most Recent" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={S.emptyState}>
              <View style={S.emptyIcon}>
                <Ionicons
                  name={!isOnline && allMaterials.length === 0 ? 'cloud-offline-outline' : 'library-outline'}
                  size={32} color={C.textMute}
                />
              </View>
              <Text style={S.emptyTitle}>
                {!isOnline && allMaterials.length === 0 ? 'No cached materials'
                  : search.trim() ? 'No results found'
                  : filter !== 'all' ? `No ${TYPE_CONFIG[filter as keyof typeof TYPE_CONFIG]?.label ?? filter} yet`
                  : 'Nothing new this week'}
              </Text>
              <Text style={S.emptySub}>
                {!isOnline && allMaterials.length === 0
                  ? 'Connect to the internet to load your class materials for the first time.'
                  : search.trim() ? `No materials match "${search}". Try a different term.`
                  : filter !== 'all' ? 'Try a different filter or pull down to refresh.'
                  : 'New materials uploaded in the last 7 days will appear here. Pull down to refresh.'}
              </Text>
              {filter !== 'all' && (
                <TouchableOpacity style={S.clearBtn} onPress={() => setFilter('all')}>
                  <Text style={S.clearBtnText}>Show all materials</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item, index }) => (
            <MaterialCard
              item={item} index={index}
              isNew={newIds.has(item.id)}
              isBookmarked={bookmarkedIds.has(item.id)}
              bookmarkLoading={bookmarkLoading === item.id}
              onOpen={() => openMaterial(item)}
              onChat={() => router.push({
                pathname: '/chat' as any,
                params: { material_title: item.title, file_url: item.file_url, material_id: item.id },
              })}
              onToggleBookmark={() => toggleBookmark(item)}
              onQuiz={() => openQuiz(item)}
            />
          )}
        />
      )}
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.void },

  nav: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  navBrand:          { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 0 },
  navLogo:           { width: 34, height: 34, borderRadius: 11, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 18, elevation: 8 },
  navWordmark:       { fontSize: 19, fontWeight: '700', color: C.text, letterSpacing: -0.4, fontFamily: 'serif' },
  navWordmarkAccent: { color: C.orange, fontStyle: 'italic' },
  navBtn:            { width: 38, height: 38, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },

  orbOrange: { position: 'absolute', top: -120, right: -80,  width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(232,105,42,0.12)' },
  orbBlue:   { position: 'absolute', top:   40, left: -60,   width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(75,140,245,0.07)'  },
  orbPurple: { position: 'absolute', top:   80, left: '38%', width: 160, height: 160, borderRadius: 80,  backgroundColor: 'rgba(155,124,244,0.06)' },

  hero: { backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingBottom: 0, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: C.border },
  blob1: { position: 'absolute', width: 280, height: 280, borderRadius: 140, top: -130, right: -90, backgroundColor: '#1A56DB', opacity: 0.07 },
  blob2: { position: 'absolute', width: 180, height: 180, borderRadius: 90,  bottom: -70, left: -50, backgroundColor: '#7C3AED', opacity: 0.06 },

  heroTitleRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  heroTitle:        { fontSize: 28, fontWeight: '900', fontFamily: 'serif', color: C.text, letterSpacing: -0.8, lineHeight: 32 },
  heroNewBadge:     { backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orange + '40', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  heroNewBadgeText: { fontSize: 11, fontWeight: '800', color: C.orange },
  heroSub:          { fontSize: 12, color: C.textSub, marginBottom: 16 },

  summaryRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  summaryChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: C.border },
  summaryChipText: { fontSize: 11, fontWeight: '700' },

  searchWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, marginBottom: 12, height: 42 },
  searchInput: { flex: 1, fontSize: 13, color: C.text, paddingVertical: 0, paddingHorizontal: 8 },

  filterBar:             { marginBottom: 0 },
  filterScroll:          { gap: 6, paddingBottom: 14 },
  filterPill:            { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border },
  filterPillActive:      { backgroundColor: C.orangeDim, borderColor: C.orange + '40' },
  filterEmoji:           { fontSize: 12 },
  filterLabel:           { fontSize: 12, fontWeight: '600', color: C.textSub },
  filterLabelActive:     { color: C.orange },
  filterCount:           { backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center' },
  filterCountActive:     { backgroundColor: C.orangeDim },
  filterCountText:       { fontSize: 10, fontWeight: '800', color: C.textSub },
  filterCountTextActive: { color: C.orange },

  list:      { paddingHorizontal: BODY_H_PAD, paddingTop: 14, paddingBottom: 48 },
  listEmpty: { flex: 1 },

  fallbackHeader:  { marginBottom: 4 },
  fallbackDivider: { height: 1, backgroundColor: C.border, marginBottom: 16, opacity: 0.5 },

  emptyState: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 60, paddingBottom: 40 },
  emptyIcon:  { width: 80, height: 80, borderRadius: 24, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  clearBtn:   { backgroundColor: C.orangeDim, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: C.orange + '30' },
  clearBtnText: { fontSize: 13, fontWeight: '700', color: C.orange },
})