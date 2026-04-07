import { Q, Database, Collection, Model } from '@nozbe/watermelondb';
import database from '../database';
import Note from './models/Note';

// ─── Helper ──────────────────────────────────────────────────────────────────

const col = <T extends Model>(name: string): Collection<T> => database.collections.get(name) as Collection<T>;

/**
 * Adds an item to the sync_queue outbox for background synchronization.
 */
async function enqueue(userId: string, entity: string, operation: 'create' | 'update' | 'delete' | 'create_dm', payload: any) {
  await database.write(async () => {
    await col('sync_queue').create((item: any) => {
      item.userId = userId;
      item.entity = entity;
      item.operation = operation;
      item.payload = JSON.stringify(payload);
      item.status = 'pending';
      item.retryCount = 0;
      item.createdAt = Date.now();
    });
  });
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export interface NoteData {
  title?: string;
  body?: string;
  color?: string;
  source?: string;
  courseId?: string | null;
  status?: string;
}

export async function createNote(userId: string, data: NoteData) {
  let newNote: Note;
  const now = Date.now();
  
  await database.write(async () => {
    newNote = await col<Note>('notes').create((n) => {
      n.userId = userId;
      n.title = data.title || 'Untitled';
      n.body = data.body || '';
      n.color = data.color || '#FF7B7B';
      n.isStarred = false;
      n.source = data.source || 'manual';
      n.courseId = data.courseId;
      n.isDeleted = false;
      n.status = data.status || 'synced';
      n.version = 1;
      // @ts-ignore - createdAt is readonly in model but writeable here during create
      n.createdAt = now;
      // @ts-ignore
      n.updatedAt = now;
    });
  });

  // @ts-ignore
  if (newNote.status !== 'draft') {
    await enqueue(userId, 'notes', 'create', {
      // @ts-ignore
      local_id: newNote.id,
      // @ts-ignore
      title: newNote.title,
      // @ts-ignore
      body: newNote.body,
      // @ts-ignore
      color: newNote.color,
      // @ts-ignore
      source: newNote.source,
      // @ts-ignore
      course_id: newNote.courseId,
    });
  }

  // @ts-ignore
  return newNote;
}

export async function updateNote(note: Note, userId: string, changes: Partial<NoteData & { isStarred?: boolean }>) {
  await database.write(async () => {
    await note.update((n) => {
      if (changes.title !== undefined) n.title = changes.title;
      if (changes.body !== undefined) n.body = changes.body;
      if (changes.color !== undefined) n.color = changes.color;
      if (changes.isStarred !== undefined) n.isStarred = changes.isStarred;
      if (changes.courseId !== undefined) n.courseId = changes.courseId;
      if (changes.status !== undefined) n.status = changes.status;
      // @ts-ignore
      n.updatedAt = Date.now();
      n.version = (n.version || 1) + 1;
    });
  });

  if (note.status !== 'draft') {
    await enqueue(userId, 'notes', 'update', {
      local_id: note.id,
      remote_id: note.remoteId,
      ...changes,
      // map camelCase to snake_case for Supabase
      is_starred: changes.isStarred,
      course_id: changes.courseId,
    });
  }
}

export async function deleteNote(note: Note, userId: string) {
  await database.write(async () => {
    await note.update((n) => {
      n.isDeleted = true;
      // @ts-ignore
      n.updatedAt = Date.now();
    });
  });

  await enqueue(userId, 'notes', 'delete', {
    id: note.remoteId || note.id,
  });
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function sendMessage(senderId: string, conversationId: string, content: string) {
  let newMessage: any;
  const now = Date.now();
  await database.write(async () => {
    newMessage = await col<any>('messages').create((m: any) => {
      m.senderId = senderId;
      m.conversationId = conversationId;
      m.content = content;
      m.status = 'sending';
      m.synced = false;
      m.deleted = false;
      m.createdAt = now;
      m.updatedAt = now;
    });
    try {
      const conv = await col<any>('conversations').find(conversationId);
      await conv.update((c: any) => {
        c.lastMessage = content.slice(0, 80);
        c.lastMessageAt = now;
        c.updatedAt = now;
      });
    } catch {}
  });

  if (senderId !== 'ai') {
    await enqueue(senderId, 'messages', 'create', {
      local_id: newMessage.id,
      conversation_id: conversationId,
      content: content,
    });
  }

  return newMessage;
}

// ─── Materials ───────────────────────────────────────────────────────────────

export async function setMaterialDownloadStatus(materialId: string, status: string, localPath: string | null = null) {
  await database.write(async () => {
    const material = await col<any>('materials').find(materialId);
    await material.update((m: any) => {
      m.downloadStatus = status;
      if (localPath !== null) m.localPath = localPath;
      m.cached = status === 'done';
    });
  });
}

// ─── Sync Engine Helpers ─────────────────────────────────────────────────────

export async function upsertFromServer(tableName: string, records: any[]) {
  if (!records?.length) return;

  await database.write(async () => {
    const collection = col<any>(tableName);

    for (const record of records) {
      const existing = await collection.query(Q.where('remote_id', record.id)).fetch();

      if (existing.length > 0) {
        await existing[0].update((local: any) => {
          Object.keys(record).forEach((key) => {
            if (key === 'id') return;
            const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            if (camel in local) local[camel] = record[key];
          });
          local.serverUpdatedAt = new Date(record.updated_at).getTime();
          local.synced = true;
        });
      } else {
        await collection.create((local: any) => {
          local.remoteId = record.id;
          Object.keys(record).forEach((key) => {
            if (key === 'id') return;
            const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            if (camel in local) local[camel] = record[key];
          });
          local.serverUpdatedAt = new Date(record.updated_at).getTime();
          local.synced = true;
          local.deleted = false;
          if (!local.createdAt) local.createdAt = Date.now();
          if (!local.updatedAt) local.updatedAt = Date.now();
        });
      }
    }
  });
}

// ─── Bookmarks ───────────────────────────────────────────────────────────────

export async function toggleBookmark(userId: string, itemId: string, itemType: string) {
  let isBookmarked = false;
  await database.write(async () => {
    const existing = await col<any>('bookmarks')
      .query(Q.where('user_id', userId), Q.where('item_id', itemId), Q.where('item_type', itemType), Q.where('deleted', false))
      .fetch();

    if (existing.length > 0) {
      await existing[0].update((b: any) => {
        b.deleted = true;
      });
      isBookmarked = false;
    } else {
      await col<any>('bookmarks').create((b: any) => {
        b.userId = userId;
        b.itemId = itemId;
        b.itemType = itemType;
        b.deleted = false;
        b.createdAt = Date.now();
      });
      isBookmarked = true;
    }
  });

  await enqueue(userId, 'bookmarks', isBookmarked ? 'create' : 'delete', {
    user_id: userId,
    item_id: itemId,
    item_type: itemType,
  });

  return isBookmarked;
}

// ─── Forum Posts & Interactions ──────────────────────────────────────────────

export async function createPost(userId: string, data: any) {
  let newPost: any;
  const now = Date.now();
  await database.write(async () => {
    newPost = await col<any>('posts').create((p: any) => {
      p.authorId = userId;
      p.content = data.content || '';
      p.imageUrl = data.imageUrl || null;
      p.pollOptions = data.pollOptions ? JSON.stringify(data.pollOptions) : null;
      p.replyToId = data.replyToId || null;
      p.isAnonymous = !!data.isAnonymous;
      p.authorName = data.author_name;
      p.authorHandle = data.author_handle;
      p.authorInitials = data.author_initials;
      p.authorGrad = data.author_grad ? (Array.isArray(data.author_grad) ? JSON.stringify(data.author_grad) : data.author_grad) : null;
      p.authorAvatarUrl = data.author_avatar_url;
      p.authorVerified = !!data.author_verified;
      p.likesCount = 0;
      p.repostsCount = 0;
      p.commentsCount = 0;
      p.viewsCount = 0;
      p.bookmarksCount = 0;
      p.synced = false;
      p.deleted = false;
      p.version = 1;
      p.createdAt = now;
      p.updatedAt = now;
    });
  });

  await enqueue(userId, 'posts', 'create', {
    local_id: newPost.id,
    content: newPost.content,
    image_url: newPost.imageUrl,
    poll_options: data.pollOptions,
    reply_to_id: newPost.replyToId,
    is_anonymous: newPost.isAnonymous,
  });

  return newPost;
}

export async function deletePost(postId: string, userId: string) {
  await database.write(async () => {
    try {
      const post = await col<any>('posts').find(postId);
      await post.update((p: any) => {
        p.deleted = true;
        p.synced = false;
        p.updatedAt = Date.now();
      });
    } catch {
      // Ignored if not found locally
    }
  });
  await enqueue(userId, 'posts', 'delete', { id: postId });
}

export async function togglePostInteraction(userId: string, postId: string, type: string) {
  let isAdded = false;
  await database.write(async () => {
    const interactionsColl = col<any>('post_interactions');
    const existing = await interactionsColl
      .query(Q.where('user_id', userId), Q.where('post_id', postId), Q.where('type', type), Q.where('deleted', false))
      .fetch();

    if (existing.length > 0) {
      await existing[0].update((i: any) => {
        i.deleted = true;
      });
      isAdded = false;
    } else {
      await interactionsColl.create((i: any) => {
        i.userId = userId;
        i.postId = postId;
        i.type = type;
        i.deleted = false;
        i.createdAt = Date.now();
      });
      isAdded = true;
    }
  });

  await enqueue(userId, 'post_interactions', isAdded ? 'create' : 'delete', {
    user_id: userId,
    post_id: postId,
    type,
  });

  return isAdded;
}

export async function createComment(userId: string, postId: string, content: string) {
  let newComment: any;
  const now = Date.now();
  await database.write(async () => {
    newComment = await col<any>('comments').create((c: any) => {
      c.postId = postId;
      c.content = content;
      c.authorId = userId;
      c.deleted = false;
      c.synced = false;
      c.version = 1;
      c.createdAt = now;
      c.updatedAt = now;
    });
  });

  await enqueue(userId, 'comments', 'create', {
    local_id: newComment.id,
    post_id: postId,
    content: content,
  });

  return newComment;
}
