/**
 * app/study-materials.tsx
 * Study Materials Screen — editorial dark design + full Supabase logic
 *
 * Cache-first bootstrap: reads AsyncStorage before any network call,
 * so cached data renders instantly with zero empty-state flash.
 *
 * Tabs: All | Slides | Past Q&A | Books | Notes | Tutorials | Lecturers
 * Lecturers tab: groups materials by lecturer name, tap to drill into their files.
 */

import { Ionicons } from '@expo/vector-icons'
import { downloadMaterial as fileSyncDownload } from '@/core/sync/fileSyncService'
import { registryAdd, registryHas } from '@/lib/useDownloadRegistry'
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
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/core/api/supabase'
import {
  addBookmark,
  fetchBookmarkedIds,
  removeBookmark,
} from '@/lib/queries/screens'

// ─────────────────────────────────────────────
// Design Tokens
// ─────────────────────────────────────────────
const C = {
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
  sapphire:   '#4B8CF5',
  sapphDim:   'rgba(75,140,245,0.10)',
  emerald:    '#3DC99A',
  emerDim:    'rgba(61,201,154,0.10)',
  lavender:   '#9B7CF4',
  lavDim:     'rgba(155,124,244,0.10)',
  coral:      '#EE6868',
  coralDim:   'rgba(238,104,104,0.10)',
  sky:        '#38BDF8',
  skyDim:     'rgba(56,189,248,0.10)',
} as const

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type MaterialType  = 'slide' | 'book' | 'past_question' | 'notes' | 'tutorial' | 'other'
type SortKey       = 'lecturer' | 'oldest' | 'downloads' | 'alpha'
type FilterKey     = MaterialType | 'all' | 'lecturers'

export type MaterialRecord = {
  id:              string
  title:           string
  type:            MaterialType
  author?:         string | null
  created_by?:     string | null
  file_url:        string
  file_size:       number | null
  is_premium:      boolean
  academic_year:   string | null
  content_text:    string | null
  cover_url:       string | null
  lecturer_id:     string | null
  created_at:      string
  download_count?: number
  courses: {
    name:          string
    code:          string
    class_id:      string
    is_official?:  boolean
  } | null
  lecturers?: { name: string } | null
}

type LecturerGroup = {
  name:          string
  materialCount: number
  materials:     MaterialRecord[]
  types:         Set<MaterialType>
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const MATERIALS_CACHE_KEY = 'studentshare_study_materials_cache'
const SEEN_IDS_KEY        = 'studentshare_study_materials_seen_ids'
const PROFILE_CACHE_KEY   = 'studentshare_user_id_cache'
const CLASS_CACHE_KEY     = 'studentshare_class_id_cache'

const FEAT_CARD_W = 290
const FEAT_GAP    = 14

const FILTER_CHIPS: { key: FilterKey; label: string }[] = [
  { key: 'all',           label: 'All'       },
  { key: 'slide',         label: 'Slides'    },
  { key: 'past_question', label: 'Past Q&A'  },
  { key: 'book',          label: 'Books'     },
  { key: 'notes',         label: 'Notes'     },
  { key: 'tutorial',      label: 'Tutorials' },
  { key: 'lecturers',     label: 'Lecturers' },
]

const SORT_OPTIONS: {
  key: SortKey
  label: string
  icon: React.ComponentProps<typeof Ionicons>['name']
}[] = [
  { key: 'lecturer',  label: 'Lecturer',       icon: 'person-outline'   },
  { key: 'oldest',    label: 'Oldest first',    icon: 'return-down-back' },
  { key: 'downloads', label: 'Most downloaded', icon: 'download-outline' },
  { key: 'alpha',     label: 'A → Z',           icon: 'text-outline'     },
]

const TYPE_META: Record<
  MaterialType,
  { label: string; emoji: string; accentColor: string; accentDim: string; accentBorder: string }
> = {
  slide:         { label: 'Slides',   emoji: '📊', accentColor: C.orange,   accentDim: C.orangeDim, accentBorder: 'rgba(232,105,42,0.2)'  },
  book:          { label: 'Book',     emoji: '📘', accentColor: C.sapphire, accentDim: C.sapphDim,  accentBorder: 'rgba(75,140,245,0.2)'   },
  past_question: { label: 'Past Q&A', emoji: '📝', accentColor: C.lavender, accentDim: C.lavDim,    accentBorder: 'rgba(155,124,244,0.2)'  },
  notes:         { label: 'Notes',    emoji: '🗒️', accentColor: C.gold,     accentDim: C.goldDim,   accentBorder: 'rgba(223,168,60,0.2)'   },
  tutorial:      { label: 'Tutorial', emoji: '🎬', accentColor: C.coral,    accentDim: C.coralDim,  accentBorder: 'rgba(238,104,104,0.2)'  },
  other:         { label: 'Other',    emoji: '📄', accentColor: C.sky,      accentDim: C.skyDim,    accentBorder: 'rgba(56,189,248,0.2)'   },
}

const FEAT_GRAD_CONFIGS: {
  gradColors: readonly [string, string, ...string[]]
  orbColor: string
  orbColor2?: string
}[] = [
  { gradColors: ['#2a1206', '#3a1a08'], orbColor: 'rgba(232,105,42,0.35)', orbColor2: 'rgba(223,168,60,0.20)' },
  { gradColors: ['#060d22', '#0c1a3a'], orbColor: 'rgba(75,140,245,0.30)' },
  { gradColors: ['#041812', '#082b20'], orbColor: 'rgba(61,201,154,0.30)' },
]

// ─────────────────────────────────────────────
// Supabase fetch
// ─────────────────────────────────────────────
async function fetchMaterialsByClassId(classId: string): Promise<MaterialRecord[]> {
  const { data: courses } = await supabase
    .from('courses')
    .select('id')
    .eq('class_id', classId)

  if (!courses?.length) return []

  const courseIds = courses.map((c: any) => c.id)

  const { data, error } = await supabase
    .from('materials')
    .select(`
      id, title, type, file_url, file_size, is_premium,
      academic_year, content_text, cover_url, lecturer_id,
      created_at, download_count, author, created_by,
      courses ( name, code, class_id, is_official ),
      lecturers ( name )
    `)
    .eq('status', 'published')
    .in('course_id', courseIds)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as MaterialRecord[]
}

// ─────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────
function safeParseMaterials(raw: string | null): MaterialRecord[] {
  if (!raw) return []
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : [] } catch { return [] }
}

