-- Phase 2 Forum Schema Migration
-- Run in Supabase SQL Editor

-- 1. DMs: conversations + messages
CREATE TABLE IF NOT EXISTS forum_conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_a uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  participant_b uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  last_message text,
  last_message_at timestamptz DEFAULT now(),
  unread_a integer DEFAULT 0,
  unread_b integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(participant_a, participant_b)
);

CREATE TABLE IF NOT EXISTS forum_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid REFERENCES forum_conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  image_url text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Notifications
CREATE TABLE IF NOT EXISTS forum_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('like', 'reply', 'repost', 'follow', 'mention')),
  post_id uuid REFERENCES forum_posts(id),
  actor_id uuid REFERENCES auth.users(id),
  actor_name text,
  actor_handle text,
  post_preview text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 3. Profile extensions
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS forum_handle text UNIQUE,
ADD COLUMN IF NOT EXISTS forum_initials text,
ADD COLUMN IF NOT EXISTS forum_grad text[] DEFAULT ARRAY['#1d9bf0', '#7856ff']::text[],
ADD COLUMN IF NOT EXISTS followers_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS following_count integer DEFAULT 0;

-- 4. Follows table
CREATE TABLE IF NOT EXISTS forum_follows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  following_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(follower_id, following_id)
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS forum_conv_part_a_idx ON forum_conversations(participant_a);
CREATE INDEX IF NOT EXISTS forum_conv_part_b_idx ON forum_conversations(participant_b);
CREATE INDEX IF NOT EXISTS forum_msg_conv_idx ON forum_messages(conversation_id);
CREATE INDEX IF NOT EXISTS forum_notif_user_idx ON forum_notifications(user_id);
CREATE INDEX IF NOT EXISTS forum_notif_read_idx ON forum_notifications(read);

-- 6. RLS Policies (secure defaults)
ALTER TABLE forum_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_follows ENABLE ROW LEVEL SECURITY;

-- Conversations: participants OR admin can read/write
CREATE POLICY forum_conv_read ON forum_conversations
  FOR SELECT USING (
    auth.uid() = participant_a OR auth.uid() = participant_b
  );
CREATE POLICY forum_conv_insert ON forum_conversations
  FOR INSERT WITH CHECK (
    auth.uid() = participant_a OR auth.uid() = participant_b
  );

-- Messages: same conversation participants
CREATE POLICY forum_msg_read ON forum_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM forum_conversations 
      WHERE id = forum_messages.conversation_id 
      AND (participant_a = auth.uid() OR participant_b = auth.uid())
    )
  );
CREATE POLICY forum_msg_insert ON forum_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM forum_conversations 
      WHERE id = conversation_id 
      AND (participant_a = auth.uid() OR participant_b = auth.uid())
    )
  );

-- Notifications: own + unread
CREATE POLICY forum_notif_own ON forum_notifications
  FOR ALL USING (auth.uid() = user_id);

-- Follows: own + public read
CREATE POLICY forum_follows_read ON forum_follows FOR SELECT USING (true);
CREATE POLICY forum_follows_manage ON forum_follows
  FOR ALL WITH CHECK (
    auth.uid() = follower_id OR auth.uid() = following_id
  );

-- 7. Triggers (maintain counts)
-- Followers count
CREATE OR REPLACE FUNCTION update_followers_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    UPDATE profiles 
    SET followers_count = (
      SELECT COUNT(*) FROM forum_follows WHERE following_id = profiles.id
    )
    WHERE id IN (COALESCE(OLD.following_id, NEW.following_id));
    
    UPDATE profiles 
    SET following_count = (
      SELECT COUNT(*) FROM forum_follows WHERE follower_id = profiles.id
    )
    WHERE id IN (COALESCE(OLD.follower_id, NEW.follower_id));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER forum_followers_count 
  AFTER INSERT OR DELETE ON forum_follows
  FOR EACH ROW EXECUTE FUNCTION update_followers_count();

-- Notification on forum interactions (likes/replies/etc.)
CREATE OR REPLACE FUNCTION forum_create_notification()
RETURNS TRIGGER AS $$
DECLARE
  recipient_id uuid;
  actor_profile record;
BEGIN
  -- Skip self-notifications
  IF NEW.user_id = TG_ARGV[0]::uuid THEN RETURN NEW; END IF;

  SELECT full_name, forum_handle INTO actor_profile 
  FROM profiles WHERE id = NEW.user_id;

  INSERT INTO forum_notifications (user_id, type, post_id, actor_id, actor_name, actor_handle)
  VALUES (TG_ARGV[0]::uuid, TG_ARGV[1], NEW.post_id, NEW.user_id, 
          actor_profile.full_name, actor_profile.forum_handle);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to existing triggers (votes, reactions, etc.)
-- Note: Assumes existing forum_* triggers; add if missing

SELECT 'Phase 2 Schema Migration Complete ✅' AS status;

