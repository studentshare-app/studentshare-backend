/**
 * app/student-forum.tsx — The Campus Times
 * REDESIGN v2: Editorial orange-accent style matching mockups
 *
 * Visual changes from v1:
 *  - Design tokens updated: orange primary (#ec5b13), warm dark backgrounds
 *  - Typography: Playfair Display display font feel via fontFamily serif
 *  - Header: editorial wordmark + warm border
 *  - PostCard: editorial layout with left accent bar, warmer surfaces
 *  - ComposeModal: upgraded to full-screen page layout matching mockup
 *  - ThreadModal: sticky reply bar, post detail layout matching mockup
 *  - ProfileCardModal: cover gradient, stats row, pinned resources layout
 *  - FAB: orange gradient matching home screen design language
 *  - All tokens use T.* (updated to warm editorial palette)
 */

import { Ionicons } from '@expo/vector-icons'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import * as ImagePicker from 'expo-image-picker'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../contexts/AuthContext'
import { useForumPosts } from '../lib/queries/studentForum'
import type { ForumPostRow } from '../lib/queries/studentForum'
import { ForumConversation, useForumDMs } from '../lib/queries/useForumDMs'
import { useForumNotifications } from '../lib/queries/useForumNotifications'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────
// Editorial Design Tokens — warm orange palette
// ─────────────────────────────────────────────────────────────────
const T = {
  // Backgrounds — warm dark editorial
  bg:       '#07080c',
  bg2:      '#0e0f14',
  bg3:      '#16171e',
  bg4:      '#1e1f28',
  surface:  '#191a22',
  raised:   '#1e2029',

  // Borders
  border:   'rgba(236,91,19,0.12)',
  border2:  'rgba(236,91,19,0.20)',
  borderSub:'rgba(255,255,255,0.06)',

  // Text
  text:     '#f0ede8',
  textSub:  '#9a9590',
  muted:    '#5e5b56',
  muted2:   '#b0ada8',

  // Brand — editorial orange
  accent:   '#ec5b13',
  accentDim:'rgba(236,91,19,0.14)',
  accentGlow:'rgba(236,91,19,0.30)',
  gold:     '#d4a843',
  goldDim:  'rgba(212,168,67,0.14)',

  // Semantic
  green:    '#2ecc7a',
  red:      '#e8445a',
  amber:    '#f0b429',
  blue:     '#3b82f6',
} as const

const CT_MEDIA_BUCKET = 'ct-media'
const MAX_CHARS = 280
const { width: SW } = Dimensions.get('window')

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
type Post = {
  id: string
  isSeed?: boolean
  type: 'normal' | 'repost' | 'poll' | 'quote'
  repostedBy?: string
  authorId?: string
  name: string
  handle: string
  verified: boolean
  time: string
  avatar: string
  avatarGrad: [string, string]
  avatarUri: string | null
  text: string
  poll?: { label: string; pct: number; winning?: boolean }[]
  pollMeta?: string
  quote?: { name: string; handle: string; avatarGrad: [string, string]; text: string }
  imageUrl?: string | null
  replies: number
  reposts: number
  likes: number
  views: string | number
  bookmarks: number
  liked: boolean
  reposted: boolean
  bookmarked: boolean
}

type Reply = {
  id: string
  postId: string
  name: string
  handle: string
  initials: string
  grad: readonly [string, string]
  avatarUri?: string | null
  verified: boolean
  text: string
  likes: number
  time: string
}

type Notif = {
  id: string
  type: 'like' | 'reply' | 'repost' | 'follow'
  actorName: string
  actorHandle: string
  actorInitials: string
  actorGrad: [string, string]
  actorAvatar: string | null
  postPreview: string | null
  read: boolean
  time: string
}

type UserProfile = {
  userId: string
  name: string
  handle: string
  initials: string
  grad: [string, string]
  avatarUri: string | null
  collegeId: string | null
  classId: string | null
  verified: boolean
}

const DEFAULT_PROFILE: UserProfile = {
  userId: '',
  name: 'You',
  handle: '@you',
  initials: 'YO',
  grad: ['#ec5b13', '#d4a843'] as [string, string],
  avatarUri: null,
  collegeId: null,
  classId: null,
  verified: false,
}

const TRENDING = [
  { tag: '#FinalsWeek',     category: 'Education',   count: '14.2K posts' },
  { tag: '#CampusFest2025', category: 'Campus Life', count: '8.4K posts'  },
  { tag: '#LibraryHours',   category: 'Academic',    count: '3.1K posts'  },
  { tag: '#StudentHousing', category: 'Housing',     count: '2.8K posts'  },
  { tag: '#FootballMatchday',category: 'Sports',     count: '1.5K posts'  },
]

type WhoItem = {
  id: string; name: string; handle: string; role: string
  initials: string; grad: readonly [string, string]; verified: boolean; following: boolean
}
const WHO_TO_FOLLOW: WhoItem[] = [
  { id: 'sm', name: 'Sarah Mitchell', handle: '@sarah_mit', role: 'CS Major',  initials: 'SM', grad: ['#ec5b13','#d4a843'] as [string,string], verified: true,  following: false },
  { id: 'pk', name: 'Prof. K. Osei',  handle: '@profosei',  role: 'Lecturer', initials: 'PK', grad: ['#2ecc7a','#3b82f6'] as [string,string], verified: false, following: false },
  { id: 'su', name: 'Student Union',  handle: '@studentunion',role: 'Official',initials: 'SU', grad: ['#7856ff','#3b82f6'] as [string,string], verified: true,  following: true  },
  { id: 'ab', name: 'Alex Brown',     handle: '@alex_b25',  role: 'Law Year 2',initials: 'AB', grad: ['#d4a843','#ec5b13'] as [string,string], verified: false, following: false },
]

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
function fmt(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n) }
function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime(), sv = Math.floor(d / 1000)
  if (sv < 60) return `${sv}s`; if (sv < 3600) return `${Math.floor(sv / 60)}m`
  if (sv < 86400) return `${Math.floor(sv / 3600)}h`; return `${Math.floor(sv / 86400)}d`
}

