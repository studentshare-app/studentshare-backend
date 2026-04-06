import { Model } from '@nozbe/watermelondb';
import { field, relation, children } from '@nozbe/watermelondb/decorators';

export default class Post extends Model {
  static table = 'posts';

  static associations = {
    users:    { type: 'belongs_to', key: 'author_id' },
    comments: { type: 'has_many',   foreignKey: 'post_id' },
  };

  @field('remote_id')         remoteId;
  @field('title')             title;
  @field('content')           content;
  @field('author_id')         authorId;
  @field('likes_count')       likesCount;
  @field('comments_count')    commentsCount;
  @field('synced')            synced;
  @field('deleted')           deleted;
  @field('version')           version;
  @field('created_at')        createdAt;
  @field('updated_at')        updatedAt;
  @field('server_updated_at') serverUpdatedAt;

  @relation('users', 'author_id') author;
  @children('comments')           comments;
}