function safeParseSeenIds(raw: string | null): Set<string> {
  if (!raw) return new Set()
  try { const p = JSON.parse(raw); return new Set(Array.isArray(p) ? p : []) } catch { return new Set() }
}

// ─────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────
function fmtSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function fmtCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ─────────────────────────────────────────────
// Sort + filter
// ─────────────────────────────────────────────
function sortList(list: MaterialRecord[], sort: SortKey): MaterialRecord[] {
  return [...list].sort((a, b) => {
    if (sort === 'lecturer')  return (a.lecturers?.name ?? '').localeCompare(b.lecturers?.name ?? '')
    if (sort === 'oldest')    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (sort === 'downloads') return (b.download_count ?? 0) - (a.download_count ?? 0)
    if (sort === 'alpha')     return a.title.localeCompare(b.title)
    return 0
  })
}

function filterList(list: MaterialRecord[], filter: FilterKey, q: string): MaterialRecord[] {
  return list.filter(m => {
    const matchType  = filter === 'all' || filter === 'lecturers' || m.type === filter
    const matchQuery =
      !q.trim() ||
      m.title.toLowerCase().includes(q.toLowerCase()) ||
      (m.courses?.name ?? '').toLowerCase().includes(q.toLowerCase()) ||
      (m.courses?.code ?? '').toLowerCase().includes(q.toLowerCase())
    return matchType && matchQuery
  })
}

// ─────────────────────────────────────────────
// Offline Banner
// ─────────────────────────────────────────────
function OfflineBanner() {
  return (
    <View style={ss.offlineBanner}>
      <Ionicons name="cloud-offline-outline" size={13} color={C.gold} />
      <Text allowFontScaling={false} style={ss.offlineBannerText}>
        Offline — showing cached materials
      </Text>
    </View>
  )
}

// ─────────────────────────────────────────────
// Skeleton shimmer
// ─────────────────────────────────────────────
function SkeletonCard({ index }: { index: number }) {
  const pulse = useRef(new Animated.Value(0.35)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.75, duration: 750, delay: index * 80, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])
  return (
    <Animated.View style={[sk.card, { opacity: pulse }]}>
      <View style={sk.accent} />
      <View style={sk.inner}>
        <View style={sk.top}>
          <View style={sk.icon} />
          <View style={sk.body}>
            <View style={sk.course} />
            <View style={sk.title} />
            <View style={sk.sub} />
          </View>
        </View>
        <View style={sk.statBar} />
        <View style={sk.actions}>
          <View style={sk.btn} />
          <View style={sk.btn} />
        </View>
      </View>
    </Animated.View>
  )
}
const sk = StyleSheet.create({
  card:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, marginBottom: 12, overflow: 'hidden', position: 'relative' },
  accent:  { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.raised },
  inner:   { padding: 16, paddingLeft: 20 },
  top:     { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  icon:    { width: 54, height: 54, borderRadius: 16, backgroundColor: C.raised, flexShrink: 0 },
  body:    { flex: 1, gap: 8 },
  course:  { width: '40%', height: 10, borderRadius: 5, backgroundColor: C.raised },
  title:   { width: '85%', height: 14, borderRadius: 7, backgroundColor: C.raised },
  sub:     { width: '55%', height: 10, borderRadius: 5, backgroundColor: C.raised },
  statBar: { height: 1, backgroundColor: C.border, marginTop: 14, marginBottom: 14 },
  actions: { flexDirection: 'row', gap: 8 },
  btn:     { flex: 1, height: 42, borderRadius: 12, backgroundColor: C.raised },
})

// ─────────────────────────────────────────────
// ScalePress
// ─────────────────────────────────────────────
function ScalePress({ children, onPress, style }: {
  children: React.ReactNode; onPress?: () => void; style?: ViewStyle
}) {
  const scale = useRef(new Animated.Value(1)).current
  const onIn  = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
  const onOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 4 }).start()
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
}

// ─────────────────────────────────────────────
// SectionHead
// ─────────────────────────────────────────────
function SectionHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={ss.sectionHead}>
      <View style={ss.sectionLabelRow}>
        <View style={ss.sectionLine} />
        <Text allowFontScaling={false} style={ss.sectionTitle}>{title.toUpperCase()}</Text>
      </View>
      {right}
    </View>
  )
}

// ─────────────────────────────────────────────
// TypeChip
// ─────────────────────────────────────────────
function TypeChip({ label, color, bg, border }: {
  label: string; color: string; bg: string; border: string
}) {
  return (
    <View style={[ss.typeChip, { backgroundColor: bg, borderColor: border }]}>
      <Text allowFontScaling={false} style={[ss.typeChipText, { color }]}>{label}</Text>
    </View>
  )
}

