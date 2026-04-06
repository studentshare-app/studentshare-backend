/**
 * app/(tabs)/search.tsx  — v3
 *
 * Per-tab Trending + Top Results
 * ─────────────────────────────────────────────────────────────────────────────
 * MATERIALS  → Trending Searches (top 5 queries across all users, category='materials')
 *              Top Results: latest 5 published materials
 *
 * PEOPLE     → Trending People (top 5 profile names searched by all users)
 *              Top Results: profiles matching this user's past people searches
 *
 * COURSES    → Trending Courses (top 5 course names searched by all users)
 *              Top Results: courses matching this user's past course searches
 *
 * FORUM      → Trending Forum Pages (top posts by interaction_count)
 *              Top Results: forum posts matching this user's past forum searches
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MIGRATIONS NEEDED (run once in Supabase SQL editor):
 *
 *   -- 1. Add category to search_logs so trending can be filtered per tab
 *   ALTER TABLE search_logs
 *     ADD COLUMN IF NOT EXISTS category text DEFAULT 'materials';
 *
 *   -- 2. Add interaction_count to forum_posts for trending forum pages
 *   --    (skip if your forum table already tracks this)
 *   ALTER TABLE forum_posts
 *     ADD COLUMN IF NOT EXISTS interaction_count integer DEFAULT 0;
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * All fetches are wrapped in try/catch — if a table/column doesn't exist yet,
 * the section shows an empty state instead of crashing.
 *
 * Logic/state: UNCHANGED — doSearch, debounce, bookmarks, downloads, premium
 * gate, history, usePremium all identical to previous version.
 */

import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { downloadMaterial } from '@/core/sync/fileSyncService'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/core/api/supabase'
import { ROUTES } from '@/core/config/routes'
import { useProfileSync } from '@/hooks/useProfileSync'
import {
  addBookmark,
  removeBookmark,
  fetchBookmarkedIds,
  fetchSearchHistory,
  saveSearchHistory,
  clearSearchHistory,
  logSearch,
  type TrendingItem,
} from '@/lib/queries/screens'
import {
  registryAdd,
  useDownloadRegistry,
} from '@/lib/useDownloadRegistry'
import { usePremium } from '@/core/entitlements/PremiumProvider'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

// ─────────────────────────────────────────────
// Design tokens — identical to index.tsx
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
  skyDim:    'rgba(56,189,248,0.10)',
  pink:      '#E879F9',
  pinkDim:   'rgba(232,121,249,0.10)',
} as const

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Result = {
  id: string
  title: string
  type: string
  file_url: string
  created_at: string
  courses: { name: string }[] | { name: string } | null
}

type PersonResult = {
  id: string
  full_name: string
  avatar_url: string | null
  college?: { short_name: string }[] | { short_name: string } | null
  is_verified?: boolean
}

type CourseResult = {
  id: string
  name: string
  code?: string | null
  description?: string | null
}

type ForumResult = {
  id: string
  title: string
  body?: string | null
  created_at: string
  interaction_count?: number
  author?: { full_name: string }[] | { full_name: string } | null
}

type TrendingQuery = {
  query: string
  count: number
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const CATEGORY_FILTERS = [
  { label: 'Materials', value: 'materials', color: C.orange,   dim: C.orangeDim  },
  { label: 'People',    value: 'people',    color: C.sapphire, dim: C.sapphDim   },
  { label: 'Courses',   value: 'courses',   color: C.emerald,  dim: C.emerDim    },
  { label: 'Forum',     value: 'forum',     color: C.lavender, dim: C.lavDim     },
]

const TYPE_FILTERS = [
  { label: 'All',            value: '',              icon: 'apps-outline'          as const },
  { label: 'Past Questions', value: 'past_question', icon: 'document-text-outline' as const },
  { label: 'Slides',         value: 'slide',         icon: 'easel-outline'         as const },
  { label: 'Books',          value: 'book',          icon: 'book-outline'          as const },
  { label: 'Tutorials',      value: 'tutorial',      icon: 'play-circle-outline'   as const },
  { label: 'Notes',          value: 'notes',         icon: 'pencil-outline'        as const },
]

const TYPE_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  past_question: { label: 'Past Q',   color: C.sapphire, bg: C.sapphDim, icon: 'document-text' },
  slide:         { label: 'Slide',    color: C.lavender, bg: C.lavDim,   icon: 'easel'          },
  book:          { label: 'Book',     color: C.emerald,  bg: C.emerDim,  icon: 'book'           },
  tutorial:      { label: 'Tutorial', color: C.gold,     bg: C.goldDim,  icon: 'play-circle'    },
  notes:         { label: 'Notes',    color: C.coral,    bg: C.coralDim, icon: 'pencil'         },
}

const DOWNLOAD_DIR = FileSystem.documentDirectory + 'downloads/'

// ─────────────────────────────────────────────
// Data-fetch helpers — all wrapped in try/catch
// ─────────────────────────────────────────────

/**
 * Trending searches for a given category.
 * Reads from search_logs grouped by query where category matches.
 *
 * TODO: Run this migration if the column doesn't exist yet:
 *   ALTER TABLE search_logs
 *     ADD COLUMN IF NOT EXISTS category text DEFAULT 'materials';
 */
async function fetchTrendingQueries(category: string): Promise<TrendingQuery[]> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('search_logs')
      .select('query')
      .eq('category', category)
      .gte('created_at', sevenDaysAgo)
      .not('query', 'is', null)
      .limit(500)

    if (error || !data) return []

    // Group + count client-side (avoids needing a DB function)
    const counts: Record<string, number> = {}
    data.forEach((row: any) => {
      const q = row.query?.trim().toLowerCase()
      if (q) counts[q] = (counts[q] || 0) + 1
    })
    return Object.entries(counts)
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  } catch {
    return []
  }
}

/**
 * Top results for Materials tab — latest published materials.
 */
