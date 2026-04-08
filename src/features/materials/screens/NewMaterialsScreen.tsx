/**
 * app/new-materials.tsx — Offline-First Class Materials Screen
 * Production-ready: Uses WatermelonDB local data filtered by user's college/class.
 */

import { Ionicons } from '@expo/vector-icons'
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
  SectionList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'

import { supabase } from '@/lib/supabase'
import { toggleBookmark as dbToggleBookmark } from '@/database/actions'
import { triggerSync } from '@/core/sync/syncService'
import {
  useMaterials,
  useCourses,
  useLecturers,
  useBookmarks,
  useUser,
} from '@/hooks/useLocalQueries'
import { usePremium } from '@/core/entitlements/PremiumProvider'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { downloadMaterial as syncDownload } from '@/core/sync/fileSyncService'

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Theme
// ─────────────────────────────────────────────────────────────────────────────
const BODY_H_PAD = 16

const C = {
  void:       '#08090C',
  deep:       '#0D0F14',
  surface:    '#141720',
  raised:     '#1A1E2A',
  border:     'rgba(255,255,255,0.06)',
  borderHi:   'rgba(255,255,255,0.12)',
  text:       '#EEF0F6',
  textSub:    '#94A3B8',
  textMute:   '#475569',
  orange:     '#E8692A',
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
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; bg: string }> = {
  slide:         { label: 'Slides',         icon: 'easel-outline',          color: C.orange,   bg: C.orangeDim   },
  past_question: { label: 'Past Questions', icon: 'document-text-outline',  color: C.lavender, bg: C.lavDim    },
  tutorial:      { label: 'Tutorials',      icon: 'school-outline',         color: C.coral,    bg: C.coralDim  },
  book:          { label: 'Books',          icon: 'book-outline',           color: C.sapphire, bg: C.sapphDim },
  notes:         { label: 'Notes',          icon: 'document-outline',       color: C.gold,     bg: C.goldDim   },
  other:         { label: 'Other',          icon: 'folder-outline',         color: C.sky,      bg: C.skyDim   },
}

