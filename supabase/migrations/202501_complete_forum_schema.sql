-- COMPLETE FORUM SCHEMA MIGRATION
-- FIX: Creates missing forum_posts + Phase 2 tables
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)

-- =====================================
-- 0. DROP existing partial tables (if any)
/*
DROP TABLE IF EXISTS forum_notifications CASCADE;
DROP TABLE IF EXISTS forum_follows CASCADE;
DROP TABLE IF EXISTS forum_messages CASCADE;
DROP TABLE IF EXISTS forum_conversations CASCADE;
*/

-- =====================================
-- 1. CORE POSTS TABLE (was missing!)
CREATE TABLE IF NOT EXISTS forum_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id text NOT NULL DEFAULT 'general',
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_anon boolean DEFAULT false,
  is_pinned boolean DEFAULT false,
  title text NOT NULL,
  body text NOT NULL,
  image_url text,
  tags text[],
  upvotes integer DEFAULT 0,
  downvotes integer DEFAULT 0,
  comment_count integer DEFAULT 0,
  view_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 2. COMMENTS (threaded)
CREATE TABLE IF NOT EXISTS forum_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES forum_posts(id) ON DELETE CASCADE NOT NULL,
  parent_id uuid REFERENCES forum_comments(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_anon boolean DEFAULT false,
  body text NOT NULL,
  upvotes integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 3. VOTES
CREATE TABLE IF NOT EXISTS forum_votes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES forum_posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  direction text NOT NULL CHECK (direction IN ('up', 'down')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- 4. REACTIONS
CREATE TABLE IF NOT EXISTS forum_reactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES forum_posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  emoji text NOT NULL CHECK (emoji IN ('🔥','❤️','😂','🤯','👏')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- 5. BOOKMARKS
CREATE TABLE IF NOT EXISTS forum_bookmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES forum_posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- =====================================
-- 6. PHASE 2 TABLES (from original migration)
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

CREATE TABLE IF NOT EXISTS forum_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('like', 'reply', 'repost', 'follow', 'mention')),
  post_id uuid REFERENCES forum_posts(id),
  actor_id uuid REFERENCES auth.users(id),
  actor_name text,
  actor_handle text,
  actor_initials text,
  actor_grad text[],
  actor_avatar_url text,
  post_preview text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS forum_follows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  following_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(follower_id, following_id)
);

-- =====================================
-- 7. Profile extensions (if not exists)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS forum_handle text UNIQUE,
ADD COLUMN IF NOT EXISTS forum_initials text,
ADD COLUMN IF NOT EXISTS forum_grad text[] DEFAULT ARRAY['#1d9bf0', '#7856ff']::text[],
ADD COLUMN IF NOT EXISTS followers_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS following_count integer DEFAULT 0;

-- =====================================
-- 8. INDEXES (performance)
CREATE INDEX IF NOT EXISTS forum_posts_channel_idx ON forum_posts(channel_id);
CREATE INDEX IF NOT EXISTS forum_posts_created_idx ON forum_posts(created_at);
CREATE INDEX IF NOT EXISTS forum_posts_author_idx ON forum_posts(author_id);
CREATE INDEX IF NOT EXISTS forum_comments_post_idx ON forum_comments(post_id);
CREATE INDEX IF NOT EXISTS forum_votes_post_user_idx ON forum_votes(post_id, user_id);
CREATE INDEX IF NOT EXISTS forum_reactions_post_user_idx ON forum_reactions(post_id, user_id);
CREATE INDEX IF NOT EXISTS forum_conv_part_a_idx ON forum_conversations(participant_a);
CREATE INDEX IF NOT EXISTS forum_conv_part_b_idx ON forum_conversations(participant_b);
CREATE INDEX IF NOT EXISTS forum_msg_conv_idx ON forum_messages(conversation_id);
CREATE INDEX IF NOT EXISTS forum_notif_user_idx ON forum_notifications(user_id);
CREATE INDEX IF NOT EXISTS forum_notif_read_idx ON forum_notifications(read);

-- =====================================
-- 9. RLS POLICIES (secure by default)
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_follows ENABLE ROW LEVEL SECURITY;

-- Posts: anyone can read, author + authenticated can create
CREATE POLICY IF NOT EXISTS forum_posts_read ON forum_posts FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS forum_posts_insert ON forum_posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS forum_posts_update ON forum_posts FOR UPDATE USING (auth.uid() = author_id);

-- Comments: same as posts
CREATE POLICY IF NOT EXISTS forum_comments_read ON forum_comments FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS forum_comments_insert ON forum_comments FOR INSERT WITH CHECK (auth.role() = 'authenticated');\nCREATE POLICY IF NOT EXISTS forum_comments_update ON forum_comments FOR UPDATE USING (auth.uid() = author_id);

-- Interactions: own + post author can manage
CREATE POLICY IF NOT EXISTS forum_interactions_own ON forum_votes FOR ALL \n  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS forum_interactions_own ON forum_reactions FOR ALL \n  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS forum_interactions_own ON forum_bookmarks FOR ALL 
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- DMs: participants only
CREATE POLICY IF NOT EXISTS forum_conv_read ON forum_conversations FOR SELECT USING (
  auth.uid() = participant_a OR auth.uid() = participant_b
);
CREATE POLICY IF NOT EXISTS forum_conv_insert ON forum_conversations FOR INSERT WITH CHECK (
  auth.uid() = participant_a OR auth.uid() = participant_b
);
CREATE POLICY IF NOT EXISTS forum_msg_read ON forum_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM forum_conversations 
          WHERE id = conversation_id 
          AND (participant_a = auth.uid() OR participant_b = auth.uid()))
);
CREATE POLICY forum_msg_insert ON forum_messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM forum_conversations 
          WHERE id = conversation_id 
          AND (participant_a = auth.uid() OR participant_b = auth.uid()))
);

