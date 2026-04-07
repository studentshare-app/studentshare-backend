import { Model } from '@nozbe/watermelondb'
import { field, date, readonly } from '@nozbe/watermelondb/decorators'

export default class Course extends Model {
  static table = 'courses'

  @field('remote_id') remoteId
  @field('name')      name
  @field('code')      code
  @field('class_id')  classId
  @field('is_official') isOfficial
  @field('deleted')   deleted

  @readonly @date('created_at') createdAt
  @readonly @date('updated_at') updatedAt
}
