import { supabase } from '@/core/api/supabase'
import { Q } from '@nozbe/watermelondb'
import database from '@/database'
import NetInfo from '@react-native-community/netinfo'
import { mapRemoteToLocal, mapLocalToRemote } from './mapping'

// ─── Per-table sync config ───────────────────────────────────────────────────

type CursorType = 'bigint' | 'iso'
interface TableConfig {
  cursorCol:  string
  cursorType: CursorType
  localName:  string
}

const TABLE_CONFIG: Record<string, TableConfig> = {
  users:                 { cursorCol: 'updated_at', cursorType: 'bigint', localName: 'users'             },
  courses:               { cursorCol: 'created_at', cursorType: 'iso',    localName: 'courses'           },
  lecturers:             { cursorCol: 'created_at', cursorType: 'iso',    localName: 'lecturers'         },
  sq_posts:              { cursorCol: 'updated_at', cursorType: 'iso',    localName: 'posts'             },
  sq_comments:           { cursorCol: 'updated_at', cursorType: 'iso',    localName: 'comments'          },
  materials:             { cursorCol: 'updated_at', cursorType: 'iso',    localName: 'materials'         },
  notes:                 { cursorCol: 'updated_at', cursorType: 'iso',    localName: 'notes'             },
  conversations:         { cursorCol: 'updated_at', cursorType: 'iso',    localName: 'conversations'     },
  sq_messages:           { cursorCol: 'created_at', cursorType: 'iso',    localName: 'messages'          },
  sq_post_interactions:  { cursorCol: 'created_at', cursorType: 'iso',    localName: 'post_interactions' },
  bookmarks:             { cursorCol: 'created_at', cursorType: 'iso',    localName: 'bookmarks'         },
}


// ─── Sync Interface (Aliases for external use) ───────────────────────────────

/** Performs a full push and pull sync. Returns Promise<void>. */
export async function triggerSync(userId?: string): Promise<void> {
  try {
    // 1. Get the last sync timestamp
    const lastSyncedAt = Number(await database.adapter.getLocal('last_synced_at')) || 0
    
    // 2. Run the sync cycle
    await runSync(lastSyncedAt)

    // 3. Update the last sync timestamp
    await database.adapter.setLocal('last_synced_at', Date.now().toString())
  } catch (err) {
    console.warn('[Sync] triggerSync failed:', err)
  }
}

/** Processes only the outgoing sync queue. Returns Promise<void>. */
export async function processOutgoingQueue(): Promise<void> {
  await pushOutbox()
}

// ─── Queue a mutation for later sync ─────────────────────────────────────────

export async function queueMutation(
  userId: string,
  entity: string,
  operation: string,
  payload: object
): Promise<void> {
  await database.write(async () => {
    await database.collections.get('sync_queue').create((r: any) => {
      r.userId     = userId
      r.entity     = entity
      r.operation  = operation
      r.payload    = JSON.stringify(payload)
      r.status     = 'pending'
      r.retryCount = 0
      r.createdAt  = Date.now()
    })
  })
}

// ─── Push pending outbox items to Supabase ───────────────────────────────────

export async function pushOutbox(): Promise<void> {
  const isOnline = await NetInfo.fetch().then(s => s.isConnected)
  if (!isOnline) return

  try {
    const pending = await database.collections
      .get('sync_queue')
      .query(Q.where('status', 'pending'))
      .fetch() as any[]

    if (pending.length === 0) return;

    for (const item of pending) {
      try {
        const payload = JSON.parse(item.payload)
        
        // Map local entity name to remote Supabase table name
        const tableMap: Record<string, string> = {
          posts:             'sq_posts',
          comments:          'sq_comments',
          messages:          'sq_messages',
          post_interactions: 'sq_post_interactions',
          bookmarks:         'bookmarks', // or 'sq_bookmarks' if prefix is used
          notes:             'notes',
          materials:         'materials',
        }
        const table = tableMap[item.entity] || item.entity

        if (item.operation === 'create_dm') {
          // Special case for DMs: call RPC to get or create on server
          const { data, error } = await supabase.rpc('get_or_create_dm', {
            target_user_id: payload.target_user_id,
          })
          if (error) throw error
          if (data?.id) {
            // Update local record with the remote ID
            await database.write(async () => {
              const convo = await database.collections.get('conversations').find(item.payload.local_id)
              await convo.update((c: any) => { c.remoteId = data.id; c.synced = true })
            })
          }
        } else if (item.operation === 'create' || item.operation === 'update') {
          const { error } = await supabase.from(table).upsert(payload)
          if (error) throw error
        } else if (item.operation === 'delete') {
          const { error } = await supabase
            .from(table)
            .delete()
            .eq('id', payload.id)
          if (error) throw error
        }

        await database.write(async () => {
          await item.update((r: any) => {
            r.status     = 'done'
            r.resolvedAt = Date.now()
          })
        })
      } catch (err) {
        console.warn(`[Sync] Failed to push ${item.entity}/${item.operation}:`, err)
        await database.write(async () => {
          await item.update((r: any) => {
            r.retryCount = (r.retryCount || 0) + 1
            r.lastError  = String(err)
            if (r.retryCount >= 5) r.status = 'failed'
          })
        })
      }
    }
  } catch (err) {
    console.warn('[Sync] pushOutbox error:', err)
  }
}

// ─── Pull changes from Supabase since last sync ──────────────────────────────

export async function pullIncoming(
  table: string,
  since: number   // always Unix ms — we convert per table config
): Promise<any[]> {
  const isOnline = await NetInfo.fetch().then(s => s.isConnected)
  if (!isOnline) return []

  const cfg = TABLE_CONFIG[table]
  if (!cfg) {
    console.warn(`[Sync] No config for table: ${table}`)
    return []
  }

  // Convert cursor to the format the column expects
  const cursorValue = cfg.cursorType === 'bigint' ? since : new Date(since).toISOString()

  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gt(cfg.cursorCol, cursorValue)
      .order(cfg.cursorCol, { ascending: true })

    if (error) throw error
    return data ?? []
  } catch (err) {
    console.warn(`[Sync] pullIncoming error for ${table}:`, err)
    return []
  }
}

// ─── Full sync cycle ─────────────────────────────────────────────────────────

export async function runSync(lastSyncedAt: number = 0): Promise<void> {
  // Always try to push changes first
  await pushOutbox()

  const tables = Object.keys(TABLE_CONFIG)

  for (const table of tables) {
    const cfg  = TABLE_CONFIG[table]
    const rows = await pullIncoming(table, lastSyncedAt)

    if (rows.length === 0) continue

    for (const record of rows) {
      try {
        const collection = database.collections.get(cfg.localName)

        await database.write(async () => {
          const existing = await collection
            .query(Q.where('remote_id', record.id))
            .fetch() as any[]

          const local = (existing[0] || null) as any

          // Handle Soft Deletes from Supabase
          if (record.deleted) {
            if (local) await local.update((r: any) => { r.deleted = true })
            return
          }

          if (!local) {
            // CREATE
            await collection.create((r: any) => {
              mapRemoteToLocal(cfg.localName as any, record, r)
            })
          } else {
            // UPDATE — last-write-wins based on version or cursor column
            const serverTs = record[cfg.cursorCol] ? new Date(record[cfg.cursorCol]).getTime() : 0
            const localTs  = local.serverUpdatedAt || 0

            if (serverTs <= localTs) return

            await local.update((r: any) => {
              mapRemoteToLocal(cfg.localName as any, record, r)
            })
          }
        })
      } catch (err) {
        console.warn(`[Sync] Failed to apply record from ${table}:`, err)
      }
    }
  }
}