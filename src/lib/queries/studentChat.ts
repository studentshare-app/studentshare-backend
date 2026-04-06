/**
 * lib/queries/studentChat.ts
 *
 * All Supabase helpers for the student-to-student chat system.
 * Offline cache keys all use prefix 'sc_' to avoid collision.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../supabase'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export type StudentConversation = {
  id:                 string
  type:               'dm' | 'group'
  name:               string | null
  avatar_url:         string | null
  updated_at:         string
  last_message:       string | null
  last_message_type:  string | null
  last_message_at:    string | null
  last_sender_name:   string | null
  unread_count:       number
  other_user_id:      string | null
  other_user_name:    string | null
  other_user_avatar:  string | null
  other_user_online:  boolean
}

export type StudentMessage = {
  id:              string
  conversation_id: string
  sender_id:       string
  type:            'text' | 'image' | 'file' | 'voice'
  content:         string | null
  file_url:        string | null
  file_name:       string | null
  file_size:       number | null
  mime_type:       string | null
  reply_to_id:     string | null
  is_deleted:      boolean
  created_at:      string
  updated_at:      string
  // joined
  sender_name:     string
  sender_avatar:   string | null
  reactions:       Reaction[]
  reply_to?:       Pick<StudentMessage, 'id' | 'content' | 'type' | 'sender_name'> | null
}

export type Reaction = {
  emoji:    string
  count:    number
  by_me:    boolean
  user_ids: string[]
}

export type ClassmateProfile = {
  id:         string
  full_name:  string
  avatar_url: string | null
  class_id:   string | null
  college_id: string | null
}

// ─────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────
const CACHE = {
  conversations: (uid: string) => `sc_convs_${uid}`,
  messages:      (cid: string) => `sc_msgs_${cid}`,
  unread:        (uid: string) => `sc_unread_${uid}`,
}

async function cacheSet(key: string, data: any) {
  try { await AsyncStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw).data as T
  } catch { return null }
}

// ─────────────────────────────────────────────
// Conversations
// ─────────────────────────────────────────────

/**
 * Fetch conversation list.
 * Returns cached data immediately if offline, fetches fresh if online.
 */
export async function fetchStudentConversations(
  userId: string,
): Promise<StudentConversation[]> {
  const cacheKey = CACHE.conversations(userId)

  try {
    const { data, error } = await supabase.rpc('get_student_conversations', {
      p_user_id: userId,
    })
    if (error) throw error
    const rows = (data ?? []) as StudentConversation[]
    await cacheSet(cacheKey, rows)
    return rows
  } catch {
    // Offline — return cache
    return (await cacheGet<StudentConversation[]>(cacheKey)) ?? []
  }
}

/**
 * Get or create a 1-on-1 DM conversation between two users.
 *
 * FIXED: Full error logging on every Supabase call so failures are visible.
 * Returns null only when it genuinely can't proceed — logs exact reason.
 */
