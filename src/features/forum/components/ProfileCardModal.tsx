import type { Post, UserProfile } from '@/features/forum/types'
import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
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
  bg4:     '#202327',
  border:  '#2f3336',
  border2: '#3e4144',
  text:    '#e7e9ea',
  muted:   '#71767b',
  muted2:  '#8b98a5',
  accent:  '#1DA1F2',
  green:   '#00ba7c',
  red:     '#f91880',
  gold:    '#ffd400',
} as const

function fmt(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000 ? `${(n / 1000).toFixed(1)}K`
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

function rowToPost(row: any, myL: Set<string>, myR: Set<string>, myB: Set<string>): Post {
  const isAnon   = !!row.is_anonymous
  const fullName = row.author_name       || row.profiles?.full_name    || 'Student'
  const handle   = row.author_handle     || row.profiles?.forum_handle || null
  const initials = row.author_initials   || row.profiles?.forum_initials || fullName.slice(0, 2).toUpperCase()
  const rawGrad  = row.author_grad       || row.profiles?.forum_grad   || null
  const grad     = (Array.isArray(rawGrad) ? rawGrad : ['#1DA1F2', '#0d8bd9']) as [string, string]
  const avatarUrl= row.author_avatar_url || row.profiles?.avatar_url   || null
  const verified = row.author_verified   ?? row.profiles?.is_verified  ?? false

  let poll: Post['poll'], pollMeta: string | undefined
  if (Array.isArray(row.poll_options) && row.poll_options.length > 0) {
    const total = row.poll_options.reduce((a: number, o: any) => a + (o.votes ?? 0), 0)
    const maxV  = Math.max(...row.poll_options.map((o: any) => o.votes ?? 0))
    poll = row.poll_options.map((o: any) => ({
      label: o.label, votes: o.votes ?? 0,
      pct: total > 0 ? Math.round(((o.votes ?? 0) / total) * 100) : 0,
      winning: (o.votes ?? 0) === maxV && maxV > 0,
    }))
    pollMeta = `${total} vote${total !== 1 ? 's' : ''}`
  }

  return {
    id: row.id, isSeed: false,
    type: (row.post_type as Post['type']) || (poll ? 'poll' : 'normal'),
    authorId: row.author_id,
    name:     isAnon ? 'Anonymous' : fullName,
    handle:   isAnon ? '@anonymous' : ensureHandle(handle, fullName),
    verified: isAnon ? false : verified,
    time:     timeAgo(row.created_at || new Date().toISOString()),
    avatar:   isAnon ? '?' : initials,
    avatarGrad: isAnon ? ['#3e4144', '#16181c'] : grad,
    avatarUri:  isAnon ? null : avatarUrl,
    text:     row.body || '',
    imageUrl: row.image_url || null,
    poll, pollMeta, pollVoted: false,
    replies:   row.comment_count  ?? 0,
    reposts:   row.repost_count   ?? 0,
    likes:     row.like_count     ?? 0,
    views:     fmt(row.view_count ?? 0),
    bookmarks: row.bookmark_count ?? 0,
    liked:     myL.has(row.id),
    reposted:  myR.has(row.id),
    bookmarked:myB.has(row.id),
  }
}

// ── Study rank calculation ───────────────────────────────────────────────────
// Based on total engagement: likes + reposts + replies received
function calcStudyRank(totalLikes: number, totalReposts: number, totalReplies: number, postsCount: number): string {
  const score = totalLikes * 3 + totalReposts * 2 + totalReplies + postsCount
  if (score >= 500)  return 'Top 1%'
  if (score >= 200)  return 'Top 5%'
  if (score >= 100)  return 'Top 10%'
  if (score >= 50)   return 'Top 25%'
  if (score >= 20)   return 'Top 50%'
  return 'Rising'
}

// ── Avatar ───────────────────────────────────────────────────────────────────
function Avi({ initials, grad, size = 40, uri, verified = false }: {
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
        <View style={{ position: 'absolute', bottom: -1, right: -1, width: 16, height: 16, borderRadius: 8, backgroundColor: T.accent, borderWidth: 2, borderColor: T.bg, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="checkmark" size={8} color="#fff" />
        </View>
      )}
    </View>
  )
}

// ── Mini PostCard for profile feed ──────────────────────────────────────────
function MiniPostCard({ post, onPress }: { post: Post; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={mp.card}>
      <View style={mp.row}>
        <Avi initials={post.avatar} grad={post.avatarGrad} size={36} uri={post.avatarUri} verified={post.verified} />
        <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <Text style={mp.name} numberOfLines={1}>{post.name}</Text>
            {post.verified && <Ionicons name="checkmark-circle" size={12} color={T.accent} />}
            <Text style={mp.handle} numberOfLines={1}>{post.handle}</Text>
            <Text style={mp.dot}>·</Text>
            <Text style={mp.time}>{post.time}</Text>
          </View>
          <Text style={mp.text} numberOfLines={3}>{post.text}</Text>
          {post.imageUrl && (
            <View style={{ borderRadius: 10, overflow: 'hidden', marginTop: 8, borderWidth: 1, borderColor: T.border }}>
              <Image source={{ uri: post.imageUrl }} style={{ width: '100%', aspectRatio: 16 / 9 }} resizeMode="cover" />
            </View>
          )}
          <View style={mp.stats}>
            <View style={mp.stat}>
              <Ionicons name="chatbubble-outline" size={13} color={T.muted} />
              <Text style={mp.statTxt}>{fmt(post.replies)}</Text>
            </View>
            <View style={mp.stat}>
              <Ionicons name="repeat" size={13} color={T.muted} />
              <Text style={mp.statTxt}>{fmt(post.reposts)}</Text>
            </View>
            <View style={mp.stat}>
              <Ionicons name="heart-outline" size={13} color={T.muted} />
              <Text style={mp.statTxt}>{fmt(post.likes)}</Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const mp = StyleSheet.create({
  card:    { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  row:     { flexDirection: 'row' },
  name:    { fontSize: 14, fontWeight: '800', color: T.text, flexShrink: 1 },
  handle:  { fontSize: 13, color: T.muted, flexShrink: 1 },
  dot:     { fontSize: 13, color: T.muted },
  time:    { fontSize: 13, color: T.muted },
  text:    { fontSize: 14, color: T.muted2, lineHeight: 20, marginTop: 4 },
  stats:   { flexDirection: 'row', gap: 16, marginTop: 8 },
  stat:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statTxt: { fontSize: 13, color: T.muted },
})

// ── ProfileCardModal ─────────────────────────────────────────────────────────
type ProfileUser = {
  id:             string
  fullName:       string
  handle:         string
  initials:       string
  grad:           [string, string]
  avatar:         string | null
  verified:       boolean
  bio:            string | null
  college:        string | null
  className:      string | null
  followersCount: number
  followingCount: number
}

export function ProfileCardModal({
  userId, visible, onClose, currentUserId, onOpen, onDelete,
}: {
  userId:        string | null
  visible:       boolean
  onClose:       () => void
  currentUserId: string
  onOpen:        (p: Post) => void
  onDelete:      (id: string) => void
}) {
  const insets = useSafeAreaInsets()
  const [user,          setUser]          = useState<ProfileUser | null>(null)
  const [posts,         setPosts]         = useState<Post[]>([])
  const [loading,       setLoading]       = useState(false)
  const [following,     setFollowing]     = useState(false)
  const [followersCount,setFollowersCount]= useState(0)
  const [followingCount,setFollowingCount]= useState(0)
  const [followLoading, setFollowLoading] = useState(false)
  const [studyRank,     setStudyRank]     = useState('Rising')

  const isOwnProfile = userId === currentUserId

  useEffect(() => {
    if (!visible || !userId) return
    setUser(null); setPosts([]); setLoading(true)
    setFollowing(false); setFollowersCount(0); setFollowingCount(0)
    void loadProfile(userId)
  }, [visible, userId])

  const loadProfile = async (uid: string) => {
    // Load profile + posts + follow status in parallel
    const [profRes, postsRes, followRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id,full_name,forum_handle,forum_initials,forum_grad,avatar_url,is_verified,bio,followers_count,following_count,colleges(name),classes(name)')
        .eq('id', uid)
        .single(),
      supabase
        .from('sq_posts')
        .select('*, profiles!sq_posts_author_id_fkey(full_name,forum_handle,forum_initials,forum_grad,avatar_url,is_verified)')
        .eq('author_id', uid)
        .is('reply_to_id', null)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('sq_follows')
        .select('follower_id', { count: 'exact', head: true })
        .eq('follower_id', currentUserId)
        .eq('following_id', uid),
    ])

    setLoading(false)

    if (profRes.data) {
      const d = profRes.data as any
      const rawGrad = d.forum_grad
      const grad = (Array.isArray(rawGrad) ? rawGrad : ['#1DA1F2', '#0d8bd9']) as [string, string]
      setUser({
        id:             d.id,
        fullName:       d.full_name ?? 'User',
        handle:         ensureHandle(d.forum_handle, d.full_name),
        initials:       d.forum_initials ?? d.full_name?.slice(0, 2).toUpperCase() ?? '??',
        grad,
        avatar:         d.avatar_url ?? null,
        verified:       d.is_verified ?? false,
        bio:            d.bio ?? null,
        college:        (d.colleges as any)?.name ?? null,
        className:      (d.classes as any)?.name ?? null,
        followersCount: d.followers_count ?? 0,
        followingCount: d.following_count ?? 0,
      })
      setFollowersCount(d.followers_count ?? 0)
      setFollowingCount(d.following_count ?? 0)
    }

    setFollowing((followRes.count ?? 0) > 0)

    if (postsRes.data) {
      // Get current user's interaction state
      const postIds = postsRes.data.map((p: any) => p.id)
      const myL = new Set<string>()
      const myR = new Set<string>()
      const myB = new Set<string>()
      if (postIds.length > 0) {
        const [lR, rR, bR] = await Promise.all([
          supabase.from('sq_likes').select('post_id').eq('user_id', currentUserId).in('post_id', postIds),
          supabase.from('sq_reposts').select('post_id').eq('user_id', currentUserId).in('post_id', postIds),
          supabase.from('sq_bookmarks').select('post_id').eq('user_id', currentUserId).in('post_id', postIds),
        ])
        ;(lR.data ?? []).forEach((r: any) => myL.add(r.post_id))
        ;(rR.data ?? []).forEach((r: any) => myR.add(r.post_id))
        ;(bR.data ?? []).forEach((r: any) => myB.add(r.post_id))
      }
      const mapped = postsRes.data.map((row: any) => rowToPost(row, myL, myR, myB))
      setPosts(mapped)

      // Calculate study rank from real engagement data
      const totalLikes   = mapped.reduce((a, p) => a + p.likes,   0)
      const totalReposts = mapped.reduce((a, p) => a + p.reposts, 0)
      const totalReplies = mapped.reduce((a, p) => a + p.replies, 0)
      setStudyRank(calcStudyRank(totalLikes, totalReposts, totalReplies, mapped.length))
    }
  }

  const handleFollowToggle = async () => {
    if (!userId || !currentUserId || followLoading || isOwnProfile) return
    setFollowLoading(true)
    const nowFollowing = !following

    // Optimistic update
    setFollowing(nowFollowing)
    setFollowersCount(c => c + (nowFollowing ? 1 : -1))

    try {
      if (nowFollowing) {
        await supabase.from('sq_follows')
          .insert({ follower_id: currentUserId, following_id: userId })
        // Update follower's following_count and target's followers_count
        await Promise.all([
          supabase.rpc('sq_increment_following_count', { p_user_id: currentUserId }),
          supabase.rpc('sq_increment_followers_count', { p_user_id: userId }),
        ])
        // Send follow notification
        await supabase.from('sq_notifications').insert({
          user_id:  userId,
          type:     'follow',
          actor_id: currentUserId,
          read:     false,
        })
      } else {
        await supabase.from('sq_follows')
          .delete().match({ follower_id: currentUserId, following_id: userId })
        await Promise.all([
          supabase.rpc('sq_decrement_following_count', { p_user_id: currentUserId }),
          supabase.rpc('sq_decrement_followers_count', { p_user_id: userId }),
        ])
      }
    } catch (e) {
      // Rollback on error
      setFollowing(!nowFollowing)
      setFollowersCount(c => c + (nowFollowing ? -1 : 1))
    } finally {
      setFollowLoading(false)
    }
  }

  if (!visible) return null

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg }}>

        {loading && !user ? (
          // Full screen loader
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: T.bg }}>
            <View style={[pf.header, { paddingTop: insets.top + 6, position: 'absolute', top: 0, left: 0, right: 0 }]}>
              <TouchableOpacity style={pf.backBtn} onPress={onClose}>
                <Ionicons name="arrow-back" size={22} color={T.text} />
              </TouchableOpacity>
            </View>
            <ActivityIndicator color={T.accent} size="large" />
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={p => p.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            ListHeaderComponent={
              <View>
                {/* ── Cover banner ── */}
                <View style={pf.coverContainer}>
                  {user ? (
                    <LinearGradient
                      colors={[user.grad[0], user.grad[1], T.bg2]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={[pf.cover, { paddingTop: insets.top }]}
                    />
                  ) : (
                    <View style={[pf.cover, { paddingTop: insets.top, backgroundColor: T.bg3 }]} />
                  )}

                  {/* Back button — always on top of cover */}
                  <View style={[pf.coverNav, { top: insets.top + 8 }]}>
                    <TouchableOpacity style={pf.navBtn} onPress={onClose}>
                      <Ionicons name="arrow-back" size={20} color="#fff" />
                    </TouchableOpacity>
                    {user && !isOwnProfile && (
                      <TouchableOpacity style={pf.navBtn}>
                        <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {user && (
                  <>
                    {/* ── Avatar + action row ── */}
                    <View style={pf.avatarRow}>
                      <View style={pf.avatarRing}>
                        <LinearGradient
                          colors={user.grad}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                          style={pf.avatarGrad}
                        >
                          {user.avatar
                            ? <Image source={{ uri: user.avatar }} style={pf.avatarImg} resizeMode="cover" />
                            : <Text style={pf.avatarInitials}>{user.initials}</Text>
                          }
                        </LinearGradient>
                      </View>

                      {/* Action buttons */}
                      {isOwnProfile ? (
                        <TouchableOpacity style={pf.editBtn}>
                          <Text style={pf.editBtnText}>Edit profile</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                          <TouchableOpacity style={pf.msgBtn}>
                            <Ionicons name="mail-outline" size={18} color={T.accent} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[pf.followBtn, following && pf.followBtnActive]}
                            onPress={handleFollowToggle}
                            disabled={followLoading}
                          >
                            {followLoading
                              ? <ActivityIndicator size="small" color={following ? T.text : T.bg} />
                              : <Text style={[pf.followBtnText, following && pf.followBtnTextActive]}>
                                  {following ? 'Following' : 'Follow'}
                                </Text>
                            }
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {/* ── Name, handle, bio ── */}
                    <View style={pf.info}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={pf.name}>{user.fullName}</Text>
                        {user.verified && (
                          <View style={pf.verifiedBadge}>
                            <Ionicons name="checkmark" size={10} color="#fff" />
                          </View>
                        )}
                      </View>
                      <Text style={pf.handle}>{user.handle}</Text>

                      {(user.college || user.className) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          <Ionicons name="school-outline" size={14} color={T.muted} />
                          <Text style={pf.collegeLine}>
                            {[user.college, user.className].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                      )}

                      {user.bio ? (
                        <Text style={pf.bio}>{user.bio}</Text>
                      ) : null}
                    </View>

                    {/* ── Stats row ── */}
                    <View style={pf.statsRow}>
                      <TouchableOpacity style={pf.statItem}>
                        <Text style={pf.statNum}>{fmt(followingCount)}</Text>
                        <Text style={pf.statLabel}>Following</Text>
                      </TouchableOpacity>
                      <View style={pf.statDivider} />
                      <TouchableOpacity style={pf.statItem}>
                        <Text style={pf.statNum}>{fmt(followersCount)}</Text>
                        <Text style={pf.statLabel}>{followersCount === 1 ? 'Follower' : 'Followers'}</Text>
                      </TouchableOpacity>
                      <View style={pf.statDivider} />
                      <View style={pf.statItem}>
                        <Text style={pf.statNum}>{fmt(posts.length)}</Text>
                        <Text style={pf.statLabel}>Posts</Text>
                      </View>
                      <View style={pf.statDivider} />
                      <View style={pf.statItem}>
                        <Text style={[pf.statNum, { color: T.gold }]}>{studyRank}</Text>
                        <Text style={pf.statLabel}>Study Rank</Text>
                      </View>
                    </View>

                    {/* ── Posts section header ── */}
                    <View style={pf.sectionHeader}>
                      <Text style={pf.sectionTitle}>Posts</Text>
                    </View>
                    <View style={{ height: 1, backgroundColor: T.border }} />
                  </>
                )}
              </View>
            }
            ListEmptyComponent={
              !loading ? (
                <View style={{ alignItems: 'center', paddingTop: 60, gap: 10, paddingHorizontal: 40 }}>
                  <Ionicons name="document-text-outline" size={40} color={T.muted} />
                  <Text style={{ fontSize: 18, fontWeight: '800', color: T.text }}>No posts yet</Text>
                  <Text style={{ fontSize: 14, color: T.muted, textAlign: 'center' }}>
                    {isOwnProfile ? 'Share what\'s on your mind!' : 'This user hasn\'t posted yet.'}
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <MiniPostCard post={item} onPress={() => onOpen(item)} />
            )}
          />
        )}
      </View>
    </Modal>
  )
}

const COVER_HEIGHT = 140

const pf = StyleSheet.create({
  // Header (inside cover)
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, zIndex: 10 },
  backBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },

  // Cover
  coverContainer: { position: 'relative' },
  cover:          { height: COVER_HEIGHT, width: '100%' },
  coverNav:       { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 },
  navBtn:         { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },

  // Avatar row
  avatarRow:      { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: -46, marginBottom: 12 },
  avatarRing:     { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: T.bg, overflow: 'hidden', backgroundColor: T.bg3 },
  avatarGrad:     { width: 88, height: 88, justifyContent: 'center', alignItems: 'center' },
  avatarImg:      { width: 88, height: 88, borderRadius: 44, position: 'absolute' },
  avatarInitials: { fontSize: 28, fontWeight: '900', color: '#fff' },

  // Buttons
  followBtn:          { backgroundColor: T.text, borderRadius: 100, paddingHorizontal: 20, paddingVertical: 9, minWidth: 90, alignItems: 'center' },
  followBtnActive:    { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: T.border2 },
  followBtnText:      { fontSize: 14, fontWeight: '800', color: T.bg },
  followBtnTextActive:{ color: T.text },
  msgBtn:             { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: T.border2, justifyContent: 'center', alignItems: 'center' },
  editBtn:            { borderWidth: 1.5, borderColor: T.border2, borderRadius: 100, paddingHorizontal: 20, paddingVertical: 9 },
  editBtnText:        { fontSize: 14, fontWeight: '700', color: T.text },

  // Info
  info:          { paddingHorizontal: 16, paddingBottom: 16 },
  name:          { fontSize: 22, fontWeight: '900', color: T.text },
  handle:        { fontSize: 14, color: T.muted, marginTop: 2 },
  verifiedBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: T.accent, justifyContent: 'center', alignItems: 'center' },
  collegeLine:   { fontSize: 13, color: T.muted },
  bio:           { fontSize: 14, color: T.muted2, lineHeight: 22, marginTop: 10 },

  // Stats
  statsRow:    { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.border, paddingVertical: 16 },
  statItem:    { flex: 1, alignItems: 'center', gap: 4 },
  statNum:     { fontSize: 18, fontWeight: '900', color: T.text },
  statLabel:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: T.muted, textTransform: 'uppercase' },
  statDivider: { width: 1, backgroundColor: T.border, marginVertical: 4 },

  // Section
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 14 },
  sectionTitle:  { fontSize: 16, fontWeight: '800', color: T.text },
})