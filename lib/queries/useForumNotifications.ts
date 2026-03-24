/**
 * lib/queries/useForumNotifications.ts — Realtime notifications
 * Phase 2 Step 2.2
 *
 * FIX:
 *  useEffect cleanup returned an async function (Promise), but React requires
 *  the cleanup to be a synchronous void function.
 *  Fixed by wrapping removeChannel in a plain sync arrow:
 *    return () => { supabase.removeChannel(channel) }
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

export type ForumNotificationType = 'like' | 'reply' | 'repost' | 'follow' | 'mention'
export type ForumNotif = {
  id: string
  type: ForumNotificationType
  postId?: string
  actorId: string
  actorName: string
  actorHandle: string
  postPreview?: string | null
  read: boolean
  createdAt: string
}

export function useForumNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<ForumNotif[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchNotifications = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    try {
      const { data } = await supabase
        .from('forum_notifications')
        .select('id, type, post_id, actor_id, actor_name, actor_handle, post_preview, read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      const mapped = (data || []).map((row: any): ForumNotif => ({
        id: row.id,
        type: row.type as ForumNotificationType,
        postId: row.post_id,
        actorId: row.actor_id,
        actorName: row.actor_name,
        actorHandle: row.actor_handle,
        postPreview: row.post_preview,
        read: row.read,
        createdAt: row.created_at,
      }))

      setNotifications(mapped)
      setUnreadCount(mapped.filter(n => !n.read).length)
    } catch (error) {
      console.error('[useForumNotifications]', error)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // FIX: cleanup must be synchronous — wrap removeChannel in a plain sync arrow.
  // Previously `return () => supabase.removeChannel(channel)` was triggering the
  // error because removeChannel returns a Promise, making the cleanup async.
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes',
        {
          event: 'INSERT', schema: 'public', table: 'forum_notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          setNotifications(prev => [payload.new as ForumNotif, ...prev])
          setUnreadCount(prev => prev + 1)
        }
      )
      .subscribe()

    // Sync cleanup — NOT async
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const markAllRead = useCallback(async () => {
    if (!userId) return

    const { error } = await supabase
      .from('forum_notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)

    if (!error) {
      setUnreadCount(0)
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    }
  }, [userId])

  return {
    notifications,
    loading,
    unreadCount,
    markAllRead,
    refetch: fetchNotifications,
  }
}