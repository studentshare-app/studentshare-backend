-- ─────────────────────────────────────────────────────────────────────────────
-- Past Questions Feature — Supabase Migration
-- Run this in Supabase SQL Editor (or save as a migration file)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add columns to existing materials table (idempotent)
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS time_limit_minutes integer DEFAULT 60,
  ADD COLUMN IF NOT EXISTS question_count     integer DEFAULT 0;

-- 2. Create pq_questions table
CREATE TABLE IF NOT EXISTS pq_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id     uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  question_no     integer NOT NULL,
  question_text   text NOT NULL,
  option_a        text,
  option_b        text,
  option_c        text,
  option_d        text,
  correct_option  text CHECK (correct_option IN ('a','b','c','d')),
  explanation     text,
  question_type   text NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq','theory')),
  marks           integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pq_questions_material_id_idx
  ON pq_questions (material_id, question_no);

-- 3. Create pq_results table
CREATE TABLE IF NOT EXISTS pq_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id     uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  score           integer NOT NULL,
  total_marks     integer NOT NULL,
  time_taken_s    integer NOT NULL,
  answers         jsonb,
  completed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pq_results_user_material_idx
  ON pq_results (user_id, material_id, score DESC);

-- 4. Row-Level Security
ALTER TABLE pq_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_pq_questions" ON pq_questions;
CREATE POLICY "read_pq_questions"
  ON pq_questions FOR SELECT USING (true);

-- Only admins (service role) can insert/update/delete questions
-- (handled from dashboard.html via service key)

ALTER TABLE pq_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_pq_results" ON pq_results;
CREATE POLICY "users_own_pq_results"
  ON pq_results FOR ALL USING (auth.uid() = user_id);

-- 5. Trigger to keep materials.question_count in sync
CREATE OR REPLACE FUNCTION sync_question_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE materials
  SET question_count = (
    SELECT COUNT(*) FROM pq_questions WHERE material_id = COALESCE(NEW.material_id, OLD.material_id)
  )
  WHERE id = COALESCE(NEW.material_id, OLD.material_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_question_count ON pq_questions;
CREATE TRIGGER trg_sync_question_count
  AFTER INSERT OR UPDATE OR DELETE ON pq_questions
  FOR EACH ROW EXECUTE FUNCTION sync_question_count();
