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
  void:      '#0A0A0F',
  deep:      '#0F0F18',
  surface:   '#16161F',
  raised:    '#1C1C28',
  border:    'rgba(255,255,255,0.07)',
  text:      '#F0F0F8',
  textSub:   '#9090A8',
  textMute:  '#55556A',
  orange:    '#E8692A',
  orangeDim: 'rgba(232,105,42,0.12)',
  gold:      '#F5C842',
  goldDim:   'rgba(245,200,66,0.12)',
  green:     '#34C759',
  greenDim:  'rgba(52,199,89,0.12)',
  blue:      '#4B8CF5',
  blueDim:   'rgba(75,140,245,0.12)',
  purple:    '#9B7CF4',
  purpleDim: 'rgba(155,124,244,0.12)',
  red:       '#FF453A',
  redDim:    'rgba(255,69,58,0.12)',
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; bg: string }> = {
  slide:         { label: 'Slides',         icon: 'easel-outline',          color: C.blue,   bg: C.blueDim   },
  past_question: { label: 'Past Questions', icon: 'document-text-outline',  color: C.red,    bg: C.redDim    },
  tutorial:      { label: 'Tutorials',      icon: 'school-outline',         color: C.green,  bg: C.greenDim  },
  book:          { label: 'Books',          icon: 'book-outline',           color: C.purple, bg: C.purpleDim },
  notes:         { label: 'Notes',          icon: 'document-outline',       color: C.gold,   bg: C.goldDim   },
  other:         { label: 'Other',          icon: 'folder-outline',         color: C.gold,   bg: C.goldDim   },
}

type MaterialType = 'slide' | 'book' | 'past_question' | 'notes' | 'tutorial' | 'other'
type FilterKey = MaterialType | 'all'

const FILTER_TABS: { key: FilterKey; label: string; emoji: string }[] = [
  { key: 'all',           label: 'All',            emoji: '📚' },
  { key: 'slide',         label: 'Slides',         emoji: '📊' },
  { key: 'past_question', label: 'Past Qs',        emoji: '📝' },
  { key: 'book',          label: 'Books',          emoji: '📖' },
  { key: 'notes',         label: 'Notes',          emoji: '🗒️' },
  { key: 'tutorial',      label: 'Tutorials',      emoji: '👨‍🏫' },
  { key: 'other',         label: 'Other',          emoji: '📁' },
]

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
  downloadStatus?: string
  courses: {
    name: string
    code: string
    class_id: string
    is_official?: boolean
  } | null
  lecturers?: { name: string } | null
  lecturer_id: string | null
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

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
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

