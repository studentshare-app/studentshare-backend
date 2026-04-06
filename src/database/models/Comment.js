import { Model } from '@nozbe/watermelondb';
import { field, relation } from '@nozbe/watermelondb/decorators';

export default class Comment extends Model {
  static table = 'comments';

  // 🔑 Sync mapping
  @field('remote_id') remoteId;

  // 📝 Data
  @field('content') content;
  @field('post_id') postId;
  @field('author_id') authorId;

  // 🔄 Sync state
  @field('version') version;
  @field('deleted') deleted;

  // ⏱ Timestamps
  @field('created_at') createdAt;
  @field('updated_at') updatedAt;
  @field('server_updated_at') serverUpdatedAt;

  // 🔗 Relations
  @relation('posts', 'post_id') post;
  @relation('users', 'author_id') author;
}