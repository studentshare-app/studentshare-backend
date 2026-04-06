/**
 * app/books.tsx  (or app/(tabs)/books.tsx depending on your tab structure)
 * Books Screen
 *
 * Features:
 *  - List view (default) + Grid view toggle
 *  - Search bar
 *  - Category filter chips (All, Textbooks, References, Novels, Journals, Saved)
 *  - "New this week" section — books uploaded in the last 7 days
 *  - "Your courses" section — books tied to student's enrolled courses
 *  - Bookmark / save toggle (persisted via AsyncStorage)
 *  - Download via Supabase storage URL (opens browser / share sheet)
 *  - Books are uploaded by admins — no upload FAB shown to regular users
 *  - Accessible from Browse Categories "Books" tile on the home screen
 *
 * Routing from home screen:
 *   router.push('/books')
 *   — already wired in the CATEGORIES array via type === 'book'
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/core/api/supabase'
import { useProfileSync } from '@/hooks/useProfileSync'

// ─────────────────────────────────────────────
// Design tokens — mirrors home screen
// ─────────────────────────────────────────────
const C = {
  void:      '#08090C',
  deep:      '#0C0E14',
  surface:   '#111318',
  raised:    '#161A22',
  border:    '#1E2330',
  borderHi:  '#2A3145',
  text:      '#EEF0F6',
  textSub:   '#8B93A8',
  textMute:  '#4A5168',
  gold:      '#F0C060',
  goldGlow:  '#D4983A',
  goldDim:   '#2A1E08',
  silver:    '#C0C8D8',
  sapphire:  '#5B8DEF',
  sapphGlow: '#2D5AB8',
  sapphDim:  '#0D1A35',
  emerald:   '#44D4A0',
  emerDim:   '#0A2C1E',
  coral:     '#FF7B7B',
  coralDim:  '#2A0E0E',
  lavender:  '#A78BFA',
  lavDim:    '#1E1040',
  amber:     '#FBBD34',
  orange:    '#FB923C',
  orangeDim: '#2A1208',
  sky:       '#38BDF8',
  skyDim:    '#0D1E2A',
  pink:      '#E879F9',
  pinkDim:   '#260830',
} as const

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Book = {
  id: string
  title: string
  author: string
  edition: string | null
  file_url: string
  file_size_mb: number | null
  file_format: 'PDF' | 'EPUB' | 'DOCX' | string
  cover_url: string | null
  category: 'textbook' | 'reference' | 'novel' | 'journal' | string
  course_id: string | null
  college_id: string | null
  rating: number | null
  download_count: number
  created_at: string
  courses?: { name: string }[] | { name: string } | null
}

function getCourseName(course: Book['courses']): string {
  if (Array.isArray(course)) return course[0]?.name ?? ''
  return course?.name ?? ''
}

type ViewMode = 'list' | 'grid'
type FilterCategory = 'all' | 'textbook' | 'reference' | 'novel' | 'journal' | 'saved'

const SAVED_BOOKS_KEY = 'studentshare_saved_book_ids'

// ─────────────────────────────────────────────
// Accent color per subject (based on category + course)
// ─────────────────────────────────────────────
const CATEGORY_ACCENTS: Record<string, { color: string; bg: string; dimBg: string }> = {
  textbook:  { color: C.sapphire, bg: C.sapphDim,  dimBg: '#0D1A35' },
  reference: { color: C.lavender, bg: C.lavDim,    dimBg: '#1E1040' },
  novel:     { color: C.coral,    bg: C.coralDim,  dimBg: '#2A0E0E' },
  journal:   { color: C.emerald,  bg: C.emerDim,   dimBg: '#0A2C1E' },
  default:   { color: C.orange,   bg: C.orangeDim, dimBg: '#2A1208' },
}

// Maps common course name keywords → accent palette
const COURSE_ACCENT_MAP: { keyword: string; color: string; dimBg: string }[] = [
  { keyword: 'math',       color: C.sapphire, dimBg: '#0D1A35' },
  { keyword: 'calc',       color: C.sapphire, dimBg: '#0D1A35' },
  { keyword: 'chem',       color: C.emerald,  dimBg: '#0A2C1E' },
  { keyword: 'bio',        color: C.emerald,  dimBg: '#0A2C1E' },
  { keyword: 'physics',    color: C.sky,      dimBg: '#0D1E2A' },
  { keyword: 'stats',      color: C.lavender, dimBg: '#1E1040' },
  { keyword: 'stat',       color: C.lavender, dimBg: '#1E1040' },
  { keyword: 'algorithm',  color: C.lavender, dimBg: '#1E1040' },
  { keyword: 'discrete',   color: C.orange,   dimBg: '#2A1208' },
  { keyword: 'econ',       color: C.gold,     dimBg: '#2A1E08' },
  { keyword: 'market',     color: C.coral,    dimBg: '#2A0E0E' },
  { keyword: 'law',        color: C.amber,    dimBg: '#221408' },
  { keyword: 'history',    color: C.gold,     dimBg: '#2A1E08' },
  { keyword: 'english',    color: C.pink,     dimBg: '#260830' },
  { keyword: 'lit',        color: C.pink,     dimBg: '#260830' },
]

function bookAccent(book: Book): { color: string; dimBg: string } {
  const title = (book.title + ' ' + getCourseName(book.courses)).toLowerCase()
  for (const m of COURSE_ACCENT_MAP) {
    if (title.includes(m.keyword)) return { color: m.color, dimBg: m.dimBg }
  }
  const cat = CATEGORY_ACCENTS[book.category] ?? CATEGORY_ACCENTS.default
  return { color: cat.color, dimBg: cat.dimBg }
}

function formatSize(mb: number | null): string {
  if (!mb) return ''
  return mb >= 1 ? `${mb.toFixed(0)} MB` : `${(mb * 1024).toFixed(0)} KB`
}

function isNewThisWeek(createdAt: string): boolean {
  const d = new Date(createdAt)
  return Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1000
}

// ─────────────────────────────────────────────
// Supabase fetch
// ─────────────────────────────────────────────
async function fetchBooks(collegeId: string | null, courseIds: string[]): Promise<Book[]> {
  let q = supabase
    .from('books')
    .select('id, title, author, edition, file_url, file_size_mb, file_format, cover_url, category, course_id, college_id, rating, download_count, created_at, courses(name)')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(100)

  // Fetch books for this college OR books with no college restriction (global)
  if (collegeId) {
    q = q.or(`college_id.eq.${collegeId},college_id.is.null`) as typeof q
  }

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as Book[]
}

async function fetchUserCourseIds(classId: string | null): Promise<string[]> {
  if (!classId) return []
  const { data } = await supabase.from('courses').select('id').eq('class_id', classId)
  return data?.map((c: any) => c.id) ?? []
}

// ─────────────────────────────────────────────
// ScalePress
// ─────────────────────────────────────────────
function ScalePress({
  children, onPress, style,
}: {
  children: React.ReactNode; onPress?: () => void; style?: any
}) {
  const scale = useRef(new Animated.Value(1)).current
  const onIn  = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
  const onOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 4 }).start()
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
}

// ─────────────────────────────────────────────
// Tag chip (reused from home screen)
// ─────────────────────────────────────────────
function TagChip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[bs.tagChip, { backgroundColor: bg, borderColor: color + '30' }]}>
      <Text allowFontScaling={false} style={[bs.tagChipText, { color }]}>{label}</Text>
    </View>
  )
}

// ─────────────────────────────────────────────
// Book cover mini illustration (no real image)
// ─────────────────────────────────────────────
function BookCoverIcon({ color, size = 20 }: { color: string; size?: number }) {
  // Simple open-book SVG path via Ionicons fallback
  return (
    <Ionicons name="book" size={size} color={color} />
  )
}

// ─────────────────────────────────────────────
// Stars
// ─────────────────────────────────────────────
function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return null
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Ionicons name="star" size={11} color={C.gold} />
      <Text allowFontScaling={false} style={bs.ratingText}>{rating.toFixed(1)}</Text>
    </View>
  )
}

// ─────────────────────────────────────────────
// Download count
// ─────────────────────────────────────────────
function DownloadCount({ count }: { count: number }) {
  const label = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Ionicons name="download-outline" size={11} color={C.textMute} />
      <Text allowFontScaling={false} style={bs.dlCountText}>{label}</Text>
    </View>
  )
}

// ─────────────────────────────────────────────
// LIST ROW
// ─────────────────────────────────────────────
function BookListRow({
  book,
  saved,
  onToggleSave,
  onDownload,
  isNew,
}: {
  book: Book
  saved: boolean
  onToggleSave: () => void
  onDownload: () => void
  isNew: boolean
}) {
  const { color, dimBg } = bookAccent(book)
  const fmtColor = color
  const fmtBg    = color + '15'

  return (
    <ScalePress>
      <View style={[bs.listRow, { overflow: 'hidden' }]}>
        {/* Left accent bar */}
        <View style={[bs.accentBar, { backgroundColor: color }]} />

        {/* Mini cover */}
        <View style={[bs.listCover, { backgroundColor: dimBg, borderColor: C.borderHi }]}>
          {book.cover_url
            ? <Image source={{ uri: book.cover_url }} style={bs.listCoverImage} resizeMode="cover" />
            : <BookCoverIcon color={color} size={22} />
          }
        </View>

        {/* Content */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text maxFontSizeMultiplier={1.3} style={bs.listTitle} numberOfLines={2}>
            {book.title}
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={bs.listAuthor} numberOfLines={1}>
            {book.author}{book.edition ? ` · ${book.edition}` : ''}
          </Text>

          <View style={bs.listMeta}>
            {/* Format + size badge */}
            <View style={[bs.formatBadge, { backgroundColor: fmtBg, borderColor: color + '28' }]}>
              <Text allowFontScaling={false} style={[bs.formatText, { color: fmtColor }]}>
                {book.file_format.toUpperCase()}
                {book.file_size_mb ? ` · ${formatSize(book.file_size_mb)}` : ''}
              </Text>
            </View>

            {/* NEW badge */}
            {isNew && (
              <View style={[bs.newBadge, { backgroundColor: color + '15', borderColor: color + '30' }]}>
                <Text allowFontScaling={false} style={[bs.newBadgeText, { color }]}>NEW</Text>
              </View>
            )}

            <DownloadCount count={book.download_count} />
            <StarRating rating={book.rating} />
          </View>

          {/* Course tag if available */}
          {getCourseName(book.courses) && (
              <Text allowFontScaling={false} style={bs.listCourse} numberOfLines={1}>
               {getCourseName(book.courses)}
              </Text>
            )}
        </View>

        {/* Action buttons */}
        <View style={bs.listActions}>
          <TouchableOpacity
            style={[bs.actionBtn, { backgroundColor: C.emerDim, borderColor: C.emerald + '22' }]}
            onPress={onDownload}
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="download-outline" size={15} color={C.emerald} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              bs.actionBtn,
              saved
                ? { backgroundColor: C.goldDim, borderColor: C.gold + '35' }
                : { backgroundColor: C.raised,  borderColor: C.border },
            ]}
            onPress={onToggleSave}
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={15}
              color={saved ? C.gold : C.textMute}
            />
          </TouchableOpacity>
        </View>
      </View>
    </ScalePress>
  )
}

