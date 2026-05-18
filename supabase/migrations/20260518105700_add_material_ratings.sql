
-- Create material_ratings table
CREATE TABLE IF NOT EXISTS public.material_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(material_id, user_id)
);

-- Enable RLS
ALTER TABLE public.material_ratings ENABLE ROW LEVEL SECURITY;

-- Policies for material_ratings
CREATE POLICY "Everyone can view material ratings" ON public.material_ratings FOR SELECT USING (true);
CREATE POLICY "Users can insert their own ratings" ON public.material_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own ratings" ON public.material_ratings FOR UPDATE USING (auth.uid() = user_id);

-- Add rating aggregates to materials table
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2) DEFAULT 0.00;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;

-- Function to recalculate rating
CREATE OR REPLACE FUNCTION public.recalculate_material_rating()
RETURNS TRIGGER AS $DO$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        UPDATE public.materials
        SET 
            average_rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM public.material_ratings WHERE material_id = OLD.material_id), 0.00),
            rating_count = (SELECT COUNT(*) FROM public.material_ratings WHERE material_id = OLD.material_id)
        WHERE id = OLD.material_id;
        RETURN OLD;
    ELSE
        UPDATE public.materials
        SET 
            average_rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM public.material_ratings WHERE material_id = NEW.material_id), 0.00),
            rating_count = (SELECT COUNT(*) FROM public.material_ratings WHERE material_id = NEW.material_id)
        WHERE id = NEW.material_id;
        RETURN NEW;
    END IF;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for inserts, updates, and deletes
DROP TRIGGER IF EXISTS on_rating_change ON public.material_ratings;
CREATE TRIGGER on_rating_change
AFTER INSERT OR UPDATE OR DELETE ON public.material_ratings
FOR EACH ROW EXECUTE FUNCTION public.recalculate_material_rating();
