-- Homescreen Sync Tables: deadlines, planner_blocks, planner_tasks
-- Version: 20260408000001
-- Description: Ensures tables exist for cross-device sync of deadlines and study planner.

-- =====================================
-- 1. DEADLINES
-- =====================================
CREATE TABLE IF NOT EXISTS deadlines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  course text NOT NULL DEFAULT 'General',
  due_date text NOT NULL,          -- ISO "YYYY-MM-DD"
  color text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE deadlines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own deadlines" ON deadlines;
CREATE POLICY "Users manage own deadlines"
  ON deadlines FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================================
-- 2. PLANNER BLOCKS
-- =====================================
CREATE TABLE IF NOT EXISTS planner_blocks (
  id text PRIMARY KEY,             -- Use client-side ID for offline compatibility
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  type text NOT NULL,
  date text NOT NULL,              -- ISO "YYYY-MM-DD"
  start_time text NOT NULL,        -- "HH:MM"
  end_time text NOT NULL,          -- "HH:MM"
  color text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at text,               -- ISO "YYYY-MM-DD"
  created_at timestamptz DEFAULT now()
);

ALTER TABLE planner_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own blocks" ON planner_blocks;
CREATE POLICY "Users manage own blocks"
  ON planner_blocks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================================
-- 3. PLANNER TASKS
-- =====================================
CREATE TABLE IF NOT EXISTS planner_tasks (
  id text PRIMARY KEY,             -- Use client-side ID
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  course text NOT NULL DEFAULT 'General',
  due_date text NOT NULL,          -- ISO "YYYY-MM-DD"
  done boolean NOT NULL DEFAULT false,
  completed_at text,               -- ISO "YYYY-MM-DD"
  color text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE planner_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own tasks" ON planner_tasks;
CREATE POLICY "Users manage own tasks"
  ON planner_tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================================
-- 4. PROFILES EXTENSIONS
-- =====================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS study_goals jsonb DEFAULT '{"weekly_hours": 25, "weekly_tasks": 10, "daily_pomodoros": 4, "streak_target": 7}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS college_rank integer; -- Optional cache for leaderboard rank
