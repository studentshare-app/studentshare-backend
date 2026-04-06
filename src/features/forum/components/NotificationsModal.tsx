import type { Notif } from '@/features/forum/types'
import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const T = {
  bg:      '#000000',
  bg2:     '#0d0d0d',
  bg3:     '#16181c',
  border:  '#2f3336',
  text:    '#e7e9ea',
  muted:   '#71767b',
  accent:  '#1DA1F2',
  red:     '#f91880',
  green:   '#00ba7c',
  gold:    '#ffd400',
} as const

type NotifMeta = { iconName: string; color: string; verb: string }
const NOTIF_META: Record<string, NotifMeta> = {
  like:    { iconName: 'heart',        color: T.red,    verb: 'liked your post' },
  reply:   { iconName: 'chatbubble',   color: T.accent, verb: 'replied to your post' },
  repost:  { iconName: 'repeat',       color: T.green,  verb: 'reposted your post' },
  follow:  { iconName: 'person-add',   color: T.gold,   verb: 'followed you' },
}

function Avi({
  initials, grad, uri,
}: {
  initials: string; grad: [string, string]; uri?: string | null
}) {
  return (
    <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
    >
      {uri
        ? <Image source={{ uri }} style={{ width: 44, height: 44, borderRadius: 22, position: 'absolute' }} />
        : <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{initials}</Text>
      }
    </LinearGradient>
  )
}

export function NotificationsModal({
  visible, onClose, userId, mapNotifRow,
}: {
  visible:      boolean
  onClose:      () => void
  userId:       string
  mapNotifRow:  (row: any) => Notif
}) {
  const insets = useSafeAreaInsets()
  const [notifs,  setNotifs]  = useState<Notif[]>([])
  const [loading, setLoading] = useState(false)
  const [tab,     setTab]     = useState<'all' | 'mentions'>('all')

  useEffect(() => {
    if (!visible || !userId) return
    void loadNotifs()
  }, [visible, userId])

  const loadNotifs = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('sq_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(60)
    setLoading(false)
    if (data) setNotifs(data.map(mapNotifRow))
    // Mark all as read
    void supabase.from('sq_notifications')
      .update({ read: true }).eq('user_id', userId).eq('read', false)
  }

  const filtered = tab === 'mentions' ? notifs.filter(n => n.type === 'reply') : notifs

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top > 0 ? insets.top : 16 }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={T.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Notifications</Text>
          <TouchableOpacity onPress={() => void loadNotifs()} style={styles.closeBtn}>
            <Ionicons name="refresh-outline" size={19} color={T.muted} />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(['all', 'mentions'] as const).map(t => (
            <TouchableOpacity key={t} style={styles.tab} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'all' ? 'All' : 'Mentions'}
              </Text>
              {tab === t && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator color={T.accent} size="large" />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-outline" size={56} color={T.muted} style={{ marginBottom: 16 }} />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptySub}>
              When someone interacts with your posts, you'll see it here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={n => n.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item: n }) => {
              const meta = NOTIF_META[n.type] ?? { iconName: 'notifications', color: T.accent, verb: 'interacted with your post' }
              return (
                <View style={[styles.row, !n.read && styles.rowUnread]}>
                  {!n.read && <View style={styles.unreadDot} />}
                  <View style={{ position: 'relative', marginRight: 14 }}>
                    <Avi initials={n.actorInitials} grad={n.actorGrad} uri={n.actorAvatar} />
                    <View style={[styles.typeBadge, { backgroundColor: meta.color }]}>
                      <Ionicons name={meta.iconName as any} size={10} color="#fff" />
                    </View>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.actorName} numberOfLines={1}>
                      <Text style={{ fontWeight: '800' }}>{n.actorName}</Text>
                      <Text style={{ color: T.muted }}> {n.actorHandle}</Text>
                    </Text>
                    <Text style={styles.verb}>{meta.verb}</Text>
                    {n.postPreview && (
                      <Text style={styles.preview} numberOfLines={2}>"{n.postPreview}"</Text>
                    )}
                  </View>
                  <Text style={styles.time}>{n.time}</Text>
                </View>
              )
            }}
          />
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: T.bg },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  closeBtn:      { width: 36, height: 36, borderRadius: 12, backgroundColor: T.bg3, justifyContent: 'center', alignItems: 'center' },
  title:         { fontSize: 20, fontWeight: '800', color: T.text },
  tabs:          { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border },
  tab:           { flex: 1, alignItems: 'center', paddingVertical: 14, position: 'relative' },
  tabText:       { fontSize: 13, fontWeight: '600', color: T.muted },
  tabTextActive: { color: T.text, fontWeight: '800' },
  tabIndicator:  { position: 'absolute', bottom: 0, height: 2.5, width: 32, borderRadius: 2, backgroundColor: T.accent },
  centerFill:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty:         { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36 },
  emptyTitle:    { fontSize: 20, fontWeight: '800', color: T.text, marginBottom: 8 },
  emptySub:      { fontSize: 14, color: T.muted, textAlign: 'center', lineHeight: 22 },
  separator:     { height: 1, backgroundColor: T.border },
  row:           { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 16 },
  rowUnread:     { backgroundColor: 'rgba(29,161,242,0.04)' },
  unreadDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: T.accent, marginRight: 10, marginTop: 18 },
  typeBadge:     { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: T.bg },
  actorName:     { fontSize: 14, color: T.text, marginBottom: 3 },
  verb:          { fontSize: 13, color: T.muted, marginBottom: 5 },
  preview:       { fontSize: 13, color: T.muted, lineHeight: 19, fontStyle: 'italic' },
  time:          { fontSize: 12, color: T.muted, marginLeft: 10, marginTop: 2 },
})