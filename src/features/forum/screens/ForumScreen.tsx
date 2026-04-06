/**
 * ForumScreen.tsx — StudentSquare Forum
 * Twitter-inspired. All fixes applied.
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
import { useNetworkStatus }   from '@/hooks/useNetworkStatus'
import { supabase }           from '@/lib/supabase'
import { Ionicons }           from '@expo/vector-icons'
import { LinearGradient }     from 'expo-linear-gradient'
import { useRouter }          from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  FlatList,
  Image,
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
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return `${s}s`
  if (s < 3600)  return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function ensureHandle(raw?: string | null, fallbackName?: string): string {
  if (!raw) return `@${(fallbackName || 'user').split(' ')[0].toLowerCase().replace(/[^a-z0-9_]/g, '')}`
  return raw.startsWith('@') ? raw : `@${raw}`
}

// ─────────────────────────────────────────────────────────────────────────────
// rowToPost — converts a DB row to a Post object
// KEY FIX: prefers author_* denormalised columns so ALL users see real names
// ─────────────────────────────────────────────────────────────────────────────
function rowToPost(
  row:  any,
  myL:  Set<string>,
  myR:  Set<string>,
  myB:  Set<string>,
  myV:  Set<string>,
): Post {
  const isAnon = !!row.is_anonymous

  // Prefer denormalised columns stored at insert time
  // Fall back to profiles join (for old rows)
  const fullName  = row.author_name       || row.profiles?.full_name    || 'Student'
  const handle    = row.author_handle     || row.profiles?.forum_handle || null
  const initials  = row.author_initials   || row.profiles?.forum_initials
                    || fullName.slice(0, 2).toUpperCase()
  // forum_grad is a Postgres ARRAY — comes back as string[] from the join
  const rawGrad   = row.author_grad       || row.profiles?.forum_grad   || null
  const grad      = (Array.isArray(rawGrad) ? rawGrad : ['#1DA1F2', '#0d8bd9']) as [string, string]
  const avatarUrl = row.author_avatar_url || row.profiles?.avatar_url   || null
  const verified  = row.author_verified   ?? row.profiles?.is_verified  ?? false

  // Parse poll_options from DB format [{label, votes}] → [{label, pct, votes, winning}]
  let poll: Post['poll']
  let pollMeta: string | undefined
  if (Array.isArray(row.poll_options) && row.poll_options.length > 0) {
    const total  = row.poll_options.reduce((a: number, o: any) => a + (o.votes ?? 0), 0)
    const maxV   = Math.max(...row.poll_options.map((o: any) => o.votes ?? 0))
    poll = row.poll_options.map((o: any) => ({
      label:   o.label,
      votes:   o.votes ?? 0,
      pct:     total > 0 ? Math.round(((o.votes ?? 0) / total) * 100) : 0,
      winning: (o.votes ?? 0) === maxV && maxV > 0,
    }))
    pollMeta = `${total} vote${total !== 1 ? 's' : ''}`
  }

  return {
    id:         row.id,
    isSeed:     false,
    type:       (row.post_type as Post['type']) || (poll ? 'poll' : 'normal'),
    authorId:   row.author_id,
    name:       isAnon ? 'Anonymous' : fullName,
    handle:     isAnon ? '@anonymous' : ensureHandle(handle, fullName),
    verified:   isAnon ? false : verified,
    time:       timeAgo(row.created_at || new Date().toISOString()),
    avatar:     isAnon ? '?' : initials,
    avatarGrad: isAnon ? ['#3e4144', '#16181c'] : grad,
    avatarUri:  isAnon ? null : avatarUrl,
    text:       row.body || '',
    imageUrl:   row.image_url || null,
    poll,
    pollMeta,
    pollVoted:  myV.has(row.id),
    replies:    row.comment_count  ?? row.replies_count  ?? 0,
    reposts:    row.repost_count   ?? row.reposts_count  ?? 0,
    likes:      row.like_count     ?? row.likes_count    ?? 0,
    views:      fmt(row.view_count ?? row.views_count    ?? 0),
    bookmarks:  row.bookmark_count ?? row.bookmarks_count ?? 0,
    liked:      myL.has(row.id),
    reposted:   myR.has(row.id),
    bookmarked: myB.has(row.id),
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
      {label !== undefined && Number(label) > 0 && (
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
// PostCard — Twitter-style with professional options sheet
// ─────────────────────────────────────────────────────────────────────────────
function PostCard({
  post, myUserId, onLike, onRepost, onBookmark, onReply,
  onShare, onOpen, onVote, onHashtag, onAvatarPress, onDelete,
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
}) {
  const isOwn = post.authorId === myUserId
  const [showOptions, setShowOptions] = useState(false)

  // Build options list based on ownership — Twitter-style
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
    {
      icon:    'copy-outline',
      label:   'Copy link',
      onPress: () => { /* copy to clipboard */ },
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
      icon:        'person-remove-outline',
      label:       `Unfollow ${post.handle}`,
      onPress:     () => { /* unfollow */ },
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
    {
      icon:    'copy-outline',
      label:   'Copy link',
      onPress: () => { /* copy */ },
    },
    {
      icon:    'volume-mute-outline',
      label:   `Mute ${post.handle}`,
      onPress: () => { /* mute */ },
    },
  ]

  return (
    <View>
      {post.type === 'repost' && post.repostedBy && (
        <View style={s.repostLabel}>
          <Ionicons name="repeat" size={12} color={T.green} />
          <Text style={s.repostLabelText}>{post.repostedBy} reposted</Text>
        </View>
      )}

      <TouchableOpacity activeOpacity={0.97} onPress={() => onOpen(post)} style={s.post}>
        {/* Left column */}
        <View style={s.postLeft}>
          <TouchableOpacity onPress={() => post.authorId && onAvatarPress?.(post.authorId)} activeOpacity={0.8}>
            <Avi initials={post.avatar} grad={post.avatarGrad} size={42} uri={post.avatarUri} verified={post.verified} />
          </TouchableOpacity>
          {post.replies > 0 && <View style={s.threadLine} />}
        </View>

        {/* Right column */}
        <View style={s.postBody}>
          {/* Header */}
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

          {/* Text */}
          <RichText text={post.text} onHashtag={onHashtag} />

          {/* Image */}
          {post.imageUrl ? (
            <View style={s.postImageWrap}>
              <Image source={{ uri: post.imageUrl }} style={s.postImage} resizeMode="cover" />
            </View>
          ) : null}

          {/* Poll */}
          {post.type === 'poll' && post.poll && (
            <Poll
              options={post.poll}
              meta={post.pollMeta}
              onVote={i => onVote(post.id, i)}
              voted={!!post.pollVoted}
            />
          )}

          {/* Actions */}
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

      {/* Options sheet */}
      <PostOptionsSheet
        visible={showOptions}
        onClose={() => setShowOptions(false)}
        options={isOwn ? ownOptions : otherOptions}
      />
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

// Workaround: poll button in InlineComposer opens ComposeModal
let setShowCompose: ((v: boolean) => void) | undefined

// ─────────────────────────────────────────────────────────────────────────────
// Feed tabs
// ─────────────────────────────────────────────────────────────────────────────
type FeedTab = 'for-you' | 'following' | 'campus' | 'classes'
const TABS: { key: FeedTab; label: string }[] = [
  { key: 'for-you',   label: 'For You'  },
  { key: 'following', label: 'Following' },
  { key: 'campus',    label: 'Campus'   },
  { key: 'classes',   label: 'Classes'  },
]

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function ForumScreen() {
  const router      = useRouter()
  const insets      = useSafeAreaInsets()
  const { user }    = useAuth()
  const { isOffline } = useNetworkStatus()

  // ── Profile ───────────────────────────────────────────────────────────────
  const [dbProfile, setDbProfile] = useState<{
    forum_handle?:    string
    forum_initials?:  string
    forum_grad?:      string[]
    avatar_url?:      string
    is_verified?:     boolean
    college_id?:      string
    class_id?:        string
  } | null>(null)

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('forum_handle,forum_initials,forum_grad,avatar_url,is_verified,college_id,class_id')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (data) setDbProfile(data as any) })
  }, [user?.id])

  const profile: UserProfile = user
    ? {
        userId:    user.id,
        name:      dbProfile
          ? (user.user_metadata?.full_name || user.email?.split('@')[0] || 'Student')
          : (user.user_metadata?.full_name || user.email?.split('@')[0] || 'Student'),
        handle:    ensureHandle(
          dbProfile?.forum_handle || user.user_metadata?.forum_handle,
          user.user_metadata?.full_name,
        ),
        initials:  dbProfile?.forum_initials
          || (user.user_metadata?.full_name || user.email || '').slice(0, 2).toUpperCase()
          || 'ST',
        grad: (
          Array.isArray(dbProfile?.forum_grad) ? dbProfile!.forum_grad
          : Array.isArray(user.user_metadata?.forum_grad) ? user.user_metadata.forum_grad
          : ['#1DA1F2', '#0d8bd9']
        ) as [string, string],
        avatarUri:  dbProfile?.avatar_url      || user.user_metadata?.avatar_url || null,
        collegeId:  dbProfile?.college_id      || user.user_metadata?.college_id || null,
        classId:    dbProfile?.class_id        || user.user_metadata?.class_id   || null,
        verified:   dbProfile?.is_verified     ?? !!user.user_metadata?.is_verified,
      }
    : DEFAULT_PROFILE

  // ── Feed state ────────────────────────────────────────────────────────────
  const [feedTab,      setFeedTab]      = useState<FeedTab>('for-you')
  const [posts,        setPosts]        = useState<Post[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [refreshing,   setRefreshing]   = useState(false)

  // ── Interaction tracking refs ─────────────────────────────────────────────
  const likedIds      = useRef(new Set<string>())
  const repostedIds   = useRef(new Set<string>())
  const bookmarkedIds = useRef(new Set<string>())
  const votedIds      = useRef(new Set<string>())

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
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Wire up poll button in InlineComposer
  setShowCompose = _setShowCompose

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg); setToastVis(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastVis(false), 2500)
  }, [])

  // ── Load posts ────────────────────────────────────────────────────────────
  const loadPosts = useCallback(async (tab: FeedTab) => {
    if (!profile.userId) return
    setPostsLoading(true)

    let query = supabase
      .from('sq_posts')
      .select(`
        *,
        profiles!sq_posts_author_id_fkey(
          full_name, forum_handle, forum_initials, forum_grad,
          avatar_url, is_verified, college_id, class_id
        )
      `)
      .is('reply_to_id', null)
      .order('created_at', { ascending: false })
      .limit(60)

    if (tab === 'following') {
      const { data: follows } = await supabase
        .from('sq_follows').select('following_id').eq('follower_id', profile.userId)
      const ids = (follows ?? []).map((f: any) => f.following_id as string)
      if (ids.length === 0) { setPosts([]); setPostsLoading(false); return }
      query = query.in('author_id', ids)

    } else if (tab === 'campus') {
      if (!profile.collegeId) { setPosts([]); setPostsLoading(false); return }
      const { data: cu } = await supabase
        .from('profiles').select('id').eq('college_id', profile.collegeId)
      const ids = (cu ?? []).map((u: any) => u.id as string)
      if (ids.length === 0) { setPosts([]); setPostsLoading(false); return }
      query = query.in('author_id', ids)

    } else if (tab === 'classes') {
      if (!profile.classId) { setPosts([]); setPostsLoading(false); return }
      const { data: cu } = await supabase
        .from('profiles').select('id').eq('class_id', profile.classId)
      const ids = (cu ?? []).map((u: any) => u.id as string)
      if (ids.length === 0) { setPosts([]); setPostsLoading(false); return }
      query = query.in('author_id', ids)
    }

    const { data, error } = await query
    if (error) { console.error('loadPosts:', error.message); setPostsLoading(false); return }

    // Fetch interaction state
    const myL = new Set<string>()
    const myR = new Set<string>()
    const myB = new Set<string>()
    const myV = new Set<string>()

    if (data && data.length > 0) {
      const postIds = data.map((p: any) => p.id)
      const [lRes, rRes, bRes, vRes] = await Promise.all([
        supabase.from('sq_likes').select('post_id').eq('user_id', profile.userId).in('post_id', postIds),
        supabase.from('sq_reposts').select('post_id').eq('user_id', profile.userId).in('post_id', postIds),
        supabase.from('sq_bookmarks').select('post_id').eq('user_id', profile.userId).in('post_id', postIds),
        supabase.from('sq_poll_votes').select('post_id').eq('user_id', profile.userId).in('post_id', postIds),
      ])
      ;(lRes.data ?? []).forEach((r: any) => { myL.add(r.post_id); likedIds.current.add(r.post_id) })
      ;(rRes.data ?? []).forEach((r: any) => { myR.add(r.post_id); repostedIds.current.add(r.post_id) })
      ;(bRes.data ?? []).forEach((r: any) => { myB.add(r.post_id); bookmarkedIds.current.add(r.post_id) })
      ;(vRes.data ?? []).forEach((r: any) => { myV.add(r.post_id); votedIds.current.add(r.post_id) })
    }

    setPosts((data ?? []).map((row: any) => rowToPost(row, myL, myR, myB, myV)))
    setPostsLoading(false)
  }, [profile.userId, profile.collegeId, profile.classId])

  useEffect(() => { void loadPosts(feedTab) }, [feedTab, profile.userId])

  // ── Real-time feed updates ────────────────────────────────────────────────
  useEffect(() => {
    if (!profile.userId) return
    const ch = supabase.channel('forum_feed_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sq_posts' }, async payload => {
        if ((payload.new as any).reply_to_id) return
        const { data } = await supabase
          .from('sq_posts')
          .select(`*, profiles!sq_posts_author_id_fkey(full_name,forum_handle,forum_initials,forum_grad,avatar_url,is_verified)`)
          .eq('id', (payload.new as any).id)
          .single()
        if (data) {
          setPosts(prev => {
            if (prev.some(p => p.id === (data as any).id)) return prev
            return [rowToPost(data as any, likedIds.current, repostedIds.current, bookmarkedIds.current, votedIds.current), ...prev]
          })
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'sq_posts' }, payload => {
        setPosts(prev => prev.filter(p => p.id !== (payload.old as any).id))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile.userId])

  // ── Notification badge ────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile.userId) return
    const fetch = async () => {
      const { count } = await supabase
        .from('sq_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.userId).eq('read', false)
      setUnreadCount(count ?? 0)
    }
    void fetch()
    const ch = supabase.channel(`notif_badge_${profile.userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sq_notifications', filter: `user_id=eq.${profile.userId}` }, fetch)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile.userId])

  // ── Interactions ──────────────────────────────────────────────────────────
  const {
    handleLike, handleRepost, handleBookmark, handleShare,
    handleVote, handleDeletePost, handleNewPost, handleNewReply,
  } = useForumInteractions({
    mediaBucket:   MEDIA_BUCKET,
    profile,
    showToast,
    setPosts,
    setThreadPost,
    likedIds,
    repostedIds,
    bookmarkedIds,
    votedIds,
    mapRowToPost: rowToPost,
  })

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadPosts(feedTab)
    setRefreshing(false)
  }, [feedTab, loadPosts])

  const handleOpenThread = useCallback((post: Post) => {
    setThreadPost(post)
    if (!post.id.startsWith('temp-')) {
      void (async () => {
        try { await supabase.rpc('sq_increment_view', { p_id: post.id }) } catch { /* ignore */ }
      })()
    }
  }, [])

  const handleOpenSearch = useCallback((q?: string) => {
    setSearchQuery(q || '')
    setShowSearch(true)
  }, [])

  const handleOpenProfile = useCallback(async (userId: string) => {
    if (!userId || userId === profile.userId) return
    setProfileUserId(userId)
  }, [profile.userId])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>

      {/* Header */}
      <View style={[hd.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={hd.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={19} color={T.text} />
        </TouchableOpacity>
        <View style={hd.brand}>
          <LinearGradient colors={[T.accent, T.accentGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={hd.brandLogo}>
            <Text style={hd.brandLogoText}>SQ</Text>
          </LinearGradient>
          <View>
            <Text style={hd.brandName}>StudentSquare</Text>
            <Text style={hd.brandSub}>FORUM</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={hd.iconBtn} onPress={() => { setShowNotifs(true); setUnreadCount(0) }}>
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

      {/* Tabs */}
      <View style={hd.tabsRow}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.key} style={hd.tab} onPress={() => setFeedTab(tab.key)} activeOpacity={0.8}>
            <Text style={[hd.tabText, feedTab === tab.key && hd.tabTextActive]}>{tab.label}</Text>
            {feedTab === tab.key && <View style={hd.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Offline banner */}
      {isOffline && (
        <View style={forumSt.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color={T.amber} />
          <Text style={forumSt.offlineText}>You're offline — showing cached posts</Text>
        </View>
      )}

      {/* Feed */}
      <FlatList
        data={posts}
        keyExtractor={p => p.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        ListHeaderComponent={
          <InlineComposer
            onFocus={() => { setReplyTo(null); _setShowCompose(true) }}
            onPost={(text, img) => handleNewPost(text, img)}
            profile={profile}
          />
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            myUserId={profile.userId}
            onLike={handleLike}
            onRepost={handleRepost}
            onBookmark={handleBookmark}
            onReply={p => { setReplyTo(p); _setShowCompose(true) }}
            onShare={handleShare}
            onOpen={handleOpenThread}
            onVote={handleVote}
            onHashtag={handleOpenSearch}
            onAvatarPress={handleOpenProfile}
            onDelete={handleDeletePost}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.accent} />}
        ListEmptyComponent={
          postsLoading ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Ionicons name="hourglass-outline" size={32} color={T.muted} />
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingTop: 80, gap: 12, paddingHorizontal: 40 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: T.text, textAlign: 'center' }}>
                {feedTab === 'following' ? 'Your following feed is empty'
                  : feedTab === 'campus' ? 'No campus posts yet'
                  : feedTab === 'classes' ? 'No class posts yet'
                  : 'Nothing here yet'}
              </Text>
              <Text style={{ color: T.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
                {feedTab === 'following' ? 'Follow people to see their posts here.'
                  : feedTab === 'campus' ? (profile.collegeId ? 'Be the first from your campus to post!' : 'Your college is not set in your profile.')
                  : feedTab === 'classes' ? (profile.classId ? 'Be the first from your class to post!' : 'Your class is not set in your profile.')
                  : 'Be the first to post!'}
              </Text>
            </View>
          )
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={[fab.btn, { bottom: insets.bottom + 24 }]}
        onPress={() => { setReplyTo(null); _setShowCompose(true) }}
        activeOpacity={0.85}
      >
        <LinearGradient colors={[T.accent, '#0d8bd9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={fab.gradient}>
          <Ionicons name="create-outline" size={24} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      {/* Modals */}
      <SearchModal
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        initialQuery={searchQuery}
        currentUserId={profile.userId}
      />
      <BookmarksModal
        visible={showBookmarks}
        onClose={() => setShowBookmarks(false)}
        userId={profile.userId}
        mapRowToPost={(row, myL, myR, myB) => rowToPost(row, myL, myR, myB, votedIds.current)}
        renderPost={item => (
          <PostCard
            post={item}
            myUserId={profile.userId}
            onLike={handleLike} onRepost={handleRepost} onBookmark={handleBookmark}
            onReply={p => { setReplyTo(p); _setShowCompose(true) }}
            onShare={handleShare} onOpen={handleOpenThread}
            onVote={handleVote} onHashtag={handleOpenSearch}
            onAvatarPress={handleOpenProfile} onDelete={handleDeletePost}
          />
        )}
      />
      <NotificationsModal
        visible={showNotifs}
        onClose={() => setShowNotifs(false)}
        userId={profile.userId}
        mapNotifRow={rowToNotif}
      />
      <ComposeModal
        visible={showCompose}
        onClose={() => { _setShowCompose(false); setReplyTo(null) }}
        onPost={(text, img, pollOpts, isAnon) => {
          handleNewPost(text, img, pollOpts, replyTo?.id, isAnon)
          setReplyTo(null)
        }}
        replyTo={replyTo}
        profile={profile}
      />
      <ThreadModal
        post={threadPost}
        visible={!!threadPost}
        onClose={() => setThreadPost(null)}
        onLike={handleLike}
        onRepost={handleRepost}
        onBookmark={handleBookmark}
        onShare={handleShare}
        profile={profile}
        onNewReply={handleNewReply}
        myUserId={profile.userId}
        onDeleteReply={handleDeletePost}
      />
      <ProfileCardModal
        userId={profileUserId}
        visible={!!profileUserId}
        onClose={() => setProfileUserId(null)}
        currentUserId={profile.userId}
        onOpen={handleOpenThread}
        onDelete={handleDeletePost}
      />
      <Toast message={toastMsg} visible={toastVis} />
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const forumSt = StyleSheet.create({
  offlineBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,212,0,0.1)', paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#2f3336' },
  offlineText:   { fontSize: 12, fontWeight: '600', color: '#ffd400' },
})

const s = StyleSheet.create({
  divider:          { height: 1, backgroundColor: T.border },
  repostLabel:      { paddingLeft: 62, paddingTop: 10, paddingBottom: 2, flexDirection: 'row', alignItems: 'center', gap: 6 },
  repostLabelText:  { fontSize: 13, color: T.green, fontWeight: '600' },
  post:             { flexDirection: 'row', paddingVertical: 14, paddingRight: 16, backgroundColor: T.bg },
  postLeft:         { alignItems: 'center', marginRight: 12, marginLeft: 14 },
  threadLine:       { width: 2, flex: 1, backgroundColor: T.border2, marginTop: 6, borderRadius: 1, minHeight: 20 },
  postBody:         { flex: 1, minWidth: 0 },
  postHeader:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4, gap: 4 },
  postName:         { fontSize: 15, fontWeight: '800', color: T.text },
  postHandle:       { fontSize: 13, color: T.muted },
  postDot:          { fontSize: 13, color: T.muted },
  postTime:         { fontSize: 13, color: T.muted },
  postText:         { fontSize: 15, lineHeight: 24, color: T.text, marginBottom: 10 },
  postImageWrap:    { borderRadius: 16, overflow: 'hidden', marginBottom: 10, borderWidth: 1, borderColor: T.border },
  postImage:        { width: '100%', aspectRatio: 16 / 9 },
  postActions:      { flexDirection: 'row', alignItems: 'center', marginLeft: -10, marginTop: 4, gap: 4 },
  action:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 50 },
  actionCount:      { fontSize: 13, fontWeight: '600' },
  optionsBtn:       { padding: 4, marginLeft: 4 },
  // Poll
  poll:             { marginBottom: 10, gap: 8 },
  pollOption:       { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: T.border2, borderRadius: 50, paddingVertical: 10, paddingHorizontal: 16, overflow: 'hidden', position: 'relative', minHeight: 44 },
  pollOptionWinning:{ borderColor: T.accent },
  pollBar:          { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 50 },
  pollLabel:        { fontSize: 15, fontWeight: '600', color: T.text, flex: 1, zIndex: 1 },
  pollPct:          { fontSize: 14, fontWeight: '600', color: T.muted, zIndex: 1 },
  pollMeta:         { fontSize: 13, color: T.muted, marginTop: 2, paddingHorizontal: 4 },
  pollHint:         { fontSize: 13, color: T.muted, marginTop: 2, paddingHorizontal: 4 },
})

const hd = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: 'rgba(0,0,0,0.95)', gap: 10 },
  brand:         { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  brandLogo:     { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  brandLogoText: { fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  brandName:     { fontSize: 15, fontWeight: '800', color: T.text, letterSpacing: -0.3 },
  brandSub:      { fontSize: 8.5, fontWeight: '700', color: T.muted, letterSpacing: 1.5 },
  iconBtn:       { width: 36, height: 36, borderRadius: 12, backgroundColor: T.bg3, borderWidth: 1, borderColor: T.border, justifyContent: 'center', alignItems: 'center' },
  badge:         { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: T.accent, borderWidth: 2, borderColor: T.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  badgeText:     { fontSize: 9, fontWeight: '900', color: '#fff' },
  tabsRow:       { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: 'rgba(0,0,0,0.92)' },
  tab:           { flex: 1, alignItems: 'center', paddingVertical: 14, position: 'relative' },
  tabText:       { fontSize: 13, fontWeight: '600', color: T.muted, letterSpacing: 0.3 },
  tabTextActive: { color: T.text, fontWeight: '800' },
  tabIndicator:  { position: 'absolute', bottom: 0, height: 2.5, width: 32, borderRadius: 2, backgroundColor: T.accent },
})

const ic = StyleSheet.create({
  composer:    { flexDirection: 'row', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.bg },
  body:        { flex: 1, minWidth: 0 },
  input:       { fontSize: 17, color: T.text, lineHeight: 26, minHeight: 56, paddingTop: 0 },
  imgRemove:   { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  actions:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.border, marginTop: 8 },
  toolBtn:     { padding: 6, borderRadius: 50 },
  charCount:   { marginLeft: 'auto' as any, fontSize: 13, fontWeight: '600', color: T.muted },
  sendBtn:     { backgroundColor: T.accent, borderRadius: 100, paddingHorizontal: 18, paddingVertical: 8, marginLeft: 6 },
  sendBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
})

const fab = StyleSheet.create({
  btn:      { position: 'absolute', right: 22, zIndex: 200, shadowColor: T.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 12 },
  gradient: { width: 58, height: 58, borderRadius: 29, justifyContent: 'center', alignItems: 'center' },
})