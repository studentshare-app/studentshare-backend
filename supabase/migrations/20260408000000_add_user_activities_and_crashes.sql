CREATE TABLE IF NOT EXISTS public.user_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crashes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    app_version TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Basic RLS policies (allow admins to view all, allow authenticated users to insert)
ALTER TABLE public.user_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crashes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all user activities" ON public.user_activities;
CREATE POLICY "Admins can view all user activities" ON public.user_activities
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Users can insert their own activities" ON public.user_activities;
CREATE POLICY "Users can insert their own activities" ON public.user_activities
  FOR INSERT WITH CHECK ( auth.uid() = user_id );

DROP POLICY IF EXISTS "Admins can view all crashes" ON public.crashes;
CREATE POLICY "Admins can view all crashes" ON public.crashes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Users can insert crashes" ON public.crashes;
CREATE POLICY "Users can insert crashes" ON public.crashes
  FOR INSERT WITH CHECK ( auth.uid() = user_id );
