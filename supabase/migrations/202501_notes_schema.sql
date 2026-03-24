-- Notes Table Migration
-- Run in Supabase SQL Editor

-- 1. Create notes table
CREATE TABLE IF NOT EXISTS notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  color text DEFAULT '#FF7B7B',
  is_starred boolean DEFAULT false,
  source text DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  is_deleted boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Enable RLS
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
CREATE POLICY notes_owner ON notes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY notes_owner_select ON notes FOR SELECT USING (auth.uid() = user_id);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS notes_user_idx ON notes(user_id);
CREATE INDEX IF NOT EXISTS notes_course_idx ON notes(course_id);
CREATE INDEX IF NOT EXISTS notes_deleted_idx ON notes(is_deleted) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS notes_created_idx ON notes(created_at DESC);

-- 5. Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE
  ON notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

SELECT '✅ Notes table created successfully!' AS status;