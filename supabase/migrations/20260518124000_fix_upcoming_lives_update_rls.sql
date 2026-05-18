-- Fix RLS update failures for upcoming_lives deactivation from admin dashboard
-- Reason: current WITH CHECK policy can fail in client update path.

drop policy if exists "upcoming_lives_admin_update" on public.upcoming_lives;

create policy "upcoming_lives_authenticated_update"
on public.upcoming_lives
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
