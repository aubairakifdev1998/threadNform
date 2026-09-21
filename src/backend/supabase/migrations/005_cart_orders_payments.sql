-- Customers addresses, carts, shipping, orders, payments, returns

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  full_name text not null,
  line1 text not null,
  line2 text,
  city text not null,
  county text,
  postcode text not null,
  postcode_normalized text not null,
  country char(2) not null default 'GB' check (country = 'GB'),
  phone text,
  is_default_shipping boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_addresses_customer_idx
  on public.customer_addresses (customer_id);

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete cascade,
  guest_token_hash text unique,
  status public.cart_status not null default 'ACTIVE',
  currency char(3) not null default 'GBP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (customer_id is not null or guest_token_hash is not null)
);

create unique index if not exists carts_one_active_customer_idx
  on public.carts (customer_id)
  where customer_id is not null and status = 'ACTIVE';

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id),
  quantity int not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);

create table if not exists public.shipping_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_pence bigint not null check (price_pence >= 0),
  vat_rate_id uuid not null references public.vat_rates (id),
  eta_min_days int not null default 2,
  eta_max_days int not null default 5,
  is_active boolean not null default true,
  eligible_countries text[] not null default array['GB']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references public.customers (id),
  email text not null,
  phone text,
  status public.order_status not null default 'PENDING_PAYMENT',
  payment_status public.payment_status not null default 'PENDING',
  shipping_status public.shipping_status not null default 'NOT_SHIPPED',
  currency char(3) not null default 'GBP',
  subtotal_pence bigint not null check (subtotal_pence >= 0),
  discount_pence bigint not null default 0 check (discount_pence >= 0),
  net_pence bigint not null check (net_pence >= 0),
  vat_pence bigint not null check (vat_pence >= 0),
  shipping_pence bigint not null check (shipping_pence >= 0),
  grand_total_pence bigint not null check (grand_total_pence >= 0),
  shipping_method_snapshot jsonb not null default '{}'::jsonb,
  vat_snapshot jsonb not null default '{}'::jsonb,
  carrier text,
  tracking_number text,
  tracking_url text,
  cancellation_reason text,
  idempotency_key text unique,
  customer_note text,
  placed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_payment_status_idx on public.orders (payment_status);
create index if not exists orders_placed_at_idx on public.orders (placed_at desc);
create index if not exists orders_email_idx on public.orders (email);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  sku text not null,
  variant_label text,
  attributes_snapshot jsonb not null default '{}'::jsonb,
  unit_gross_pence bigint not null check (unit_gross_pence >= 0),
  quantity int not null check (quantity > 0),
  discount_pence bigint not null default 0,
  vat_rate_bps int not null,
  vat_pence bigint not null,
  net_pence bigint not null,
  line_gross_pence bigint not null
);

create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.order_addresses (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  type public.address_type not null,
  full_name text not null,
  line1 text not null,
  line2 text,
  city text not null,
  county text,
  postcode text not null,
  postcode_normalized text not null,
  country char(2) not null default 'GB',
  phone text,
  unique (order_id, type)
);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_type public.actor_type not null,
  actor_id uuid,
  note text,
  visibility public.timeline_visibility not null default 'CUSTOMER',
  created_at timestamptz not null default now()
);

create index if not exists order_status_history_order_idx
  on public.order_status_history (order_id, created_at);

create table if not exists public.payment_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_name text not null,
  sort_code text not null,
  account_number text not null,
  iban text,
  reference_instructions text not null default 'Use your order number as the payment reference.',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete restrict,
  method public.payment_method not null default 'BANK_TRANSFER',
  status public.payment_status not null default 'PENDING',
  amount_due_pence bigint not null,
  amount_claimed_pence bigint,
  currency char(3) not null default 'GBP',
  bank_account_snapshot jsonb not null default '{}'::jsonb,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  storage_path text not null,
  mime text not null,
  size_bytes int not null,
  amount_claimed_pence bigint,
  customer_reference text,
  customer_note text,
  status public.proof_status not null default 'UPLOADED',
  reviewed_by uuid references public.admin_users (id),
  reviewed_at timestamptz,
  rejection_reason text,
  uploaded_at timestamptz not null default now()
);

create index if not exists payment_proofs_payment_idx
  on public.payment_proofs (payment_id, uploaded_at desc);

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  status public.return_status not null default 'REQUESTED',
  reason text,
  customer_note text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_request_id uuid not null references public.return_requests (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id),
  quantity int not null check (quantity > 0),
  reason text
);

insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

alter table public.customer_addresses enable row level security;
alter table public.carts enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.payment_proofs enable row level security;
