/**
 * ForumScreen.tsx — StudentSquare Forum
 * Twitter-inspired. Fully Offline-First via WatermelonDB.
 */

import { BookmarksModal }     from '@/features/forum/components/BookmarksModal'
import { ComposeModal }       from '@/features/forum/components/ComposeModal'
import { NotificationsModal } from '@/features/forum/components/NotificationsModal'
import { ProfileCardModal }   from '@/features/forum/components/ProfileCardModal'
import { SearchModal }        from '@/features/forum/components/SearchModal'
import { ThreadModal }        from '@/features/forum/components/ThreadModal'
import { Toast }              from '@/features/forum/components/Toast'
import { PostOptionsSheet, type PostOption } from '@/features/forum/components/PostOptionsSheet'
import { useForumInteractions } from '@/features/forum/hooks/useForumInteractions'
import type { Notif, Post, UserProfile } from '@/features/forum/types'
import { useAuth }            from '@/hooks/useAuth'
import useAppStore            from '@/store'
import { useNetworkStatus }   from '@/hooks/useNetworkStatus'
import { supabase }           from '@/lib/supabase'
import { Ionicons }           from '@expo/vector-icons'
import { LinearGradient }     from 'expo-linear-gradient'
import { useRouter }          from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForumPosts }      from '@/hooks/useLocalQueries'
import NetInfo                from '@react-native-community/netinfo'
import {
  Animated,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  bg:         '#000000',
  bg2:        '#0d0d0d',
  bg3:        '#16181c',
  bg4:        '#202327',
  border:     '#2f3336',
  border2:    '#3e4144',
  text:       '#e7e9ea',
  muted:      '#71767b',
  muted2:     '#8b98a5',
  accent:     '#1DA1F2',
  accentDim:  'rgba(29,161,242,0.12)',
  accentGlow: 'rgba(29,161,242,0.2)',
  green:      '#00ba7c',
  red:        '#f91880',
  amber:      '#ffd400',
  gold:       '#ffd400',
} as const

const MEDIA_BUCKET = 'ct-media'
const MAX_CHARS    = 280

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
    ? `${(n / 1000).toFixed(1)}K`
    : String(n)
}

function timeAgo(iso: string): string {
  try {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (s < 0) return 'now'
    if (s < 60)    return `${s}s`
    if (s < 3600)  return `${Math.floor(s / 60)}m`
    if (s < 86400) return `${Math.floor(s / 3600)}h`
    return `${Math.floor(s / 86400)}d`
  } catch { return '' }
}

function ensureHandle(raw?: string | null, fallbackName?: string): string {
  if (!raw) return `@${(fallbackName || 'user').split(' ')[0].toLowerCase().replace(/[^a-z0-9_]/g, '')}`
  return raw.startsWith('@') ? raw : `@${raw}`
}

function modelToPost(
  model: any,
  liked: boolean,
  reposted: boolean,
  bookmarked: boolean,
  voted: boolean,
): Post {
  let poll: Post['poll']
  let pollMeta: string | undefined
  
  if (model.pollOptions) {
    try {
      const opts = JSON.parse(model.pollOptions)
      if (Array.isArray(opts) && opts.length > 0) {
        const total = opts.reduce((a: number, o: any) => a + (o.votes ?? 0), 0)
        const maxV = Math.max(...opts.map((o: any) => o.votes ?? 0))
        poll = opts.map((o: any) => ({
          label:   o.label,
          votes:   o.votes ?? 0,
          pct:     total > 0 ? Math.round(((o.votes ?? 0) / total) * 100) : 0,
          winning: (o.votes ?? 0) === maxV && maxV > 0,
        }))
        pollMeta = `${total} vote${total !== 1 ? 's' : ''}`
      }
    } catch { /* ignore */ }
  }

  const grad = model.authorGrad ? JSON.parse(model.authorGrad) : ['#1DA1F2', '#0d8bd9']

  return {
    id:         model.id,
    authorId:   model.authorId,
    name:       model.isAnonymous ? 'Anonymous' : (model.authorName || 'Student'),
    handle:     model.isAnonymous ? '@anonymous' : ensureHandle(model.authorHandle, model.authorName),
    verified:   model.isAnonymous ? false : !!model.authorVerified,
    time:       timeAgo(new Date(model.createdAt).toISOString()),
    avatar:     model.isAnonymous ? '?' : (model.authorInitials || 'ST'),
    avatarGrad: model.isAnonymous ? ['#3e4144', '#16181c'] : grad,
    avatarUri:  model.isAnonymous ? null : model.authorAvatarUrl,
    text:       model.content || '',
    imageUrl:   model.imageUrl || null,
    poll,
    pollMeta,
    pollVoted:  voted,
    replies:    model.commentsCount || 0,
    reposts:    model.repostsCount || 0,
    likes:      model.likesCount || 0,
    views:      fmt(model.viewsCount || 0),
    bookmarks:  model.bookmarksCount || 0,
    liked,
    reposted,
    bookmarked,
    type:      (model.pollOptions ? 'poll' : 'normal') as Post['type'],
  }
}