async function fetchTopMaterials(): Promise<Result[]> {
  try {
    const { data } = await supabase
      .from('materials')
      .select('id, title, type, file_url, created_at, courses(name)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(5)
    return (data ?? []) as Result[]
  } catch {
    return []
  }
}

/**
 * Top results for People tab — profiles matching the user's past people searches.
 *
 * TODO: Ensure you have a `profiles` table with columns: id, full_name, avatar_url, is_verified
 *       and optionally a foreign key to `colleges(short_name)`.
 */
async function fetchTopPeople(searchHistory: string[]): Promise<PersonResult[]> {
  try {
    if (!searchHistory.length) {
      // No history — return recently joined users
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, is_verified, college:colleges(short_name)')
        .order('created_at', { ascending: false })
        .limit(5)
      return (data ?? []) as PersonResult[]
    }

    // Match profiles whose name contains any of the user's past search terms
    const orFilter = searchHistory
      .slice(0, 5)
      .map(t => `full_name.ilike.%${t.replace(/'/g, '')}%`)
      .join(',')

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, is_verified, college:colleges(short_name)')
      .or(orFilter)
      .limit(5)
    return (data ?? []) as PersonResult[]
  } catch {
    return []
  }
}

/**
 * Trending people — top 5 profile names searched across all users.
 */
async function fetchTrendingPeople(): Promise<TrendingQuery[]> {
  return fetchTrendingQueries('people')
}

/**
 * Top results for Courses tab — courses matching the user's past courses searches.
 *
 * TODO: Ensure you have a `courses` table with columns: id, name, code (optional)
 */
async function fetchTopCourses(searchHistory: string[]): Promise<CourseResult[]> {
  try {
    if (!searchHistory.length) {
      const { data } = await supabase
        .from('courses')
        .select('id, name, code, description')
        .order('name', { ascending: true })
        .limit(5)
      return (data ?? []) as CourseResult[]
    }

    const orFilter = searchHistory
      .slice(0, 5)
      .map(t => `name.ilike.%${t.replace(/'/g, '')}%`)
      .join(',')

    const { data } = await supabase
      .from('courses')
      .select('id, name, code, description')
      .or(orFilter)
      .limit(5)
    return (data ?? []) as CourseResult[]
  } catch {
    return []
  }
}

/**
 * Trending forum pages — top posts by interaction_count.
 *
 * TODO: Ensure you have a `forum_posts` table (or rename below to match yours).
 *       Columns needed: id, title, body (optional), created_at, interaction_count
 *
 *   ALTER TABLE forum_posts
 *     ADD COLUMN IF NOT EXISTS interaction_count integer DEFAULT 0;
 */
async function fetchTrendingForum(): Promise<ForumResult[]> {
  try {
    // Try forum_posts first
    const { data, error } = await supabase
      .from('forum_posts')
      .select('id, title, body, created_at, interaction_count, author:profiles(full_name)')
      .order('interaction_count', { ascending: false })
      .limit(5)

    if (!error && data?.length) return data as ForumResult[]

    // Fallback: try `posts` table
    const { data: data2, error: error2 } = await supabase
      .from('posts')
      .select('id, title, body, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

    if (!error2 && data2?.length) return data2 as ForumResult[]

    return []
  } catch {
    return []
  }
}

/**
 * Top forum results for this user — posts matching their past forum searches.
 */
async function fetchTopForumResults(searchHistory: string[]): Promise<ForumResult[]> {
  try {
    if (!searchHistory.length) return fetchTrendingForum()

    const orFilter = searchHistory
      .slice(0, 5)
      .map(t => `title.ilike.%${t.replace(/'/g, '')}%`)
      .join(',')

    const { data, error } = await supabase
      .from('forum_posts')
      .select('id, title, body, created_at, interaction_count, author:profiles(full_name)')
      .or(orFilter)
      .limit(5)

    if (!error && data?.length) return data as ForumResult[]

    // Fallback
    const { data: data2 } = await supabase
      .from('posts')
      .select('id, title, body, created_at')
      .or(orFilter)
      .limit(5)

    return (data2 ?? []) as ForumResult[]
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────
// LockedIcon
// ─────────────────────────────────────────────
function LockedIcon({ name, size, color, locked }: { name: string; size: number; color: string; locked: boolean }) {
  return (
    <View style={{ position: 'relative' }}>
      <Ionicons name={name as any} size={size} color={color} />
      {locked && (
        <View style={lockedS.badge}>
          <Ionicons name="lock-closed" size={7} color="#fff" />
        </View>
      )}
    </View>
  )
}
const lockedS = StyleSheet.create({
  badge: {
    position: 'absolute', bottom: -3, right: -4,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: C.gold,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: C.deep,
  },
})

// ─────────────────────────────────────────────
// Premium gate modal
// ─────────────────────────────────────────────
function PremiumGateModal({ visible, onClose, onUpgrade }: {
  visible: boolean; onClose: () => void; onUpgrade: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" presentationStyle="overFullScreen">
      <View style={gate.overlay}>
        <View style={gate.sheet}>
          <View style={gate.iconBox}>
            <Ionicons name="star" size={34} color={C.gold} />
          </View>
          <Text style={gate.title}>Premium Required</Text>
          <Text style={gate.sub}>
            Downloading files for offline use is a{'\n'}
            <Text style={{ color: C.gold, fontWeight: '700' }}>Premium-only</Text> feature.{'\n\n'}
            Upgrade now to save files to your device and{'\n'}access them anytime, even without internet.
          </Text>
          <TouchableOpacity style={gate.upgradeBtn} onPress={onUpgrade} activeOpacity={0.85}>
            <Ionicons name="star" size={16} color={C.void} />
            <Text style={gate.upgradeBtnText}>Upgrade to Premium</Text>
          </TouchableOpacity>
          <TouchableOpacity style={gate.cancelBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={gate.cancelBtnText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}
const gate = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.80)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: C.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32, alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: C.border },
  iconBox:      { width: 76, height: 76, borderRadius: 22, backgroundColor: C.goldDim, borderWidth: 1, borderColor: 'rgba(223,168,60,0.25)', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  title:        { fontSize: 22, fontWeight: '800', color: C.text },
  sub:          { fontSize: 14, color: C.textSub, textAlign: 'center', lineHeight: 22 },
  upgradeBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.orange, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28, marginTop: 10, width: '100%', justifyContent: 'center' },
  upgradeBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  cancelBtn:    { paddingVertical: 12 },
  cancelBtnText:{ fontSize: 14, color: C.textMute, fontWeight: '600' },
})

// ─────────────────────────────────────────────
// Skeleton card
// ─────────────────────────────────────────────
function SkeletonCard() {
  const shimmer = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start()
  }, [])
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.5] })
  return (
    <View style={skel.card}>
      <Animated.View style={[skel.icon, { opacity }]} />
      <View style={skel.body}>
        <Animated.View style={[skel.line, { width: '80%', opacity }]} />
        <Animated.View style={[skel.line, { width: '50%', opacity }]} />
      </View>
    </View>
  )
}
const skel = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, backgroundColor: C.surface, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.raised },
  body: { flex: 1, gap: 8, justifyContent: 'center' },
  line: { height: 11, borderRadius: 6, backgroundColor: C.raised },
})