// ─────────────────────────────────────────────
// LecturerCard
// ─────────────────────────────────────────────
function LecturerCard({ group, onPress }: { group: LecturerGroup; onPress: () => void }) {
  const initial = group.name.charAt(0).toUpperCase()
  return (
    <ScalePress onPress={onPress} style={ss.lecCard}>
      <View style={ss.lecIconBox}>
        <Text style={ss.lecInitial}>{initial}</Text>
      </View>
      <View style={ss.lecInfo}>
        <Text allowFontScaling={false} style={ss.lecName} numberOfLines={1}>{group.name}</Text>
        <Text allowFontScaling={false} style={ss.lecCount}>
          {group.materialCount} material{group.materialCount !== 1 ? 's' : ''}
        </Text>
        <View style={ss.lecTypes}>
          {[...group.types].map(t => {
            const meta = TYPE_META[t] ?? TYPE_META.other
            return (
              <TypeChip
                key={t}
                label={meta.label}
                color={meta.accentColor}
                bg={meta.accentDim}
                border={meta.accentBorder}
              />
            )
          })}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.textMute} />
    </ScalePress>
  )
}

// ─────────────────────────────────────────────
// FeaturedCard
// ─────────────────────────────────────────────
function FeaturedCard({ item, gradIdx }: { item: MaterialRecord; gradIdx: number }) {
  const cfg  = TYPE_META[item.type] ?? TYPE_META.other
  const grad = FEAT_GRAD_CONFIGS[gradIdx % FEAT_GRAD_CONFIGS.length]
  return (
    <ScalePress style={ss.featCard}>
      <LinearGradient
        colors={grad.gradColors}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[ss.featOrb, { width: 180, height: 180, borderRadius: 90, top: -60, right: -60, backgroundColor: grad.orbColor }]} />
      {grad.orbColor2 && (
        <View style={[ss.featOrb, { width: 120, height: 120, borderRadius: 60, bottom: -40, left: -20, backgroundColor: grad.orbColor2 }]} />
      )}
      <View style={ss.featBadge}>
        <Ionicons name="pin" size={10} color="rgba(255,255,255,0.9)" />
        <Text allowFontScaling={false} style={ss.featBadgeText}>FEATURED</Text>
      </View>
      <Text style={ss.featEmoji}>{cfg.emoji}</Text>
      <Text allowFontScaling={false} style={ss.featCourse} numberOfLines={1}>
        {item.courses?.name ?? '—'}{item.courses?.code ? ` • ${item.courses.code}` : ''}
      </Text>
      <Text maxFontSizeMultiplier={1.1} style={ss.featTitle} numberOfLines={2}>{item.title}</Text>
      <View style={ss.featMeta}>
        <View style={ss.featInfoRow}>
          <View style={ss.featInfoItem}>
            <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.55)" />
            <Text allowFontScaling={false} style={ss.featInfoText}>{fmtDate(item.created_at)}</Text>
          </View>
          {item.file_size ? (
            <View style={ss.featInfoItem}>
              <Ionicons name="server-outline" size={11} color="rgba(255,255,255,0.55)" />
              <Text allowFontScaling={false} style={ss.featInfoText}>{fmtSize(item.file_size)}</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity style={ss.featDlBtn} activeOpacity={0.8}>
          <Ionicons name="download-outline" size={14} color="#fff" />
          <Text allowFontScaling={false} style={ss.featDlBtnText}>Save</Text>
        </TouchableOpacity>
      </View>
    </ScalePress>
  )
}

