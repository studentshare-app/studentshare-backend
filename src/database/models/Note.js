import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class Note extends Model {
  static table = 'notes';

  @field('remote_id')         remoteId;
  @field('user_id')           userId;
  @field('title')             title;
  @field('body')              body;
  @field('color')             color;
  @field('is_starred')        isStarred;
  @field('source')            source;
  @field('course_id')         courseId;
  @field('is_deleted')        isDeleted;
  @field('status')            status;
  @field('version')           version;

  @readonly @date('created_at')        createdAt;
  @readonly @date('updated_at')        updatedAt;
  @readonly @date('server_updated_at') serverUpdatedAt;
}