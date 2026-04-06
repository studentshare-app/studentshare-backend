import type { Post, Reply, UserProfile } from '@/features/forum/types'
import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const T = {
  bg:      '#000000',
  bg3:     '#16181c',
  border:  '#2f3336',
  border2: '#3e4144',
  text:    '#e7e9ea',
  muted:   '#71767b',
  muted2:  '#8b98a5',
  accent:  '#1DA1F2',
  green:   '#00ba7c',
  red:     '#f91880',
} as const

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return `${s}s`
  if (s < 3600)  return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function Avi({
  initials, grad, size = 40, uri, verified = false,
}: {
  initials: string; grad: readonly [string, string]; size?: number; uri?: string | null; verified?: boolean
}) {
  return (
    <View style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <LinearGradient colors={grad as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, justifyContent: 'center', alignItems: 'center' }}
      >
        {uri
          ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, position: 'absolute' }} resizeMode="cover" />
          : <Text style={{ fontSize: size * 0.34, fontWeight: '800', color: '#fff' }}>{initials}</Text>
        }
      </LinearGradient>
      {verified && (
        <View style={{ position: 'absolute', bottom: -1, right: -1, width: 15, height: 15, borderRadius: 8, backgroundColor: T.accent, borderWidth: 2, borderColor: T.bg, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="checkmark" size={8} color="#fff" />
        </View>
      )}
    </View>
  )
}

function mapRowToReply(row: any): Reply {
  const isAnon  = !!row.is_anonymous
  const handle  = isAnon ? '@anonymous'
    : (row.profiles?.forum_handle
        ? (row.profiles.forum_handle.startsWith('@') ? row.profiles.forum_handle : `@${row.profiles.forum_handle}`)
        : `@${(row.profiles?.full_name || 'user').split(' ')[0].toLowerCase()}`)
  const rawGrad = row.author_grad ?? row.profiles?.forum_grad ?? null
  return {
    id:        row.id,
    postId:    row.reply_to_id,
    authorId:  row.author_id,
    name:      isAnon ? 'Anonymous' : (row.author_name || row.profiles?.full_name || 'Student'),
    handle,
    initials:  isAnon ? '?' : (row.author_initials || row.profiles?.forum_initials || row.profiles?.full_name?.slice(0, 2).toUpperCase() || '??'),
    grad:      (Array.isArray(rawGrad) ? rawGrad : ['#1DA1F2', '#0d8bd9']) as [string, string],
    avatarUri: isAnon ? null : (row.author_avatar_url || row.profiles?.avatar_url || null),
    verified:  isAnon ? false : !!(row.author_verified ?? row.profiles?.is_verified),
    text:      row.body || '',
    imageUrl:  row.image_url || null,
    likes:     row.like_count ?? 0,
    time:      timeAgo(row.created_at),
  }
}

