import { supabase } from '@/core/api/supabase'
import { Q } from '@nozbe/watermelondb'
import database from '@/database'
import NetInfo from '@react-native-community/netinfo'

// ─── Per-table sync config ───────────────────────────────────────────────────
//
//  cursorCol  — which column to filter on for incremental sync
//  cursorType — 'bigint'  → pass the raw ms number (posts, comments)
//               'iso'     → pass an ISO string    (materials, notes, conversations)
//  localName  — WatermelonDB collection name (may differ from Supabase table)
//
type CursorType = 'bigint' | 'iso'
interface TableConfig {
  cursorCol:  string
  cursorType: CursorType
  localName:  string
}

const TABLE_CONFIG: Record<string, TableConfig> = {
  posts:          { cursorCol: 'updated_at', cursorType: 'bigint', localName: 'posts'          },
  comments:       { cursorCol: 'updated_at', cursorType: 'bigint', localName: 'comments'       },
  materials:      { cursorCol: 'updated_at', cursorType: 'iso',    localName: 'materials'      },
  notes:          { cursorCol: 'updated_at', cursorType: 'iso',    localName: 'notes'          },
  conversations:  { cursorCol: 'updated_at', cursorType: 'iso',    localName: 'conversations'  },
  sq_messages:    { cursorCol: 'created_at', cursorType: 'iso',    localName: 'messages'       },
}

// ─── Sync Interface (Aliases for external use) ───────────────────────────────

/** Performs a full push and pull sync. Returns Promise<void>. */
export async function triggerSync(userId?: string): Promise<void> {
  try {
    await runSync(0)
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

    for (const item of pending) {
      try {
        const payload = JSON.parse(item.payload)

        if (item.operation === 'create' || item.operation === 'update') {
          const { error } = await supabase.from(item.entity).upsert(payload)
          if (error) throw error
        } else if (item.operation === 'delete') {
          const { error } = await supabase
            .from(item.entity)
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
  const cursorValue = cfg.cursorType === 'iso'
    ? new Date(since).toISOString()   // timestamptz columns want ISO string
    : since                            // bigint columns want raw number

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
  await pushOutbox()

  const tables = Object.keys(TABLE_CONFIG)

  for (const table of tables) {
    const cfg  = TABLE_CONFIG[table]
    const rows = await pullIncoming(table, lastSyncedAt)

    for (const record of rows) {
      try {
        const collection = database.collections.get(cfg.localName)

        await database.write(async () => {
          const existing = await collection
            .query(Q.where('remote_id', record.id))
            .fetch() as any[]

          const local = existing[0] || null

          if (record.deleted) {
            if (local) await local.update((r: any) => { r.deleted = true })
            return
          }

          if (!local) {
            // CREATE — assign only known mapped fields; never Object.assign()
            // because WatermelonDB model properties are getter-only.
            await collection.create((r: any) => {
              r.remoteId  = record.id
              r.synced    = true
              r.deleted   = false
              if (record.title   != null) r.title   = record.title
              if (record.content != null) r.content = record.content
              if (record.status  != null) r.status  = record.status
              r.createdAt = record.created_at ? new Date(record.created_at).getTime() : Date.now()
              r.updatedAt = record.updated_at ? new Date(record.updated_at).getTime() : Date.now()
              r.serverUpdatedAt = r.updatedAt
            })
          } else {
            // UPDATE — last-write-wins
            const serverTs = record.updated_at ? new Date(record.updated_at).getTime() : 0
            if (serverTs <= ((local as any).serverUpdatedAt || 0)) return

            await local.update((r: any) => {
              r.synced          = true
              r.updatedAt       = serverTs
              r.serverUpdatedAt = serverTs
              if (record.title   != null) r.title   = record.title
              if (record.content != null) r.content = record.content
              if (record.status  != null) r.status  = record.status
            })
          }
        })
      } catch (err) {
        console.warn(`[Sync] Failed to apply record from ${table}:`, err)
      }
    }
  }
}