import { Model } from '@nozbe/watermelondb'
import { field, date, readonly } from '@nozbe/watermelondb/decorators'

export default class Lecturer extends Model {
  static table = 'lecturers'

  @field('remote_id')  remoteId
  @field('name')       name
  @field('college_id') collegeId
  @field('deleted')    deleted

  @readonly @date('created_at') createdAt
  @readonly @date('updated_at') updatedAt
}
