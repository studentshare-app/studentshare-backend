import { Model } from '@nozbe/watermelondb';
import { field, relation } from '@nozbe/watermelondb/decorators';

export default class Message extends Model {
  static table = 'messages';

  static associations = {
    conversations: { type: 'belongs_to', key: 'conversation_id' },
    users:         { type: 'belongs_to', key: 'sender_id' },
  };

  @field('remote_id')         remoteId;
  @field('conversation_id')   conversationId;
  @field('sender_id')         senderId;
  @field('content')           content;

  // status: 'sending' | 'sent' | 'delivered' | 'read'
  @field('status')            status;
  @field('synced')            synced;
  @field('deleted')           deleted;
  @field('created_at')        createdAt;
  @field('updated_at')        updatedAt;
  @field('server_updated_at') serverUpdatedAt;

  @relation('conversations', 'conversation_id') conversation;
  @relation('users', 'sender_id')               sender;

  get isPending() {
    return this.status === 'sending' || !this.synced;
  }
}