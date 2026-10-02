-- Partial shipments, partial refunds, and a transactional email outbox.
--
-- * order_items gain shipped / cancelled / returned counters.
-- * shipments(+items) record each parcel; refunds(+items) record each refund.
-- * orders.refunded_pence tracks money returned (never above the total).
-- * notification_outbox stores customer emails in the same transaction as
--   the change that caused them; the API sends after commit and the cron
--   retries anything not yet delivered.
--
-- Safe to re-run. New enum values are added but not used in this file
-- (Postgres forbids using a value added in the same transaction).

alter type public.order_status add value if not exists 'PARTIALLY_SHIPPED' after 'PACKED';
alter type public.payment_status add value if not exists 'PARTIALLY_REFUNDED' after 'VERIFIED';
alter type public.shipping_status add value if not exists 'PARTIALLY_SHIPPED' after 'READY_TO_SHIP';

alter table public.order_items
  add column if not exists quantity_shipped int not null default 0,
  add column if not exists quantity_cancelled int not null default 0,
  add column if not exists quantity_returned int not null default 0;

alter table public.orders
  add column if not exists refunded_pence bigint not null default 0;

-- Backfill counters for orders placed before this migration.
update public.order_items oi
set quantity_shipped = oi.quantity
from public.orders o
where o.id = oi.order_id
  and o.status::text in ('SHIPPED', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED')
  and oi.quantity_shipped = 0;

update public.order_items oi
set quantity_returned = oi.quantity
from public.orders o
where o.id = oi.order_id
  and o.status::text in ('RETURNED', 'REFUNDED')
  and oi.quantity_returned = 0;

update public.order_items oi
set quantity_cancelled = oi.quantity
from public.orders o
where o.id = oi.order_id
  and o.status::text = 'CANCELLED'
  and oi.quantity_shipped = 0
  and oi.quantity_cancelled = 0;

update public.orders o
set refunded_pence = o.grand_total_pence
from public.payments p
where p.order_id = o.id
  and p.status::text = 'REFUNDED'
  and o.refunded_pence = 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_fulfilment_qty_chk') then
    alter table public.order_items add constraint order_items_fulfilment_qty_chk check (
      quantity_shipped >= 0 and quantity_cancelled >= 0 and quantity_returned >= 0
      and quantity_shipped + quantity_cancelled <= quantity
      and quantity_returned <= quantity_shipped
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_refunded_pence_chk') then
    alter table public.orders add constraint orders_refunded_pence_chk
      check (refunded_pence >= 0 and refunded_pence <= grand_total_pence);
  end if;
end;
$$;

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  carrier text,
  tracking_number text,
  tracking_url text,
  note text,
  created_by uuid,
  shipped_at timestamptz not null default now()
);
create index if not exists shipments_order_idx on public.shipments (order_id, shipped_at);

create table if not exists public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete restrict,
  quantity int not null check (quantity > 0)
);
create index if not exists shipment_items_shipment_idx on public.shipment_items (shipment_id);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  amount_pence bigint not null check (amount_pence > 0),
  reason text not null,
  reference text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists refunds_order_idx on public.refunds (order_id, created_at);

create table if not exists public.refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.refunds (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete restrict,
  quantity_cancelled int not null default 0 check (quantity_cancelled >= 0),
  quantity_returned int not null default 0 check (quantity_returned >= 0),
  restocked boolean not null default false,
  check (quantity_cancelled + quantity_returned > 0)
);
create index if not exists refund_items_refund_idx on public.refund_items (refund_id);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  recipient text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED')),
  attempts int not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_outbox_due_idx
  on public.notification_outbox (next_attempt_at)
  where status = 'PENDING';

alter table public.shipments enable row level security;
alter table public.shipment_items enable row level security;
alter table public.refunds enable row level security;
alter table public.refund_items enable row level security;
alter table public.notification_outbox enable row level security;
