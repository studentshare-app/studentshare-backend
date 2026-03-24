/**
 * app/materials.tsx — Materials List (Offline-First)
 *
 * MONETISATION RULES (strictly enforced):
 *  • Viewing materials (tapping a card) → FREE for all users, always loads online
 *  • Download button → PREMIUM ONLY
 *  • Quiz & Flashcard button → navigates to /quiz-flashcards with auto_generate=1
 *
 * OFFLINE BEHAVIOUR:
 *  M1  AsyncStorage cache for fast list rendering on return visits
 *  M2  Amber offline banner shown when offline with cached data
 *  M3  Pull-to-refresh disabled when offline
 *  M4  Download blocked offline regardless of premium status
 *  M5  Error banner below hero (non-blocking, with Retry)
 *
 * LEADERBOARD:
 *  L1  Every successful download writes a row to material_downloads
 *      (user_id, material_id, downloaded_at=now())
 *      This is the source of truth for download-based leaderboard points.
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery } from '@tanstack/react-query'
import * as FileSystem from 'expo-file-system/legacy'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { registerDownload } from '../hooks/useOfflineFile'
import { supabase } from '../lib/supabase'
import {
  addBookmark,
  fetchBookmarkedIds,
  fetchMaterials,
  removeBookmark,
} from '../lib/queries/screens'
import {
  registryAdd,
  useDownloadRegistry,
} from '../lib/useDownloadRegistry'
import { usePremium } from '../contexts/PremiumContext'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Material = {
  id:              string
  title:           string
  type:            string
  file_url:        string
  is_premium:      boolean
  created_at:      string
  download_count?: number
}

const DOWNLOAD_DIR = FileSystem.documentDirectory + 'downloads/'

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────────────────────
function materialsCacheKey(
  courseId: string, type: string,
  academicYear?: string, lecturerId?: string,
): string {
  return `studentshare_materials_${courseId}_${type}_${academicYear ?? ''}_${lecturerId ?? ''}`
}

function safeParseMaterials(raw: string | null): Material[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function localFilePath(materialId: string, fileUrl: string): string {
  const ext = fileUrl.split('.').pop()?.split('?')[0] || 'pdf'
  return DOWNLOAD_DIR + materialId + '.' + ext
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline Banner
// ─────────────────────────────────────────────────────────────────────────────
function OfflineBanner() {
  return (
    <View style={bannerStyles.wrap}>
      <Ionicons name="cloud-offline-outline" size={13} color="#92400E" />
      <Text style={bannerStyles.text}>Offline — showing cached materials</Text>
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
// Premium Gate Modal
// ─────────────────────────────────────────────────────────────────────────────
function PremiumGateModal({ visible, onClose, onUpgrade }: {
  visible: boolean
  onClose: () => void
  onUpgrade: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" presentationStyle="overFullScreen">
      <View style={gateS.overlay}>
        <View style={gateS.sheet}>
          <View style={gateS.iconBox}>
            <Ionicons name="star" size={34} color="#F59E0B" />
          </View>
          <Text style={gateS.title}>Premium Required</Text>
          <Text style={gateS.sub}>
            Downloading files for offline use is a{'\n'}
            <Text style={{ color: '#F59E0B', fontWeight: '700' }}>Premium-only</Text> feature.{'\n\n'}
            Upgrade now to save files to your device and access them anytime, even without internet.
          </Text>
          <TouchableOpacity style={gateS.upgradeBtn} onPress={onUpgrade} activeOpacity={0.85}>
            <Ionicons name="star" size={16} color="#0F172A" />
            <Text style={gateS.upgradeBtnText}>Upgrade to Premium</Text>
          </TouchableOpacity>
          <TouchableOpacity style={gateS.cancelBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={gateS.cancelBtnText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}
const gateS = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: '#0F172A', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 32, alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#1E293B' },
  iconBox:        { width: 76, height: 76, borderRadius: 22, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  title:          { fontSize: 22, fontWeight: '800', color: '#F8FAFC' },
  sub:            { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22 },
  upgradeBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F59E0B', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28, marginTop: 10, width: '100%', justifyContent: 'center' },
  upgradeBtnText: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  cancelBtn:      { paddingVertical: 12 },
  cancelBtnText:  { fontSize: 14, color: '#475569', fontWeight: '600' },
})

// ─────────────────────────────────────────────────────────────────────────────
// LockedIcon
// ─────────────────────────────────────────────────────────────────────────────
function LockedIcon({
  name, size, color, locked,
}: {
  name: string; size: number; color: string; locked: boolean
}) {
  return (
    <View style={{ position: 'relative' }}>
      <Ionicons name={name as any} size={size} color={color} />
      {locked && (
        <View style={lockedIconS.badge}>
          <Ionicons name="lock-closed" size={7} color="#fff" />
        </View>
      )}
    </View>
  )
}
const lockedIconS = StyleSheet.create({
  badge: {
    position: 'absolute', bottom: -3, right: -4,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: '#F59E0B',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#1E293B',
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Card
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonCard({ index, accent }: { index: number; accent: string }) {
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
    <Animated.View style={[skStyles.card, { opacity: pulse }]}>
      <View style={[skStyles.accent, { backgroundColor: accent + '60' }]} />
      <View style={[skStyles.icon, { backgroundColor: accent + '20' }]} />
      <View style={skStyles.info}>
        <View style={skStyles.title} />
        <View style={skStyles.sub} />
      </View>
      <View style={skStyles.actions}>
        <View style={[skStyles.btn, { backgroundColor: accent + '15' }]} />
        <View style={[skStyles.btn, { backgroundColor: accent + '15' }]} />
        <View style={[skStyles.btn, { backgroundColor: accent + '15' }]} />
        <View style={[skStyles.btn, { backgroundColor: accent + '15' }]} />
      </View>
    </Animated.View>
  )
}
const skStyles = StyleSheet.create({
  card:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#2D3748', gap: 12 },
  accent:  { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: 3 },
  icon:    { width: 46, height: 46, borderRadius: 13 },
  info:    { flex: 1, gap: 8 },
  title:   { height: 14, borderRadius: 7, backgroundColor: '#2D3748', width: '65%' },
  sub:     { height: 10, borderRadius: 5, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#2D3748', width: '40%' },
  actions: { flexDirection: 'column', gap: 6 },
  btn:     { width: 36, height: 36, borderRadius: 10 },
})

// ─────────────────────────────────────────────────────────────────────────────
// Animated Material Card
// ─────────────────────────────────────────────────────────────────────────────
function AnimatedCard({
  item, index, headerColor, downloading, isBookmarked, togglingBookmark,
  isPremium, isDownloadedOffline,
  onOpen, onDownload, onChat, onBookmark, onQuiz,
}: {
  item: Material; index: number; headerColor: string
  downloading: string | null; isBookmarked: boolean; togglingBookmark: string | null
  isPremium: boolean; isDownloadedOffline: boolean
  onOpen: () => void; onDownload: () => void; onChat: () => void
  onBookmark: () => void; onQuiz: () => void
}) {
  const opacity    = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(18)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 340, delay: Math.min(index, 8) * 55, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 340, delay: Math.min(index, 8) * 55, useNativeDriver: true }),
    ]).start()
  }, [])

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: headerColor }]}
        activeOpacity={0.75}
        onPress={onOpen}
      >
        <View style={[styles.cardIcon, { backgroundColor: headerColor + '18' }]}>
          <Ionicons name="document-text" size={22} color={headerColor} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.cardMeta}>
            <Ionicons name="calendar-outline" size={12} color="#64748B" />
            <Text style={styles.cardMetaText}>{formatDate(item.created_at)}</Text>
            {item.is_premium && (
              <View style={styles.proBadge}>
                <Text style={styles.proText}>PRO</Text>
              </View>
            )}
            {isDownloadedOffline && (
              <View style={styles.offlineBadge}>
                <Ionicons name="cloud-offline-outline" size={10} color="#10B981" />
                <Text style={styles.offlineText}>Saved</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.cardActions}>
          {/* Bookmark */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isBookmarked ? '#2A1F00' : '#1E293B' }]}
            onPress={onBookmark}
          >
            {togglingBookmark === item.id
              ? <ActivityIndicator size="small" color="#F59E0B" />
              : <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={15} color="#F59E0B" />
            }
          </TouchableOpacity>

          {/* Download — premium gate */}
          <TouchableOpacity
            style={[
              styles.actionBtn,
              isDownloadedOffline ? { backgroundColor: '#0D2B1F' } : { backgroundColor: '#0F2412' },
            ]}
            onPress={onDownload}
          >
            {downloading === item.id ? (
              <ActivityIndicator size="small" color="#34D399" />
            ) : isDownloadedOffline ? (
              <Ionicons name="checkmark-circle" size={17} color="#34D399" />
            ) : (
              <LockedIcon name="download-outline" size={17} color="#34D399" locked={!isPremium} />
            )}
          </TouchableOpacity>

          {/* AI Chat */}
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#0F1629' }]} onPress={onChat}>
            <Ionicons name="sparkles" size={15} color="#60A5FA" />
          </TouchableOpacity>

          {/* Quiz & Flashcards */}
          <TouchableOpacity style={[styles.actionBtn, styles.quizBtn]} onPress={onQuiz}>
            <Ionicons name={"school-outline" as any} size={15} color="#7C3AED" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function MaterialsScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const { isOnline, isOffline } = useNetworkStatus()

  const {
    course_id, course_name, type, color,
    academic_year, lecturer_id, lecturer,
  } = useLocalSearchParams<{
    course_id: string; course_name: string; type: string; color: string
    academic_year: string; lecturer_id: string; lecturer: string
  }>()

  const headerColor = color || '#1A56DB'
  const cacheKey    = materialsCacheKey(course_id, type, academic_year, lecturer_id)

  const [downloading,       setDownloading]       = useState<string | null>(null)
  const [userId,            setUserId]            = useState<string | null>(null)
  const [showPremModal,     setShowPremModal]     = useState(false)
  const [bookmarkedIds,     setBookmarkedIds]     = useState<Set<string>>(new Set())
  const [togglingBookmark,  setTogglingBookmark]  = useState<string | null>(null)
  const [cachedMaterials,   setCachedMaterials]   = useState<Material[]>([])
  const [cacheReady,        setCacheReady]        = useState(false)
  const [refreshing,        setRefreshing]        = useState(false)

  const { isPremium } = usePremium()
  const { downloadedIds } = useDownloadRegistry()

  const heroOpacity = useRef(new Animated.Value(0)).current
  const heroY       = useRef(new Animated.Value(-10)).current

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const bootstrap = async () => {
      const raw    = await AsyncStorage.getItem(cacheKey).catch(() => null)
      const parsed = safeParseMaterials(raw)
      if (parsed.length > 0) setCachedMaterials(parsed)
      setCacheReady(true)

      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(heroY,       { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start()

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setUserId(session.user.id)
          fetchBookmarkedIds(session.user.id).then(setBookmarkedIds).catch(() => {})
          await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true }).catch(() => {})
        }
      } catch {}
    }
    bootstrap()
  }, [cacheKey])

  useFocusEffect(useCallback(() => {
    if (userId) fetchBookmarkedIds(userId).then(setBookmarkedIds).catch(() => {})
  }, [userId]))

  // ── React Query ────────────────────────────────────────────────────────────
  const { data: materials = [], isLoading, isError, error, refetch } = useQuery({
    queryKey:  ['materials', course_id, type, academic_year, lecturer_id],
    queryFn:   async () => {
      const result = await fetchMaterials({
        courseId:     course_id,
        type,
        academicYear: academic_year,
        lecturerId:   lecturer_id,
      })
      void AsyncStorage.setItem(cacheKey, JSON.stringify(result)).catch(() => {})
      setCachedMaterials(result as Material[])
      return result
    },
    enabled:         cacheReady,
    staleTime:       5 * 60 * 1000,
    gcTime:          30 * 60 * 1000,
    placeholderData: cachedMaterials.length > 0 ? cachedMaterials as any : undefined,
  })

  const effectiveMaterials: Material[] =
    (materials as Material[]).length > 0 ? (materials as Material[]) : cachedMaterials

  const showSkeletons = isLoading && effectiveMaterials.length === 0

  const onRefresh = async () => {
    if (!isOnline) return
    setRefreshing(true)
    await refetch().catch(() => {})
    setRefreshing(false)
  }

  // ── File open ─────────────────────────────────────────────────────────────
  function openFile(material: Material) {
    const filePath      = localFilePath(material.id, material.file_url)
    const isOfflineCopy = downloadedIds.has(material.id)

    router.push({
      pathname: '/viewer',
      params: {
        file_url:    isOffline && isOfflineCopy ? filePath : material.file_url,
        title:       material.title,
        color:       headerColor,
        material_id: material.id,
        is_local:    isOffline && isOfflineCopy ? '1' : '0',
      },
    })
  }

  // ── Download ──────────────────────────────────────────────────────────────
  async function downloadFile(material: Material) {
    if (!isOnline) {
      Alert.alert('You are offline 📡', 'You need an internet connection to download files.')
      return
    }
    if (!isPremium) {
      setShowPremModal(true)
      return
    }

    try {
      setDownloading(material.id)
      const filePath = localFilePath(material.id, material.file_url)

      if (downloadedIds.has(material.id)) {
        const info = await FileSystem.getInfoAsync(filePath)
        if (info.exists) {
          Alert.alert('Already Saved', 'This file is already saved on your device for offline use.')
          setDownloading(null)
          return
        }
      }

      const result = await FileSystem.downloadAsync(material.file_url, filePath)

      if (result.status === 200) {
        await registerDownload(material.id, filePath)

        if (userId) {
          // Legacy downloads table (kept for backward compatibility)
          await supabase.from('downloads').upsert({ user_id: userId, material_id: material.id })

          // ── LEADERBOARD: record each download for scoring ──────────────────
          // Each row = one download event. downloaded_at defaults to now().
          // The leaderboard snapshot function counts these to award +2 pts each.
          await supabase.from('material_downloads').insert({
            user_id:     userId,
            material_id: material.id,
          })
          // ──────────────────────────────────────────────────────────────────
        }

        registryAdd(material.id)
        Alert.alert('Downloaded!', `"${material.title}" saved for offline access.`)
      } else {
        await FileSystem.deleteAsync(filePath, { idempotent: true })
        Alert.alert('Download failed', 'Could not save the file. Please try again.')
      }
    } catch {
      Alert.alert('Error', 'Could not download file. Please try again.')
    } finally {
      setDownloading(null)
    }
  }

  // ── Bookmark ──────────────────────────────────────────────────────────────
  async function toggleBookmark(material: Material) {
    if (!userId) return
    setTogglingBookmark(material.id)
    try {
      if (bookmarkedIds.has(material.id)) {
        await removeBookmark(userId, material.id)
        setBookmarkedIds(prev => { const s = new Set(prev); s.delete(material.id); return s })
      } else {
        await addBookmark(userId, material.id)
        setBookmarkedIds(prev => new Set(prev).add(material.id))
      }
    } catch {
      Alert.alert('Error', 'Could not update bookmark.')
    } finally {
      setTogglingBookmark(null)
    }
  }

  // ── Quiz navigation ───────────────────────────────────────────────────────
  function openQuiz(material: Material) {
    router.push({
      pathname: '/quiz-flashcards' as any,
      params: {
        material_id:   material.id,
        title:         material.title,
        file_url:      material.file_url,
        type:          material.type,
        auto_generate: '1',
      },
    })
  }

  const badgeLabel = lecturer || academic_year || null
  const badgeIcon: any = lecturer ? 'person' : 'calendar'

  return (
    <View style={styles.container}>

      <PremiumGateModal
        visible={showPremModal}
        onClose={() => setShowPremModal(false)}
        onUpgrade={() => {
          setShowPremModal(false)
          router.push('/subscription' as any)
        }}
      />

      {isOffline && effectiveMaterials.length > 0 && <OfflineBanner />}

      {/* ── Hero ── */}
      <Animated.View
        style={[
          styles.hero,
          { paddingTop: insets.top + 12 },
          { opacity: heroOpacity, transform: [{ translateY: heroY }] },
        ]}
      >
        <View style={[styles.glow, { backgroundColor: headerColor }]} />
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#E2E8F0" />
        </TouchableOpacity>
        <View style={[styles.heroIcon, { backgroundColor: headerColor + '30', borderColor: headerColor + '50' }]}>
          <Ionicons name="document-text" size={28} color={headerColor} />
        </View>
        <Text style={styles.heroTitle}>{course_name}</Text>
        {badgeLabel && (
          <View style={styles.heroBadge}>
            <Ionicons name={badgeIcon} size={12} color="#CBD5E1" />
            <Text style={styles.heroBadgeText}>{badgeLabel}</Text>
          </View>
        )}
        <Text style={styles.heroSub}>
          {showSkeletons
            ? 'Loading materials…'
            : `${effectiveMaterials.length} material${effectiveMaterials.length !== 1 ? 's' : ''} available`
          }
        </Text>
        <View style={styles.heroDivider}>
          <View style={[styles.heroDividerLine, { backgroundColor: headerColor + '60' }]} />
          <View style={[styles.heroDividerDot, { backgroundColor: headerColor }]} />
          <View style={[styles.heroDividerLine, { backgroundColor: headerColor + '60' }]} />
        </View>
      </Animated.View>

      {isError && (
        <View style={styles.errorBanner}>
          <Ionicons name="wifi-outline" size={16} color="#FCA5A5" />
          <Text style={styles.errorBannerText} numberOfLines={1}>
            {(error as Error)?.message?.includes('network')
              ? 'No internet — showing cached materials'
              : 'Could not refresh — showing cached materials'}
          </Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryBannerBtn}>
            <Text style={styles.retryBannerText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── List ── */}
      <FlatList
        data={showSkeletons ? (Array(5).fill(null) as null[]) : effectiveMaterials}
        keyExtractor={(item, index) => item ? (item as Material).id : `skel_${index}`}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={isOnline ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={headerColor}
            colors={[headerColor]}
          />
        ) : undefined}
        ListEmptyComponent={
          !showSkeletons ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIconBox, { backgroundColor: headerColor + '18' }]}>
                <Ionicons
                  name={isOffline ? 'cloud-offline-outline' : 'document-outline'}
                  size={32}
                  color={headerColor}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {isOffline ? 'No cached materials' : 'No materials yet'}
              </Text>
              <Text style={styles.emptySub}>
                {isOffline
                  ? 'Connect to the internet to load materials for this course.'
                  : `No materials have been uploaded for ${lecturer ? lecturer : academic_year ? academic_year : 'this course'} yet.`
                }
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          if (!item) return <SkeletonCard index={index} accent={headerColor} />
          const mat = item as Material
          return (
            <AnimatedCard
              item={mat}
              index={index}
              headerColor={headerColor}
              downloading={downloading}
              isBookmarked={bookmarkedIds.has(mat.id)}
              togglingBookmark={togglingBookmark}
              isPremium={isPremium}
              isDownloadedOffline={downloadedIds.has(mat.id)}
              onOpen={() => openFile(mat)}
              onDownload={() => downloadFile(mat)}
              onChat={() => router.push({
                pathname: '/chat',
                params: {
                  material_title: mat.title,
                  file_url:       mat.file_url,
                  material_id:    mat.id,
                },
              })}
              onBookmark={() => toggleBookmark(mat)}
              onQuiz={() => openQuiz(mat)}
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
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },

  hero:            { backgroundColor: '#161F2E', paddingHorizontal: 24, paddingBottom: 28, overflow: 'hidden' },
  glow:            { position: 'absolute', width: 220, height: 220, borderRadius: 110, top: -80, right: -60, opacity: 0.12 },
  backBtn:         { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', justifyContent: 'center', alignItems: 'center', marginBottom: 20, alignSelf: 'flex-start' },
  heroIcon:        { width: 56, height: 56, borderRadius: 16, borderWidth: 1, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  heroTitle:       { fontSize: 24, fontWeight: '700', color: '#F1F5F9', marginBottom: 8, letterSpacing: -0.3 },
  heroBadge:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.07)', alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  heroBadgeText:   { fontSize: 12, fontWeight: '600', color: '#CBD5E1' },
  heroSub:         { fontSize: 14, color: '#64748B' },
  heroDivider:     { flexDirection: 'row', alignItems: 'center', marginTop: 22, gap: 6 },
  heroDividerLine: { flex: 1, height: 1 },
  heroDividerDot:  { width: 5, height: 5, borderRadius: 3 },

  errorBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.12)', borderBottomWidth: 1, borderBottomColor: 'rgba(239,68,68,0.2)', paddingHorizontal: 16, paddingVertical: 10 },
  errorBannerText: { flex: 1, fontSize: 12, color: '#FCA5A5' },
  retryBannerBtn:  { backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  retryBannerText: { fontSize: 12, fontWeight: '700', color: '#FCA5A5' },

  list: { paddingHorizontal: 16, paddingTop: 16 },

  card:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 3, gap: 12 },
  cardIcon:      { width: 46, height: 46, borderRadius: 13, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  cardInfo:      { flex: 1 },
  cardTitle:     { fontSize: 14, fontWeight: '600', color: '#F1F5F9', marginBottom: 5, lineHeight: 20 },
  cardMeta:      { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  cardMetaText:  { fontSize: 12, color: '#64748B', marginRight: 6 },
  proBadge:      { backgroundColor: '#451A03', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  proText:       { fontSize: 10, fontWeight: '700', color: '#FCD34D' },
  offlineBadge:  { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#0D2B1F', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  offlineText:   { fontSize: 10, fontWeight: '700', color: '#34D399' },
  cardActions:   { flexDirection: 'column', gap: 6, flexShrink: 0 },
  actionBtn:     { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  quizBtn:       { backgroundColor: '#1A0A2E' },

  empty:        { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIconBox: { width: 68, height: 68, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: '#E2E8F0', marginBottom: 6 },
  emptySub:     { fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 20 },
})