export async function getOrCreateDM(
  myId:      string,
  otherId:   string,
  collegeId: string | null,
): Promise<string | null> {
  console.log('[getOrCreateDM] start', { myId, otherId, collegeId })

  // ── Step 1: look for an existing shared DM ──
  const { data: myMemberships, error: myErr } = await supabase
    .from('student_chat_members')
    .select('conversation_id')
    .eq('user_id', myId)

  if (myErr) {
    console.log('[getOrCreateDM] error fetching my memberships:', JSON.stringify(myErr))
    // Don't bail — we can still try to create one
  }

  if (myMemberships && myMemberships.length > 0) {
    const myConvIds = myMemberships.map((r: any) => r.conversation_id)

    const { data: shared, error: sharedErr } = await supabase
      .from('student_chat_members')
      .select('conversation_id')
      .eq('user_id', otherId)
      .in('conversation_id', myConvIds)

    if (sharedErr) {
      console.log('[getOrCreateDM] error fetching shared convs:', JSON.stringify(sharedErr))
    }

    if (shared && shared.length > 0) {
      const sharedIds = shared.map((r: any) => r.conversation_id)
      const { data: existingDm, error: dmErr } = await supabase
        .from('student_conversations')
        .select('id')
        .eq('type', 'dm')
        .in('id', sharedIds)
        .limit(1)
        .single()

      if (dmErr && dmErr.code !== 'PGRST116') {
        // PGRST116 = "no rows" — that's fine, just means no DM exists yet
        console.log('[getOrCreateDM] error finding existing DM conv:', JSON.stringify(dmErr))
      }

      if (existingDm) {
        console.log('[getOrCreateDM] found existing DM:', existingDm.id)
        return existingDm.id
      }
    }
  }

  // ── Step 2: create a new DM conversation ──
  console.log('[getOrCreateDM] creating new conversation...')
  const { data: newConv, error: insertErr } = await supabase
    .from('student_conversations')
    .insert({ type: 'dm', college_id: collegeId, created_by: myId })
    .select('id')
    .single()

  if (insertErr || !newConv) {
    console.log('[getOrCreateDM] INSERT student_conversations FAILED:', JSON.stringify(insertErr))
    console.log('[getOrCreateDM] Hint: check RLS policies on student_conversations.')
    console.log('[getOrCreateDM]   Required policy: INSERT for authenticated with check (true)')
    return null
  }

  console.log('[getOrCreateDM] conversation created:', newConv.id)

  // ── Step 3: add both members ──
  const { error: membersErr } = await supabase
    .from('student_chat_members')
    .insert([
      { conversation_id: newConv.id, user_id: myId,    role: 'admin'  },
      { conversation_id: newConv.id, user_id: otherId, role: 'member' },
    ])

  if (membersErr) {
    console.log('[getOrCreateDM] INSERT student_chat_members FAILED:', JSON.stringify(membersErr))
    console.log('[getOrCreateDM] Hint: check RLS policies on student_chat_members.')
    console.log('[getOrCreateDM]   Required policy: INSERT for authenticated with check (true)')
    // Conversation was created but members weren't added.
    // Clean up the orphaned conversation so it doesn't linger.
    await supabase.from('student_conversations').delete().eq('id', newConv.id)
    console.log('[getOrCreateDM] Rolled back orphaned conversation', newConv.id)
    return null
  }

  console.log('[getOrCreateDM] members added, DM ready:', newConv.id)
  return newConv.id
}

/**
 * Create a group conversation.
 */
export async function createGroupChat(params: {
  name:      string
  memberIds: string[]
  createdBy: string
  collegeId: string | null
  classId:   string | null
}): Promise<string | null> {
  const { data: conv, error } = await supabase
    .from('student_conversations')
    .insert({
      type:       'group',
      name:       params.name,
      college_id: params.collegeId,
      class_id:   params.classId,
      created_by: params.createdBy,
    })
    .select('id')
    .single()

  if (error || !conv) {
    console.log('[createGroupChat] INSERT failed:', JSON.stringify(error))
    return null
  }

  const { error: membersErr } = await supabase
    .from('student_chat_members')
    .insert(
      params.memberIds.map((uid) => ({
        conversation_id: conv.id,
        user_id:         uid,
        role:            uid === params.createdBy ? 'admin' : 'member',
      }))
    )

  if (membersErr) {
    console.log('[createGroupChat] INSERT members failed:', JSON.stringify(membersErr))
    await supabase.from('student_conversations').delete().eq('id', conv.id)
    return null
  }

  return conv.id
}

// ─────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────

/**
 * Fetch messages for a conversation.
 * Loads cache instantly, then fetches fresh from Supabase.
 */