function rowToPost(row: any, myL: Set<string>, myR: Set<string>, myB: Set<string>): Post {
  return {
    id: row.id, isSeed: false,
    type: (row.post_type as Post['type']) || 'normal',
    authorId: row.user_id || row.author_id,
    name: row.author_name || row.profiles?.full_name || 'Anonymous',
    handle: row.author_handle || `@${(row.author_name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    verified: row.author_verified || row.profiles?.is_verified || false,
    time: timeAgo(row.created_at),
    avatar: row.author_initials || row.profiles?.full_name?.slice(0, 2).toUpperCase() || '??',
    avatarGrad: (row.author_grad || ['#ec5b13', '#d4a843']) as [string, string],
    avatarUri: row.author_avatar_url || row.profiles?.avatar_url || null,
    text: row.body || '',
    imageUrl: row.image_url || null,
    replies: row.comment_count || 0, reposts: row.repost_count || 0,
    likes: row.upvotes || row.like_count || 0,
    views: fmt(row.view_count || row.upvotes || 0),
    bookmarks: row.bookmark_count || 0,
    liked: myL.has(row.id), reposted: myR.has(row.id), bookmarked: myB.has(row.id),
  }
}

function forumPostToPost(row: ForumPostRow): Post {
  return {
    id: row.id, isSeed: false, type: 'normal' as const,
    authorId: row.author_id || undefined,
    name: row.profiles?.full_name || 'Anonymous',
    handle: (row.profiles as any)?.forum_handle ? `@${(row.profiles as any).forum_handle}` : `@user`,
    verified: !!row.profiles?.is_verified,
    time: timeAgo(row.created_at),
    avatar: row.profiles?.full_name?.slice(0, 2).toUpperCase() || '??',
    avatarGrad: ['#ec5b13', '#d4a843'] as [string, string],
    avatarUri: row.profiles?.avatar_url || null,
    text: row.body, imageUrl: row.image_url || null,
    replies: row.comment_count || 0, reposts: 0,
    likes: row.upvotes || 0, views: fmt(row.upvotes || 0),
    bookmarks: 0, liked: false, reposted: false, bookmarked: false,
  }
}

function rowToReply(row: any): Reply {
  return {
    id: row.id, postId: row.post_id, name: row.author_name, handle: row.author_handle,
    initials: row.author_initials, grad: (row.author_grad ?? ['#ec5b13', '#d4a843']) as [string, string],
    avatarUri: row.author_avatar_url ?? null, verified: row.author_verified,
    text: row.body, likes: row.like_count ?? 0, time: timeAgo(row.created_at),
  }
}

function rowToNotif(row: any): Notif {
  return {
    id: row.id, type: row.type,
    actorName: row.actor_name ?? 'Someone', actorHandle: row.actor_handle ?? '',
    actorInitials: row.actor_initials ?? '??',
    actorGrad: (row.actor_grad ?? ['#ec5b13', '#d4a843']) as [string, string],
    actorAvatar: row.actor_avatar_url ?? null,
    postPreview: row.post_preview ?? null, read: row.read,
    time: timeAgo(row.created_at),
  }
}

const NOTIF_META: { [k: string]: { icon: string; color: string; verb: string } } = {
  like:   { icon: '❤️', color: T.red,    verb: 'liked your post'    },
  reply:  { icon: '💬', color: T.accent, verb: 'replied to your post'},
  repost: { icon: '🔄', color: T.green,  verb: 'reposted your post'  },
  follow: { icon: '👤', color: T.gold,   verb: 'followed you'        },
}

// ─────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────

// RichText
function RichText({ text, style, onHashtag }: { text: string; style?: any; onHashtag?: (tag: string) => void }) {
  const parts = text.split(/(#\w+|@\w+)/g)
  return (
    <Text style={[s.postText, style]}>
      {parts.map((p, i) => {
        if (p.startsWith('#')) return <Text key={i} style={{ color: T.accent, fontWeight: '600' }} onPress={() => onHashtag?.(p)}>{p}</Text>
        if (p.startsWith('@')) return <Text key={i} style={{ color: T.accent, fontWeight: '600' }}>{p}</Text>
        return p
      })}
    </Text>
  )
}

// Avatar
function Avi({ initials, grad, size = 40, uri, verified = false }: {
  initials: string; grad: readonly [string, string]; size?: number; uri?: string | null; verified?: boolean
}) {
  return (
    <View style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <LinearGradient colors={grad as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, justifyContent: 'center', alignItems: 'center' }}>
        {uri
          ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, position: 'absolute' }} />
          : <Text style={{ fontSize: size * 0.34, fontWeight: '800', color: '#fff', letterSpacing: -0.3 }}>{initials}</Text>}
      </LinearGradient>
      {verified && (
        <View style={{ position: 'absolute', bottom: -1, right: -1, width: 15, height: 15, borderRadius: 8, backgroundColor: T.accent, borderWidth: 2, borderColor: T.bg, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 8, color: '#fff', fontWeight: '800' }}>✓</Text>
        </View>
      )}
    </View>
  )
}

// Action button
type AV = 'reply' | 'repost' | 'like' | 'bookmark' | 'share'
const AC: Record<AV, string> = { reply: T.accent, repost: T.green, like: T.red, bookmark: T.gold, share: T.accent }

function ActionBtn({ variant, icon, activeIcon, label, active, onPress }: {
  variant: AV; icon: string; activeIcon?: string; label?: string | number; active?: boolean; onPress: () => void
}) {
  const scale = useRef(new Animated.Value(1)).current
  const col = active ? AC[variant] : T.muted
  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.35, useNativeDriver: true, speed: 60, bounciness: 0 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 12 }),
    ]).start()
    onPress()
  }
  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7} style={s.action}>
      <Animated.Text style={[s.actionIcon, { color: col, transform: [{ scale }] }]}>{active && activeIcon ? activeIcon : icon}</Animated.Text>
      {label !== undefined && Number(label) > 0 && <Text style={[s.actionCount, { color: col }]}>{fmt(Number(label))}</Text>}
    </TouchableOpacity>
  )
}

// Poll
type PollOpt = { label: string; pct: number; winning?: boolean }
function Poll({ options, meta, onVote }: { options: PollOpt[]; meta?: string; onVote: (i: number) => void }) {
  return (
    <View style={s.poll}>
      {options.map((opt, i) => (
        <TouchableOpacity key={i} onPress={() => onVote(i)} activeOpacity={0.85}
          style={[s.pollOption, opt.winning && { borderColor: T.accent }]}>
          <View style={[s.pollBar, { width: `${opt.pct}%` as any, backgroundColor: opt.winning ? T.accentDim : 'rgba(255,255,255,0.04)' }]} />
          <Text style={s.pollLabel}>{opt.label}</Text>
          <Text style={s.pollPct}>{opt.pct}%</Text>
        </TouchableOpacity>
      ))}
      {meta && <Text style={s.pollMeta}>{meta}</Text>}
    </View>
  )
}

// Quote box
type Quote = { name: string; handle: string; avatarGrad: [string, string]; text: string }
function QuoteBox({ q }: { q: Quote }) {
  return (
    <View style={s.quoteBox}>
      <View style={s.quoteHeader}>
        <LinearGradient colors={q.avatarGrad as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.quoteAvi}>
          <Text style={{ fontSize: 8, fontWeight: '700', color: '#fff' }}>{q.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</Text>
        </LinearGradient>
        <Text style={s.quoteName}>{q.name}</Text>
        <Text style={s.quoteHandle}>{q.handle}</Text>
      </View>
      <Text style={s.quoteText} numberOfLines={3}>{q.text}</Text>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────
// PostCard — editorial style with left accent bar
// ─────────────────────────────────────────────────────────────────
function PostCard({ post, onLike, onRepost, onBookmark, onReply, onShare, onOpen, onVote, onHashtag, onAvatarPress }: {
  post: Post; onLike: (id: string) => void; onRepost: (id: string) => void; onBookmark: (id: string) => void;
  onReply: (p: Post) => void; onShare: (p: Post) => void; onOpen: (p: Post) => void; onVote: (id: string, i: number) => void;
  onHashtag?: (tag: string) => void; onAvatarPress?: (userId: string, name: string) => void
}) {
  return (
    <View>
      {post.type === 'repost' && post.repostedBy && (
        <View style={s.repostLabel}>
          <Ionicons name="repeat" size={12} color={T.green} />
          <Text style={s.repostLabelText}>{post.repostedBy} reposted</Text>
        </View>
      )}
      <TouchableOpacity activeOpacity={0.97} onPress={() => onOpen(post)} style={s.post}>
        {/* Left accent bar */}
        <View style={s.postAccent} />
        <View style={s.postLeft}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => onAvatarPress?.(post.authorId ?? post.handle, post.name)}>
            <Avi initials={post.avatar} grad={post.avatarGrad} size={42} uri={post.avatarUri} verified={post.verified} />
          </TouchableOpacity>
          {post.replies > 0 && <View style={s.threadLine} />}
        </View>
        <View style={s.postBody}>
          <View style={s.postHeader}>
            <TouchableOpacity onPress={() => onAvatarPress?.(post.authorId ?? post.handle, post.name)} activeOpacity={0.7} style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <Text style={s.postName} numberOfLines={1}>{post.name}</Text>
                {post.verified && <Ionicons name="checkmark-circle" size={14} color={T.accent} />}
                <Text style={s.postHandle} numberOfLines={1}>{post.handle}</Text>
                <Text style={s.postDot}>·</Text>
                <Text style={s.postTime}>{post.time}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="ellipsis-horizontal" size={16} color={T.muted} />
            </TouchableOpacity>
          </View>
          <RichText text={post.text} onHashtag={onHashtag} />
          {post.type === 'poll' && post.poll && <Poll options={post.poll} meta={post.pollMeta} onVote={i => onVote(post.id, i)} />}
          {post.type === 'quote' && post.quote && <QuoteBox q={post.quote} />}
          {post.imageUrl && (
            <View style={s.postImageWrap}>
              <Image source={{ uri: post.imageUrl }} style={s.postImage} resizeMode="cover" />
            </View>
          )}
          <View style={s.postActions}>
            <ActionBtn variant="reply"    icon="💬" label={post.replies}   onPress={() => onReply(post)} />
            <ActionBtn variant="repost"   icon="🔄" label={post.reposts}   active={post.reposted}   onPress={() => onRepost(post.id)} />
            <ActionBtn variant="like"     icon="🤍" activeIcon="❤️" label={post.likes} active={post.liked} onPress={() => onLike(post.id)} />
            <ActionBtn variant="bookmark" icon="🏷️" activeIcon="🔖" active={post.bookmarked} onPress={() => onBookmark(post.id)} />
            <ActionBtn variant="share"    icon="📤" label={post.views as any} onPress={() => onShare(post)} />
          </View>
        </View>
      </TouchableOpacity>
      <View style={s.divider} />
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────
// InlineComposer — editorial style
// ─────────────────────────────────────────────────────────────────
function InlineComposer({ onFocus, onPost, profile }: {
  onFocus: () => void; onPost: (text: string, img?: string) => void; profile: UserProfile
}) {
  const [text, setText] = useState('')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const remaining = MAX_CHARS - text.length
  const charColor = remaining < 20 ? T.red : remaining < 50 ? T.amber : T.muted

  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: true })
    if (!r.canceled && r.assets[0]) setImageUri(r.assets[0].uri)
  }

  return (
    <View style={ic.composer}>
      <Avi initials={profile.initials} grad={profile.grad} size={42} uri={profile.avatarUri} />
      <View style={ic.body}>
        <TextInput
          style={ic.input}
          placeholder="What's happening on campus?"
          placeholderTextColor={T.muted}
          multiline value={text} onChangeText={setText}
          onFocus={onFocus} maxLength={MAX_CHARS + 10}
        />
        {imageUri && (
          <View style={{ marginBottom: 8, position: 'relative' }}>
            <Image source={{ uri: imageUri }} style={{ width: '100%', borderRadius: 12, aspectRatio: 16 / 9 }} resizeMode="cover" />
            <TouchableOpacity onPress={() => setImageUri(null)} style={ic.imgRemove}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={ic.actions}>
          <TouchableOpacity style={ic.toolBtn} onPress={pickImage}>
            <Ionicons name="image-outline" size={18} color={T.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={ic.toolBtn}>
            <Ionicons name="bar-chart-outline" size={18} color={T.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={ic.toolBtn}>
            <Ionicons name="happy-outline" size={18} color={T.accent} />
          </TouchableOpacity>
          <Text style={[ic.charCount, { color: charColor }]}>{remaining}</Text>
          <TouchableOpacity
            style={[ic.sendBtn, !text.trim() && { opacity: 0.4 }]}
            onPress={() => { if (text.trim()) { onPost(text.trim(), imageUri ?? undefined); setText(''); setImageUri(null) } }}
            disabled={!text.trim()}
          >
            <Text style={ic.sendBtnText}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────
// ComposeModal — full-screen editorial layout matching mockup
// ─────────────────────────────────────────────────────────────────
function ComposeModal({ visible, onClose, onPost, replyTo, profile }: {
  visible: boolean; onClose: () => void; onPost: (text: string, img?: string) => void;
  replyTo: Post | null; profile: UserProfile
}) {
  const insets = useSafeAreaInsets()
  const [text, setText] = useState('')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<'Everyone' | 'Followers' | 'Campus Only'>('Everyone')
  const [allowReplies, setAllowReplies] = useState(true)
  const inputRef = useRef<TextInput>(null)
  const remaining = MAX_CHARS - text.length
  const charColor = remaining < 20 ? T.red : remaining < 50 ? T.amber : T.muted

  useEffect(() => {
    if (visible) { setText(''); setImageUri(null); setTimeout(() => inputRef.current?.focus(), 350) }
  }, [visible])

  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: true })
    if (!r.canceled && r.assets[0]) setImageUri(r.assets[0].uri)
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: T.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* Header */}
        <View style={[cm.header, { paddingTop: insets.top + 4 }]}>
          <TouchableOpacity style={cm.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={T.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, paddingHorizontal: 12 }}>
            <Text style={cm.headerTitle}>{replyTo ? 'Reply' : 'New Post'}</Text>
          </View>
          <TouchableOpacity
            style={[cm.postBtn, !text.trim() && { opacity: 0.4 }]}
            onPress={() => { if (text.trim()) { onPost(text.trim(), imageUri ?? undefined); onClose() } }}
            disabled={!text.trim()}
          >
            <Text style={cm.postBtnText}>{replyTo ? 'Reply' : 'Post'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          {/* Reply context */}
          {replyTo && (
            <View style={cm.replyCtx}>
              <Avi initials={replyTo.avatar} grad={replyTo.avatarGrad} size={36} uri={replyTo.avatarUri} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={cm.replyCtxLabel}>Replying to <Text style={{ color: T.accent }}>{replyTo.handle}</Text></Text>
                <Text style={cm.replyCtxSnippet} numberOfLines={2}>{replyTo.text}</Text>
              </View>
            </View>
          )}

          {/* Main compose row */}
          <View style={cm.row}>
            <Avi initials={profile.initials} grad={profile.grad} size={44} uri={profile.avatarUri} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <TextInput
                ref={inputRef}
                style={cm.input}
                placeholder={replyTo ? 'Post your reply…' : "What's on your mind? Share a resource or ask a question…"}
                placeholderTextColor={T.muted}
                multiline value={text} onChangeText={setText}
                maxLength={MAX_CHARS + 10}
              />
              {imageUri && (
                <View style={{ marginTop: 10, position: 'relative' }}>
                  <Image source={{ uri: imageUri }} style={{ width: '100%', borderRadius: 14, aspectRatio: 16 / 9 }} resizeMode="cover" />
                  <TouchableOpacity onPress={() => setImageUri(null)} style={cm.imgRemove}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              <Text style={cm.hint}>🌍 {visibility} can reply</Text>
            </View>
          </View>

          {/* Attachment cards — editorial grid matching mockup */}
          <View style={cm.attachSection}>
            <Text style={cm.attachLabel}>Enhance your post</Text>
            <View style={cm.attachGrid}>
              <TouchableOpacity style={cm.attachCard} onPress={pickImage} activeOpacity={0.8}>
                <Ionicons name="image-outline" size={28} color={T.accent} />
                <Text style={cm.attachCardText}>Add Images</Text>
              </TouchableOpacity>
              <TouchableOpacity style={cm.attachCard} activeOpacity={0.8}>
                <Ionicons name="bar-chart-outline" size={28} color={T.accent} />
                <Text style={cm.attachCardText}>Create Poll</Text>
              </TouchableOpacity>
              <TouchableOpacity style={cm.attachCard} activeOpacity={0.8}>
                <Ionicons name="attach-outline" size={28} color={T.accent} />
                <Text style={cm.attachCardText}>Upload File</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Post settings */}
          <View style={cm.settingsCard}>
            <View style={cm.settingsRow}>
              <View style={{ flex: 1 }}>
                <Text style={cm.settingsLabel}>Visibility</Text>
                <Text style={cm.settingsSub}>Who can see and reply to this post</Text>
              </View>
              <View style={cm.visibilityPills}>
                {(['Everyone', 'Followers', 'Campus Only'] as const).map(v => (
                  <TouchableOpacity key={v} style={[cm.visPill, visibility === v && cm.visPillActive]} onPress={() => setVisibility(v)}>
                    <Text style={[cm.visPillText, visibility === v && cm.visPillTextActive]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={[cm.settingsRow, { borderTopWidth: 1, borderTopColor: T.border, marginTop: 12, paddingTop: 14 }]}>
              <View style={{ flex: 1 }}>
                <Text style={cm.settingsLabel}>Allow Replies</Text>
                <Text style={cm.settingsSub}>Enable community discussion</Text>
              </View>
              <TouchableOpacity
                style={[cm.toggle, allowReplies && cm.toggleActive]}
                onPress={() => setAllowReplies(p => !p)}
              >
                <View style={[cm.toggleThumb, allowReplies && cm.toggleThumbActive]} />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Bottom toolbar */}
        <View style={[cm.toolbar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }]}>
          <TouchableOpacity style={cm.toolBtn} onPress={pickImage}>
            <Ionicons name="image-outline" size={20} color={T.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={cm.toolBtn}>
            <Ionicons name="bar-chart-outline" size={20} color={T.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={cm.toolBtn}>
            <Ionicons name="attach-outline" size={20} color={T.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={cm.toolBtn}>
            <Ionicons name="link-outline" size={20} color={T.accent} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={cm.charTrack}>
            <Text style={[cm.charCount, { color: charColor }]}>{remaining}</Text>
            <View style={cm.charBarBg}>
              <View style={[cm.charBarFill, {
                width: `${Math.min(100, ((MAX_CHARS - remaining) / MAX_CHARS) * 100)}%` as any,
                backgroundColor: remaining < 20 ? T.red : T.accent,
              }]} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// ThreadModal — post detail matching mockup with sticky reply bar
// ─────────────────────────────────────────────────────────────────
function ThreadModal({ post, visible, onClose, onLike, onRepost, onBookmark, onShare, profile, onNewReply }: {
  post: Post | null; visible: boolean; onClose: () => void; onLike: (id: string) => void;
  onRepost: (id: string) => void; onBookmark: (id: string) => void; onShare: (p: Post) => void;
  profile: UserProfile; onNewReply: (postId: string) => void
}) {
  const insets = useSafeAreaInsets()
  const [showReply, setShowReply] = useState(false)
  const [replies, setReplies] = useState<Reply[]>([])
  const [loadingReplies, setLoadingReplies] = useState(false)
  const [replyText, setReplyText] = useState('')

  useEffect(() => {
    if (!post || !visible) return
    loadReplies(post.id)
    const ch = supabase.channel(`replies_${post.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ct_replies', filter: `post_id=eq.${post.id}` },
        payload => setReplies(prev => [...prev, rowToReply(payload.new)]))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [post?.id, visible])

  const loadReplies = async (postId: string) => {
    setLoadingReplies(true)
    const { data } = await supabase.from('ct_replies').select('*').eq('post_id', postId).order('created_at', { ascending: true })
    setLoadingReplies(false)
    if (data) setReplies(data.map(rowToReply))
  }

  const handleReply = async (text: string) => {
    if (!post || !profile.userId) return
    setShowReply(false); setReplyText('')
    const temp: Reply = {
      id: `temp-${Date.now()}`, postId: post.id, name: profile.name, handle: profile.handle,
      initials: profile.initials, grad: profile.grad, avatarUri: profile.avatarUri,
      verified: profile.verified, text, likes: 0, time: 'now'
    }
    setReplies(prev => [...prev, temp])
    onNewReply(post.id)
    const { data, error } = await supabase.from('ct_replies').insert({
      post_id: post.id, user_id: profile.userId, author_name: profile.name,
      author_handle: profile.handle, author_initials: profile.initials,
      author_grad: profile.grad, author_verified: profile.verified,
      author_avatar_url: profile.avatarUri, body: text,
    }).select().single()
    if (!error && data) setReplies(prev => prev.map(r => r.id === temp.id ? rowToReply(data) : r))
  }

  const quickReply = async () => {
    if (!replyText.trim()) return
    await handleReply(replyText.trim())
  }

  if (!post) return null

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg }}>

        {/* Header — back + title */}
        <View style={[th.header, { paddingTop: insets.top + 4 }]}>
          <TouchableOpacity style={th.backBtn} onPress={onClose}>
            <Ionicons name="arrow-back" size={20} color={T.text} />
          </TouchableOpacity>
          <Text style={th.title}>Post</Text>
          <TouchableOpacity style={th.backBtn}>
            <Ionicons name="ellipsis-horizontal" size={18} color={T.muted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {/* Expanded post */}
          <View style={th.expanded}>
            {/* Author row */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16, alignItems: 'center' }}>
              <Avi initials={post.avatar} grad={post.avatarGrad} size={50} uri={post.avatarUri} verified={post.verified} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={th.expName}>{post.name}</Text>
                  {post.verified && <Ionicons name="checkmark-circle" size={16} color={T.accent} />}
                </View>
                <Text style={th.expHandle}>{post.handle}</Text>
              </View>
              <TouchableOpacity style={th.followBtn}>
                <Text style={th.followBtnText}>Follow</Text>
              </TouchableOpacity>
            </View>

            {/* Post body */}
            <RichText text={post.text} style={th.expText} />
            {post.type === 'poll' && post.poll && <Poll options={post.poll} meta={post.pollMeta} onVote={() => { }} />}
            {post.type === 'quote' && post.quote && <QuoteBox q={post.quote} />}
            {post.imageUrl && (
              <View style={th.imgWrap}>
                <Image source={{ uri: post.imageUrl }} style={th.img} resizeMode="cover" />
              </View>
            )}

            {/* Timestamp + views */}
            <View style={th.metaRow}>
              <Text style={th.metaText}>
                {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={th.metaDot}>·</Text>
              <Text style={th.metaText}>
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </Text>
              <Text style={th.metaDot}>·</Text>
              <Text style={[th.metaText, { color: T.text, fontWeight: '700' }]}>{post.views}</Text>
              <Text style={th.metaText}> Views</Text>
            </View>

            {/* Stats row */}
            {(post.likes > 0 || post.reposts > 0) && (
              <View style={th.statsRow}>
                {post.reposts > 0 && (
                  <Text style={th.statItem}><Text style={th.statNum}>{fmt(post.reposts)}</Text> Reposts</Text>
                )}
                {post.likes > 0 && (
                  <Text style={th.statItem}><Text style={th.statNum}>{fmt(post.likes)}</Text> Likes</Text>
                )}
                {post.bookmarks > 0 && (
                  <Text style={th.statItem}><Text style={th.statNum}>{fmt(post.bookmarks)}</Text> Saves</Text>
                )}
              </View>
            )}

            {/* Actions */}
            <View style={[s.postActions, th.expActions]}>
              <ActionBtn variant="reply"    icon="💬" label={post.replies}   onPress={() => setShowReply(true)} />
              <ActionBtn variant="repost"   icon="🔄" label={post.reposts}   active={post.reposted}   onPress={() => onRepost(post.id)} />
              <ActionBtn variant="like"     icon="🤍" activeIcon="❤️" label={post.likes} active={post.liked} onPress={() => onLike(post.id)} />
              <ActionBtn variant="bookmark" icon="🏷️" activeIcon="🔖" active={post.bookmarked} onPress={() => onBookmark(post.id)} />
              <ActionBtn variant="share"    icon="📤" onPress={() => onShare(post)} />
            </View>
          </View>

          <View style={s.divider} />

          {/* Replies */}
          {loadingReplies ? (
            <View style={{ alignItems: 'center', paddingTop: 32 }}>
              <ActivityIndicator color={T.accent} />
            </View>
          ) : replies.length === 0 ? (
            <View style={th.emptyReplies}>
              <Text style={{ fontSize: 32, marginBottom: 10 }}>💬</Text>
              <Text style={th.emptyTitle}>No replies yet</Text>
              <TouchableOpacity onPress={() => setShowReply(true)}>
                <Text style={{ color: T.accent, fontSize: 14, marginTop: 8, fontWeight: '600' }}>Be the first to reply</Text>
              </TouchableOpacity>
            </View>
          ) : (
            replies.map(reply => (
              <View key={reply.id}>
                <View style={s.post}>
                  <View style={[s.postAccent, { backgroundColor: 'transparent' }]} />
                  <View style={s.postLeft}>
                    <Avi initials={reply.initials} grad={reply.grad} size={38} uri={reply.avatarUri} verified={reply.verified} />
                  </View>
                  <View style={s.postBody}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                      <Text style={s.postName} numberOfLines={1}>{reply.name}</Text>
                      {reply.verified && <Ionicons name="checkmark-circle" size={13} color={T.accent} />}
                      <Text style={s.postHandle} numberOfLines={1}>{reply.handle}</Text>
                      <Text style={s.postDot}>·</Text>
                      <Text style={s.postTime}>{reply.time}</Text>
                    </View>
                    <RichText text={reply.text} />
                  </View>
                </View>
                <View style={s.divider} />
              </View>
            ))
          )}
        </ScrollView>

        {/* Sticky reply bar — matching mockup bottom bar */}
        <View style={[th.replyBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }]}>
          <Avi initials={profile.initials} grad={profile.grad} size={36} uri={profile.avatarUri} />
          <View style={th.replyInputWrap}>
            <TextInput
              style={th.replyInput}
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Post your reply"
              placeholderTextColor={T.muted}
              onFocus={() => setShowReply(true)}
            />
          </View>
          <TouchableOpacity
            style={[th.replyPostBtn, !replyText.trim() && { opacity: 0.4 }]}
            onPress={quickReply}
            disabled={!replyText.trim()}
          >
            <Text style={th.replyPostBtnText}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ComposeModal
        visible={showReply}
        onClose={() => setShowReply(false)}
        replyTo={post}
        onPost={handleReply}
        profile={profile}
      />
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// ProfileCardModal — editorial profile matching mockup
// ─────────────────────────────────────────────────────────────────
type ProfileUser = {
  id: string; fullName: string; handle: string; initials: string
  grad: [string, string]; avatar: string | null; verified: boolean; bio: string | null
  college: string | null; className: string | null
  followersCount: number; followingCount: number; postsCount: number
}

