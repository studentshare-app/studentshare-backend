import { useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import { useDatabase } from '../contexts/DatabaseContext';

// ─── Generic collection observer ────────────────────────────────────────────
// Subscribes to a WatermelonDB collection query and re-renders on change.
// This is the core pattern — all screen hooks build on this.

function useQuery(collection, conditions = []) {
  const db = useDatabase();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const query = db.collections
      .get(collection)
      .query(...conditions);

    const subscription = query.observe().subscribe({
      next: (results) => {
        setRecords(results);
        setLoading(false);
      },
      error: (err) => {
        console.error(`[WatermelonDB] Error observing ${collection}:`, err);
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [collection]);

  return { records, loading };
}

// ─── Posts ───────────────────────────────────────────────────────────────────

export function usePosts() {
  return useQuery('posts', [
    Q.where('deleted', false),
    Q.sortBy('created_at', Q.desc),
  ]);
}

export function usePostById(id) {
  const db = useDatabase();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const subscription = db.collections
      .get('posts')
      .findAndObserve(id)
      .subscribe({
        next: (record) => { setPost(record); setLoading(false); },
        error: () => setLoading(false),
      });
    return () => subscription.unsubscribe();
  }, [id]);

  return { post, loading };
}

// ─── Materials ───────────────────────────────────────────────────────────────

export function useMaterials(courseId) {
  const conditions = [Q.where('deleted', false)];
  if (courseId) conditions.push(Q.where('course_id', courseId));
  conditions.push(Q.sortBy('created_at', Q.desc));
  return useQuery('materials', conditions);
}

export function useDownloadedMaterials() {
  return useQuery('materials', [
    Q.where('deleted', false),
    Q.where('download_status', 'done'),
    Q.sortBy('created_at', Q.desc),
  ]);
}

// ─── Messages ────────────────────────────────────────────────────────────────

export function useMessages(conversationId) {
  return useQuery('messages', [
    Q.where('conversation_id', conversationId),
    Q.where('deleted', false),
    Q.sortBy('created_at', Q.asc),
  ]);
}

export function useConversations() {
  return useQuery('conversations', [
    Q.where('deleted', false),
    Q.sortBy('last_message_at', Q.desc),
  ]);
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export function useNotes(authorId) {
  const conditions = [Q.where('deleted', false)];
  if (authorId) conditions.push(Q.where('author_id', authorId));
  conditions.push(Q.sortBy('updated_at', Q.desc));
  return useQuery('notes', conditions);
}

// ─── Sync queue ──────────────────────────────────────────────────────────────

export function usePendingSyncCount() {
  const db = useDatabase();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const subscription = db.collections
      .get('sync_queue')
      .query(Q.where('status', 'pending'))
      .observeCount()
      .subscribe(setCount);
    return () => subscription.unsubscribe();
  }, []);

  return count;
}