// ─────────────────────────────────────────────
// Section header (reusable)
// ─────────────────────────────────────────────
function SectionHeader({ title, linkLabel, onLink }: {
  title: string; linkLabel?: string; onLink?: () => void
}) {
  return (
    <View style={s.sectionRow}>
      <View style={s.sectionLabelRow}>
        <View style={s.orangeLine} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {linkLabel && onLink && (
        <TouchableOpacity onPress={onLink} activeOpacity={0.7}>
          <Text style={s.sectionLink}>{linkLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ─────────────────────────────────────────────
// Empty state (reusable)
// ─────────────────────────────────────────────
function EmptyState({ icon, message }: { icon: any; message: string }) {
  return (
    <View style={s.emptyInline}>
      <Ionicons name={icon} size={22} color={C.textMute} />
      <Text style={s.emptyInlineText}>{message}</Text>
    </View>
  )
}

// ─────────────────────────────────────────────
// Trending queries list (shared by Materials/People/Courses)
// ─────────────────────────────────────────────
function TrendingQueriesList({ items, loading, onTap, accentColor, emptyMessage }: {
  items: TrendingQuery[]
  loading: boolean
  onTap: (q: string) => void
  accentColor: string
  emptyMessage: string
}) {
  if (loading) return <View>{[0,1,2,3,4].map(i => <SkeletonCard key={i} />)}</View>
  if (!items.length) return <EmptyState icon="flame-outline" message={emptyMessage} />
  return (
    <View style={s.trendingQueryList}>
      {items.map((item, i) => (
        <TouchableOpacity
          key={item.query}
          style={s.trendingQueryRow}
          onPress={() => onTap(item.query)}
          activeOpacity={0.75}
        >
          <View style={[s.trendingQueryRank, { backgroundColor: accentColor + '18' }]}>
            <Text style={[s.trendingQueryRankText, { color: accentColor }]}>#{i + 1}</Text>
          </View>
          <Text style={s.trendingQueryText} numberOfLines={1}>{item.query}</Text>
          <View style={s.trendingQueryRight}>
            <Text style={[s.trendingQueryCount, { color: accentColor }]}>{item.count}</Text>
            <Text style={s.trendingQueryCountLabel}> searches</Text>
            <Ionicons name="chevron-forward" size={12} color={C.textMute} style={{ marginLeft: 4 }} />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  )
}

// ─────────────────────────────────────────────
// Material result card
// ─────────────────────────────────────────────
type CardProps = {
  item: Result
  isBookmarked: boolean
  isDownloading: boolean
  isTogglingBM: boolean
  isPremium: boolean
  isDownloaded: boolean
  onBookmark: () => void
  onDownload: () => void
  onChat: () => void
  onPress: () => void
  onQuiz: () => void
}

function ResultCard({
  item, isBookmarked, isDownloading, isTogglingBM,
  isPremium, isDownloaded, onBookmark, onDownload, onChat, onPress, onQuiz,
}: CardProps) {
  const meta  = TYPE_META[item.type] ?? { label: item.type, color: C.sky, bg: C.skyDim, icon: 'document' }
  const scale = useRef(new Animated.Value(1)).current
  const pressIn  = () => Animated.spring(scale, { toValue: 0.974, useNativeDriver: true, speed: 40 }).start()
  const pressOut = () => Animated.spring(scale, { toValue: 1,     useNativeDriver: true, speed: 40 }).start()
  function timeAgo(d: string) {
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7)  return `${days}d ago`
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
  }
  const courseName = Array.isArray(item.courses)
    ? (item.courses as any[])[0]?.name
    : (item.courses as any)?.name

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable style={s.card} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
        <View style={[s.cardAccent, { backgroundColor: meta.color }]} />
        <View style={[s.cardThumb, { backgroundColor: meta.bg, borderColor: meta.color + '35' }]}>
          <Ionicons name={meta.icon} size={24} color={meta.color} />
          <Text style={[s.cardThumbLabel, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
        </View>
        <View style={s.cardBody}>
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
            <TouchableOpacity style={s.bookmarkBtn} onPress={onBookmark} activeOpacity={0.75} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              {isTogglingBM
                ? <ActivityIndicator size="small" color={C.orange} />
                : <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={17} color={isBookmarked ? C.orange : C.textMute} />
              }
            </TouchableOpacity>
          </View>
          <View style={s.cardMeta}>
            {courseName ? <Text style={s.courseName} numberOfLines={1}>{courseName}</Text> : null}
            <Text style={s.timeAgo}>{timeAgo(item.created_at)}</Text>
          </View>
          <View style={s.cardActions}>
            <TouchableOpacity style={[s.actionChip, { borderColor: meta.color + '35', backgroundColor: meta.bg }]} onPress={onDownload} activeOpacity={isDownloaded ? 1 : 0.75}>
              {isDownloading
                ? <ActivityIndicator size="small" color={meta.color} />
                : isDownloaded
                  ? <Ionicons name="checkmark-circle" size={13} color={C.emerald} />
                  : <LockedIcon name="download-outline" size={13} color={meta.color} locked={!isPremium} />
              }
              <Text style={[s.actionChipText, { color: isDownloaded ? C.emerald : meta.color }]}>{isDownloaded ? 'Saved' : 'Download'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionChip, { borderColor: C.sapphire + '35', backgroundColor: C.sapphDim }]} onPress={onChat} activeOpacity={0.75}>
              <Ionicons name="sparkles" size={12} color={C.sapphire} />
              <Text style={[s.actionChipText, { color: C.sapphire }]}>AI Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionChip, { borderColor: C.lavender + '35', backgroundColor: C.lavDim }]} onPress={onQuiz} activeOpacity={0.75}>
              <Ionicons name={"school-outline" as any} size={12} color={C.lavender} />
              <Text style={[s.actionChipText, { color: C.lavender }]}>Quiz</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────
// Person card
// ─────────────────────────────────────────────
function PersonCard({ person, onPress }: { person: PersonResult; onPress: () => void }) {
  const initial = person.full_name?.charAt(0).toUpperCase() ?? '?'
  return (
    <TouchableOpacity style={s.personCard} onPress={onPress} activeOpacity={0.8}>
      <View style={s.personAvatar}>
        {person.avatar_url
          ? <Image source={{ uri: person.avatar_url }} style={s.personAvatarImg} />
          : <Text style={s.personAvatarInit}>{initial}</Text>
        }
      </View>
      <View style={s.personInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={s.personName} numberOfLines={1}>{person.full_name}</Text>
          {person.is_verified && (
            <View style={s.verifiedBadge}>
              <Ionicons name="checkmark" size={8} color="#fff" />
            </View>
          )}
        </View>
        {(person.college as any)?.short_name
          ? <Text style={s.personCollege}>{(person.college as any).short_name}</Text>
          : null
        }
      </View>
      <Ionicons name="chevron-forward" size={14} color={C.textMute} />
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────
// Course card
// ─────────────────────────────────────────────
function CourseCard({ course, onPress }: { course: CourseResult; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.courseCard} onPress={onPress} activeOpacity={0.8}>
      <View style={s.courseIconBox}>
        <Ionicons name="book-outline" size={18} color={C.emerald} />
      </View>
      <View style={s.courseInfo}>
        <Text style={s.courseName2} numberOfLines={1}>{course.name}</Text>
        {course.code ? <Text style={s.courseCode}>{course.code}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={14} color={C.textMute} />
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────
// Forum card
// ─────────────────────────────────────────────
function ForumCard({ post, onPress }: { post: ForumResult; onPress: () => void }) {
  function timeAgo(d: string) {
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7)  return `${days}d ago`
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
  }
  return (
    <TouchableOpacity style={s.forumCard} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.cardAccent, { backgroundColor: C.lavender }]} />
      <View style={s.forumIconBox}>
        <Ionicons name="chatbubbles-outline" size={18} color={C.lavender} />
      </View>
      <View style={s.forumInfo}>
        <Text style={s.forumTitle} numberOfLines={2}>{post.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {(post.author as any)?.full_name
            ? <Text style={s.forumMeta}>{(post.author as any).full_name}</Text>
            : null
          }
          <Text style={s.forumMeta}>{timeAgo(post.created_at)}</Text>
          {post.interaction_count != null && post.interaction_count > 0 && (
            <View style={s.forumInteractionPill}>
              <Ionicons name="flame" size={10} color={C.orange} />
              <Text style={s.forumInteractionText}>{post.interaction_count}</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={14} color={C.textMute} />
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function SearchScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { userId, profile } = useProfileSync()
  const collegeId = profile?.college_id ?? null
  const { isPremium } = usePremium()

  // ── Core search state (unchanged) ──
  const [query,          setQuery]          = useState('')
  const [results,        setResults]        = useState<Result[]>([])
  const [loading,        setLoading]        = useState(false)
  const [searched,       setSearched]       = useState(false)
  const [activeFilter,   setActiveFilter]   = useState('')
  const [downloading,    setDownloading]    = useState<string | null>(null)
  const [bookmarkedIds,  setBookmarkedIds]  = useState<Set<string>>(new Set())
  const [togglingBM,     setTogglingBM]     = useState<string | null>(null)
  const [searchHistory,  setSearchHistory]  = useState<string[]>([])
  const [focused,        setFocused]        = useState(false)
  const [showPremModal,  setShowPremModal]  = useState(false)

  // ── Active category ──
  const [activeCategory, setActiveCategory] = useState('materials')
  const activeCat = CATEGORY_FILTERS.find(c => c.value === activeCategory)!

  // ── Per-category history (for People/Courses/Forum top results) ──
  const [peopleHistory,  setPeopleHistory]  = useState<string[]>([])
  const [coursesHistory, setCoursesHistory] = useState<string[]>([])
  const [forumHistory,   setForumHistory]   = useState<string[]>([])

  // ── Trending state (per category) ──
  const [trendingMaterials, setTrendingMaterials] = useState<TrendingQuery[]>([])
  const [trendingPeople,    setTrendingPeople]    = useState<TrendingQuery[]>([])
  const [trendingCourses,   setTrendingCourses]   = useState<TrendingQuery[]>([])
  const [trendingForum,     setTrendingForum]     = useState<ForumResult[]>([])
  const [trendingLoading,   setTrendingLoading]   = useState(false)

  // ── Top results state (per category) ──
  const [topMaterials, setTopMaterials] = useState<Result[]>([])
  const [topPeople,    setTopPeople]    = useState<PersonResult[]>([])
  const [topCourses,   setTopCourses]   = useState<CourseResult[]>([])
  const [topForum,     setTopForum]     = useState<ForumResult[]>([])
  const [topLoading,   setTopLoading]   = useState(false)

  const { downloadedIds } = useDownloadRegistry()
  const focusAnim   = useRef(new Animated.Value(0)).current
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef    = useRef<TextInput>(null)

  // ── Init: bookmarks + all history buckets ──
  useEffect(() => {
    if (!userId) return
    fetchBookmarkedIds(userId).then(setBookmarkedIds)

    // Fetch global materials history
    fetchSearchHistory(userId).then(setSearchHistory)

    // Fetch per-category histories from search_logs
    // TODO: These queries depend on the `category` column existing in search_logs
    const loadCategoryHistory = async (cat: string, setter: (v: string[]) => void) => {
      try {
        const { data } = await supabase
          .from('search_logs')
          .select('query')
          .eq('user_id', userId)
          .eq('category', cat)
          .order('created_at', { ascending: false })
          .limit(20)
        const unique = [...new Set((data ?? []).map((r: any) => r.query).filter(Boolean))]
        setter(unique.slice(0, 10))
      } catch { setter([]) }
    }
    loadCategoryHistory('people',  setPeopleHistory)
    loadCategoryHistory('courses', setCoursesHistory)
    loadCategoryHistory('forum',   setForumHistory)
  }, [userId])

  // ── Load trending + top results when tab changes ──
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setTrendingLoading(true)
      setTopLoading(true)

      if (activeCategory === 'materials') {
        const [t, top] = await Promise.all([
          fetchTrendingQueries('materials'),
          fetchTopMaterials(),
        ])
        if (!cancelled) { setTrendingMaterials(t); setTopMaterials(top) }
      } else if (activeCategory === 'people') {
        const [t, top] = await Promise.all([
          fetchTrendingPeople(),
          fetchTopPeople(peopleHistory),
        ])
        if (!cancelled) { setTrendingPeople(t); setTopPeople(top) }
      } else if (activeCategory === 'courses') {
        const [t, top] = await Promise.all([
          fetchTrendingQueries('courses'),
          fetchTopCourses(coursesHistory),
        ])
        if (!cancelled) { setTrendingCourses(t); setTopCourses(top) }
      } else if (activeCategory === 'forum') {
        const [t, top] = await Promise.all([
          fetchTrendingForum(),
          fetchTopForumResults(forumHistory),
        ])
        if (!cancelled) { setTrendingForum(t); setTopForum(top) }
      }

      if (!cancelled) { setTrendingLoading(false); setTopLoading(false) }
    }

    load()
    return () => { cancelled = true }
  }, [activeCategory, peopleHistory, coursesHistory, forumHistory])

  // ── Focus ring animation ──
  useEffect(() => {
    Animated.timing(focusAnim, { toValue: focused ? 1 : 0, duration: 200, useNativeDriver: false }).start()
  }, [focused])

  const searchBarBorder = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [C.border, activeCat.color + '70'],
  })

  // ── Debounced search (unchanged) ──
  useEffect(() => {
    if (!query.trim() && !activeFilter) { setResults([]); setSearched(false); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query, activeFilter), 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, activeFilter])

  const doSearch = useCallback(async (q: string, filter: string) => {
    setLoading(true)
    setSearched(true)
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)

    let sq = supabase
      .from('materials')
      .select('id, title, type, file_url, created_at, courses(name)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(50)

    if (q.trim()) sq = sq.ilike('title', `%${q.trim()}%`)
    if (filter)   sq = sq.eq('type', filter)

    const { data, error } = await sq
    setResults(error ? [] : ((data ?? []) as Result[]))
    setLoading(false)

    if (q.trim() && userId) {
      await saveSearchHistory(userId, q.trim())
      fetchSearchHistory(userId).then(setSearchHistory)
      // Log with category so trending works
      // TODO: logSearch needs to accept category — update your logSearch() function signature
      // or call supabase directly:
      try {
        await supabase.from('search_logs').upsert({
          user_id: userId,
          query:   q.trim(),
          category: activeCategory,
          college_id: collegeId,
        })
      } catch { /* column may not exist yet — safe to ignore */ }
    }
  }, [userId, collegeId, activeCategory])

  const tapHistory = (term: string) => { setQuery(term); doSearch(term, activeFilter) }

  const removeHistoryItem = async (term: string) => {
    setSearchHistory(prev => prev.filter(x => x !== term))
    if (userId) {
      const updated = searchHistory.filter(x => x !== term)
      await supabase.from('search_history').upsert({ user_id: userId, queries: updated }, { onConflict: 'user_id' })
    }
  }

  const handleClearAll = () => {
    Alert.alert('Clear History', 'Remove all recent searches?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        setSearchHistory([])
        if (userId) await clearSearchHistory(userId)
      }},
    ])
  }

  const toggleBookmark = async (item: Result) => {
    if (!userId) return
    setTogglingBM(item.id)
    try {
      if (bookmarkedIds.has(item.id)) {
        await removeBookmark(userId, item.id)
        setBookmarkedIds(prev => { const s = new Set(prev); s.delete(item.id); return s })
      } else {
        await addBookmark(userId, item.id)
        setBookmarkedIds(prev => new Set(prev).add(item.id))
      }
    } catch { Alert.alert('Error', 'Could not update bookmark.') }
    finally  { setTogglingBM(null) }
  }

  const downloadFile = async (item: Result) => {
    if (!isPremium) { setShowPremModal(true); return }
    if (downloadedIds.has(item.id)) {
      Alert.alert('Already saved', 'This file is already on your device.')
      return
    }

    setDownloading(item.id)
    const success = await downloadMaterial(item as any)

    if (success) {
      registryAdd(item.id)
      if (userId) await supabase.from('downloads').upsert({ user_id: userId, material_id: item.id })
      Alert.alert('Downloaded!', `"${item.title}" saved for offline access.`)
    } else {
      Alert.alert('Download failed', 'Please check your connection and try again.')
    }
    setDownloading(null)
  }
  const clearSearch = () => {
    setQuery(''); setActiveFilter(''); setResults([]); setSearched(false)
    inputRef.current?.focus()
  }

  // Every destination gets back='/(tabs)/search' so the back button
  // always returns the user to this screen regardless of which navigator
  // the destination lives in.
  const BACK = '/(tabs)/search'

  const openQuiz = (item: Result) => {
    router.push({
      pathname: '/quiz-flashcards' as any,
      params: { material_id: item.id, title: item.title, file_url: item.file_url, type: item.type, auto_generate: '1', back: BACK },
    })
  }

  const materialCardProps = (item: Result) => ({
    item,
    isBookmarked:  bookmarkedIds.has(item.id),
    isDownloading: downloading === item.id,
    isTogglingBM:  togglingBM === item.id,
    isPremium,
    isDownloaded:  downloadedIds.has(item.id),
    onBookmark:    () => toggleBookmark(item),
    onDownload:    () => downloadFile(item),
    onChat:        () => router.push({ pathname: '/chat' as any, params: { material_title: item.title, file_url: item.file_url, conversation_id: 'new', back: BACK } }),
    onPress:       () => router.push({ pathname: '/viewer' as any, params: { file_url: item.file_url, title: item.title, color: C.orange, material_id: item.id, back: BACK } }),
    onQuiz:        () => openQuiz(item),
  })

  const showPreSearch = !searched && !query.trim()

  // ─────────────────────────────────────────────
  // Pre-search body — per category
  // ─────────────────────────────────────────────
  const renderPreSearch = () => (
    <ScrollView contentContainerStyle={s.preBody} showsVerticalScrollIndicator={false}>

      {/* Recent Searches */}
      {searchHistory.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>Recent Searches</Text>
            <TouchableOpacity onPress={handleClearAll} activeOpacity={0.7}>
              <Text style={s.clearAll}>CLEAR ALL</Text>
            </TouchableOpacity>
          </View>
          <View style={s.historyWrap}>
            {searchHistory.map((term, i) => (
              <TouchableOpacity key={i} style={s.historyChip} onPress={() => tapHistory(term)} activeOpacity={0.75}>
                <Ionicons name="time-outline" size={13} color={C.textMute} />
                <Text style={s.historyText}>{term}</Text>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => removeHistoryItem(term)}>
                  <Ionicons name="close" size={11} color={C.textMute} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── MATERIALS ── */}
      {activeCategory === 'materials' && (
        <>
          <View style={s.section}>
            <SectionHeader title="Trending Searches" />
            <TrendingQueriesList
              items={trendingMaterials}
              loading={trendingLoading}
              onTap={tapHistory}
              accentColor={C.orange}
              emptyMessage="No trending searches yet"
            />
          </View>
          <View style={s.section}>
            <SectionHeader title="Top Results" linkLabel="View All" onLink={() => doSearch('', activeFilter)} />
            {topLoading
              ? [0,1,2].map(i => <SkeletonCard key={i} />)
              : topMaterials.length === 0
                ? <EmptyState icon="documents-outline" message="No materials yet" />
                : topMaterials.map(item => <ResultCard key={item.id} {...materialCardProps(item)} />)
            }
          </View>
        </>
      )}

      {/* ── PEOPLE ── */}
      {activeCategory === 'people' && (
        <>
          <View style={s.section}>
            <SectionHeader title="Trending People" />
            <TrendingQueriesList
              items={trendingPeople}
              loading={trendingLoading}
              onTap={tapHistory}
              accentColor={C.sapphire}
              emptyMessage="No trending people searches yet"
            />
          </View>
          <View style={s.section}>
            <SectionHeader title="Top Results" linkLabel="View All" onLink={() => doSearch('', '')} />
            {topLoading
              ? [0,1,2].map(i => <SkeletonCard key={i} />)
              : topPeople.length === 0
                ? <EmptyState icon="people-outline" message="Search for people to see results here" />
                : topPeople.map(p => (
                    <PersonCard
                      key={p.id}
                      person={p}
                      onPress={() => router.push({ pathname: '/profile' as any, params: { user_id: p.id, back: BACK } })}
                    />
                  ))
            }
          </View>
        </>
      )}

      {/* ── COURSES ── */}
      {activeCategory === 'courses' && (
        <>
          <View style={s.section}>
            <SectionHeader title="Trending Courses" />
            <TrendingQueriesList
              items={trendingCourses}
              loading={trendingLoading}
              onTap={tapHistory}
              accentColor={C.emerald}
              emptyMessage="No trending course searches yet"
            />
          </View>
          <View style={s.section}>
            <SectionHeader title="Top Results" linkLabel="View All" onLink={() => doSearch('', '')} />
            {topLoading
              ? [0,1,2].map(i => <SkeletonCard key={i} />)
              : topCourses.length === 0
                ? <EmptyState icon="book-outline" message="Search for courses to see results here" />
                : topCourses.map(c => (
                    <CourseCard
                      key={c.id}
                      course={c}
                      onPress={() => router.push({ pathname: '/my-courses' as any, params: { course_id: c.id, back: BACK } })}
                    />
                  ))
            }
          </View>
        </>
      )}

      {/* ── FORUM ── */}
      {activeCategory === 'forum' && (
        <>
          <View style={s.section}>
            <SectionHeader title="Trending on Campus" />
            {trendingLoading
              ? [0,1,2].map(i => <SkeletonCard key={i} />)
              : trendingForum.length === 0
                ? <EmptyState icon="chatbubbles-outline" message="No trending forum pages yet" />
                : trendingForum.map(post => (
                    <ForumCard
                      key={post.id}
                      post={post}
                      onPress={() => router.push({ pathname: ROUTES.STUDENT_FORUM as any, params: { post_id: post.id, back: BACK } })}
                    />
                  ))
            }
          </View>
          <View style={s.section}>
            <SectionHeader title="Top Results" linkLabel="View All" onLink={() => doSearch('', '')} />
            {topLoading
              ? [0,1,2].map(i => <SkeletonCard key={i} />)
              : topForum.length === 0
                ? <EmptyState icon="newspaper-outline" message="Search the forum to see results here" />
                : topForum.map(post => (
                    <ForumCard
                      key={post.id}
                      post={post}
                      onPress={() => router.push({ pathname: ROUTES.STUDENT_FORUM as any, params: { post_id: post.id, back: BACK } })}
                    />
                  ))
            }
          </View>
        </>
      )}

    </ScrollView>
  )

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <PremiumGateModal
        visible={showPremModal}
        onClose={() => setShowPremModal(false)}
        onUpgrade={() => { setShowPremModal(false); router.push('/subscription' as any) }}
      />

      {/* ══════════ HEADER ══════════ */}
      <View style={s.header}>
        <View style={s.orbOrange} />
        <View style={s.orbBlue} />

        {/* Branding */}
        <View style={s.headerTop}>
          <View style={s.brand}>
            <View style={s.logoBox}>
              <Text style={{ fontSize: 15 }}>🎓</Text>
            </View>
            <Text style={s.wordmark}>
              student<Text style={s.wordmarkAccent}>share</Text>
            </Text>
          </View>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.push('/bookmarks' as any)} activeOpacity={0.8}>
            <Ionicons name="bookmark-outline" size={16} color={C.textSub} />
          </TouchableOpacity>
        </View>

        {/* Search input */}
        <Animated.View style={[s.searchWrap, { borderColor: searchBarBorder }]}>
          <Ionicons name="search-outline" size={15} color={C.textMute} style={{ marginLeft: 2 }} />
          <TextInput
            ref={inputRef}
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={
              activeCategory === 'materials' ? 'Search study materials...' :
              activeCategory === 'people'    ? 'Search people...' :
              activeCategory === 'courses'   ? 'Search courses...' :
                                               'Search forum...'
            }
            placeholderTextColor={C.textMute}
            returnKeyType="search"
            onSubmitEditing={() => { if (debounceRef.current) clearTimeout(debounceRef.current); doSearch(query, activeFilter) }}
            autoCorrect={false}
          />
          {loading && <ActivityIndicator size="small" color={activeCat.color} style={{ marginRight: 6 }} />}
          {!query && !loading && (
            <TouchableOpacity style={s.searchBtn}><Ionicons name="mic-outline" size={15} color={C.textMute} /></TouchableOpacity>
          )}
          {!!query && !loading && (
            <TouchableOpacity style={s.searchBtn} onPress={clearSearch}><Ionicons name="close-circle" size={17} color={C.textMute} /></TouchableOpacity>
          )}
        </Animated.View>

        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {CATEGORY_FILTERS.map(cat => {
            const active = activeCategory === cat.value
            return (
              <TouchableOpacity
                key={cat.value}
                style={[s.catChip, active && { backgroundColor: cat.color, borderColor: cat.color }]}
                onPress={() => { setActiveCategory(cat.value); setQuery(''); setSearched(false); setResults([]) }}
                activeOpacity={0.75}
              >
                <Text style={[s.catChipText, active && s.catChipTextActive]}>{cat.label}</Text>
                <Ionicons name="chevron-down" size={11} color={active ? '#fff' : C.textSub} />
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* Type sub-chips (Materials tab only) */}
        {activeCategory === 'materials' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.typeRow}>
            {TYPE_FILTERS.map(f => {
              const active = activeFilter === f.value
              const color  = f.value ? (TYPE_META[f.value]?.color ?? C.orange) : C.orange
              return (
                <TouchableOpacity
                  key={f.value}
                  style={[s.typeChip, active && { backgroundColor: color + '15', borderColor: color + '50' }]}
                  onPress={() => setActiveFilter(f.value)}
                  activeOpacity={0.75}
                >
                  <Ionicons name={f.icon} size={11} color={active ? color : C.textMute} />
                  <Text style={[s.typeChipText, active && { color }]}>{f.label}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )}
      </View>

      {/* ══════════ BODY ══════════ */}
      {showPreSearch ? renderPreSearch() : (
        <>
          {searched && !loading && (
            <View style={s.resultsBar}>
              <View style={s.resultsBarLeft}>
                <Ionicons name="layers-outline" size={12} color={C.textMute} />
                <Text style={s.resultsCount}>
                  <Text style={{ color: C.text, fontWeight: '800' }}>{results.length}</Text>
                  {' '}result{results.length !== 1 ? 's' : ''}
                  {query.trim()
                    ? <Text style={{ color: C.textSub }}> for <Text style={{ color: activeCat.color, fontStyle: 'italic' }}>"{query}"</Text></Text>
                    : null
                  }
                </Text>
              </View>
              <TouchableOpacity style={s.sortPill}>
                <Ionicons name="funnel-outline" size={10} color={C.textMute} />
                <Text style={s.sortText}>Recent</Text>
              </TouchableOpacity>
            </View>
          )}

          <FlatList
            data={loading ? [] : results}
            keyExtractor={item => item.id}
            contentContainerStyle={s.list}
            ListHeaderComponent={loading ? <View>{[0,1,2,3].map(i => <SkeletonCard key={i} />)}</View> : null}
            ListEmptyComponent={!loading ? (
              <View style={s.emptyState}>
                <View style={s.emptyIconBox}>
                  <Ionicons name="search-outline" size={36} color={C.textMute} />
                </View>
                <Text style={s.emptyTitle}>No results found</Text>
                <Text style={s.emptySub}>Try different keywords or remove the type filter</Text>
                <TouchableOpacity style={s.clearBtn} onPress={clearSearch}>
                  <Text style={s.clearBtnText}>Clear search</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            renderItem={({ item }) => <ResultCard {...materialCardProps(item)} />}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </View>
  )
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.void },

  // Header
  header: { backgroundColor: C.deep, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border, position: 'relative', overflow: 'hidden' },
  orbOrange: { position: 'absolute', top: -80, right: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(232,105,42,0.08)' },
  orbBlue:   { position: 'absolute', bottom: -50, left: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(75,140,245,0.05)' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  brand:     { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logoBox:   { width: 32, height: 32, borderRadius: 10, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  wordmark:  { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.4, fontFamily: 'serif' },
  wordmarkAccent: { color: C.orange, fontStyle: 'italic' },
  headerBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },

  // Search
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 13, borderWidth: 1.5, gap: 9, marginBottom: 13 },
  searchInput: { flex: 1, fontSize: 14, color: C.text },
  searchBtn:  { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },

  // Category chips
  chipRow:        { gap: 7, paddingBottom: 2 },
  catChip:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 99, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border },
  catChipText:    { fontSize: 13, fontWeight: '600', color: C.textSub },
  catChipTextActive: { color: '#fff' },

  // Type sub-chips
  typeRow:      { gap: 6, paddingTop: 9, paddingBottom: 2 },
  typeChip:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  typeChipText: { fontSize: 11, fontWeight: '700', color: C.textMute },

  // Pre-search body
  preBody:        { padding: 18, paddingBottom: 52 },
  section:        { marginBottom: 28 },
  sectionRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionLabelRow:{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  orangeLine:     { width: 14, height: 1.5, backgroundColor: C.orange, borderRadius: 1 },
  sectionTitle:   { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.2 },
  sectionLink:    { fontSize: 13, fontWeight: '600', color: C.orange },
  clearAll:       { fontSize: 10, fontWeight: '700', color: C.orange, letterSpacing: 1.5 },

  // History chips
  historyWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  historyChip: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  historyText: { fontSize: 13, fontWeight: '500', color: C.text },

  // Trending query list
  trendingQueryList: { gap: 6 },
  trendingQueryRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  trendingQueryRank: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  trendingQueryRankText: { fontSize: 11, fontWeight: '800' },
  trendingQueryText: { flex: 1, fontSize: 14, fontWeight: '500', color: C.text },
  trendingQueryRight:{ flexDirection: 'row', alignItems: 'center' },
  trendingQueryCount:{ fontSize: 12, fontWeight: '700' },
  trendingQueryCountLabel: { fontSize: 11, color: C.textMute },

  // Empty inline
  emptyInline:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 18 },
  emptyInlineText: { fontSize: 13, color: C.textMute },

  // Person card
  personCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 13, marginBottom: 8 },
  personAvatar:   { width: 44, height: 44, borderRadius: 14, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', flexShrink: 0 },
  personAvatarImg:{ width: 44, height: 44 },
  personAvatarInit:{ fontSize: 18, fontWeight: '800', color: C.text },
  personInfo:     { flex: 1, minWidth: 0 },
  personName:     { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  personCollege:  { fontSize: 12, color: C.textSub },
  verifiedBadge:  { width: 14, height: 14, borderRadius: 7, backgroundColor: C.sapphire, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },

  // Course card
  courseCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 13, marginBottom: 8 },
  courseIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.emerDim, borderWidth: 1, borderColor: C.emerald + '30', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  courseInfo:    { flex: 1, minWidth: 0 },
  courseName2:   { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  courseCode:    { fontSize: 12, color: C.textSub },

  // Forum card
  forumCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 13, marginBottom: 8, position: 'relative', overflow: 'hidden' },
  forumIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.lavDim, borderWidth: 1, borderColor: C.lavender + '30', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  forumInfo:    { flex: 1, minWidth: 0 },
  forumTitle:   { fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 20 },
  forumMeta:    { fontSize: 11, color: C.textMute },
  forumInteractionPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.orangeDim, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  forumInteractionText: { fontSize: 11, fontWeight: '700', color: C.orange },

  // Result card
  card:         { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.surface, borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, position: 'relative', overflow: 'hidden' },
  cardAccent:   { position: 'absolute', left: 0, top: 14, bottom: 14, width: 2, borderRadius: 1, opacity: 0.7 },
  cardThumb:    { width: 58, height: 74, borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 5, flexShrink: 0, borderWidth: 1 },
  cardThumbLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  cardBody:     { flex: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 5 },
  cardTitle:    { flex: 1, fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 20 },
  bookmarkBtn:  { padding: 2, marginTop: 1 },
  cardMeta:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  courseName:   { fontSize: 12, color: C.textSub, flex: 1 },
  timeAgo:      { fontSize: 11, color: C.textMute },
  cardActions:  { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  actionChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  actionChipText: { fontSize: 11, fontWeight: '700' },

  // Results bar
  resultsBar:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.deep },
  resultsBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultsCount:   { fontSize: 12, color: C.textSub, fontWeight: '500' },
  sortPill:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  sortText:       { fontSize: 11, fontWeight: '600', color: C.textSub },

  list:           { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 52 },

  // Empty state (full screen)
  emptyState:   { alignItems: 'center', paddingTop: 56, paddingHorizontal: 32, gap: 10 },
  emptyIconBox: { width: 76, height: 76, borderRadius: 22, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle:   { fontSize: 18, fontWeight: '800', color: C.text },
  emptySub:     { fontSize: 13, color: C.textMute, textAlign: 'center', lineHeight: 20 },
  clearBtn:     { marginTop: 8, backgroundColor: C.orangeDim, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: C.orange + '30' },
  clearBtnText: { fontSize: 13, fontWeight: '700', color: C.orange },
})
