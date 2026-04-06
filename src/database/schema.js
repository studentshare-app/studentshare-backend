import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
  version: 4, // bumped from 3 — new columns added
  tables: [

    // USERS
    tableSchema({
      name: 'users',
      columns: [
        { name: 'remote_id',         type: 'string',  isOptional: true },
        { name: 'name',              type: 'string' },
        { name: 'email',             type: 'string',  isOptional: true },
        { name: 'avatar_url',        type: 'string',  isOptional: true },
        { name: 'plan',              type: 'string' },
        { name: 'college_id',        type: 'string',  isOptional: true },
        { name: 'class_id',          type: 'string',  isOptional: true },
        { name: 'deleted',           type: 'boolean' },
        { name: 'version',           type: 'number' },
        { name: 'created_at',        type: 'number' },
        { name: 'updated_at',        type: 'number' },
        { name: 'server_updated_at', type: 'number',  isOptional: true },
      ],
    }),

    // POSTS (forum posts)
    tableSchema({
      name: 'posts',
      columns: [
        { name: 'remote_id',         type: 'string',  isOptional: true },
        { name: 'title',             type: 'string' },
        { name: 'content',           type: 'string' },
        { name: 'author_id',         type: 'string' },
        { name: 'likes_count',       type: 'number',  isOptional: true },
        { name: 'comments_count',    type: 'number',  isOptional: true },
        { name: 'synced',            type: 'boolean' },
        { name: 'deleted',           type: 'boolean' },
        { name: 'version',           type: 'number' },
        { name: 'created_at',        type: 'number' },
        { name: 'updated_at',        type: 'number' },
        { name: 'server_updated_at', type: 'number',  isOptional: true },
      ],
    }),

    // COMMENTS
    tableSchema({
      name: 'comments',
      columns: [
        { name: 'remote_id',         type: 'string',  isOptional: true },
        { name: 'post_id',           type: 'string' },
        { name: 'content',           type: 'string' },
        { name: 'author_id',         type: 'string' },
        { name: 'synced',            type: 'boolean',  isOptional: true },
        { name: 'deleted',           type: 'boolean' },
        { name: 'version',           type: 'number' },
        { name: 'created_at',        type: 'number' },
        { name: 'updated_at',        type: 'number' },
        { name: 'server_updated_at', type: 'number',  isOptional: true },
      ],
    }),

    // MATERIALS (file-sync ready — WhatsApp model)
    tableSchema({
      name: 'materials',
      columns: [
        { name: 'remote_id',         type: 'string',  isOptional: true },
        { name: 'title',             type: 'string' },
        { name: 'description',       type: 'string',  isOptional: true },
        { name: 'file_url',          type: 'string' },
        { name: 'file_type',         type: 'string',  isOptional: true },
        { name: 'file_size',         type: 'number',  isOptional: true },
        { name: 'course_id',         type: 'string',  isOptional: true },
        { name: 'uploader_id',       type: 'string',  isOptional: true },
        // Download state (WhatsApp-style)
        { name: 'download_status',   type: 'string' },  // none | downloading | done | failed
        { name: 'local_path',        type: 'string',  isOptional: true },
        { name: 'cached',            type: 'boolean' },
        // Sync state
        { name: 'deleted',           type: 'boolean' },
        { name: 'version',           type: 'number' },
        { name: 'created_at',        type: 'number' },
        { name: 'updated_at',        type: 'number' },
        { name: 'server_updated_at', type: 'number',  isOptional: true },
      ],
    }),

    // CONVERSATIONS (chat)
    tableSchema({
      name: 'conversations',
      columns: [
        { name: 'remote_id',         type: 'string',  isOptional: true },
        { name: 'participant_ids',   type: 'string' }, // JSON array string
        { name: 'last_message',      type: 'string',  isOptional: true },
        { name: 'last_message_at',   type: 'number',  isOptional: true },
        { name: 'unread_count',      type: 'number',  isOptional: true },
        { name: 'deleted',           type: 'boolean' },
        { name: 'created_at',        type: 'number' },
        { name: 'updated_at',        type: 'number' },
        { name: 'server_updated_at', type: 'number',  isOptional: true },
      ],
    }),

    // MESSAGES (chat messages)
    tableSchema({
      name: 'messages',
      columns: [
        { name: 'remote_id',         type: 'string',  isOptional: true },
        { name: 'conversation_id',   type: 'string' },
        { name: 'sender_id',         type: 'string' },
        { name: 'content',           type: 'string' },
        { name: 'status',            type: 'string' }, // sending | sent | delivered | read
        { name: 'synced',            type: 'boolean' },
        { name: 'deleted',           type: 'boolean' },
        { name: 'created_at',        type: 'number' },
        { name: 'updated_at',        type: 'number' },
        { name: 'server_updated_at', type: 'number',  isOptional: true },
      ],
    }),

    // NOTES
    tableSchema({
      name: 'notes',
      columns: [
        { name: 'remote_id',         type: 'string',  isOptional: true },
        { name: 'title',             type: 'string' },
        { name: 'content',           type: 'string' },
        { name: 'author_id',         type: 'string' },
        { name: 'synced',            type: 'boolean' },
        { name: 'deleted',           type: 'boolean' },
        { name: 'created_at',        type: 'number' },
        { name: 'updated_at',        type: 'number' },
        { name: 'server_updated_at', type: 'number',  isOptional: true },
      ],
    }),

    // SYNC QUEUE (outbox for offline actions)
    tableSchema({
      name: 'sync_queue',
      columns: [
        { name: 'user_id',           type: 'string' },
        { name: 'entity',            type: 'string' }, // posts | messages | notes | materials
        { name: 'operation',         type: 'string' }, // create | update | delete
        { name: 'payload',           type: 'string' }, // JSON string
        { name: 'status',            type: 'string' }, // pending | syncing | done | failed
        { name: 'retry_count',       type: 'number' },
        { name: 'last_error',        type: 'string',  isOptional: true },
        { name: 'created_at',        type: 'number' },
        { name: 'resolved_at',       type: 'number',  isOptional: true },
      ],
    }),

  ],
});