/**
 * lib/queries/useForumPosts.ts — StudentSquare Posts
 *
 * Fetches posts from sq_posts with a LEFT join to profiles via author_id.
 * Uses `profiles(...)` (without !inner) so PostgREST auto-detects the FK
 * even when the schema cache hasn't been refreshed yet.
 * Only fetches top-level posts (reply_to_id IS NULL) for the feed.
 */

import { RealtimePostgresInsertPayload } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

export type SqPostRow = {
  id: string
  author_id: string
  reply_to_id?: string | null
  is_quote?: boolean
  quote_post_id?: string | null
  body: string
  image_url?: string | null
  tags?: string[]
  poll_options?: { label: string }[] | null
  is_anonymous?: boolean
  likes_count: number
  reposts_count: number
  replies_count: number
  bookmarks_count: number
  views_count: number
  created_at: string
  profiles?: {
    full_name: string
    forum_handle?: string
    avatar_url?: string | null
    is_verified: boolean
  }
}

const POST_SELECT = '*, profiles(full_name, forum_handle, avatar_url, is_verified)'

export function useForumPosts({ filter, userId, userCollegeId, userClassId }: { filter: 'for-you' | 'following' | 'campus' | 'classes', userId?: string | null, userCollegeId?: string | null, userClassId?: string | null }) {
  const [posts, setPosts] = useState<SqPostRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchPosts = useCallback(async () => {
    setIsLoading(true)

    try {
      let query = supabase
        .from('sq_posts')
        .select(POST_SELECT)
        .is('reply_to_id', null)
        .order('created_at', { ascending: false })
        .limit(50)

      if (filter === 'following' && userId) {
        const { data: follows } = await supabase
          .from('sq_follows')
          .select('following_id')
          .eq('follower_id', userId)

        if (follows && follows.length > 0) {
          const followIds = follows.map(f => f.following_id)
          query = query.in('author_id', followIds)
        } else {
          setPosts([])
          setIsLoading(false)
          return
        }
      } else if (filter === 'campus' && userCollegeId) {
        query = query.eq('profiles.college_id', userCollegeId)
      } else if (filter === 'classes' && userClassId) {
        query = query.eq('profiles.class_id', userClassId)
      }

      const { data, error } = await query

      if (error) {
        console.error('[useForumPosts] query error:', error)
        throw error
      }

      setPosts((data as SqPostRow[]) || [])
    } catch (error) {
      console.error('[useForumPosts]', error)
    } finally {
      setIsLoading(false)
    }
  }, [filter, userId, userCollegeId, userClassId])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  // Realtime — listen for new top-level posts
  useEffect(() => {
    const channel = supabase
      .channel(`new-posts-${filter}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sq_posts',
        },
        async (payload: RealtimePostgresInsertPayload<SqPostRow>) => {
          const newPost = payload.new

          // Skip replies — only show top-level posts
          if (newPost.reply_to_id) return

          // Filter for following tab
          if (filter === 'following' && userId) {
            const { data: isFollowing } = await supabase
              .from('sq_follows')
              .select('id')
              .match({ follower_id: userId, following_id: newPost.author_id })
              .single()
            if (!isFollowing) return
          }

          // Fetch the author profile separately
          let profile = null
          if (newPost.author_id) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name, forum_handle, avatar_url, is_verified')
              .eq('id', newPost.author_id)
              .single()
            profile = data
          }

          setPosts(prev => {
            if (prev.some(p => p.id === newPost.id)) return prev
            return [{ ...newPost, profiles: profile || undefined } as SqPostRow, ...prev]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [filter, userId])

  return { posts, isLoading, refetch: fetchPosts }
}
