import { Model } from '@nozbe/watermelondb';
import { field, children } from '@nozbe/watermelondb/decorators';

export default class User extends Model {
  static table = 'users';

  static associations = {
    posts:         { type: 'has_many', foreignKey: 'author_id' },
    notes:         { type: 'has_many', foreignKey: 'author_id' },
    messages:      { type: 'has_many', foreignKey: 'sender_id' },
  };

  // Sync mapping
  @field('remote_id')         remoteId;

  // Data
  @field('name')              name;
  @field('email')             email;
  @field('avatar_url')        avatarUrl;
  @field('plan')              plan;
  @field('college_id')        collegeId;
  @field('class_id')          classId;

  // Sync state
  @field('deleted')           deleted;
  @field('version')           version;

  // Timestamps
  @field('created_at')        createdAt;
  @field('updated_at')        updatedAt;
  @field('server_updated_at') serverUpdatedAt;

  // Relations
  @children('posts')    posts;
  @children('notes')    notes;
  @children('messages') messages;

  get isPremium() {
    return this.plan === 'premium';
  }
}