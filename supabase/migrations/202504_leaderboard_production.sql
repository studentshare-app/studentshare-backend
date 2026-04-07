-- ====================================================================
-- Leaderboard Production Migration
-- StudentSquare: Optimized Scoring & Ranking System
-- ====================================================================

-- 1. Activity Tables (Prefixed with sq_ for consistency)
-- ====================================================================

CREATE TABLE IF NOT EXISTS sq_user_activity (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  activity_type text NOT NULL, -- 'quiz_completed', 'ai_session', 'daily_login'
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS sq_user_activity_user_created_idx ON sq_user_activity(user_id, created_at);
CREATE INDEX IF NOT EXISTS sq_user_activity_type_idx ON sq_user_activity(activity_type);

CREATE TABLE IF NOT EXISTS sq_material_downloads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  material_id uuid, 
  downloaded_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS sq_material_downloads_user_time_idx ON sq_material_downloads(user_id, downloaded_at);

-- 2. Snapshot Tables for Ranking History
-- ====================================================================

CREATE TABLE IF NOT EXISTS sq_leaderboard_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  period text NOT NULL, -- 'weekly', 'monthly', 'alltime'
  snapshot_date date NOT NULL,
  global_rank integer,
  college_rank integer,
  score integer,
  UNIQUE(user_id, period, snapshot_date)
);

CREATE TABLE IF NOT EXISTS sq_leaderboard_college_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id uuid REFERENCES colleges(id) ON DELETE CASCADE NOT NULL,
  period text NOT NULL,
  snapshot_date date NOT NULL,
  college_rank integer,
  avg_score numeric,
  UNIQUE(college_id, period, snapshot_date)
);

-- 3. Optimized Leaderboard Retrieval (RPC)
-- ====================================================================

CREATE OR REPLACE FUNCTION sq_get_leaderboard(
  p_period text DEFAULT 'weekly',
  p_college_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_search text DEFAULT NULL,
  p_sort_by_movement boolean DEFAULT FALSE
)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  is_verified boolean,
  college_id uuid,
  college_name text,
  downloads integer,
  quizzes integer,
  ai_sessions integer,
  streak integer,
  score integer,
  rank integer,
  movement integer
) AS $$
DECLARE
  v_from_date timestamptz;
  v_now date := CURRENT_DATE;
  v_prev_snapshot_date date;
BEGIN
  -- Determine time period for analysis
  IF p_period = 'weekly' THEN
    v_from_date := date_trunc('week', now());
    v_prev_snapshot_date := (v_from_date - interval '1 week')::date;
  ELSIF p_period = 'monthly' THEN
    v_from_date := date_trunc('month', now());
    v_prev_snapshot_date := (v_from_date - interval '1 month')::date;
  ELSE
    v_from_date := '1970-01-01'::timestamptz;
    v_prev_snapshot_date := (v_now - interval '1 day')::date;
  END IF;

  RETURN QUERY
  WITH user_stats AS (
    SELECT 
      p.id as u_id,
      p.full_name as u_full_name,
      p.avatar_url as u_avatar_url,
      p.is_verified as u_is_verified,
      p.college_id as u_college_id,
      c.short_name as c_name,
      
      -- Parallel subqueries for counts (optimized via indexed user_id + date)
      (SELECT count(*)::integer FROM sq_material_downloads md WHERE md.user_id = p.id AND md.downloaded_at >= v_from_date) as dl_count,
      (SELECT count(*)::integer FROM sq_user_activity ua WHERE ua.user_id = p.id AND ua.activity_type = 'quiz_completed' AND ua.created_at >= v_from_date) as q_count,
      (SELECT count(*)::integer FROM sq_user_activity ua WHERE ua.user_id = p.id AND ua.activity_type = 'ai_session' AND ua.created_at >= v_from_date) as ai_count,
      (SELECT count(*)::integer FROM sq_user_activity ua WHERE ua.user_id = p.id AND ua.activity_type = 'daily_login' AND ua.created_at >= v_from_date) as s_count
    FROM profiles p
    LEFT JOIN colleges c ON c.id = p.college_id
    WHERE (p_college_id IS NULL OR p.college_id = p_college_id)
      AND p.full_name IS NOT NULL
      AND (p_search IS NULL OR p.full_name ILIKE '%' || p_search || '%')
  ),
  scored_users AS (
    SELECT 
      *,
      (dl_count * 2 + q_count * 5 + ai_count * 3 + s_count * 1) as total_score
    FROM user_stats
  ),
  ranked_users AS (
    SELECT 
      *,
      dense_rank() OVER (ORDER BY total_score DESC, u_full_name ASC)::integer as cur_rank
    FROM scored_users
  )
  SELECT 
    r.u_id,
    r.u_full_name,
    r.u_avatar_url,
    r.u_is_verified,
    r.u_college_id,
    r.c_name,
    r.dl_count,
    r.q_count,
    r.ai_count,
    r.s_count,
    r.total_score,
    r.cur_rank,
    (CASE 
      WHEN p_college_id IS NULL THEN COALESCE(s.global_rank - r.cur_rank, 0)
      ELSE COALESCE(s.college_rank - r.cur_rank, 0)
    END)::integer as movement
  FROM ranked_users r
  LEFT JOIN sq_leaderboard_snapshots s ON s.user_id = r.u_id AND s.period = p_period AND s.snapshot_date = v_prev_snapshot_date
  ORDER BY 
    CASE WHEN p_sort_by_movement THEN movement END DESC,
    r.total_score DESC, 
    r.u_full_name ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 4. Optimized College Leaderboard Retrieval (RPC)
