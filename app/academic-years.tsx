/**
 * app/academic-years.tsx — Academic Years / Lecturers / Books (Offline-First)
 *
 * OFFLINE ADDITIONS vs previous version:
 *  A1  AsyncStorage cache per query type:
 *        - LECTURERS_KEY:   `studentshare_lecturers_${courseId}`
 *        - BOOKS_KEY:       `studentshare_books_${courseId}`
 *        - YEARS_KEY:       `studentshare_years_${courseId}_${type}`
 *      Written on every successful fetch, seeded as placeholderData on mount.
 *  A2  useNetworkStatus() — amber offline banner shown per-mode when offline
 *      and cached data exists.
 *  A3  Pull-to-refresh disabled offline.
 *  A4  Error banner on each list (non-blocking, with Retry).
 *  A5  conversation_id: 'new' removed from AI Chat params (existing fix kept).
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import {
  fetchAcademicYears,
  fetchBooksMaterials,
  fetchLecturers,
  type MaterialRecord,
} from '../lib/queries/screens'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Lecturer = { id: string; name: string }
type Book = MaterialRecord & { cover_url?: string | null }

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers  (A1)
// ─────────────────────────────────────────────────────────────────────────────
function cacheKey(prefix: string, ...parts: string[]) {
  return `studentshare_${prefix}_${parts.join('_')}`
}

async function readCache<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed as T
  } catch {
    return fallback
  }
}

async function writeCache(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline Banner  (A2)
// ─────────────────────────────────────────────────────────────────────────────
function OfflineBanner({ label }: { label: string }) {
  return (
    <View style={bannerStyles.wrap}>
      <Ionicons name="cloud-offline-outline" size={13} color="#92400E" />
      <Text style={bannerStyles.text}>Offline — showing cached {label}</Text>
    </View>
  )
}
const bannerStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#FEF3C7',
    paddingVertical: 7, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#FDE68A',
  },
  text: { fontSize: 12, fontWeight: '600', color: '#92400E' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Error Banner  (A4)
// ─────────────────────────────────────────────────────────────────────────────
function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={errStyles.wrap}>
      <Ionicons name="wifi-outline" size={16} color="#FCA5A5" />
      <Text style={errStyles.text} numberOfLines={1}>{message}</Text>
      <TouchableOpacity onPress={onRetry} style={errStyles.btn}>
        <Text style={errStyles.btnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  )
}
const errStyles = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', borderBottomWidth: 1, borderBottomColor: 'rgba(239,68,68,0.2)', paddingHorizontal: 16, paddingVertical: 10 },
  text:    { flex: 1, fontSize: 12, color: '#FCA5A5' },
  btn:     { backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  btnText: { fontSize: 12, fontWeight: '700', color: '#FCA5A5' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonRow({ index, accent }: { index: number; accent: string }) {
  const pulse = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1,   duration: 700, delay: index * 80, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])
  return (
    <Animated.View style={[styles.row, { opacity: pulse }]}>
      <View style={[styles.rowAccent, { backgroundColor: accent + '40' }]} />
      <View style={[styles.skelIcon, { backgroundColor: accent + '20' }]} />
      <View style={styles.skelInfo}>
        <View style={styles.skelTitle} />
        <View style={styles.skelSub} />
      </View>
      <View style={[styles.skelArrow, { backgroundColor: accent + '15' }]} />
    </Animated.View>
  )
}

function SkeletonBook({ index, accent }: { index: number; accent: string }) {
  const pulse = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1,   duration: 700, delay: index * 80, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])
  return (
    <Animated.View style={[styles.bookCard, { opacity: pulse }]}>
      <View style={[styles.coverWrap, { backgroundColor: accent + '20' }]} />
      <View style={styles.bookInfo}>
        <View style={[styles.skelTitle, { width: '80%', marginBottom: 8 }]} />
        <View style={[styles.skelSub,  { width: '50%' }]} />
        <View style={styles.skelActions} />
      </View>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated row wrapper
// ─────────────────────────────────────────────────────────────────────────────
function AnimatedRow({ index, children }: { index: number; children: React.ReactNode }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(20)).current
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, delay: Math.min(index, 6) * 55, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, delay: Math.min(index, 6) * 55, useNativeDriver: true }),
    ]).start()
  }, [])
  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {children}
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────────────────────
function Hero({
  color, icon, title, subtitle, count, countLabel, paddingTop, isLoading,
}: {
  color: string; icon: string; title: string; subtitle: string
  count: number; countLabel: string; paddingTop: number; isLoading: boolean
}) {
  const router = useRouter()
  const heroOpacity = useRef(new Animated.Value(0)).current
  const heroY       = useRef(new Animated.Value(-8)).current
  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(heroY,       { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start()
  }, [])
  return (
    <Animated.View style={[styles.hero, { paddingTop }, { opacity: heroOpacity, transform: [{ translateY: heroY }] }]}>
      <View style={styles.circleTopRight} />
      <View style={styles.circleBottomLeft} />
      <View style={[styles.heroGlow, { backgroundColor: color + '22' }]} />
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
        <View style={styles.backBtnCircle}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </View>
      </TouchableOpacity>
      <View style={[styles.heroIconWrap, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon as any} size={26} color={color} />
      </View>
      <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>
      <Text style={styles.heroSub}>{subtitle}</Text>
      <View style={styles.heroDivider}>
        <View style={[styles.heroDividerLine, { backgroundColor: color + '40' }]} />
        <View style={[styles.heroDividerDot, { backgroundColor: color }]} />
        {isLoading
          ? <View style={styles.skelCount} />
          : <Text style={[styles.heroDividerCount, { color }]}>{count} {countLabel}</Text>
        }
        <View style={[styles.heroDividerDot, { backgroundColor: color }]} />
        <View style={[styles.heroDividerLine, { backgroundColor: color + '40' }]} />
      </View>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState({ icon, title, message }: { icon: string; title?: string; message: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={icon as any} size={36} color="#94A3B8" />
      </View>
      <Text style={styles.emptyTitle}>{title ?? 'Nothing here yet'}</Text>
      <Text style={styles.emptySub}>{message}</Text>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function AcademicYearsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { isOnline, isOffline } = useNetworkStatus()   // A2

  const { course_id, course_name, type, label, color } =
    useLocalSearchParams<{
      course_id: string; course_name: string
      type: string; label: string; color: string
    }>()

  const isSlide = type === 'slide'
  const isBook  = type === 'book'
  const accent  = color || '#10B981'

  // Per-query cache keys (A1)
  const lecturersKey = cacheKey('lecturers', course_id)
  const booksKey     = cacheKey('books', course_id)
  const yearsKey     = cacheKey('years', course_id, type)

  // Cached placeholder state (A1)
  const [cachedLecturers, setCachedLecturers] = useState<Lecturer[]>([])
  const [cachedBooks,     setCachedBooks]     = useState<Book[]>([])
  const [cachedYears,     setCachedYears]     = useState<string[]>([])
  const [cacheReady,      setCacheReady]      = useState(false)

  const [refreshing, setRefreshing] = useState(false)

  // Read relevant cache on mount (A1)
  useEffect(() => {
    const loadCache = async () => {
      if (isSlide) {
        const lecs = await readCache<Lecturer[]>(lecturersKey, [])
        setCachedLecturers(lecs)
      } else if (isBook) {
        const books = await readCache<Book[]>(booksKey, [])
        setCachedBooks(books)
      } else {
        const years = await readCache<string[]>(yearsKey, [])
        setCachedYears(years)
      }
      setCacheReady(true)
    }
    loadCache()
  }, [course_id, type])

  // ── Lecturers query ──────────────────────────────────────────────────────
  const {
    data: lecturers = [],
    isLoading: lecturersLoading,
    isError: lecturersError,
    refetch: refetchLecturers,
  } = useQuery({
    queryKey:  ['lecturers', course_id],
    queryFn:   async () => {
      const result = await fetchLecturers(course_id)
      void writeCache(lecturersKey, result)
      setCachedLecturers(result)
      return result
    },
    enabled:         isSlide && cacheReady,
    staleTime:       30 * 60 * 1000,
    gcTime:          7 * 24 * 60 * 60 * 1000,
    placeholderData: cachedLecturers.length > 0 ? cachedLecturers : undefined,
  })

  // ── Books query ──────────────────────────────────────────────────────────
  const {
    data: books = [],
    isLoading: booksLoading,
    isError: booksError,
    refetch: refetchBooks,
  } = useQuery({
    queryKey:  ['books', course_id],
    queryFn:   async () => {
      const result = await fetchBooksMaterials(course_id)
      void writeCache(booksKey, result)
      setCachedBooks(result as Book[])
      return result
    },
    enabled:         isBook && cacheReady,
    staleTime:       30 * 60 * 1000,
    gcTime:          7 * 24 * 60 * 60 * 1000,
    placeholderData: cachedBooks.length > 0 ? (cachedBooks as any) : undefined,
  })

  // ── Academic years query ──────────────────────────────────────────────────
  const {
    data: years = [],
    isLoading: yearsLoading,
    isError: yearsError,
    refetch: refetchYears,
  } = useQuery({
    queryKey:  ['academicYears', course_id, type],
    queryFn:   async () => {
      const result = await fetchAcademicYears(course_id, type)
      void writeCache(yearsKey, result)
      setCachedYears(result)
      return result
    },
    enabled:         !isSlide && !isBook && cacheReady,
    staleTime:       30 * 60 * 1000,
    gcTime:          7 * 24 * 60 * 60 * 1000,
    placeholderData: cachedYears.length > 0 ? cachedYears : undefined,
  })

  const heroPaddingTop = insets.top + 12
  const listBottom     = insets.bottom + 48

  // ── Pull-to-refresh (A3: disabled offline) ────────────────────────────────
  const handleRefresh = async (fn: () => Promise<any>) => {
    if (!isOnline) return
    setRefreshing(true)
    await fn().catch(() => {})
    setRefreshing(false)
  }

  // ── SLIDES ───────────────────────────────────────────────────────────────
  if (isSlide) {
    const lecs     = (lecturers as Lecturer[]).length > 0 ? lecturers as Lecturer[] : cachedLecturers
    const showSkel = lecturersLoading && lecs.length === 0
    return (
      <View style={styles.container}>
        <Hero
          color={accent} icon="people" title={course_name}
          subtitle="Select a lecturer to view their slides"
          count={lecs.length}
          countLabel={lecs.length === 1 ? 'lecturer' : 'lecturers'}
          paddingTop={heroPaddingTop} isLoading={showSkel}
        />
        {/* A2: offline banner */}
        {isOffline && lecs.length > 0 && <OfflineBanner label="lecturers" />}
        {/* A4: error banner */}
        {lecturersError && (
          <ErrorBanner
            message="Could not refresh — showing cached lecturers"
            onRetry={() => refetchLecturers()}
          />
        )}
        <FlatList
          data={showSkel ? Array(4).fill(null) : lecs}
          keyExtractor={(item, i) => item ? (item as Lecturer).id : `sk${i}`}
          contentContainerStyle={[styles.list, { paddingBottom: listBottom }]}
          showsVerticalScrollIndicator={false}
          // A3: no pull-to-refresh offline
          refreshControl={isOnline ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => handleRefresh(refetchLecturers)}
              tintColor={accent} colors={[accent]}
            />
          ) : undefined}
          ListEmptyComponent={
            !showSkel ? (
              <EmptyState
                icon={isOffline ? 'cloud-offline-outline' : 'people-outline'}
                title={isOffline ? 'No cached lecturers' : undefined}
                message={isOffline
                  ? 'Connect to the internet to load lecturers.'
                  : 'No lecturers added yet.'}
              />
            ) : null
          }
          renderItem={({ item, index }) => {
            if (!item) return <SkeletonRow index={index} accent={accent} />
            const lec = item as Lecturer
            return (
              <AnimatedRow index={index}>
                <TouchableOpacity
                  style={styles.row} activeOpacity={0.8}
                  onPress={() => router.push({
                    pathname: '/materials',
                    params: { course_id, course_name, type, color, lecturer_id: lec.id, lecturer: lec.name },
                  })}
                >
                  <View style={[styles.rowAccent, { backgroundColor: accent }]} />
                  <View style={[styles.rowAvatar, { backgroundColor: accent + '18', borderColor: accent + '40' }]}>
                    <Ionicons name="person" size={20} color={accent} />
                  </View>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowTitle}>{lec.name}</Text>
                    <Text style={styles.rowSub}>Tap to view slides</Text>
                  </View>
                  <View style={[styles.rowArrow, { backgroundColor: accent + '15' }]}>
                    <Ionicons name="chevron-forward" size={15} color={accent} />
                  </View>
                </TouchableOpacity>
              </AnimatedRow>
            )
          }}
        />
      </View>
    )
  }

  // ── BOOKS ─────────────────────────────────────────────────────────────────
  if (isBook) {
    const bookList = ((books as Book[]).length > 0 ? books as Book[] : cachedBooks)
    const showSkel = booksLoading && bookList.length === 0
    return (
      <View style={styles.container}>
        <Hero
          color={accent} icon="book" title={course_name}
          subtitle="Select a book to read"
          count={bookList.length} countLabel={bookList.length === 1 ? 'book' : 'books'}
          paddingTop={heroPaddingTop} isLoading={showSkel}
        />
        {isOffline && bookList.length > 0 && <OfflineBanner label="books" />}
        {booksError && (
          <ErrorBanner
            message="Could not refresh — showing cached books"
            onRetry={() => refetchBooks()}
          />
        )}
        <FlatList
          data={showSkel ? Array(3).fill(null) : bookList}
          keyExtractor={(item, i) => item ? (item as Book).id : `sk${i}`}
          contentContainerStyle={[styles.list, { paddingBottom: listBottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={isOnline ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => handleRefresh(refetchBooks)}
              tintColor={accent} colors={[accent]}
            />
          ) : undefined}
          ListEmptyComponent={
            !showSkel ? (
              <EmptyState
                icon={isOffline ? 'cloud-offline-outline' : 'book-outline'}
                title={isOffline ? 'No cached books' : undefined}
                message={isOffline
                  ? 'Connect to the internet to load books.'
                  : 'No books uploaded yet.'}
              />
            ) : null
          }
          renderItem={({ item, index }) => {
            if (!item) return <SkeletonBook index={index} accent={accent} />
            const bk = item as Book
            return (
              <AnimatedRow index={index}>
                <TouchableOpacity
                  style={styles.bookCard} activeOpacity={0.8}
                  onPress={() => router.push({
                    pathname: '/viewer',
                    params: { file_url: bk.file_url, title: bk.title, color: accent, material_id: bk.id },
                  })}
                >
                  <View style={styles.coverWrap}>
                    {bk.cover_url ? (
                      <Image source={{ uri: bk.cover_url }} style={styles.coverImg} resizeMode="cover" />
                    ) : (
                      <View style={[styles.coverPlaceholder, { backgroundColor: accent }]}>
                        <Ionicons name="book" size={28} color="rgba(255,255,255,0.8)" />
                        <Text style={styles.coverPlaceholderText} numberOfLines={3}>{bk.title}</Text>
                      </View>
                    )}
                    {bk.is_premium && (
                      <View style={styles.premiumBadge}>
                        <Ionicons name="star" size={9} color="#fff" />
                        <Text style={styles.premiumText}>PRO</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.bookInfo}>
                    <Text style={styles.bookTitle} numberOfLines={3}>{bk.title}</Text>
                    <View style={styles.bookActions}>
                      <TouchableOpacity
                        style={[styles.bookReadBtn, { backgroundColor: accent }]}
                        onPress={() => router.push({
                          pathname: '/viewer',
                          params: { file_url: bk.file_url, title: bk.title, color: accent, material_id: bk.id },
                        })}
                      >
                        <Ionicons name="book-outline" size={13} color="#fff" />
                        <Text style={styles.bookReadText}>Read</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.bookAiBtn}
                        onPress={() => router.push({
                          pathname: '/chat',
                          // A5: no conversation_id — chat screen treats absence as new conversation
                          params: { material_title: bk.title, file_url: bk.file_url, material_id: bk.id },
                        })}
                      >
                        <Ionicons name="sparkles" size={13} color="#7C3AED" />
                        <Text style={styles.bookAiText}>AI Chat</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              </AnimatedRow>
            )
          }}
        />
      </View>
    )
  }

  // ── PAST QUESTIONS / TUTORIALS ────────────────────────────────────────────
  const yearList = ((years as string[]).length > 0 ? years as string[] : cachedYears)
  const showSkel = yearsLoading && yearList.length === 0
  return (
    <View style={styles.container}>
      <Hero
        color={accent} icon="calendar" title={course_name}
        subtitle="Select an academic year"
        count={yearList.length}
        countLabel={yearList.length === 1 ? 'year' : 'years'}
        paddingTop={heroPaddingTop} isLoading={showSkel}
      />
      {isOffline && yearList.length > 0 && <OfflineBanner label="academic years" />}
      {yearsError && (
        <ErrorBanner
          message="Could not refresh — showing cached years"
          onRetry={() => refetchYears()}
        />
      )}
      <FlatList
        data={showSkel ? Array(4).fill(null) : yearList}
        keyExtractor={(item, i) => item ?? `sk${i}`}
        contentContainerStyle={[styles.list, { paddingBottom: listBottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={isOnline ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => handleRefresh(refetchYears)}
            tintColor={accent} colors={[accent]}
          />
        ) : undefined}
        ListHeaderComponent={
          !showSkel && yearList.length > 0
            ? <Text style={styles.listHeader}>Academic Years</Text>
            : null
        }
        ListEmptyComponent={
          !showSkel ? (
            <EmptyState
              icon={isOffline ? 'cloud-offline-outline' : 'calendar-outline'}
              title={isOffline ? 'No cached years' : undefined}
              message={isOffline
                ? 'Connect to the internet to load academic years.'
                : `No ${label?.toLowerCase() || 'materials'} uploaded yet.`}
            />
          ) : null
        }
        renderItem={({ item, index }) => {
          if (!item) return <SkeletonRow index={index} accent={accent} />
          return (
            <AnimatedRow index={index}>
              <TouchableOpacity
                style={styles.row} activeOpacity={0.8}
                onPress={() => router.push({
                  pathname: '/materials',
                  params: { course_id, course_name, type, color, academic_year: item },
                })}
              >
                <View style={[styles.rowAccent, { backgroundColor: accent }]} />
                <View style={[styles.yearBadge, { backgroundColor: accent + '18' }]}>
                  <Ionicons name="calendar" size={20} color={accent} />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle}>{item}</Text>
                  <Text style={styles.rowSub}>Academic Year</Text>
                </View>
                <View style={[styles.rowArrow, { backgroundColor: accent + '15' }]}>
                  <Ionicons name="chevron-forward" size={15} color={accent} />
                </View>
              </TouchableOpacity>
            </AnimatedRow>
          )
        }}
      />
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  // Hero
  hero:             { backgroundColor: '#0F172A', paddingHorizontal: 20, paddingBottom: 24, position: 'relative', overflow: 'hidden' },
  circleTopRight:   { position: 'absolute', top: -50,  right: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(56,189,248,0.06)' },
  circleBottomLeft: { position: 'absolute', bottom: -30, left: -30, width: 160, height: 160, borderRadius: 80,  backgroundColor: 'rgba(99,102,241,0.06)' },
  heroGlow:         { position: 'absolute', top: 40, right: 20, width: 120, height: 120, borderRadius: 60 },
  backBtn:          { marginBottom: 18, alignSelf: 'flex-start' },
  backBtnCircle:    { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  heroIconWrap:     { width: 52, height: 52, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  heroTitle:        { fontSize: 22, fontWeight: '800', color: '#F8FAFC', letterSpacing: -0.3, marginBottom: 5, lineHeight: 28 },
  heroSub:          { fontSize: 13, color: '#64748B', marginBottom: 18 },
  heroDivider:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroDividerLine:  { flex: 1, height: 1 },
  heroDividerDot:   { width: 4, height: 4, borderRadius: 2 },
  heroDividerCount: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  skelCount:        { width: 60, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.1)' },

  // List
  list:       { paddingHorizontal: 16, paddingTop: 16 },
  listHeader: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, paddingHorizontal: 2 },

  // Row
  row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, overflow: 'hidden', paddingRight: 14, paddingVertical: 14, gap: 12 },
  rowAccent: { width: 3, alignSelf: 'stretch' },
  rowAvatar: { width: 46, height: 46, borderRadius: 13, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  yearBadge: { width: 46, height: 46, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  rowInfo:   { flex: 1 },
  rowTitle:  { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 3 },
  rowSub:    { fontSize: 12, color: '#94A3B8' },
  rowArrow:  { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },

  // Skeletons
  skelIcon:    { width: 46, height: 46, borderRadius: 13, backgroundColor: '#E2E8F0' },
  skelInfo:    { flex: 1, gap: 8 },
  skelTitle:   { height: 14, borderRadius: 7, backgroundColor: '#E2E8F0', width: '65%' },
  skelSub:     { height: 10, borderRadius: 5, backgroundColor: '#F1F5F9', width: '40%' },
  skelArrow:   { width: 30, height: 30, borderRadius: 9, backgroundColor: '#E2E8F0' },
  skelActions: { height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', width: '60%', marginTop: 12 },

  // Books
  bookCard:            { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, overflow: 'hidden' },
  coverWrap:           { width: 96, position: 'relative' },
  coverImg:            { width: 96, height: 144 },
  coverPlaceholder:    { width: 96, height: 144, justifyContent: 'center', alignItems: 'center', padding: 10, gap: 8 },
  coverPlaceholderText:{ fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.9)', textAlign: 'center', lineHeight: 14 },
  premiumBadge:        { position: 'absolute', top: 7, left: 5, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F59E0B', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  premiumText:         { fontSize: 9, fontWeight: '800', color: '#fff' },
  bookInfo:            { flex: 1, padding: 14, justifyContent: 'space-between' },
  bookTitle:           { fontSize: 14, fontWeight: '700', color: '#0F172A', lineHeight: 21, marginBottom: 12 },
  bookActions:         { flexDirection: 'row', gap: 8 },
  bookReadBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  bookReadText:        { fontSize: 13, fontWeight: '700', color: '#fff' },
  bookAiBtn:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F5F3FF' },
  bookAiText:          { fontSize: 13, fontWeight: '700', color: '#7C3AED' },

  // Empty
  empty:        { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyIconWrap:{ width: 76, height: 76, borderRadius: 22, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  emptySub:     { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
})