function SectionHead({ title, link, onLink }: { title: string; link?: string; onLink?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: C.textMute, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          {title}
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
      </View>
      {link && (
        <TouchableOpacity onPress={onLink} style={{ marginLeft: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.orange }}>{link}</Text>
        </TouchableOpacity>
      )}
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
              <Ionicons name="cloud-download" size={10} color={C.green} />
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
  item, index, isNew, isBookmarked, bookmarkLoading, onOpen, onChat, onToggleBookmark, onDownload, onQuiz,
}: {
  item: MaterialRecord
  index: number
  isNew: boolean
  isBookmarked: boolean
  bookmarkLoading: boolean
  onOpen: () => void
  onChat: () => void
  onToggleBookmark: () => void
  onDownload: () => void
  onQuiz: () => void
}) {
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.other

  return (
    <TouchableOpacity
      style={[{
        backgroundColor: C.surface, borderRadius: 16, borderWidth: 1,
        borderColor: isNew ? C.orange + '30' : C.border,
        padding: 14, marginBottom: 12,
      }]}
      onPress={onOpen}
      activeOpacity={0.82}
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={{
          width: 44, height: 44, borderRadius: 12,
          backgroundColor: cfg.bg, justifyContent: 'center', alignItems: 'center',
        }}>
          <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        </View>

        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isNew && (
              <View style={{
                backgroundColor: C.orangeDim, borderRadius: 5, borderWidth: 1,
                borderColor: C.orange + '40', paddingHorizontal: 5, paddingVertical: 1,
              }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: C.orange }}>NEW</Text>
              </View>
            )}
            {item.downloadStatus === 'done' && (
              <View style={{
                backgroundColor: C.greenDim, borderRadius: 5, borderWidth: 1,
                borderColor: C.green + '40', paddingHorizontal: 5, paddingVertical: 1,
                flexDirection: 'row', alignItems: 'center', gap: 3
              }}>
                <Ionicons name="cloud-done" size={8} color={C.green} />
                <Text style={{ fontSize: 9, fontWeight: '800', color: C.green }}>OFFLINE</Text>
              </View>
            )}
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, flex: 1 }} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <View style={{
              backgroundColor: cfg.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
            }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
            </View>
            {item.courses?.name && (
              <Text style={{ fontSize: 11, color: C.textSub }} numberOfLines={1}>
                {item.courses.name}{item.courses.code ? ` • ${item.courses.code}` : ''}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="calendar-outline" size={10} color={C.textMute} />
              <Text style={{ fontSize: 10, color: C.textMute }}>{fmtDate(item.created_at)}</Text>
            </View>
            {item.file_size ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="server-outline" size={10} color={C.textMute} />
                <Text style={{ fontSize: 10, color: C.textMute }}>{fmtSize(item.file_size)}</Text>
              </View>
            ) : null}
            {item.lecturers?.name && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="person-outline" size={10} color={C.textMute} />
                <Text style={{ fontSize: 10, color: C.textMute }}>{item.lecturers.name}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={S.matActions}>
        <View style={S.primaryRow}>
          <TouchableOpacity 
            style={[S.matBtn, S.matBtnPrimary]} 
            onPress={onOpen}
            activeOpacity={0.8}
          >
            <Ionicons name="eye-outline" size={15} color="#fff" />
            <Text style={S.matBtnText}>Open File</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[S.matBtn, item.downloadStatus === 'done' ? S.matBtnDone : S.matBtnMinor]} 
            onPress={onDownload}
            activeOpacity={0.8}
          >
            <Ionicons 
              name={item.downloadStatus === 'done' ? 'cloud-done' : 'cloud-download-outline'} 
              size={15} 
              color={item.downloadStatus === 'done' ? C.green : C.text} 
            />
            <Text style={[S.matBtnText, item.downloadStatus === 'done' && { color: C.green }]}>
              {item.downloadStatus === 'done' ? 'Offline' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={S.utilityRow}>
          <TouchableOpacity
            style={[S.utilBtn, isBookmarked && S.utilBtnActive]}
            onPress={onToggleBookmark}
          >
            {bookmarkLoading
              ? <ActivityIndicator size="small" color={C.orange} />
              : <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={14} color={isBookmarked ? C.orange : C.textSub} />
            }
            <Text style={[S.utilBtnText, isBookmarked && { color: C.orange }]}>Bookmark</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.utilBtn} onPress={onChat}>
            <Ionicons name="chatbubble-outline" size={13} color={C.textSub} />
            <Text style={S.utilBtnText}>AI Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.utilBtn} onPress={onQuiz}>
            <Ionicons name="flash-outline" size={13} color={C.orange} />
            <Text style={[S.utilBtnText, { color: C.orange }]}>Quiz</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
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

  const [filter, setFilter]   = useState<FilterKey>('all')
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
  const { records: localMaterials, loading: materialsLoading } = useMaterials() as { records: any[], loading: boolean }
  const { records: localCourses }   = useCourses(undefined) as { records: any[] }
  const { records: localLecturers } = useLecturers() as { records: any[] }
  const { records: localBookmarks } = useBookmarks(userId || '', 'material') as { records: any[] }
  const { user }                    = useUser(userId || undefined)
  const [profileInfo, setProfileInfo] = useState<{ classId: string | null; collegeId: string | null } | null>(null)

  // Fallback: fetch college_id/class_id from Supabase profiles if WatermelonDB user record is missing them
  useEffect(() => {
    if (!userId) return
    
    // Silently fetch materials from server in background on component mount to ensure fresh data
    triggerSync().catch(() => {})

    // If we already have both from WatermelonDB user, skip
    if (user && user.classId && user.collegeId) {
      setProfileInfo({ classId: user.classId, collegeId: user.collegeId })
      return
    }
    // Fetch from Supabase profiles as fallback
    supabase.from('profiles').select('college_id, class_id').eq('id', userId).single()
      .then(({ data }) => {
        if (data) {
          setProfileInfo({ classId: data.class_id, collegeId: data.college_id })
        }
      })
  }, [userId, user])

  // Effective user info for filtering: prefer WatermelonDB, fallback to profiles
  const effectiveClassId = user?.classId || profileInfo?.classId || null
  const effectiveCollegeId = user?.collegeId || profileInfo?.collegeId || null

  const bookmarkedIds = useMemo(() => new Set(localBookmarks.map((b: any) => b.itemId)), [localBookmarks])

  // Build lookup maps: key = Supabase remote UUID
  const coursesMap   = useMemo(() => new Map(localCourses.map((c: any) => [c.remoteId || c.id, c])), [localCourses])
  const lecturersMap = useMemo(() => new Map(localLecturers.map((l: any) => [l.remoteId || l.id, l])), [localLecturers])

  // ── Filter materials by user's college & class ──
  const materials = useMemo((): MaterialRecord[] => {
    // If we're loading and have no materials at all, return empty
    if (materialsLoading && localMaterials.length === 0) return []

    const rawList = localMaterials
      .filter((m: any) => {
        // Broaden matching: if it's in our local database, it's likely relevant.
        // We only exclude it if we specifically know it's for another class/college.
        let isMatch = false

        if (m.courseId) {
          const course = coursesMap.get(m.courseId)
          if (course) {
            // If we have the course, check if it belongs to our class (if we know our class)
            if (effectiveClassId && course.classId && course.classId !== effectiveClassId) {
              return false // Explicitly for a different class
            }
            isMatch = true
          } else {
            // Course not loaded yet but material is here — include it!
            isMatch = true
          }
        }

        if (m.lecturerId) {
          const lecturer = lecturersMap.get(m.lecturerId)
          if (lecturer) {
            if (effectiveCollegeId && lecturer.collegeId && lecturer.collegeId !== effectiveCollegeId) {
              return false // Explicitly for a different college
            }
            isMatch = true
          } else {
            isMatch = true
          }
        }

        // General materials (neither course nor lecturer)
        if (!m.courseId && !m.lecturerId) {
          isMatch = true
        }

        return isMatch
      })
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
          created_at:     new Date(m.createdAt).toISOString(),
          downloadStatus: m.downloadStatus,
          courses:        course ? { name: course.name, code: course.code, class_id: course.classId, is_official: course.isOfficial } : null,
          lecturers:      lecturer ? { name: lecturer.name } : null,
          lecturer_id:    m.lecturerId,
        } as MaterialRecord
      })
      // Sort newest first
      .sort((a: MaterialRecord, b: MaterialRecord) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Show latest 30 materials to ensure the screen feels active and realtime.
    return rawList.slice(0, 30)
  }, [localMaterials, coursesMap, lecturersMap, effectiveClassId, effectiveCollegeId, materialsLoading])

  // ── Counts per type ──
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of materials) {
      c[m.type] = (c[m.type] ?? 0) + 1
    }
    return c
  }, [materials])

  // ── Featured = newest 5 ──
  const featured = useMemo(() => materials.slice(0, 5), [materials])

  // ── Filtered + searched list ──
  const displayed = useMemo(() => {
    let list = materials
    if (filter !== 'all') list = list.filter(m => m.type === filter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(m =>
        m.title.toLowerCase().includes(q) ||
        (m.courses?.name ?? '').toLowerCase().includes(q) ||
        (m.courses?.code ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [materials, filter, search])

  // ── Actions ──
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
      Alert.alert('Premium Required', 'Downloading materials for offline viewing requires a Premium subscription.', [
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
      params: {
        material_id: item.id,
        title: item.title,
        file_url: item.file_url,
        type: item.type,
        auto_generate: '1',
      },
    })
  }, [router])

  const showSkeletons = materialsLoading && materials.length === 0
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
          {showSkeletons
            ? 'Loading…'
            : `${materials.length} material${materials.length !== 1 ? 's' : ''} available`
          }
        </Text>
        {!showSkeletons && materials.length > 0 && (
          <View style={S.summaryRow}>
            {(Object.entries(TYPE_CONFIG) as [string, (typeof TYPE_CONFIG)[string]][]).map(([key, cfg]) => {
              const n = counts[key] || 0
              if (!n) return null
              const active = filter === key
              return (
                <TouchableOpacity
                  key={key}
                  style={[S.summaryChip, { backgroundColor: active ? cfg.bg : C.surface }, active && { borderColor: cfg.color + '40' }]}
                  onPress={() => setFilter(prev => prev === key ? 'all' : key as FilterKey)}
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
            placeholder="Search materials…"
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
            const tabCount = tab.key === 'all' ? materials.length : (counts[tab.key] || 0)
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

      {showSkeletons ? (
        <FlatList
          data={Array(6).fill(null)}
          keyExtractor={(_, i) => `skel_${i}`}
          contentContainerStyle={S.list}
          renderItem={({ index }) => <SkeletonCard index={index} />}
        />
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={item => item.id}
          contentContainerStyle={[S.list, displayed.length === 0 && S.listEmpty]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            featured.length > 0 && filter === 'all' && !search ? (
              <View style={{ marginBottom: 20 }}>
                <SectionHead title="Featured Materials" />
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, paddingRight: 20 }}
                >
                  {featured.map((item, idx) => (
                    <FeaturedCard 
                      key={item.id} 
                      item={item} 
                      index={idx} 
                      isBookmarked={bookmarkedIds.has(item.id)}
                      onOpen={() => openMaterial(item)}
                      onSave={() => toggleBookmark(item)}
                    />
                  ))}
                </ScrollView>
                <View style={{ marginTop: 24 }}>
                  <SectionHead title="All Materials" />
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={S.emptyState}>
              <View style={S.emptyIcon}>
                <Ionicons
                  name={isOffline && materials.length === 0 ? 'cloud-offline-outline' : 'library-outline'}
                  size={32} color={C.textMute}
                />
              </View>
              <Text style={S.emptyTitle}>
                {isOffline && materials.length === 0 ? 'No cached materials'
                  : search.trim() ? 'No results found'
                  : filter !== 'all' ? `No ${TYPE_CONFIG[filter]?.label ?? filter} yet`
                  : 'No materials yet'}
              </Text>
              <Text style={S.emptySub}>
                {isOffline && materials.length === 0
                  ? 'Connect to the internet to sync class materials.'
                  : search.trim() ? `No materials match "${search}".`
                  : 'Materials for your class will appear here once synced.'}
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
              isNew={new Date(item.created_at).getTime() > Date.now() - 24 * 60 * 60 * 1000}
              isBookmarked={bookmarkedIds.has(item.id)}
              bookmarkLoading={bookmarkLoading === item.id}
              onOpen={() => openMaterial(item)}
              onChat={() => router.push({
                pathname: '/chat' as any,
                params: { material_title: item.title, file_url: item.file_url, material_id: item.id },
              })}
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
  matActions:        { marginTop: 14, gap: 10 },
  primaryRow:        { flexDirection: 'row', gap: 8 },
  utilityRow:        { flexDirection: 'row', gap: 8 },
  matBtn:            { flex: 1, height: 40, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  matBtnPrimary:     { backgroundColor: C.orange },
  matBtnMinor:       { backgroundColor: C.raised, borderWidth: 1, borderColor: C.border },
  matBtnDone:        { backgroundColor: C.greenDim, borderWidth: 1, borderColor: C.green + '30' },
  matBtnText:        { fontSize: 13, fontWeight: '700', color: '#fff' },
  utilBtn:           { flex: 1, height: 36, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  utilBtnActive:     { backgroundColor: C.orangeDim, borderColor: C.orange + '30' },
  utilBtnText:       { fontSize: 11, fontWeight: '600', color: C.textSub },
  orbOrange: { position: 'absolute', top: -120, right: -80,  width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(232,105,42,0.12)' },
  orbBlue:   { position: 'absolute', top:   40, left: -60,   width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(75,140,245,0.07)'  },
  orbPurple: { position: 'absolute', top:   80, left: '38%' as any, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(155,124,244,0.06)' },
  hero: { backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingBottom: 0, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: C.border },
  blob1: { position: 'absolute', width: 280, height: 280, borderRadius: 140, top: -130, right: -90, backgroundColor: '#1A56DB', opacity: 0.07 },
  blob2: { position: 'absolute', width: 180, height: 180, borderRadius: 90,  bottom: -70, left: -50, backgroundColor: '#7C3AED', opacity: 0.06 },
  heroTitleRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  heroTitle:        { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: -0.8, lineHeight: 32 },
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
  emptyState: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 60, paddingBottom: 40 },
  emptyIcon:  { width: 80, height: 80, borderRadius: 24, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  clearBtn:   { backgroundColor: C.orangeDim, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: C.orange + '30' },
  clearBtnText: { fontSize: 13, fontWeight: '700', color: C.orange },
  iconBtn: { padding: 4, width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
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
  offlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.greenDim, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  offlineBadgeText: { fontSize: 9, fontWeight: '800', color: C.green },
  featArrow: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
})