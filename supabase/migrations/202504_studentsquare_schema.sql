-- StudentSquare (Twitter-like) Schema Migration
-- Drops legacy campus times (ct_*) and forum (forum_*) tables, introduces fresh sq_* tables.

-- =====================================
-- 0. CLEAN SLATE: Drop old tables
-- =====================================
DROP TABLE IF EXISTS ct_notifications CASCADE;
DROP TABLE IF EXISTS ct_follows CASCADE;
DROP TABLE IF EXISTS ct_messages CASCADE;
DROP TABLE IF EXISTS ct_conversations CASCADE;
DROP TABLE IF EXISTS ct_bookmarks CASCADE;
DROP TABLE IF EXISTS ct_reposts CASCADE;
DROP TABLE IF EXISTS ct_likes CASCADE;
DROP TABLE IF EXISTS ct_poll_votes CASCADE;
DROP TABLE IF EXISTS ct_posts CASCADE;

DROP TABLE IF EXISTS forum_notifications CASCADE;
DROP TABLE IF EXISTS forum_follows CASCADE;
DROP TABLE IF EXISTS forum_messages CASCADE;
DROP TABLE IF EXISTS forum_conversations CASCADE;
DROP TABLE IF EXISTS forum_bookmarks CASCADE;
DROP TABLE IF EXISTS forum_reactions CASCADE;
DROP TABLE IF EXISTS forum_votes CASCADE;
DROP TABLE IF EXISTS forum_comments CASCADE;
DROP TABLE IF EXISTS forum_posts CASCADE;

-- =====================================
-- 1. POSTS (Tweets)
-- =====================================
CREATE TABLE IF NOT EXISTS sq_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  reply_to_id uuid REFERENCES sq_posts(id) ON DELETE CASCADE, -- thread parent
  is_quote boolean DEFAULT false,
  is_anonymous boolean DEFAULT false,
  quote_post_id uuid REFERENCES sq_posts(id) ON DELETE SET NULL,

  body text NOT NULL,
  image_url text,
  tags text[], -- extracted hashtags
  poll_options jsonb, -- array of { label: string }
  
  -- Cached Counters (Updated by Triggers)
  likes_count integer DEFAULT 0,
  reposts_count integer DEFAULT 0,
  replies_count integer DEFAULT 0,
  bookmarks_count integer DEFAULT 0,
  views_count integer DEFAULT 0,

  created_at timestamptz DEFAULT now() NOT NULL
);

-- =====================================
-- 2. INTERACTIONS
-- =====================================
CREATE TABLE IF NOT EXISTS sq_likes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES sq_posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS sq_reposts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES sq_posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS sq_bookmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES sq_posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS sq_poll_votes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES sq_posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  option_index integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS sq_follows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  following_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(follower_id, following_id)
);

-- =====================================
-- 3. NOTIFICATIONS
-- =====================================
CREATE TABLE IF NOT EXISTS sq_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL, -- receiver
  actor_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL, -- sender
  type text NOT NULL CHECK (type IN ('like', 'reply', 'repost', 'follow', 'mention')),
  post_id uuid REFERENCES sq_posts(id) ON DELETE CASCADE,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- =====================================
-- 4. DIRECT MESSAGES
-- =====================================
CREATE TABLE IF NOT EXISTS sq_conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_a uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  participant_b uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  last_message text,
  last_message_at timestamptz DEFAULT now(),
  unread_a integer DEFAULT 0,
  unread_b integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(participant_a, participant_b)
);

CREATE TABLE IF NOT EXISTS sq_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid REFERENCES sq_conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  body text NOT NULL,
  image_url text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- =====================================
-- 5. INDEXES for Performance
-- =====================================
CREATE INDEX IF NOT EXISTS sq_posts_author_idx ON sq_posts(author_id);
CREATE INDEX IF NOT EXISTS sq_posts_created_idx ON sq_posts(created_at);
CREATE INDEX IF NOT EXISTS sq_posts_reply_idx ON sq_posts(reply_to_id);

-- =====================================
-- 6. TRIGGERS for Cached Counters
-- =====================================
-- Likes Counter
CREATE OR REPLACE FUNCTION sq_update_likes_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE sq_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE sq_posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sq_trigger_likes ON sq_likes;
CREATE TRIGGER sq_trigger_likes
  AFTER INSERT OR DELETE ON sq_likes
  FOR EACH ROW EXECUTE FUNCTION sq_update_likes_count();

