alter table public.upcoming_lives
  add column if not exists live_type text,
  add column if not exists host_type text;

update public.upcoming_lives
set live_type = coalesce(live_type, 'academic_class'),
    host_type = coalesce(host_type, 'lecturer')
where live_type is null or host_type is null;
