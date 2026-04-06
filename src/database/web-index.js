import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';

// Import schema and models
import Comment from './models/Comment';
import Material from './models/Material';
import Post from './models/Post';
import SyncQueue from './models/SyncQueue';
import User from './models/User';
import schema from './schema';

// Web-only: LokiJS adapter (no native deps)
const adapter = new LokiJSAdapter({
  schema,
  dbName: 'studentshare_web',
});

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
