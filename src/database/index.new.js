import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapter-expo-sqlite-next';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';

import { Platform } from 'react-native';

// Import schema and models
import Comment from './models/Comment';
import Material from './models/Material';
import Post from './models/Post';
import SyncQueue from './models/SyncQueue';
import User from './models/User';
import schema from './schema';

// Choose adapter based on platform
let adapter;
if (Platform.OS === 'web') {
  // Web: LokiJS (no native)
  adapter = new LokiJSAdapter({
    schema,
    dbName: 'studentshare_web',
  });
} else {
  // Native: Expo SQLite
  adapter = new SQLiteAdapter({
    schema,
    dbName: 'studentshare',
  });
}

// Singleton database
let _database;

export function getDatabase() {
  if (_database) return _database;

  _database = new Database({
    adapter,
    modelClasses: [User, Post, Comment, Material, SyncQueue],
    actionsEnabled: true,
  });

  return _database;
}

export default getDatabase;