type Conversation = {
  id: string; otherId: string; otherName: string; otherHandle: string
  otherInitials: string; otherGrad: [string, string]; otherAvatar: string | null
  lastMessage: string | null; lastMessageAt: string | null; unread: number
}

function ProfileCardModal({ userId, visible, onClose, currentUserId, onHashtag, onLike, onRepost, onBookmark, onShare, onOpen, onVote, onStartDM }: {
  userId: string | null; visible: boolean; onClose: () => void; currentUserId: string;
  onHashtag?: (tag: string) => void; onLike: (id: string) => void; onRepost: (id: string) => void;
  onBookmark: (id: string) => void; onShare: (p: Post) => void; onOpen: (p: Post) => void;
  onVote: (id: string, i: number) => void; onStartDM?: (conv: Conversation) => void;
}) {
  const insets = useSafeAreaInsets()
  const [user, setUser] = useState<ProfileUser | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)
  const [following, setFollowing] = useState(false)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [followLoading, setFollowLoading] = useState(false)
  const isOwnProfile = userId === currentUserId

  useEffect(() => {
    if (!visible || !userId) return
    setUser(null); setPosts([]); setLoading(true); setFollowing(false)
    loadProfile(userId)
  }, [visible, userId])

  const loadProfile = async (uid: string) => {
    const [profRes, postsRes, followRes] = await Promise.all([
      supabase.from('profiles')
        .select('id,full_name,forum_handle,forum_initials,forum_grad,avatar_url,is_verified,bio,followers_count,following_count,colleges(name),classes(name)')
        .eq('id', uid).single(),
      supabase.from('ct_posts').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(20),
      currentUserId
        ? supabase.from('ct_follows').select('follower_id', { count: 'exact', head: true })
          .eq('follower_id', currentUserId).eq('following_id', uid)
        : Promise.resolve({ count: 0 }),
    ])
    setLoading(false)
    if (profRes.data) {
      const d = profRes.data as any
      setUser({
        id: d.id,
        fullName: d.full_name ?? 'User',
        handle: d.forum_handle ?? `@${(d.full_name ?? 'user').toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        initials: d.forum_initials ?? '??',
        grad: (d.forum_grad ?? ['#ec5b13', '#d4a843']) as [string, string],
        avatar: d.avatar_url ?? null,
        verified: d.is_verified ?? false,
        bio: d.bio ?? null,
        college: (d.colleges as any)?.name ?? null,
        className: (d.classes as any)?.name ?? null,
        followersCount: d.followers_count ?? 0,
        followingCount: d.following_count ?? 0,
        postsCount: 0,
      })
      setFollowersCount(d.followers_count ?? 0)
      setFollowingCount(d.following_count ?? 0)
    }
    if ((followRes as any).count != null) setFollowing((followRes as any).count > 0)
    if (postsRes.data) {
      const myL = new Set<string>(), myR = new Set<string>(), myB = new Set<string>()
      if (currentUserId) {
        const [lR, rR, bR] = await Promise.all([
          supabase.from('ct_likes').select('post_id').eq('user_id', currentUserId),
          supabase.from('ct_reposts').select('post_id').eq('user_id', currentUserId),
          supabase.from('ct_bookmarks').select('post_id').eq('user_id', currentUserId),
        ])
        ;(lR.data ?? []).forEach((r: any) => myL.add(r.post_id))
        ;(rR.data ?? []).forEach((r: any) => myR.add(r.post_id))
        ;(bR.data ?? []).forEach((r: any) => myB.add(r.post_id))
      }
      setPosts(postsRes.data.map(row => rowToPost(row, myL, myR, myB)))
    }
  }

  const handleFollowToggle = async () => {
    if (!userId || !currentUserId || followLoading) return
    setFollowLoading(true)
    const nowFollowing = !following
    setFollowing(nowFollowing)
    setFollowersCount(c => c + (nowFollowing ? 1 : -1))
    if (nowFollowing) {
      await supabase.from('ct_follows').insert({ follower_id: currentUserId, following_id: userId })
    } else {
      await supabase.from('ct_follows').delete().match({ follower_id: currentUserId, following_id: userId })
    }
    setFollowLoading(false)
  }

  if (!user && !loading) return null

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg }}>

        {/* Cover gradient header */}
        {user && (
          <LinearGradient
            colors={[...user.grad, T.bg2]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[pf.cover, { paddingTop: insets.top }]}
          >
            <View style={pf.coverNav}>
              <TouchableOpacity style={pf.navBtn} onPress={onClose}>
                <Ionicons name="arrow-back" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={pf.navBtn}>
                <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        )}

        {loading && !user ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={T.accent} size="large" />
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={p => p.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
            ListHeaderComponent={user ? (
              <View>
                {/* Avatar + action row */}
                <View style={pf.avatarRow}>
                  <View style={pf.avatarRing}>
                    <LinearGradient colors={user.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={pf.avatarGrad}>
                      {user.avatar
                        ? <Image source={{ uri: user.avatar }} style={pf.avatarImg} />
                        : <Text style={pf.avatarInitials}>{user.initials}</Text>}
                    </LinearGradient>
                  </View>
                  {!isOwnProfile && (
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                      <TouchableOpacity style={pf.msgBtn} onPress={async () => {
                        if (!currentUserId || !userId) return
                        const { data } = await supabase.rpc('ct_get_or_create_conversation', { user_a: currentUserId, user_b: userId })
                        if (data && onStartDM) onStartDM({
                          id: data, otherId: userId,
                          otherName: user?.fullName ?? 'User', otherHandle: user?.handle ?? '',
                          otherInitials: user?.initials ?? '??', otherGrad: user?.grad ?? ['#ec5b13', '#d4a843'],
                          otherAvatar: user?.avatar ?? null, lastMessage: null, lastMessageAt: null, unread: 0,
                        })
                      }}>
                        <Ionicons name="mail-outline" size={18} color={T.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[pf.followBtn, following && pf.followBtnActive, followLoading && { opacity: 0.6 }]}
                        onPress={handleFollowToggle} disabled={followLoading}
                      >
                        <Text style={[pf.followBtnText, following && pf.followBtnTextActive]}>
                          {following ? 'Following' : 'Follow'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Bio */}
                <View style={pf.info}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Text style={pf.name}>{user.fullName}</Text>
                    {user.verified && <Ionicons name="checkmark-circle" size={20} color={T.accent} />}
                  </View>
                  <Text style={pf.handle}>{user.handle}</Text>
                  {(user.college || user.className) && (
                    <Text style={pf.collegeLine}>
                      {[user.college, user.className].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  {user.bio && <Text style={pf.bio}>{user.bio}</Text>}
                </View>

                {/* Stats row — matching mockup */}
                <View style={pf.statsRow}>
                  <View style={pf.statItem}>
                    <Text style={pf.statNum}>{fmt(followingCount)}</Text>
                    <Text style={pf.statLabel}>Following</Text>
                  </View>
                  <View style={pf.statDivider} />
                  <View style={pf.statItem}>
                    <Text style={pf.statNum}>{fmt(followersCount)}</Text>
                    <Text style={pf.statLabel}>{followersCount === 1 ? 'Follower' : 'Followers'}</Text>
                  </View>
                  <View style={pf.statDivider} />
                  <View style={pf.statItem}>
                    <Text style={pf.statNum}>{posts.length}</Text>
                    <Text style={pf.statLabel}>Posts</Text>
                  </View>
                  <View style={pf.statDivider} />
                  <View style={pf.statItem}>
                    <Text style={[pf.statNum, { color: T.accent }]}>Top 5%</Text>
                    <Text style={pf.statLabel}>Study Rank</Text>
                  </View>
                </View>

                {/* Posts label */}
                <View style={pf.postsLabel}>
                  <View style={pf.postsLabelLine} />
                  <Text style={pf.postsLabelText}>RECENT POSTS</Text>
                </View>
                <View style={{ height: 1, backgroundColor: T.border }} />
              </View>
            ) : null}
            ListEmptyComponent={!loading ? (
              <View style={{ alignItems: 'center', paddingTop: 48, gap: 10 }}>
                <Text style={{ fontSize: 36 }}>📭</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: T.text }}>No posts yet</Text>
              </View>
            ) : null}
            renderItem={({ item }) => (
              <PostCard post={item}
                onLike={onLike} onRepost={onRepost} onBookmark={onBookmark}
                onReply={() => { }} onShare={onShare} onOpen={onOpen} onVote={onVote}
                onHashtag={onHashtag} />
            )}
          />
        )}
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// NotificationsModal
// ─────────────────────────────────────────────────────────────────
function NotificationsModal({ visible, onClose, userId }: { visible: boolean; onClose: () => void; userId: string }) {
  const insets = useSafeAreaInsets()
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'all' | 'mentions'>('all')

  useEffect(() => {
    if (!visible || !userId) return
    loadNotifs()
  }, [visible, userId])

  const loadNotifs = async () => {
    setLoading(true)
    const { data } = await supabase.from('ct_notifications').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(60)
    setLoading(false)
    if (data) setNotifs(data.map(rowToNotif))
    await supabase.from('ct_notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
  }

  const filtered = tab === 'mentions' ? notifs.filter(n => n.type === 'reply') : notifs

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[nm.root, { paddingTop: insets.top > 0 ? insets.top : 16 }]}>
        <View style={nm.header}>
          <TouchableOpacity style={nm.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={T.text} />
          </TouchableOpacity>
          <Text style={nm.title}>Notifications</Text>
          <TouchableOpacity onPress={loadNotifs} style={nm.closeBtn}>
            <Ionicons name="refresh-outline" size={19} color={T.muted} />
          </TouchableOpacity>
        </View>
        <View style={nm.tabs}>
          {(['all', 'mentions'] as const).map(t => (
            <TouchableOpacity key={t} style={nm.tab} onPress={() => setTab(t)}>
              <Text style={[nm.tabText, tab === t && nm.tabTextActive]}>{t === 'all' ? 'All' : 'Mentions'}</Text>
              {tab === t && <View style={nm.tabIndicator} />}
            </TouchableOpacity>
          ))}
        </View>
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={T.accent} size="large" />
          </View>
        ) : filtered.length === 0 ? (
          <View style={nm.empty}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>🔔</Text>
            <Text style={nm.emptyTitle}>Nothing here yet</Text>
            <Text style={nm.emptySub}>When someone interacts with your posts, it'll show here.</Text>
          </View>
        ) : (
          <FlatList
            data={filtered} keyExtractor={n => n.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: T.border }} />}
            renderItem={({ item: n }) => {
              const meta = NOTIF_META[n.type]
              return (
                <View style={[nm.row, !n.read && nm.rowUnread]}>
                  {!n.read && <View style={nm.unreadDot} />}
                  <View style={{ position: 'relative', marginRight: 14 }}>
                    <Avi initials={n.actorInitials} grad={n.actorGrad} size={44} uri={n.actorAvatar} />
                    <View style={[nm.typeBadge, { backgroundColor: meta.color }]}>
                      <Text style={{ fontSize: 11 }}>{meta.icon}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={nm.actorName} numberOfLines={1}>
                      <Text style={{ fontWeight: '800' }}>{n.actorName}</Text>
                      <Text style={{ color: T.muted }}> {n.actorHandle}</Text>
                    </Text>
                    <Text style={nm.verb}>{meta.verb}</Text>
                    {n.postPreview && <Text style={nm.preview} numberOfLines={2}>"{n.postPreview}"</Text>}
                  </View>
                  <Text style={nm.time}>{n.time}</Text>
                </View>
              )
            }}
          />
        )}
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// SearchModal
// ─────────────────────────────────────────────────────────────────
function SearchModal({ visible, onClose, initialQuery = '' }: { visible: boolean; onClose: () => void; initialQuery?: string }) {
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState(initialQuery)
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    if (visible) { setQuery(initialQuery); setTimeout(() => inputRef.current?.focus(), 300) }
  }, [visible, initialQuery])

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[se.root, { paddingTop: insets.top > 0 ? insets.top : 16 }]}>
        <View style={se.topRow}>
          <TouchableOpacity style={se.backBtn} onPress={onClose}>
            <Ionicons name="arrow-back" size={20} color={T.text} />
          </TouchableOpacity>
          <View style={se.inputWrap}>
            <Ionicons name="search" size={16} color={T.muted} style={{ marginRight: 8 }} />
            <TextInput
              ref={inputRef} style={se.input} value={query} onChangeText={setQuery}
              placeholder="Search Campus Times" placeholderTextColor={T.muted}
              returnKeyType="search" autoCorrect={false} autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={17} color={T.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={se.emptyState}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🔍</Text>
          <Text style={se.emptyTitle}>Search Campus Times</Text>
          <Text style={se.emptySub}>Find posts by keyword or hashtag, and discover people on campus.</Text>
        </View>
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// BookmarksModal
// ─────────────────────────────────────────────────────────────────
function BookmarksModal({ visible, onClose, userId, profile, onLike, onRepost, onBookmark, onShare, onOpen, onVote, onHashtag }: {
  visible: boolean; onClose: () => void; userId: string; profile: UserProfile;
  onLike: (id: string) => void; onRepost: (id: string) => void; onBookmark: (id: string) => void;
  onShare: (p: Post) => void; onOpen: (p: Post) => void; onVote: (id: string, i: number) => void;
  onHashtag?: (tag: string) => void;
}) {
  const insets = useSafeAreaInsets()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (visible && userId) load() }, [visible, userId])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('ct_bookmarks').select('post_id, ct_posts(*)')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(60)
    setLoading(false)
    if (!data) return
    const likedRes = await supabase.from('ct_likes').select('post_id').eq('user_id', userId)
    const repostRes = await supabase.from('ct_reposts').select('post_id').eq('user_id', userId)
    const myL = new Set((likedRes.data ?? []).map((r: any) => r.post_id))
    const myR = new Set((repostRes.data ?? []).map((r: any) => r.post_id))
    const myB = new Set(data.map((r: any) => r.post_id))
    setPosts(data.map((r: any) => rowToPost(r.ct_posts, myL, myR, myB)))
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[bm.root, { paddingTop: insets.top > 0 ? insets.top : 16 }]}>
        <View style={bm.header}>
          <TouchableOpacity style={bm.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={T.text} />
          </TouchableOpacity>
          <Text style={bm.title}>Bookmarks</Text>
          <View style={{ width: 34 }} />
        </View>
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={T.accent} size="large" />
          </View>
        ) : posts.length === 0 ? (
          <View style={bm.empty}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>🔖</Text>
            <Text style={bm.emptyTitle}>No bookmarks yet</Text>
            <Text style={bm.emptySub}>Tap the 🏷️ on any post to save it here.</Text>
          </View>
        ) : (
          <FlatList
            data={posts} keyExtractor={p => p.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            ListHeaderComponent={
              <View style={bm.countRow}>
                <Text style={bm.countText}>{posts.length} saved post{posts.length !== 1 ? 's' : ''}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <PostCard post={item}
                onLike={onLike} onRepost={onRepost} onBookmark={onBookmark}
                onReply={() => { }} onShare={onShare} onOpen={onOpen} onVote={onVote}
                onHashtag={onHashtag} />
            )}
          />
        )}
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────
function Toast({ message, visible }: { message: string; visible: boolean }) {
  const y = useRef(new Animated.Value(100)).current
  const opa = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(y,   { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(opa, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(y,   { toValue: 100, duration: 240, useNativeDriver: true }),
        Animated.timing(opa, { toValue: 0,   duration: 240, useNativeDriver: true }),
      ]).start()
    }
  }, [visible])
  return (
    <Animated.View pointerEvents="none" style={[toastSt.box, { transform: [{ translateY: y }], opacity: opa }]}>
      <Text style={toastSt.text}>{message}</Text>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────
type FeedTab = 'for-you' | 'following' | 'campus' | 'classes'
const TABS: { key: FeedTab; label: string }[] = [
  { key: 'for-you',   label: 'For You'   },
  { key: 'following', label: 'Following' },
  { key: 'campus',    label: 'Campus'    },
  { key: 'classes',   label: 'Classes'   },
]

export default function StudentForum() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { session } = useAuth()

  const [authUserId, setAuthUserId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data?.user?.id) setAuthUserId(data.user.id) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setAuthUserId(sess?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const resolvedUserId = authUserId || session?.user?.id || ''

  const profile: UserProfile = (session?.user || authUserId) ? {
    userId: resolvedUserId,
    name: session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'Student',
    handle: `@${session?.user?.user_metadata?.forum_handle || session?.user?.email?.split('@')[0]?.toLowerCase().replace(/[^a-z]/g, '') || 'student'}`,
    initials: (session?.user?.user_metadata?.full_name || session?.user?.email || '').slice(0, 2).toUpperCase().substring(0, 2) || 'ST',
    grad: session?.user?.user_metadata?.forum_grad ? (session.user.user_metadata.forum_grad as [string, string]) : ['#ec5b13', '#d4a843'],
    avatarUri: session?.user?.user_metadata?.avatar_url || null,
    collegeId: session?.user?.user_metadata?.college_id || null,
    classId: session?.user?.user_metadata?.class_id || null,
    verified: !!session?.user?.user_metadata?.is_verified,
  } : DEFAULT_PROFILE

// Data hooks
  const { isOffline } = useNetworkStatus()
  const { posts: forumPosts, isLoading: postsLoading, refetch: refetchPosts } = useForumPosts({ channelId: 'all' })
  const { totalUnread: dmUnreadCount } = useForumDMs(profile.userId || null)
  const { unreadCount: notifUnreadCount } = useForumNotifications(profile.userId || null)

  const [posts, setPosts] = useState<Post[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  useEffect(() => { setUnreadCount(notifUnreadCount) }, [notifUnreadCount])
  useEffect(() => {
    if (forumPosts && forumPosts.length > 0) setPosts(forumPosts.map(row => forumPostToPost(row)))
  }, [forumPosts])

  // UI state
  const [feedTab, setFeedTab]           = useState<FeedTab>('for-you')
  const [refreshing, setRefreshing]     = useState(false)
  const [showCompose, setShowCompose]   = useState(false)
  const [showNotifs, setShowNotifs]     = useState(false)
  const [showSearch, setShowSearch]     = useState(false)
  const [searchQuery, setSearchQuery]   = useState('')
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [activeConvo, setActiveConvo]   = useState<Conversation | null>(null)
  const [threadPost, setThreadPost]     = useState<Post | null>(null)
  const [replyTo, setReplyTo]           = useState<Post | null>(null)
  const [toastMsg, setToastMsg]         = useState('')
  const [toastVis, setToastVis]         = useState(false)

  const likedIds     = useRef<Set<string>>(new Set())
  const repostedIds  = useRef<Set<string>>(new Set())
  const bookmarkedIds= useRef<Set<string>>(new Set())
  const toastTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!profile.userId) return
    const fetchUnread = async () => {
      const { count } = await supabase.from('ct_notifications').select('*', { count: 'exact', head: true })
        .eq('user_id', profile.userId).eq('read', false)
      setUnreadCount(count ?? 0)
    }
    fetchUnread()
    const ch = supabase.channel(`notif_badge_${profile.userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ct_notifications', filter: `user_id=eq.${profile.userId}` }, () => fetchUnread())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile.userId])

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg); setToastVis(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastVis(false), 2500)
  }, [])

  const handleOpenNotifs = useCallback(() => { setShowNotifs(true); setUnreadCount(0) }, [])
  const handleOpenSearch = useCallback((q = '') => { setSearchQuery(q); setShowSearch(true) }, [])

  const handleOpenProfile = useCallback(async (uidOrHandle: string, _name?: string) => {
    if (!uidOrHandle || uidOrHandle.startsWith('@user')) return
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uidOrHandle)
    let uid = uidOrHandle
    if (!isUuid) {
      const handle = uidOrHandle.startsWith('@') ? uidOrHandle.slice(1) : uidOrHandle
      const { data } = await supabase.from('profiles').select('id').eq('forum_handle', handle).single()
      if (!data?.id) return
      uid = data.id
    }
    if (profile.userId && uid === profile.userId) return
    setProfileUserId(uid)
  }, [profile.userId])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true); await refetchPosts(); setRefreshing(false); showToast('Feed refreshed!')
  }, [refetchPosts, showToast])

  const uploadImage = async (localUri: string): Promise<string | null> => {
    if (!profile.userId) return null
    try {
      const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg'
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
      const path = `${profile.userId}/${Date.now()}.${ext}`
      const blob = await (await fetch(localUri)).blob()
      const { error } = await supabase.storage.from(CT_MEDIA_BUCKET).upload(path, blob, { contentType: mime, upsert: false })
      if (error) return null
      return supabase.storage.from(CT_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
    } catch { return null }
  }

  const handleLike = useCallback((id: string) => {
    const nowLiked = !likedIds.current.has(id)
    if (nowLiked) likedIds.current.add(id); else likedIds.current.delete(id)
    setPosts(prev => prev.map(p => p.id !== id ? p : { ...p, liked: nowLiked, likes: p.likes + (nowLiked ? 1 : -1) }))
    setThreadPost(prev => prev?.id === id ? { ...prev, liked: nowLiked, likes: prev.likes + (nowLiked ? 1 : -1) } : prev)
    if (!id.startsWith('seed-') && profile.userId) {
      if (nowLiked) Promise.resolve(supabase.from('ct_likes').insert({ post_id: id, user_id: profile.userId })).catch(() => { })
      else Promise.resolve(supabase.from('ct_likes').delete().match({ post_id: id, user_id: profile.userId })).catch(() => { })
    }
  }, [profile.userId])

  const handleRepost = useCallback((id: string) => {
    const nowR = !repostedIds.current.has(id)
    if (nowR) repostedIds.current.add(id); else repostedIds.current.delete(id)
    setPosts(prev => prev.map(p => p.id !== id ? p : { ...p, reposted: nowR, reposts: p.reposts + (nowR ? 1 : -1) }))
    setThreadPost(prev => prev?.id === id ? { ...prev, reposted: nowR, reposts: prev.reposts + (nowR ? 1 : -1) } : prev)
    showToast(nowR ? 'Reposted!' : 'Repost removed')
    if (!id.startsWith('seed-') && profile.userId) {
      if (nowR) Promise.resolve(supabase.from('ct_reposts').insert({ post_id: id, user_id: profile.userId })).catch(() => { })
      else Promise.resolve(supabase.from('ct_reposts').delete().match({ post_id: id, user_id: profile.userId })).catch(() => { })
    }
  }, [profile.userId, showToast])

  const handleBookmark = useCallback((id: string) => {
    const nowB = !bookmarkedIds.current.has(id)
    if (nowB) bookmarkedIds.current.add(id); else bookmarkedIds.current.delete(id)
    setPosts(prev => prev.map(p => p.id !== id ? p : { ...p, bookmarked: nowB, bookmarks: p.bookmarks + (nowB ? 1 : -1) }))
    showToast(nowB ? 'Saved to Bookmarks' : 'Bookmark removed')
    if (!id.startsWith('seed-') && profile.userId) {
      if (nowB) Promise.resolve(supabase.from('ct_bookmarks').insert({ post_id: id, user_id: profile.userId })).catch(() => { })
      else Promise.resolve(supabase.from('ct_bookmarks').delete().match({ post_id: id, user_id: profile.userId })).catch(() => { })
    }
  }, [profile.userId, showToast])

  const handleShare = useCallback(async (post: Post) => {
    try { await Share.share({ message: `${post.name}: ${post.text}` }) } catch { }
    showToast('Link copied to clipboard!')
  }, [showToast])

  const handleVote = useCallback((id: string, i: number) => {
    showToast('Vote recorded!')
    if (!id.startsWith('seed-') && profile.userId)
      Promise.resolve(supabase.from('ct_poll_votes').upsert({ post_id: id, user_id: profile.userId, option_index: i })).catch(() => { })
  }, [profile.userId, showToast])

  const handleNewPost = useCallback(async (text: string, localImageUri?: string) => {
    if (!profile.userId) { showToast('Please sign in to post'); return }
    const tempId = `temp-${Date.now()}`
    setPosts(prev => [{
      id: tempId, isSeed: false, type: 'normal',
      name: profile.name, handle: profile.handle, verified: profile.verified,
      time: 'now', avatar: profile.initials, avatarGrad: profile.grad, avatarUri: profile.avatarUri,
      text, imageUrl: localImageUri ?? null,
      replies: 0, reposts: 0, likes: 0, views: '0', bookmarks: 0,
      liked: false, reposted: false, bookmarked: false,
    }, ...prev])
    showToast('Your post is live!')
    let imageUrl: string | null = null
    if (localImageUri) imageUrl = await uploadImage(localImageUri)
    const { data, error } = await supabase.from('ct_posts').insert({
      user_id: profile.userId, author_name: profile.name, author_handle: profile.handle,
      author_initials: profile.initials, author_grad: profile.grad, author_verified: profile.verified,
      author_avatar_url: profile.avatarUri, post_type: 'normal', body: text,
      scope: 'everyone', image_url: imageUrl,
    }).select().single()
    if (error) { setPosts(prev => prev.filter(p => p.id !== tempId)); showToast('Failed to save post.'); return }
    if (data) setPosts(prev => prev.map(p => p.id === tempId ? rowToPost(data, likedIds.current, repostedIds.current, bookmarkedIds.current) : p))
  }, [profile, showToast])

  const handleNewReply = useCallback((postId: string) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, replies: p.replies + 1 } : p))
    setThreadPost(prev => prev?.id === postId ? { ...prev, replies: prev.replies + 1 } : prev)
  }, [])

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>

      {/* ═══ HEADER — editorial brand ═══ */}
      <View style={[hd.header, { paddingTop: insets.top + 6 }]}>
        {/* Back */}
        <TouchableOpacity style={hd.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={19} color={T.text} />
        </TouchableOpacity>

        {/* Brand */}
        <View style={hd.brand}>
          <LinearGradient colors={[T.accent, T.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={hd.brandLogo}>
            <Text style={hd.brandLogoText}>CT</Text>
          </LinearGradient>
          <View>
            <Text style={hd.brandName}>The Campus Times</Text>
            <Text style={hd.brandSub}>STUDENT FORUM</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={hd.iconBtn} onPress={handleOpenNotifs}>
            <Ionicons name="notifications-outline" size={19} color={unreadCount > 0 ? T.accent : T.text} />
            {unreadCount > 0 && (
              <View style={hd.badge}>
                <Text style={hd.badgeText}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={hd.iconBtn} onPress={() => handleOpenSearch()}>
            <Ionicons name="search-outline" size={19} color={T.text} />
          </TouchableOpacity>
          <TouchableOpacity style={hd.iconBtn} onPress={() => setShowBookmarks(true)}>
            <Ionicons name="bookmark-outline" size={19} color={T.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ═══ TABS ═══ */}
      <View style={hd.tabsRow}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.key} style={hd.tab} onPress={() => setFeedTab(tab.key)} activeOpacity={0.8}>
            <Text style={[hd.tabText, feedTab === tab.key && hd.tabTextActive]}>{tab.label}</Text>
            {feedTab === tab.key && <View style={hd.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* ═══ FEED ═══ */}
      {isOffline && posts.length > 0 && (
        <View style={forumStyles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#92400E" />
          <Text style={forumStyles.offlineText}>Showing cached posts — you're offline</Text>
        </View>
      )}
      <FlatList
        data={posts}
        keyExtractor={p => p.id}
        ListHeaderComponent={
          <InlineComposer
            onFocus={() => setShowCompose(true)}
            onPost={handleNewPost}
            profile={profile}
          />
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onLike={handleLike} onRepost={handleRepost} onBookmark={handleBookmark}
            onReply={p => { setReplyTo(p); setShowCompose(true) }}
            onShare={handleShare} onOpen={setThreadPost} onVote={handleVote}
            onHashtag={handleOpenSearch} onAvatarPress={handleOpenProfile}
          />
        )}
        refreshControl={
          !isOffline ? (
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={handleRefresh} 
              tintColor={T.accent} 
            />
          ) : undefined
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          postsLoading ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <ActivityIndicator color={T.accent} size="large" />
            </View>
          ) : isOffline ? (
            <View style={{ alignItems: 'center', paddingTop: 80, gap: 12, paddingHorizontal: 40 }}>
              <Ionicons name="cloud-offline-outline" size={48} color={T.muted} />
              <Text style={{ fontSize: 20, fontWeight: '800', color: T.text, textAlign: 'center' }}>
                No cached posts
              </Text>
              <Text style={{ color: T.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
                Connect to see latest Campus Times posts
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingTop: 80, gap: 12, paddingHorizontal: 40 }}>
              <Text style={{ fontSize: 48 }}>{feedTab === 'following' ? '👥' : '💬'}</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: T.text, textAlign: 'center', fontFamily: 'serif' }}>
                {feedTab === 'following' ? 'Your following feed is empty' : 'Nothing here yet'}
              </Text>
              <Text style={{ color: T.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
                {feedTab === 'following' ? 'Follow people to see their posts here.' : 'Be the first to post in this feed.'}
              </Text>
            </View>
          )
        }
      />

      {/* ═══ FAB — matches home screen orange gradient ═══ */}
      <TouchableOpacity
        style={[fab.btn, { bottom: insets.bottom + 24 }]}
        onPress={() => { setReplyTo(null); setShowCompose(true) }}
        activeOpacity={0.85}
      >
        <LinearGradient colors={[T.accent, T.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={fab.gradient}>
          <Ionicons name="create-outline" size={24} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      {/* ═══ MODALS ═══ */}
      <SearchModal    visible={showSearch}    onClose={() => setShowSearch(false)}    initialQuery={searchQuery} />
      <BookmarksModal visible={showBookmarks} onClose={() => setShowBookmarks(false)} userId={profile.userId}
        profile={profile} onLike={handleLike} onRepost={handleRepost} onBookmark={handleBookmark}
        onShare={handleShare} onOpen={setThreadPost} onVote={handleVote} onHashtag={handleOpenSearch} />
      <ProfileCardModal
        userId={profileUserId} visible={!!profileUserId} onClose={() => setProfileUserId(null)}
        currentUserId={profile.userId} onHashtag={handleOpenSearch}
        onLike={handleLike} onRepost={handleRepost} onBookmark={handleBookmark}
        onShare={handleShare} onOpen={setThreadPost} onVote={handleVote}
        onStartDM={c => { setProfileUserId(null); setActiveConvo(c) }}
      />
      <NotificationsModal visible={showNotifs}    onClose={() => setShowNotifs(false)}    userId={profile.userId} />
      <ComposeModal
        visible={showCompose} onClose={() => { setShowCompose(false); setReplyTo(null) }}
        onPost={(text, img) => { handleNewPost(text, img); setReplyTo(null) }}
        replyTo={replyTo} profile={profile}
      />
      <ThreadModal
        post={threadPost} visible={!!threadPost} onClose={() => setThreadPost(null)}
        onLike={handleLike} onRepost={handleRepost} onBookmark={handleBookmark}
        onShare={handleShare} profile={profile} onNewReply={handleNewReply}
      />
      <Toast message={toastMsg} visible={toastVis} />
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────
// StyleSheets
// ─────────────────────────────────────────────────────────────────

const forumStyles = StyleSheet.create({
  offlineBanner: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    gap: 6, 
    backgroundColor: '#FEF3C7', 
    paddingVertical: 8, 
    paddingHorizontal: 16,
    borderBottomWidth: 1, 
    borderBottomColor: '#FDE68A',
  },
  offlineText: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: '#92400E' 
  },
})

const s = StyleSheet.create({
  divider:         { height: 1, backgroundColor: T.border },
  repostLabel:     { paddingLeft: 62, paddingTop: 10, paddingBottom: 2, flexDirection: 'row', alignItems: 'center', gap: 6 },
  repostLabelText: { fontSize: 13, color: T.green, fontWeight: '600' },

  post:      {
    flexDirection: 'row', paddingVertical: 14, paddingRight: 16,
    backgroundColor: T.bg,
  },
  postAccent:{ width: 3, marginRight: 0, borderRadius: 1.5, backgroundColor: 'transparent', alignSelf: 'stretch', minHeight: 40 },
  postLeft:  { alignItems: 'center', marginRight: 12, marginLeft: 14 },
  threadLine:{ width: 1.5, flex: 1, backgroundColor: T.border2, marginTop: 5, borderRadius: 1, minHeight: 20 },
  postBody:  { flex: 1, minWidth: 0 },
  postHeader:{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, gap: 4 },
  postName:  { fontSize: 14, fontWeight: '800', color: T.text },
  postHandle:{ fontSize: 13, color: T.muted },
  postDot:   { fontSize: 12, color: T.muted },
  postTime:  { fontSize: 13, color: T.muted },
  postText:  { fontSize: 15, lineHeight: 24, color: T.text, marginBottom: 10 },
  postImageWrap: { borderRadius: 14, overflow: 'hidden', marginBottom: 10, borderWidth: 1, borderColor: T.border },
  postImage: { width: '100%', aspectRatio: 16 / 9 },

  postActions:  { flexDirection: 'row', alignItems: 'center', marginLeft: -10, marginTop: 4 },
  action:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 50 },
  actionIcon:   { fontSize: 17 },
  actionCount:  { fontSize: 13, fontWeight: '600' },

  poll:        { marginBottom: 10, gap: 7 },
  pollOption:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: T.border2, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, overflow: 'hidden', position: 'relative' },
  pollBar:     { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 10 },
  pollLabel:   { fontSize: 14, fontWeight: '500', color: T.text, flex: 1, zIndex: 1 },
  pollPct:     { fontSize: 14, fontWeight: '700', color: T.accent, zIndex: 1 },
  pollMeta:    { fontSize: 13, color: T.muted },

  quoteBox:    { borderWidth: 1, borderColor: T.border2, borderRadius: 14, padding: 13, marginBottom: 10 },
  quoteHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  quoteAvi:    { width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  quoteName:   { fontSize: 13, fontWeight: '700', color: T.text },
  quoteHandle: { fontSize: 13, color: T.muted },
  quoteText:   { fontSize: 14, color: T.muted2, lineHeight: 20 },
})

// Header
const hd = StyleSheet.create({
  header:   {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: T.border,
    backgroundColor: 'rgba(7,8,12,0.95)', gap: 10,
  },
  brand:    { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  brandLogo:{ width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    shadowColor: T.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  brandLogoText: { fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  brandName: { fontSize: 15, fontWeight: '800', color: T.text, letterSpacing: -0.3, fontFamily: 'serif' },
  brandSub:  { fontSize: 8.5, fontWeight: '700', color: T.muted, letterSpacing: 1.5 },
  iconBtn:  { width: 36, height: 36, borderRadius: 12, backgroundColor: T.bg3, borderWidth: 1, borderColor: T.border, justifyContent: 'center', alignItems: 'center' },
  badge:    { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: T.accent, borderWidth: 2, borderColor: T.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  badgeText:{ fontSize: 9, fontWeight: '900', color: '#fff' },
  tabsRow:  { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: 'rgba(7,8,12,0.92)' },
  tab:      { flex: 1, alignItems: 'center', paddingVertical: 14, position: 'relative' },
  tabText:  { fontSize: 13, fontWeight: '600', color: T.muted, letterSpacing: 0.3 },
  tabTextActive: { color: T.text, fontWeight: '800' },
  tabIndicator:  { position: 'absolute', bottom: 0, height: 2.5, width: 32, borderRadius: 2, backgroundColor: T.accent },
})

// Inline composer
const ic = StyleSheet.create({
  composer: { flexDirection: 'row', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.bg },
  body:     { flex: 1, minWidth: 0 },
  input:    { fontSize: 17, color: T.text, lineHeight: 26, minHeight: 56, paddingTop: 0 },
  imgRemove:{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  actions:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.border, marginTop: 8 },
  toolBtn:  { padding: 6, borderRadius: 50 },
  charCount:{ marginLeft: 'auto' as any, fontSize: 13, fontWeight: '600' },
  sendBtn:  { backgroundColor: T.accent, borderRadius: 100, paddingHorizontal: 20, paddingVertical: 8, marginLeft: 6, shadowColor: T.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  sendBtnText:{ fontSize: 14, fontWeight: '800', color: '#fff' },
})

// Compose modal
const cm = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  closeBtn:  { width: 34, height: 34, borderRadius: 11, backgroundColor: T.bg3, justifyContent: 'center', alignItems: 'center' },
  headerTitle:{ fontSize: 17, fontWeight: '800', color: T.text, fontFamily: 'serif' },
  postBtn:   { backgroundColor: T.accent, borderRadius: 100, paddingHorizontal: 22, paddingVertical: 10, shadowColor: T.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
  postBtnText:{ fontSize: 14, fontWeight: '800', color: '#fff' },
  replyCtx:  { flexDirection: 'row', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.bg2 },
  replyCtxLabel: { fontSize: 13, color: T.muted, marginBottom: 3 },
  replyCtxSnippet: { fontSize: 13, color: T.muted2, lineHeight: 18 },
  row:       { flexDirection: 'row', padding: 18 },
  input:     { fontSize: 18, color: T.text, lineHeight: 28, minHeight: 120, paddingTop: 0 },
  imgRemove: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  hint:      { fontSize: 13, color: T.muted, marginTop: 10 },

  // Attachment cards
  attachSection: { paddingHorizontal: 18, paddingBottom: 18 },
  attachLabel:   { fontSize: 9, fontWeight: '800', letterSpacing: 2, color: T.accent, textTransform: 'uppercase', marginBottom: 12 },
  attachGrid:    { flexDirection: 'row', gap: 10 },
  attachCard:    { flex: 1, aspectRatio: 1, backgroundColor: T.bg3, borderRadius: 14, borderWidth: 1, borderColor: T.border2, alignItems: 'center', justifyContent: 'center', gap: 8 },
  attachCardText:{ fontSize: 10, fontWeight: '700', color: T.text, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },

  // Settings card
  settingsCard: { marginHorizontal: 18, marginBottom: 18, backgroundColor: T.bg3, borderRadius: 16, borderWidth: 1, borderColor: T.border, padding: 16 },
  settingsRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  settingsLabel:{ fontSize: 13, fontWeight: '700', color: T.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  settingsSub:  { fontSize: 11, color: T.muted, marginTop: 2 },

  // Visibility pills
  visibilityPills: { flexDirection: 'column', gap: 6, alignItems: 'flex-end' },
  visPill:         { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, borderWidth: 1, borderColor: T.border2 },
  visPillActive:   { borderColor: T.accent, backgroundColor: T.accentDim },
  visPillText:     { fontSize: 11, fontWeight: '600', color: T.muted },
  visPillTextActive:{ color: T.accent },

  // Toggle
  toggle:      { width: 46, height: 26, borderRadius: 13, backgroundColor: T.bg4, borderWidth: 1, borderColor: T.border2, padding: 2 },
  toggleActive:{ backgroundColor: T.accent, borderColor: T.accent },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: T.muted },
  toggleThumbActive: { backgroundColor: '#fff', transform: [{ translateX: 20 }] },

  // Toolbar
  toolbar:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.bg, gap: 4 },
  toolBtn:   { padding: 8, borderRadius: 50 },
  charTrack: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  charCount: { fontSize: 13, fontWeight: '600' },
  charBarBg: { width: 40, height: 3, backgroundColor: T.border2, borderRadius: 2, overflow: 'hidden' },
  charBarFill:{ height: '100%', borderRadius: 2 },
})

// Thread modal
const th = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: T.border },
  backBtn:   { width: 34, height: 34, borderRadius: 11, backgroundColor: T.bg3, justifyContent: 'center', alignItems: 'center' },
  title:     { fontSize: 17, fontWeight: '800', color: T.text, fontFamily: 'serif' },
  followBtn: { backgroundColor: T.accent, borderRadius: 100, paddingHorizontal: 18, paddingVertical: 8 },
  followBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  expanded:  { padding: 18 },
  expName:   { fontSize: 18, fontWeight: '800', color: T.text, fontFamily: 'serif' },
  expHandle: { fontSize: 14, color: T.muted, marginTop: 2 },
  expText:   { fontSize: 18, lineHeight: 28, marginBottom: 14, color: T.text },
  imgWrap:   { borderRadius: 16, overflow: 'hidden', marginBottom: 14, borderWidth: 1, borderColor: T.border },
  img:       { width: '100%', aspectRatio: 16 / 9 },

  metaRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.border },
  metaText:  { fontSize: 13, color: T.muted },
  metaDot:   { fontSize: 12, color: T.muted },

  statsRow:  { flexDirection: 'row', gap: 18, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.border, marginBottom: 6 },
  statItem:  { fontSize: 14, color: T.muted },
  statNum:   { fontWeight: '800', color: T.text, fontSize: 15 },
  expActions:{ paddingTop: 10, borderTopWidth: 1, borderTopColor: T.border, marginTop: 4 },

  emptyReplies: { alignItems: 'center', paddingTop: 48, gap: 4 },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: T.text },

  // Sticky reply bar — matching mockup bottom bar
  replyBar:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.bg },
  replyInputWrap:{ flex: 1, backgroundColor: T.bg3, borderRadius: 100, borderWidth: 1, borderColor: T.border2, paddingHorizontal: 16, paddingVertical: 10 },
  replyInput:   { fontSize: 14, color: T.text },
  replyPostBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  replyPostBtnText: { fontSize: 14, fontWeight: '800', color: T.accent },
})

