import { supabase } from '@/core/api/supabase'
import { Q } from '@nozbe/watermelondb'
import database from '@/database'
import NetInfo from '@react-native-community/netinfo'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { mapRemoteToLocal, mapLocalToRemote } from './mapping'

const PROFILE_IDS_KEY = 'user_profile_ids'

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
  sq_posts:              { cursorCol: 'created_at', cursorType: 'iso',    localName: 'posts'             },
  comments:              { cursorCol: 'updated_at', cursorType: 'bigint', localName: 'comments'          },
  materials:             { cursorCol: 'updated_at', cursorType: 'iso',    localName: 'materials'         },
  notes:                 { cursorCol: 'updated_at', cursorType: 'iso',    localName: 'notes'             },
  conversations:         { cursorCol: 'updated_at', cursorType: 'iso',    localName: 'conversations'     },
  sq_messages:           { cursorCol: 'created_at', cursorType: 'iso',    localName: 'messages'          },
  sq_bookmarks:          { cursorCol: 'created_at', cursorType: 'iso',    localName: 'bookmarks'         },
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
    const selectQuery = table === 'materials' 
      ? '*, lecturers(name)'
      : table === 'sq_posts'
      ? '*, profiles(full_name, forum_handle, forum_initials, forum_grad, avatar_url, is_verified)'
      : '*'

    let query = supabase
      .from(table)
      .select(selectQuery)
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

/** Cache the user's profile IDs in AsyncStorage for use across app restarts and sync cycles */
export async function cacheProfileIds(classId: string, collegeId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILE_IDS_KEY, JSON.stringify({ classId, collegeId }))
  } catch (e) {}
}

/**
 * Read the locally-cached profile IDs written by cacheProfileIds().
 * Safe to call offline — pure AsyncStorage read, no network.
 */
export async function getCachedProfileIds(): Promise<{ classId: string | null; collegeId: string | null }> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_IDS_KEY)
    if (raw) {
      const cached = JSON.parse(raw)
      if (cached?.classId && cached?.collegeId) {
        return { classId: cached.classId, collegeId: cached.collegeId }
      }
    }
  } catch (e) {}
  return { classId: null, collegeId: null }
}

/** Resolve the current user's classId and collegeId from local DB → AsyncStorage → Supabase (in that order) */
async function resolveProfileIds(): Promise<{ classId: string | null; collegeId: string | null }> {
  // 1. Prioritize active Supabase profile to avoid stale local cache issues mid-sync
  try {
    const isOnline = await NetInfo.fetch().then(s => s.isConnected)
    if (isOnline) {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        const { data } = await supabase
          .from('profiles')
          .select('class_id, college_id')
          .eq('id', session.user.id)
          .single()
        if (data?.class_id && data?.college_id) {
          // Cache for offline sync
          await cacheProfileIds(data.class_id, data.college_id)
          return { classId: data.class_id, collegeId: data.college_id }
        }
      }
    }
  } catch (e) {}

  // 2. Try local WatermelonDB next
  try {
    const users = await database.collections.get('users').query(Q.where('deleted', false), Q.take(1)).fetch() as any[]
    if (users.length > 0 && users[0].classId && users[0].collegeId) {
      return { classId: users[0].classId, collegeId: users[0].collegeId }
    }
  } catch (e) {}

  // 3. Fall back to AsyncStorage cache (available offline after first login)
  try {
    const raw = await AsyncStorage.getItem(PROFILE_IDS_KEY)
    if (raw) {
      const cached = JSON.parse(raw)
      if (cached?.classId && cached?.collegeId) {
        return { classId: cached.classId, collegeId: cached.collegeId }
      }
    }
  } catch (e) {}

  return { classId: null, collegeId: null }
}

export async function runSync(): Promise<void> {
  // 1. Push local changes
  await pushOutbox()

  // 2. Resolve profile IDs (local DB → AsyncStorage cache → Supabase)
  let { classId, collegeId } = await resolveProfileIds()

  const tables = Object.keys(TABLE_CONFIG)

  for (const table of tables) {
    try {

      const cfg = TABLE_CONFIG[table]
      
      // Get current cursor for this table
      const cursorKey = `sync_cursor_${table}`
      let currentCursorRaw = await database.adapter.getLocal(cursorKey)
      
      // Force metadata metadata reset for full integrity fetch
      if (table === 'courses' || table === 'lecturers') {
        currentCursorRaw = undefined
      }
      
      // Default cursors (approx. "beginning of time")
      let currentCursor: string | number = cfg.cursorType === 'bigint' ? 0 : '1970-01-01T00:00:00Z'
      if (currentCursorRaw) {
        currentCursor = cfg.cursorType === 'bigint' && !isNaN(Number(currentCursorRaw)) 
          ? Number(currentCursorRaw) 
          : currentCursorRaw
      }

      let queryBuilder: ((q: any) => any) | undefined
      if (table === 'courses') {
        // Broaden sync: Pull all available courses to ensure materials can always resolve names. 
        // Metadata is small and essential for data integrity across all classes in the college.
        queryBuilder = undefined
      }
      if (table === 'lecturers') {
        // Broaden sync: No college_id filter since some schemas are missing it.
        queryBuilder = undefined 
      }
      if (table === 'materials') {
        if (!collegeId) continue
        queryBuilder = (q) => q.eq('college_id', collegeId)
      }

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