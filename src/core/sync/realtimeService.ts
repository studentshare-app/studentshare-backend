import { Q } from '@nozbe/watermelondb'
import { supabase } from '@/core/api/supabase'
import database from '@/database'

// FIX: removed 'messages' (doesn't exist in Supabase); use 'sq_messages' instead.
// The local WatermelonDB collection is still called 'messages'.
type TableName = 'posts' | 'comments' | 'materials' | 'sq_messages' | 'notes' | 'conversations'

const WATCHED_TABLES: TableName[] = [
  'posts',
  'comments',
  'materials',
  'sq_messages',
  'notes',
  'conversations',
]

let channel: ReturnType<typeof supabase.channel> | null = null

// ─── Apply a single remote change to local DB ────────────────────────────────

async function applyRemoteChange(table: TableName, eventType: string, record: any) {
  if (!record?.id) return

  try {
    // Map Supabase table name → local WatermelonDB collection name
    const localTable = table === 'sq_messages' ? 'messages' : table
    const collection = database.collections.get(localTable)

    await database.write(async () => {
      const existing = await collection
        .query(Q.where('remote_id', record.id))
        .fetch()

      const local = (existing[0] || null) as any

      // DELETE
      if (eventType === 'DELETE' || record.deleted) {
        if (local) {
          await local.update((r: any) => { r.deleted = true })
        }
        return
      }

      // CREATE — no local record exists yet
      if (!local) {
        await collection.create((r: any) => {
          // FIX: never use Object.assign(r, record) — WatermelonDB model
          // properties are getters-only; assign only mapped fields explicitly.
          r.remoteId          = record.id
          r.synced            = true
          r.deleted           = false

          if (record.title           != null) r.title          = record.title
          if (record.content         != null) r.content        = record.content
          if (record.author_id       != null) r.authorId       = record.author_id
          if (record.post_id         != null) r.postId         = record.post_id
          if (record.sender_id       != null) r.senderId       = record.sender_id
          if (record.conversation_id != null) r.conversationId = record.conversation_id
          if (record.file_url        != null) r.fileUrl        = record.file_url
          if (record.file_type       != null) r.fileType       = record.file_type
          if (record.file_size       != null) r.fileSize       = record.file_size
          if (record.course_id       != null) r.courseId       = record.course_id
          if (record.plan            != null) r.plan           = record.plan
          if (record.status          != null) r.status         = record.status
          if (record.version         != null) r.version        = record.version

          if (localTable === 'materials') {
            r.downloadStatus = r.downloadStatus || 'none'
            r.cached         = r.cached         || false
          }

          r.createdAt       = record.created_at ? new Date(record.created_at).getTime() : Date.now()
          r.updatedAt       = record.updated_at ? new Date(record.updated_at).getTime() : Date.now()
          r.serverUpdatedAt = r.updatedAt
        })
        return
      }

      // UPDATE — only apply if server version is newer (last-write-wins)
      const serverUpdated = record.updated_at ? new Date(record.updated_at).getTime() : 0
      const localUpdated  = local.serverUpdatedAt || 0

      if (serverUpdated <= localUpdated) return

      await local.update((r: any) => {
        if (record.title    != null) r.title   = record.title
        if (record.content  != null) r.content = record.content
        if (record.status   != null) r.status  = record.status
        if (record.version  != null) r.version = record.version
        if (record.file_url != null) r.fileUrl = record.file_url

        if (localTable !== 'materials') {
          r.synced = true
        }

        r.updatedAt       = serverUpdated
        r.serverUpdatedAt = serverUpdated
      })
    })

  } catch (err) {
    console.warn(`[Realtime] Failed to apply change on ${table}:`, err)
  }
}

// ─── Start Supabase Realtime subscription ────────────────────────────────────

export function startRealtime(userId: string) {
  if (channel) return

  channel = supabase
    .channel('realtime-all-tables')
    .on(
      'postgres_changes' as any,
      { event: '*', schema: 'public' },
      async (payload: any) => {
        const table = payload.table as TableName

        if (!WATCHED_TABLES.includes(table)) return

        const record = payload.eventType === 'DELETE'
          ? payload.old
          : payload.new

        try {
          await applyRemoteChange(table, payload.eventType, record)
        } catch (err) {
          console.warn('[Realtime] applyRemoteChange threw:', err)
        }
      }
    )
    .subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Realtime] Connected')
      }
      if (status === 'CHANNEL_ERROR') {
        console.warn('[Realtime] Channel error — will retry')
      }
    })
}

// ─── Stop subscription ───────────────────────────────────────────────────────

export function stopRealtime() {
  if (channel) {
    supabase.removeChannel(channel)
    channel = null
  }
}