/**
 * app/courses.tsx — Courses by Type screen
 *
 * Redesigned to be consistent with index.tsx, my-courses.tsx,
 * and study-materials.tsx dark editorial design system.
 *
 * UX improvements:
 *  ✅ Dark editorial theme matching the rest of the app
 *  ✅ Type-aware accent color applied throughout (hero glow, cards, pills)
 *  ✅ Sticky header with search — filter courses inline without leaving screen
 *  ✅ Hero stat strip showing course count + type label
 *  ✅ Cards show course initial letter (like my-courses) + code pill + description preview
 *  ✅ Staggered entrance animations on cards
 *  ✅ Spring press feedback on every card
 *  ✅ Skeleton cards match dark theme
 *  ✅ Non-blocking error banner
 *  ✅ Background-refresh "Updating…" dot
 *  ✅ Empty state with icon, copy, and recovery CTA
 *  ✅ Offline-first: React Query stale-while-revalidate
 */

import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { fetchCoursesByClass } from '../lib/queries/screens'

// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens — mirrors index.tsx / study-materials.tsx / my-courses.tsx
// ─────────────────────────────────────────────────────────────────────────────
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
  orangeDim:  'rgba(232,105,42,0.10)',
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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Course = { id: string; name: string; code: string; description: string }

