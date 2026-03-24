import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { fetchConversations, type Conversation } from '../lib/queries/conversations'

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  void:      '#07080C',
  deep:      '#0B0D13',
  surface:   '#10131C',
  raised:    '#161B27',
  border:    'rgba(255,255,255,0.055)',
  text:      '#EEF0F8',
  textSub:   '#6E7A96',
  textMute:  '#353D52',
  orange:    '#E8692A',
  orangeDim: 'rgba(232,105,42,0.10)',
} as const

const USER_ID_CACHE_KEY = 'studentshare_user_id_cache'

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

// ── Conversation card ────────────────────────────────────────────────────────
function ConvCard({
  conv,
  index,
  onPress,
  onLongPress,
}: {
  conv: Conversation
  index: number
  onPress: () => void
  onLongPress: () => void
}) {
  const opacity    = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(12)).current
  const isGeneral  = !conv.material_title || conv.material_title === 'General Assistant'

  useState(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 280, delay: index * 40, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, delay: index * 40, useNativeDriver: true }),
    ]).start()
  })

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.75}
      >
        <View style={styles.cardAccent} />
        <View style={styles.cardIcon}>
          <Ionicons
            name={isGeneral ? 'sparkles' : 'document-text'}
            size={18}
            color={C.orange}
          />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={1}>{conv.title}</Text>
          {conv.last_message ? (
            <Text style={styles.cardPreview} numberOfLines={1}>{conv.last_message}</Text>
          ) : null}
          <View style={styles.cardMeta}>
            {!isGeneral && conv.material_title && (
              <>
                <View style={styles.sourcePill}>
                  <Text style={styles.sourceText} numberOfLines={1}>
                    {conv.material_title}
                  </Text>
                </View>
                <Text style={styles.metaDot}>·</Text>
              </>
            )}
            <Text style={styles.timeText}>{timeAgo(conv.updated_at)}</Text>
          </View>
        </View>
        <View style={styles.arrowBox}>
          <Ionicons name="chevron-forward" size={14} color={C.textMute} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function ConversationsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // conversations is the single source of truth — seeded from cache immediately
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [ready,         setReady]         = useState(false) // true once cache read done
  const userIdRef = useRef<string | null>(null)

  const headerOpacity = useRef(new Animated.Value(0)).current
  const headerY       = useRef(new Animated.Value(-8)).current

  // ── Step 1: Read cache synchronously before first render ──────────────────
  // Runs once on mount — reads both userId and conversations from AsyncStorage
  // so the list is populated before the screen even animates in
  useEffect(() => {
    const bootstrap = async () => {
      const [cachedId, rawConvs] = await Promise.all([
        AsyncStorage.getItem(USER_ID_CACHE_KEY).catch(() => null),
        AsyncStorage.getItem('conversations').catch(() => null),
      ])

      // Seed conversations from cache instantly — no network needed
      if (rawConvs) {
        try {
          const cached: Conversation[] = JSON.parse(rawConvs)
          if (cached.length > 0) setConversations(cached)
        } catch {}
      }

      if (cachedId) userIdRef.current = cachedId
      setReady(true)

      // Then fetch fresh data from network in background
      refreshConversations(cachedId)
    }
    bootstrap()
  }, [])

  // ── Step 2: Refresh from network (silent, background) ─────────────────────
  const refreshConversations = useCallback(async (cachedId?: string | null) => {
    try {
      // Resolve live userId
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id ?? cachedId ?? userIdRef.current
      if (!uid) return
      userIdRef.current = uid

      const fresh = await fetchConversations(uid)
      setConversations(fresh)
      // Keep AsyncStorage in sync
      await AsyncStorage.setItem('conversations', JSON.stringify(fresh)).catch(() => {})
    } catch {
      // Network failed — cached data already showing, nothing to do
    }
  }, [])

  // ── Step 3: Re-fetch on every focus so new chats appear immediately ────────
  useFocusEffect(
    useCallback(() => {
      Animated.parallel([
        Animated.timing(headerOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(headerY,       { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start()

      // Only refresh from network after cache is ready (avoid double-fetch on mount)
      if (ready) refreshConversations()
    }, [ready])
  )

  function startNewChat() {
    router.push({
      pathname: '/chat',
      params: { material_title: 'General Assistant', file_url: '', conversation_id: 'new' },
    })
  }

  function openConversation(conv: Conversation) {
    router.push({
      pathname: '/chat',
      params: {
        material_title: conv.material_title || 'General Assistant',
        file_url:        conv.file_url || '',
        conversation_id: conv.id,
      },
    })
  }

  async function deleteConversation(convId: string) {
    Alert.alert('Delete Conversation', 'Are you sure you want to delete this conversation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // Optimistic update
          const updated = conversations.filter(c => c.id !== convId)
          setConversations(updated)
          await AsyncStorage.setItem('conversations', JSON.stringify(updated))
          await AsyncStorage.removeItem(`messages_${convId}`)
          await supabase.from('conversations').delete().eq('id', convId)
        },
      },
    ])
  }

  // Don't render content at all until the AsyncStorage read is done
  // (this is near-instant — typically <10ms)
  if (!ready) return <View style={styles.container} />

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.header,
          { paddingTop: insets.top + 10 },
          { opacity: headerOpacity, transform: [{ translateY: headerY }] },
        ]}
      >
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color={C.textSub} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            <Text style={styles.headerAccent}>✦ </Text>
            Conversations
          </Text>
          <Text style={styles.headerSub}>
            {conversations.length > 0
              ? `${conversations.length} chat${conversations.length !== 1 ? 's' : ''}`
              : 'Your AI chat history'}
          </Text>
        </View>

        <TouchableOpacity style={styles.newBtn} onPress={startNewChat} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color={C.orange} />
        </TouchableOpacity>
      </Animated.View>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {conversations.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBox}>
            <Ionicons name="chatbubbles-outline" size={30} color={C.orange} />
          </View>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptySub}>Start a new chat to get help with your studies.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={startNewChat} activeOpacity={0.8}>
            <Ionicons name="sparkles" size={15} color="#fff" />
            <Text style={styles.emptyBtnText}>Start New Chat</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.dateDivider}>
            <Text style={styles.dateDividerText}>ALL CHATS</Text>
          </View>

          {conversations.map((conv, index) => (
            <ConvCard
              key={conv.id}
              conv={conv}
              index={index}
              onPress={() => openConversation(conv)}
              onLongPress={() => deleteConversation(conv.id)}
            />
          ))}
          <Text style={styles.hint}>Long press to delete a conversation</Text>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: C.deep,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    gap: 10,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
    fontFamily: 'serif',
  },
  headerAccent: {
    color: C.orange,
    fontStyle: 'italic',
  },
  headerSub: {
    fontSize: 11,
    color: C.textMute,
    letterSpacing: 0.2,
  },
  newBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: C.orangeDim,
    borderWidth: 1,
    borderColor: C.orange + '40',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  list: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },

  dateDivider: {
    alignItems: 'center',
    marginBottom: 20,
  },
  dateDividerText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.8,
    color: C.textMute,
    textTransform: 'uppercase',
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 2,
    borderRadius: 1,
    backgroundColor: C.orange,
    opacity: 0.6,
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.orangeDim,
    borderWidth: 1,
    borderColor: C.orange + '25',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardContent: { flex: 1, gap: 4, minWidth: 0 },
  cardTitle:   { fontSize: 13.5, fontWeight: '700', color: C.text, lineHeight: 18 },
  cardPreview: { fontSize: 12, color: C.textSub, lineHeight: 17 },
  cardMeta:    { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },

  sourcePill: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: C.orangeDim,
    borderWidth: 1,
    borderColor: C.orange + '20',
    maxWidth: 140,
  },
  sourceText: { fontSize: 10, fontWeight: '700', color: C.orange },
  metaDot:    { fontSize: 10, color: C.textMute },
  timeText:   { fontSize: 11, color: C.textMute },

  arrowBox: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  hint: {
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '500',
    color: C.textMute,
    marginTop: 8,
    letterSpacing: 0.2,
  },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: C.orangeDim,
    borderWidth: 1,
    borderColor: C.orange + '40',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    shadowColor: C.orange,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  emptySub:   { fontSize: 13, color: C.textMute, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.orange,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 13,
    marginTop: 8,
    shadowColor: C.orange,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
})