-- college_notices
CREATE TABLE public.college_notices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_college_notices_college_id ON public.college_notices(college_id);

-- college_events
CREATE TABLE public.college_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    location TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_college_events_college_id ON public.college_events(college_id);

-- college_clubs
CREATE TABLE public.college_clubs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_college_clubs_college_id ON public.college_clubs(college_id);

-- college_spotlights
CREATE TABLE public.college_spotlights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    quote TEXT NOT NULL,
    author TEXT NOT NULL,
    role TEXT NOT NULL,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_college_spotlights_college_id ON public.college_spotlights(college_id);

-- Enable RLS and setup policies
ALTER TABLE public.college_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.college_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.college_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.college_spotlights ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "Public read access for college notices" ON public.college_notices FOR SELECT USING (true);
CREATE POLICY "Public read access for college events" ON public.college_events FOR SELECT USING (true);
CREATE POLICY "Public read access for college clubs" ON public.college_clubs FOR SELECT USING (true);
CREATE POLICY "Public read access for college spotlights" ON public.college_spotlights FOR SELECT USING (true);

-- Only admins/role based logic can insert/update/delete. Since we use service_role key largely in admin we can leave open internally or add admin policies if the app requires. 
-- Assuming previous migrations just rely on service_role for inserts or open auth. We will add service_role bypass or open admin.
CREATE POLICY "All access for authenticated admin" ON public.college_notices FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "All access for authenticated admin" ON public.college_events FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "All access for authenticated admin" ON public.college_clubs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "All access for authenticated admin" ON public.college_spotlights FOR ALL USING (auth.role() = 'authenticated');
