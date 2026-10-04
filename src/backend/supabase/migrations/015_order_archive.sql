-- Soft-archive orders for a date period so they drop out of admin/customer lists
-- without hard-deleting financial history.
alter table public.orders
  add column if not exists archived_at timestamptz;

create index if not exists orders_archived_at_idx
  on public.orders (archived_at)
  where archived_at is null;

create index if not exists orders_placed_archived_idx
  on public.orders (placed_at desc)
  where archived_at is null;
