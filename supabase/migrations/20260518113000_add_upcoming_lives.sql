create extension if not exists pgcrypto;

create table if not exists public.upcoming_lives (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  youtube_url text null,
  youtube_video_id text null,
  starts_at timestamptz not null,
  tutor text null,
  subject text null,
  thumbnail_url text null,
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint upcoming_lives_source_check check (youtube_url is not null or youtube_video_id is not null)
);

create index if not exists idx_upcoming_lives_starts_at on public.upcoming_lives(starts_at);
create index if not exists idx_upcoming_lives_active_starts_at on public.upcoming_lives(is_active, starts_at);

alter table public.upcoming_lives enable row level security;

create policy "upcoming_lives_select_authenticated"
on public.upcoming_lives
for select
to authenticated
using (is_active = true);

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