// ─────────────────────────────────────────────
// MaterialCard
// ─────────────────────────────────────────────
function MaterialCard({
  item, isOfficial, isNew, isBookmarked, bookmarkLoading,
  onOpen, onDownload, onChat, onBookmark, onQuiz,
}: {
  item:            MaterialRecord
  isOfficial:      boolean
  isNew:           boolean
  isBookmarked:    boolean
  bookmarkLoading: boolean
  onOpen:          () => void
  onDownload:      () => void
  onChat:          () => void
  onBookmark:      () => void
  onQuiz:          () => void
}) {
  const cfg = TYPE_META[item.type] ?? TYPE_META.other
  return (
    <ScalePress style={ss.matCard}>
      <View style={[ss.matAccent, { backgroundColor: cfg.accentColor }]} />
      {isOfficial && (
        <View style={ss.officialBadge}>
          <Ionicons name="checkmark-circle" size={11} color="#fff" />
          <Text allowFontScaling={false} style={ss.officialBadgeText}>Official</Text>
        </View>
      )}
      <View style={ss.matInner}>
        {/* TOP */}
        <View style={ss.matTop}>
          <View style={[ss.matIconBox, { backgroundColor: cfg.accentDim, borderColor: cfg.accentBorder }]}>
            <Text style={ss.matEmoji}>{cfg.emoji}</Text>
          </View>
          <View style={ss.matHeader}>
            <Text allowFontScaling={false} style={ss.matCourse} numberOfLines={1}>
              {item.courses?.name ?? '—'}{item.courses?.code ? ` • ${item.courses.code}` : ''}
            </Text>
            <Text maxFontSizeMultiplier={1.15} style={ss.matTitle} numberOfLines={2}>{item.title}</Text>
            <View style={ss.matMetaRow}>
              <View style={ss.matMetaItem}>
                <Ionicons name="calendar-outline" size={11} color={C.textSub} />
                <Text allowFontScaling={false} style={ss.matMetaText}>{fmtDate(item.created_at)}</Text>
              </View>
              {item.file_size ? (
                <View style={ss.matMetaItem}>
                  <Ionicons name="server-outline" size={11} color={C.textSub} />
                  <Text allowFontScaling={false} style={ss.matMetaText}>{fmtSize(item.file_size)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* STAT BAR */}
        <View style={ss.statBar}>
          {(item.download_count ?? 0) > 0 && (
            <View style={ss.stat}>
              <Ionicons name="download-outline" size={12} color={C.textSub} />
              <Text allowFontScaling={false} style={ss.statText}>
                {fmtCount(item.download_count!)} downloads
              </Text>
            </View>
          )}
          {item.type === 'slide' && item.lecturers?.name && (
            <>
              {(item.download_count ?? 0) > 0 && <View style={ss.statSep} />}
              <View style={ss.stat}>
                <Ionicons name="person-outline" size={12} color={C.textSub} />
                <Text allowFontScaling={false} style={ss.statText}>{item.lecturers.name}</Text>
              </View>
            </>
          )}
          {item.type === 'past_question' && item.academic_year && (
            <>
              {(item.download_count ?? 0) > 0 && <View style={ss.statSep} />}
              <View style={ss.stat}>
                <Ionicons name="calendar-outline" size={12} color={C.textSub} />
                <Text allowFontScaling={false} style={ss.statText}>{item.academic_year}</Text>
              </View>
            </>
          )}
          {item.type === 'book' && item.author && (
            <>
              {(item.download_count ?? 0) > 0 && <View style={ss.statSep} />}
              <View style={ss.stat}>
                <Ionicons name="book-outline" size={12} color={C.textSub} />
                <Text allowFontScaling={false} style={ss.statText}>{item.author}</Text>
              </View>
            </>
          )}
          {item.type === 'tutorial' && item.created_by && (
            <>
              {(item.download_count ?? 0) > 0 && <View style={ss.statSep} />}
              <View style={ss.stat}>
                <Ionicons name="videocam-outline" size={12} color={C.textSub} />
                <Text allowFontScaling={false} style={ss.statText}>{item.created_by}</Text>
              </View>
            </>
          )}
          {item.type === 'notes' && item.lecturers?.name && (
            <>
              {(item.download_count ?? 0) > 0 && <View style={ss.statSep} />}
              <View style={ss.stat}>
                <Ionicons name="person-outline" size={12} color={C.textSub} />
                <Text allowFontScaling={false} style={ss.statText}>{item.lecturers.name}</Text>
              </View>
            </>
          )}
          {isNew && (
            <View style={ss.newBadge}>
              <Text allowFontScaling={false} style={ss.newBadgeText}>NEW</Text>
            </View>
          )}
          <View style={{ marginLeft: 'auto' }}>
            <TypeChip label={cfg.label} color={cfg.accentColor} bg={cfg.accentDim} border={cfg.accentBorder} />
          </View>
        </View>

        {/* ACTIONS */}
        <View style={ss.matActions}>
          <TouchableOpacity style={[ss.matBtn, ss.matBtnPrimary]} onPress={onDownload} activeOpacity={0.85}>
            <Ionicons name="download-outline" size={15} color="#fff" />
            <Text allowFontScaling={false} style={ss.matBtnPrimaryText} numberOfLines={1}>Download</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[ss.matBtn, ss.matBtnSecondary]} onPress={onOpen} activeOpacity={0.85}>
            <Ionicons name="eye-outline" size={15} color={C.text} />
            <Text allowFontScaling={false} style={ss.matBtnSecondaryText} numberOfLines={1}>View</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ss.iconBtn, isBookmarked && ss.iconBtnActive]}
            onPress={onBookmark}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {bookmarkLoading
              ? <ActivityIndicator size="small" color={C.gold} />
              : <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={16} color={C.gold} />
            }
          </TouchableOpacity>
          <TouchableOpacity style={ss.iconBtn} onPress={onChat} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="sparkles" size={15} color={C.sapphire} />
          </TouchableOpacity>
          <TouchableOpacity style={ss.iconBtn} onPress={onQuiz} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={'school-outline' as any} size={15} color={C.lavender} />
          </TouchableOpacity>
        </View>
      </View>
    </ScalePress>
  )
}