// ─────────────────────────────────────────────────────────────────────────────
// Type meta — accent colors per material type
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_META: Record<string, {
  color: string; dim: string; border: string; icon: string; label: string; glow: string
}> = {
  past_question: {
    color:  C.lavender, dim: C.lavDim,
    border: 'rgba(155,124,244,0.25)',
    icon:   'document-text',
    label:  'Past Questions',
    glow:   'rgba(155,124,244,0.12)',
  },
  slide: {
    color:  C.orange,   dim: C.orangeDim,
    border: 'rgba(232,105,42,0.25)',
    icon:   'easel',
    label:  'Slides',
    glow:   'rgba(232,105,42,0.12)',
  },
  book: {
    color:  C.sapphire, dim: C.sapphDim,
    border: 'rgba(75,140,245,0.25)',
    icon:   'book',
    label:  'Books',
    glow:   'rgba(75,140,245,0.12)',
  },
  tutorial: {
    color:  C.emerald,  dim: C.emerDim,
    border: 'rgba(61,201,154,0.25)',
    icon:   'play-circle',
    label:  'Tutorials',
    glow:   'rgba(61,201,154,0.12)',
  },
}
const DEFAULT_META = {
  color:  C.sky,    dim: C.skyDim,
  border: 'rgba(56,189,248,0.25)',
  icon:   'folder',
  label:  'Courses',
  glow:   'rgba(56,189,248,0.12)',
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
// Skeleton card — dark theme shimmer
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonCard({ index, accentColor }: { index: number; accentColor: string }) {
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
    <Animated.View style={[s.skeletonCard, { opacity: pulse }]}>
      <View style={[s.skeletonAccent, { backgroundColor: accentColor }]} />
      <View style={s.skeletonInner}>
        <View style={s.skeletonTop}>
          <View style={[s.skeletonInitial, { backgroundColor: accentColor + '20' }]} />
          <View style={s.skeletonBody}>
            <View style={s.skeletonTitle} />
            <View style={s.skeletonCode} />
          </View>
        </View>
        <View style={s.skeletonDesc} />
      </View>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Course card
// ─────────────────────────────────────────────────────────────────────────────
function CourseCard({
  item, index, meta, onPress,
}: {
  item:    Course
  index:   number
  meta:    typeof DEFAULT_META
  onPress: () => void
}) {
  const opacity    = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(20)).current

  useEffect(() => {
    const delay = Math.min(index, 8) * 55
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 300, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, delay, useNativeDriver: true }),
    ]).start()
  }, [])

  const initial = item.name.charAt(0).toUpperCase()

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <ScalePress onPress={onPress} style={s.card}>
        {/* Left accent strip */}
        <View style={[s.cardAccent, { backgroundColor: meta.color }]} />

        <View style={s.cardInner}>
          {/* Top row: initial avatar + name + code */}
          <View style={s.cardTop}>
            <View style={[s.cardInitialBox, { backgroundColor: meta.dim, borderColor: meta.border }]}>
              <Text style={[s.cardInitial, { color: meta.color }]}>{initial}</Text>
            </View>
            <View style={s.cardMeta}>
              <Text style={s.cardName} numberOfLines={2}>{item.name}</Text>
              {!!item.code && (
                <View style={[s.codePill, { backgroundColor: meta.dim, borderColor: meta.border }]}>
                  <Text style={[s.codeText, { color: meta.color }]}>{item.code}</Text>
                </View>
              )}
            </View>
            {/* Arrow */}
            <View style={[s.arrowBox, { backgroundColor: meta.dim, borderColor: meta.border }]}>
              <Ionicons name="chevron-forward" size={15} color={meta.color} />
            </View>
          </View>

          {/* Description preview */}
          {!!item.description && (
            <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
          )}
        </View>
      </ScalePress>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function CoursesScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { type, label } = useLocalSearchParams<{ type?: string; label?: string }>()

  const [classId,  setClassId]  = useState<string | null>(null)
  const [query,    setQuery]    = useState('')
  const [searched, setSearched] = useState(false)

  const safeType  = type  || 'all'
  const safeLabel = label || 'Courses'
  const meta      = TYPE_META[safeType] || DEFAULT_META

  // Hero entrance
  const heroOpacity = useRef(new Animated.Value(0)).current
  const heroY       = useRef(new Animated.Value(-10)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(heroY,       { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start()

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('class_id')
        .eq('id', session.user.id)
        .single()
      if (profile?.class_id) setClassId(profile.class_id)
    })
  }, [])

  const {
    data: courses = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey:   ['coursesByClass', classId, safeType],
    queryFn:    () => fetchCoursesByClass(classId!),
    enabled:    !!classId,
    staleTime:  30 * 60 * 1000,
    gcTime:     7 * 24 * 60 * 60 * 1000,
    retry:      2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  })

  const allCourses     = courses as Course[]
  const showSkeletons  = (isLoading || !classId) && allCourses.length === 0

  // Search filter
  const filteredCourses = query.trim()
    ? allCourses.filter(
        c =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.code?.toLowerCase().includes(query.toLowerCase()),
      )
    : allCourses

  const noResults = !showSkeletons && !isError && filteredCourses.length === 0

  return (
    <View style={s.container}>

      {/* ── Sticky Header ── */}
      <Animated.View
        style={[
          s.header,
          { paddingTop: insets.top + 10 },
          { opacity: heroOpacity, transform: [{ translateY: heroY }] },
        ]}
      >
        {/* Glow orb */}
        <View style={[s.headerGlow, { backgroundColor: meta.glow }]} />

        {/* Nav row */}
        <View style={s.navRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>

          <View style={s.navCenter}>
            <View style={[s.navIconBox, { backgroundColor: meta.dim, borderColor: meta.border }]}>
              <Ionicons name={meta.icon as any} size={16} color={meta.color} />
            </View>
            <Text style={s.navTitle} numberOfLines={1}>
              {safeLabel}
            </Text>
          </View>

          {/* Background-refresh indicator */}
          {isFetching && !isLoading && (
            <View style={s.refreshBadge}>
              <View style={[s.refreshDot, { backgroundColor: meta.color }]} />
              <Text style={[s.refreshText, { color: meta.color }]}>Updating…</Text>
            </View>
          )}
        </View>

        {/* Stat strip */}
        <View style={s.statStrip}>
          <View style={s.stat}>
            <Text style={[s.statValue, { color: meta.color }]}>
              {showSkeletons ? '–' : filteredCourses.length}
            </Text>
            <Text style={s.statLabel}>
              {filteredCourses.length === 1 ? 'Course' : 'Courses'}
            </Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <View style={[s.typeTag, { backgroundColor: meta.dim, borderColor: meta.border }]}>
              <Ionicons name={meta.icon as any} size={11} color={meta.color} />
              <Text style={[s.typeTagText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>
        </View>

        {/* Search bar */}
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={16} color={C.textMute} />
          <TextInput
            style={s.searchInput}
            placeholder="Search courses by name or code…"
            placeholderTextColor={C.textMute}
            value={query}
            onChangeText={v => { setQuery(v); setSearched(true) }}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={C.textMute} />
            </TouchableOpacity>
          )}
        </View>

        {/* Divider */}
        <View style={s.headerDivider}>
          <View style={[s.headerDividerLine, { backgroundColor: meta.color + '30' }]} />
          <View style={[s.headerDividerDot,  { backgroundColor: meta.color }]} />
          <View style={[s.headerDividerLine, { backgroundColor: meta.color + '30' }]} />
        </View>
      </Animated.View>

      {/* ── Error banner ── */}
      {isError && (
        <View style={s.errorBanner}>
          <Ionicons name="wifi-outline" size={15} color="#FCA5A5" />
          <Text style={s.errorBannerText} numberOfLines={1}>
            {(error as Error)?.message?.includes('network')
              ? 'No internet — showing cached data'
              : 'Could not refresh — showing cached data'}
          </Text>
          <TouchableOpacity onPress={() => refetch()} style={s.retryBtn}>
            <Text style={s.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── List ── */}
      <FlatList
        data={
          showSkeletons
            ? (Array(6).fill(null) as null[])
            : filteredCourses
        }
        keyExtractor={(item, index) =>
          item ? (item as Course).id : `skel_${index}`
        }
        contentContainerStyle={[
          s.list,
          { paddingBottom: insets.bottom + 48 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          !showSkeletons && filteredCourses.length > 0 ? (
            <View style={s.listHeader}>
              <View style={s.listHeaderLine} />
              <Text style={s.listHeaderText}>SELECT A COURSE</Text>
              <View style={s.listHeaderLine} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          noResults ? (
            <View style={s.empty}>
              <View style={[s.emptyIconBox, { backgroundColor: meta.dim, borderColor: meta.border }]}>
                <Ionicons
                  name={query ? 'search-outline' : (meta.icon as any)}
                  size={32}
                  color={meta.color}
                />
              </View>
              <Text style={s.emptyTitle}>
                {query ? 'No matches found' : 'No courses yet'}
              </Text>
              <Text style={s.emptySub}>
                {query
                  ? `No courses match "${query}". Try a different search term.`
                  : `No ${safeLabel.toLowerCase()} courses have been added for your class yet.`}
              </Text>
              {query ? (
                <TouchableOpacity
                  style={[s.emptyBtn, { backgroundColor: meta.dim, borderColor: meta.border }]}
                  onPress={() => setQuery('')}
                >
                  <Text style={[s.emptyBtnText, { color: meta.color }]}>Clear search</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[s.emptyBtn, { backgroundColor: meta.dim, borderColor: meta.border }]}
                  onPress={() => router.back()}
                >
                  <Text style={[s.emptyBtnText, { color: meta.color }]}>Go back</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          if (!item) {
            return <SkeletonCard index={index} accentColor={meta.color} />
          }
          const course = item as Course
          return (
            <CourseCard
              item={course}
              index={index}
              meta={meta}
              onPress={() =>
                router.push({
                  pathname: '/academic-years',
                  params: {
                    course_id:   course.id,
                    course_name: course.name,
                    type:        safeType,
                    label:       safeLabel,
                    color:       meta.color,
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
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },

  // ── Header ──
  header: {
    backgroundColor: C.deep,
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 10,
  },
  headerGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -100,
    right: -80,
  },

  // Nav row
  navRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    marginBottom:   18,
  },
  backBtn: {
    width:            38,
    height:           38,
    borderRadius:     12,
    backgroundColor:  C.surface,
    borderWidth:      1,
    borderColor:      C.border,
    justifyContent:   'center',
    alignItems:       'center',
    flexShrink:       0,
  },
  navCenter: {
    flex:         1,
    flexDirection: 'row',
    alignItems:   'center',
    gap:          8,
  },
  navIconBox: {
    width:          30,
    height:         30,
    borderRadius:   9,
    borderWidth:    1,
    justifyContent: 'center',
    alignItems:     'center',
    flexShrink:     0,
  },
  navTitle: {
    flex:          1,
    fontSize:      18,
    fontWeight:    '800',
    color:         C.text,
    letterSpacing: -0.3,
  },
  refreshBadge: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
    flexShrink:    0,
  },
  refreshDot:  { width: 6, height: 6, borderRadius: 3 },
  refreshText: { fontSize: 10, fontWeight: '600' },

  // Stat strip
  statStrip: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            16,
    marginBottom:   14,
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: {
    fontSize:   22,
    fontWeight: '900',
    lineHeight: 24,
  },
  statLabel: {
    fontSize:   12,
    fontWeight: '600',
    color:      C.textSub,
  },
  statDivider: {
    width:           1,
    height:          22,
    backgroundColor: C.border,
  },
  typeTag: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             5,
    borderRadius:    8,
    borderWidth:     1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  typeTagText: {
    fontSize:      10.5,
    fontWeight:    '700',
    letterSpacing: 0.3,
  },

  // Search bar
  searchBar: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    backgroundColor: C.surface,
    borderWidth:     1,
    borderColor:     C.border,
    borderRadius:    14,
    paddingHorizontal: 13,
    paddingVertical:   10,
  },
  searchInput: {
    flex:     1,
    fontSize: 14,
    color:    C.text,
  },

  // Divider
  headerDivider:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  headerDividerLine: { flex: 1, height: 1 },
  headerDividerDot:  { width: 4, height: 4, borderRadius: 2 },

  // ── Error banner ──
  errorBanner: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    backgroundColor:   'rgba(239,68,68,0.10)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239,68,68,0.2)',
    paddingHorizontal: 16,
    paddingVertical:   10,
  },
  errorBannerText: { flex: 1, fontSize: 12, color: '#FCA5A5' },
  retryBtn:        { backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  retryBtnText:    { fontSize: 12, fontWeight: '700', color: '#FCA5A5' },

  // ── Skeleton ──
  skeletonCard: {
    backgroundColor: C.surface,
    borderRadius:    18,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     C.border,
    overflow:        'hidden',
    flexDirection:   'row',
  },
  skeletonAccent: { width: 3, alignSelf: 'stretch' },
  skeletonInner:  { flex: 1, padding: 14, paddingLeft: 14, gap: 10 },
  skeletonTop:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skeletonInitial:{ width: 46, height: 46, borderRadius: 13, flexShrink: 0 },
  skeletonBody:   { flex: 1, gap: 8 },
  skeletonTitle:  { height: 13, borderRadius: 6, backgroundColor: C.lift2, width: '65%' },
  skeletonCode:   { height: 10, borderRadius: 5, backgroundColor: C.lift2, width: '30%' },
  skeletonDesc:   { height: 10, borderRadius: 5, backgroundColor: C.lift2, width: '85%' },

  // ── Course card ──
  card: {
    backgroundColor: C.surface,
    borderRadius:    18,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     C.border,
    overflow:        'hidden',
    flexDirection:   'row',
  },
  cardAccent: { width: 3, alignSelf: 'stretch' },
  cardInner:  { flex: 1, padding: 14, paddingLeft: 14, gap: 10 },
  cardTop:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardInitialBox: {
    width:          46,
    height:         46,
    borderRadius:   13,
    justifyContent: 'center',
    alignItems:     'center',
    borderWidth:    1,
    flexShrink:     0,
  },
  cardInitial: {
    fontSize:   20,
    fontWeight: '800',
  },
  cardMeta:    { flex: 1, gap: 5 },
  cardName:    { fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 20 },
  codePill: {
    alignSelf:       'flex-start',
    borderRadius:    7,
    borderWidth:     1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  codeText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5 },
  arrowBox: {
    width:          32,
    height:         32,
    borderRadius:   10,
    borderWidth:    1,
    justifyContent: 'center',
    alignItems:     'center',
    flexShrink:     0,
  },
  cardDesc: {
    fontSize:   12,
    color:      C.textSub,
    lineHeight: 17,
  },

  // ── List ──
  list: { paddingHorizontal: 16, paddingTop: 18 },
  listHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    marginBottom:   16,
    paddingHorizontal: 2,
  },
  listHeaderLine: { flex: 1, height: 1, backgroundColor: C.border },
  listHeaderText: {
    fontSize:      9.5,
    fontWeight:    '700',
    color:         C.textMute,
    letterSpacing: 2.5,
  },

  // ── Empty ──
  empty: {
    alignItems:    'center',
    paddingTop:    72,
    paddingHorizontal: 40,
    gap:           12,
  },
  emptyIconBox: {
    width:          72,
    height:         72,
    borderRadius:   22,
    borderWidth:    1,
    justifyContent: 'center',
    alignItems:     'center',
    marginBottom:   4,
  },
  emptyTitle: {
    fontSize:   17,
    fontWeight: '700',
    color:      C.text,
  },
  emptySub: {
    fontSize:   13,
    color:      C.textSub,
    textAlign:  'center',
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop:       16,
    borderRadius:    12,
    borderWidth:     1,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  emptyBtnText: { fontSize: 13, fontWeight: '700' },
})