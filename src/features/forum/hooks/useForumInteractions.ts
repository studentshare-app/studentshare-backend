import { supabase } from '@/lib/supabase'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useCallback } from 'react'
import { Share } from 'react-native'
import type { Post, UserProfile } from '../types'

type Params = {
  mediaBucket:   string
  profile:       UserProfile
  showToast:     (msg: string) => void
  setPosts:      Dispatch<SetStateAction<Post[]>>
  setThreadPost: Dispatch<SetStateAction<Post | null>>
  likedIds:      MutableRefObject<Set<string>>
  repostedIds:   MutableRefObject<Set<string>>
  bookmarkedIds: MutableRefObject<Set<string>>
  votedIds:      MutableRefObject<Set<string>>
  mapRowToPost:  (row: any, myL: Set<string>, myR: Set<string>, myB: Set<string>, myV: Set<string>) => Post
}

// ── Notification helper (fire-and-forget, never throws) ──────────────────────
async function sendNotification(p: {
  recipientId:    string
  actorId:        string
  actorName:      string
  actorHandle:    string
  actorInitials:  string
  actorGrad:      [string, string]
  actorAvatarUrl: string | null
  type:           'like' | 'repost' | 'reply' | 'follow'
  postId?:        string
  postPreview?:   string | null
}) {
  if (p.recipientId === p.actorId) return   // never notify yourself
  try {
    await supabase.from('sq_notifications').insert({
      user_id:          p.recipientId,
      type:             p.type,
      actor_id:         p.actorId,
      actor_name:       p.actorName,
      actor_handle:     p.actorHandle,
      actor_initials:   p.actorInitials,
      actor_grad:       p.actorGrad,
      actor_avatar_url: p.actorAvatarUrl,
      post_id:          p.postId ?? null,
      post_preview:     p.postPreview ?? null,
      read:             false,
    })
  } catch { /* best-effort */ }
}

