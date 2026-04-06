/**
 * app/new-materials.tsx — Offline-First Class Materials Screen
 * Redesigned to match home screen (index.tsx) design language.
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
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/core/api/supabase'
import { useMaterialsActions } from '../hooks/useMaterialsActions'
import { useDownloadRegistry } from '@/lib/useDownloadRegistry'
import { LinearGradient } from 'expo-linear-gradient'

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Theme
// ─────────────────────────────────────────────────────────────────────────────
const BODY_H_PAD = 16
const CACHE_KEY  = 'new_materials_cache'
const SEEN_KEY   = 'new_materials_seen'

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

const TYPE_CONFIG = {
  slide:         { label: 'Slides',         icon: 'easel-outline'          as const, color: C.blue,   bg: C.blueDim   },
  past_question: { label: 'Past Questions', icon: 'document-text-outline' as const, color: C.red,    bg: C.redDim    },
  tutorial:      { label: 'Tutorials',      icon: 'school-outline'         as const, color: C.green,  bg: C.greenDim  },
  book:          { label: 'Books',          icon: 'book-outline'           as const, color: C.purple, bg: C.purpleDim },
  other:         { label: 'Other',          icon: 'folder-outline'         as const, color: C.gold,   bg: C.goldDim   },
}

const FILTER_TABS = [
  { key: 'all',           label: 'All',            emoji: '📚' },
  { key: 'slide',         label: 'Slides',         emoji: '📊' },
  { key: 'past_question', label: 'Past Qs',        emoji: '📝' },
  { key: 'tutorial',      label: 'Tutorials',      emoji: '👨‍🏫' },
  { key: 'book',          label: 'Books',          emoji: '📖' },
  { key: 'other',         label: 'Other',          emoji: '📁' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Material {
  id: string
  title: string
  file_url: string
  type: string
  created_at: string
  course_id?: string
  uploader_name?: string
  size_bytes?: number
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
  item, index, isBookmarked, isDownloaded, onOpen, onSave,
}: {
  item: Material
  index: number
  isBookmarked: boolean
  isDownloaded: boolean
  onOpen: () => void
  onSave: () => void
}) {
  const cfg = TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.other

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

          {isDownloaded && (
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
  item, index, isNew, isBookmarked, isDownloaded, isSyncing, onOpen, onChat, onToggleBookmark, onDownload, onQuiz,
}: {
  item: Material
  index: number
  isNew: boolean
  isBookmarked: boolean
  isDownloaded: boolean
  isSyncing: boolean
  onOpen: () => void
  onChat: () => void
  onToggleBookmark: () => void
  onDownload: () => void
  onQuiz: () => void
}) {
  const cfg = TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.other

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
            {isDownloaded && (
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{
              backgroundColor: cfg.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
            }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
            </View>
            {item.uploader_name && (
              <Text style={{ fontSize: 11, color: C.textMute }} numberOfLines={1}>
                by {item.uploader_name}
              </Text>
            )}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity onPress={onDownload} style={S.iconBtn} disabled={isSyncing || isDownloaded}>
            {isSyncing 
              ? <ActivityIndicator size="small" color={C.textSub} />
              : <Ionicons
                  name={isDownloaded ? 'cloud-done' : 'cloud-download-outline'}
                  size={18}
                  color={isDownloaded ? C.green : C.textMute}
                />
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={onToggleBookmark} style={S.iconBtn}>
            <Ionicons
              name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={isBookmarked ? C.orange : C.textMute}
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: C.raised, borderRadius: 10, paddingVertical: 8, borderWidth: 1, borderColor: C.border }}
          onPress={onChat} activeOpacity={0.75}
        >
          <Ionicons name="chatbubble-outline" size={13} color={C.textSub} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.textSub }}>Ask AI</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: C.orangeDim, borderRadius: 10, paddingVertical: 8, borderWidth: 1, borderColor: C.orange + '30' }}
          onPress={onQuiz} activeOpacity={0.75}
        >
          <Ionicons name="flash-outline" size={13} color={C.orange} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.orange }}>Quiz me</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function guessType(url: string): string {
  return 'other'
}

async function fetchMaterials(classId: string): Promise<Material[]> {
  // 1. Get all courses for this class
  const { data: courses, error: courseError } = await supabase
    .from('courses')
    .select('id')
    .eq('class_id', classId)

  if (courseError) throw courseError
  if (!courses || courses.length === 0) return []

  const courseIds = courses.map(c => c.id)

  // 2. Fetch published materials for those courses
  const { data, error } = await supabase
    .from('materials')
    .select('id, title, file_url, type, created_at, course_id, uploader_name, size_bytes')
    .in('course_id', courseIds)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return (data ?? []).map(m => ({ ...m, type: m.type || guessType(m.file_url ?? '') }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function NewMaterialsScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()

  const [ready, setReady]                     = useState(false)
  const [allMaterials, setAllMaterials]       = useState<Material[]>([])
  const [refreshing, setRefreshing]           = useState(false)
  const [isOnline, setIsOnline]               = useState(true)
  const [newIds, setNewIds]                   = useState<Set<string>>(new Set())
  const [filter, setFilter]                   = useState('all')
  const [search, setSearch]                   = useState('')
  const [classId, setClassId]                 = useState<string | null>(null)
  const [userId, setUserId]                   = useState<string | null>(null)
  const classIdRef = useRef<string | null>(null)
  const userIdRef  = useRef<string | null>(null)

  const heroOpacity = useRef(new Animated.Value(0)).current
  const heroY       = useRef(new Animated.Value(12)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(heroY,       { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start()
  }, [heroOpacity, heroY])

  const { downloadedIds } = useDownloadRegistry()
  const { 
    bookmarkedIds, 
    toggleBookmark: hookToggleBookmark, 
    downloadMaterial, 
    isSyncing 
  } = useMaterialsActions(userId)

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const uid = user?.id ?? null
        userIdRef.current = uid
        if (!cancelled) setUserId(uid)

        const storedClassId = await AsyncStorage.getItem('active_class_id')
        if (!storedClassId) { setReady(true); return }
        classIdRef.current = storedClassId
        setClassId(storedClassId)

        const raw = await AsyncStorage.getItem(`${CACHE_KEY}:${storedClassId}`)
        const cached: Material[] = raw ? JSON.parse(raw) : []

        const seenRaw = await AsyncStorage.getItem(`${SEEN_KEY}:${storedClassId}`)
        const seenArr: string[] = seenRaw ? JSON.parse(seenRaw) : []
        const seenSet = new Set(seenArr)

        if (!cancelled && cached.length > 0) {
          applyMaterials(cached, seenSet)
        }
        setReady(true)

        try {
          const live = await fetchMaterials(storedClassId)
          if (!cancelled) {
            await AsyncStorage.setItem(`${CACHE_KEY}:${storedClassId}`, JSON.stringify(live))
            applyMaterials(live, seenSet)
            setIsOnline(true)
          }
        } catch {
          if (!cancelled) setIsOnline(false)
        }

        setTimeout(async () => {
          if (cancelled) return
          const allIds = classIdRef.current
            ? (await AsyncStorage.getItem(`${CACHE_KEY}:${classIdRef.current}`)
                .then(r => (r ? (JSON.parse(r) as Material[]).map(m => m.id) : [])))
            : []
          const merged = [...new Set([...seenArr, ...allIds])]
          if (classIdRef.current)
            await AsyncStorage.setItem(`${SEEN_KEY}:${classIdRef.current}`, JSON.stringify(merged))
          if (!cancelled) setNewIds(new Set())
        }, 3000)
      } catch (e) {
        console.warn('[NewMaterials] bootstrap error', e)
        if (!cancelled) setReady(true)
      }
    }
    bootstrap()
    return () => { cancelled = true }
  }, [])

  function applyMaterials(materials: Material[], seenSet: Set<string>) {
    setAllMaterials(materials)
    setNewIds(new Set(materials.filter(m => !seenSet.has(m.id)).map(m => m.id)))
  }

  const onRefresh = useCallback(async () => {
    const cid = classIdRef.current
    if (!cid || !isOnline) return
    setRefreshing(true)
    try {
      const live = await fetchMaterials(cid)
      await AsyncStorage.setItem(`${CACHE_KEY}:${cid}`, JSON.stringify(live))
      const seenRaw = await AsyncStorage.getItem(`${SEEN_KEY}:${cid}`)
      const seenSet = new Set<string>(seenRaw ? JSON.parse(seenRaw) : [])
      applyMaterials(live, seenSet)
    } catch {
      Alert.alert('Refresh failed', 'Could not fetch latest materials.')
    } finally {
      setRefreshing(false)
    }
  }, [isOnline])

  const openMaterial = useCallback((item: Material) => {
    router.push({
      pathname: '/viewer' as any,
      params: { material_id: item.id, title: item.title, file_url: item.file_url, type: item.type },
    })
  }, [router])

  const openQuiz = useCallback((item: Material) => {
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

  const onToggleBookmark = useCallback((item: Material) => hookToggleBookmark(item.id), [hookToggleBookmark])
  const onDownload = useCallback((item: Material) => downloadMaterial(item as any), [downloadMaterial])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of allMaterials) {
      c[m.type] = (c[m.type] ?? 0) + 1
    }
    return c
  }, [allMaterials])

  const featured = useMemo(() => allMaterials.slice(0, 5), [allMaterials])

  const displayed = useMemo(() => {
    let list = allMaterials
    if (filter !== 'all') list = list.filter(m => m.type === filter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(m => m.title.toLowerCase().includes(q))
    }
    return list
  }, [allMaterials, filter, search])

  const showSkeletons = !ready
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

      {!isOnline && allMaterials.length > 0 && <OfflineBanner />}

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
            : `${allMaterials.length} material${allMaterials.length !== 1 ? 's' : ''} available`
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
          refreshControl={
            isOnline ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.orange} colors={[C.orange]} />
            ) : undefined
          }
          ListHeaderComponent={
            featured.length > 0 && filter === 'all' && !search ? (
              <View style={{ marginBottom: 20 }}>
                <SectionHead title="Featured Materials" link="See all" />
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
                      isDownloaded={downloadedIds.has(item.id)}
                      onOpen={() => openMaterial(item)}
                      onSave={() => onToggleBookmark(item)}
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
                  name={!isOnline && allMaterials.length === 0 ? 'cloud-offline-outline' : 'library-outline'}
                  size={32} color={C.textMute}
                />
              </View>
              <Text style={S.emptyTitle}>
                {!isOnline && allMaterials.length === 0 ? 'No cached materials'
                  : search.trim() ? 'No results found'
                  : filter !== 'all' ? `No ${TYPE_CONFIG[filter as keyof typeof TYPE_CONFIG]?.label ?? filter} yet`
                  : 'No materials yet'}
              </Text>
              <Text style={S.emptySub}>
                {!isOnline && allMaterials.length === 0
                  ? 'Connect to the internet to load class materials for the first time.'
                  : search.trim() ? `No materials match "${search}".`
                  : 'Pull down to refresh.'}
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
              isDownloaded={downloadedIds.has(item.id)}
              isSyncing={isSyncing}
              onOpen={() => openMaterial(item)}
              onChat={() => router.push({
                pathname: '/chat' as any,
                params: { material_title: item.title, file_url: item.file_url, material_id: item.id },
              })}
              onToggleBookmark={() => onToggleBookmark(item)}
              onDownload={() => onDownload(item)}
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