import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class Bookmark extends Model {
  static table = 'bookmarks';

  @field('remote_id') remoteId;
  @field('user_id') userId;
  @field('item_id') itemId;
  @field('item_type') itemType;
  @field('deleted') deleted;
  
  @readonly @date('created_at') createdAt;
  @readonly @date('server_updated_at') serverUpdatedAt;
}
