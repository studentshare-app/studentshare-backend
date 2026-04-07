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
  @field('content')           content; // maps to 'body' in Supabase
  @field('author_id')         authorId;
  
  @field('image_url')         imageUrl;
  @field('poll_options')      pollOptions; // JSON string
  @field('reply_to_id')       replyToId;
  @field('is_anonymous')      isAnonymous;
  
  // Denormalized author info
  @field('author_name')       authorName;
  @field('author_handle')     authorHandle;
  @field('author_initials')   authorInitials;
  @field('author_grad')       authorGrad; // JSON string
  @field('author_avatar_url') authorAvatarUrl;
  @field('author_verified')   authorVerified;

  @field('likes_count')       likesCount;
  @field('reposts_count')     repostsCount;
  @field('comments_count')    commentsCount;
  @field('bookmarks_count')   bookmarksCount;
  @field('views_count')       viewsCount;

  @field('synced')            synced;
  @field('deleted')           deleted;
  @field('version')           version;
  @field('created_at')        createdAt;
  @field('updated_at')        updatedAt;
  @field('server_updated_at') serverUpdatedAt;

  @relation('users', 'author_id') author;
  @children('comments')           comments;
}