// Profile modal
const pf = StyleSheet.create({
  cover:     { height: 130, width: '100%', paddingHorizontal: 16, paddingVertical: 12 },
  coverNav:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: -44 },
  avatarRing:{ width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: T.bg, overflow: 'hidden' },
  avatarGrad:{ width: 88, height: 88, justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: 88, height: 88, borderRadius: 44, position: 'absolute' },
  avatarInitials: { fontSize: 30, fontWeight: '900', color: '#fff' },
  followBtn: { backgroundColor: T.text, borderRadius: 100, paddingHorizontal: 22, paddingVertical: 10, marginBottom: 4 },
  followBtnActive: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: T.border2 },
  followBtnText: { fontSize: 14, fontWeight: '800', color: T.bg },
  followBtnTextActive: { color: T.text },
  msgBtn:    { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: T.accent, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  info:      { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  name:      { fontSize: 22, fontWeight: '900', color: T.text, fontFamily: 'serif' },
  handle:    { fontSize: 14, color: T.muted, marginTop: 2, marginBottom: 6 },
  collegeLine:{ fontSize: 13, color: T.accent, fontWeight: '600', marginBottom: 6 },
  bio:       { fontSize: 14, color: T.muted2, lineHeight: 22 },

  // Stats row — matching mockup 4-column layout
  statsRow:   { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.border, paddingVertical: 16, marginBottom: 4 },
  statItem:   { flex: 1, alignItems: 'center', gap: 3 },
  statNum:    { fontSize: 19, fontWeight: '900', color: T.text, fontFamily: 'serif' },
  statLabel:  { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: T.muted, textTransform: 'uppercase' },
  statDivider:{ width: 1, backgroundColor: T.border, marginVertical: 4 },

  postsLabel:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  postsLabelLine: { width: 16, height: 1.5, backgroundColor: T.accent, opacity: 0.7, borderRadius: 1 },
  postsLabelText: { fontSize: 9.5, fontWeight: '800', color: T.muted, letterSpacing: 2.5 },
})

