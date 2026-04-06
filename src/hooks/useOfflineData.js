import { Q } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';
import database from '../database';
import { triggerSync } from '../core/sync/syncService';

export function useOfflinePosts(userId) {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    const subscription = database.collections.get('posts').query(
      Q.where('deleted', false),
      Q.sortBy('updated_at', Q.desc)
    ).observe();

    const load = async () => {
      if (userId) await triggerSync(userId);
      const snapshot = await subscription.fetch();
      setPosts(snapshot);
    };
    load();

    return () => subscription.unsubscribe();
  }, [userId]);

  return posts;
}