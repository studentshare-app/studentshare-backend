import type { Post } from '@/features/forum/types'
import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const T = {
  bg: '#000000',
  bg3: '#16181c',
  border: '#2f3336',
  text: '#e7e9ea',
  muted: '#71767b',
  accent: '#1DA1F2',
} as const

export function BookmarksModal({
  visible,
  onClose,
  userId,
  mapRowToPost,
  renderPost,
}: {
  visible: boolean
  onClose: () => void
  userId: string
  mapRowToPost: (row: any, myL: Set<string>, myR: Set<string>, myB: Set<string>) => Post
  renderPost: (post: Post) => ReactNode
}) {
  const insets = useSafeAreaInsets()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (visible && userId) void load()
  }, [visible, userId])

  const load = async () => {
    setLoading(true)

    // Fetch bookmarked post IDs
    const { data: bookmarks } = await supabase
      .from('sq_bookmarks')
      .select('post_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(60)

    if (!bookmarks || bookmarks.length === 0) {
      setPosts([])
      setLoading(false)
      return
    }

    const bookmarkedPostIds = bookmarks.map((b: any) => b.post_id as string)
    const myB = new Set<string>(bookmarkedPostIds)

    // Fetch the actual post data for those IDs
    const { data: postsData } = await supabase
      .from('sq_posts')
      .select('*, profiles(full_name, forum_handle, avatar_url, is_verified)')
      .in('id', bookmarkedPostIds)
      .order('created_at', { ascending: false })

    if (!postsData) {
      setPosts([])
      setLoading(false)
      return
    }

    // Fetch user's likes and reposts for these posts
    const [likedRes, repostRes] = await Promise.all([
      supabase.from('sq_likes').select('post_id').eq('user_id', userId).in('post_id', bookmarkedPostIds),
      supabase.from('sq_reposts').select('post_id').eq('user_id', userId).in('post_id', bookmarkedPostIds),
    ])

    const myL = new Set<string>((likedRes.data ?? []).map((r: any) => r.post_id as string))
    const myR = new Set<string>((repostRes.data ?? []).map((r: any) => r.post_id as string))

    setPosts(postsData.map((row: any) => mapRowToPost(row, myL, myR, myB)))
    setLoading(false)
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top > 0 ? insets.top : 16 }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="arrow-back" size={20} color={T.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Bookmarks</Text>
          <View style={{ width: 34 }} />
        </View>
        {loading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator color={T.accent} size="large" />
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={56} color={T.muted} style={{ marginBottom: 16 }} />
            <Text style={styles.emptyTitle}>Save posts for later</Text>
            <Text style={styles.emptySub}>Bookmark posts to easily find them again here.</Text>
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={p => p.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            ListHeaderComponent={
              <View style={styles.countRow}>
                <Text style={styles.countText}>{posts.length} saved post{posts.length !== 1 ? 's' : ''}</Text>
              </View>
            }
            renderItem={({ item }) => <>{renderPost(item)}</>}
          />
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  closeBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: T.bg3, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: T.text },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: T.text, marginBottom: 8 },
  emptySub: { fontSize: 15, color: T.muted, textAlign: 'center', lineHeight: 22 },
  countRow: { paddingHorizontal: 16, paddingVertical: 10 },
  countText: { fontSize: 13, fontWeight: '700', color: T.muted },
})
