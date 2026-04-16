import { supabase } from '@/core/api/supabase'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useCallback } from 'react'
import { Share } from 'react-native'
import type { Post as PostType, UserProfile } from '../types'
import { 
  createPost, 
  deletePost as dbDeletePost, 
  togglePostInteraction, 
  createComment 
} from '@/database/actions'
import NetInfo from '@react-native-community/netinfo'

type Params = {
  mediaBucket:   string
  profile:       UserProfile
  showToast:     (msg: string) => void
  setPosts:      Dispatch<SetStateAction<PostType[]>>
  setThreadPost: Dispatch<SetStateAction<PostType | null>>
  likedIds:      MutableRefObject<Set<string>>
  repostedIds:   MutableRefObject<Set<string>>
  bookmarkedIds: MutableRefObject<Set<string>>
  votedIds:      MutableRefObject<Set<string>>
  mapRowToPost:  (row: any, myL: Set<string>, myR: Set<string>, myB: Set<string>, myV: Set<string>) => PostType
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
  
  const isOnline = await NetInfo.fetch().then(s => s.isConnected)
  if (!isOnline) return // Notifications are best-effort online only for now

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
  const uploadImage = useCallback(async (localUri: string): Promise<string | null> => {
    if (!profile.userId) return null
    
    const isOnline = await NetInfo.fetch().then(s => s.isConnected)
    if (!isOnline) {
      showToast('Offline: Image will be uploaded later')
      return null // We don't have a background image uploader yet
    }

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
  }, [mediaBucket, profile.userId, showToast])

  // ── Like ─────────────────────────────────────────────────────────────────
  const handleLike = useCallback(async (postId: string, postAuthorId?: string) => {
    if (!profile.userId) { showToast('Sign in to like posts'); return }

    // Toggle locally (WatermelonDB + Sync Queue)
    const nowLiked = await togglePostInteraction(profile.userId, postId, 'like')
    
    if (nowLiked) likedIds.current.add(postId)
    else          likedIds.current.delete(postId)

    // Send notification if online
    if (nowLiked && postAuthorId) {
      void (async () => {
        try {
          // In a real app, we'd fetch the post preview from the local DB
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
          })
        } catch {}
      })()
    }
  }, [likedIds, profile, showToast])

  // ── Repost ───────────────────────────────────────────────────────────────
  const handleRepost = useCallback(async (postId: string, postAuthorId?: string) => {
    if (!profile.userId) { showToast('Sign in to repost'); return }

    const nowReposted = await togglePostInteraction(profile.userId, postId, 'repost')
    
    if (nowReposted) repostedIds.current.add(postId)
    else             repostedIds.current.delete(postId)

    showToast(nowReposted ? 'Reposted!' : 'Repost removed')

    if (nowReposted && postAuthorId) {
      void sendNotification({
        recipientId:    postAuthorId,
        actorId:        profile.userId,
        actorName:      profile.name,
        actorHandle:    profile.handle,
        actorInitials:  profile.initials,
        actorGrad:      profile.grad,
        actorAvatarUrl: profile.avatarUri,
        type:           'repost',
        postId,
      })
    }
  }, [repostedIds, profile, showToast])

  // ── Bookmark ─────────────────────────────────────────────────────────────
  const handleBookmark = useCallback(async (postId: string) => {
    if (!profile.userId) { showToast('Sign in to bookmark'); return }

    const nowBookmarked = await togglePostInteraction(profile.userId, postId, 'bookmark')
    
    if (nowBookmarked) bookmarkedIds.current.add(postId)
    else               bookmarkedIds.current.delete(postId)

    showToast(nowBookmarked ? 'Added to Bookmarks' : 'Removed from Bookmarks')
  }, [bookmarkedIds, profile, showToast])

  // ── Share ─────────────────────────────────────────────────────────────────
  const handleShare = useCallback(async (post: PostType) => {
    try { await Share.share({ message: `${post.name}: ${post.text}` }) } catch { /* ignore */ }
  }, [])

  // ── Poll vote ─────────────────────────────────────────────────────────────
  const handleVote = useCallback(async (postId: string, optionIndex: number) => {
    if (!profile.userId) { showToast('Sign in to vote'); return }
    if (votedIds.current.has(postId)) { showToast('You already voted!'); return }

    votedIds.current.add(postId)
    
    // We queue the vote interaction
    await togglePostInteraction(profile.userId, postId, `vote:${optionIndex}`)
    showToast('Vote recorded!')
  }, [profile.userId, showToast, votedIds])

  // ── Delete post ──────────────────────────────────────────────────────────
  const handleDeletePost = useCallback(async (postId: string) => {
    if (!profile.userId) return
    
    // WatermelonDB observe() will pick up the 'deleted' flag and hide the UI card immediately
    await dbDeletePost(postId, profile.userId)
    showToast('Post deleted')
  }, [profile.userId, showToast])

  // ── New post ──────────────────────────────────────────────────────────────
  const handleNewPost = useCallback(async (
    text:          string,
    localImageUri?: string,
    pollOptions?:   string[],
    replyToId?:     string,
    isAnonymous?:   boolean,
  ) => {
    if (!profile.userId) { showToast('Please sign in to post'); return }

    showToast('Posting…')

    let imageUrl: string | null = null
    if (localImageUri) {
      imageUrl = await uploadImage(localImageUri)
    }

    try {
      await createPost(profile.userId, {
        title:           null,
        collegeId:       profile.collegeId,
        classId:         profile.classId,
        content:         text,
        imageUrl,
        pollOptions,
        replyToId,
        isAnonymous:      !!isAnonymous,
        author_name:       isAnonymous ? null : profile.name,
        author_handle:     isAnonymous ? null : profile.handle,
        author_initials:   isAnonymous ? null : profile.initials,
        author_grad:       isAnonymous ? null : profile.grad,
        author_avatar_url: isAnonymous ? null : profile.avatarUri,
        author_verified:   isAnonymous ? false : profile.verified,
      })
      showToast('Post shared!')
    } catch (err) {
      console.error('handleNewPost error:', err)
      showToast('Failed to post locally')
    }
  }, [profile, showToast, uploadImage])

  // ── New reply ─────────────────────────────────────────────────────────────
  const handleNewReply = useCallback(async (
    postId:      string,
    text:        string,
    isAnonymous?: boolean,
  ) => {
    await handleNewPost(text, undefined, undefined, postId, isAnonymous)
  }, [handleNewPost])

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