import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
  version: 11, // bumped from 10 — added lecturer_name to materials
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

    // COURSES [NEW]
    tableSchema({
      name: 'courses',
      columns: [
        { name: 'remote_id',         type: 'string',  isOptional: true },
        { name: 'name',              type: 'string' },
        { name: 'code',              type: 'string' },
        { name: 'class_id',          type: 'string',  isOptional: true },
        { name: 'is_official',       type: 'boolean' },
        { name: 'deleted',           type: 'boolean' },
        { name: 'created_at',        type: 'number' },
        { name: 'updated_at',        type: 'number' },
        { name: 'server_updated_at', type: 'number',  isOptional: true },
      ],
    }),

    // LECTURERS [NEW]
    tableSchema({
      name: 'lecturers',
      columns: [
        { name: 'remote_id',         type: 'string',  isOptional: true },
        { name: 'name',              type: 'string' },
        { name: 'college_id',        type: 'string',  isOptional: true },
        { name: 'deleted',           type: 'boolean' },
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
        { name: 'title',             type: 'string',  isOptional: true },
        { name: 'content',           type: 'string' }, // maps to 'body' in Supabase
        { name: 'author_id',         type: 'string' },
        { name: 'image_url',         type: 'string',  isOptional: true },
        { name: 'poll_options',      type: 'string',  isOptional: true }, // JSON string
        { name: 'reply_to_id',       type: 'string',  isOptional: true },
        { name: 'is_anonymous',      type: 'boolean' },
        { name: 'author_name',       type: 'string',  isOptional: true },
        { name: 'author_handle',     type: 'string',  isOptional: true },
        { name: 'author_initials',   type: 'string',  isOptional: true },
        { name: 'author_grad',       type: 'string',  isOptional: true }, // JSON string
        { name: 'author_avatar_url', type: 'string',  isOptional: true },
        { name: 'author_verified',   type: 'boolean' },
        { name: 'likes_count',       type: 'number',  isOptional: true },
        { name: 'reposts_count',     type: 'number',  isOptional: true },
        { name: 'comments_count',    type: 'number',  isOptional: true },
        { name: 'bookmarks_count',   type: 'number',  isOptional: true },
        { name: 'views_count',       type: 'number',  isOptional: true },
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
        { name: 'class_id',          type: 'string',  isOptional: true },
        { name: 'college_id',        type: 'string',  isOptional: true },
        { name: 'lecturer_id',       type: 'string',  isOptional: true },
        { name: 'lecturer_name',     type: 'string',  isOptional: true },
        { name: 'uploader_id',       type: 'string',  isOptional: true },
        { name: 'status',            type: 'string' }, // published | draft
        { name: 'academic_year',     type: 'string',  isOptional: true },
        { name: 'is_premium',        type: 'boolean' },
        { name: 'content_text',      type: 'string',  isOptional: true },
        { name: 'is_public',         type: 'boolean' },
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
        { name: 'user_id',           type: 'string' },
        { name: 'title',             type: 'string' },
        { name: 'body',              type: 'string' },
        { name: 'color',             type: 'string',  isOptional: true },
        { name: 'is_starred',        type: 'boolean' },
        { name: 'source',            type: 'string',  isOptional: true },
        { name: 'course_id',         type: 'string',  isOptional: true },
        { name: 'is_deleted',        type: 'boolean' },
        { name: 'status',            type: 'string' }, // synced | draft | generating
        { name: 'version',           type: 'number' },
        { name: 'created_at',        type: 'number' },
        { name: 'updated_at',        type: 'number' },
        { name: 'server_updated_at', type: 'number',  isOptional: true },
      ],
    }),

    // BOOKMARKS [NEW]
    tableSchema({
      name: 'bookmarks',
      columns: [
        { name: 'remote_id',         type: 'string',  isOptional: true },
        { name: 'user_id',           type: 'string' },
        { name: 'item_id',           type: 'string' }, // ID of the material or post
        { name: 'item_type',         type: 'string' }, // material | post
        { name: 'deleted',           type: 'boolean' },
        { name: 'created_at',        type: 'number' },
        { name: 'server_updated_at', type: 'number',  isOptional: true },
      ],
    }),

    // POST INTERACTIONS [NEW]
    tableSchema({
      name: 'post_interactions',
      columns: [
        { name: 'remote_id',         type: 'string',  isOptional: true },
        { name: 'post_id',           type: 'string' },
        { name: 'user_id',           type: 'string' },
        { name: 'type',              type: 'string' }, // like | repost | bookmark | vote
        { name: 'deleted',           type: 'boolean' },
        { name: 'created_at',        type: 'number' },
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