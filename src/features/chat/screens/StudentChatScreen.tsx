/**
 * app/student-chat.tsx
 *
 * Student-to-student messaging — Conversations list
 * ✅ Clickable profile pictures (WhatsApp-style full-screen lightbox)
 * ✅ Blue verification tick next to verified users
 * ✅ Bio visible in classmate list
 * WhatsApp/Telegram inspired: offline-first, real-time, unread badges
 */

import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/core/api/supabase'
import {
  fetchStudentConversations,
  fetchClassmates,
  getOrCreateDM,
  createGroupChat,
  type StudentConversation,
  type ClassmateProfile,
} from '@/lib/queries/studentChat'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d    = new Date(iso)
  const now  = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'Just now'
  if (mins < 60)  return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `${days}d`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function getInitials(name: string | null): string {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function safeName(name: string | null | undefined): string {
  if (!name || name === 'undefined' || name === 'null' || name.trim() === '') return 'Unknown'
  return name.trim()
}

const AVATAR_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#06B6D4', '#6366F1',
]
function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ─────────────────────────────────────────────
// Photo Lightbox — WhatsApp-style full-screen
// ─────────────────────────────────────────────
function PhotoLightbox({ uri, visible, onClose, name }: {
  uri: string | null; visible: boolean; onClose: () => void; name?: string
}) {
  const opacity = useRef(new Animated.Value(0)).current
  const scale   = useRef(new Animated.Value(0.88)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scale,   { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }),
      ]).start()
    } else {
      opacity.setValue(0)
      scale.setValue(0.88)
    }
  }, [visible])

  if (!uri) return null

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[lb.overlay, { opacity }]}>
        <TouchableOpacity style={lb.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        {name && <Text style={lb.name}>{name}</Text>}
        <Pressable style={lb.backdrop} onPress={onClose}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Image
              source={{ uri }}
              style={lb.image}
              resizeMode="contain"
            />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  )
}

const lb = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  backdrop: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  image:    { width: SCREEN_WIDTH, height: SCREEN_WIDTH },
  closeBtn: {
    position: 'absolute', top: 56, right: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  name: {
    position: 'absolute', top: 60, left: 20, right: 70, zIndex: 10,
    fontSize: 16, fontWeight: '700', color: '#fff',
  },
})

// ─────────────────────────────────────────────
// Verified badge
// ─────────────────────────────────────────────
function VerifiedBadge({ size = 14 }: { size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#1D9BF0',
      justifyContent: 'center', alignItems: 'center',
      marginLeft: 3,
    }}>
      <Ionicons name="checkmark" size={size * 0.65} color="#fff" />
    </View>
  )
}

// ─────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────
function Avatar({
  uri, name, id, size = 48, online = false, onPress,
}: { uri?: string | null; name?: string | null; id: string; size?: number; online?: boolean; onPress?: () => void }) {
  const color = avatarColor(id)

  const inner = (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={{
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: color + '28', borderWidth: 1.5, borderColor: color + '50',
          justifyContent: 'center', alignItems: 'center',
        }}>
          <Text style={{ fontSize: size * 0.35, fontWeight: '800', color }}>
            {getInitials(safeName(name ?? null))}
          </Text>
        </View>
      )}
      {online && (
        <View style={{
          position: 'absolute', bottom: 1, right: 1,
          width: size * 0.28, height: size * 0.28,
          borderRadius: size * 0.14,
          backgroundColor: '#22C55E',
          borderWidth: 2, borderColor: '#0F172A',
        }} />
      )}
    </View>
  )

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {inner}
      </TouchableOpacity>
    )
  }
  return inner
}

