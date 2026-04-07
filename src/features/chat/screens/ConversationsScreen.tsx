import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
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
import { useConversations } from '@/hooks/useLocalQueries'
import { OfflineBanner } from '@/components/OfflineBanner'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import database from '@/database'

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

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(ts: number | null | undefined) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

// ── Conversation card ────────────────────────────────────────────────────────
function ConvCard({
  conv,
  index,
  onPress,
  onLongPress,
}: {
  conv: any
  index: number
  onPress: () => void
  onLongPress: () => void
}) {
  const opacity    = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(12)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 280, delay: index * 40, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, delay: index * 40, useNativeDriver: true }),
    ]).start()
  }, [])

  const preview   = conv.lastMessage || 'No messages yet'
  const timestamp = conv.lastMessageAt
  const unread    = conv.unreadCount ?? 0

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
          <Ionicons name="chatbubble-ellipses" size={18} color={C.orange} />
        </View>

        <View style={styles.cardContent}>
          <View style={styles.cardRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              Conversation
            </Text>
            <Text style={styles.timeText}>{timeAgo(timestamp)}</Text>
          </View>
          <Text style={styles.cardPreview} numberOfLines={1}>{preview}</Text>
        </View>

        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        )}

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
  const { isOffline } = useNetworkStatus()

  const { records: conversations, loading } = useConversations()

  const headerOpacity = useRef(new Animated.Value(0)).current
  const headerY       = useRef(new Animated.Value(-8)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(headerY,       { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start()
  }, [])

  function openConversation(conv: any) {
    router.push({
      pathname: '/chat',
      params: { conversation_id: conv.id },
    })
  }

  async function deleteConversation(conv: any) {
    Alert.alert('Delete Conversation', 'Are you sure you want to delete this conversation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await database.write(async () => {
            await conv.update((c: any) => { c.deleted = true })
          })
        },
      },
    ])
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>

      {/* ── Offline banner ───────────────────────────────────────────────── */}
      {isOffline && <OfflineBanner />}

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
              : 'Your chat history'}
          </Text>
        </View>

        {/* Placeholder to balance header layout */}
        <View style={styles.headerBtn} />
      </Animated.View>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {!loading && conversations.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBox}>
            <Ionicons name="chatbubbles-outline" size={30} color={C.orange} />
          </View>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptySub}>Your chats will appear here.</Text>
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
              onLongPress={() => deleteConversation(conv)}
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
  cardRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle:  { fontSize: 13.5, fontWeight: '700', color: C.text, flex: 1, marginRight: 8 },
  cardPreview:{ fontSize: 12, color: C.textSub, lineHeight: 17 },
  timeText:   { fontSize: 11, color: C.textMute, flexShrink: 0 },

  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.orange,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    flexShrink: 0,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },

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
})
