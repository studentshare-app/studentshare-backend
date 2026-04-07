import { useEffect, useState, useMemo } from 'react';
import { Q, Model } from '@nozbe/watermelondb';
import { useDatabase } from '../contexts/DatabaseContext';
import Note from '../database/models/Note';

// ─── Generic collection observer ────────────────────────────────────────────

interface QueryResult<T> {
  records: T[];
  loading: boolean;
}

export function useQuery<T extends Model>(collectionName: string, conditions: any[] = []): QueryResult<T> {
  const db = useDatabase();
  const [records, setRecords] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  // Memoize conditions to prevent infinite re-subscription if they are recreated every render
  const memoizedConditions = useMemo(() => JSON.stringify(conditions), [conditions]);

  useEffect(() => {
    const query = db.collections
      .get(collectionName)
      .query(...conditions);

    const subscription = query.observe().subscribe({
      next: (results) => {
        setRecords(results as T[]);
        setLoading(false);
      },
      error: (err) => {
        console.error(`[WatermelonDB] Error observing ${collectionName}:`, err);
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [collectionName, memoizedConditions, db]);

  return { records, loading };
}

// ─── Users ───────────────────────────────────────────────────────────────────

export function useUser(id?: string) {
  const db = useDatabase();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    // First try finding by WatermelonDB local ID, then fall back to remote_id
    // (session.user.id from Supabase auth is typically stored as remote_id)
    const subscription = db.collections
      .get('users')
      .query(Q.or(Q.where('remote_id', id), Q.where('id', id)))
      .observe()
      .subscribe({
        next: (records) => {
          setUser(records.length > 0 ? records[0] : null);
          setLoading(false);
        },
        error: () => setLoading(false),
      });
    return () => subscription.unsubscribe();
  }, [id, db]);

  return { user, loading };
}

// ─── Courses ─────────────────────────────────────────────────────────────────

export function useCourses(classId?: string) {
  const conditions: any[] = [Q.where('deleted', false)];
  if (classId) conditions.push(Q.where('class_id', classId));
  conditions.push(Q.sortBy('name', Q.asc));
  return useQuery<any>('courses', conditions);
}

// ─── Lecturers ───────────────────────────────────────────────────────────────

export function useLecturers(collegeId?: string) {
  const conditions: any[] = [Q.where('deleted', false)];
  if (collegeId) conditions.push(Q.where('college_id', collegeId));
  conditions.push(Q.sortBy('name', Q.asc));
  return useQuery<any>('lecturers', conditions);
}

// ─── Bookmarks ───────────────────────────────────────────────────────────────

export function useBookmarks(userId: string, itemType?: string) {
  const conditions: any[] = [Q.where('deleted', false)];
  if (userId) conditions.push(Q.where('user_id', userId));
  if (itemType) conditions.push(Q.where('item_type', itemType));
  conditions.push(Q.sortBy('created_at', Q.desc));
  return useQuery<any>('bookmarks', conditions);
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export function useNotes(userId?: string) {
  const conditions = [Q.where('is_deleted', false)];
  if (userId) {
    conditions.push(Q.where('user_id', userId));
  }
  
  return useQuery<Note>('notes', [
    ...conditions,
    Q.sortBy('updated_at', Q.desc)
  ]);
}

export function useNoteById(id?: string) {
  const db = useDatabase();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || id === 'new') {
      setLoading(false);
      return;
    }
    const subscription = db.collections
      .get('notes')
      .findAndObserve(id)
      .subscribe({
        next: (record) => { setNote(record as Note); setLoading(false); },
        error: () => setLoading(false),
      });
    return () => subscription.unsubscribe();
  }, [id, db]);

  return { note, loading };
}

// ─── Materials ───────────────────────────────────────────────────────────────

export function useMaterials(courseId?: string) {
  const conditions: any[] = [Q.where('deleted', false)];
  if (courseId) conditions.push(Q.where('course_id', courseId));
  conditions.push(Q.sortBy('created_at', Q.desc));
  return useQuery<any>('materials', conditions);
}

// ─── Conversations & Messages ────────────────────────────────────────────────

export function useConversations() {
  return useQuery<any>('conversations', [
    Q.where('deleted', false),
    Q.sortBy('last_message_at', Q.desc),
  ]);
}

export function useMessages(conversationId?: string) {
  const conditions = conversationId
    ? [
        Q.where('conversation_id', conversationId),
        Q.where('deleted', false),
        Q.sortBy('created_at', Q.asc),
      ]
    : [Q.where('id', '$$NONE$$')];

  const result = useQuery<any>('messages', conditions);

  if (!conversationId) {
    return { records: [], loading: false };
  }
  
  return result;
}

// ─── Sync Queue Status ───────────────────────────────────────────────────────

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
  }, [db]);

  return count;
}

// ─── Forum Posts ─────────────────────────────────────────────────────────────

export function useForumPosts(feedTab: string, userId?: string | null, collegeId?: string | null, classId?: string | null) {
  const conditions: any[] = [
    Q.where('deleted', false),
    Q.where('reply_to_id', null)
  ];

  if (feedTab === 'following' && userId) {
    // Offline follows are not tracked in WatermelonDB right now,
    // so we return an impossible condition to yield empty for the following feed.
    conditions.push(Q.where('id', '$$NONE$$'));
  } else if (feedTab === 'campus' && collegeId) {
    conditions.push(Q.on('users', 'college_id', collegeId));
  } else if (feedTab === 'classes' && classId) {
    conditions.push(Q.on('users', 'class_id', classId));
  }

  conditions.push(Q.sortBy('created_at', Q.desc));

  return useQuery<any>('posts', conditions);
}
