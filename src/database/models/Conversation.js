import { Model } from '@nozbe/watermelondb';
import { field, children } from '@nozbe/watermelondb/decorators';

export default class Conversation extends Model {
  static table = 'conversations';

  static associations = {
    messages: { type: 'has_many', foreignKey: 'conversation_id' },
  };

  @field('remote_id')         remoteId;
  @field('participant_ids')   participantIdsRaw; // stored as JSON string
  @field('last_message')      lastMessage;
  @field('last_message_at')   lastMessageAt;
  @field('unread_count')      unreadCount;
  @field('deleted')           deleted;
  @field('created_at')        createdAt;
  @field('updated_at')        updatedAt;
  @field('server_updated_at') serverUpdatedAt;

  @children('messages') messages;

  get participantIds() {
    try {
      return JSON.parse(this.participantIdsRaw || '[]');
    } catch {
      return [];
    }
  }
}