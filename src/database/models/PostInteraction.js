import { Model } from '@nozbe/watermelondb'
import { field, date, readonly } from '@nozbe/watermelondb/decorators'

export default class PostInteraction extends Model {
  static table = 'post_interactions'

  @field('remote_id') remoteId
  @field('post_id')   postId
  @field('user_id')   userId
  @field('type')      type // like | repost | bookmark | vote
  @field('deleted')   deleted

  @readonly @date('created_at') createdAt
}
