/**
 * Unified Mapping Registry for Supabase <-> WatermelonDB
 *
 * This utility ensures that field names are correctly translated between
 * the remote Supabase schema (snake_case) and the local WatermelonDB
 * models (camelCase property names).
 */

type TableName = 'users' | 'posts' | 'comments' | 'materials' | 'conversations' | 'messages' | 'notes' | 'courses' | 'lecturers' | 'post_interactions' | 'bookmarks';

interface MappingRule {
  fields: Record<string, string>; // remote_key -> local_property
  dates?: string[];               // remote_keys that are timestamps
}

const MAPPING_RULES: Record<TableName, MappingRule> = {
  users: {
    fields: {
      id:                'remoteId',
      name:              'name',
      email:             'email',
      avatar_url:        'avatarUrl',
      plan:              'plan',
      college_id:        'collegeId',
      class_id:          'classId',
      deleted:           'deleted',
      version:           'version',
    },
    dates: ['created_at', 'updated_at'],
  },
  courses: {
    fields: {
      id:                'remoteId',
      name:              'name',
      code:              'code',
      class_id:          'classId',
      is_official:       'isOfficial',
      deleted:           'deleted',
    },
    dates: ['created_at', 'updated_at'],
  },
  lecturers: {
    fields: {
      id:                'remoteId',
      name:              'name',
      college_id:        'collegeId',
      deleted:           'deleted',
    },
    dates: ['created_at', 'updated_at'],
  },
  posts: {
    fields: {
      id:                'remoteId',
      title:             'title',
      body:              'content',
      author_id:         'authorId',
      image_url:         'imageUrl',
      poll_options:      'pollOptions',
      reply_to_id:       'replyToId',
      is_anonymous:      'isAnonymous',
      author_name:       'authorName',
      author_handle:     'authorHandle',
      author_initials:   'authorInitials',
      author_grad:       'authorGrad',
      author_avatar_url: 'authorAvatarUrl',
      author_verified:   'authorVerified',
      likes_count:       'likesCount',
      reposts_count:     'repostsCount',
      comments_count:    'commentsCount',
      bookmarks_count:   'bookmarksCount',
      views_count:       'viewsCount',
      synced:            'synced',
      deleted:           'deleted',
      version:           'version',
    },
    dates: ['created_at', 'updated_at'],
  },
  comments: {
    fields: {
      id:                'remoteId',
      content:           'content',
      post_id:           'postId',
      author_id:         'authorId',
      deleted:           'deleted',
      version:           'version',
    },
    dates: ['created_at', 'updated_at'],
  },
  materials: {
    fields: {
      id:                'remoteId',
      title:             'title',
      description:       'description',
      file_url:          'fileUrl',
      type:              'fileType',
      file_size:         'fileSize',
      course_id:         'courseId',
      lecturer_id:       'lecturerId',
      uploader_id:       'uploaderId',
      uploaded_by:       'uploaderId', // Support dashboard's field name
      status:            'status',
      academic_year:     'academicYear',
      is_premium:        'isPremium',
      content_text:      'contentText',
      is_public:         'isPublic',
      deleted:           'deleted',
      version:           'version',
    },
    dates: ['created_at', 'updated_at'],
  },
  conversations: {
    fields: {
      id:                'remoteId',
      type:              'type',
      other_user_id:     'otherUserId',
      other_user_name:   'otherUserName',
      other_user_avatar: 'otherUserAvatar',
      last_message:      'lastMessage',
      last_message_at:   'lastMessageAt',
      unread_count:      'unreadCount',
      material_title:    'materialTitle',
      file_url:          'fileUrl',
      deleted:           'deleted',
    },
    dates: ['created_at', 'updated_at'],
  },
  messages: {
    fields: {
      id:                'remoteId',
      conversation_id:   'conversationId',
      sender_id:         'senderId',
      content:           'content',
      status:            'status',
      synced:            'synced',
      deleted:           'deleted',
    },
    dates: ['created_at', 'updated_at'],
  },
  notes: {
    fields: {
      id:                'remoteId',
      title:             'title',
      body:              'body',
      author_id:         'userId',
      color:             'color',
      is_starred:        'isStarred',
      source:            'source',
      course_id:         'courseId',
      status:            'status',
      synced:            'synced',
      deleted:           'deleted',
    },
    dates: ['created_at', 'updated_at'],
  },
  post_interactions: {
    fields: {
      id:                'remoteId',
      post_id:           'postId',
      user_id:           'userId',
      type:              'type',
      deleted:           'deleted',
    },
    dates: ['created_at'],
  },
  bookmarks: {
    fields: {
      id:                'remoteId',
      user_id:           'userId',
      material_id:       'materialId',
      note_id:           'noteId',
      deleted:           'deleted',
    },
    dates: ['created_at'],
  },
};


/** Extracts and maps remote record fields to local model properties */
export function mapRemoteToLocal(table: TableName, remote: any, local: any) {
  const rule = MAPPING_RULES[table];
  if (!rule) return;

  Object.entries(rule.fields).forEach(([remoteKey, localProp]) => {
    let value = remote[remoteKey];
    if (value !== undefined && value !== null) {
      // Cast IDs to strings to match WatermelonDB schema (prevents BigInt vs String issues)
      if (localProp === 'remoteId' || localProp.endsWith('Id')) {
        value = String(value);
      }
      local[localProp] = value;
    }
  });

  // Handle timestamps (convert ISO/BigInt to Unix ms)
  rule.dates?.forEach(remoteKey => {
    const localProp = rule.fields[remoteKey];
    const value = remote[remoteKey];
    if (value) {
      const ms = new Date(value).getTime();
      local[localProp] = ms;
      if (remoteKey === 'updated_at') {
        local.serverUpdatedAt = ms;
      }
    }
  });

  // Default values for common fields
  if (local.synced === undefined) local.synced = true;
  if (local.deleted === undefined) local.deleted = false;
}

/** Maps local model properties back to remote record keys for pushing */
export function mapLocalToRemote(table: TableName, local: any): any {
  const rule = MAPPING_RULES[table];
  if (!rule) return {};

  const remote: any = {};
  Object.entries(rule.fields).forEach(([remoteKey, localProp]) => {
    // Special case: don't push internal IDs if they aren't remote IDs
    if (remoteKey === 'id' && local.remoteId) {
      remote.id = local.remoteId;
      return;
    }

    const value = local[localProp];
    if (value !== undefined && value !== null) {
      // Convert timestamps back to ISO for Supabase timestamptz columns
      if (rule.dates?.includes(remoteKey)) {
        remote[remoteKey] = new Date(value).toISOString();
      } else {
        remote[remoteKey] = value;
      }
    }
  });

  return remote;
}
