-- Add article support to college_pages table for dashboard article designer
ALTER TABLE college_pages 
ADD COLUMN IF NOT EXISTS page_type text DEFAULT 'custom' CHECK (page_type IN ('custom', 'article')),
ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS article_order integer DEFAULT 999;

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_college_pages_articles ON college_pages (college_id, page_type, article_order, is_featured) WHERE page_type = 'article';

-- Mark existing pages as 'custom' type (safe, non-destructive)
UPDATE college_pages SET page_type = 'custom' WHERE page_type IS NULL OR page_type NOT IN ('custom', 'article');

COMMENT ON COLUMN college_pages.page_type IS 'custom = Web Builder pages, article = Admin articles';