// Notifications modal
const nm = StyleSheet.create({
  root:     { flex: 1, backgroundColor: T.bg },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  closeBtn: { width: 34, height: 34, borderRadius: 11, backgroundColor: T.bg3, justifyContent: 'center', alignItems: 'center' },
  title:    { fontSize: 18, fontWeight: '800', color: T.text, fontFamily: 'serif' },
  tabs:     { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border },
  tab:      { flex: 1, alignItems: 'center', paddingVertical: 14, position: 'relative' },
  tabText:  { fontSize: 14, fontWeight: '500', color: T.muted },
  tabTextActive: { color: T.text, fontWeight: '700' },
  tabIndicator:  { position: 'absolute', bottom: 0, height: 2.5, width: 34, borderRadius: 2, backgroundColor: T.accent },
  row:      { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, position: 'relative' },
  rowUnread:{ backgroundColor: T.accentDim },
  unreadDot:{ position: 'absolute', left: 6, top: 20, width: 6, height: 6, borderRadius: 3, backgroundColor: T.accent },
  typeBadge:{ position: 'absolute', bottom: -3, right: -3, width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: T.bg },
  actorName:{ fontSize: 14, color: T.text, marginBottom: 3 },
  verb:     { fontSize: 13, color: T.muted, marginBottom: 4 },
  preview:  { fontSize: 13, color: T.muted2, fontStyle: 'italic', lineHeight: 18 },
  time:     { fontSize: 12, color: T.muted, marginLeft: 8, marginTop: 2, flexShrink: 0 },
  empty:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: T.text, marginBottom: 8, textAlign: 'center', fontFamily: 'serif' },
  emptySub:   { fontSize: 14, color: T.muted, textAlign: 'center', lineHeight: 22 },
})