// ─────────────────────────────────────────────
// Conversation row
// ─────────────────────────────────────────────
function ConvRow({
  conv, myId, index, onPress, onLongPress, onAvatarPress, isVerified,
}: {
  conv: StudentConversation
  myId: string
  index: number
  onPress: () => void
  onLongPress: () => void
  onAvatarPress: () => void
  isVerified?: boolean
}) {
  const opacity    = useRef(new Animated.Value(0)).current
  const translateX = useRef(new Animated.Value(-20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 280, delay: index * 40, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 280, delay: index * 40, useNativeDriver: true }),
    ]).start()
  }, [])

  const isGroup   = conv.type === 'group'
  const hasUnread = conv.unread_count > 0
  const avatarId  = conv.other_user_id ?? conv.id

  // Clean last message — strip undefined
  const lastMsg = conv.last_message && conv.last_message !== 'undefined' && conv.last_message !== 'null'
    ? conv.last_message
    : null

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }] }}>
      <Pressable
        style={({ pressed }) => [
          styles.convRow,
          pressed && { backgroundColor: '#1A2942' },
          hasUnread && styles.convRowUnread,
        ]}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        <View style={{ position: 'relative' }}>
          {isGroup ? (
            <View style={styles.groupAvatarWrap}>
              <Ionicons name="people" size={22} color="#38BDF8" />
            </View>
          ) : (
            <Avatar
              uri={conv.other_user_avatar}
              name={conv.other_user_name}
              id={avatarId}
              size={50}
              online={conv.other_user_online}
              onPress={onAvatarPress}
            />
          )}
        </View>

        <View style={styles.convInfo}>
          <View style={styles.convTopRow}>
            {/* Name + verified tick */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
              <Text style={[styles.convName, hasUnread && styles.convNameUnread]} numberOfLines={1}>
                {safeName(conv.name ?? conv.other_user_name ?? null)}
              </Text>
              {isVerified && !isGroup && <VerifiedBadge size={13} />}
            </View>
            <Text style={[styles.convTime, hasUnread && styles.convTimeUnread]}>
              {formatTime(conv.last_message_at ?? conv.updated_at)}
            </Text>
          </View>

          <View style={styles.convBottomRow}>
            <Text
              style={[styles.convPreview, hasUnread && styles.convPreviewUnread]}
              numberOfLines={1}
            >
              {conv.last_sender_name && isGroup && lastMsg
                ? `${safeName(conv.last_sender_name).split(' ')[0]}: ${lastMsg}`
                : lastMsg ?? 'Tap to start chatting'
              }
            </Text>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {conv.unread_count > 99 ? '99+' : conv.unread_count}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────
// New Chat Modal — WhatsApp style
// ─────────────────────────────────────────────
function NewChatModal({
  visible, onClose, classmates, myId, collegeId, classId, onStartChat,
}: {
  visible:     boolean
  onClose:     () => void
  classmates:  ClassmateProfile[]
  myId:        string
  collegeId:   string | null
  classId:     string | null
  onStartChat: (convId: string) => void
}) {
  const [mode,      setMode]      = useState<'list' | 'group'>('list')
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [groupName, setGroupName] = useState('')
  const [creating,  setCreating]  = useState(false)

  useEffect(() => {
    if (visible) {
      setMode('list'); setSearch(''); setSelected(new Set()); setGroupName(''); setCreating(false)
    }
  }, [visible])

  const filtered = search.trim()
    ? classmates.filter(c => c.full_name.toLowerCase().includes(search.toLowerCase()))
    : classmates

  const handleDM = async (other: ClassmateProfile) => {
    if (creating) return
    setCreating(true)
    try {
      const id = await getOrCreateDM(myId, other.id, collegeId)
      if (id) { onClose(); onStartChat(id) }
      else Alert.alert('Error', 'Could not start conversation. Please try again.')
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong')
    } finally { setCreating(false) }
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim()) { Alert.alert('Enter a group name'); return }
    if (selected.size < 1) { Alert.alert('Select at least 1 member'); return }
    setCreating(true)
    try {
      const id = await createGroupChat({
        name: groupName.trim(), memberIds: [myId, ...Array.from(selected)],
        createdBy: myId, collegeId, classId,
      })
      if (id) { onClose(); onStartChat(id) }
      else Alert.alert('Error', 'Could not create group. Please try again.')
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong')
    } finally { setCreating(false) }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={mStyles.overlay}>
        <View style={mStyles.sheet}>
          <View style={mStyles.handle} />

          <View style={mStyles.header}>
            {mode === 'group'
              ? <TouchableOpacity onPress={() => setMode('list')} style={mStyles.backBtn}>
                  <Ionicons name="arrow-back" size={18} color="#94A3B8" />
                </TouchableOpacity>
              : <View style={{ width: 32 }} />
            }
            <Text style={mStyles.title}>{mode === 'list' ? 'New Message' : 'New Group'}</Text>
            <TouchableOpacity onPress={onClose} style={mStyles.closeBtn}>
              <Ionicons name="close" size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {mode === 'group' && (
            <View style={mStyles.groupNameRow}>
              <TextInput
                style={mStyles.groupNameInput} value={groupName} onChangeText={setGroupName}
                placeholder="Group name..." placeholderTextColor="#475569" autoFocus
              />
            </View>
          )}

          <View style={mStyles.searchRow}>
            <Ionicons name="search" size={15} color="#475569" />
            <TextInput
              style={mStyles.searchInput} value={search} onChangeText={setSearch}
              placeholder="Search classmates..." placeholderTextColor="#475569"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color="#475569" />
              </TouchableOpacity>
            )}
          </View>

          {mode === 'list' && (
            <TouchableOpacity style={mStyles.groupToggle} onPress={() => setMode('group')}>
              <View style={mStyles.groupToggleIcon}><Ionicons name="people" size={18} color="#38BDF8" /></View>
              <Text style={mStyles.groupToggleText}>Create Group Chat</Text>
              <Ionicons name="chevron-forward" size={15} color="#475569" />
            </TouchableOpacity>
          )}

          {mode === 'group' && selected.size > 0 && (
            <View style={mStyles.chipsRow}>
              {Array.from(selected).map(uid => {
                const p = classmates.find(c => c.id === uid)
                return (
                  <TouchableOpacity key={uid} style={mStyles.chip} onPress={() => toggleSelect(uid)}>
                    <Text style={mStyles.chipText}>{p?.full_name.split(' ')[0]}</Text>
                    <Ionicons name="close" size={10} color="#94A3B8" />
                  </TouchableOpacity>
                )
              })}
            </View>
          )}

          <Text style={mStyles.sectionLabel}>
            {mode === 'list' ? 'Classmates' : 'Select Members'} · {filtered.length}
          </Text>

          {creating ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
              <ActivityIndicator size="large" color="#38BDF8" />
              <Text style={{ color: '#475569', fontSize: 13 }}>Opening chat...</Text>
            </View>
          ) : classmates.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
              <ActivityIndicator size="large" color="#38BDF8" />
              <Text style={{ color: '#475569', fontSize: 13 }}>Loading classmates...</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={item => item.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 20 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 40, gap: 10 }}>
                  <Ionicons name="people-outline" size={40} color="#1E3A5F" />
                  <Text style={{ color: '#94A3B8', fontSize: 14, fontWeight: '600' }}>
                    {search ? 'No results found' : 'No classmates yet'}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
                    {search ? 'Try a different name' : 'Make sure your class is set in your profile'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const isSelected = selected.has(item.id)
                // Bio from classmate
                const bio = (item as any).bio as string | null | undefined
                return (
                  <Pressable
                    style={({ pressed }) => [
                      mStyles.classmateRow,
                      pressed && { backgroundColor: '#1A2942' },
                      isSelected && mStyles.classmateRowSelected,
                    ]}
                    onPress={() => mode === 'list' ? handleDM(item) : toggleSelect(item.id)}
                  >
                    <Avatar uri={item.avatar_url} name={item.full_name} id={item.id} size={44} />
                    <View style={{ flex: 1 }}>
                      {/* Name + verified */}
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={mStyles.classmateName}>{safeName(item.full_name)}</Text>
                        {(item as any).is_verified && <VerifiedBadge size={13} />}
                      </View>
                      {/* Bio or fallback */}
                      <Text style={mStyles.classmateClass} numberOfLines={1}>
                        {bio && bio.trim() ? bio : (item.class_id ? '· Same class' : '· Same college')}
                      </Text>
                    </View>
                    {mode === 'group' ? (
                      <View style={[mStyles.checkCircle, isSelected && mStyles.checkCircleActive]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                    ) : (
                      <Ionicons name="chatbubble-outline" size={16} color="#334155" />
                    )}
                  </Pressable>
                )
              }}
            />
          )}

          {mode === 'group' && (
            <TouchableOpacity
              style={[mStyles.createBtn, (selected.size < 1 || !groupName.trim()) && mStyles.createBtnDisabled]}
              onPress={handleCreateGroup}
              disabled={creating || selected.size < 1 || !groupName.trim()}
            >
              <Ionicons name="people" size={16} color="#fff" />
              <Text style={mStyles.createBtnText}>Create Group ({selected.size + 1} members)</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────
export default function StudentChatScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()

  const [userId,        setUserId]        = useState<string | null>(null)
  const [collegeId,     setCollegeId]     = useState<string | null>(null)
  const [classId,       setClassId]       = useState<string | null>(null)
  const [conversations, setConversations] = useState<StudentConversation[]>([])
  const [classmates,    setClassmates]    = useState<ClassmateProfile[]>([])
  const [loading,       setLoading]       = useState(true)
  const [showNewChat,   setShowNewChat]   = useState(false)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searching,     setSearching]     = useState(false)
  // Verified map: other_user_id → is_verified
  const [verifiedMap,   setVerifiedMap]   = useState<Record<string, boolean>>({})
  // Lightbox
  const [lightboxUri,   setLightboxUri]   = useState<string | null>(null)
  const [lightboxName,  setLightboxName]  = useState<string>('')

  const headerAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('college_id, class_id')
        .eq('id', user.id)
        .single()

      setCollegeId(profile?.college_id ?? null)
      setClassId(profile?.class_id ?? null)

      const mates = await fetchClassmates(
        user.id,
        profile?.class_id ?? null,
        profile?.college_id ?? null,
      )
      setClassmates(mates)
      Animated.timing(headerAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
    }
    init()
  }, [])

  useFocusEffect(useCallback(() => {
    if (!userId) return
    loadConversations(userId)

    const channel = supabase
      .channel(`student_chat_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_messages' },
        () => loadConversations(userId))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId]))

  async function loadConversations(uid: string) {
    setLoading(true)
    const data = await fetchStudentConversations(uid)
    setConversations(data)
    setLoading(false)

    // Load verified status for all other users in DMs
    const otherIds = data
      .filter(c => c.type === 'dm' && c.other_user_id)
      .map(c => c.other_user_id!)
      .filter(Boolean)

    if (otherIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, is_verified')
        .in('id', otherIds)
      if (profiles) {
        const map: Record<string, boolean> = {}
        profiles.forEach(p => { map[p.id] = p.is_verified ?? false })
        setVerifiedMap(map)
      }
    }
  }

  function openConversation(conv: StudentConversation) {
    router.push({
      pathname: '/student-message' as any,
      params: {
        conversation_id:   conv.id,
        conversation_name: safeName(conv.name ?? conv.other_user_name ?? null) || 'Chat',
        conversation_type: conv.type,
        other_user_id:     conv.other_user_id ?? '',
        other_user_avatar: conv.other_user_avatar ?? '',
      },
    })
  }

  function handleLongPress(conv: StudentConversation) {
    Alert.alert(
      safeName(conv.name ?? conv.other_user_name ?? null) || 'Chat',
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Chat', style: 'destructive',
          onPress: async () => {
            setConversations(prev => prev.filter(c => c.id !== conv.id))
            await supabase.from('student_chat_members')
              .delete().eq('conversation_id', conv.id).eq('user_id', userId!)
          },
        },
      ]
    )
  }

  const filtered = conversations.filter(c => {
    const name = safeName(c.name ?? c.other_user_name ?? null).toLowerCase()
    return name.includes(searchQuery.toLowerCase())
  })

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count ?? 0), 0)

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* Header */}
      <Animated.View style={[styles.header, {
        opacity: headerAnim,
        transform: [{ translateY: headerAnim.interpolate({ inputRange: [0,1], outputRange: [-12, 0] }) }],
      }]}>
        <View style={styles.blob1} />
        <View style={styles.blob2} />

        <View style={styles.headerTop}>
          <View>
            <View style={styles.headerBadge}>
              <Ionicons name="chatbubbles" size={11} color="#38BDF8" />
              <Text style={styles.headerBadgeText}>StudentShare Chat</Text>
              {totalUnread > 0 && (
                <View style={styles.headerUnreadBadge}>
                  <Text style={styles.headerUnreadText}>{totalUnread}</Text>
                </View>
              )}
            </View>
            <Text style={styles.headerTitle}>Messages</Text>
            <Text style={styles.headerSub}>
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
            </Text>
          </View>

          <TouchableOpacity style={styles.newChatBtn} onPress={() => setShowNewChat(true)} activeOpacity={0.8}>
            <Ionicons name="create-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={[styles.searchBar, searching && styles.searchBarFocused]}>
          <Ionicons name="search" size={15} color="#475569" />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearching(true)}
            onBlur={() => setSearching(false)}
            placeholder="Search conversations..."
            placeholderTextColor="#475569"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#475569" />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Content */}
      {loading && conversations.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="chatbubbles-outline" size={40} color="#38BDF8" />
          </View>
          <Text style={styles.emptyTitle}>{searchQuery ? 'No results' : 'No messages yet'}</Text>
          <Text style={styles.emptySub}>
            {searchQuery ? 'Try a different name' : 'Tap the pencil icon to message a classmate'}
          </Text>
          {!searchQuery && (
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowNewChat(true)}>
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Start a Conversation</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item, index }) => (
            <ConvRow
              conv={item}
              myId={userId ?? ''}
              index={index}
              onPress={() => openConversation(item)}
              onLongPress={() => handleLongPress(item)}
              isVerified={item.other_user_id ? (verifiedMap[item.other_user_id] ?? false) : false}
              onAvatarPress={() => {
                const uri  = item.other_user_avatar
                const name = safeName(item.name ?? item.other_user_name ?? null)
                if (uri) { setLightboxUri(uri); setLightboxName(name) }
              }}
            />
          )}
        />
      )}

      {/* New Chat Modal */}
      {userId && (
        <NewChatModal
          visible={showNewChat}
          onClose={() => setShowNewChat(false)}
          classmates={classmates}
          myId={userId}
          collegeId={collegeId}
          classId={classId}
          onStartChat={convId => {
            router.push({
              pathname: '/student-message' as any,
              params: {
                conversation_id:   convId,
                conversation_name: 'Chat',
                conversation_type: 'dm',
              },
            })
          }}
        />
      )}

      {/* Profile Picture Lightbox */}
      <PhotoLightbox
        uri={lightboxUri}
        visible={!!lightboxUri}
        onClose={() => setLightboxUri(null)}
        name={lightboxName}
      />
    </View>
  )
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    backgroundColor: '#0F172A', paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1E3A5F',
    position: 'relative', overflow: 'hidden',
  },
  blob1: { position: 'absolute', top: -60, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(56,189,248,0.06)' },
  blob2: { position: 'absolute', top: 20, right: 80, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(99,102,241,0.05)' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(56,189,248,0.12)', borderWidth: 1, borderColor: 'rgba(56,189,248,0.2)',
    borderRadius: 100, paddingHorizontal: 9, paddingVertical: 3,
    alignSelf: 'flex-start', marginBottom: 8,
  },
  headerBadgeText:   { fontSize: 11, fontWeight: '700', color: '#38BDF8' },
  headerUnreadBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' },
  headerUnreadText:  { fontSize: 9, fontWeight: '800', color: '#fff' },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#F1F5F9', letterSpacing: -0.5 },
  headerSub:   { fontSize: 12, color: '#475569', marginTop: 2 },
  newChatBtn: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: 'rgba(56,189,248,0.15)', borderWidth: 1, borderColor: 'rgba(56,189,248,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1E293B', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10,
    borderWidth: 1, borderColor: '#1E3A5F',
  },
  searchBarFocused: { borderColor: 'rgba(56,189,248,0.35)' },
  searchInput:      { flex: 1, fontSize: 14, color: '#F1F5F9' },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, color: '#475569' },
  emptyState:  { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 10 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: 'rgba(56,189,248,0.1)', borderWidth: 1, borderColor: 'rgba(56,189,248,0.2)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  emptyTitle:  { fontSize: 18, fontWeight: '700', color: '#F1F5F9' },
  emptySub:    { fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#38BDF8', borderRadius: 24, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  emptyBtnText: { color: '#0F172A', fontWeight: '800', fontSize: 14 },
  convRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 13 },
  convRowUnread: { backgroundColor: 'rgba(56,189,248,0.03)' },
  groupAvatarWrap: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(56,189,248,0.12)', borderWidth: 1.5, borderColor: 'rgba(56,189,248,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  convInfo:   { flex: 1 },
  convTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  convName:   { fontSize: 15, fontWeight: '600', color: '#94A3B8', flexShrink: 1 },
  convNameUnread: { color: '#F1F5F9', fontWeight: '700' },
  convTime:   { fontSize: 11, color: '#334155' },
  convTimeUnread: { color: '#38BDF8' },
  convBottomRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convPreview:     { fontSize: 13, color: '#334155', flex: 1, marginRight: 8 },
  convPreviewUnread: { color: '#64748B' },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#38BDF8',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
  },
  unreadBadgeText: { fontSize: 10, fontWeight: '800', color: '#0F172A' },
  separator: { height: 1, backgroundColor: '#111827', marginLeft: 83 },
})

const mStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0F172A', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 40, height: '85%',
    borderWidth: 1, borderBottomWidth: 0, borderColor: '#1E3A5F',
  },
  handle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: '#1E3A5F', alignSelf: 'center', marginVertical: 14 },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  backBtn:  { width: 32, height: 32, borderRadius: 9, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center' },
  title:    { fontSize: 17, fontWeight: '800', color: '#F1F5F9' },
  closeBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center' },
  groupNameRow: { marginBottom: 12 },
  groupNameInput: {
    backgroundColor: '#1E293B', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, fontWeight: '700', color: '#F1F5F9', borderWidth: 1, borderColor: '#38BDF8',
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1E293B',
    borderRadius: 11, paddingHorizontal: 13, paddingVertical: 10,
    borderWidth: 1, borderColor: '#1E3A5F', marginBottom: 12,
  },
  searchInput:   { flex: 1, fontSize: 14, color: '#F1F5F9' },
  sectionLabel:  { fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 4, paddingHorizontal: 4 },
  groupToggle:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1E293B', borderRadius: 12, padding: 13, marginBottom: 12, borderWidth: 1, borderColor: '#1E3A5F' },
  groupToggleIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(56,189,248,0.12)', justifyContent: 'center', alignItems: 'center' },
  groupToggleText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#F1F5F9' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(56,189,248,0.15)', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(56,189,248,0.25)' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#38BDF8' },
  classmateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 4, borderRadius: 10 },
  classmateRowSelected: { backgroundColor: 'rgba(56,189,248,0.06)' },
  classmateName:  { fontSize: 14, fontWeight: '600', color: '#F1F5F9' },
  classmateClass: { fontSize: 11, color: '#475569', marginTop: 1 },
  checkCircle:       { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#1E3A5F', justifyContent: 'center', alignItems: 'center' },
  checkCircleActive: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
  createBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#38BDF8', borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText:     { fontSize: 15, fontWeight: '800', color: '#0F172A' },
})
