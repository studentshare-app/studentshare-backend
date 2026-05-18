-- Hard reset RLS policies for upcoming_lives
-- Use this if existing policies are conflicting and blocking End Live updates.

alter table public.upcoming_lives enable row level security;

drop policy if exists "upcoming_lives_select_authenticated" on public.upcoming_lives;
drop policy if exists "upcoming_lives_admin_insert" on public.upcoming_lives;
drop policy if exists "upcoming_lives_admin_update" on public.upcoming_lives;
drop policy if exists "upcoming_lives_authenticated_update" on public.upcoming_lives;
drop policy if exists "upcoming_lives_admin_delete" on public.upcoming_lives;

create policy "upcoming_lives_select_authenticated"
on public.upcoming_lives
for select
to authenticated
using (is_active = true OR exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
));

create policy "upcoming_lives_admin_insert"
on public.upcoming_lives
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.role, '') in ('admin', 'lecturer')
  )
);

create policy "upcoming_lives_admin_update"
on public.upcoming_lives
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.role, '') in ('admin', 'lecturer')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.role, '') in ('admin', 'lecturer')
  )
);

create policy "upcoming_lives_admin_delete"
on public.upcoming_lives
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.role, '') in ('admin', 'lecturer')
  )
);
