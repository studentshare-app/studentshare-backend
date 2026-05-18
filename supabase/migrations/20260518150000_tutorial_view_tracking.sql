create table if not exists public.tutorial_view_events (
  id uuid primary key default gen_random_uuid(),
  tutorial_id text not null,
  user_id uuid null references auth.users(id) on delete set null,
  source text not null,
  watched_seconds int not null default 0,
  watch_ratio numeric(5,2) null,
  viewed_at timestamptz not null default now()
);

create index if not exists idx_tutorial_view_events_tutorial_id on public.tutorial_view_events(tutorial_id);
create index if not exists idx_tutorial_view_events_user_tutorial_time on public.tutorial_view_events(user_id, tutorial_id, viewed_at desc);

create table if not exists public.tutorial_view_counts (
  tutorial_id text primary key,
  total_views int not null default 0,
  unique_viewers int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.tutorial_view_events enable row level security;
alter table public.tutorial_view_counts enable row level security;

drop policy if exists "tutorial_view_events_insert_authenticated" on public.tutorial_view_events;
create policy "tutorial_view_events_insert_authenticated"
on public.tutorial_view_events
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "tutorial_view_events_select_own" on public.tutorial_view_events;
create policy "tutorial_view_events_select_own"
on public.tutorial_view_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "tutorial_view_counts_select_authenticated" on public.tutorial_view_counts;
create policy "tutorial_view_counts_select_authenticated"
on public.tutorial_view_counts
for select
to authenticated
using (true);

create or replace function public.track_tutorial_view(
  p_tutorial_id text,
  p_source text,
  p_watched_seconds int default 0,
  p_watch_ratio numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_last_view timestamptz;
  v_unique_count int;
begin
  if v_user_id is null then
    return jsonb_build_object('tracked', false, 'reason', 'unauthenticated');
  end if;

  if p_tutorial_id is null or length(trim(p_tutorial_id)) = 0 then
    return jsonb_build_object('tracked', false, 'reason', 'missing_tutorial_id');
  end if;

  select viewed_at
  into v_last_view
  from public.tutorial_view_events
  where user_id = v_user_id
    and tutorial_id = p_tutorial_id
  order by viewed_at desc
  limit 1;

  if v_last_view is not null and v_last_view > now() - interval '30 minutes' then
    return jsonb_build_object('tracked', false, 'reason', 'deduped');
  end if;

  insert into public.tutorial_view_events(
    tutorial_id,
    user_id,
    source,
    watched_seconds,
    watch_ratio,
    viewed_at
  )
  values (
    p_tutorial_id,
    v_user_id,
    coalesce(nullif(trim(p_source), ''), 'recorded'),
    greatest(coalesce(p_watched_seconds, 0), 0),
    p_watch_ratio,
    now()
  );

  select count(distinct user_id)::int
  into v_unique_count
  from public.tutorial_view_events
  where tutorial_id = p_tutorial_id;

  insert into public.tutorial_view_counts(tutorial_id, total_views, unique_viewers, updated_at)
  values (p_tutorial_id, 1, v_unique_count, now())
  on conflict (tutorial_id)
  do update set
    total_views = public.tutorial_view_counts.total_views + 1,
    unique_viewers = v_unique_count,
    updated_at = now();

  return jsonb_build_object('tracked', true, 'tutorial_id', p_tutorial_id);
end;
$$;

grant execute on function public.track_tutorial_view(text, text, int, numeric) to authenticated;