export async function fetchMessages(
  conversationId: string,
  userId: string,
  limit = 50,
): Promise<StudentMessage[]> {
  const cacheKey = CACHE.messages(conversationId)

  try {
    const { data, error } = await supabase
      .from('student_messages')
      .select(`
        id, conversation_id, sender_id, type, content,
        file_url, file_name, file_size, mime_type,
        reply_to_id, is_deleted, created_at, updated_at,
        sender:profiles!sender_id (full_name, avatar_url),
        reactions:student_message_reactions (emoji, user_id),
        reply_to:student_messages!reply_to_id (
          id, content, type,
          sender:profiles!sender_id (full_name)
        )
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) throw error

    const messages = (data ?? []).map((m: any) => normaliseMessage(m, userId))
    await cacheSet(cacheKey, messages)
    return messages
  } catch {
    return (await cacheGet<StudentMessage[]>(cacheKey)) ?? []
  }
}

function normaliseMessage(raw: any, userId: string): StudentMessage {
  const reactionMap: Record<string, { count: number; by_me: boolean; user_ids: string[] }> = {}
  ;(raw.reactions ?? []).forEach((r: any) => {
    if (!reactionMap[r.emoji]) reactionMap[r.emoji] = { count: 0, by_me: false, user_ids: [] }
    reactionMap[r.emoji].count++
    reactionMap[r.emoji].user_ids.push(r.user_id)
    if (r.user_id === userId) reactionMap[r.emoji].by_me = true
  })

  return {
    id:              raw.id,
    conversation_id: raw.conversation_id,
    sender_id:       raw.sender_id,
    type:            raw.type,
    content:         raw.content,
    file_url:        raw.file_url,
    file_name:       raw.file_name,
    file_size:       raw.file_size,
    mime_type:       raw.mime_type,
    reply_to_id:     raw.reply_to_id,
    is_deleted:      raw.is_deleted,
    created_at:      raw.created_at,
    updated_at:      raw.updated_at,
    sender_name:     raw.sender?.full_name ?? 'Unknown',
    sender_avatar:   raw.sender?.avatar_url ?? null,
    reactions:       Object.entries(reactionMap).map(([emoji, v]) => ({
      emoji, count: v.count, by_me: v.by_me, user_ids: v.user_ids,
    })),
    reply_to: raw.reply_to
      ? {
          id:          raw.reply_to.id,
          content:     raw.reply_to.content,
          type:        raw.reply_to.type,
          sender_name: raw.reply_to.sender?.full_name ?? 'Unknown',
        }
      : null,
  }
}

/**
 * Send a text message.
 */
export async function sendMessage(params: {
  conversationId: string
  senderId:       string
  type:           StudentMessage['type']
  content?:       string
  fileUrl?:       string
  fileName?:      string
  fileSize?:      number
  mimeType?:      string
  replyToId?:     string
}): Promise<StudentMessage | null> {
  const { data, error } = await supabase
    .from('student_messages')
    .insert({
      conversation_id: params.conversationId,
      sender_id:       params.senderId,
      type:            params.type,
      content:         params.content ?? null,
      file_url:        params.fileUrl ?? null,
      file_name:       params.fileName ?? null,
      file_size:       params.fileSize ?? null,
      mime_type:       params.mimeType ?? null,
      reply_to_id:     params.replyToId ?? null,
    })
    .select(`
      id, conversation_id, sender_id, type, content,
      file_url, file_name, file_size, mime_type,
      reply_to_id, is_deleted, created_at, updated_at,
      sender:profiles!sender_id (full_name, avatar_url)
    `)
    .single()

  if (error || !data) return null
  return normaliseMessage({ ...data, reactions: [], reply_to: null }, params.senderId)
}

/**
 * Soft-delete a message (sets is_deleted = true).
 */
export async function deleteMessage(messageId: string): Promise<void> {
  await supabase
    .from('student_messages')
    .update({ is_deleted: true })
    .eq('id', messageId)
}

// ─────────────────────────────────────────────
// Reactions
// ─────────────────────────────────────────────
export async function toggleReaction(
  messageId:  string,
  userId:     string,
  emoji:      string,
  hasReacted: boolean,
): Promise<void> {
  if (hasReacted) {
    await supabase
      .from('student_message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji)
  } else {
    await supabase
      .from('student_message_reactions')
      .upsert({ message_id: messageId, user_id: userId, emoji })
  }
}

// ─────────────────────────────────────────────
// Read receipts
// ─────────────────────────────────────────────
export async function markConversationRead(
  conversationId: string,
  userId:         string,
): Promise<void> {
  await supabase
    .from('student_chat_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
}

/**
 * Get total unread count across all conversations (for FAB badge).
 */
export async function fetchTotalUnread(userId: string): Promise<number> {
  const cacheKey = CACHE.unread(userId)
  try {
    const convs = await fetchStudentConversations(userId)
    const total = convs.reduce((sum, c) => sum + (c.unread_count ?? 0), 0)
    await cacheSet(cacheKey, total)
    return total
  } catch {
    return (await cacheGet<number>(cacheKey)) ?? 0
  }
}

// ─────────────────────────────────────────────
// Typing presence
// ─────────────────────────────────────────────
export async function setTyping(
  conversationId: string,
  userId:         string,
  isTyping:       boolean,
): Promise<void> {
  await supabase
    .from('student_typing')
    .upsert({
      conversation_id: conversationId,
      user_id:         userId,
      is_typing:       isTyping,
      updated_at:      new Date().toISOString(),
    })
}

// ─────────────────────────────────────────────
// Classmates (for new chat / group creation)
// ─────────────────────────────────────────────
export async function fetchClassmates(
  userId:    string,
  classId:   string | null,
  collegeId: string | null,
): Promise<ClassmateProfile[]> {
  if (!classId && !collegeId) return []

  let query = supabase
    .from('profiles')
    .select('id, full_name, avatar_url, class_id, college_id')
    .neq('id', userId)
    .limit(100)

  if (classId)        query = query.eq('class_id', classId)
  else if (collegeId) query = query.eq('college_id', collegeId)

  const { data } = await query
  return (data ?? []) as ClassmateProfile[]
}
