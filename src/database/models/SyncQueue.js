import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class SyncQueue extends Model {
  static table = 'sync_queue';

  @field('user_id')     userId;
  @field('entity')      entity;     // 'posts' | 'messages' | 'notes' | 'materials'
  @field('operation')   operation;  // 'create' | 'update' | 'delete'
  @field('payload')     payload;    // JSON string of the record data
  @field('status')      status;     // 'pending' | 'syncing' | 'done' | 'failed'
  @field('retry_count') retryCount;
  @field('last_error')  lastError;
  @field('created_at')  createdAt;
  @field('resolved_at') resolvedAt;

  get parsedPayload() {
    try {
      return JSON.parse(this.payload || '{}');
    } catch {
      return {};
    }
  }

  get isPending() {
    return this.status === 'pending';
  }

  get hasFailed() {
    return this.status === 'failed';
  }
}