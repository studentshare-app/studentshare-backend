import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { Platform } from 'react-native';

import schema from './schema';
import migrations from './migrations';
import User from './models/User';
import Post from './models/Post';
import Comment from './models/Comment';
import Material from './models/Material';
import Conversation from './models/Conversation';
import Message from './models/Message';
import Note from './models/Note';
import SyncQueue from './models/SyncQueue';
import Course from './models/Course';
import Lecturer from './models/Lecturer';
import PostInteraction from './models/PostInteraction';
import Bookmark from './models/Bookmark';


// ─── Adapter ────────────────────────────────────────────────────────────────

console.log('[WatermelonDB] Initializing database with:');
console.log(' - Schema Version:', schema.version);
console.log(' - Migrations Range:', migrations ? `${migrations.minVersion} to ${migrations.maxVersion}` : 'None');

let adapter;

if (Platform.OS === 'web') {
  // Web: use LokiJS (no native SQLite available)
  const LokiJSAdapter = require('@nozbe/watermelondb/adapters/lokijs').default;
  adapter = new LokiJSAdapter({
    schema: schema,
    migrations: migrations,
    dbName: 'studentshare_web',
    useWebWorker: false,
    useIncrementalIndexedDB: true,
  });
} else {
  // iOS / Android: native SQLite via expo-sqlite
  adapter = new SQLiteAdapter({
    schema: schema,
    migrations: migrations,
    dbName: 'studentshare',
    jsi: true, // faster JS interface — requires JSI support (expo-dev-client ✓)
    onSetUpError: (error) => {
      console.error('[WatermelonDB] Setup error:', error);
    },
  });
}

// ─── Singleton database instance ────────────────────────────────────────────
// IMPORTANT: export the instance directly, not a getter function.
// DatabaseContext wraps this — all screens access it via useDatabase().

const database = new Database({
  adapter,
  modelClasses: [
    User,
    Post,
    Comment,
    Material,
    Conversation,
    Message,
    Note,
    SyncQueue,
    Course,
    Lecturer,
    PostInteraction,
    Bookmark,
  ],
});


export default database;