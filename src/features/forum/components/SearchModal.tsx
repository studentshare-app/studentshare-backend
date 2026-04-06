import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  ActivityIndicator
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'

const T = {
  bg: '#000000',
  bg3: '#202327',
  border: '#2f3336',
  text: '#e7e9ea',
  muted: '#71767b',
  accent: '#1DA1F2',
} as const

type TrendingTag = { tag: string; count: number }
type WhoItem = { id: string; full_name: string; forum_handle: string }

export function SearchModal({
  visible,
  onClose,
  initialQuery = '',
  currentUserId,
}: {
  visible: boolean
  onClose: () => void
  initialQuery?: string
  currentUserId?: string | null
}) {
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState(initialQuery)
  const inputRef = useRef<TextInput>(null)
  
  const [loading, setLoading] = useState(false)
  const [tags, setTags] = useState<TrendingTag[]>([])
  const [who, setWho] = useState<WhoItem[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: tagData } = await supabase.rpc('sq_get_trending_tags', { limit_count: 5 })
      if (tagData) setTags(tagData)
      
      if (currentUserId) {
        const { data: whoData } = await supabase.rpc('sq_get_who_to_follow', { current_user_id: currentUserId, limit_count: 4 })
        if (whoData) setWho(whoData)
      }
    } catch (e) {
    } finally {
      setLoading(false)
    }
  }, [currentUserId])

  useEffect(() => {
    if (visible) {
      setQuery(initialQuery)
      loadData()
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [visible, initialQuery, loadData])

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top > 0 ? insets.top : 16 }]}>
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose}>
            <Ionicons name="arrow-back" size={20} color={T.text} />
          </TouchableOpacity>
          <View style={styles.inputWrap}>
            <Ionicons name="search" size={16} color={T.muted} style={{ marginRight: 8 }} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Search StudentSquare"
              placeholderTextColor={T.muted}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={17} color={T.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          {query.length === 0 ? (
            <View style={styles.exploreSection}>
              {loading ? (
                <ActivityIndicator size="small" color={T.accent} style={{ marginTop: 40 }} />
              ) : (
                <>
                  <Text style={styles.sectionTitle}>Trending Tags</Text>
                  {tags.length > 0 ? tags.map((t, i) => (
                    <TouchableOpacity key={i} style={styles.trendItem} onPress={() => setQuery(t.tag)}>
                      <Text style={styles.trendCat}>Trending</Text>
                      <Text style={styles.trendTag}>{t.tag}</Text>
                      <Text style={styles.trendCount}>{t.count} posts</Text>
                    </TouchableOpacity>
                  )) : (
                    <Text style={styles.emptyText}>No tags trending yet.</Text>
                  )}

                  {currentUserId && (
                    <>
                      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Who to Follow</Text>
                      {who.length > 0 ? who.map((w, i) => (
                        <View key={i} style={styles.whoItem}>
                          <View style={styles.whoAvi}>
                            <Ionicons name="person" size={16} color="#fff" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.whoName}>{w.full_name}</Text>
                            <Text style={styles.whoHandle}>@{w.forum_handle}</Text>
                          </View>
                          <TouchableOpacity style={styles.followBtn}>
                            <Text style={styles.followBtnText}>Follow</Text>
                          </TouchableOpacity>
                        </View>
                      )) : (
                        <Text style={styles.emptyText}>No suggestions available.</Text>
                      )}
                    </>
                  )}
                </>
              )}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🔍</Text>
              <Text style={styles.emptyTitle}>Search StudentSquare</Text>
              <Text style={styles.emptySub}>Results for "{query}"</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: T.bg3, justifyContent: 'center', alignItems: 'center' },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: T.bg3, borderWidth: 1, borderColor: T.border, borderRadius: 14, paddingHorizontal: 14, minHeight: 48 },
  input: { flex: 1, fontSize: 16, color: T.text },
  exploreSection: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: T.text, marginBottom: 16 },
  trendItem: { marginBottom: 16 },
  trendCat: { fontSize: 13, color: T.muted },
  trendTag: { fontSize: 15, fontWeight: '700', color: T.text, marginVertical: 3 },
  trendCount: { fontSize: 13, color: T.muted },
  whoItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  whoAvi: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.accent, justifyContent: 'center', alignItems: 'center' },
  whoName: { fontSize: 15, fontWeight: '700', color: T.text },
  whoHandle: { fontSize: 13, color: T.muted },
  followBtn: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 6 },
  followBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  emptyText: { color: T.muted, fontSize: 14 },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 36 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: T.text, marginBottom: 8 },
  emptySub: { fontSize: 14, lineHeight: 22, color: T.muted, textAlign: 'center' },
})
