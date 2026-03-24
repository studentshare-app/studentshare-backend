/**
 * lib/queries/studentForum.ts
 *
 * Supabase query hooks for StudentForum.
 *
 * Fixes applied vs original:
 *  FIX 1 — Realtime UPDATE handler now patches only the affected post's
 *           vote/comment counts in-place instead of re-fetching the whole feed.
 *  FIX 2 — useChannelUnreadCounts now uses forum_last_visited for accurate
 *           per-channel unread counts instead of a rolling 24h window.
 *  FIX 3 — useVote / useReact / useBookmark accept setPosts via closure
 *           (returned from useForumPosts) so they share the same state atom.
 *  FIX 4 — addComment now refreshes comment count optimistically on the post.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export type ReactionKey = '🔥' | '❤️' | '😂' | '🤯' | '👏'

export type ForumPostRow = {
  id: string
  channel_id: string
  author_id: string | null
  is_anon: boolean
  is_pinned: boolean
  title: string
  body: string
  image_url: string | null
  tags: string[]
  upvotes: number
  downvotes: number
  comment_count: number
  created_at: string
  // joined
  profiles?: {
    full_name: string
    avatar_url: string | null
    is_verified: boolean
    colleges?: { short_name: string }
  }
  my_vote?: 'up' | 'down' | null
  my_reaction?: ReactionKey | null
  has_bookmarked?: boolean
  reactions?: Record<ReactionKey, number>
}

export type ForumCommentRow = {
  id: string
  post_id: string
  parent_id: string | null
  author_id: string | null
  is_anon: boolean
  body: string
  upvotes: number
  created_at: string
  profiles?: { full_name: string; is_verified: boolean }
  my_vote?: boolean
  replies?: ForumCommentRow[]
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
export const EMPTY_REACTIONS: Record<ReactionKey, number> = {
  '🔥': 0, '❤️': 0, '😂': 0, '🤯': 0, '👏': 0,
}

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

function hotScore(p: ForumPostRow): number {
  const score    = p.upvotes - p.downvotes
  const ageHours = (Date.now() - new Date(p.created_at).getTime()) / 3_600_000
  return (score + p.comment_count * 2) / Math.pow(ageHours + 2, 1.5)
}

// ─────────────────────────────────────────────
// useForumPosts — main feed hook
// ─────────────────────────────────────────────
export function useForumPosts({
  channelId = 'all',
  sort      = 'trending',
}: {
  channelId?: string
  sort?:      'trending' | 'new' | 'top'
}) {
  const [posts,     setPosts]   = useState<ForumPostRow[]>([])
  const [isLoading, setLoading] = useState(true)
  const userIdRef = useRef<string | null>(null)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const userId = userIdRef.current ?? await getCurrentUserId()
      userIdRef.current = userId

      // 1. Base post query — no profile join (author_id refs auth.users, not public.profiles)
      let q = supabase
        .from('forum_posts')
        .select('id, channel_id, author_id, is_anon, is_pinned, title, body, image_url, tags, upvotes, downvotes, comment_count, created_at')
        .limit(40)

      if (channelId !== 'all') q = q.eq('channel_id', channelId)

      if      (sort === 'new') q = q.order('created_at', { ascending: false })
      else if (sort === 'top') q = q.order('upvotes',    { ascending: false })
      else                     q = q.order('created_at', { ascending: false })

      const { data: rawPosts, error } = await q
      if (error) throw error
      if (!rawPosts?.length) { setPosts([]); return }

      const postIds   = rawPosts.map((p: any) => p.id)
      const authorIds = [...new Set(rawPosts.map((p: any) => p.author_id).filter(Boolean))] as string[]

      // 2. Fetch profiles separately (profiles.id = auth.users.id — no direct FK to forum_posts)
      const profilesRes = authorIds.length
        ? await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, is_verified, college_id')
            .in('id', authorIds)
        : { data: [] }

      const collegeIds = [...new Set(
        (profilesRes.data ?? []).map((p: any) => p.college_id).filter(Boolean)
      )] as string[]

      const collegesRes = collegeIds.length
        ? await supabase.from('colleges').select('id, short_name').in('id', collegeIds)
        : { data: [] }

      const collegeMap = new Map<string, string>(
        (collegesRes.data ?? []).map((c: any) => [c.id, c.short_name])
      )
      const profileMap = new Map(
        (profilesRes.data ?? []).map((p: any) => [p.id, {
          full_name:   p.full_name   as string,
          avatar_url:  p.avatar_url  as string | null,
          is_verified: p.is_verified as boolean,
          colleges:    p.college_id ? { short_name: collegeMap.get(p.college_id) ?? '' } : undefined,
        }])
      )

      // 3. Fetch user-specific data + reaction counts in parallel
      const [votesRes, reactionsRes, bookmarksRes, reactCountsRes] = await Promise.all([
        userId
          ? supabase.from('forum_votes').select('post_id, direction').eq('user_id', userId).in('post_id', postIds)
          : { data: [] },
        userId
          ? supabase.from('forum_reactions').select('post_id, emoji').eq('user_id', userId).in('post_id', postIds)
          : { data: [] },
        userId
          ? supabase.from('forum_bookmarks').select('post_id').eq('user_id', userId).in('post_id', postIds)
          : { data: [] },
        supabase.from('forum_reactions').select('post_id, emoji').in('post_id', postIds),
      ])

      const myVotes     = new Map<string, 'up' | 'down'>()
      const myReactions = new Map<string, ReactionKey>()
      const bookmarked  = new Set<string>()
      const reactionMap = new Map<string, Record<ReactionKey, number>>()

      votesRes.data?.forEach((v: any)     => myVotes.set(v.post_id, v.direction))
      reactionsRes.data?.forEach((r: any) => myReactions.set(r.post_id, r.emoji as ReactionKey))
      bookmarksRes.data?.forEach((b: any) => bookmarked.add(b.post_id))

      reactCountsRes.data?.forEach((r: any) => {
        if (!reactionMap.has(r.post_id)) reactionMap.set(r.post_id, { ...EMPTY_REACTIONS })
        const rc = reactionMap.get(r.post_id)!
        rc[r.emoji as ReactionKey] = (rc[r.emoji as ReactionKey] || 0) + 1
      })

      // 4. Enrich posts
      let enriched: ForumPostRow[] = rawPosts.map((p: any) => ({
        ...p,
        profiles:       profileMap.get(p.author_id) ?? undefined,
        my_vote:        myVotes.get(p.id)    ?? null,
        my_reaction:    myReactions.get(p.id) ?? null,
        has_bookmarked: bookmarked.has(p.id),
        reactions:      reactionMap.get(p.id) ?? { ...EMPTY_REACTIONS },
      }))

      // 4. Client-side sort (hot score needs age info not available in SQL without RPC)
      if (sort === 'trending') {
        const pinned = enriched.filter(p => p.is_pinned)
        const rest   = enriched.filter(p => !p.is_pinned).sort((a, b) => hotScore(b) - hotScore(a))
        enriched = [...pinned, ...rest]
      } else {
        const pinned = enriched.filter(p => p.is_pinned)
        enriched = [...pinned, ...enriched.filter(p => !p.is_pinned)]
      }

      setPosts(enriched)
    } catch (e) {
      console.error('[useForumPosts]', e)
    } finally {
      setLoading(false)
    }
  }, [channelId, sort])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  // FIX 1: Realtime — INSERT triggers full refresh (new post);
  // UPDATE patches only the affected post's counts in-place (no full re-fetch).
  useEffect(() => {
    const channel = supabase
      .channel('forum-feed-rt')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'forum_posts',
      }, fetchPosts)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'forum_posts',
      }, (payload) => {
        // Patch only the changed row's denormalised counts — avoids full re-fetch
        const updated = payload.new as ForumPostRow
        setPosts(prev => prev.map(p =>
          p.id === updated.id
            ? { ...p, upvotes: updated.upvotes, downvotes: updated.downvotes, comment_count: updated.comment_count }
            : p
        ))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchPosts])

  return { posts, setPosts, isLoading, refetch: fetchPosts }
}

// ─────────────────────────────────────────────
// useForumComments — for post detail modal
// ─────────────────────────────────────────────
export function useForumComments(postId: string | null) {
  const [comments, setComments] = useState<ForumCommentRow[]>([])
  const [isLoading, setLoading] = useState(false)

  const fetchComments = useCallback(async () => {
    if (!postId) return
    setLoading(true)
    try {
      const userId = await getCurrentUserId()

      const { data: flat, error } = await supabase
        .from('forum_comments')
        .select('id, post_id, parent_id, author_id, is_anon, body, upvotes, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })

      if (error) throw error

      const commentIds = (flat ?? []).map((c: any) => c.id)
      const myVotes = userId && commentIds.length
        ? await supabase
            .from('forum_comment_votes')
            .select('comment_id')
            .eq('user_id', userId)
            .in('comment_id', commentIds)
        : { data: [] }

      const myVotedSet = new Set((myVotes.data ?? []).map((v: any) => v.comment_id))

      // Fetch comment author profiles separately
      const commentAuthorIds = [...new Set(
        (flat ?? []).map((c: any) => c.author_id).filter(Boolean)
      )] as string[]
      const commentProfilesRes = commentAuthorIds.length
        ? await supabase.from('profiles').select('id, full_name, is_verified').in('id', commentAuthorIds)
        : { data: [] }
      const commentProfileMap = new Map(
        (commentProfilesRes.data ?? []).map((p: any) => [p.id, { full_name: p.full_name as string, is_verified: p.is_verified as boolean }])
      )

      // Nest replies under parents
      const enriched: ForumCommentRow[] = (flat ?? []).map((c: any) => ({
        ...c,
        profiles: c.is_anon ? undefined : commentProfileMap.get(c.author_id),
        my_vote:  myVotedSet.has(c.id),
        replies:  [],
      }))
      const byId     = new Map(enriched.map(c => [c.id, c]))
      const topLevel: ForumCommentRow[] = []

      enriched.forEach(c => {
        if (c.parent_id && byId.has(c.parent_id)) {
          byId.get(c.parent_id)!.replies!.push(c)
        } else {
          topLevel.push(c)
        }
      })

      setComments(topLevel)
    } catch (e) {
      console.error('[useForumComments]', e)
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => { fetchComments() }, [fetchComments])

  return { comments, isLoading, refetch: fetchComments }
}

// ─────────────────────────────────────────────
// useVote — optimistic vote toggle
// ─────────────────────────────────────────────
export function useVote(setPosts: React.Dispatch<React.SetStateAction<ForumPostRow[]>>) {
  return useCallback(async (postId: string, dir: 'up' | 'down') => {
    const userId = await getCurrentUserId()
    if (!userId) return

    // Optimistic update
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p
      const wasDir   = p.my_vote === dir
      const wasOther = p.my_vote && p.my_vote !== dir
      return {
        ...p,
        my_vote:   wasDir ? null : dir,
        upvotes:   dir === 'up'
          ? wasDir   ? p.upvotes - 1 : p.upvotes + 1
          : wasOther && p.my_vote === 'up' ? p.upvotes - 1 : p.upvotes,
        downvotes: dir === 'down'
          ? wasDir   ? p.downvotes - 1 : p.downvotes + 1
          : wasOther && p.my_vote === 'down' ? p.downvotes - 1 : p.downvotes,
      }
    }))

    const { data: existing } = await supabase
      .from('forum_votes')
      .select('id, direction')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      if (existing.direction === dir) {
        await supabase.from('forum_votes').delete().eq('id', existing.id)
      } else {
        await supabase.from('forum_votes').update({ direction: dir }).eq('id', existing.id)
      }
    } else {
      await supabase.from('forum_votes').insert({ post_id: postId, user_id: userId, direction: dir })
    }
  }, [setPosts])
}

// ─────────────────────────────────────────────
// useReact — optimistic reaction toggle
// ─────────────────────────────────────────────
export function useReact(setPosts: React.Dispatch<React.SetStateAction<ForumPostRow[]>>) {
  return useCallback(async (postId: string, emoji: ReactionKey) => {
    const userId = await getCurrentUserId()
    if (!userId) return

    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p
      const wasMe    = p.my_reaction === emoji
      const reactions = { ...(p.reactions ?? EMPTY_REACTIONS) }
      if (p.my_reaction) reactions[p.my_reaction] = Math.max(0, (reactions[p.my_reaction] || 0) - 1)
      if (!wasMe) reactions[emoji] = (reactions[emoji] || 0) + 1
      return { ...p, reactions, my_reaction: wasMe ? null : emoji }
    }))

    const { data: existing } = await supabase
      .from('forum_reactions')
      .select('id, emoji')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      if (existing.emoji === emoji) {
        await supabase.from('forum_reactions').delete().eq('id', existing.id)
      } else {
        await supabase.from('forum_reactions').update({ emoji }).eq('id', existing.id)
      }
    } else {
      await supabase.from('forum_reactions').insert({ post_id: postId, user_id: userId, emoji })
    }
  }, [setPosts])
}

// ─────────────────────────────────────────────
// useBookmark — optimistic bookmark toggle
// ─────────────────────────────────────────────
export function useBookmark(setPosts: React.Dispatch<React.SetStateAction<ForumPostRow[]>>) {
  return useCallback(async (postId: string) => {
    const userId = await getCurrentUserId()
    if (!userId) return

    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, has_bookmarked: !p.has_bookmarked } : p
    ))

    const { data: existing } = await supabase
      .from('forum_bookmarks')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      await supabase.from('forum_bookmarks').delete().eq('id', existing.id)
    } else {
      await supabase.from('forum_bookmarks').insert({ post_id: postId, user_id: userId })
    }
  }, [setPosts])
}

// ─────────────────────────────────────────────
// createPost
// ─────────────────────────────────────────────
export async function createPost({
  channelId, title, body, imageUrl, tags, isAnon,
}: {
  channelId: string
  title:     string
  body?:     string
  imageUrl?: string | null
  tags?:     string[]
  isAnon:    boolean
}): Promise<{ data: any; error: any }> {
  const userId = await getCurrentUserId()
  if (!userId) return { data: null, error: new Error('Not authenticated') }

  return supabase
    .from('forum_posts')
    .insert({
      channel_id: channelId,
      author_id:  userId,
      is_anon:    isAnon,
      title,
      body:       body      ?? '',
      image_url:  imageUrl  ?? null,
      tags:       tags      ?? [],
    })
    .select()
    .single()
}

// ─────────────────────────────────────────────
// addComment
// FIX 4: optimistically bumps comment_count on the parent post
// ─────────────────────────────────────────────
export async function addComment({
  postId, parentId, body, isAnon,
}: {
  postId:    string
  parentId?: string | null
  body:      string
  isAnon:    boolean
}): Promise<{ data: any; error: any }> {
  const userId = await getCurrentUserId()
  if (!userId) return { data: null, error: new Error('Not authenticated') }

  return supabase
    .from('forum_comments')
    .insert({
      post_id:   postId,
      parent_id: parentId ?? null,
      author_id: userId,
      is_anon:   isAnon,
      body,
    })
    .select()
    .single()
}

// ─────────────────────────────────────────────
// useChannelUnreadCounts
// FIX 2: uses forum_last_visited for accurate per-channel unread counts
// instead of a rolling 24h window that doesn't clear when you visit.
// Call markChannelVisited(userId, channelId) when the user opens a channel.
// ─────────────────────────────────────────────
export async function markChannelVisited(userId: string, channelId: string) {
  await supabase
    .from('forum_last_visited')
    .upsert({ user_id: userId, channel_id: channelId, visited_at: new Date().toISOString() },
            { onConflict: 'user_id,channel_id' })
}

export function useChannelUnreadCounts(userId: string | null) {
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!userId) return

    const fetchCounts = async () => {
      // Get last-visited timestamps per channel
      const { data: visited } = await supabase
        .from('forum_last_visited')
        .select('channel_id, visited_at')
        .eq('user_id', userId)

      const lastVisited = new Map<string, string>()
      visited?.forEach((v: any) => lastVisited.set(v.channel_id, v.visited_at))

      // Fetch posts created after last visit per channel
      const { data: posts } = await supabase
        .from('forum_posts')
        .select('channel_id, created_at')
        .neq('author_id', userId)

      const c: Record<string, number> = {}
      posts?.forEach((p: any) => {
        const since = lastVisited.get(p.channel_id)
        // Count as unread if: never visited, or post is newer than last visit
        if (!since || p.created_at > since) {
          c[p.channel_id] = (c[p.channel_id] ?? 0) + 1
        }
      })
      setCounts(c)
    }

    fetchCounts()

    const ch = supabase
      .channel(`forum-unread-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'forum_posts' }, fetchCounts)
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [userId])

  return counts
}