import React, {
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
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'

import { supabase } from '@/lib/supabase'
import { toggleBookmark as dbToggleBookmark } from '@/database/actions'
import { 
  useMaterials, 
  useCourses, 
  useLecturers,
  useBookmarks,
  useUser
} from '@/hooks/useLocalQueries'
import { usePremium } from '@/core/entitlements/PremiumProvider'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { downloadMaterial as syncDownload } from '@/core/sync/fileSyncService'
import { triggerSync } from '@/core/sync/syncService'

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
type SortKey       = 'oldest' | 'downloads' | 'alpha'
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
  downloadStatus?: string
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
function FeaturedCard({ item, gradIdx, onPress }: { item: MaterialRecord; gradIdx: number; onPress: () => void }) {
  const cfg  = TYPE_META[item.type] ?? TYPE_META.other
  const grad = FEAT_GRAD_CONFIGS[gradIdx % FEAT_GRAD_CONFIGS.length]
  return (
    <ScalePress style={ss.featCard} onPress={onPress}>
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
        <View style={ss.featDlBtn}>
          <Ionicons name="download-outline" size={14} color="#fff" />
          <Text allowFontScaling={false} style={ss.featDlBtnText}>Save</Text>
        </View>
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
  const isDownloaded = item.downloadStatus === 'done'

  return (
    <ScalePress style={ss.matCard} onPress={isOfficial ? undefined : onOpen}>
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
          {item.lecturers?.name && (
            <View style={ss.stat}>
              <Ionicons name="person-outline" size={12} color={C.textSub} />
              <Text allowFontScaling={false} style={ss.statText}>{item.lecturers.name}</Text>
            </View>
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
          {/* Primary Actions Row */}
          <View style={ss.primaryRow}>
            <TouchableOpacity 
              style={[ss.matBtn, ss.matBtnPrimary]} 
              onPress={onOpen} 
              activeOpacity={0.85}
            >
              <Ionicons name="eye-outline" size={16} color="#fff" />
              <Text allowFontScaling={false} style={ss.matBtnPrimaryText} numberOfLines={1}>Open File</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[ss.matBtn, isDownloaded ? ss.matBtnSaved : ss.matBtnMinor]} 
              onPress={onDownload} 
              activeOpacity={0.85}
            >
              <Ionicons 
                name={isDownloaded ? 'checkmark-circle' : 'download-outline'} 
                size={16} 
                color={isDownloaded ? C.emerald : C.text} 
              />
              <Text allowFontScaling={false} style={[isDownloaded ? ss.matBtnSavedText : ss.matBtnMinorText]} numberOfLines={1}>
                {isDownloaded ? 'Offline' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Utility Actions Row */}
          <View style={ss.utilityRow}>
            <TouchableOpacity
              style={[ss.iconBtn, isBookmarked && ss.iconBtnActive]}
              onPress={onBookmark}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {bookmarkLoading
                ? <ActivityIndicator size="small" color={C.gold} />
                : <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={16} color={C.gold} />
              }
              <Text style={ss.utilLabel}>Bookmark</Text>
            </TouchableOpacity>

            <TouchableOpacity style={ss.iconBtn} onPress={onChat} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="sparkles" size={15} color={C.sapphire} />
              <Text style={ss.utilLabel}>Ask AI</Text>
            </TouchableOpacity>

            <TouchableOpacity style={ss.iconBtn} onPress={onQuiz} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={'school-outline' as any} size={15} color={C.lavender} />
              <Text style={ss.utilLabel}>Quiz</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScalePress>
  )
}

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function StudyMaterialsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { isOffline } = useNetworkStatus()
  const { isPremium } = usePremium()

  const [query,            setQuery]            = useState('')
  const [filter,           setFilter]           = useState<FilterKey>('all')
  const [sort,             setSort]             = useState<SortKey>('oldest')
  const [sortOpen,         setSortOpen]         = useState(false)
  const [dotIdx,           setDotIdx]           = useState(0)
  const [selectedLecturer, setSelectedLecturer] = useState<LecturerGroup | null>(null)

  const [userId,          setUserId]          = useState<string | null>(null)
  const [profileInfo,     setProfileInfo]     = useState<{ classId: string | null; collegeId: string | null } | null>(null)

  // ── Offline Queries ──────────────────────────
  const { records: localMaterials, loading: materialsLoading } = useMaterials() as { records: any[], loading: boolean }
  const { records: localCourses }                              = useCourses(undefined) as { records: any[] }
  const { records: localLecturers }                            = useLecturers() as { records: any[] }
  const { records: localBookmarks }                            = useBookmarks(userId || '', 'material') as { records: any[] }
  const { user: localUser }                                    = useUser(userId || undefined)

  const [bookmarkLoading, setBookmarkLoading] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { if (session?.user) setUserId(session.user.id) })
    triggerSync().catch(() => {})
  }, [])

  useEffect(() => {
    if (!userId) return
    if (localUser && localUser.classId && localUser.collegeId) {
      setProfileInfo({ classId: localUser.classId, collegeId: localUser.collegeId })
      return
    }
    supabase.from('profiles').select('college_id, class_id').eq('id', userId).single()
      .then(({ data }) => { if (data) setProfileInfo({ classId: data.class_id, collegeId: data.college_id }) })
  }, [userId, localUser])

  const effectiveClassId   = localUser?.classId || profileInfo?.classId || null
  const effectiveCollegeId = localUser?.collegeId || profileInfo?.collegeId || null

  const coursesMap   = useMemo(() => new Map(localCourses.map(c => [c.remoteId || c.id, c])), [localCourses])
  const lecturersMap = useMemo(() => new Map(localLecturers.map(l => [l.remoteId || l.id, l])), [localLecturers])

  // ── Material Transform ───────────────────────
  const materials = useMemo((): MaterialRecord[] => {
    return localMaterials
      .filter(m => {
        if (m.courseId) {
          const course = coursesMap.get(m.courseId);
          if (course && effectiveClassId && course.classId && course.classId !== effectiveClassId) return false
        }
        if (m.lecturerId) {
          const lecturer = lecturersMap.get(m.lecturerId);
          if (lecturer && effectiveCollegeId && lecturer.collegeId && lecturer.collegeId !== effectiveCollegeId) return false
        }
        return true
      })
      .map(m => {
        const course = coursesMap.get(m.courseId)
        const lecturer = lecturersMap.get(m.lecturerId)
        return {
          id:             m.id,
          title:          m.title,
          type:           (m.fileType as MaterialType) || 'other',
          file_url:       m.fileUrl,
          file_size:      m.fileSize,
          is_premium:     false,
          created_at:     new Date(m.createdAt).toISOString(),
          downloadStatus: m.downloadStatus,
          academic_year:  m.academicYear,
          download_count: m.downloadCount,
          courses: course ? { name: course.name, code: course.code, class_id: course.classId, is_official: course.isOfficial } : null,
          lecturers: lecturer ? { name: lecturer.name } : null,
          lecturer_id:    m.lecturerId,
        } as MaterialRecord
      })
  }, [localMaterials, coursesMap, lecturersMap, effectiveClassId, effectiveCollegeId])

  const bookmarkedIds = useMemo(() => new Set(localBookmarks.map(b => b.itemId)), [localBookmarks])

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

  // ── Filtered Lists ───────────────────────────
  const filtered     = filterList(materials, filter, query)
  const officialList = useMemo(() => sortList(filtered.filter(m => m.courses?.is_official === true), sort), [filtered, sort])
  const studentList  = useMemo(() => sortList(filtered.filter(m => !m.courses?.is_official), sort), [filtered, sort])
  const featured     = useMemo(() => [...materials].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0,3), [materials])

  const showFeatured  = filter === 'all' && !query.trim()
  const showLecturers = filter === 'lecturers'
  const noResults     = !showLecturers && officialList.length === 0 && studentList.length === 0
  const showSkeletons = materialsLoading && localMaterials.length === 0

  // ── Handlers ─────────────────────────────────
  const handleDownload = useCallback((item: MaterialRecord) => {
    if (!isPremium) {
      Alert.alert('Premium Required', 'Downloading materials for offline viewing requires a Premium subscription.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/subscription' as any) }
      ])
      return
    }
    const material = localMaterials.find(x => x.id === item.id)
    if (material) syncDownload(material)
  }, [isPremium, localMaterials, router])

  const toggleBookmark = useCallback(async (item: MaterialRecord) => {
    if (!userId) return Alert.alert('Sign in required')
    setBookmarkLoading(item.id)
    try { await dbToggleBookmark(userId, item.id, 'material') } finally { setBookmarkLoading(null) }
  }, [userId])

  const openMaterial = useCallback((item: MaterialRecord) => {
    router.push({
      pathname: '/viewer' as any,
      params: { 
        file_url: item.file_url, 
        title: item.title, 
        material_id: item.id, 
        is_local: item.downloadStatus === 'done' ? '1' : '0',
        color: TYPE_META[item.type]?.accentColor ?? C.sapphire,
      },
    })
  }, [router])

  const onFeatScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (FEAT_CARD_W + FEAT_GAP))
    setDotIdx(Math.min(Math.max(idx, 0), featured.length - 1))
  }, [featured.length])

  // ── RENDER ───────────────────────────────────
  return (
    <View style={[ss.screen, { backgroundColor: C.void }]}>
      {isOffline && (
        <View style={ss.offlineBanner}>
          <Ionicons name="cloud-offline" size={13} color={C.gold} />
          <Text style={ss.offlineBannerText}>Offline Mode — using local database</Text>
        </View>
      )}

      {/* HEADER */}
      <View style={[ss.header, { paddingTop: insets.top + 10 }]}>
        <View style={ss.navRow}>
          <TouchableOpacity style={ss.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={ss.navTitle} numberOfLines={1}>
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

      {/* FILTERS */}
      <View style={ss.controlsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.controlsContent}>
          {FILTER_CHIPS.map(chip => (
            <TouchableOpacity
              key={chip.key}
              style={[ss.chip, filter === chip.key && ss.chipActive]}
              onPress={() => { setFilter(chip.key); setSelectedLecturer(null) }}
            >
              <Text style={[ss.chipText, filter === chip.key && ss.chipTextActive]}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
          {!showLecturers && (
            <TouchableOpacity style={ss.sortBtn} onPress={() => setSortOpen(!sortOpen)}>
              <Ionicons name="funnel-outline" size={13} color={C.textSub} />
              <Text style={ss.sortBtnText}>{SORT_OPTIONS.find(o => o.key === sort)?.label.split(' ')[0]}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* BODY */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[ss.body, { paddingBottom: insets.bottom + 110 }]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => triggerSync()} tintColor={C.orange} />}
      >
        {showSkeletons && <View style={{ marginTop: 22 }}>{Array(4).fill(null).map((_, i) => <SkeletonCard key={i} index={i} />)}</View>}

        {!showSkeletons && (
          <>
            {/* LECTURERS TAB */}
            {showLecturers && !selectedLecturer && (
              <View style={ss.matSection}>
                <SectionHead title="Lecturers" right={<View style={ss.countBadge}><Text style={ss.countBadgeText}>{lecturerGroups.length} lecturers</Text></View>} />
                {lecturerGroups.map(group => (
                  <LecturerCard key={group.name} group={group} onPress={() => setSelectedLecturer(group)} />
                ))}
              </View>
            )}

            {/* LECTURER DETAIL */}
            {showLecturers && selectedLecturer && (
              <View style={ss.matSection}>
                <TouchableOpacity style={ss.lecBackRow} onPress={() => setSelectedLecturer(null)}>
                  <Ionicons name="arrow-back" size={16} color={C.orange} />
                  <Text style={ss.lecBackText}>All Lecturers</Text>
                </TouchableOpacity>
                <SectionHead title={selectedLecturer.name} right={<View style={ss.countBadge}><Text style={ss.countBadgeText}>{selectedLecturer.materialCount} files</Text></View>} />
                {selectedLecturer.materials.map(m => (
                  <MaterialCard
                    key={m.id} item={m} isOfficial={m.courses?.is_official === true} isNew={false} isBookmarked={bookmarkedIds.has(m.id)} bookmarkLoading={bookmarkLoading === m.id}
                    onOpen={() => openMaterial(m)} onDownload={() => handleDownload(m)}
                    onChat={() => router.push({ pathname: '/chat' as any, params: { material_title: m.title, file_url: m.file_url, material_id: m.id } })}
                    onBookmark={() => toggleBookmark(m)}
                    onQuiz={() => router.push({ pathname: '/quiz-flashcards' as any, params: { material_id: m.id, title: m.title, file_url: m.file_url, type: m.type, auto_generate: '1' } })}
                  />
                ))}
              </View>
            )}

            {/* NORMAL TABS */}
            {!showLecturers && (
              <>
                {showFeatured && featured.length > 0 && (
                  <View style={ss.featSection}>
                    <SectionHead title="Pinned & Featured" />
                    <FlatList
                      data={featured} keyExtractor={item => item.id} horizontal showsHorizontalScrollIndicator={false}
                      snapToInterval={FEAT_CARD_W + FEAT_GAP} decelerationRate="fast"
                      contentContainerStyle={{ gap: FEAT_GAP, paddingRight: 4 }}
                      onScroll={onFeatScroll} scrollEventThrottle={16}
                      renderItem={({ item, index }) => <FeaturedCard item={item} gradIdx={index} onPress={() => openMaterial(item)} />}
                    />
                    <View style={ss.dotsRow}>
                      {featured.map((_, i) => <View key={i} style={[ss.dot, i === dotIdx ? { width: 18, backgroundColor: C.orange } : { width: 5,  backgroundColor: C.borderHi }]} />)}
                    </View>
                  </View>
                )}

                {officialList.length > 0 && (
                  <View style={ss.matSection}>
                    <SectionHead title="Official Resources" right={<View style={ss.countBadge}><Text style={ss.countBadgeText}>{officialList.length} files</Text></View>} />
                    {officialList.map(m => (
                      <MaterialCard
                        key={m.id} item={m} isOfficial isNew={false} isBookmarked={bookmarkedIds.has(m.id)} bookmarkLoading={bookmarkLoading === m.id}
                        onOpen={() => openMaterial(m)} onDownload={() => handleDownload(m)}
                        onChat={() => router.push({ pathname: '/chat' as any, params: { material_title: m.title, file_url: m.file_url, material_id: m.id } })}
                        onBookmark={() => toggleBookmark(m)}
                        onQuiz={() => router.push({ pathname: '/quiz-flashcards' as any, params: { material_id: m.id, title: m.title, file_url: m.file_url, type: m.type, auto_generate: '1' } })}
                      />
                    ))}
                  </View>
                )}

                {studentList.length > 0 && (
                  <View style={ss.matSection}>
                    <SectionHead title="Student Uploads" right={<View style={ss.countBadge}><Text style={ss.countBadgeText}>{studentList.length} files</Text></View>} />
                    {studentList.map(m => (
                      <MaterialCard
                        key={m.id} item={m} isOfficial={false} isNew={false} isBookmarked={bookmarkedIds.has(m.id)} bookmarkLoading={bookmarkLoading === m.id}
                        onOpen={() => openMaterial(m)} onDownload={() => handleDownload(m)}
                        onChat={() => router.push({ pathname: '/chat' as any, params: { material_title: m.title, file_url: m.file_url, material_id: m.id } })}
                        onBookmark={() => toggleBookmark(m)}
                        onQuiz={() => router.push({ pathname: '/quiz-flashcards' as any, params: { material_id: m.id, title: m.title, file_url: m.file_url, type: m.type, auto_generate: '1' } })}
                      />
                    ))}
                  </View>
                )}

                {noResults && (
                  <View style={ss.empty}>
                    <Text style={ss.emptyIcon}>🔍</Text>
                    <Text style={ss.emptyTitle}>No materials found</Text>
                    <Text style={ss.emptySub}>Try a different search term or filter.</Text>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* SORT DROPDOWN OVERLAY (Simplified) */}
      {sortOpen && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSortOpen(false)} />
          <View style={ss.dropdown}>
            {SORT_OPTIONS.map(opt => (
              <TouchableOpacity key={opt.key} style={ss.dropOpt} onPress={() => { setSort(opt.key); setSortOpen(false) }}>
                <Ionicons name={opt.icon} size={15} color={sort === opt.key ? C.orange : C.textSub} />
                <Text style={[ss.dropOptText, sort === opt.key && { color: C.orange }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  )
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const ss = StyleSheet.create({
  screen: { flex: 1 },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(223,168,60,0.12)', borderBottomWidth: 1, borderBottomColor: 'rgba(223,168,60,0.3)', paddingVertical: 8 },
  offlineBannerText: { fontSize: 12, fontWeight: '600', color: C.gold },
  header:      { backgroundColor: 'rgba(7,8,12,0.94)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 18, paddingBottom: 12 },
  navRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  backBtn:     { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  navTitle:    { flex: 1, fontSize: 20, fontWeight: '900', color: C.text },
  navAccent:   { color: C.orange },
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 },
  searchInput: { flex: 1, fontSize: 14, color: C.text },
  controlsWrap:    { borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.void },
  controlsContent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12 },
  chip:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  chipActive:      { backgroundColor: C.orange, borderColor: C.orange },
  chipText:        { fontSize: 12.5, fontWeight: '600', color: C.textSub },
  chipTextActive:  { color: '#fff' },
  sortBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  sortBtnText:     { fontSize: 12, fontWeight: '600', color: C.textSub },
  body:            { paddingHorizontal: 18 },
  sectionHead:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionLine:     { width: 14, height: 1, backgroundColor: C.orange },
  sectionTitle:    { fontSize: 10, fontWeight: '700', color: C.textMute, letterSpacing: 2 },
  countBadge:      { backgroundColor: C.orangeDim, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  countBadgeText:  { fontSize: 10, fontWeight: '800', color: C.orange },
  matSection:      { marginTop: 30 },
  matCard:           { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, marginBottom: 12, overflow: 'hidden', position: 'relative' },
  matAccent:         { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  officialBadge:     { position: 'absolute', top: 0, right: 0, zIndex: 2, backgroundColor: C.orange, paddingVertical: 5, paddingHorizontal: 10, borderBottomLeftRadius: 12 },
  officialBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  matInner:          { padding: 16, paddingLeft: 20 },
  matTop:            { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  matIconBox:        { width: 54, height: 54, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  matEmoji:          { fontSize: 28 },
  matHeader:         { flex: 1 },
  matCourse:         { fontSize: 10, fontWeight: '700', color: C.orange, textTransform: 'uppercase' },
  matTitle:          { fontSize: 17, fontWeight: '700', color: C.text, lineHeight: 22 },
  matMetaRow:        { flexDirection: 'row', gap: 12, marginTop: 4 },
  matMetaItem:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  matMetaText:       { fontSize: 11, color: C.textSub },
  statBar:           { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  stat:              { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 12 },
  statText:          { fontSize: 11, color: C.textSub },
  newBadge:          { backgroundColor: '#052e16', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  newBadgeText:      { fontSize: 9, fontWeight: '900', color: '#4ade80' },
  typeChip:          { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1 },
  typeChipText:      { fontSize: 9.5, fontWeight: '700' },
  matActions: { marginTop: 16, gap: 10 },
  primaryRow: { flexDirection: 'row', gap: 8 },
  utilityRow: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  matBtn:     { flex: 1, height: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  matBtnPrimary:     { backgroundColor: C.orange },
  matBtnMinor:       { backgroundColor: C.raised, borderWidth: 1, borderColor: C.border },
  matBtnSaved:       { backgroundColor: C.emerDim, borderWidth: 1, borderColor: C.emerald },
  matBtnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  matBtnMinorText:   { fontSize: 13, fontWeight: '700', color: C.text },
  matBtnSavedText:   { fontSize: 13, fontWeight: '700', color: C.emerald },
  iconBtn:           { flex: 1, height: 38, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  iconBtnActive:     { backgroundColor: C.goldDim, borderColor: C.gold + '40' },
  utilLabel:         { fontSize: 11, fontWeight: '600', color: C.textSub },
  featSection:   { marginTop: 22 },
  featCard:      { width: FEAT_CARD_W, borderRadius: 22, padding: 22, overflow: 'hidden' },
  featOrb:       { position: 'absolute' },
  featBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: 4, alignSelf: 'flex-start' },
  featBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  featEmoji:     { fontSize: 36, marginVertical: 12 },
  featCourse:    { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  featTitle:     { fontSize: 20, fontWeight: '700', color: '#fff', lineHeight: 26 },
  featMeta:      { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  featInfoRow:   { flexDirection: 'row', gap: 12 },
  featInfoItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  featInfoText:  { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  featDlBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 8 },
  featDlBtnText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  dotsRow:       { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 12 },
  dot:           { height: 5, borderRadius: 3 },
  lecCard:    { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, marginBottom: 10 },
  lecIconBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: C.orangeDim, justifyContent: 'center', alignItems: 'center' },
  lecInitial: { fontSize: 22, fontWeight: '800', color: C.orange },
  lecInfo:    { flex: 1, gap: 3 },
  lecName:    { fontSize: 15, fontWeight: '700', color: C.text },
  lecCount:   { fontSize: 11, color: C.textSub },
  lecTypes:   { flexDirection: 'row', gap: 5, marginTop: 5 },
  lecBackRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 16 },
  lecBackText:{ fontSize: 13, fontWeight: '700', color: C.orange },
  empty:        { alignItems: 'center', paddingVertical: 64, gap: 12 },
  emptyIcon:    { fontSize: 48 },
  emptyTitle:   { fontSize: 20, fontWeight: '700', color: C.text },
  emptySub:     { fontSize: 13, color: C.textMute, textAlign: 'center' },
  dropdown:        { position: 'absolute', top: 150, right: 18, width: 200, backgroundColor: C.raised, borderWidth: 1, borderColor: C.borderHi, borderRadius: 16, overflow: 'hidden', zIndex: 1000 },
  dropOpt:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  dropOptText:     { fontSize: 13, fontWeight: '600', color: C.textSub },
})