function rowToNotif(row: any): Notif {
  return {
    id:           row.id,
    type:         row.type,
    actorName:    row.actor_name     ?? 'Someone',
    actorHandle:  row.actor_handle   ?? '',
    actorInitials:row.actor_initials ?? '??',
    actorGrad:    (Array.isArray(row.actor_grad) ? row.actor_grad : ['#1DA1F2', '#0d8bd9']) as [string, string],
    actorAvatar:  row.actor_avatar_url ?? null,
    postPreview:  row.post_preview   ?? null,
    read:         row.read,
    time:         timeAgo(row.created_at),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default profile (used before auth loads)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_PROFILE: UserProfile = {
  userId:    '',
  name:      'You',
  handle:    '@you',
  initials:  'YO',
  grad:      ['#1DA1F2', '#0d8bd9'],
  avatarUri: null,
  collegeId: null,
  classId:   null,
  verified:  false,
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────────────
function Avi({
  initials, grad, size = 40, uri, verified = false,
}: {
  initials: string
  grad: readonly [string, string]
  size?: number
  uri?: string | null
  verified?: boolean
}) {
  return (
    <View style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <LinearGradient
        colors={grad as [string, string]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, justifyContent: 'center', alignItems: 'center' }}
      >
        {uri
          ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, position: 'absolute' }} resizeMode="cover" />
          : <Text style={{ fontSize: size * 0.34, fontWeight: '800', color: '#fff', letterSpacing: -0.3 }}>{initials}</Text>
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

// ─────────────────────────────────────────────────────────────────────────────
// RichText
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// ActionBtn
// ─────────────────────────────────────────────────────────────────────────────
type AV = 'reply' | 'repost' | 'like' | 'bookmark' | 'share'
const AC: Record<AV, string> = {
  reply:    T.muted,
  repost:   T.green,
  like:     T.red,
  bookmark: T.accent,
  share:    T.muted,
}

function ActionBtn({
  variant, icon, activeIcon, label, active, onPress,
}: {
  variant: AV; icon: string; activeIcon?: string
  label?: string | number; active?: boolean; onPress: () => void
}) {
  const scale = useRef(new Animated.Value(1)).current
  const color = active ? AC[variant] : T.muted

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, speed: 60, bounciness: 0 }),
      Animated.spring(scale, { toValue: 1,   useNativeDriver: true, speed: 30, bounciness: 12 }),
    ]).start()
    onPress()
  }

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7} style={s.action}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={(active && activeIcon ? activeIcon : icon) as any}
          size={18}
          color={color}
        />
      </Animated.View>
      {label !== undefined && (typeof label === 'number' ? label > 0 : label !== '0') && (
        <Text style={[s.actionCount, { color }]}>{fmt(Number(label))}</Text>
      )}
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Poll — Twitter-style
// ─────────────────────────────────────────────────────────────────────────────
function Poll({
  options, meta, onVote, voted,
}: {
  options: NonNullable<Post['poll']>
  meta?: string
  onVote: (i: number) => void
  voted: boolean
}) {
  return (
    <View style={s.poll}>
      {options.map((opt, i) => (
        <TouchableOpacity
          key={i}
          onPress={() => !voted && onVote(i)}
          activeOpacity={voted ? 1 : 0.75}
          style={[s.pollOption, opt.winning && voted && s.pollOptionWinning]}
          disabled={voted}
        >
          {/* Background fill bar — only shown after voting */}
          {voted && (
            <View
              style={[
                s.pollBar,
                {
                  width: `${opt.pct}%` as any,
                  backgroundColor: opt.winning ? T.accentDim : 'rgba(255,255,255,0.06)',
                },
              ]}
            />
          )}
          <Text style={s.pollLabel}>{opt.label}</Text>
          {voted && (
            <Text style={[s.pollPct, opt.winning && { color: T.accent, fontWeight: '800' }]}>
              {opt.pct}%
            </Text>
          )}
          {voted && opt.winning && (
            <Ionicons name="checkmark-circle" size={14} color={T.accent} style={{ marginLeft: 4 }} />
          )}
        </TouchableOpacity>
      ))}
      {meta && <Text style={s.pollMeta}>{meta}</Text>}
      {!voted && <Text style={s.pollHint}>Tap to vote · {meta ?? '0 votes'}</Text>}
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PostCard
// ─────────────────────────────────────────────────────────────────────────────
function PostCard({
  post, myUserId, onLike, onRepost, onBookmark, onReply,
  onShare, onOpen, onVote, onHashtag, onAvatarPress, onDelete, onImagePress,
}: {
  post:           Post
  myUserId:       string
  onLike:         (id: string, authorId?: string) => void
  onRepost:       (id: string, authorId?: string) => void
  onBookmark:     (id: string) => void
  onReply:        (p: Post) => void
  onShare:        (p: Post) => void
  onOpen:         (p: Post) => void
  onVote:         (id: string, i: number) => void
  onHashtag?:     (tag: string) => void
  onAvatarPress?: (userId: string) => void
  onDelete:       (id: string) => void
  onImagePress:   (uri: string) => void
}) {
  const isOwn = post.authorId === myUserId
  const [showOptions, setShowOptions] = useState(false)

  const ownOptions: PostOption[] = [
    {
      icon:        'trash-outline',
      label:       'Delete post',
      destructive: true,
      onPress:     () => onDelete(post.id),
    },
    {
      icon:    'bookmark-outline',
      label:   post.bookmarked ? 'Remove bookmark' : 'Bookmark post',
      accent:  true,
      onPress: () => onBookmark(post.id),
    },
    {
      icon:    'share-outline',
      label:   'Share post',
      onPress: () => onShare(post),
    },
  ]

  const otherOptions: PostOption[] = [
    {
      icon:        'flag-outline',
      label:       'Report post',
      destructive: true,
      onPress:     () => { /* report */ },
    },
    {
      icon:    'bookmark-outline',
      label:   post.bookmarked ? 'Remove bookmark' : 'Bookmark post',
      accent:  true,
      onPress: () => onBookmark(post.id),
    },
    {
      icon:    'share-outline',
      label:   'Share post',
      onPress: () => onShare(post),
    },
  ]

  return (
    <View>
      <TouchableOpacity activeOpacity={0.97} onPress={() => onOpen(post)} style={s.post}>
        <View style={s.postLeft}>
          <TouchableOpacity onPress={() => post.authorId && onAvatarPress?.(post.authorId)} activeOpacity={0.8}>
            <Avi initials={post.avatar} grad={post.avatarGrad} size={42} uri={post.avatarUri} verified={post.verified} />
          </TouchableOpacity>
          {post.replies > 0 && <View style={s.threadLine} />}
        </View>

        <View style={s.postBody}>
          <View style={s.postHeader}>
            <TouchableOpacity
              onPress={() => post.authorId && onAvatarPress?.(post.authorId)}
              activeOpacity={0.7}
              style={{ flex: 1, minWidth: 0 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <Text style={s.postName} numberOfLines={1}>{post.name}</Text>
                {post.verified && <Ionicons name="checkmark-circle" size={14} color={T.accent} />}
                <Text style={s.postHandle} numberOfLines={1}>{post.handle}</Text>
                <Text style={s.postDot}>·</Text>
                <Text style={s.postTime}>{post.time}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowOptions(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={s.optionsBtn}
            >
              <Ionicons name="ellipsis-horizontal" size={16} color={T.muted} />
            </TouchableOpacity>
          </View>

          <RichText text={post.text} onHashtag={onHashtag} />

          {post.imageUrl ? (
            <TouchableOpacity 
              activeOpacity={0.9} 
              onPress={() => onImagePress(post.imageUrl!)}
              style={s.postImageWrap}
            >
              <Image source={{ uri: post.imageUrl }} style={s.postImage} resizeMode="cover" />
            </TouchableOpacity>
          ) : null}

          {post.type === 'poll' && post.poll && (
            <Poll options={post.poll} meta={post.pollMeta} onVote={i => onVote(post.id, i)} voted={!!post.pollVoted} />
          )}

          <View style={s.postActions}>
            <ActionBtn variant="reply"    icon="chatbubble-outline"              label={post.replies}  onPress={() => onReply(post)} />
            <ActionBtn variant="repost"   icon="repeat"                           label={post.reposts}  active={post.reposted}   onPress={() => onRepost(post.id, post.authorId)} />
            <ActionBtn variant="like"     icon="heart-outline" activeIcon="heart"  label={post.likes}   active={post.liked}      onPress={() => onLike(post.id, post.authorId)} />
            <ActionBtn variant="bookmark" icon="bookmark-outline" activeIcon="bookmark" active={post.bookmarked} onPress={() => onBookmark(post.id)} />
            <ActionBtn variant="share"    icon="share-outline"                    label={post.views as any} onPress={() => onShare(post)} />
          </View>
        </View>
      </TouchableOpacity>
      <View style={s.divider} />
      <PostOptionsSheet visible={showOptions} onClose={() => setShowOptions(false)} options={isOwn ? ownOptions : otherOptions} />
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// InlineComposer
// ─────────────────────────────────────────────────────────────────────────────
function InlineComposer({
  onFocus, onPost, profile,
}: {
  onFocus: () => void
  onPost:  (text: string, img?: string) => void
  profile: UserProfile
}) {
  const [text, setText]         = useState('')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const remaining  = MAX_CHARS - text.length
  const charColor  = remaining < 20 ? T.red : remaining < 50 ? T.amber : T.muted

  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: true,
    })
    if (!r.canceled && r.assets[0]) setImageUri(r.assets[0].uri)
  }

  const handleSend = () => {
    if (!text.trim()) return
    onPost(text.trim(), imageUri ?? undefined)
    setText('')
    setImageUri(null)
  }

  return (
    <View style={ic.composer}>
      <Avi initials={profile.initials} grad={profile.grad} size={42} uri={profile.avatarUri} />
      <View style={ic.body}>
        <TextInput
          style={ic.input}
          placeholder="What's happening?"
          placeholderTextColor={T.muted}
          multiline
          value={text}
          onChangeText={setText}
          onFocus={onFocus}
          maxLength={MAX_CHARS + 10}
        />
        {imageUri && (
          <View style={{ marginBottom: 8, position: 'relative' }}>
            <Image source={{ uri: imageUri }} style={{ width: '100%', borderRadius: 12, aspectRatio: 16 / 9 }} resizeMode="cover" />
            <TouchableOpacity onPress={() => setImageUri(null)} style={ic.imgRemove}>
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
        <View style={ic.actions}>
          <TouchableOpacity style={ic.toolBtn} onPress={pickImage}>
            <Ionicons name="image-outline" size={20} color={T.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={ic.toolBtn} onPress={() => { setShowCompose?.(true) }}>
            <Ionicons name="bar-chart-outline" size={20} color={T.accent} />
          </TouchableOpacity>
          <Text style={[ic.charCount, { color: charColor }]}>{remaining}</Text>
          <TouchableOpacity
            style={[ic.sendBtn, !text.trim() && { opacity: 0.4 }]}
            onPress={handleSend}
            disabled={!text.trim()}
          >
            <Text style={ic.sendBtnText}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

let setShowCompose: ((v: boolean) => void) | undefined

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
type FeedTab = 'for-you' | 'following' | 'campus' | 'classes'
const TABS: { key: FeedTab; label: string }[] = [
  { key: 'for-you',   label: 'For You'  },
  { key: 'following', label: 'Following' },
  { key: 'campus',    label: 'Campus'   },
  { key: 'classes',   label: 'Classes'  },
]

export default function ForumScreen() {
  const router      = useRouter()
  const insets      = useSafeAreaInsets()
  const { user: authUser } = useAuth()
  const storeUser   = useAppStore((s: any) => s.user)
  const user        = authUser || storeUser
  const { isOffline } = useNetworkStatus()

  // ── Profile ───────────────────────────────────────────────────────────────
  const [dbProfile, setDbProfile] = useState<any>(null)
  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('forum_handle,forum_initials,forum_grad,avatar_url,is_verified,college_id,class_id')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (data) setDbProfile(data) })
  }, [user?.id])

  const profile: UserProfile = user ? {
    userId:    user.id,
    name:      user.user_metadata?.full_name || user.email?.split('@')[0] || 'Student',
    handle:    ensureHandle(dbProfile?.forum_handle || user.user_metadata?.forum_handle, user.user_metadata?.full_name),
    initials:  dbProfile?.forum_initials || (user.user_metadata?.full_name || 'ST').slice(0, 2).toUpperCase(),
    grad:      (Array.isArray(dbProfile?.forum_grad) ? dbProfile.forum_grad : ['#1DA1F2', '#0d8bd9']) as [string, string],
    avatarUri: dbProfile?.avatar_url || user.user_metadata?.avatar_url || null,
    collegeId: dbProfile?.college_id || user.user_metadata?.college_id || null,
    classId:   dbProfile?.class_id   || user.user_metadata?.class_id   || null,
    verified:  dbProfile?.is_verified ?? !!user.user_metadata?.is_verified,
  } : DEFAULT_PROFILE

  // ── Feed state ────────────────────────────────────────────────────────────
  const [feedTab, setFeedTab] = useState<FeedTab>('for-you')
  const { records: postModels, loading: postsLoading } = useForumPosts(feedTab, profile.userId, profile.collegeId, profile.classId)
  
  const likedIds      = useRef(new Set<string>())
  const repostedIds   = useRef(new Set<string>())
  const bookmarkedIds = useRef(new Set<string>())
  const votedIds      = useRef(new Set<string>())

  const posts = useMemo(() => {
    return postModels.map(m => modelToPost(m, likedIds.current.has(m.id), repostedIds.current.has(m.id), bookmarkedIds.current.has(m.id), votedIds.current.has(m.id)))
  }, [postModels])

  // ── UI state ──────────────────────────────────────────────────────────────
  const [unreadCount,    setUnreadCount]    = useState(0)
  const [showCompose,    _setShowCompose]   = useState(false)
  const [showNotifs,     setShowNotifs]     = useState(false)
  const [showSearch,     setShowSearch]     = useState(false)
  const [searchQuery,    setSearchQuery]    = useState('')
  const [showBookmarks,  setShowBookmarks]  = useState(false)
  const [profileUserId,  setProfileUserId]  = useState<string | null>(null)
  const [threadPost,     setThreadPost]     = useState<Post | null>(null)
  const [replyTo,        setReplyTo]        = useState<Post | null>(null)
  const [toastMsg,       setToastMsg]       = useState('')
  const [toastVis,       setToastVis]       = useState(false)
  const [previewImg,     setPreviewImg]     = useState<string | null>(null)
  const toastTimer = useRef<any>(null)

  setShowCompose = _setShowCompose
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg); setToastVis(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastVis(false), 2500)
  }, [])

  // ── Notification badge ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile.userId) return
    const fetchBadge = async () => {
      const isOnline = await NetInfo.fetch().then(s => s.isConnected)
      if (!isOnline) return
      const { count } = await supabase.from('sq_notifications').select('*', { count: 'exact', head: true }).eq('user_id', profile.userId).eq('read', false)
      setUnreadCount(count ?? 0)
    }
    fetchBadge()
  }, [profile.userId])

  // ── Interactions ──────────────────────────────────────────────────────────
  const {
    handleLike, handleRepost, handleBookmark, handleShare,
    handleVote, handleDeletePost, handleNewPost, handleNewReply,
  } = useForumInteractions({
    mediaBucket: MEDIA_BUCKET, profile, showToast, setPosts: () => {}, 
    setThreadPost, likedIds, repostedIds, bookmarkedIds, votedIds,
    mapRowToPost: (row: any) => rowToNotif(row) as any // dummy
  })

  const handleOpenThread = useCallback((post: Post) => {
    setThreadPost(post)
    if (!post.id.startsWith('temp-') && !isOffline) {
      supabase.rpc('sq_increment_view', { p_id: post.id }).then(undefined, () => {})
    }
  }, [isOffline])

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={[hd.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={hd.iconBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={19} color={T.text} /></TouchableOpacity>
        <View style={hd.brand}>
          <LinearGradient colors={[T.accent, T.accentGlow]} style={hd.brandLogo}><Text style={hd.brandLogoText}>SQ</Text></LinearGradient>
          <View><Text style={hd.brandName}>StudentSquare</Text><Text style={hd.brandSub}>FORUM</Text></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={hd.iconBtn} onPress={() => { setShowNotifs(true); setUnreadCount(0) }}>
            <Ionicons name="notifications-outline" size={19} color={unreadCount > 0 ? T.accent : T.text} />
            {unreadCount > 0 && <View style={hd.badge}><Text style={hd.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View>}
          </TouchableOpacity>
          <TouchableOpacity style={hd.iconBtn} onPress={() => setShowSearch(true)}><Ionicons name="search-outline" size={19} color={T.text} /></TouchableOpacity>
          <TouchableOpacity style={hd.iconBtn} onPress={() => setShowBookmarks(true)}><Ionicons name="bookmark-outline" size={19} color={T.text} /></TouchableOpacity>
        </View>
      </View>

      <View style={hd.tabsRow}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.key} style={hd.tab} onPress={() => setFeedTab(tab.key)}>
            <Text style={[hd.tabText, feedTab === tab.key && hd.tabTextActive]}>{tab.label}</Text>
            {feedTab === tab.key && <View style={hd.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {isOffline && (
        <View style={forumSt.offlineBanner}><Ionicons name="cloud-offline-outline" size={14} color={T.amber} /><Text style={forumSt.offlineText}>You're offline — showing cached posts</Text></View>
      )}

      <FlatList
        data={posts}
        keyExtractor={p => p.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        ListHeaderComponent={<InlineComposer onFocus={() => _setShowCompose(true)} onPost={handleNewPost} profile={profile} />}
        renderItem={({ item }) => (
          <PostCard
            post={item} myUserId={profile.userId}
            onLike={handleLike} onRepost={handleRepost} onBookmark={handleBookmark}
            onReply={p => { setReplyTo(p); _setShowCompose(true) }}
            onShare={handleShare} onOpen={handleOpenThread} onVote={handleVote}
            onHashtag={q => { setSearchQuery(q); setShowSearch(true) }}
            onAvatarPress={setProfileUserId} onDelete={handleDeletePost}
            onImagePress={setPreviewImg}
          />
        )}
        ListEmptyComponent={
          postsLoading ? <View style={{ paddingTop: 60 }}><Ionicons name="hourglass-outline" size={32} color={T.muted} style={{ alignSelf:'center' }} /></View>
          : <View style={{ paddingTop: 80, paddingHorizontal: 40, alignItems:'center' }}><Text style={{ color:T.text, fontSize:18, fontWeight:'800' }}>Nothing here yet</Text></View>
        }
      />

      <TouchableOpacity style={[fab.btn, { bottom: insets.bottom + 24 }]} onPress={() => _setShowCompose(true)}>
        <LinearGradient colors={[T.accent, '#0d8bd9']} style={fab.gradient}><Ionicons name="create-outline" size={24} color="#fff" /></LinearGradient>
      </TouchableOpacity>

      <SearchModal visible={showSearch} onClose={() => setShowSearch(false)} initialQuery={searchQuery} currentUserId={profile.userId} />
      <BookmarksModal visible={showBookmarks} onClose={() => setShowBookmarks(false)} userId={profile.userId} mapRowToPost={() => ({}) as any} renderPost={() => null} />
      <NotificationsModal visible={showNotifs} onClose={() => setShowNotifs(false)} userId={profile.userId} mapNotifRow={rowToNotif} />
      <ComposeModal visible={showCompose} onClose={() => _setShowCompose(false)} onPost={(t,i,p,a) => handleNewPost(t,i,p,replyTo?.id,a)} replyTo={replyTo} profile={profile} />
      <ThreadModal post={threadPost} visible={!!threadPost} onClose={() => setThreadPost(null)} onLike={handleLike} onRepost={handleRepost} onBookmark={handleBookmark} onShare={handleShare} profile={profile} onNewReply={handleNewReply} myUserId={profile.userId} onDeleteReply={handleDeletePost} />
      <ProfileCardModal userId={profileUserId} visible={!!profileUserId} onClose={() => setProfileUserId(null)} currentUserId={profile.userId} onOpen={handleOpenThread} onDelete={handleDeletePost} />
      <Toast message={toastMsg} visible={toastVis} />
 
      {/* Twitter-style Image Preview Modal */}
      <Modal visible={!!previewImg} transparent animationType="fade" statusBarTranslucent>
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={() => setPreviewImg(null)} 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' }}
        >
          <View style={{ position: 'absolute', top: insets.top + 10, right: 20, zIndex: 10 }}>
             <TouchableOpacity onPress={() => setPreviewImg(null)} style={{ padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}>
                <Ionicons name="close" size={24} color="#fff" />
             </TouchableOpacity>
          </View>
          {previewImg && (
            <Image 
              source={{ uri: previewImg }} 
              style={{ width: '100%', height: '80%' }} 
              resizeMode="contain" 
            />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const forumSt = StyleSheet.create({
  offlineBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,212,0,0.1)', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2f3336' },
  offlineText:   { fontSize: 12, fontWeight: '600', color: '#ffd400' },
})

const s = StyleSheet.create({
  divider: { height: 1, backgroundColor: T.border },
  post: { flexDirection: 'row', paddingVertical: 14, paddingRight: 16, backgroundColor: T.bg },
  postLeft: { alignItems: 'center', marginRight: 12, marginLeft: 14 },
  threadLine: { width: 2, flex: 1, backgroundColor: T.border2, marginTop: 6, borderRadius: 1 },
  postBody: { flex: 1, minWidth: 0 },
  postHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4, gap: 4 },
  postName: { fontSize: 15, fontWeight: '800', color: T.text },
  postHandle: { fontSize: 13, color: T.muted },
  postDot: { fontSize: 13, color: T.muted },
  postTime: { fontSize: 13, color: T.muted },
  postText: { fontSize: 15, lineHeight: 24, color: T.text, marginBottom: 10 },
  postImageWrap: { borderRadius: 16, overflow: 'hidden', marginBottom: 10, borderWidth: 1, borderColor: T.border },
  postImage: { width: '100%', aspectRatio: 16 / 9 },
  postActions: { flexDirection: 'row', alignItems: 'center', marginLeft: -10, marginTop: 4, gap: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 10 },
  actionCount: { fontSize: 13, fontWeight: '600' },
  optionsBtn: { padding: 4, marginLeft: 4 },
  poll: { marginBottom: 10, gap: 8 },
  pollOption: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: T.border2, borderRadius: 50, paddingVertical: 10, paddingHorizontal: 16, overflow: 'hidden', position: 'relative' },
  pollOptionWinning:{ borderColor: T.accent },
  pollBar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  pollLabel: { fontSize: 15, fontWeight: '600', color: T.text, flex: 1, zIndex: 1 },
  pollPct: { fontSize: 14, fontWeight: '600', color: T.muted, zIndex: 1 },
  pollMeta: { fontSize: 13, color: T.muted, marginTop: 2 },
  pollHint: { fontSize: 13, color: T.muted, marginTop: 2 },
})

const hd = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: 'rgba(0,0,0,0.95)', gap: 10 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  brandLogo: { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center', backgroundColor: T.accent },
  brandLogoText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  brandName: { fontSize: 15, fontWeight: '800', color: T.text },
  brandSub: { fontSize: 8.5, fontWeight: '700', color: T.muted, letterSpacing: 1.5 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: T.bg3, borderWidth: 1, borderColor: T.border, justifyContent: 'center', alignItems: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: T.accent, borderWidth: 2, borderColor: T.bg, justifyContent: 'center', alignItems: 'center' },
  badgeText: { fontSize: 9, fontWeight: '900', color: '#fff' },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: 'rgba(0,0,0,0.92)' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabText: { fontSize: 13, fontWeight: '600', color: T.muted },
  tabTextActive: { color: T.text, fontWeight: '800' },
  tabIndicator: { position: 'absolute', bottom: 0, height: 2.5, width: 32, borderRadius: 2, backgroundColor: T.accent },
})

const ic = StyleSheet.create({
  composer: { flexDirection: 'row', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.bg },
  body: { flex: 1, minWidth: 0 },
  input: { fontSize: 17, color: T.text, minHeight: 56 },
  imgRemove: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.border, marginTop: 8 },
  toolBtn: { padding: 6 },
  charCount: { marginLeft: 'auto', fontSize: 13, fontWeight: '600', color: T.muted },
  sendBtn: { backgroundColor: T.accent, borderRadius: 100, paddingHorizontal: 18, paddingVertical: 8 },
  sendBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
})

const fab = StyleSheet.create({
  btn: { position: 'absolute', right: 22, zIndex: 200 },
  gradient: { width: 58, height: 58, borderRadius: 29, justifyContent: 'center', alignItems: 'center' },
})