// ─────────────────────────────────────────────
// GRID CARD
// ─────────────────────────────────────────────
function BookGridCard({
  book,
  saved,
  onToggleSave,
  onDownload,
  isNew,
  width,
}: {
  book: Book
  saved: boolean
  onToggleSave: () => void
  onDownload: () => void
  isNew: boolean
  width: number
}) {
  const { color, dimBg } = bookAccent(book)

  return (
    <ScalePress>
      <View style={[bs.gridCard, { width }]}>
        {/* Cover area */}
        <View style={[bs.gridCover, { backgroundColor: dimBg }]}>
          {book.cover_url
            ? <Image source={{ uri: book.cover_url }} style={bs.gridCoverImage} resizeMode="cover" />
            : (
              <View style={[bs.gridCoverIcon, { borderColor: C.borderHi }]}>
                <BookCoverIcon color={color} size={24} />
              </View>
            )
          }
          {isNew && (
            <View style={[bs.gridNewBadge, { backgroundColor: color + '20', borderColor: color + '35' }]}>
              <Text allowFontScaling={false} style={[bs.gridNewBadgeText, { color }]}>NEW</Text>
            </View>
          )}
          <TouchableOpacity
            style={[
              bs.gridBookmarkBtn,
              saved
                ? { backgroundColor: C.goldDim, borderColor: C.gold + '35' }
                : { backgroundColor: 'rgba(8,9,12,0.6)', borderColor: C.border },
            ]}
            onPress={onToggleSave}
            activeOpacity={0.8}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={13}
              color={saved ? C.gold : C.textMute}
            />
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={bs.gridInfo}>
          <Text maxFontSizeMultiplier={1.3} style={bs.gridTitle} numberOfLines={2}>{book.title}</Text>
          <Text allowFontScaling={false} style={bs.gridAuthor} numberOfLines={1}>{book.author}</Text>

          <View style={bs.gridMeta}>
            <View style={[bs.formatBadge, { backgroundColor: color + '12', borderColor: color + '25' }]}>
              <Text allowFontScaling={false} style={[bs.formatText, { color }]}>{book.file_format.toUpperCase()}</Text>
            </View>
            <StarRating rating={book.rating} />
          </View>

          <View style={bs.gridFooter}>
            <DownloadCount count={book.download_count} />
            <TouchableOpacity
              style={[bs.gridDlBtn, { backgroundColor: C.emerDim, borderColor: C.emerald + '22' }]}
              onPress={onDownload}
              activeOpacity={0.8}
            >
              <Ionicons name="download-outline" size={13} color={C.emerald} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScalePress>
  )
}

