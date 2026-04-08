-- Migration: Add class_id and college_id to materials for isolation
-- Version: 20260408000002
-- Description: Denormalizes class and college IDs into the materials table to improve sync performance and enforce strict data isolation.

-- 1. Add Columns
ALTER TABLE materials ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES classes(id) ON DELETE CASCADE;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS college_id uuid REFERENCES colleges(id) ON DELETE CASCADE;

-- 2. Backfill existing data
UPDATE materials m
SET 
  class_id = c.class_id,
  college_id = cl.college_id
FROM courses c
JOIN classes cl ON c.class_id = cl.id
WHERE m.course_id = c.id;

-- 3. Make columns NOT NULL after backfill (optional, but safer)
-- ALTER TABLE materials ALTER COLUMN class_id SET NOT NULL;
-- ALTER TABLE materials ALTER COLUMN college_id SET NOT NULL;

-- 4. Create Indexes for Sync Performance
CREATE INDEX IF NOT EXISTS materials_class_id_idx ON materials(class_id);
CREATE INDEX IF NOT EXISTS materials_college_id_idx ON materials(college_id);

-- 5. Update RLS Policies
-- Drop old permissive policies
DROP POLICY IF EXISTS materials_course ON materials;
DROP POLICY IF EXISTS materials_public ON materials;

-- Create new restrictive policies
-- Students can only see materials for their own class
CREATE POLICY "Users can only see materials in their class"
  ON materials FOR SELECT
  USING (
    class_id = (SELECT class_id FROM profiles WHERE id = auth.uid())
    OR 
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'lecturer')
  );

-- Admins and lecturers can manage materials
CREATE POLICY "Admins and lecturers can manage materials"
  ON materials FOR ALL
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'lecturer')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'lecturer')
  );

-- Keep the owner policy
DROP POLICY IF EXISTS materials_owner ON materials;
CREATE POLICY "Users manage own uploaded materials"
  ON materials FOR ALL
  USING (auth.uid() = profile_id OR auth.uid() = uploaded_by) -- Support both column names if they coexist
  WITH CHECK (auth.uid() = profile_id OR auth.uid() = uploaded_by);
