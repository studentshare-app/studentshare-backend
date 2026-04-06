import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '@/core/api/supabase'
import { fetchBookmarks, removeBookmark, type BookmarkRecord } from '@/lib/queries/screens'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  past_question: { label: 'Past Question', color: '#3B82F6', icon: 'document-text' },
  slide:         { label: 'Slide',         color: '#8B5CF6', icon: 'easel' },
  book:          { label: 'Book',          color: '#10B981', icon: 'book' },
  tutorial:      { label: 'Tutorial',      color: '#F59E0B', icon: 'play-circle' },
}

const BOOKMARKS_CACHE_KEY = (userId: string) => `bookmarks_cache_${userId}`

export default function BookmarksScreen() {
  const router = useRouter()
  const { isOffline } = useNetworkStatus()

  const [bookmarks,   setBookmarks]   = useState<BookmarkRecord[]>([])
  const [loading,     setLoading]     = useState(true)
  const [userId,      setUserId]      = useState<string | null>(null)
  const [removing,    setRemoving]    = useState<string | null>(null)
  const [isFromCache, setIsFromCache] = useState(false)

  useFocusEffect(
    useCallback(() => {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) { setUserId(user.id); loadBookmarks(user.id) }
      })
    }, [])
  )

  async function loadBookmarks(uid: string) {
    setLoading(true)
    try {
      const raw = await AsyncStorage.getItem(BOOKMARKS_CACHE_KEY(uid))
      if (raw) {
        const cached = JSON.parse(raw) as BookmarkRecord[]
        if (cached.length > 0) { setBookmarks(cached); setIsFromCache(true); setLoading(false) }
      }
    } catch {}

    if (isOffline) { setLoading(false); return }

    try {
      const data = await fetchBookmarks(uid)
      setBookmarks(data)
      setIsFromCache(false)
      await AsyncStorage.setItem(BOOKMARKS_CACHE_KEY(uid), JSON.stringify(data))
    } catch (e) {
      console.error(e)
      if (bookmarks.length === 0) setBookmarks([])
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(bookmark: BookmarkRecord) {
    if (!userId) return
    if (isOffline) { Alert.alert('You are offline 📡', 'Connect to the internet to remove bookmarks.'); return }
    Alert.alert('Remove Bookmark', `Remove "${bookmark.material.title}" from saved?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setRemoving(bookmark.id)
        try {
          await removeBookmark(userId, bookmark.material_id)
          const updated = bookmarks.filter(b => b.id !== bookmark.id)
          setBookmarks(updated)
          await AsyncStorage.setItem(BOOKMARKS_CACHE_KEY(userId), JSON.stringify(updated))
        } catch { Alert.alert('Error', 'Could not remove bookmark.') }
        finally { setRemoving(null) }
      }},
    ])
  }

  // ── Quiz navigation ──────────────────────────────────────────────────────
  function openQuiz(bookmark: BookmarkRecord) {
    router.push({
      pathname: '/quiz-flashcards' as any,
      params: {
        material_id:   bookmark.material.id,
        title:         bookmark.material.title,
        file_url:      bookmark.material.file_url,
        type:          bookmark.material.type,
        auto_generate: '1',
      },
    })
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <View style={styles.container}>

      {/* ── Dark Hero ── */}
      <View style={styles.hero}>
        <View style={styles.circleTopRight} />
        <View style={styles.circleBottomLeft} />

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#E2E8F0" />
        </TouchableOpacity>

        <View style={styles.heroIcon}>
          <Ionicons name="bookmark" size={26} color="#F59E0B" />
        </View>
        <Text style={styles.heroTitle}>Saved Materials</Text>
        <Text style={styles.heroSub}>
          {loading && bookmarks.length === 0
            ? 'Loading...'
            : `${bookmarks.length} saved material${bookmarks.length !== 1 ? 's' : ''}`}
        </Text>
      </View>

      {/* ── Offline / cache banner ── */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={13} color="#92400E" />
          <Text style={styles.offlineBannerText}>Offline — showing saved bookmarks</Text>
        </View>
      )}
      {!isOffline && isFromCache && !loading && (
        <View style={styles.cacheBanner}>
          <Ionicons name="refresh-outline" size={13} color="#1D4ED8" />
          <Text style={styles.cacheBannerText}>Syncing your bookmarks…</Text>
        </View>
      )}

      {/* ── Content ── */}
      {loading && bookmarks.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#F59E0B" />
          <Text style={styles.loadingText}>Loading bookmarks...</Text>
        </View>
      ) : (
        <FlatList
          data={bookmarks}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconBox}>
                <Ionicons name={isOffline ? 'cloud-offline-outline' : 'bookmark-outline'} size={36} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>
                {isOffline ? 'No cached bookmarks' : 'No saved materials'}
              </Text>
              <Text style={styles.emptySub}>
                {isOffline
                  ? 'Connect to the internet to load your saved materials.'
                  : 'Tap the bookmark icon on any material to save it here for quick access.'}
              </Text>
              {!isOffline && (
                <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(tabs)/search' as any)} activeOpacity={0.8}>
                  <Ionicons name="search" size={14} color="#fff" />
                  <Text style={styles.emptyBtnText}>Browse Materials</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const meta = TYPE_META[item.material.type] || { label: item.material.type, color: '#6B7280', icon: 'document' }
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push({ pathname: '/viewer', params: { file_url: item.material.file_url, title: item.material.title, color: meta.color } })}
                activeOpacity={0.8}
              >
                <View style={[styles.cardIcon, { backgroundColor: meta.color + '15' }]}>
                  <Ionicons name={meta.icon as any} size={22} color={meta.color} />
                </View>

                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.material.title}</Text>
                  <View style={styles.cardMeta}>
                    <View style={[styles.typePill, { backgroundColor: meta.color + '15' }]}>
                      <Text style={[styles.typeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    {item.material.courses?.name && (
                      <Text style={styles.courseName} numberOfLines={1}>{item.material.courses.name}</Text>
                    )}
                  </View>
                  <Text style={styles.savedAt}>Saved {timeAgo(item.created_at)}</Text>
                </View>

                <View style={styles.cardActions}>
                  {/* AI Chat */}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#EFF6FF' }]}
                    onPress={() => router.push({ pathname: '/chat', params: { material_title: item.material.title, file_url: item.material.file_url, conversation_id: 'new' } })}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="sparkles" size={15} color="#1A56DB" />
                  </TouchableOpacity>

                  {/* Quiz & Flashcards */}
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnQuiz]}
                    onPress={() => openQuiz(item)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name={"school-outline" as any} size={15} color="#7C3AED" />
                  </TouchableOpacity>

                  {/* Remove bookmark */}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#FEF2F2' }]}
                    onPress={() => handleRemove(item)}
                    activeOpacity={0.75}
                  >
                    {removing === item.id
                      ? <ActivityIndicator size="small" color="#EF4444" />
                      : <Ionicons name="trash-outline" size={15} color="#EF4444" />
                    }
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  hero: {
    backgroundColor: '#0F172A',
    paddingTop: 60, paddingBottom: 28, paddingHorizontal: 24,
    position: 'relative', overflow: 'hidden',
  },
  circleTopRight: { position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(245,158,11,0.06)' },
  circleBottomLeft: { position: 'absolute', bottom: -30, left: -30, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(99,102,241,0.06)' },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', justifyContent: 'center', alignItems: 'center', marginBottom: 20, alignSelf: 'flex-start' },
  heroIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#F8FAFC', marginBottom: 4 },
  heroSub: { fontSize: 13, color: '#64748B' },

  offlineBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FEF3C7', paddingVertical: 7, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#FDE68A' },
  offlineBannerText: { fontSize: 12, fontWeight: '600', color: '#92400E' },
  cacheBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EFF6FF', paddingVertical: 7, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#BFDBFE' },
  cacheBannerText: { fontSize: 12, fontWeight: '600', color: '#1D4ED8' },

  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 14, color: '#64748B' },

  list: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },

  empty: { alignItems: 'center', paddingTop: 80, gap: 12, paddingHorizontal: 32 },
  emptyIconBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  emptySub: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1A56DB', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8 },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, gap: 12 },
  cardIcon: { width: 46, height: 46, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 6, lineHeight: 20 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  typePill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  typeText: { fontSize: 11, fontWeight: '700' },
  courseName: { fontSize: 12, color: '#94A3B8', flex: 1 },
  savedAt: { fontSize: 11, color: '#CBD5E1' },

  cardActions: { flexDirection: 'column', gap: 6 },
  actionBtn: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  actionBtnQuiz: { backgroundColor: '#EDE9FE' },
})