-- ====================================================================

CREATE OR REPLACE FUNCTION sq_get_colleges_leaderboard(
  p_period text DEFAULT 'weekly',
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  short_name text,
  student_count integer,
  total_score numeric,
  avg_score numeric,
  rank integer,
  movement integer
) AS $$
DECLARE
  v_from_date timestamptz;
  v_now date := CURRENT_DATE;
  v_prev_snapshot_date date;
BEGIN
  IF p_period = 'weekly' THEN
    v_from_date := date_trunc('week', now());
    v_prev_snapshot_date := (v_from_date - interval '1 week')::date;
  ELSIF p_period = 'monthly' THEN
    v_from_date := date_trunc('month', now());
    v_prev_snapshot_date := (v_from_date - interval '1 month')::date;
  ELSE
    v_from_date := '1970-01-01'::timestamptz;
    v_prev_snapshot_date := (v_now - interval '1 day')::date;
  END IF;

  RETURN QUERY
  WITH college_stats AS (
    SELECT 
      c.id as c_id,
      c.name as c_name,
      c.short_name as c_short_name,
      COUNT(p.id)::integer as s_count,
      SUM(
        (SELECT count(*)::integer FROM sq_material_downloads md WHERE md.user_id = p.id AND md.downloaded_at >= v_from_date) * 2 +
        (SELECT count(*)::integer FROM sq_user_activity ua WHERE ua.user_id = p.id AND ua.activity_type = 'quiz_completed' AND ua.created_at >= v_from_date) * 5 +
        (SELECT count(*)::integer FROM sq_user_activity ua WHERE ua.user_id = p.id AND ua.activity_type = 'ai_session' AND ua.created_at >= v_from_date) * 3 +
        (SELECT count(*)::integer FROM sq_user_activity ua WHERE ua.user_id = p.id AND ua.activity_type = 'daily_login' AND ua.created_at >= v_from_date) * 1
      )::numeric as t_score
    FROM colleges c
    LEFT JOIN profiles p ON p.college_id = c.id
    GROUP BY c.id
  ),
  ranked_colleges AS (
    SELECT 
      *,
      (CASE WHEN s_count > 0 THEN t_score / s_count ELSE 0 END)::numeric as a_score,
      dense_rank() OVER (ORDER BY (CASE WHEN s_count > 0 THEN t_score / s_count ELSE 0 END) DESC, c_name ASC)::integer as cur_rank
    FROM college_stats
  )
  SELECT 
    r.c_id,
    r.c_name,
    r.c_short_name,
    r.s_count,
    COALESCE(r.t_score, 0),
    COALESCE(r.a_score, 0),
    r.cur_rank,
    (s.college_rank - r.cur_rank)::integer as movement
  FROM ranked_colleges r
  LEFT JOIN sq_leaderboard_college_snapshots s ON s.college_id = r.c_id AND s.period = p_period AND s.snapshot_date = v_prev_snapshot_date
  ORDER BY r.a_score DESC, r.c_name ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 5. Helper to take snapshots (can be triggered by cron)
-- ====================================================================

CREATE OR REPLACE FUNCTION sq_take_leaderboard_snapshot(p_period text)
RETURNS void AS $$
BEGIN
  IF p_period = 'weekly' THEN
    INSERT INTO sq_leaderboard_snapshots (user_id, period, snapshot_date, global_rank, score)
    SELECT id, 'weekly', CURRENT_DATE, rank, score FROM sq_get_leaderboard('weekly', NULL, 1000)
    ON CONFLICT (user_id, period, snapshot_date) DO UPDATE SET global_rank = EXCLUDED.global_rank, score = EXCLUDED.score;
    
    INSERT INTO sq_leaderboard_college_snapshots (college_id, period, snapshot_date, college_rank, avg_score)
    SELECT id, 'weekly', CURRENT_DATE, rank, avg_score FROM sq_get_colleges_leaderboard('weekly', 100)
    ON CONFLICT (college_id, period, snapshot_date) DO UPDATE SET college_rank = EXCLUDED.college_rank, avg_score = EXCLUDED.avg_score;
  END IF;
  -- Add monthly if needed
END;
$$ LANGUAGE plpgsql;
