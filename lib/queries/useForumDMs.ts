/**
 * lib/queries/useForumDMs.ts — DM conversations + messages
 * Phase 2 Step 2.2
 *
 * FIXES:
 *  1. useEffect cleanup returned async function (Promise) — React requires sync cleanup.
 *     Fixed by wrapping in a sync arrow: `return () => { supabase.removeChannel(channel) }`
 *  2. `markRead` was declared AFTER the useEffect that references it (TS2448 / TS2454).
 *     Fixed by hoisting `markRead` above the realtime useEffect that calls it.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

export type ForumConversation = {
  id: string
  otherId: string
  otherName: string
  otherHandle: string | null
  otherInitials: string
  otherGrad: string[]
  otherAvatar: string | null
  lastMessage: string | null
  lastMessageAt: string | null
  unread: number
}

export type ForumMessage = {
  id: string
  conversationId: string
  senderId: string
  body: string
  imageUrl: string | null
  read: boolean
  createdAt: string
}

// ─── useForumDMs: List conversations + unread ───
export function useForumDMs(userId: string | null) {
  const [conversations, setConversations] = useState<ForumConversation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchConversations = useCallback(async () => {
    if (!userId) return
    setLoading(true)

    try {
      const { data: convs } = await supabase
        .from('forum_conversations')
        .select('id, participant_a, participant_b, last_message, last_message_at, unread_a, unread_b')
        .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
        .order('last_message_at', { ascending: false, nullsFirst: false })

      if (!convs?.length) {
        setConversations([])
        return
      }

      const otherIds = convs.map(conv =>
        conv.participant_a === userId ? conv.participant_b : conv.participant_a
      )

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, forum_handle, forum_initials, forum_grad, avatar_url')
        .in('id', otherIds)

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])

      setConversations(convs.map(conv => {
        const otherId = conv.participant_a === userId ? conv.participant_b : conv.participant_a
        const profile = profileMap.get(otherId)
        const unread = conv.participant_a === userId ? conv.unread_a : conv.unread_b

        return {
          id: conv.id,
          otherId,
          otherName: profile?.full_name || 'User',
          otherHandle: profile?.forum_handle || '',
          otherInitials: profile?.forum_initials || '??',
          otherGrad: (profile?.forum_grad as string[]) || ['#1d9bf0', '#7856ff'],
          otherAvatar: profile?.avatar_url || null,
          lastMessage: conv.last_message || null,
          lastMessageAt: conv.last_message_at || null,
          unread,
        }
      }))
    } catch (error) {
      console.error('[useForumDMs]', error)
      setConversations([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // FIX 1: Cleanup must be synchronous — do not return an async function.
  // Wrap removeChannel in a plain sync arrow so React can call it on unmount.
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`dm-list-${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'forum_messages' },
        fetchConversations
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'forum_conversations' },
        fetchConversations
      )
      .subscribe()

    // Sync cleanup — NOT async
    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchConversations])

  const totalUnread = conversations.reduce((sum, conv) => sum + conv.unread, 0)

  return { conversations, loading, totalUnread, refetch: fetchConversations }
}

// ─── useForumMessages: Messages in conversation ───
export function useForumMessages(conversationId: string | null, userId: string | null) {
  const [messages, setMessages] = useState<ForumMessage[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMessages = useCallback(async () => {
    if (!conversationId || !userId) return

    setLoading(true)
    try {
      const { data } = await supabase
        .from('forum_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100)

      setMessages(data || [])
    } catch (error) {
      console.error('[useForumMessages]', error)
    } finally {
      setLoading(false)
    }
  }, [conversationId, userId])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // FIX 2: `markRead` was declared below this useEffect but referenced inside it.
  // Hoisted `markRead` above this useEffect so it is in scope when the effect runs.
  const markRead = useCallback(async () => {
    if (!conversationId || !userId) return
    await supabase
      .from('forum_messages')
      .update({ read: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', userId)
  }, [conversationId, userId])

  // FIX 1 (same pattern): sync cleanup wrapper
  useEffect(() => {
    if (!conversationId || !userId) return

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on('postgres_changes',
        {
          event: 'INSERT', schema: 'public', table: 'forum_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        async (payload) => {
          if (payload.new.sender_id !== userId) {
            await markRead()
          }
          setMessages(prev => [...prev, payload.new as ForumMessage])
        }
      )
      .subscribe()

    // Sync cleanup — NOT async
    return () => { supabase.removeChannel(channel) }
  }, [conversationId, userId, markRead])

  const sendMessage = useCallback(async (body: string, imageUrl?: string | null) => {
    if (!conversationId || !userId) return

    const optimistic: ForumMessage = {
      id: `temp-${Date.now()}`,
      conversationId: conversationId!,
      senderId: userId!,
      body,
      imageUrl: imageUrl || null,
      read: true,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])

    const { error } = await supabase
      .from('forum_messages')
      .insert({ conversation_id: conversationId, sender_id: userId, body, image_url: imageUrl })

    if (error) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      throw error
    }
  }, [conversationId, userId])

  return { messages, loading, markRead, sendMessage }
}

// ─── getOrCreateConversation: RPC helper ───
export async function getOrCreateConversation(userA: string, userB: string) {
  const { data, error } = await supabase.rpc('get_or_create_forum_conversation', {
    user_a: userA,
    user_b: userB,
  })
  if (error) throw error
  return data as string
}