// ─────────────────────────────────────────────
// SortDropdown
// ─────────────────────────────────────────────
function SortDropdown({ visible, current, onSelect, onClose }: {
  visible: boolean; current: SortKey; onSelect: (k: SortKey) => void; onClose: () => void
}) {
  if (!visible) return null
  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={ss.dropdown}>
        {SORT_OPTIONS.map((opt, i) => (
          <TouchableOpacity
            key={opt.key}
            style={[ss.dropOpt, i < SORT_OPTIONS.length - 1 && ss.dropOptBorder]}
            onPress={() => { onSelect(opt.key); onClose() }}
            activeOpacity={0.8}
          >
            <Ionicons name={opt.icon} size={15} color={current === opt.key ? C.orange : C.textSub} />
            <Text allowFontScaling={false} style={[ss.dropOptText, current === opt.key && { color: C.orange }]}>
              {opt.label}
            </Text>
            {current === opt.key && (
              <Ionicons name="checkmark" size={14} color={C.orange} style={{ marginLeft: 'auto' }} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </>
  )
}

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function StudyMaterialsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // ── UI state ──────────────────────────────────────────────────────────
  const [query,            setQuery]            = useState('')
  const [filter,           setFilter]           = useState<FilterKey>('all')
  const [sort,             setSort]             = useState<SortKey>('lecturer')
  const [sortOpen,         setSortOpen]         = useState(false)
  const [dotIdx,           setDotIdx]           = useState(0)
  const [selectedLecturer, setSelectedLecturer] = useState<LecturerGroup | null>(null)

  // ── Data state ────────────────────────────────────────────────────────
  const [ready,           setReady]           = useState(false)
  const [userId,          setUserId]          = useState<string | null>(null)
  const [classId,         setClassId]         = useState<string | null>(null)
  const [isOnline,        setIsOnline]        = useState(true)
  const [materials,       setMaterials]       = useState<MaterialRecord[]>([])
  const [refreshing,      setRefreshing]      = useState(false)
  const [bookmarkedIds,   setBookmarkedIds]   = useState<Set<string>>(new Set())
  const [bookmarkLoading, setBookmarkLoading] = useState<string | null>(null)

  const seenIdsRef    = useRef<Set<string>>(new Set())
  const seenLoadedRef = useRef(false)
  const classIdRef    = useRef<string | null>(null)

  // ─────────────────────────────────────────────
  // Cache-first bootstrap
  // ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      const [rawMaterials, rawSeen, cachedUserId, cachedClassId] = await Promise.all([
        AsyncStorage.getItem(MATERIALS_CACHE_KEY).catch(() => null),
        AsyncStorage.getItem(SEEN_IDS_KEY).catch(() => null),
        AsyncStorage.getItem(PROFILE_CACHE_KEY).catch(() => null),
        AsyncStorage.getItem(CLASS_CACHE_KEY).catch(() => null),
      ])

      seenIdsRef.current    = safeParseSeenIds(rawSeen)
      seenLoadedRef.current = true

      const parsed = safeParseMaterials(rawMaterials)

      if (!cancelled) {
        if (parsed.length > 0) setMaterials(parsed)
        setReady(true)
      }

      let liveClassId = cachedClassId

      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (!error && session?.user) {
          if (!cancelled) { setUserId(session.user.id); setIsOnline(true) }
          void AsyncStorage.setItem(PROFILE_CACHE_KEY, session.user.id).catch(() => {})

          const { data: profile } = await supabase
            .from('profiles')
            .select('class_id')
            .eq('id', session.user.id)
            .single()

          if (profile?.class_id) {
            liveClassId        = profile.class_id
            classIdRef.current = profile.class_id
            if (!cancelled) setClassId(profile.class_id)
            void AsyncStorage.setItem(CLASS_CACHE_KEY, profile.class_id).catch(() => {})
          }

          fetchBookmarkedIds(session.user.id)
            .then(ids => { if (!cancelled) setBookmarkedIds(ids) })
            .catch(() => {})
        }
      } catch {
        if (!cancelled) setIsOnline(false)
      }

      if (liveClassId && !cancelled) {
        try {
          const result = await fetchMaterialsByClassId(liveClassId)
          if (!cancelled) {
            setMaterials(result)
            setIsOnline(true)
            void AsyncStorage.setItem(MATERIALS_CACHE_KEY, JSON.stringify(result)).catch(() => {})
          }
        } catch {
          if (!cancelled) setIsOnline(false)
        }
      }
    }

    bootstrap()
    return () => { cancelled = true }
  }, [])

  // ─────────────────────────────────────────────
  // NEW badge
  // ─────────────────────────────────────────────
  const newIds = useMemo(() => {
    if (!seenLoadedRef.current) return new Set<string>()
    return new Set(materials.filter(m => !seenIdsRef.current.has(m.id)).map(m => m.id))
  }, [materials])

  useEffect(() => {
    if (!materials.length || !seenLoadedRef.current) return
    const timer = setTimeout(() => {
      materials.forEach(m => seenIdsRef.current.add(m.id))
      void AsyncStorage.setItem(SEEN_IDS_KEY, JSON.stringify([...seenIdsRef.current])).catch(() => {})
    }, 3000)
    return () => clearTimeout(timer)
  }, [materials])

  // ─────────────────────────────────────────────
  // Lecturer groups — derived from materials
  // ─────────────────────────────────────────────
  const lecturerGroups = useMemo((): LecturerGroup[] => {
    const map = new Map<string, LecturerGroup>()
    materials.forEach(m => {
      const name = m.lecturers?.name
      if (!name) return
      if (!map.has(name)) {
        map.set(name, { name, materialCount: 0, materials: [], types: new Set() })
      }
      const group = map.get(name)!
      group.materials.push(m)
      group.materialCount++
      group.types.add(m.type)
    })
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [materials])

  // ─────────────────────────────────────────────
  // Derived lists
  // ─────────────────────────────────────────────
  const officialList = useMemo(() =>
    sortList(filterList(materials.filter(m => m.courses?.is_official === true), filter, query), sort),
  [materials, filter, query, sort])

  const studentList = useMemo(() =>
    sortList(filterList(materials.filter(m => !m.courses?.is_official), filter, query), sort),
  [materials, filter, query, sort])

  const showFeatured  = filter === 'all' && !query.trim()
  const showLecturers = filter === 'lecturers'

  const featuredItems = useMemo(() =>
    [...materials]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3),
  [materials])

  const noResults = !showLecturers && officialList.length === 0 && studentList.length === 0
  const showSkeletons = !ready
  const sortLabel     = SORT_OPTIONS.find(o => o.key === sort)?.label.split(' ')[0] ?? 'Sort'

  // ─────────────────────────────────────────────
  // Filter chip handler — resets lecturer selection
  // ─────────────────────────────────────────────
  const handleSetFilter = useCallback((key: FilterKey) => {
    setFilter(key)
    setSelectedLecturer(null)
  }, [])

  // ─────────────────────────────────────────────
  // Pull-to-refresh
  // ─────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    const cid = classId ?? classIdRef.current
    if (!isOnline || !cid) return
    setRefreshing(true)
    try {
      const result = await fetchMaterialsByClassId(cid)
      setMaterials(result)
      void AsyncStorage.setItem(MATERIALS_CACHE_KEY, JSON.stringify(result)).catch(() => {})
    } catch {
      // silent
    } finally {
      setRefreshing(false)
    }
  }, [isOnline, classId])

  // ─────────────────────────────────────────────
  // Bookmark toggle
  // ─────────────────────────────────────────────
  const toggleBookmark = useCallback(async (item: MaterialRecord) => {
    if (!userId) return
    const was = bookmarkedIds.has(item.id)
    setBookmarkedIds(prev => { const next = new Set(prev); was ? next.delete(item.id) : next.add(item.id); return next })
    setBookmarkLoading(item.id)
    try {
      if (was) await removeBookmark(userId, item.id)
      else     await addBookmark(userId, item.id)
    } catch {
      setBookmarkedIds(prev => { const next = new Set(prev); was ? next.add(item.id) : next.delete(item.id); return next })
      Alert.alert('Bookmark error', 'Could not update bookmark. Try again.')
    } finally {
      setBookmarkLoading(null)
    }
  }, [userId, bookmarkedIds])

  // ─────────────────────────────────────────────
  // Download
  // ─────────────────────────────────────────────
  const downloadMaterial = useCallback(async (item: MaterialRecord) => {
    if (!userId) {
      Alert.alert('Not signed in', 'You need to be signed in to download materials.')
      return
    }
    if (registryHas(item.id)) {
      Alert.alert('Already saved', 'This file is already on your device.')
      return
    }

    const success = await fileSyncDownload(item as any)

    if (success) {
      registryAdd(item.id)
      await supabase.from('downloads').upsert(
        { user_id: userId, material_id: item.id, downloaded_at: new Date().toISOString() },
        { onConflict: 'user_id,material_id' }
      )
      void supabase.from('material_downloads').insert({ user_id: userId, material_id: item.id })
      Alert.alert('✔ Saved', `"${item.title}" is now available offline.`)
    } else {
      Alert.alert('Download failed', 'Could not save the file. Please try again.')
    }
  }, [userId])
  // ─────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────
  const openMaterial = useCallback((item: MaterialRecord) => {
    seenIdsRef.current.add(item.id)
    void AsyncStorage.setItem(SEEN_IDS_KEY, JSON.stringify([...seenIdsRef.current])).catch(() => {})
    router.push({
      pathname: '/viewer' as any,
      params: {
        file_url:    item.file_url,
        title:       item.title,
        color:       TYPE_META[item.type]?.accentColor ?? C.sapphire,
        material_id: item.id,
        is_local:    registryHas(item.id) ? '1' : '0',
      },
    })
  }, [router])

  const openQuiz = useCallback((item: MaterialRecord) => {
    router.push({
      pathname: '/quiz-flashcards' as any,
      params: { material_id: item.id, title: item.title, file_url: item.file_url, type: item.type, auto_generate: '1' },
    })
  }, [router])

  const openChat = useCallback((item: MaterialRecord) => {
    router.push({
      pathname: '/chat' as any,
      params: { material_title: item.title, file_url: item.file_url, material_id: item.id },
    })
  }, [router])

  const onFeatScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (FEAT_CARD_W + FEAT_GAP))
    setDotIdx(Math.min(Math.max(idx, 0), featuredItems.length - 1))
  }, [featuredItems.length])

  // helper for rendering a MaterialCard
  const renderMatCard = (mat: MaterialRecord) => (
    <MaterialCard
      key={mat.id} item={mat}
      isOfficial={mat.courses?.is_official === true}
      isNew={newIds.has(mat.id)}
      isBookmarked={bookmarkedIds.has(mat.id)}
      bookmarkLoading={bookmarkLoading === mat.id}
      onOpen={() => openMaterial(mat)}
      onDownload={() => downloadMaterial(mat)}
      onChat={() => openChat(mat)}
      onBookmark={() => toggleBookmark(mat)}
      onQuiz={() => openQuiz(mat)}
    />
  )

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <View style={[ss.screen, { backgroundColor: C.void }]}>

      {!isOnline && materials.length > 0 && <OfflineBanner />}

      {/* STICKY HEADER */}
      <View style={[ss.header, { paddingTop: insets.top + 10 }]}>
        <View style={ss.navRow}>
          <TouchableOpacity style={ss.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text maxFontSizeMultiplier={1.1} style={ss.navTitle} numberOfLines={1}>
            Study <Text style={ss.navAccent}>Materials</Text>
          </Text>
        </View>
        <View style={ss.searchBar}>
          <Ionicons name="search-outline" size={18} color={C.textMute} />
          <TextInput
            style={ss.searchInput}
            placeholder="Search curriculum docs, slides, handbooks…"
            placeholderTextColor={C.textMute}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* FILTER + SORT ROW */}
      <View style={ss.controlsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={ss.controlsContent}
          keyboardShouldPersistTaps="handled"
        >
          {FILTER_CHIPS.map(chip => {
            const active = filter === chip.key
            return (
              <TouchableOpacity
                key={chip.key}
                style={[ss.chip, active && ss.chipActive]}
                onPress={() => handleSetFilter(chip.key)}
                activeOpacity={0.8}
              >
                <Text allowFontScaling={false} style={[ss.chipText, active && ss.chipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            )
          })}
          {/* Hide sort when on lecturers tab */}
          {!showLecturers && (
            <View style={{ position: 'relative' }}>
              <TouchableOpacity style={ss.sortBtn} onPress={() => setSortOpen(p => !p)} activeOpacity={0.8}>
                <Ionicons name="funnel-outline" size={13} color={C.textSub} />
                <Text allowFontScaling={false} style={ss.sortBtnText}>{sortLabel}</Text>
                <Ionicons name={sortOpen ? 'chevron-up' : 'chevron-down'} size={12} color={C.textSub} />
              </TouchableOpacity>
              <SortDropdown visible={sortOpen} current={sort} onSelect={setSort} onClose={() => setSortOpen(false)} />
            </View>
          )}
        </ScrollView>
      </View>

      {/* SCROLLABLE BODY */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[ss.body, { paddingBottom: insets.bottom + 110 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          isOnline ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.orange} colors={[C.orange]} />
          ) : undefined
        }
      >
        {/* SKELETONS */}
        {showSkeletons && (
          <View style={{ marginTop: 22 }}>
            {Array(4).fill(null).map((_, i) => <SkeletonCard key={i} index={i} />)}
          </View>
        )}

        {!showSkeletons && (
          <>
            {/* ══ LECTURERS TAB ══ */}
            {showLecturers && !selectedLecturer && (
              <View style={ss.matSection}>
                <SectionHead
                  title="Lecturers"
                  right={
                    <View style={ss.countBadge}>
                      <Text allowFontScaling={false} style={ss.countBadgeText}>
                        {lecturerGroups.length} lecturer{lecturerGroups.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  }
                />
                {lecturerGroups.length === 0 ? (
                  <View style={ss.empty}>
                    <Text style={ss.emptyIcon}>👨‍🏫</Text>
                    <Text maxFontSizeMultiplier={1.2} style={ss.emptyTitle}>No lecturers found</Text>
                    <Text maxFontSizeMultiplier={1.2} style={ss.emptySub}>
                      No materials have been assigned to a lecturer yet.
                    </Text>
                  </View>
                ) : (
                  lecturerGroups.map(group => (
                    <LecturerCard
                      key={group.name}
                      group={group}
                      onPress={() => setSelectedLecturer(group)}
                    />
                  ))
                )}
              </View>
            )}

            {/* ══ LECTURER DETAIL ══ */}
            {showLecturers && selectedLecturer && (
              <View style={ss.matSection}>
                <TouchableOpacity
                  style={ss.lecBackRow}
                  onPress={() => setSelectedLecturer(null)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back" size={16} color={C.orange} />
                  <Text allowFontScaling={false} style={ss.lecBackText}>All Lecturers</Text>
                </TouchableOpacity>
                <SectionHead
                  title={selectedLecturer.name}
                  right={
                    <View style={ss.countBadge}>
                      <Text allowFontScaling={false} style={ss.countBadgeText}>
                        {selectedLecturer.materialCount} file{selectedLecturer.materialCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  }
                />
                {selectedLecturer.materials.map(mat => renderMatCard(mat))}
              </View>
            )}

            {/* ══ NORMAL TABS ══ */}
            {!showLecturers && (
              <>
                {/* FEATURED */}
                {showFeatured && featuredItems.length > 0 && (
                  <View style={ss.featSection}>
                    <SectionHead title="Pinned & Featured" />
                    <FlatList
                      data={featuredItems}
                      keyExtractor={item => item.id}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      snapToInterval={FEAT_CARD_W + FEAT_GAP}
                      decelerationRate="fast"
                      contentContainerStyle={{ gap: FEAT_GAP, paddingRight: 4 }}
                      onScroll={onFeatScroll}
                      scrollEventThrottle={16}
                      renderItem={({ item, index }) => <FeaturedCard item={item} gradIdx={index} />}
                    />
                    <View style={ss.dotsRow}>
                      {featuredItems.map((_, i) => (
                        <View
                          key={i}
                          style={[ss.dot, i === dotIdx
                            ? { width: 18, backgroundColor: C.orange }
                            : { width: 5,  backgroundColor: C.borderHi }
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                )}

                {/* OFFICIAL RESOURCES */}
                {officialList.length > 0 && (
                  <View style={ss.matSection}>
                    <SectionHead
                      title="Official Resources"
                      right={
                        <View style={ss.countBadge}>
                          <Text allowFontScaling={false} style={ss.countBadgeText}>{officialList.length} files</Text>
                        </View>
                      }
                    />
                    <View style={ss.verifiedBanner}>
                      <Ionicons name="shield-checkmark-outline" size={16} color={C.orange} />
                      <Text allowFontScaling={false} style={ss.bannerText} numberOfLines={2}>
                        {'Verified only. Admin-uploaded official curriculum documents.'}
                      </Text>
                    </View>
                    {officialList.map(mat => renderMatCard(mat))}
                  </View>
                )}

                {/* STUDENT UPLOADS */}
                {studentList.length > 0 && (
                  <View style={ss.matSection}>
                    <SectionHead
                      title="Student Uploads"
                      right={
                        <View style={ss.countBadge}>
                          <Text allowFontScaling={false} style={ss.countBadgeText}>{studentList.length} files</Text>
                        </View>
                      }
                    />
                    {studentList.map(mat => renderMatCard(mat))}
                    <TouchableOpacity style={ss.loadMore} activeOpacity={0.85}>
                      <Ionicons name="chevron-down-outline" size={16} color={C.orange} />
                      <Text allowFontScaling={false} style={ss.loadMoreText}>Load more materials</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* EMPTY STATE */}
                {noResults && (
                  <View style={ss.empty}>
                    <Text style={ss.emptyIcon}>🔍</Text>
                    <Text maxFontSizeMultiplier={1.2} style={ss.emptyTitle}>No materials found</Text>
                    <Text maxFontSizeMultiplier={1.2} style={ss.emptySub}>
                      {!isOnline && materials.length === 0
                        ? 'Connect to the internet to load your class materials.'
                        : query.trim()
                          ? `No materials match "${query}". Try a different term.`
                          : filter !== 'all'
                            ? 'Try a different filter or pull down to refresh.'
                            : 'No materials have been uploaded yet. Pull down to refresh.'}
                    </Text>
                    {filter !== 'all' && (
                      <TouchableOpacity style={ss.clearBtn} onPress={() => handleSetFilter('all')}>
                        <Text allowFontScaling={false} style={ss.clearBtnText}>Show all materials</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const ss = StyleSheet.create({
  screen: { flex: 1 },

  offlineBanner:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(223,168,60,0.12)', borderBottomWidth: 1, borderBottomColor: 'rgba(223,168,60,0.3)', paddingVertical: 8 },
  offlineBannerText: { fontSize: 12, fontWeight: '600', color: C.gold },

  header:      { backgroundColor: 'rgba(7,8,12,0.94)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 18, paddingBottom: 12, zIndex: 100 },
  navRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  backBtn:     { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  navTitle:    { flex: 1, fontFamily: 'serif', fontSize: 20, fontWeight: '900', color: C.text, letterSpacing: -0.4 },
  navAccent:   { color: C.orange, fontStyle: 'italic' },
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 },
  searchInput: { flex: 1, fontSize: 14, color: C.text },

  controlsWrap:    { borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.void },
  controlsContent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12 },
  chip:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  chipActive:      { backgroundColor: C.orange, borderColor: C.orange, shadowColor: C.orange, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 5 },
  chipText:        { fontSize: 12.5, fontWeight: '600', color: C.textSub },
  chipTextActive:  { color: '#fff' },
  sortBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  sortBtnText:     { fontSize: 12, fontWeight: '600', color: C.textSub },
  dropdown:        { position: 'absolute', top: 46, right: 0, width: 200, backgroundColor: C.raised, borderWidth: 1, borderColor: C.borderHi, borderRadius: 16, overflow: 'hidden', zIndex: 9999, shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.5, shadowRadius: 32, elevation: 20 },
  dropOpt:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  dropOptBorder:   { borderBottomWidth: 1, borderBottomColor: C.border },
  dropOptText:     { fontSize: 13, fontWeight: '600', color: C.textSub },

  body:            { paddingHorizontal: 18 },
  sectionHead:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionLine:     { width: 14, height: 1, backgroundColor: C.orange, opacity: 0.7 },
  sectionTitle:    { fontSize: 9.5, fontWeight: '700', color: C.textMute, letterSpacing: 2.8, textTransform: 'uppercase' },
  sectionLink:     { fontSize: 10.5, fontWeight: '600', color: C.orange, letterSpacing: 0.3 },
  countBadge:      { backgroundColor: C.orangeDim, borderWidth: 1, borderColor: 'rgba(232,105,42,0.2)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  countBadgeText:  { fontSize: 10, fontWeight: '800', color: C.orange },

  // ── Lecturer cards ──────────────────────────
  lecCard:    { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, marginBottom: 10 },
  lecIconBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: 'rgba(232,105,42,0.25)', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  lecInitial: { fontSize: 22, fontWeight: '800', color: C.orange, fontFamily: 'serif' },
  lecInfo:    { flex: 1, minWidth: 0, gap: 3 },
  lecName:    { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  lecCount:   { fontSize: 11, color: C.textSub },
  lecTypes:   { flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 5 },
  lecBackRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 16, paddingVertical: 4 },
  lecBackText:{ fontSize: 13, fontWeight: '700', color: C.orange },

  featSection:   { marginTop: 22 },
  featCard:      { width: FEAT_CARD_W, borderRadius: 22, padding: 22, paddingBottom: 20, overflow: 'hidden', position: 'relative' },
  featOrb:       { position: 'absolute' },
  featBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 16 },
  featBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5, color: 'rgba(255,255,255,0.9)' },
  featEmoji:     { fontSize: 36, marginBottom: 12 },
  featCourse:    { fontSize: 10, fontWeight: '700', letterSpacing: 1.8, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', marginBottom: 6 },
  featTitle:     { fontFamily: 'serif', fontSize: 20, fontWeight: '700', color: '#fff', lineHeight: 26, marginBottom: 16 },
  featMeta:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featInfoRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featInfoItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  featInfoText:  { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  featDlBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 13 },
  featDlBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  dotsRow:       { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 12 },
  dot:           { height: 5, borderRadius: 3 },

  matSection:        { marginTop: 30 },
  verifiedBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: 'rgba(232,105,42,0.2)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  bannerText:        { flex: 1, fontSize: 11, color: C.textSub, lineHeight: 16 },

  matCard:           { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, marginBottom: 12, overflow: 'hidden', position: 'relative' },
  matAccent:         { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  officialBadge:     { position: 'absolute', top: 0, right: 0, zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.orange, paddingVertical: 5, paddingLeft: 10, paddingRight: 11, borderBottomLeftRadius: 12 },
  officialBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: '#fff', textTransform: 'uppercase' },
  matInner:          { padding: 16, paddingLeft: 20 },
  matTop:            { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  matIconBox:        { width: 54, height: 54, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1, flexShrink: 0 },
  matEmoji:          { fontSize: 28 },
  matHeader:         { flex: 1, minWidth: 0 },
  matCourse:         { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: C.orange, textTransform: 'uppercase', marginBottom: 5 },
  matTitle:          { fontFamily: 'serif', fontSize: 17, fontWeight: '700', color: C.text, lineHeight: 22, marginBottom: 6 },
  matMetaRow:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  matMetaItem:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  matMetaText:       { fontSize: 11, color: C.textSub },

  statBar:           { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, flexWrap: 'wrap', gap: 6 },
  stat:              { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText:          { fontSize: 11, color: C.textSub },
  statSep:           { width: 1, height: 12, backgroundColor: C.border },
  newBadge:          { backgroundColor: '#052e16', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#16a34a' },
  newBadgeText:      { fontSize: 9, fontWeight: '900', color: '#4ade80', letterSpacing: 0.6 },
  typeChip:          { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1 },
  typeChipText:      { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  matActions:          { flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center' },
  matBtn:              { flex: 1, height: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 8, overflow: 'hidden' },
  matBtnPrimary:       { backgroundColor: C.orange, shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  matBtnPrimaryText:   { fontSize: 12, fontWeight: '700', color: '#fff', flexShrink: 1 },
  matBtnSecondary:     { backgroundColor: C.raised, borderWidth: 1, borderColor: C.border },
  matBtnSecondaryText: { fontSize: 12, fontWeight: '700', color: C.text, flexShrink: 1 },
  iconBtn:             { width: 42, height: 42, borderRadius: 12, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  iconBtnActive:       { backgroundColor: 'rgba(223,168,60,0.12)', borderColor: 'rgba(223,168,60,0.25)' },

  loadMore:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, paddingVertical: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16 },
  loadMoreText: { fontSize: 13, fontWeight: '700', color: C.orange },

  empty:        { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 32, gap: 12 },
  emptyIcon:    { fontSize: 48, marginBottom: 4 },
  emptyTitle:   { fontFamily: 'serif', fontSize: 20, fontWeight: '700', color: C.text },
  emptySub:     { fontSize: 13, color: C.textMute, textAlign: 'center', lineHeight: 20, maxWidth: 240 },
  clearBtn:     { backgroundColor: C.sapphDim, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  clearBtnText: { fontSize: 13, fontWeight: '700', color: C.sapphire },
})
