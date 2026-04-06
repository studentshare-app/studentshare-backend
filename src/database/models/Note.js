import { Model } from '@nozbe/watermelondb';
import { field, relation } from '@nozbe/watermelondb/decorators';

export default class Note extends Model {
  static table = 'notes';

  static associations = {
    users: { type: 'belongs_to', key: 'author_id' },
  };

  @field('remote_id')         remoteId;
  @field('title')             title;
  @field('content')           content;
  @field('author_id')         authorId;
  @field('synced')            synced;
  @field('deleted')           deleted;
  @field('created_at')        createdAt;
  @field('updated_at')        updatedAt;
  @field('server_updated_at') serverUpdatedAt;

  @relation('users', 'author_id') author;
}