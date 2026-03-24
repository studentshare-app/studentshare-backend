-- Add missing columns to existing materials table for contributors feature
-- Run this in Supabase SQL Editor

-- Add columns needed for the contribute/contributors functionality
ALTER TABLE materials
ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS download_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS materials_profile_idx ON materials(profile_id);
CREATE INDEX IF NOT EXISTS materials_public_idx ON materials(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS materials_downloads_idx ON materials(download_count DESC);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_materials_updated_at ON materials;
CREATE TRIGGER update_materials_updated_at BEFORE UPDATE
  ON materials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update existing materials to have profile_id if they don't have one
-- This assumes materials were uploaded by authenticated users
-- You may need to adjust this based on your data

SELECT '✅ Materials table updated for contributors feature!' AS status;