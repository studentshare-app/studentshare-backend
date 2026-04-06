import { Q } from '@nozbe/watermelondb';
import database from '../database';

// ─── Helper ──────────────────────────────────────────────────────────────────

const col = (name) => database.collections.get(name);

// Adds an item to the sync_queue outbox for later server sync
async function enqueue(userId, entity, operation, payload) {
  await database.write(async () => {
    await col('sync_queue').create((item) => {
      item.userId     = userId;
      item.entity     = entity;
      item.operation  = operation;
      item.payload    = JSON.stringify(payload);
      item.status     = 'pending';
      item.retryCount = 0;
      item.createdAt  = Date.now();
    });
  });
}

// ─── Posts ───────────────────────────────────────────────────────────────────

export async function createPost(userId, { title, content }) {
  let newPost;
  await database.write(async () => {
    newPost = await col('posts').create((post) => {
      post.title      = title;
      post.content    = content;
      post.authorId   = userId;
      post.synced     = false;
      post.deleted    = false;
      post.version    = 1;
      post.createdAt  = Date.now();
      post.updatedAt  = Date.now();
    });
  });

  // Add to outbox — will sync when online
  await enqueue(userId, 'posts', 'create', {
    local_id: newPost.id,
    title,
    content,
    author_id: userId,
  });

  return newPost;
}

export async function updatePost(post, userId, changes) {
  await database.write(async () => {
    await post.update((p) => {
      if (changes.title   !== undefined) p.title   = changes.title;
      if (changes.content !== undefined) p.content = changes.content;
      p.synced    = false;
      p.updatedAt = Date.now();
      p.version   = (p.version || 1) + 1;
    });
  });

  await enqueue(userId, 'posts', 'update', {
    local_id:  post.id,
    remote_id: post.remoteId,
    ...changes,
  });
}

export async function deletePost(post, userId) {
  await database.write(async () => {
    await post.update((p) => {
      p.deleted   = true;
      p.updatedAt = Date.now();
    });
  });

  await enqueue(userId, 'posts', 'delete', {
    local_id:  post.id,
    remote_id: post.remoteId,
  });
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function sendMessage(userId, conversationId, content) {
  let newMessage;
  const now = Date.now();

  await database.write(async () => {
    // Write message immediately — UI shows it right away
    newMessage = await col('messages').create((msg) => {
      msg.conversationId = conversationId;
      msg.senderId       = userId;
      msg.content        = content;
      msg.status         = 'sending'; // optimistic
      msg.synced         = false;
      msg.deleted        = false;
      msg.createdAt      = now;
      msg.updatedAt      = now;
    });

    // Update conversation last message preview
    try {
      const convo = await col('conversations').find(conversationId);
      await convo.update((c) => {
        c.lastMessage   = content;
        c.lastMessageAt = now;
        c.updatedAt     = now;
      });
    } catch (e) {
      // conversation might not exist locally yet — ok
    }
  });

  await enqueue(userId, 'messages', 'create', {
    local_id:        newMessage.id,
    conversation_id: conversationId,
    sender_id:       userId,
    content,
  });

  return newMessage;
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export async function createNote(userId, { title, content }) {
  let newNote;
  await database.write(async () => {
    newNote = await col('notes').create((note) => {
      note.title     = title;
      note.content   = content;
      note.authorId  = userId;
      note.synced    = false;
      note.deleted   = false;
      note.createdAt = Date.now();
      note.updatedAt = Date.now();
    });
  });

  await enqueue(userId, 'notes', 'create', {
    local_id: newNote.id,
    title,
    content,
    author_id: userId,
  });

  return newNote;
}

export async function updateNote(note, userId, changes) {
  await database.write(async () => {
    await note.update((n) => {
      if (changes.title   !== undefined) n.title   = changes.title;
      if (changes.content !== undefined) n.content = changes.content;
      n.synced    = false;
      n.updatedAt = Date.now();
    });
  });

  await enqueue(userId, 'notes', 'update', {
    local_id:  note.id,
    remote_id: note.remoteId,
    ...changes,
  });
}

export async function deleteNote(note, userId) {
  await database.write(async () => {
    await note.update((n) => {
      n.deleted   = true;
      n.updatedAt = Date.now();
    });
  });

  await enqueue(userId, 'notes', 'delete', {
    local_id:  note.id,
    remote_id: note.remoteId,
  });
}

// ─── Materials (download state) ───────────────────────────────────────────────

export async function setMaterialDownloadStatus(materialId, status, localPath = null) {
  await database.write(async () => {
    const material = await col('materials').find(materialId);
    await material.update((m) => {
      m.downloadStatus = status;
      if (localPath !== null) m.localPath = localPath;
      m.cached = status === 'done';
    });
  });
}

// ─── Seeding from server data ─────────────────────────────────────────────────
// Called by the sync engine to write server records into local DB

export async function upsertFromServer(tableName, records) {
  if (!records?.length) return;

  await database.write(async () => {
    const collection = col(tableName);

    for (const record of records) {
      // Try to find existing record by remote_id
      const existing = await collection
        .query(Q.where('remote_id', record.id))
        .fetch();

      if (existing.length > 0) {
        // Update existing
        await existing[0].update((local) => {
          Object.keys(record).forEach((key) => {
            if (key === 'id') return; // skip remote id field
            const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            if (camel in local) local[camel] = record[key];
          });
          local.serverUpdatedAt = new Date(record.updated_at).getTime();
          local.synced = true;
        });
      } else {
        // Create new local record from server data
        await collection.create((local) => {
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