type MaterialType = 'slide' | 'book' | 'past_question' | 'notes' | 'tutorial' | 'other'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface MaterialRecord {
  id: string
  remoteId?: string
  title: string
  type: MaterialType
  file_url: string
  file_size: number | null
  is_premium: boolean
  created_at: string
  download_count?: number
  downloadStatus?: string
  courses: {
    name: string
    code: string
    class_id: string
    is_official?: boolean
  } | null
  lecturers?: { name: string } | null
  lecturer_id: string | null
  lecturer_name?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Sub-components
// ─────────────────────────────────────────────────────────────────────────────
function OfflineBanner() {
  return (
    <View style={{
      backgroundColor: C.goldDim, borderBottomWidth: 1,
      borderBottomColor: C.gold + '30', paddingVertical: 8,
      paddingHorizontal: BODY_H_PAD, flexDirection: 'row',
      alignItems: 'center', gap: 8,
    }}>
      <Ionicons name="cloud-offline-outline" size={14} color={C.gold} />
      <Text style={{ fontSize: 12, color: C.gold, fontWeight: '600', flex: 1 }}>
        You're offline — showing cached materials
      </Text>
    </View>
  )
}

function ScalePress({ children, onPress, style }: {
  children: React.ReactNode; onPress?: () => void; style?: any
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

function SectionHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={S.sectionHead}>
      <View style={S.sectionLabelRow}>
        <View style={S.sectionLine} />
        <Text allowFontScaling={false} style={S.sectionTitle}>{title.toUpperCase()}</Text>
      </View>
      {right}
    </View>
  )
}

function TypeChip({ label, color, bg, border }: {
  label: string; color: string; bg: string; border: string
}) {
  return (
    <View style={[S.typeChip, { backgroundColor: bg, borderColor: border }]}>
      <Text allowFontScaling={false} style={[S.typeChipText, { color }]}>{label}</Text>
    </View>
  )
}

function FeaturedCard({
  item, index, isBookmarked, onOpen, onSave,
}: {
  item: MaterialRecord
  index: number
  isBookmarked: boolean
  onOpen: () => void
  onSave: () => void
}) {
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.other

  return (
    <TouchableOpacity
      style={S.featCard}
      onPress={onOpen}
      activeOpacity={0.9}
    >
      <LinearGradient
        colors={[C.surface, C.deep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={[S.featBadge, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={10} color={cfg.color} />
        <Text style={[S.featBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>

      <Text style={S.featTitle} numberOfLines={2}>{item.title}</Text>
      
      <View style={{ flex: 1 }} />

      <View style={S.featFooter}>
        <View style={S.featActions}>
          <TouchableOpacity 
            style={[S.featActionBtn, isBookmarked && S.featActionBtnActive]} 
            onPress={onSave}
          >
            <Ionicons 
              name={isBookmarked ? 'bookmark' : 'bookmark-outline'} 
              size={14} 
              color={isBookmarked ? C.orange : C.textSub} 
            />
            <Text style={[S.featActionText, isBookmarked && S.featActionTextActive]}>
              {isBookmarked ? 'Saved' : 'Save'}
            </Text>
          </TouchableOpacity>

          {item.downloadStatus === 'done' && (
            <View style={S.offlineBadge}>
              <Ionicons name="cloud-download" size={10} color={C.emerald} />
              <Text style={S.offlineBadgeText}>Offline</Text>
            </View>
          )}
        </View>

        <View style={S.featArrow}>
          <Ionicons name="chevron-forward" size={14} color={C.textMute} />
        </View>
      </View>
    </TouchableOpacity>
  )
}

function MaterialCard({
  item, index, isOfficial, isNew, isBookmarked, bookmarkLoading, onOpen, onChat, onToggleBookmark, onDownload, onQuiz,
}: {
  item: MaterialRecord
  index: number
  isOfficial: boolean
  isNew: boolean
  isBookmarked: boolean
  bookmarkLoading: boolean
  onOpen: () => void
  onChat: () => void
  onToggleBookmark: () => void
  onDownload: () => void
  onQuiz: () => void
}) {
  const TYPE_META: Record<string, any> = {
    slide:         { label: 'Slides',   emoji: '📊', accentColor: C.orange,   accentDim: C.orangeDim, accentBorder: 'rgba(232,105,42,0.2)'  },
    book:          { label: 'Book',     emoji: '📘', accentColor: C.sapphire, accentDim: C.sapphDim,  accentBorder: 'rgba(75,140,245,0.2)'   },
    past_question: { label: 'Past Q&A', emoji: '📝', accentColor: C.lavender, accentDim: C.lavDim,    accentBorder: 'rgba(155,124,244,0.2)'  },
    notes:         { label: 'Notes',    emoji: '🗒️', accentColor: C.gold,     accentDim: C.goldDim,   accentBorder: 'rgba(223,168,60,0.2)'   },
    tutorial:      { label: 'Tutorial', emoji: '🎬', accentColor: C.coral,    accentDim: C.coralDim,  accentBorder: 'rgba(238,104,104,0.2)'  },
    other:         { label: 'Other',    emoji: '📄', accentColor: C.sky,      accentDim: C.skyDim,    accentBorder: 'rgba(56,189,248,0.2)'   },
  }

  const cfg = TYPE_META[item.type] ?? TYPE_META.other
  const isDownloaded = item.downloadStatus === 'done'

  return (
    <ScalePress style={S.matCard} onPress={onOpen}>
      <View style={[S.matAccent, { backgroundColor: cfg.accentColor }]} />
      {isOfficial && (
        <View style={S.officialBadge}>
          <Ionicons name="checkmark-circle" size={11} color="#fff" />
          <Text allowFontScaling={false} style={S.officialBadgeText}>Official</Text>
        </View>
      )}
      <View style={S.matInner}>
        {/* TOP */}
        <View style={S.matTop}>
          <View style={[S.matIconBox, { backgroundColor: cfg.accentDim, borderColor: cfg.accentBorder }]}>
            <Text style={S.matEmoji}>{cfg.emoji}</Text>
          </View>
          <View style={S.matHeader}>
            <Text allowFontScaling={false} style={S.matCourse} numberOfLines={1}>
              {item.courses?.name ?? '—'}{item.courses?.code ? ` • ${item.courses.code}` : ''}
            </Text>
            <Text maxFontSizeMultiplier={1.15} style={S.matTitle} numberOfLines={2}>{item.title}</Text>
            <View style={S.matMetaRow}>
              <View style={S.matMetaItem}>
                <Ionicons name="calendar-outline" size={11} color={C.textSub} />
                <Text allowFontScaling={false} style={S.matMetaText}>{fmtDate(item.created_at)}</Text>
              </View>
              {item.type === 'slide' && (item.lecturers?.name || item.lecturer_name) && (
                <View style={S.matMetaItem}>
                  <Ionicons name="person-outline" size={11} color={C.textSub} />
                  <Text allowFontScaling={false} style={S.matMetaText}>{item.lecturers?.name || item.lecturer_name}</Text>
                </View>
              )}
              {item.file_size ? (
                <View style={S.matMetaItem}>
                  <Ionicons name="server-outline" size={11} color={C.textSub} />
                  <Text allowFontScaling={false} style={S.matMetaText}>{fmtSize(item.file_size)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* STAT BAR */}
        <View style={S.statBar}>
          {(item.download_count ?? 0) > 0 && (
            <View style={S.stat}>
              <Ionicons name="download-outline" size={12} color={C.textSub} />
              <Text allowFontScaling={false} style={S.statText}>
                {fmtCount(item.download_count!)} downloads
              </Text>
            </View>
          )}
          {(item.lecturers?.name || item.lecturer_name) && item.type !== 'slide' && (
            <View style={S.stat}>
              <Ionicons name="person-outline" size={12} color={C.textSub} />
              <Text allowFontScaling={false} style={S.statText}>{item.lecturers?.name || item.lecturer_name}</Text>
            </View>
          )}
          {isNew && (
            <View style={S.newBadge}>
              <Text allowFontScaling={false} style={S.newBadgeText}>NEW</Text>
            </View>
          )}
          <View style={{ marginLeft: 'auto' }}>
            <TypeChip label={cfg.label} color={cfg.accentColor} bg={cfg.accentDim} border={cfg.accentBorder} />
          </View>
        </View>

        {/* ACTIONS */}
        <View style={S.matActions}>
          <View style={S.primaryRow}>
            <TouchableOpacity 
              style={[S.matBtn, S.matBtnPrimary]} 
              onPress={onOpen} 
              activeOpacity={0.85}
            >
              <Ionicons name="eye-outline" size={16} color="#fff" />
              <Text allowFontScaling={false} style={S.matBtnText} numberOfLines={1}>Open File</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[S.matBtn, isDownloaded ? S.matBtnSaved : S.matBtnMinor]} 
              onPress={onDownload} 
              activeOpacity={0.85}
            >
              <Ionicons 
                name={isDownloaded ? 'checkmark-circle' : 'download-outline'} 
                size={16} 
                color={isDownloaded ? C.emerald : C.text} 
              />
              <Text allowFontScaling={false} style={[S.matBtnText, isDownloaded && { color: C.emerald }]} numberOfLines={1}>
                {isDownloaded ? 'Offline' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={S.utilityRow}>
            <TouchableOpacity
              style={[S.utilBtn, isBookmarked && S.utilBtnActive]}
              onPress={onToggleBookmark}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {bookmarkLoading
                ? <ActivityIndicator size="small" color={C.gold} />
                : <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={16} color={C.gold} />
              }
              <Text style={[S.utilBtnText, isBookmarked && { color: C.gold }]}>Bookmark</Text>
            </TouchableOpacity>

            <TouchableOpacity style={S.utilBtn} onPress={onChat} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="sparkles" size={15} color={C.sapphire} />
              <Text style={S.utilBtnText}>Ask AI</Text>
            </TouchableOpacity>

            <TouchableOpacity style={S.utilBtn} onPress={onQuiz} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="school-outline" size={15} color={C.lavender} />
              <Text style={[S.utilBtnText, { color: C.lavender }]}>Quiz</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScalePress>
  )
}

function SkeletonCard({ index }: { index: number }) {
  const opacity = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start()
  }, [opacity])

  return (
    <Animated.View style={[{
      backgroundColor: C.surface, borderRadius: 16, borderWidth: 1,
      borderColor: C.border, padding: 16, marginBottom: 12,
    }, { opacity }]}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.raised }} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ height: 14, borderRadius: 7, backgroundColor: C.raised, width: '70%' }} />
          <View style={{ height: 11, borderRadius: 6, backgroundColor: C.raised, width: '45%' }} />
        </View>
      </View>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function NewMaterialsScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const { isOffline } = useNetworkStatus()
  const { isPremium } = usePremium()

  const [search, setSearch]   = useState('')
  const [userId, setUserId]   = useState<string | null>(null)
  const [bookmarkLoading, setBookmarkLoading] = useState<string | null>(null)

  const heroOpacity = useRef(new Animated.Value(0)).current
  const heroY       = useRef(new Animated.Value(12)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(heroY,       { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start()
  }, [heroOpacity, heroY])

  // Get auth user ID
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUserId(session.user.id)
    })
  }, [])

  // ── WatermelonDB reactive hooks ──
  const { user }                    = useUser(userId || undefined)
  const [profileInfo, setProfileInfo] = useState<{ classId: string | null; collegeId: string | null } | null>(null)

  // Effective user info for filtering: prefer WatermelonDB, fallback to profiles
  const effectiveClassId = useMemo(() => user?.classId || profileInfo?.classId || null, [user, profileInfo])
  const effectiveCollegeId = useMemo(() => user?.collegeId || profileInfo?.collegeId || null, [user, profileInfo])

  const { records: localMaterials, loading: materialsLoading } = useMaterials() as { records: any[], loading: boolean }
  const { records: localCourses }   = useCourses(effectiveClassId) as { records: any[] }
  const { records: localLecturers } = useLecturers(effectiveCollegeId) as { records: any[] }
  const { records: localBookmarks } = useBookmarks(userId || '', 'material') as { records: any[] }

  const [refreshing, setRefreshing] = useState(false)

  // 1. Initial Sync on mount
  useEffect(() => {
    if (userId) triggerSync().catch(() => {})
  }, [userId])

  // 2. Realtime Sync: Trigger sync when a new material is added to Supabase
  useEffect(() => {
    const channel = supabase
      .channel('materials-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'materials' },
        (payload) => {
          console.log('[Realtime] New material detected, syncing...', payload.new.id)
          triggerSync().catch(() => {})
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await triggerSync()
    } catch (err) {
      console.warn('[Sync] Manual refresh failed:', err)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    if (user && user.classId && user.collegeId) {
      setProfileInfo({ classId: user.classId, collegeId: user.collegeId })
      return
    }
    supabase.from('profiles').select('college_id, class_id').eq('id', userId).single()
      .then(({ data }) => {
        if (data) {
          setProfileInfo({ classId: data.class_id, collegeId: data.college_id })
        }
      })
  }, [userId, user])

  const bookmarkedIds = useMemo(() => new Set(localBookmarks.map((b: any) => b.itemId)), [localBookmarks])

  const coursesMap = useMemo(() => {
    const map = new Map<string, any>()
    localCourses.forEach((c: any) => {
      map.set(c.id, c)
      if (c.remoteId) map.set(c.remoteId, c)
    })
    return map
  }, [localCourses])

  const lecturersMap = useMemo(() => {
    const map = new Map<string, any>()
    localLecturers.forEach((l: any) => {
      map.set(l.id, l)
      if (l.remoteId) map.set(l.remoteId, l)
    })
    return map
  }, [localLecturers])

  const materials = useMemo((): MaterialRecord[] => {
    if (materialsLoading && localMaterials.length === 0) return []
    return localMaterials
      .filter((m: any) => !!effectiveClassId && m.classId === effectiveClassId)
      .map((m: any) => {
        const course   = coursesMap.get(m.courseId)
        const lecturer = lecturersMap.get(m.lecturerId)
        return {
          id:             m.id,
          remoteId:       m.remoteId,
          title:          m.title,
          type:           (m.fileType as MaterialType) || 'other',
          file_url:       m.fileUrl,
          file_size:      m.fileSize,
          is_premium:     false,
          download_count: m.downloadCount || 0,
          created_at:     new Date(m.createdAt).toISOString(),
          downloadStatus: m.downloadStatus,
          courses:        course ? { name: course.name, code: course.code, class_id: course.classId, is_official: course.isOfficial } : null,
          lecturers:      lecturer ? { name: lecturer.name } : null,
          lecturer_id:    m.lecturerId,
          lecturer_name:  m.lecturerName || lecturer?.name || null,
        } as MaterialRecord
      })
      .sort((a: MaterialRecord, b: MaterialRecord) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50)
  }, [localMaterials, coursesMap, lecturersMap, materialsLoading])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of materials) {
      c[m.type] = (c[m.type] ?? 0) + 1
    }
    return c
  }, [materials])

  const featured = useMemo(() => materials.slice(0, 5), [materials])

  const displayed = useMemo(() => {
    let list = materials
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(m =>
        m.title.toLowerCase().includes(q) ||
        (m.courses?.name ?? '').toLowerCase().includes(q) ||
        (m.courses?.code ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [materials, search])

  const sections = useMemo(() => {
    const today: MaterialRecord[] = []
    const yesterday: MaterialRecord[] = []
    const older: MaterialRecord[] = []

    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000
    const twoDays = 48 * 60 * 60 * 1000

    displayed.forEach(m => {
      const ts = new Date(m.created_at).getTime()
      if (ts > now - oneDay) today.push(m)
      else if (ts > now - twoDays) yesterday.push(m)
      else older.push(m)
    })

    const res = []
    if (today.length > 0) res.push({ title: 'New Today', data: today, isNew: true })
    if (yesterday.length > 0) res.push({ title: 'Yesterday', data: yesterday })
    if (older.length > 0) res.push({ title: 'Previous Submissions', data: older })
    return res
  }, [displayed])

  const toggleBookmark = useCallback(async (item: MaterialRecord) => {
    if (!userId) return Alert.alert('Sign in required')
    setBookmarkLoading(item.id)
    try { await dbToggleBookmark(userId, item.id, 'material') } finally { setBookmarkLoading(null) }
  }, [userId])

  const openMaterial = useCallback((item: MaterialRecord) => {
    router.push({
      pathname: '/viewer' as any,
      params: { file_url: item.file_url, title: item.title, material_id: item.id, is_local: item.downloadStatus === 'done' ? '1' : '0' },
    })
  }, [router])

  const handleDownload = useCallback((item: MaterialRecord) => {
    if (!isPremium) {
      Alert.alert('Premium Required', 'Downloading materials requires Premium.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/subscription' as any) }
      ])
      return
    }
    const material = localMaterials.find((x: any) => x.id === item.id)
    if (material) syncDownload(material)
  }, [isPremium, localMaterials, router])

  const openQuiz = useCallback((item: MaterialRecord) => {
    router.push({
      pathname: '/quiz-flashcards' as any,
      params: { material_id: item.id, title: item.title, file_url: item.file_url, type: item.type, auto_generate: '1' },
    })
  }, [router])

  const NAV_H = insets.top + 58

  return (
    <View style={S.root}>
      <View style={[S.nav, { paddingTop: insets.top + 10 }]}>
        <View style={S.orbOrange} />
        <View style={S.orbBlue} />
        <View style={S.orbPurple} />
        <TouchableOpacity style={S.navBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={16} color={C.textSub} />
        </TouchableOpacity>
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

      {isOffline && materials.length > 0 && <OfflineBanner />}

      <Animated.View
        style={[S.hero, { paddingTop: NAV_H + 18 }, { opacity: heroOpacity, transform: [{ translateY: heroY }] }]}
      >
        <View style={S.blob1} />
        <View style={S.blob2} />
        <View style={S.heroTitleRow}>
          <Text style={S.heroTitle}>New Class Materials</Text>
        </View>
        <Text style={S.heroSub}>
          {materialsLoading ? 'Loading…' : `${materials.length} materials available`}
        </Text>
        
        <View style={S.searchWrap}>
          <Ionicons name="search" size={14} color={C.textMute} style={{ marginLeft: 13 }} />
          <TextInput
            style={S.searchInput}
            placeholder="Search materials…"
            placeholderTextColor={C.textMute}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </Animated.View>

      {materialsLoading && materials.length === 0 ? (
        <View style={S.list}>
          {Array(6).fill(0).map((_, i) => <SkeletonCard key={i} index={i} />)}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.orange}
              colors={[C.orange]}
            />
          }
          contentContainerStyle={[S.list, displayed.length === 0 && S.listEmpty]}
          ListHeaderComponent={
            featured.length > 0 && !search ? (
              <View style={{ marginBottom: 20 }}>
                <SectionHead title="Featured Materials" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }}>
                  {featured.map((item, idx) => (
                    <FeaturedCard 
                      key={item.id} item={item} index={idx} isBookmarked={bookmarkedIds.has(item.id)}
                      onOpen={() => openMaterial(item)} onSave={() => toggleBookmark(item)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null
          }
          renderSectionHeader={({ section: { title, isNew } }) => (
            <View style={{ marginTop: 20, marginBottom: 12 }}>
              <SectionHead 
                title={title} 
                right={isNew && (
                  <View style={{ backgroundColor: C.orange + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: C.orange + '40' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: C.orange }}>LATEST</Text>
                  </View>
                )}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={S.emptyState}>
              <View style={S.emptyIcon}>
                <Ionicons name="library-outline" size={32} color={C.textMute} />
              </View>
              <Text style={S.emptyTitle}>No materials found</Text>
              <Text style={S.emptySub}>Try a different search or filter.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <MaterialCard
              item={item} index={index}
              isOfficial={true}
              isNew={new Date(item.created_at).getTime() > Date.now() - 24 * 60 * 60 * 1000}
              isBookmarked={bookmarkedIds.has(item.id)}
              bookmarkLoading={bookmarkLoading === item.id}
              onOpen={() => openMaterial(item)}
              onChat={() => router.push({ pathname: '/chat' as any, params: { material_title: item.title, file_url: item.file_url, material_id: item.id } })}
              onToggleBookmark={() => toggleBookmark(item)}
              onDownload={() => handleDownload(item)}
              onQuiz={() => openQuiz(item)}
            />
          )}
        />
      )}
    </View>
  )
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.void },
  nav: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  navBrand:          { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 0 },
  navLogo:           { width: 34, height: 34, borderRadius: 11, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center' },
  navWordmark:       { fontSize: 19, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  navWordmarkAccent: { color: C.orange },
  navBtn:            { width: 38, height: 38, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  
  orbOrange: { position: 'absolute', top: -120, right: -80,  width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(232,105,42,0.12)' },
  orbBlue:   { position: 'absolute', top:   40, left: -60,   width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(75,140,245,0.07)'  },
  orbPurple: { position: 'absolute', top:   80, left: '38%' as any, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(155,124,244,0.06)' },
  
  hero: { backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingBottom: 0, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: C.border },
  blob1: { position: 'absolute', width: 280, height: 280, borderRadius: 140, top: -130, right: -90, backgroundColor: '#1A56DB', opacity: 0.07 },
  blob2: { position: 'absolute', width: 180, height: 180, borderRadius: 90,  bottom: -70, left: -50, backgroundColor: '#7C3AED', opacity: 0.06 },
  heroTitleRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  heroTitle:        { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: -0.8, lineHeight: 32 },
  heroSub:          { fontSize: 12, color: C.textSub, marginBottom: 16 },

  sectionHead:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionLine:     { width: 14, height: 1, backgroundColor: C.orange },
  sectionTitle:    { fontSize: 10, fontWeight: '700', color: C.textMute, letterSpacing: 2 },
  
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
  matBtnText:        { fontSize: 13, fontWeight: '700', color: '#fff' },
  utilBtn:           { flex: 1, height: 38, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  utilBtnActive:     { backgroundColor: C.goldDim, borderColor: C.gold + '40' },
  utilBtnText:       { fontSize: 11, fontWeight: '600', color: C.textSub },

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
  emptyState: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 60, paddingBottom: 40 },
  emptyIcon:  { width: 80, height: 80, borderRadius: 24, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  clearBtn:   { backgroundColor: C.orangeDim, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: C.orange + '30' },
  clearBtnText: { fontSize: 13, fontWeight: '700', color: C.orange },
  featCard: {
    width: 200, height: 140, borderRadius: 20, backgroundColor: C.surface,
    padding: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.border,
  },
  featBadge: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 10,
    zIndex: 1,
  },
  featBadgeText: { fontSize: 10, fontWeight: '800' },
  featTitle: { fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 20, zIndex: 1 },
  featFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, zIndex: 1 },
  featActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.raised, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  featActionBtnActive: { backgroundColor: C.orangeDim, borderColor: C.orange + '40' },
  featActionText: { fontSize: 10, fontWeight: '700', color: C.textSub },
  featActionTextActive: { color: C.orange },
  featArrow: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  offlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.emerDim, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  offlineBadgeText: { fontSize: 9, fontWeight: '800', color: C.emerald },
})