export function useForumInteractions({
  mediaBucket,
  profile,
  showToast,
  setPosts,
  setThreadPost,
  likedIds,
  repostedIds,
  bookmarkedIds,
  votedIds,
  mapRowToPost,
}: Params) {

  // ── Image upload ─────────────────────────────────────────────────────────
  // Uses FormData — the only reliable way to upload local file URIs in React Native
  const uploadImage = useCallback(async (localUri: string): Promise<string | null> => {
    if (!profile.userId) return null
    try {
      const ext  = localUri.split('.').pop()?.split('?')[0].toLowerCase() ?? 'jpg'
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
      const path = `forum/${profile.userId}/${Date.now()}.${ext}`

      const formData = new FormData()
      formData.append('file', {
        uri:  localUri,
        name: `upload.${ext}`,
        type: mime,
      } as any)

      const { error } = await supabase.storage
        .from(mediaBucket)
        .upload(path, formData, { contentType: mime, upsert: false })

      if (error) {
        console.warn('Image upload error:', error.message)
        return null
      }
      return supabase.storage.from(mediaBucket).getPublicUrl(path).data.publicUrl
    } catch (err) {
      console.warn('uploadImage exception:', err)
      return null
    }
  }, [mediaBucket, profile.userId])

  // ── Like ─────────────────────────────────────────────────────────────────
  const handleLike = useCallback((postId: string, postAuthorId?: string) => {
    if (!profile.userId) { showToast('Sign in to like posts'); return }

    const nowLiked = !likedIds.current.has(postId)
    if (nowLiked) likedIds.current.add(postId)
    else          likedIds.current.delete(postId)

    const update = (p: Post) =>
      p.id !== postId ? p : { ...p, liked: nowLiked, likes: p.likes + (nowLiked ? 1 : -1) }

    setPosts(prev => prev.map(update))
    setThreadPost(prev => prev ? update(prev) : prev)

    void (async () => {
      try {
        if (nowLiked) {
          await supabase.from('sq_likes')
            .insert({ post_id: postId, user_id: profile.userId })
          if (postAuthorId) {
            const { data: post } = await supabase
              .from('sq_posts').select('body').eq('id', postId).single()
            await sendNotification({
              recipientId:    postAuthorId,
              actorId:        profile.userId,
              actorName:      profile.name,
              actorHandle:    profile.handle,
              actorInitials:  profile.initials,
              actorGrad:      profile.grad,
              actorAvatarUrl: profile.avatarUri,
              type:           'like',
              postId,
              postPreview:    post?.body?.slice(0, 100) ?? null,
            })
          }
        } else {
          await supabase.from('sq_likes')
            .delete().match({ post_id: postId, user_id: profile.userId })
        }
      } catch { /* rollback */ likedIds.current[nowLiked ? 'delete' : 'add'](postId) }
    })()
  }, [likedIds, profile, setPosts, setThreadPost, showToast])

  // ── Repost ───────────────────────────────────────────────────────────────
  const handleRepost = useCallback((postId: string, postAuthorId?: string) => {
    if (!profile.userId) { showToast('Sign in to repost'); return }

    const nowReposted = !repostedIds.current.has(postId)
    if (nowReposted) repostedIds.current.add(postId)
    else             repostedIds.current.delete(postId)

    const update = (p: Post) =>
      p.id !== postId ? p : { ...p, reposted: nowReposted, reposts: p.reposts + (nowReposted ? 1 : -1) }

    setPosts(prev => prev.map(update))
    setThreadPost(prev => prev ? update(prev) : prev)
    showToast(nowReposted ? 'Reposted!' : 'Repost removed')

    void (async () => {
      try {
        if (nowReposted) {
          await supabase.from('sq_reposts')
            .insert({ post_id: postId, user_id: profile.userId })
          if (postAuthorId) {
            const { data: post } = await supabase
              .from('sq_posts').select('body').eq('id', postId).single()
            await sendNotification({
              recipientId:    postAuthorId,
              actorId:        profile.userId,
              actorName:      profile.name,
              actorHandle:    profile.handle,
              actorInitials:  profile.initials,
              actorGrad:      profile.grad,
              actorAvatarUrl: profile.avatarUri,
              type:           'repost',
              postId,
              postPreview:    post?.body?.slice(0, 100) ?? null,
            })
          }
        } else {
          await supabase.from('sq_reposts')
            .delete().match({ post_id: postId, user_id: profile.userId })
        }
      } catch { repostedIds.current[nowReposted ? 'delete' : 'add'](postId) }
    })()
  }, [repostedIds, profile, setPosts, setThreadPost, showToast])

  // ── Bookmark ─────────────────────────────────────────────────────────────
  const handleBookmark = useCallback((postId: string) => {
    if (!profile.userId) { showToast('Sign in to bookmark'); return }

    const nowBookmarked = !bookmarkedIds.current.has(postId)
    if (nowBookmarked) bookmarkedIds.current.add(postId)
    else               bookmarkedIds.current.delete(postId)

    const update = (p: Post) =>
      p.id !== postId ? p : { ...p, bookmarked: nowBookmarked, bookmarks: p.bookmarks + (nowBookmarked ? 1 : -1) }

    setPosts(prev => prev.map(update))
    setThreadPost(prev => prev ? update(prev) : prev)
    showToast(nowBookmarked ? 'Added to Bookmarks' : 'Removed from Bookmarks')

    void (async () => {
      try {
        if (nowBookmarked)
          await supabase.from('sq_bookmarks')
            .insert({ post_id: postId, user_id: profile.userId })
        else
          await supabase.from('sq_bookmarks')
            .delete().match({ post_id: postId, user_id: profile.userId })
      } catch { bookmarkedIds.current[nowBookmarked ? 'delete' : 'add'](postId) }
    })()
  }, [bookmarkedIds, profile, setPosts, setThreadPost, showToast])

  // ── Share ─────────────────────────────────────────────────────────────────
  const handleShare = useCallback(async (post: Post) => {
    try { await Share.share({ message: `${post.name}: ${post.text}` }) } catch { /* ignore */ }
  }, [])

  // ── Poll vote ─────────────────────────────────────────────────────────────
  const handleVote = useCallback((postId: string, optionIndex: number) => {
    if (!profile.userId) { showToast('Sign in to vote'); return }
    if (votedIds.current.has(postId)) { showToast('You already voted!'); return }

    votedIds.current.add(postId)

    // Optimistic update — increment chosen option, recalculate %
    setPosts(prev => prev.map(p => {
      if (p.id !== postId || !p.poll) return p
      const newPoll = p.poll.map((o, i) => ({
        ...o,
        votes: (o.votes ?? 0) + (i === optionIndex ? 1 : 0),
      }))
      const total = newPoll.reduce((a, o) => a + (o.votes ?? 0), 0)
      const maxV  = Math.max(...newPoll.map(o => o.votes ?? 0))
      return {
        ...p,
        pollVoted: true,
        poll: newPoll.map(o => ({
          ...o,
          pct:     total > 0 ? Math.round(((o.votes ?? 0) / total) * 100) : 0,
          winning: (o.votes ?? 0) === maxV && maxV > 0,
        })),
        pollMeta: `${total} vote${total !== 1 ? 's' : ''}`,
      }
    }))
    showToast('Vote recorded!')

    // Sync with DB
    void (async () => {
      try {
        const { data } = await supabase.rpc('sq_record_poll_vote', {
          p_post_id:      postId,
          p_user_id:      profile.userId,
          p_option_index: optionIndex,
        })
        if (data?.poll_options) {
          const opts  = data.poll_options as any[]
          const total = data.total_votes ?? opts.reduce((a: number, o: any) => a + (o.votes ?? 0), 0)
          const maxV  = Math.max(...opts.map((o: any) => o.votes ?? 0))
          setPosts(prev => prev.map(p => {
            if (p.id !== postId) return p
            return {
              ...p,
              pollVoted: true,
              poll: opts.map((o: any) => ({
                label:   o.label,
                votes:   o.votes ?? 0,
                pct:     total > 0 ? Math.round(((o.votes ?? 0) / total) * 100) : 0,
                winning: (o.votes ?? 0) === maxV && maxV > 0,
              })),
              pollMeta: `${total} vote${total !== 1 ? 's' : ''}`,
            }
          }))
        }
      } catch { votedIds.current.delete(postId) }
    })()
  }, [profile.userId, setPosts, showToast, votedIds])

  // ── Delete post ──────────────────────────────────────────────────────────
  const handleDeletePost = useCallback(async (postId: string) => {
    if (!profile.userId) return
    // Optimistic remove
    setPosts(prev => prev.filter(p => p.id !== postId))
    setThreadPost(prev => prev?.id === postId ? null : prev)
    try {
      const { error } = await supabase.from('sq_posts')
        .delete().eq('id', postId).eq('author_id', profile.userId)
      if (error) {
        console.warn('Delete post error:', error.message)
        showToast('Could not delete post')
      } else {
        showToast('Post deleted')
      }
    } catch { showToast('Could not delete post') }
  }, [profile.userId, setPosts, setThreadPost, showToast])

  // ── New post ──────────────────────────────────────────────────────────────
  const handleNewPost = useCallback(async (
    text:          string,
    localImageUri?: string,
    pollOptions?:   string[],
    replyToId?:     string,
    isAnonymous?:   boolean,
  ) => {
    if (!profile.userId) { showToast('Please sign in to post'); return }

    const tempId  = `temp-${Date.now()}`
    const isPoll  = !!(pollOptions && pollOptions.filter(o => o.trim()).length >= 2)
    const mockPoll = isPoll
      ? pollOptions!.filter(o => o.trim()).map(o => ({ label: o, pct: 0, votes: 0 }))
      : undefined

    // Optimistic insert
    setPosts(prev => [{
      id:         tempId,
      isSeed:     false,
      type:       isPoll ? 'poll' : 'normal',
      authorId:   profile.userId,
      name:       isAnonymous ? 'Anonymous' : profile.name,
      handle:     isAnonymous ? '@anonymous' : profile.handle,
      verified:   isAnonymous ? false : profile.verified,
      time:       'now',
      avatar:     isAnonymous ? '?' : profile.initials,
      avatarGrad: isAnonymous ? ['#3e4144', '#16181c'] as [string, string] : profile.grad,
      avatarUri:  isAnonymous ? null : profile.avatarUri,
      text,
      imageUrl:   localImageUri ?? null,
      poll:       mockPoll,
      pollMeta:   isPoll ? '0 votes' : undefined,
      pollVoted:  false,
      replies:    0, reposts: 0, likes: 0,
      views:      '0', bookmarks: 0,
      liked: false, reposted: false, bookmarked: false,
    }, ...prev])

    showToast('Posting…')

    // Upload image first
    let imageUrl: string | null = null
    if (localImageUri) {
      imageUrl = await uploadImage(localImageUri)
      if (!imageUrl) showToast('Image upload failed — post saved without image')
    }

    const dbPollOptions = isPoll
      ? pollOptions!.filter(o => o.trim()).map(o => ({ label: o, votes: 0 }))
      : null

    // Insert into DB with all denormalised author fields
    const { data, error } = await supabase
      .from('sq_posts')
      .insert({
        author_id:         profile.userId,
        body:              text,
        image_url:         imageUrl,
        poll_options:      dbPollOptions,
        reply_to_id:       replyToId ?? null,
        is_anonymous:      isAnonymous ?? false,
        post_type:         isPoll ? 'poll' : 'normal',
        // Denormalised — what ALL other users will see
        author_name:       isAnonymous ? null : profile.name,
        author_handle:     isAnonymous ? null : profile.handle,
        author_initials:   isAnonymous ? null : profile.initials,
        author_grad:       isAnonymous ? null : profile.grad,
        author_avatar_url: isAnonymous ? null : profile.avatarUri,
        author_verified:   isAnonymous ? false : profile.verified,
      })
      .select(`
        *,
        profiles!sq_posts_author_id_fkey(
          full_name, forum_handle, forum_initials, forum_grad,
          avatar_url, is_verified, college_id, class_id
        )
      `)
      .single()

    if (error) {
      console.error('Post insertion error:', error)
      setPosts(prev => prev.filter(p => p.id !== tempId))
      showToast(`Failed to post: ${error.message}`)
      return
    }

    if (data) {
      showToast('Post shared!')
      // Replace temp with real DB row
      setPosts(prev => prev.map(p =>
        p.id === tempId
          ? mapRowToPost(data, likedIds.current, repostedIds.current, bookmarkedIds.current, votedIds.current)
          : p
      ))
    }
  }, [bookmarkedIds, likedIds, mapRowToPost, profile, repostedIds, votedIds, setPosts, showToast, uploadImage])

  // ── New reply ─────────────────────────────────────────────────────────────
  const handleNewReply = useCallback(async (
    postId:      string,
    text:        string,
    isAnonymous?: boolean,
  ) => {
    // Increment reply count optimistically on parent post
    const update = (p: Post) =>
      p.id === postId ? { ...p, replies: p.replies + 1 } : p
    setPosts(prev => prev.map(update))
    setThreadPost(prev => prev ? update(prev) : prev)

    await handleNewPost(text, undefined, undefined, postId, isAnonymous)

    // Notify parent post author
    if (!isAnonymous && profile.userId) {
      try {
        const { data: parent } = await supabase
          .from('sq_posts').select('author_id, body').eq('id', postId).single()
        if (parent?.author_id && parent.author_id !== profile.userId) {
          await sendNotification({
            recipientId:    parent.author_id,
            actorId:        profile.userId,
            actorName:      profile.name,
            actorHandle:    profile.handle,
            actorInitials:  profile.initials,
            actorGrad:      profile.grad,
            actorAvatarUrl: profile.avatarUri,
            type:           'reply',
            postId,
            postPreview:    parent.body?.slice(0, 100) ?? null,
          })
        }
      } catch { /* best-effort */ }
    }
  }, [handleNewPost, profile, setPosts, setThreadPost])

  return {
    handleLike,
    handleRepost,
    handleBookmark,
    handleShare,
    handleVote,
    handleDeletePost,
    handleNewPost,
    handleNewReply,
    uploadImage,
  }
}