-- Reposts Counter
CREATE OR REPLACE FUNCTION sq_update_reposts_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE sq_posts SET reposts_count = reposts_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE sq_posts SET reposts_count = GREATEST(reposts_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sq_trigger_reposts ON sq_reposts;
CREATE TRIGGER sq_trigger_reposts
  AFTER INSERT OR DELETE ON sq_reposts
  FOR EACH ROW EXECUTE FUNCTION sq_update_reposts_count();

-- Bookmarks Counter
CREATE OR REPLACE FUNCTION sq_update_bookmarks_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE sq_posts SET bookmarks_count = bookmarks_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE sq_posts SET bookmarks_count = GREATEST(bookmarks_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sq_trigger_bookmarks ON sq_bookmarks;
CREATE TRIGGER sq_trigger_bookmarks
  AFTER INSERT OR DELETE ON sq_bookmarks
  FOR EACH ROW EXECUTE FUNCTION sq_update_bookmarks_count();

-- Replies Counter
CREATE OR REPLACE FUNCTION sq_update_replies_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.reply_to_id IS NOT NULL THEN
    UPDATE sq_posts SET replies_count = replies_count + 1 WHERE id = NEW.reply_to_id;
  ELSIF TG_OP = 'DELETE' AND OLD.reply_to_id IS NOT NULL THEN
    UPDATE sq_posts SET replies_count = GREATEST(replies_count - 1, 0) WHERE id = OLD.reply_to_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sq_trigger_replies ON sq_posts;
CREATE TRIGGER sq_trigger_replies
  AFTER INSERT OR DELETE ON sq_posts
  FOR EACH ROW EXECUTE FUNCTION sq_update_replies_count();

-- =====================================
-- 7. NOTIFICATION TRIGGER
-- =====================================
CREATE OR REPLACE FUNCTION sq_notify_interaction()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'sq_likes' THEN
    SELECT author_id INTO post_author_id FROM sq_posts WHERE id = NEW.post_id;
    IF NEW.user_id != post_author_id THEN
      INSERT INTO sq_notifications (user_id, actor_id, type, post_id) VALUES (post_author_id, NEW.user_id, 'like', NEW.post_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'sq_reposts' THEN
    SELECT author_id INTO post_author_id FROM sq_posts WHERE id = NEW.post_id;
    IF NEW.user_id != post_author_id THEN
      INSERT INTO sq_notifications (user_id, actor_id, type, post_id) VALUES (post_author_id, NEW.user_id, 'repost', NEW.post_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'sq_posts' AND NEW.reply_to_id IS NOT NULL THEN
    SELECT author_id INTO post_author_id FROM sq_posts WHERE id = NEW.reply_to_id;
    IF NEW.author_id != post_author_id THEN
      INSERT INTO sq_notifications (user_id, actor_id, type, post_id) VALUES (post_author_id, NEW.author_id, 'reply', NEW.reply_to_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'sq_follows' THEN
    IF NEW.follower_id != NEW.following_id THEN
      INSERT INTO sq_notifications (user_id, actor_id, type) VALUES (NEW.following_id, NEW.follower_id, 'follow');
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sq_trigger_notif_likes ON sq_likes;
CREATE TRIGGER sq_trigger_notif_likes AFTER INSERT ON sq_likes FOR EACH ROW EXECUTE FUNCTION sq_notify_interaction();

DROP TRIGGER IF EXISTS sq_trigger_notif_reposts ON sq_reposts;
CREATE TRIGGER sq_trigger_notif_reposts AFTER INSERT ON sq_reposts FOR EACH ROW EXECUTE FUNCTION sq_notify_interaction();

DROP TRIGGER IF EXISTS sq_trigger_notif_replies ON sq_posts;
CREATE TRIGGER sq_trigger_notif_replies AFTER INSERT ON sq_posts FOR EACH ROW EXECUTE FUNCTION sq_notify_interaction();

DROP TRIGGER IF EXISTS sq_trigger_notif_follows ON sq_follows;
CREATE TRIGGER sq_trigger_notif_follows AFTER INSERT ON sq_follows FOR EACH ROW EXECUTE FUNCTION sq_notify_interaction();

-- =====================================
-- 8. RLS POLICIES
-- =====================================
-- Skipping actual setup for brevity, assuming standard public SELECT and auth INSERT
ALTER TABLE sq_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sq_posts_read ON sq_posts;
CREATE POLICY sq_posts_read ON sq_posts FOR SELECT USING (true);
DROP POLICY IF EXISTS sq_posts_insert ON sq_posts;
CREATE POLICY sq_posts_insert ON sq_posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS sq_posts_update ON sq_posts;
CREATE POLICY sq_posts_update ON sq_posts FOR UPDATE USING (auth.uid() = author_id);
DROP POLICY IF EXISTS sq_posts_del ON sq_posts;
CREATE POLICY sq_posts_del ON sq_posts FOR DELETE USING (auth.uid() = author_id);

ALTER TABLE sq_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sq_likes_all ON sq_likes;
CREATE POLICY sq_likes_all ON sq_likes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sq_likes_read ON sq_likes;
CREATE POLICY sq_likes_read ON sq_likes FOR SELECT USING (true);

ALTER TABLE sq_reposts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sq_reposts_all ON sq_reposts;
CREATE POLICY sq_reposts_all ON sq_reposts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sq_reposts_read ON sq_reposts;
CREATE POLICY sq_reposts_read ON sq_reposts FOR SELECT USING (true);

ALTER TABLE sq_bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sq_bookmarks_all ON sq_bookmarks;
CREATE POLICY sq_bookmarks_all ON sq_bookmarks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE sq_poll_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sq_poll_votes_all ON sq_poll_votes;
CREATE POLICY sq_poll_votes_all ON sq_poll_votes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sq_poll_votes_read ON sq_poll_votes;
CREATE POLICY sq_poll_votes_read ON sq_poll_votes FOR SELECT USING (true);

ALTER TABLE sq_follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sq_follows_all ON sq_follows;
CREATE POLICY sq_follows_all ON sq_follows FOR ALL USING (auth.uid() = follower_id) WITH CHECK (auth.uid() = follower_id);
DROP POLICY IF EXISTS sq_follows_read ON sq_follows;
CREATE POLICY sq_follows_read ON sq_follows FOR SELECT USING (true);

ALTER TABLE sq_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sq_notifications_all ON sq_notifications;
CREATE POLICY sq_notifications_all ON sq_notifications FOR ALL USING (auth.uid() = user_id);

ALTER TABLE sq_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sq_conversations_read ON sq_conversations;
CREATE POLICY sq_conversations_read ON sq_conversations FOR SELECT USING (auth.uid() = participant_a OR auth.uid() = participant_b);
DROP POLICY IF EXISTS sq_conversations_insert ON sq_conversations;
CREATE POLICY sq_conversations_insert ON sq_conversations FOR INSERT WITH CHECK (auth.uid() = participant_a OR auth.uid() = participant_b);

ALTER TABLE sq_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sq_messages_read ON sq_messages;
CREATE POLICY sq_messages_read ON sq_messages FOR SELECT USING (EXISTS (SELECT 1 FROM sq_conversations WHERE id = conversation_id AND (participant_a = auth.uid() OR participant_b = auth.uid())));
DROP POLICY IF EXISTS sq_messages_insert ON sq_messages;
CREATE POLICY sq_messages_insert ON sq_messages FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM sq_conversations WHERE id = conversation_id AND (participant_a = auth.uid() OR participant_b = auth.uid())));

-- =====================================
-- 9. RPCs for Trending & Suggestions
-- =====================================
CREATE OR REPLACE FUNCTION sq_get_who_to_follow(current_user_id uuid, limit_count integer DEFAULT 4)
RETURNS TABLE (
  id uuid,
  full_name text,
  forum_handle text,
  forum_initials text,
  forum_grad text[],
  avatar_url text,
  is_verified boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name, p.forum_handle, p.forum_initials, p.forum_grad, p.avatar_url, p.is_verified
  FROM profiles p
  WHERE p.id != current_user_id
    AND NOT EXISTS (
      SELECT 1 FROM sq_follows f WHERE f.follower_id = current_user_id AND f.following_id = p.id
    )
  ORDER BY random() -- Simplistic for now, better to use followers_count inside profiles
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sq_get_trending_tags(limit_count integer DEFAULT 5)
RETURNS TABLE (
  tag text,
  count integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT unnest(tags) AS tag, COUNT(*)::integer as count
  FROM sq_posts
  WHERE tags IS NOT NULL
  GROUP BY tag
  ORDER BY count DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sq_increment_view(p_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE sq_posts SET views_count = views_count + 1 WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sq_set_unique_forum_handle() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.forum_handle IS NULL OR trim(NEW.forum_handle) = '' THEN
    NEW.forum_handle := lower(split_part(NEW.full_name, ' ', 1)) || '_' || substr(NEW.id::text, 1, 4);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sq_trigger_unique_handle ON profiles;
CREATE TRIGGER sq_trigger_unique_handle
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION sq_set_unique_forum_handle();

-- END OF MIGRATION