// Search modal
const se = StyleSheet.create({
  root:      { flex: 1, backgroundColor: T.bg },
  topRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  backBtn:   { width: 34, height: 34, borderRadius: 11, backgroundColor: T.bg3, justifyContent: 'center', alignItems: 'center' },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: T.bg3, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: T.border2 },
  input:     { flex: 1, fontSize: 16, color: T.text },
  emptyState:{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 80 },
  emptyTitle:{ fontSize: 20, fontWeight: '800', color: T.text, marginBottom: 8, textAlign: 'center', fontFamily: 'serif' },
  emptySub:  { fontSize: 14, color: T.muted, textAlign: 'center', lineHeight: 22 },
})

// Bookmarks modal
const bm = StyleSheet.create({
  root:      { flex: 1, backgroundColor: T.bg },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  closeBtn:  { width: 34, height: 34, borderRadius: 11, backgroundColor: T.bg3, justifyContent: 'center', alignItems: 'center' },
  title:     { fontSize: 18, fontWeight: '800', color: T.text, fontFamily: 'serif' },
  countRow:  { paddingHorizontal: 16, paddingVertical: 12 },
  countText: { fontSize: 13, color: T.muted, fontWeight: '600' },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 80 },
  emptyTitle:{ fontSize: 20, fontWeight: '800', color: T.text, marginBottom: 8, textAlign: 'center', fontFamily: 'serif' },
  emptySub:  { fontSize: 14, color: T.muted, textAlign: 'center', lineHeight: 22 },
})

// FAB
const fab = StyleSheet.create({
  btn: {
    position: 'absolute', right: 22, zIndex: 200,
    shadowColor: T.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 14, elevation: 12,
  },
  gradient: { width: 58, height: 58, borderRadius: 29, justifyContent: 'center', alignItems: 'center' },
})

// Toast
const toastSt = StyleSheet.create({
  box:  { position: 'absolute', bottom: 28, alignSelf: 'center', backgroundColor: T.accent, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 12, zIndex: 999, shadowColor: T.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
  text: { fontSize: 14, fontWeight: '700', color: '#fff' },
})