-- Notifications: own only
CREATE POLICY forum_notif_own ON forum_notifications FOR ALL 
  USING (auth.uid() = user_id);

-- Follows: public read, own management
CREATE POLICY forum_follows_read ON forum_follows FOR SELECT USING (true);
CREATE POLICY forum_follows_manage ON forum_follows FOR ALL WITH CHECK (
  auth.uid() = follower_id OR auth.uid() = following_id
);

-- =====================================
-- 10. TRIGGERS (maintain denormalized counts)
-- Post vote counts
CREATE OR REPLACE FUNCTION update_post_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE forum_posts 
  SET 
    upvotes = (SELECT COUNT(*) FROM forum_votes WHERE post_id = NEW.post_id AND direction = 'up'),
    downvotes = (SELECT COUNT(*) FROM forum_votes WHERE post_id = NEW.post_id AND direction = 'down')
  WHERE id = NEW.post_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER forum_post_votes 
  AFTER INSERT OR UPDATE OR DELETE ON forum_votes
  FOR EACH ROW EXECUTE FUNCTION update_post_vote_counts();

-- Comment counts
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE forum_posts 
  SET comment_count = (SELECT COUNT(*) FROM forum_comments WHERE post_id = NEW.post_id)
  WHERE id = NEW.post_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER forum_post_comments 
  AFTER INSERT OR DELETE ON forum_comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();

-- Followers count (profiles)
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

-- =====================================
-- 11. SEED DATA (sample posts)
INSERT INTO forum_posts (title, body, channel_id, tags) VALUES
('Welcome to Campus Times! 🎉', 
 'Post your questions, announcements, study tips, or campus events here. 
  Everyone follow @studentunion for official updates!', 
 'general', ARRAY['welcome', 'campus']),
('Library hours extended during exams 📚', 
 'Library open until 2AM this week! Good luck everyone! #FinalsWeek', 
 'general', ARRAY['library', 'finals']);

-- =====================================
-- ✅ SUCCESS
SELECT 'COMPLETE FORUM SCHEMA ✅ 
Posts: forum_posts | Comments: forum_comments | DMs: forum_conversations 
Reactions/Votes/Bookmarks supported | RLS enabled | Indexes optimized' AS status;

