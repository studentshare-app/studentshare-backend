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
    // Run the sync cycle (internally handles per-table cursors now)
    await runSync()
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
          bookmarks:         'bookmarks',
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

// ─── Pull changes from Supabase table ────────────────────────────────────────

const SYNC_PAGE_SIZE = 1000

export async function pullIncoming(
  table: string,
  cursor: string | number,
  queryBuilder?: (query: any) => any
): Promise<any[]> {
  const isOnline = await NetInfo.fetch().then(s => s.isConnected)
  if (!isOnline) return []

  const cfg = TABLE_CONFIG[table]
  if (!cfg) return []

  try {
    let query = supabase
      .from(table)
      .select(table === 'materials' ? '*, lecturers(name)' : '*')
      .gt(cfg.cursorCol, cursor)
      .order(cfg.cursorCol, { ascending: true })
      .limit(SYNC_PAGE_SIZE)

    if (queryBuilder) {
      query = queryBuilder(query)
    }

    const { data, error } = await query

    if (error) throw error
    return data ?? []
  } catch (err) {
    console.warn(`[Sync] pullIncoming error for ${table}:`, err)
    throw err // Propagate to caller to prevent cursor updates
  }
}

// ─── Full sync cycle ─────────────────────────────────────────────────────────

export async function runSync(): Promise<void> {
  // 1. Push local changes
  await pushOutbox()

  // 2. Refresh profile for filtering
  let collegeId: string | null = null
  let classId: string | null = null
  try {
    const users = await database.collections.get('users').query(Q.where('deleted', false), Q.take(1)).fetch() as any[]
    if (users.length > 0) {
      collegeId = users[0].collegeId
      classId = users[0].classId
    }
  } catch (e) {}

  const tables = Object.keys(TABLE_CONFIG)

  for (const table of tables) {
    try {
      const cfg = TABLE_CONFIG[table]
      
      // Get current cursor for this table
      const cursorKey = `sync_cursor_${table}`
      let currentCursorRaw = await database.adapter.getLocal(cursorKey)
      
      // Default cursors (approx. "beginning of time")
      let currentCursor: string | number = cfg.cursorType === 'bigint' ? 0 : '1970-01-01T00:00:00Z'
      if (currentCursorRaw) {
        currentCursor = cfg.cursorType === 'bigint' ? (cfg.cursorType === 'bigint' && !isNaN(Number(currentCursorRaw)) ? Number(currentCursorRaw) : currentCursorRaw) : currentCursor
      }

      let queryBuilder: ((q: any) => any) | undefined
      if (table === 'courses' && classId) queryBuilder = (q) => q.eq('class_id', classId)
      if (table === 'lecturers' && collegeId) queryBuilder = (q) => q.eq('college_id', collegeId)
      if (table === 'materials' && classId) queryBuilder = (q) => q.eq('class_id', classId)

      let hasMore = true
      let recordsFetched = 0

      while (hasMore) {
        const rows = await pullIncoming(table, currentCursor, queryBuilder)
        if (rows.length === 0) {
          hasMore = false
          break
        }

        recordsFetched += rows.length

        // Apply records to local DB
        for (const record of rows) {
          try {
            const collection = database.collections.get(cfg.localName)
            await database.write(async () => {
              const existing = await collection.query(Q.where('remote_id', record.id)).fetch() as any[]
              const local = (existing[0] || null) as any

              if (record.deleted) {
                if (local) await local.update((r: any) => { r.deleted = true })
                return
              }

              if (!local) {
                await collection.create((r: any) => { mapRemoteToLocal(cfg.localName as any, record, r) })
              } else {
                const serverTs = record[cfg.cursorCol] ? new Date(record[cfg.cursorCol]).getTime() : 0
                const localTs  = local.serverUpdatedAt || 0
                if (serverTs > localTs) {
                  await local.update((r: any) => { mapRemoteToLocal(cfg.localName as any, record, r) })
                }
              }
            })
          } catch (itemErr) {
            console.warn(`[Sync] Failed record in ${table}:`, itemErr)
          }
        }

        // Update local cursor to the timestamp of the LAST record in this page
        const lastRecord = rows[rows.length - 1]
        currentCursor = lastRecord[cfg.cursorCol]
        await database.adapter.setLocal(cursorKey, String(currentCursor))

        // If we got fewer than the page size, we're done with this table
        if (rows.length < SYNC_PAGE_SIZE) {
          hasMore = false
        }
      }
      
      if (recordsFetched > 0) {
        console.log(`[Sync] Pulled ${recordsFetched} records for table: ${table}`)
      }
    } catch (tableErr) {
      console.warn(`[Sync] Failed to sync table ${table}:`, tableErr)
      // We don't advance the cursor, so it will retry from the same spot next time
    }
  }
}