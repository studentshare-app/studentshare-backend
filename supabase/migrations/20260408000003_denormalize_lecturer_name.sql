-- Migration: Denormalize lecturer_name into materials table
-- Version: 20260408000003
-- Description: Adds lecturer_name to materials table and backfills existing data for better offline support.

-- 1. Add Column
ALTER TABLE materials ADD COLUMN IF NOT EXISTS lecturer_name text;

-- 2. Backfill existing data
UPDATE materials m
SET lecturer_name = l.name
FROM lecturers l
WHERE m.lecturer_id = l.id
AND m.lecturer_name IS NULL;

-- 3. Create Index for searching/filtering by lecturer name if needed
CREATE INDEX IF NOT EXISTS materials_lecturer_name_idx ON materials(lecturer_name);
