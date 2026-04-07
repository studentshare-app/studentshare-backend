import { Q } from '@nozbe/watermelondb';
import { supabase } from '@/core/api/supabase';
import database from '@/database';
import { mapRemoteToLocal } from './mapping';
import { triggerSync } from './syncService';

/** 
 * Supabase tables we listen to for real-time changes.
 */
type TableName = 'posts' | 'comments' | 'materials' | 'sq_messages' | 'notes' | 'conversations'

const WATCHED_TABLES: TableName[] = [
  'posts',
  'comments',
  'materials',
  'sq_messages',
  'notes',
  'conversations',
];

let channel: any = null;

/** 
 * Applies a remote change from Supabase Realtime to the local WatermelonDB.
 */
async function processIncomingRecord(payload: any) {
  const table = payload.table as TableName;
  const event = payload.eventType;
  const record = payload.new || payload.old;

  if (!record?.id) return;
  console.log(`🔔 [Realtime] ${event} on ${table}`, record.id);

  if (!WATCHED_TABLES.includes(table)) return;

  try {
    const localTable = table === 'sq_messages' ? 'messages' : table;
    const collection = database.collections.get(localTable as any);

    await database.write(async () => {
      const remoteIdString = String(record.id);
      const existing = await collection
        .query(Q.where('remote_id', remoteIdString))
        .fetch();

      const local = (existing[0] || null) as any;

      if (event === 'DELETE' || record.deleted) {
        if (local) await local.update((r: any) => { r.deleted = true });
      } else if (event === 'INSERT' || event === 'UPDATE') {
        if (!local) {
          await collection.create((r: any) => {
            mapRemoteToLocal(localTable as any, record, r);
          });
        } else {
          // Version check (last-write-wins)
          const serverTs = record.updated_at ? new Date(record.updated_at).getTime() : 0;
          const localTs  = local.serverUpdatedAt || 0;
          if (serverTs <= localTs && event === 'UPDATE') return;

          await local.update((r: any) => {
            mapRemoteToLocal(localTable as any, record, r);
          });
        }
      }
    });

    // Trigger full sync fallback for relationships
    void triggerSync().catch(() => {});

  } catch (err) {
    console.error(`❌ [Realtime] Processing error:`, err);
  }
}

/** 
 * Subscribe to Supabase Realtime for all watched tables. 
 */
export function startRealtime(userId: string) {
  if (channel) return;

  console.log('📡 [Realtime] Starting subscription...');
  channel = supabase
    .channel('realtime-sync')
    .on(
      'postgres_changes' as any,
      { event: '*', schema: 'public' },
      (payload: any) => {
        void processIncomingRecord(payload);
      }
    )
    .subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ [Realtime] Channel Active');
      }
    });
}

/** 
 * Stop the Realtime subscription.
 */
export function stopRealtime() {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
    console.log('📡 [Realtime] Channel Stopped');
  }
}