// ── Twitter-style reply row ──────────────────────────────────────────────────
function ReplyRow({
  reply, postHandle, isLast, myUserId, onDelete,
}: {
  reply:      Reply
  postHandle: string
  isLast:     boolean
  myUserId:   string
  onDelete:   (id: string) => void
}) {
  const isOwn = reply.authorId === myUserId

  return (
    <View style={st.replyRow}>
      {/* Left: avatar + connector */}
      <View style={st.replyLeft}>
        <Avi initials={reply.initials} grad={reply.grad as [string, string]} size={40} uri={reply.avatarUri} verified={reply.verified} />
        {!isLast && <View style={st.connector} />}
      </View>

      {/* Right: content */}
      <View style={st.replyBody}>
        <View style={st.replyHeader}>
          <Text style={st.replyName} numberOfLines={1}>{reply.name}</Text>
          {reply.verified && <Ionicons name="checkmark-circle" size={13} color={T.accent} style={{ marginLeft: 2 }} />}
          <Text style={st.replyHandle} numberOfLines={1}>{reply.handle}</Text>
          <Text style={st.replyDot}>·</Text>
          <Text style={st.replyTime}>{reply.time}</Text>
          {isOwn && (
            <TouchableOpacity onPress={() => onDelete(reply.id)} hitSlop={8} style={{ marginLeft: 'auto' as any }}>
              <Ionicons name="trash-outline" size={14} color={T.muted} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={st.replyingTo}>
          Replying to <Text style={{ color: T.accent }}>{postHandle}</Text>
        </Text>

        <Text style={st.replyText}>{reply.text}</Text>

        {reply.imageUrl && (
          <View style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 10, borderWidth: 1, borderColor: T.border }}>
            <Image source={{ uri: reply.imageUrl }} style={{ width: '100%', aspectRatio: 16 / 9 }} resizeMode="cover" />
          </View>
        )}

        <View style={st.replyActions}>
          <TouchableOpacity style={st.replyAction}>
            <Ionicons name="chatbubble-outline" size={16} color={T.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={st.replyAction}>
            <Ionicons name="repeat" size={16} color={T.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={st.replyAction}>
            <Ionicons name="heart-outline" size={16} color={T.muted} />
            {reply.likes > 0 && <Text style={st.replyActionCount}>{reply.likes}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={st.replyAction}>
            <Ionicons name="share-outline" size={16} color={T.muted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

// ── ThreadModal ──────────────────────────────────────────────────────────────
export function ThreadModal({
  post, visible, onClose, onLike, onRepost, onBookmark,
  onShare, profile, onNewReply, myUserId, onDeleteReply,
}: {
  post:          Post | null
  visible:       boolean
  onClose:       () => void
  onLike:        (id: string, authorId?: string) => void
  onRepost:      (id: string, authorId?: string) => void
  onBookmark:    (id: string) => void
  onShare:       (p: Post) => void
  profile:       UserProfile
  onNewReply:    (postId: string, text: string, isAnon?: boolean) => void
  myUserId:      string
  onDeleteReply: (id: string) => void
}) {
  const insets = useSafeAreaInsets()
  const [replies,    setReplies]    = useState<Reply[]>([])
  const [loading,    setLoading]    = useState(false)
  const [replyText,  setReplyText]  = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Load replies + real-time subscription
  useEffect(() => {
    if (!post || !visible) { setReplies([]); return }

    const load = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('sq_posts')
        .select('*, profiles!sq_posts_author_id_fkey(full_name,forum_handle,forum_initials,forum_grad,avatar_url,is_verified)')
        .eq('reply_to_id', post.id)
        .order('created_at', { ascending: true })
      setLoading(false)
      if (data) setReplies(data.map(mapRowToReply))
    }
    void load()

    const ch = supabase
      .channel(`thread_${post.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sq_posts', filter: `reply_to_id=eq.${post.id}` },
        async payload => {
          const { data } = await supabase
            .from('sq_posts')
            .select('*, profiles!sq_posts_author_id_fkey(full_name,forum_handle,forum_initials,forum_grad,avatar_url,is_verified)')
            .eq('id', (payload.new as any).id)
            .single()
          if (data) setReplies(prev => prev.some(r => r.id === (data as any).id) ? prev : [...prev, mapRowToReply(data as any)])
        },
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'sq_posts' }, payload => {
        setReplies(prev => prev.filter(r => r.id !== (payload.old as any).id))
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [post?.id, visible])

  const handleQuickReply = async () => {
    if (!replyText.trim() || !post || submitting) return
    setSubmitting(true)
    const txt = replyText.trim()
    setReplyText('')

    // Optimistic reply
    const temp: Reply = {
      id:        `temp-${Date.now()}`,
      postId:    post.id,
      authorId:  myUserId,
      name:      profile.name,
      handle:    profile.handle,
      initials:  profile.initials,
      grad:      profile.grad,
      avatarUri: profile.avatarUri,
      verified:  profile.verified,
      text:      txt,
      likes:     0,
      time:      'now',
    }
    setReplies(prev => [...prev, temp])
    onNewReply(post.id, txt)
    setSubmitting(false)
  }

  if (!post) return null

  const now  = new Date()
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const date = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: T.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[st.header, { paddingTop: insets.top + 6 }]}>
          <TouchableOpacity style={st.backBtn} onPress={onClose}>
            <Ionicons name="arrow-back" size={22} color={T.text} />
          </TouchableOpacity>
          <Text style={st.headerTitle}>Post</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {/* Original post — expanded Twitter style */}
          <View style={st.expanded}>
            <View style={st.expAuthorRow}>
              <Avi initials={post.avatar} grad={post.avatarGrad} size={48} uri={post.avatarUri} verified={post.verified} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={st.expName}>{post.name}</Text>
                <Text style={st.expHandle}>{post.handle}</Text>
              </View>
            </View>

            <Text style={st.expText}>{post.text}</Text>

            {post.imageUrl && (
              <View style={st.imgWrap}>
                <Image source={{ uri: post.imageUrl }} style={st.img} resizeMode="cover" />
              </View>
            )}

            <Text style={st.timestamp}>{time} · {date}</Text>
            <View style={st.divider} />

            {/* Stats */}
            <View style={st.statsRow}>
              <Text style={st.statItem}><Text style={st.statNum}>{post.replies}</Text><Text style={st.statLabel}> Replies</Text></Text>
              <Text style={st.statItem}><Text style={st.statNum}>{post.reposts}</Text><Text style={st.statLabel}> Reposts</Text></Text>
              <Text style={st.statItem}><Text style={st.statNum}>{post.likes}</Text><Text style={st.statLabel}> Likes</Text></Text>
              <Text style={st.statItem}><Text style={st.statNum}>{post.bookmarks}</Text><Text style={st.statLabel}> Bookmarks</Text></Text>
            </View>

            <View style={st.divider} />

            {/* Actions */}
            <View style={st.actionBar}>
              <TouchableOpacity style={st.actionBtn}>
                <Ionicons name="chatbubble-outline" size={22} color={T.muted} />
              </TouchableOpacity>
              <TouchableOpacity style={st.actionBtn} onPress={() => onRepost(post.id, post.authorId)}>
                <Ionicons name="repeat" size={22} color={post.reposted ? T.green : T.muted} />
              </TouchableOpacity>
              <TouchableOpacity style={st.actionBtn} onPress={() => onLike(post.id, post.authorId)}>
                <Ionicons name={post.liked ? 'heart' : 'heart-outline'} size={22} color={post.liked ? T.red : T.muted} />
              </TouchableOpacity>
              <TouchableOpacity style={st.actionBtn} onPress={() => onBookmark(post.id)}>
                <Ionicons name={post.bookmarked ? 'bookmark' : 'bookmark-outline'} size={22} color={post.bookmarked ? T.accent : T.muted} />
              </TouchableOpacity>
              <TouchableOpacity style={st.actionBtn} onPress={() => onShare(post)}>
                <Ionicons name="share-outline" size={22} color={T.muted} />
              </TouchableOpacity>
            </View>

            <View style={st.divider} />
          </View>

          {/* Replies */}
          {loading ? (
            <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
          ) : replies.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 40, paddingHorizontal: 40 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: T.text, marginBottom: 6 }}>No replies yet</Text>
              <Text style={{ color: T.muted, fontSize: 14, textAlign: 'center' }}>Be the first to reply!</Text>
            </View>
          ) : (
            <View>
              {replies.map((r, idx) => (
                <ReplyRow
                  key={r.id}
                  reply={r}
                  postHandle={post.handle}
                  isLast={idx === replies.length - 1}
                  myUserId={myUserId}
                  onDelete={onDeleteReply}
                />
              ))}
            </View>
          )}
        </ScrollView>

        {/* Reply bar */}
        <View style={[st.replyBar, { paddingBottom: insets.bottom + 8 }]}>
          <Avi initials={profile.initials} grad={profile.grad} size={36} uri={profile.avatarUri} />
          <TextInput
            style={st.replyInput}
            placeholder="Post your reply…"
            placeholderTextColor={T.muted}
            value={replyText}
            onChangeText={setReplyText}
            multiline
            maxLength={280}
          />
          <TouchableOpacity
            style={[st.replyBtn, (!replyText.trim() || submitting) && { opacity: 0.45 }]}
            onPress={handleQuickReply}
            disabled={!replyText.trim() || submitting}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Reply</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const st = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  backBtn:     { width: 40, paddingVertical: 4, justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: T.text, paddingLeft: 8 },

  expanded:     { padding: 16 },
  expAuthorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  expName:      { fontSize: 17, fontWeight: '800', color: T.text },
  expHandle:    { fontSize: 15, color: T.muted, marginTop: 1 },
  expText:      { fontSize: 20, color: T.text, lineHeight: 30, marginBottom: 14 },
  imgWrap:      { borderRadius: 16, overflow: 'hidden', marginBottom: 14, borderWidth: 1, borderColor: T.border },
  img:          { width: '100%', aspectRatio: 16 / 9 },
  timestamp:    { fontSize: 15, color: T.muted, marginBottom: 14 },
  divider:      { height: 1, backgroundColor: T.border },
  statsRow:     { flexDirection: 'row', gap: 16, paddingVertical: 14, flexWrap: 'wrap' },
  statItem:     { fontSize: 15 },
  statNum:      { fontWeight: '800', color: T.text },
  statLabel:    { color: T.muted },
  actionBar:    { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6 },
  actionBtn:    { padding: 10 },

  // Twitter-style replies
  replyRow:         { flexDirection: 'row', paddingLeft: 16, paddingRight: 16, paddingTop: 16 },
  replyLeft:        { alignItems: 'center', marginRight: 12, width: 40 },
  connector:        { width: 2, flex: 1, backgroundColor: T.border, marginTop: 6, borderRadius: 1, minHeight: 24 },
  replyBody:        { flex: 1, paddingBottom: 16 },
  replyHeader:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2, flexWrap: 'wrap' },
  replyName:        { fontSize: 15, fontWeight: '800', color: T.text, flexShrink: 1 },
  replyHandle:      { fontSize: 14, color: T.muted, flexShrink: 1 },
  replyDot:         { color: T.muted, fontSize: 14 },
  replyTime:        { fontSize: 14, color: T.muted },
  replyingTo:       { fontSize: 14, color: T.muted, marginBottom: 6 },
  replyText:        { fontSize: 16, color: T.text, lineHeight: 24, marginBottom: 10 },
  replyActions:     { flexDirection: 'row', gap: 20 },
  replyAction:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  replyActionCount: { fontSize: 13, color: T.muted },

  replyBar:   { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.bg, flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  replyInput: { flex: 1, color: T.text, fontSize: 16, maxHeight: 100, paddingVertical: 8 },
  replyBtn:   { backgroundColor: T.accent, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20 },
})