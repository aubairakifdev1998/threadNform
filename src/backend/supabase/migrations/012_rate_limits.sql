-- Fixed-window rate limiting shared by every API instance (Vercel functions
-- do not share memory). One row per (key, window); the API calls
-- hit_rate_limit() once per guarded request. Old windows are purged by the
-- housekeeping cron. Safe to re-run.

create table if not exists public.rate_limit_buckets (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);

create index if not exists rate_limit_buckets_window_idx
  on public.rate_limit_buckets (window_start);

alter table public.rate_limit_buckets enable row level security;

-- Records one hit and reports whether it is within p_max for the window.
create or replace function public.hit_rate_limit(
  p_key text,
  p_window_seconds int,
  p_max int
) returns table (allowed boolean, hits int, retry_after_seconds int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits int;
begin
  if p_window_seconds <= 0 or p_max <= 0 then
    raise exception 'Invalid rate limit parameters';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_buckets as b (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = b.hits + 1
  returning b.hits into v_hits;

  return query select
    v_hits <= p_max,
    v_hits,
    greatest(
      1,
      ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now())))::int
    );
end;
$$;

create or replace function public.purge_rate_limit_buckets(p_older_than interval)
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.rate_limit_buckets
    where window_start < now() - p_older_than
    returning 1
  )
  select count(*)::int from deleted;
$$;