// ─────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────
function EmptyState({ filter }: { filter: FilterCategory }) {
  const msg =
    filter === 'saved'
      ? "You haven't saved any books yet.\nTap the bookmark icon on any book."
      : 'No books found for this category.\nCheck back soon!'
  return (
    <View style={bs.emptyBox}>
      <View style={bs.emptyIconBox}>
        <Ionicons name="book-outline" size={32} color={C.textMute} />
      </View>
      <Text maxFontSizeMultiplier={1.3} style={bs.emptyText}>{msg}</Text>
    </View>
  )
}

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function BooksScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const { width: WIN_W } = useWindowDimensions()
  const GRID_GAP   = 12
  const H_PAD      = 18
  const GRID_CARD_W = Math.floor((WIN_W - H_PAD * 2 - GRID_GAP) / 2)

  const { userId } = useProfileSync()

  // ── Local state ──
  const [viewMode,    setViewMode]    = useState<ViewMode>('list')
  const [filter,      setFilter]      = useState<FilterCategory>('all')
  const [search,      setSearch]      = useState('')
  const [savedIds,    setSavedIds]    = useState<Set<string>>(new Set())
  const [savedLoaded, setSavedLoaded] = useState(false)
  const [refreshing,  setRefreshing]  = useState(false)

  // ── Profile data ──
  const [collegeId, setCollegeId] = useState<string | null>(null)
  const [classId,   setClassId]   = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('profiles')
      .select('college_id, class_id')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setCollegeId(data.college_id ?? null)
          setClassId(data.class_id ?? null)
        }
      })
  }, [userId])

  // ── Course IDs for "Your courses" section ──
  const { data: courseIds = [] } = useQuery({
    queryKey: ['userCourseIds', classId],
    queryFn:  () => fetchUserCourseIds(classId),
    enabled:  !!classId,
    staleTime: 10 * 60 * 1000,
  })

  // ── Books query ──
  const {
    data: allBooks = [],
    isLoading,
    refetch,
    isError,
  } = useQuery({
    queryKey: ['books', collegeId],
    queryFn:  () => fetchBooks(collegeId, courseIds),
    enabled:  true,
    staleTime: 5 * 60 * 1000,
  })

  // ── Load saved IDs from AsyncStorage ──
  useEffect(() => {
    AsyncStorage.getItem(SAVED_BOOKS_KEY)
      .then(raw => {
        if (raw) setSavedIds(new Set(JSON.parse(raw)))
      })
      .catch(() => {})
      .finally(() => setSavedLoaded(true))
  }, [])

  const persistSaved = useCallback((ids: Set<string>) => {
    AsyncStorage.setItem(SAVED_BOOKS_KEY, JSON.stringify([...ids])).catch(() => {})
  }, [])

  const toggleSave = useCallback((id: string) => {
    setSavedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persistSaved(next)
      return next
    })
  }, [persistSaved])

  const handleDownload = useCallback((book: Book) => {
    if (!book.file_url) return
    Linking.openURL(book.file_url).catch(() => {})
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [refetch])

  // ── Filtered & searched books ──
  const { newBooks, courseBooks, otherBooks } = useMemo(() => {
    let books = allBooks

    // Category filter
    if (filter === 'saved') {
      books = books.filter(b => savedIds.has(b.id))
    } else if (filter !== 'all') {
      books = books.filter(b => b.category === filter)
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      books = books.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        getCourseName(b.courses).toLowerCase().includes(q),
      )
    }

    const newBks    = books.filter(b => isNewThisWeek(b.created_at))
    const courseBks = books.filter(b => b.course_id && courseIds.includes(b.course_id) && !isNewThisWeek(b.created_at))
    const otherBks  = books.filter(b => !isNewThisWeek(b.created_at) && !(b.course_id && courseIds.includes(b.course_id)))

    return { newBooks: newBks, courseBooks: courseBks, otherBooks: otherBks }
  }, [allBooks, filter, search, savedIds, courseIds])

  const FILTER_TABS: { key: FilterCategory; label: string }[] = [
    { key: 'all',       label: 'All'        },
    { key: 'textbook',  label: 'Textbooks'  },
    { key: 'reference', label: 'References' },
    { key: 'novel',     label: 'Novels'     },
    { key: 'journal',   label: 'Journals'   },
    { key: 'saved',     label: 'Saved'      },
  ]

  // ── Render a single book (list or grid) ──
  const renderBook = useCallback((book: Book, isNew: boolean) => {
    const saved = savedIds.has(book.id)
    if (viewMode === 'grid') {
      return (
        <BookGridCard
          key={book.id}
          book={book}
          saved={saved}
          onToggleSave={() => toggleSave(book.id)}
          onDownload={() => handleDownload(book)}
          isNew={isNew}
          width={GRID_CARD_W}
        />
      )
    }
    return (
      <BookListRow
        key={book.id}
        book={book}
        saved={saved}
        onToggleSave={() => toggleSave(book.id)}
        onDownload={() => handleDownload(book)}
        isNew={isNew}
      />
    )
  }, [viewMode, savedIds, toggleSave, handleDownload, GRID_CARD_W])

  // ── Grid row helper ──
  const renderGridRows = (books: Book[], isNew: boolean) => {
    const rows: React.ReactNode[] = []
    for (let i = 0; i < books.length; i += 2) {
      rows.push(
        <View key={i} style={{ flexDirection: 'row', gap: GRID_GAP, marginBottom: GRID_GAP }}>
          {renderBook(books[i], isNew)}
          {books[i + 1] ? renderBook(books[i + 1], isNew) : <View style={{ width: GRID_CARD_W }} />}
        </View>,
      )
    }
    return rows
  }

  const totalCount = allBooks.length

  return (
    <View style={[bs.screen, { paddingTop: insets.top }]}>

      {/* ── HEADER ── */}
      <View style={bs.header}>
        <View style={bs.headerOrb1} />
        <View style={bs.headerOrb2} />

        <View style={bs.headerTop}>
          <TouchableOpacity
            style={bs.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={18} color={C.textSub} />
          </TouchableOpacity>

          <View style={{ flex: 1, paddingHorizontal: 12 }}>
            <View style={bs.headerLabel}>
              <View style={bs.headerLabelIcon}>
                <Ionicons name="book" size={13} color={C.emerald} />
              </View>
              <Text allowFontScaling={false} style={bs.headerLabelText}>Library</Text>
            </View>
            <Text maxFontSizeMultiplier={1.3} style={bs.headerTitle}>Books</Text>
            <Text allowFontScaling={false} style={bs.headerSub}>
              {isLoading ? 'Loading…' : `${totalCount} textbooks & references`}
            </Text>
          </View>

          {/* View toggle */}
          <View style={bs.viewToggle}>
            <TouchableOpacity
              style={[bs.toggleBtn, viewMode === 'list' && bs.toggleBtnActive]}
              onPress={() => setViewMode('list')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="list"
                size={16}
                color={viewMode === 'list' ? C.void : C.textMute}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[bs.toggleBtn, viewMode === 'grid' && bs.toggleBtnActive]}
              onPress={() => setViewMode('grid')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="grid"
                size={15}
                color={viewMode === 'grid' ? C.void : C.textMute}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View style={bs.searchBar}>
          <View style={bs.searchIconBox}>
            <Ionicons name="search" size={14} color={C.sapphire} />
          </View>
          <TextInput
            style={bs.searchInput}
            placeholder="Search books, authors, courses…"
            placeholderTextColor={C.textMute}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && Platform.OS === 'android' && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={17} color={C.textMute} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={bs.filterRow}
        >
          {FILTER_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[bs.filterChip, filter === tab.key && bs.filterChipActive]}
              onPress={() => setFilter(tab.key)}
              activeOpacity={0.8}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                style={[bs.filterChipText, filter === tab.key && bs.filterChipTextActive]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── BODY ── */}
      {isLoading && !allBooks.length ? (
        <View style={bs.loadingBox}>
          <ActivityIndicator color={C.emerald} />
          <Text maxFontSizeMultiplier={1.3} style={bs.loadingText}>Loading books…</Text>
        </View>
      ) : isError ? (
        <View style={bs.loadingBox}>
          <Ionicons name="cloud-offline-outline" size={32} color={C.textMute} />
          <Text maxFontSizeMultiplier={1.3} style={bs.loadingText}>Could not load books.</Text>
          <TouchableOpacity style={bs.retryBtn} onPress={() => refetch()}>
            <Text maxFontSizeMultiplier={1.3} style={bs.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[bs.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={C.emerald}
              colors={[C.emerald]}
            />
          }
        >

          {/* ── NEW THIS WEEK ── */}
          {newBooks.length > 0 && (
            <View style={bs.section}>
              <View style={bs.sectionHead}>
                <Text maxFontSizeMultiplier={1.3} style={bs.sectionTitle}>New this week</Text>
              </View>
              {viewMode === 'list'
                ? newBooks.map(b => renderBook(b, true))
                : <View>{renderGridRows(newBooks, true)}</View>
              }
            </View>
          )}

          {/* ── YOUR COURSES ── */}
          {courseBooks.length > 0 && (
            <View style={bs.section}>
              <View style={bs.sectionHead}>
                <Text maxFontSizeMultiplier={1.3} style={bs.sectionTitle}>Your courses</Text>
                <View style={bs.filterPill}>
                  <Ionicons name="funnel-outline" size={11} color={C.textMute} />
                  <Text allowFontScaling={false} style={bs.filterPillText}>Filter</Text>
                </View>
              </View>
              {viewMode === 'list'
                ? courseBooks.map(b => renderBook(b, false))
                : <View>{renderGridRows(courseBooks, false)}</View>
              }
            </View>
          )}

          {/* ── ALL BOOKS (remainder) ── */}
          {otherBooks.length > 0 && (
            <View style={bs.section}>
              <View style={bs.sectionHead}>
                <Text maxFontSizeMultiplier={1.3} style={bs.sectionTitle}>
                  {filter === 'saved' ? 'Saved books' : courseBooks.length > 0 ? 'More books' : 'All books'}
                </Text>
                <Text allowFontScaling={false} style={bs.sectionCount}>{otherBooks.length}</Text>
              </View>
              {viewMode === 'list'
                ? otherBooks.map(b => renderBook(b, false))
                : <View>{renderGridRows(otherBooks, false)}</View>
              }
            </View>
          )}

          {/* ── EMPTY STATE ── */}
          {newBooks.length === 0 && courseBooks.length === 0 && otherBooks.length === 0 && (
            <EmptyState filter={filter} />
          )}

        </ScrollView>
      )}
    </View>
  )
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const bs = StyleSheet.create({
  screen:   { flex: 1, backgroundColor: C.void },

  // Header
  header:       { backgroundColor: C.deep, paddingHorizontal: 18, paddingBottom: 14, position: 'relative', overflow: 'hidden' },
  headerOrb1:   { position: 'absolute', top: -60, right: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: C.emerald + '0A' },
  headerOrb2:   { position: 'absolute', bottom: -30, left: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: C.sapphire + '07' },
  headerTop:    { flexDirection: 'row', alignItems: 'center', paddingTop: 12, marginBottom: 16 },
  backBtn:      { width: 38, height: 38, borderRadius: 12, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  headerLabel:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  headerLabelIcon: { width: 22, height: 22, borderRadius: 7, backgroundColor: C.emerDim, borderWidth: 1, borderColor: C.emerald + '20', justifyContent: 'center', alignItems: 'center' },
  headerLabelText: { fontSize: 10.5, color: C.emerald, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  headerTitle:  { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: -1, lineHeight: 30 },
  headerSub:    { fontSize: 12.5, color: C.textMute, marginTop: 3, fontWeight: '500' },

  // View toggle
  viewToggle:     { flexDirection: 'row', backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, borderRadius: 13, padding: 3, gap: 2, flexShrink: 0 },
  toggleBtn:      { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  toggleBtnActive:{ backgroundColor: C.emerald },

  // Search
  searchBar:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 12 },
  searchIconBox: { width: 28, height: 28, borderRadius: 9, backgroundColor: C.sapphire + '12', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  searchInput:   { flex: 1, fontSize: 14, color: C.text, padding: 0 },

  // Filter chips
  filterRow:        { gap: 7, paddingBottom: 2, paddingRight: 4 },
  filterChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, borderWidth: 1, borderColor: C.border },
  filterChipActive: { backgroundColor: C.emerald },
  filterChipText:   { fontSize: 12, fontWeight: '600', color: C.textMute },
  filterChipTextActive: { color: C.void, fontWeight: '700' },

  // Scroll body
  scrollContent: { paddingHorizontal: 18, paddingTop: 18 },

  // Sections
  section:     { marginBottom: 26 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:{ fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  sectionCount:{ fontSize: 12, color: C.textMute, fontWeight: '600' },
  filterPill:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 5 },
  filterPillText:{ fontSize: 11.5, color: C.textMute, fontWeight: '600' },

  // LIST ROW
  listRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 13, marginBottom: 10, position: 'relative' },
  accentBar:   { position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 0, opacity: 0.75 },
  listCover:   { width: 46, height: 60, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  listCoverImage:{ width: '100%', height: '100%', borderRadius: 9 },
  listTitle:   { fontSize: 13.5, fontWeight: '700', color: C.text, lineHeight: 19, marginBottom: 3 },
  listAuthor:  { fontSize: 12, color: C.textSub, marginBottom: 7 },
  listMeta:    { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  listCourse:  { fontSize: 11, color: C.textMute, marginTop: 2 },
  listActions: { flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 },
  actionBtn:   { width: 34, height: 34, borderRadius: 11, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },

  // FORMAT + NEW badges
  formatBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  formatText:  { fontSize: 10, fontWeight: '700' },
  newBadge:    { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  newBadgeText:{ fontSize: 10, fontWeight: '700' },
  ratingText:  { fontSize: 11, color: C.gold, fontWeight: '700' },
  dlCountText: { fontSize: 11, color: C.textMute },

  // GRID CARD
  gridCard:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, overflow: 'hidden' },
  gridCover:   { height: 100, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  gridCoverImage:{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  gridCoverIcon: { width: 56, height: 74, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.raised },
  gridNewBadge:  { position: 'absolute', top: 8, left: 8, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  gridNewBadgeText:{ fontSize: 9.5, fontWeight: '700' },
  gridBookmarkBtn: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 9, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  gridInfo:    { padding: 11 },
  gridTitle:   { fontSize: 12.5, fontWeight: '700', color: C.text, lineHeight: 17, marginBottom: 3 },
  gridAuthor:  { fontSize: 11, color: C.textMute, marginBottom: 7 },
  gridMeta:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  gridFooter:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gridDlBtn:   { width: 28, height: 28, borderRadius: 9, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },

  // Tag chip (shared)
  tagChip:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  tagChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },

  // Loading / error / empty
  loadingBox:  { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 40 },
  loadingText: { fontSize: 14, color: C.textMute, fontWeight: '500' },
  retryBtn:    { backgroundColor: C.sapphire, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 11, marginTop: 4 },
  retryBtnText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
  emptyBox:    { marginTop: 60, alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  emptyIconBox:{ width: 72, height: 72, borderRadius: 22, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  emptyText:   { fontSize: 14, color: C.textMute, textAlign: 'center', lineHeight: 22 },
})
