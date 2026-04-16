-- ====================================================================
-- Production-Ready Notification RPCs for Admin Dashboard
-- ====================================================================

-- 1. Notify All Users
-- Broadcasts a notification to every user in the platform
CREATE OR REPLACE FUNCTION public.notify_all_users(
  p_title    TEXT,
  p_body     TEXT,
  p_type     TEXT DEFAULT 'general',
  p_sent_by  UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, title, body, type, metadata)
  SELECT id, p_sent_by, p_title, p_body, p_type, p_metadata
  FROM public.profiles
  WHERE id != p_sent_by OR p_sent_by IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Notify Specific College
-- Targets users belonging to a specific college
CREATE OR REPLACE FUNCTION public.notify_college(
  p_college_id UUID,
  p_title      TEXT,
  p_body       TEXT,
  p_type       TEXT DEFAULT 'general',
  p_sent_by    UUID DEFAULT NULL,
  p_metadata   JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, title, body, type, metadata)
  SELECT id, p_sent_by, p_title, p_body, p_type, p_metadata
  FROM public.profiles
  WHERE college_id = p_college_id
    AND (id != p_sent_by OR p_sent_by IS NULL);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Notify Specific Class
-- Targets users belonging to a specific academic class
CREATE OR REPLACE FUNCTION public.notify_class(
  p_class_id UUID,
  p_title    TEXT,
  p_body     TEXT,
  p_type     TEXT DEFAULT 'general',
  p_sent_by  UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, title, body, type, metadata)
  SELECT id, p_sent_by, p_title, p_body, p_type, p_metadata
  FROM public.profiles
  WHERE class_id = p_class_id
    AND (id != p_sent_by OR p_sent_by IS NULL);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Notification Templates Table (if not exists)
-- Used for logging notification history in the dashboard
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL,
  target text NOT NULL, -- 'all', 'college', 'class'
  send_count integer DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  sent_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage templates" ON public.notification_templates;
CREATE POLICY "Admins can manage templates" ON public.notification_templates FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

COMMENT ON FUNCTION public.notify_all_users IS 'Sends a persistent notification to all users and returns the delivery count.';
COMMENT ON FUNCTION public.notify_college IS 'Sends a persistent notification to users in a specific college.';
COMMENT ON FUNCTION public.notify_class IS 'Sends a persistent notification to users in a specific class.';

-- 5. Auto-Verify User on Active Subscription
-- Ensures that any user with an active subscription is automatically marked as verified.
CREATE OR REPLACE FUNCTION public.auto_verify_user_on_premium()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE public.profiles
    SET is_verified = true
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_auto_verify_on_premium ON public.subscriptions;
CREATE TRIGGER tr_auto_verify_on_premium
AFTER INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.auto_verify_user_on_premium();
