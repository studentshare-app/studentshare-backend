/**
 * app/my-courses.tsx — My Courses (Redesigned)
 *
 * Design: matches index.tsx / study-materials.tsx editorial dark system
 *   – C color tokens from lib/colors
 *   – Serif fonts, orange accent system, ScalePress interactions
 *   – MaterialCard-style course cards with left accent strip
 *   – SectionHead editorial headers
 *
 * Architecture: No React Query — plain useEffect bootstrap
 *   C1  Single useEffect: cache → render → fetch live in background
 *   C2  classIdRef alongside state so onRefresh is always stable
 *   C3  ready state controls skeletons (no flash on return visits)
 *   C4  Offline banner (amber) when isOffline && courses.length > 0
 *   C5  Pull-to-refresh disabled offline
 *   C6  Error banner (red) non-blocking, with retry
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { fetchMyCoursesData } from '../lib/queries/screens'
import { supabase } from '../lib/supabase'
import { C } from '../lib/colors'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Course = { id: string; name: string; code: string; description: string }

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Per-course accent colors — cycling through the design system palette
const COURSE_COLORS = [
  { color: C.sapphire, dim: C.sapphDim,  border: 'rgba(75,140,245,0.2)'   },
  { color: C.lavender, dim: C.lavDim,    border: 'rgba(155,124,244,0.2)'  },
  { color: C.emerald,  dim: C.emerDim,   border: 'rgba(61,201,154,0.2)'   },
  { color: C.gold,     dim: C.goldDim,   border: 'rgba(223,168,60,0.2)'   },
  { color: C.coral,    dim: C.coralDim,  border: 'rgba(238,104,104,0.2)'  },
  { color: C.orange,   dim: C.orangeDim, border: 'rgba(232,105,42,0.2)'   },
]

const MATERIAL_TYPES = [
  { label: 'Past Questions', type: 'past_question', icon: 'document-text-outline' as const, color: C.lavender, dim: C.lavDim  },
  { label: 'Slides',         type: 'slide',         icon: 'easel-outline'          as const, color: C.sapphire, dim: C.sapphDim },
  { label: 'Books',          type: 'book',          icon: 'book-outline'           as const, color: C.emerald,  dim: C.emerDim  },
  { label: 'Tutorials',      type: 'tutorial',      icon: 'play-circle-outline'    as const, color: C.gold,     dim: C.goldDim  },
]

const MY_COURSES_CACHE_KEY = 'studentshare_my_courses_cache'
const CLASS_CACHE_KEY      = 'studentshare_class_id_cache'

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────────────────────
type CoursesCache = { courses: Course[]; className: string }

function safeParseCourses(raw: string | null): CoursesCache {
  if (!raw) return { courses: [], className: '' }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.courses)) return parsed as CoursesCache
    return { courses: [], className: '' }
  } catch {
    return { courses: [], className: '' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ScalePress
// ─────────────────────────────────────────────────────────────────────────────
function ScalePress({
  children, onPress, style,
}: {
  children: React.ReactNode
  onPress?: () => void
  style?: any
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

// ─────────────────────────────────────────────────────────────────────────────
// SectionHead
// ─────────────────────────────────────────────────────────────────────────────
function SectionHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={st.sectionHead}>
      <View style={st.sectionLabelRow}>
        <View style={st.sectionLine} />
        <Text allowFontScaling={false} style={st.sectionTitle}>{title.toUpperCase()}</Text>
      </View>
      {right}
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline Banner
// ─────────────────────────────────────────────────────────────────────────────
function OfflineBanner() {
  return (
    <View style={st.offlineBanner}>
      <Ionicons name="cloud-offline-outline" size={13} color={C.gold} />
      <Text allowFontScaling={false} style={st.offlineText}>Offline — showing cached courses</Text>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────
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
            <View style={sk.code} />
            <View style={sk.title} />
            <View style={sk.sub} />
          </View>
        </View>
        <View style={sk.divider} />
        <View style={sk.actionsRow}>
          <View style={sk.btn} />
          <View style={sk.btnSm} />
          <View style={sk.btnSm} />
          <View style={sk.btnSm} />
        </View>
      </View>
    </Animated.View>
  )
}

const sk = StyleSheet.create({
  card:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, marginBottom: 12, overflow: 'hidden', position: 'relative' },
  accent:    { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.raised },
  inner:     { padding: 16, paddingLeft: 20 },
  top:       { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  icon:      { width: 54, height: 54, borderRadius: 16, backgroundColor: C.raised, flexShrink: 0 },
  body:      { flex: 1, gap: 8 },
  code:      { width: '32%', height: 10, borderRadius: 5, backgroundColor: C.raised },
  title:     { width: '80%', height: 15, borderRadius: 7, backgroundColor: C.raised },
  sub:       { width: '50%', height: 10, borderRadius: 5, backgroundColor: C.raised },
  divider:   { height: 1, backgroundColor: C.border, marginTop: 14, marginBottom: 14 },
  actionsRow:{ flexDirection: 'row', gap: 8 },
  btn:       { flex: 1, height: 42, borderRadius: 12, backgroundColor: C.raised },
  btnSm:     { width: 42, height: 42, borderRadius: 12, backgroundColor: C.raised },
})

// ─────────────────────────────────────────────────────────────────────────────
// Course Card
// ─────────────────────────────────────────────────────────────────────────────
function CourseCard({
  item, index, isExpanded, onToggle, onTypePress,
}: {
  item: Course
  index: number
  isExpanded: boolean
  onToggle: () => void
  onTypePress: (type: string, label: string, color: string) => void
}) {
  const opacity    = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(18)).current
  const expandAnim = useRef(new Animated.Value(0)).current

  const accent = COURSE_COLORS[index % COURSE_COLORS.length]

  useEffect(() => {
    const delay = Math.min(index, 6) * 60
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 320, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 320, delay, useNativeDriver: true }),
    ]).start()
  }, [])

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 240,
      useNativeDriver: false,
    }).start()
  }, [isExpanded])

  const panelHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, MATERIAL_TYPES.length * 60],
  })

  const initial = item.name.charAt(0).toUpperCase()

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, { marginBottom: 12 }]}>
      {/* ── Main card row ── */}
      <ScalePress onPress={onToggle}>
        <View style={[
          st.card,
          { borderLeftColor: accent.color },
          isExpanded && st.cardExpanded,
        ]}>
          {/* Left accent strip */}
          <View style={[st.accentStrip, { backgroundColor: accent.color }]} />

          <View style={st.cardInner}>
            {/* Top row */}
            <View style={st.cardTop}>
              {/* Icon */}
              <View style={[st.courseIcon, { backgroundColor: accent.dim, borderColor: accent.border }]}>
                <Text style={[st.courseInitial, { color: accent.color }]}>{initial}</Text>
              </View>

              {/* Info */}
              <View style={st.courseInfo}>
                {/* Code pill */}
                <View style={[st.codePill, { backgroundColor: accent.dim, borderColor: accent.border }]}>
                  <Text allowFontScaling={false} style={[st.codeText, { color: accent.color }]}>
                    {item.code}
                  </Text>
                </View>
                <Text maxFontSizeMultiplier={1.15} style={st.courseName} numberOfLines={2}>
                  {item.name}
                </Text>
                {item.description ? (
                  <Text maxFontSizeMultiplier={1.1} style={st.courseDesc} numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
              </View>

              {/* Chevron */}
              <View style={[st.chevronBox, isExpanded && { backgroundColor: accent.dim, borderColor: accent.border }]}>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={isExpanded ? accent.color : C.textMute}
                />
              </View>
            </View>

            {/* Stat bar — material type count hint */}
            <View style={st.statBar}>
              <View style={st.stat}>
                <Ionicons name="layers-outline" size={12} color={C.textSub} />
                <Text allowFontScaling={false} style={st.statText}>
                  {MATERIAL_TYPES.length} material types
                </Text>
              </View>
              <View style={st.statSep} />
              <View style={st.stat}>
                <Ionicons name="chevron-down-outline" size={12} color={C.textSub} />
                <Text allowFontScaling={false} style={st.statText}>
                  {isExpanded ? 'Collapse' : 'Browse materials'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScalePress>

      {/* ── Expandable type panel ── */}
      <Animated.View style={[st.typePanel, { height: panelHeight, overflow: 'hidden' }]}>
        {MATERIAL_TYPES.map((mat, i) => (
          <TouchableOpacity
            key={mat.type}
            style={[st.typeRow, i < MATERIAL_TYPES.length - 1 && st.typeRowBorder]}
            activeOpacity={0.75}
            onPress={() => onTypePress(mat.type, mat.label, mat.color)}
          >
            {/* Icon box */}
            <View style={[st.typeIconBox, { backgroundColor: mat.dim, borderColor: mat.color + '30' }]}>
              <Ionicons name={mat.icon} size={17} color={mat.color} />
            </View>

            <Text maxFontSizeMultiplier={1.1} style={st.typeLabel}>{mat.label}</Text>

            {/* Arrow */}
            <View style={[st.typeArrow, { backgroundColor: mat.dim }]}>
              <Ionicons name="chevron-forward" size={13} color={mat.color} />
            </View>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function MyCoursesScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { isOnline, isOffline } = useNetworkStatus()

  // ── State ──────────────────────────────────────────────────────────────────
  const [courses,        setCourses]        = useState<Course[]>([])
  const [className,      setClassName]      = useState('')
  const [classId,        setClassId]        = useState<string | null>(null)
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null)
  const [ready,          setReady]          = useState(false)
  const [refreshing,     setRefreshing]     = useState(false)
  const [isFetching,     setIsFetching]     = useState(false)
  const [isError,        setIsError]        = useState(false)
  const [errorMsg,       setErrorMsg]       = useState('')

  // Stable ref so onRefresh always has the latest classId (C2)
  const classIdRef = useRef<string | null>(null)

  // Hero entrance animation
  const heroOpacity = useRef(new Animated.Value(0)).current
  const heroY       = useRef(new Animated.Value(-10)).current

  // ── C1: Single bootstrap effect ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      // 1. Read cache first — so data is ready before setReady(true)
      const [rawCourses, cachedClassId] = await Promise.all([
        AsyncStorage.getItem(MY_COURSES_CACHE_KEY).catch(() => null),
        AsyncStorage.getItem(CLASS_CACHE_KEY).catch(() => null),
      ])

      const parsed = safeParseCourses(rawCourses)
      if (!cancelled) {
        if (parsed.courses.length > 0) {
          setCourses(parsed.courses)
          setClassName(parsed.className)
        }
        if (cachedClassId) {
          setClassId(cachedClassId)
          classIdRef.current = cachedClassId
        }
        // C3: ready before any await below — skeletons gone immediately on return visits
        setReady(true)
      }

      // Hero entrance fires immediately
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(heroY,       { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start()

      // 2. Live auth — get classId if not cached
      let liveClassId = cachedClassId
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('class_id')
            .eq('id', session.user.id)
            .single()
          if (profile?.class_id) {
            liveClassId = profile.class_id
            if (!cancelled) {
              setClassId(profile.class_id)
              classIdRef.current = profile.class_id
            }
            void AsyncStorage.setItem(CLASS_CACHE_KEY, profile.class_id).catch(() => {})
          }
        }
      } catch {
        // Offline — classId already seeded from cache
      }

      // 3. Fetch live data in background
      if (liveClassId && !cancelled) {
        if (!cancelled) setIsFetching(true)
        try {
          const result = await fetchMyCoursesData(liveClassId)
          if (!cancelled) {
            setCourses(result.courses as Course[])
            setClassName(result.className)
            setIsError(false)
            void AsyncStorage.setItem(
              MY_COURSES_CACHE_KEY,
              JSON.stringify({ courses: result.courses, className: result.className }),
            ).catch(() => {})
          }
        } catch (e: any) {
          if (!cancelled) {
            setIsError(true)
            setErrorMsg(e?.message ?? 'Could not refresh courses.')
          }
        } finally {
          if (!cancelled) setIsFetching(false)
        }
      }
    }

    bootstrap()
    return () => { cancelled = true }
  }, [])

  // ── Pull-to-refresh (C5: online only) ──────────────────────────────────────
  const onRefresh = async () => {
    const cid = classId ?? classIdRef.current
    if (!isOnline || !cid) return
    setRefreshing(true)
    try {
      const result = await fetchMyCoursesData(cid)
      setCourses(result.courses as Course[])
      setClassName(result.className)
      setIsError(false)
      void AsyncStorage.setItem(
        MY_COURSES_CACHE_KEY,
        JSON.stringify({ courses: result.courses, className: result.className }),
      ).catch(() => {})
    } catch (e: any) {
      setIsError(true)
      setErrorMsg(e?.message ?? 'Could not refresh courses.')
    } finally {
      setRefreshing(false)
    }
  }

  const retry = async () => {
    const cid = classId ?? classIdRef.current
    if (!cid) return
    setIsError(false)
    setIsFetching(true)
    try {
      const result = await fetchMyCoursesData(cid)
      setCourses(result.courses as Course[])
      setClassName(result.className)
    } catch (e: any) {
      setIsError(true)
      setErrorMsg(e?.message ?? 'Could not load courses.')
    } finally {
      setIsFetching(false)
    }
  }

  function toggleCourse(courseId: string) {
    setExpandedCourse(prev => prev === courseId ? null : courseId)
  }

  // C3: show skeletons only until ready resolves (~10ms on return visits)
  const showSkeletons = !ready

  return (
    <View style={st.container}>

      {/* C4: Offline banner */}
      {isOffline && courses.length > 0 && <OfflineBanner />}

      {/* ── Hero ── */}
      <Animated.View
        style={[
          st.hero,
          { paddingTop: insets.top + 12 },
          { opacity: heroOpacity, transform: [{ translateY: heroY }] },
        ]}
      >
        {/* Ambient glow orbs */}
        <View style={st.orbOrange} />
        <View style={st.orbBlue} />

        {/* Back button */}
        <TouchableOpacity style={st.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={18} color={C.text} />
        </TouchableOpacity>

        {/* Icon */}
        <View style={st.heroIconBox}>
          <Text style={{ fontSize: 26 }}>🎓</Text>
        </View>

        {/* Title */}
        <Text maxFontSizeMultiplier={1.2} style={st.heroTitle}>My Courses</Text>

        {/* Class badge */}
        {className ? (
          <View style={st.heroBadge}>
            <Ionicons name="school-outline" size={11} color={C.textSub} />
            <Text allowFontScaling={false} style={st.heroBadgeText}>{className}</Text>
          </View>
        ) : (
          <View style={st.heroBadgeSkeleton} />
        )}

        {/* Sub */}
        <Text allowFontScaling={false} style={st.heroSub}>
          {showSkeletons ? 'Loading…' : `${courses.length} course${courses.length !== 1 ? 's' : ''}`}
        </Text>

        {/* "Updating…" dot */}
        {isFetching && !showSkeletons && (
          <View style={st.updatingBadge}>
            <View style={st.updatingDot} />
            <Text allowFontScaling={false} style={st.updatingText}>Updating…</Text>
          </View>
        )}

        {/* Divider */}
        <View style={st.heroDivider}>
          <View style={[st.heroDividerLine, { backgroundColor: C.orange + '40' }]} />
          <View style={[st.heroDividerDot,  { backgroundColor: C.orange }]} />
          <View style={[st.heroDividerLine, { backgroundColor: C.orange + '40' }]} />
        </View>
      </Animated.View>

      {/* C6: Error banner — non-blocking */}
      {isError && (
        <View style={st.errorBanner}>
          <Ionicons name="wifi-outline" size={15} color="#FCA5A5" />
          <Text allowFontScaling={false} style={st.errorBannerText} numberOfLines={1}>
            {errorMsg.includes('network') || isOffline
              ? 'No internet — showing cached courses'
              : 'Could not refresh — showing cached courses'}
          </Text>
          <TouchableOpacity onPress={retry} style={st.retryBtn}>
            <Text allowFontScaling={false} style={st.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── List ── */}
      <FlatList
        data={showSkeletons ? (Array(5).fill(null) as null[]) : courses}
        keyExtractor={(item, index) =>
          item ? (item as Course).id : `skel_${index}`
        }
        contentContainerStyle={[st.list, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          isOnline ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.orange}
              colors={[C.orange]}
            />
          ) : undefined
        }
        ListHeaderComponent={
          !showSkeletons && courses.length > 0 ? (
            <View style={st.listHeader}>
              <SectionHead
                title="Your Courses"
                right={
                  <View style={st.countBadge}>
                    <Text allowFontScaling={false} style={st.countBadgeText}>
                      {courses.length} enrolled
                    </Text>
                  </View>
                }
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !showSkeletons ? (
            <View style={st.empty}>
              <View style={st.emptyIconBox}>
                <Text style={{ fontSize: 36 }}>
                  {isOffline ? '📶' : '🎓'}
                </Text>
              </View>
              <Text maxFontSizeMultiplier={1.2} style={st.emptyTitle}>
                {isOffline ? 'No cached courses' : 'No courses yet'}
              </Text>
              <Text maxFontSizeMultiplier={1.2} style={st.emptySub}>
                {isOffline
                  ? 'Connect to the internet to load your courses for the first time.'
                  : 'Courses for your class will appear here once they are added.'}
              </Text>
              {!isOffline && (
                <TouchableOpacity style={st.emptyBtn} onPress={retry} activeOpacity={0.85}>
                  <Ionicons name="refresh-outline" size={15} color={C.void} />
                  <Text allowFontScaling={false} style={st.emptyBtnText}>Refresh</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          if (!item) return <SkeletonCard index={index} />
          const course = item as Course
          return (
            <CourseCard
              item={course}
              index={index}
              isExpanded={expandedCourse === course.id}
              onToggle={() => toggleCourse(course.id)}
              onTypePress={(type, label, color) =>
                router.push({
                  pathname: '/academic-years',
                  params: {
                    course_id:   course.id,
                    course_name: course.name,
                    type,
                    label,
                    color,
                  },
                })
              }
            />
          )
        }}
      />
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },

  // ── Offline/Error banners ──────────────────────────────────────────────────
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: 'rgba(223,168,60,0.12)',
    borderBottomWidth: 1, borderBottomColor: C.gold + '30', paddingVertical: 8,
  },
  offlineText: { fontSize: 12, fontWeight: '600', color: C.gold },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(239,68,68,0.18)',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  errorBannerText: { flex: 1, fontSize: 12, color: '#FCA5A5' },
  retryBtn:        { backgroundColor: 'rgba(239,68,68,0.18)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  retryText:       { fontSize: 12, fontWeight: '700', color: '#FCA5A5' },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: C.deep,
    paddingHorizontal: 22,
    paddingBottom: 28,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  orbOrange: {
    position: 'absolute', top: -100, right: -60,
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(232,105,42,0.10)',
  },
  orbBlue: {
    position: 'absolute', top: 40, left: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(75,140,245,0.06)',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20, alignSelf: 'flex-start',
  },
  heroIconBox: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: C.orangeDim,
    borderWidth: 1, borderColor: C.orange + '30',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
  },
  heroTitle: {
    fontFamily: 'serif',
    fontSize: 26, fontWeight: '800',
    color: C.text, letterSpacing: -0.5,
    marginBottom: 10,
  },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    alignSelf: 'flex-start', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    marginBottom: 8,
  },
  heroBadgeText:     { fontSize: 12, fontWeight: '600', color: C.textSub },
  heroBadgeSkeleton: { width: 120, height: 26, borderRadius: 20, backgroundColor: C.surface, marginBottom: 8 },
  heroSub:           { fontSize: 13, color: C.textMute },

  updatingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    position: 'absolute', top: 18, right: 22,
  },
  updatingDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: C.sky },
  updatingText: { fontSize: 10, color: C.sky, fontWeight: '600' },

  heroDivider:     { flexDirection: 'row', alignItems: 'center', marginTop: 22, gap: 6 },
  heroDividerLine: { flex: 1, height: 1 },
  heroDividerDot:  { width: 5, height: 5, borderRadius: 3 },

  // ── List ──────────────────────────────────────────────────────────────────
  list:       { paddingTop: 20, paddingHorizontal: 18 },
  listHeader: { marginBottom: 16 },

  // ── Section head ──────────────────────────────────────────────────────────
  sectionHead:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionLine:      { width: 14, height: 1, backgroundColor: C.orange, opacity: 0.7 },
  sectionTitle:     { fontSize: 9.5, fontWeight: '700', color: C.textMute, letterSpacing: 2.8, textTransform: 'uppercase' as const },
  countBadge:       { backgroundColor: C.orangeDim, borderWidth: 1, borderColor: 'rgba(232,105,42,0.2)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  countBadgeText:   { fontSize: 10, fontWeight: '800', color: C.orange },

  // ── Course card ───────────────────────────────────────────────────────────
  card: {
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    borderLeftWidth: 3,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  cardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomColor: 'transparent',
  },
  accentStrip: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
  },
  cardInner: { padding: 16, paddingLeft: 20 },

  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  courseIcon:   {
    width: 54, height: 54, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, flexShrink: 0,
  },
  courseInitial: { fontSize: 22, fontWeight: '800', fontFamily: 'serif' },
  courseInfo:    { flex: 1, minWidth: 0, gap: 5 },
  codePill:      {
    alignSelf: 'flex-start', borderRadius: 7,
    paddingHorizontal: 9, paddingVertical: 3,
    borderWidth: 1,
  },
  codeText:    { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  courseName:  {
    fontFamily: 'serif',
    fontSize: 16, fontWeight: '700',
    color: C.text, lineHeight: 22, letterSpacing: -0.2,
  },
  courseDesc:  { fontSize: 11, color: C.textSub, lineHeight: 16 },

  chevronBox: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: C.raised,
    borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0, marginTop: 2,
  },

  // Stat bar
  statBar:  {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: C.border,
    gap: 6,
  },
  stat:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 11, color: C.textSub },
  statSep:  { width: 1, height: 12, backgroundColor: C.border },

  // ── Type panel ────────────────────────────────────────────────────────────
  typePanel: {
    backgroundColor: C.raised,
    borderWidth: 1, borderTopWidth: 0,
    borderColor: C.border,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  typeRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, height: 60, gap: 14,
  },
  typeRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  typeIconBox: {
    width: 38, height: 38, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, flexShrink: 0,
  },
  typeLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text },
  typeArrow: {
    width: 28, height: 28, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  empty: {
    alignItems: 'center', paddingTop: 64,
    paddingHorizontal: 32, gap: 12,
  },
  emptyIconBox: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: C.orangeDim,
    borderWidth: 1, borderColor: C.orange + '25',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: 'serif',
    fontSize: 20, fontWeight: '700',
    color: C.text, letterSpacing: -0.3,
  },
  emptySub: { fontSize: 13, color: C.textMute, textAlign: 'center', lineHeight: 20, maxWidth: 240 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: C.orange, borderRadius: 14,
    paddingHorizontal: 22, paddingVertical: 12,
    marginTop: 8,
    shadowColor: C.orange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
})