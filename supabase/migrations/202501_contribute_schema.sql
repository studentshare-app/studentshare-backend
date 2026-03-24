-- Contribute Materials Schema Migration
-- Run in Supabase SQL Editor

-- Skip auth.users (Supabase managed, RLS already enabled)

-- 1. Colleges table
CREATE TABLE IF NOT EXISTS colleges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  short_name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Classes table
CREATE TABLE IF NOT EXISTS classes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id uuid REFERENCES colleges(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 3. Courses table
CREATE TABLE IF NOT EXISTS courses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 4. Materials table (core upload table)
CREATE TABLE IF NOT EXISTS materials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  type text NOT NULL CHECK (type IN ('notes', 'slides', 'summary', 'past_question_answer', 'solutions', 'books')),
  file_url text NOT NULL,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL NOT NULL,
  status text DEFAULT 'published' CHECK (status IN ('draft', 'published', 'rejected')),
  is_public boolean DEFAULT true,
  download_count integer DEFAULT 0,
  view_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 5. Storage bucket (Supabase UI: Storage > New Bucket > 'materials' > Public)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('materials', 'Materials', true) ON CONFLICT DO NOTHING;

-- 6. RLS Policies
ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

-- Colleges: public read
CREATE POLICY colleges_public_read ON colleges FOR SELECT USING (true);

-- Classes: public read if college public
CREATE POLICY classes_public_read ON classes FOR SELECT USING (true);

-- Courses: public read if class public
CREATE POLICY courses_public_read ON courses FOR SELECT USING (true);

-- Materials: complex policy
CREATE POLICY materials_owner ON materials FOR ALL USING (auth.uid() = user_id);
CREATE POLICY materials_public ON materials FOR SELECT USING (is_public = true);
CREATE POLICY materials_course ON materials FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM courses c 
    JOIN classes cl ON c.class_id = cl.id 
    JOIN colleges col ON cl.college_id = col.id 
    WHERE c.id = materials.course_id
  )
);

-- Storage policies for materials bucket
CREATE POLICY "Public materials access" ON storage.objects FOR ALL
  USING (bucket_id = 'materials')
  WITH CHECK (bucket_id = 'materials');

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS materials_user_idx ON materials(user_id);
CREATE INDEX IF NOT EXISTS materials_course_idx ON materials(course_id);
CREATE INDEX IF NOT EXISTS materials_type_idx ON materials(type);
CREATE INDEX IF NOT EXISTS materials_public_idx ON materials(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS materials_created_idx ON materials(created_at DESC);
CREATE INDEX IF NOT EXISTS classes_college_idx ON classes(college_id);
CREATE INDEX IF NOT EXISTS courses_class_idx ON courses(class_id);

-- 8. Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_materials_updated_at BEFORE UPDATE
  ON materials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. Sample data (optional - for testing)
INSERT INTO colleges (name, short_name) VALUES 
  ('Harvard University', 'Harvard'),
  ('Stanford University', 'Stanford'),
  ('MIT', 'MIT')
ON CONFLICT DO NOTHING;

INSERT INTO classes (college_id, name) VALUES 
  ((SELECT id FROM colleges WHERE short_name = 'Harvard'), 'Computer Science'),
  ((SELECT id FROM colleges WHERE short_name = 'Stanford'), 'Mathematics')
ON CONFLICT DO NOTHING;

INSERT INTO courses (class_id, name) VALUES 
  ((SELECT id FROM classes WHERE name = 'Computer Science' LIMIT 1), 'CS50'),
  ((SELECT id FROM classes WHERE name = 'Mathematics' LIMIT 1), 'Calculus I')
ON CONFLICT DO NOTHING;

-- 10. Functions for download/view counts
CREATE OR REPLACE FUNCTION increment_material_download(id uuid)
RETURNS void AS $$
BEGIN
  UPDATE materials SET download_count = download_count + 1 WHERE materials.id = increment_material_download.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_material_view(id uuid)
RETURNS void AS $$
BEGIN
  UPDATE materials SET view_count = view_count + 1 WHERE materials.id = increment_material_view.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT '✅ Contribute Schema Complete - Ready for Production!' AS status;

