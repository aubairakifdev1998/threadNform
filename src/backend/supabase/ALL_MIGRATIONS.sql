-- Fareya combined migrations — paste into Supabase SQL Editor and Run
-- Generated from supabase/migrations (in order). Prefer `npm run db:migrate`,
-- which records what is applied in public.schema_migrations.


-- ========== 001_products_and_storage.sql ==========
-- Fareya e-commerce: products table + RLS policies
-- Run in Supabase SQL Editor or via supabase db push

create extension if not exists "pgcrypto";

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  image_url text,
  stock integer not null default 0 check (stock >= 0),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_created_by_idx on public.products (created_by);
create index if not exists products_created_at_idx on public.products (created_at desc);

alter table public.products enable row level security;

-- Public read access for catalog browsing
create policy "products_select_public"
  on public.products
  for select
  using (true);

-- Authenticated users can insert their own products
create policy "products_insert_authenticated"
  on public.products
  for insert
  to authenticated
  with check (auth.uid() = created_by);

-- Owners can update their products
create policy "products_update_owner"
  on public.products
  for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- Owners can delete their products
create policy "products_delete_owner"
  on public.products
  for delete
  to authenticated
  using (auth.uid() = created_by);

-- Storage bucket setup (run once; adjust as needed)
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

create policy "products_storage_public_read"
  on storage.objects
  for select
  using (bucket_id = 'products');

create policy "products_storage_authenticated_upload"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'products');

create policy "products_storage_authenticated_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'products');

create policy "products_storage_authenticated_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'products');


-- ========== 002_commerce_foundation.sql ==========
-- Fareya commerce foundation: enums, identity profiles, audit, idempotency
create extension if not exists "pgcrypto";

do $$ begin
  create type public.admin_role as enum ('OWNER', 'ADMIN', 'STAFF');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_status as enum ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_type as enum ('SIMPLE', 'VARIABLE');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.attribute_role as enum ('VARIANT_DEFINING', 'INFORMATIONAL');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.inventory_movement_type as enum (
    'INITIAL_STOCK', 'PURCHASE', 'MANUAL_ADJUSTMENT',
    'ORDER_RESERVATION', 'ORDER_RELEASE', 'ORDER_FULFILLMENT',
    'RETURN', 'DAMAGE', 'LOSS', 'TRANSFER'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_status as enum (
    'PENDING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_UNDER_REVIEW',
    'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED',
    'CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum (
    'PENDING', 'PROOF_SUBMITTED', 'UNDER_REVIEW', 'VERIFIED',
    'REJECTED', 'REFUND_PENDING', 'REFUNDED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_method as enum ('BANK_TRANSFER');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.proof_status as enum (
    'UPLOADED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.cart_status as enum ('ACTIVE', 'CONVERTED', 'ABANDONED');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.media_type as enum ('IMAGE', 'VIDEO');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.shipping_status as enum (
    'NOT_SHIPPED', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.return_status as enum (
    'REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'RESTOCKED', 'REFUNDED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.address_type as enum ('SHIPPING', 'BILLING');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.actor_type as enum ('CUSTOMER', 'ADMIN', 'SYSTEM');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.timeline_visibility as enum ('CUSTOMER', 'ADMIN', 'INTERNAL');
exception when duplicate_object then null;
end $$;

create table if not exists public.admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.admin_role not null default 'STAFF',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  phone text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type public.actor_type not null,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);
create index if not exists audit_logs_created_idx
  on public.audit_logs (created_at desc);

create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  scope text not null,
  request_hash text,
  response_body jsonb,
  status_code int,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (key, scope)
);

create index if not exists idempotency_keys_expires_idx
  on public.idempotency_keys (expires_at);

create table if not exists public.order_number_sequences (
  year int primary key,
  last_value int not null default 0 check (last_value >= 0)
);

alter table public.admin_users enable row level security;
alter table public.customers enable row level security;
alter table public.audit_logs enable row level security;
alter table public.idempotency_keys enable row level security;


-- ========== 003_catalog.sql ==========
-- Catalog: taxonomy, attributes, products, variants, prices, media
-- Replaces prototype flat products table from 001

drop table if exists public.products cascade;

create table if not exists public.vat_rates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  rate_bps int not null check (rate_bps >= 0 and rate_bps <= 10000),
  is_default boolean not null default false,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id),
  parent_id uuid references public.categories (id),
  name text not null,
  slug text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, slug)
);

create index if not exists categories_parent_idx on public.categories (parent_id);
create index if not exists categories_department_idx on public.categories (department_id);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_path text,
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attributes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  input_type text not null default 'SELECT'
    check (input_type in ('SELECT', 'TEXT', 'NUMBER', 'BOOLEAN', 'COLOR', 'SIZE')),
  created_at timestamptz not null default now()
);

create table if not exists public.attribute_options (
  id uuid primary key default gen_random_uuid(),
  attribute_id uuid not null references public.attributes (id) on delete cascade,
  value text not null,
  label text not null,
  sort_order int not null default 0,
  unique (attribute_id, value)
);

create table if not exists public.colors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_normalized text not null unique,
  hex text,
  swatch_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.size_systems (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.size_system_values (
  id uuid primary key default gen_random_uuid(),
  size_system_id uuid not null references public.size_systems (id) on delete cascade,
  code text not null,
  label text not null,
  sort_order int not null default 0,
  unique (size_system_id, code)
);

create table if not exists public.size_charts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope_type text not null check (scope_type in ('PRODUCT', 'CATEGORY')),
  scope_id uuid not null,
  size_system_id uuid references public.size_systems (id),
  created_at timestamptz not null default now()
);

create table if not exists public.size_chart_rows (
  id uuid primary key default gen_random_uuid(),
  size_chart_id uuid not null references public.size_charts (id) on delete cascade,
  size_label text not null,
  measurements jsonb not null default '{}'::jsonb,
  sort_order int not null default 0
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  short_description text,
  product_type public.product_type not null default 'SIMPLE',
  department_id uuid references public.departments (id),
  category_id uuid references public.categories (id),
  subcategory_id uuid references public.categories (id),
  brand_id uuid references public.brands (id),
  status public.product_status not null default 'DRAFT',
  seo jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_status_category_idx
  on public.products (status, category_id);
create index if not exists products_brand_idx on public.products (brand_id);
create index if not exists products_name_idx on public.products using gin (to_tsvector('english', name));

create table if not exists public.product_collections (
  product_id uuid not null references public.products (id) on delete cascade,
  collection_id uuid not null references public.collections (id) on delete cascade,
  primary key (product_id, collection_id)
);

create table if not exists public.product_attributes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  attribute_id uuid not null references public.attributes (id),
  role public.attribute_role not null default 'INFORMATIONAL',
  unique (product_id, attribute_id)
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null unique,
  status public.product_status not null default 'ACTIVE',
  barcode text,
  option_fingerprint text not null,
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, option_fingerprint)
);

create index if not exists product_variants_product_idx on public.product_variants (product_id);

create table if not exists public.product_variant_options (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  attribute_id uuid not null references public.attributes (id),
  option_id uuid references public.attribute_options (id),
  color_id uuid references public.colors (id),
  size_value_id uuid references public.size_system_values (id),
  value_text text,
  unique (variant_id, attribute_id)
);

create table if not exists public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete cascade,
  currency char(3) not null default 'GBP' check (currency = 'GBP'),
  base_price_pence bigint not null check (base_price_pence >= 0),
  sale_price_pence bigint check (sale_price_pence is null or sale_price_pence >= 0),
  compare_at_pence bigint check (compare_at_pence is null or compare_at_pence >= 0),
  cost_pence bigint check (cost_pence is null or cost_pence >= 0),
  vat_rate_id uuid not null references public.vat_rates (id),
  vat_inclusive boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sale_price_pence is null or sale_price_pence <= base_price_pence)
);

create index if not exists product_prices_product_idx on public.product_prices (product_id);
create index if not exists product_prices_variant_idx on public.product_prices (variant_id);

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  type public.media_type not null default 'IMAGE',
  storage_path text not null,
  alt_text text,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

create index if not exists product_media_product_idx on public.product_media (product_id);

alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.departments enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.collections enable row level security;

create policy products_public_read_active on public.products
  for select using (status = 'ACTIVE');
create policy variants_public_read_active on public.product_variants
  for select using (status = 'ACTIVE');
create policy departments_public_read on public.departments
  for select using (is_active = true);
create policy categories_public_read on public.categories
  for select using (is_active = true);
create policy brands_public_read on public.brands
  for select using (status = 'ACTIVE');
create policy collections_public_read on public.collections
  for select using (status = 'ACTIVE');


-- ========== 004_inventory.sql ==========
-- Warehouses, inventory items, immutable movements

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  address jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists warehouses_one_default_idx
  on public.warehouses (is_default)
  where is_default = true;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id),
  variant_id uuid not null references public.product_variants (id),
  on_hand int not null default 0,
  reserved int not null default 0,
  updated_at timestamptz not null default now(),
  unique (warehouse_id, variant_id),
  check (on_hand >= 0),
  check (reserved >= 0),
  check (reserved <= on_hand)
);

create index if not exists inventory_items_variant_idx
  on public.inventory_items (variant_id);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id),
  variant_id uuid not null references public.product_variants (id),
  quantity_delta int not null,
  movement_type public.inventory_movement_type not null,
  reference_type text,
  reference_id uuid,
  previous_on_hand int not null,
  new_on_hand int not null,
  previous_reserved int not null,
  new_reserved int not null,
  actor_type public.actor_type not null default 'SYSTEM',
  actor_id uuid,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_variant_created_idx
  on public.inventory_movements (variant_id, created_at desc);
create index if not exists inventory_movements_reference_idx
  on public.inventory_movements (reference_type, reference_id);

alter table public.warehouses enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;


-- ========== 005_cart_orders_payments.sql ==========
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


-- ========== 006_commerce_rpcs.sql ==========
-- Atomic inventory + order number RPCs (called via supabase.rpc)

create or replace function public.allocate_order_number(p_year int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  insert into public.order_number_sequences (year, last_value)
  values (p_year, 1)
  on conflict (year) do update
    set last_value = public.order_number_sequences.last_value + 1
  returning last_value into v_next;

  return 'ORD-' || p_year::text || '-' || lpad(v_next::text, 6, '0');
end;
$$;

create or replace function public.ensure_inventory_item(
  p_warehouse_id uuid,
  p_variant_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  if v_id is null then
    insert into public.inventory_items (warehouse_id, variant_id, on_hand, reserved)
    values (p_warehouse_id, p_variant_id, 0, 0)
    returning id into v_id;

    select id into v_id
    from public.inventory_items
    where id = v_id
    for update;
  end if;

  return v_id;
end;
$$;

create or replace function public.reserve_inventory(
  p_warehouse_id uuid,
  p_variant_id uuid,
  p_qty int,
  p_reference_type text,
  p_reference_id uuid,
  p_actor_type public.actor_type default 'SYSTEM',
  p_actor_id uuid default null,
  p_reason text default null
) returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_available int;
begin
  if p_qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  perform public.ensure_inventory_item(p_warehouse_id, p_variant_id);

  select * into v_item
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  v_available := v_item.on_hand - v_item.reserved;
  if v_available < p_qty then
    raise exception 'INSUFFICIENT_STOCK: available %, requested %', v_available, p_qty;
  end if;

  update public.inventory_items
  set reserved = reserved + p_qty, updated_at = now()
  where id = v_item.id
  returning * into v_item;

  insert into public.inventory_movements (
    warehouse_id, variant_id, quantity_delta, movement_type,
    reference_type, reference_id,
    previous_on_hand, new_on_hand, previous_reserved, new_reserved,
    actor_type, actor_id, reason
  ) values (
    p_warehouse_id, p_variant_id, p_qty, 'ORDER_RESERVATION',
    p_reference_type, p_reference_id,
    v_item.on_hand, v_item.on_hand, v_item.reserved - p_qty, v_item.reserved,
    p_actor_type, p_actor_id, p_reason
  );

  return v_item;
end;
$$;

create or replace function public.release_inventory(
  p_warehouse_id uuid,
  p_variant_id uuid,
  p_qty int,
  p_reference_type text,
  p_reference_id uuid,
  p_actor_type public.actor_type default 'SYSTEM',
  p_actor_id uuid default null,
  p_reason text default null
) returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
begin
  if p_qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select * into v_item
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  if v_item is null then
    raise exception 'Inventory item not found';
  end if;

  if v_item.reserved < p_qty then
    raise exception 'Cannot release more than reserved';
  end if;

  update public.inventory_items
  set reserved = reserved - p_qty, updated_at = now()
  where id = v_item.id
  returning * into v_item;

  insert into public.inventory_movements (
    warehouse_id, variant_id, quantity_delta, movement_type,
    reference_type, reference_id,
    previous_on_hand, new_on_hand, previous_reserved, new_reserved,
    actor_type, actor_id, reason
  ) values (
    p_warehouse_id, p_variant_id, -p_qty, 'ORDER_RELEASE',
    p_reference_type, p_reference_id,
    v_item.on_hand, v_item.on_hand, v_item.reserved + p_qty, v_item.reserved,
    p_actor_type, p_actor_id, p_reason
  );

  return v_item;
end;
$$;

create or replace function public.fulfill_inventory(
  p_warehouse_id uuid,
  p_variant_id uuid,
  p_qty int,
  p_reference_type text,
  p_reference_id uuid,
  p_actor_type public.actor_type default 'SYSTEM',
  p_actor_id uuid default null,
  p_reason text default null
) returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_prev_on_hand int;
  v_prev_reserved int;
begin
  if p_qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select * into v_item
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  if v_item is null then
    raise exception 'Inventory item not found';
  end if;

  if v_item.reserved < p_qty or v_item.on_hand < p_qty then
    raise exception 'Cannot fulfill: insufficient on_hand/reserved';
  end if;

  v_prev_on_hand := v_item.on_hand;
  v_prev_reserved := v_item.reserved;

  update public.inventory_items
  set on_hand = on_hand - p_qty,
      reserved = reserved - p_qty,
      updated_at = now()
  where id = v_item.id
  returning * into v_item;

  insert into public.inventory_movements (
    warehouse_id, variant_id, quantity_delta, movement_type,
    reference_type, reference_id,
    previous_on_hand, new_on_hand, previous_reserved, new_reserved,
    actor_type, actor_id, reason
  ) values (
    p_warehouse_id, p_variant_id, -p_qty, 'ORDER_FULFILLMENT',
    p_reference_type, p_reference_id,
    v_prev_on_hand, v_item.on_hand, v_prev_reserved, v_item.reserved,
    p_actor_type, p_actor_id, p_reason
  );

  return v_item;
end;
$$;

create or replace function public.adjust_inventory(
  p_warehouse_id uuid,
  p_variant_id uuid,
  p_on_hand_delta int,
  p_movement_type public.inventory_movement_type,
  p_actor_type public.actor_type default 'ADMIN',
  p_actor_id uuid default null,
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null
) returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_prev_on_hand int;
  v_new_on_hand int;
begin
  perform public.ensure_inventory_item(p_warehouse_id, p_variant_id);

  select * into v_item
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  v_prev_on_hand := v_item.on_hand;
  v_new_on_hand := v_prev_on_hand + p_on_hand_delta;

  if v_new_on_hand < v_item.reserved then
    raise exception 'Adjustment would make on_hand < reserved';
  end if;
  if v_new_on_hand < 0 then
    raise exception 'Adjustment would make on_hand negative';
  end if;

  update public.inventory_items
  set on_hand = v_new_on_hand, updated_at = now()
  where id = v_item.id
  returning * into v_item;

  insert into public.inventory_movements (
    warehouse_id, variant_id, quantity_delta, movement_type,
    reference_type, reference_id,
    previous_on_hand, new_on_hand, previous_reserved, new_reserved,
    actor_type, actor_id, reason
  ) values (
    p_warehouse_id, p_variant_id, p_on_hand_delta, p_movement_type,
    p_reference_type, p_reference_id,
    v_prev_on_hand, v_item.on_hand, v_item.reserved, v_item.reserved,
    p_actor_type, p_actor_id, p_reason
  );

  return v_item;
end;
$$;


-- ========== 007_seed_uk.sql ==========
-- UK fashion seed data

insert into public.vat_rates (code, name, rate_bps, is_default)
values ('UK_STANDARD', 'UK Standard VAT', 2000, true)
on conflict (code) do nothing;

insert into public.warehouses (code, name, is_active, is_default)
values ('UK-MAIN', 'UK Main Warehouse', true, true)
on conflict (code) do nothing;

insert into public.departments (name, slug, sort_order)
values
  ('Men', 'men', 1),
  ('Women', 'women', 2),
  ('Unisex', 'unisex', 3),
  ('Kids', 'kids', 4)
on conflict (slug) do nothing;

insert into public.size_systems (code, name)
values
  ('CLOTHING_ALPHA', 'Clothing (XS–XXL)'),
  ('UK_SHOE', 'UK Shoe Sizes')
on conflict (code) do nothing;

insert into public.size_system_values (size_system_id, code, label, sort_order)
select s.id, v.code, v.label, v.sort_order
from public.size_systems s
join (values
  ('XS', 'XS', 1), ('S', 'S', 2), ('M', 'M', 3),
  ('L', 'L', 4), ('XL', 'XL', 5), ('XXL', 'XXL', 6)
) as v(code, label, sort_order) on true
where s.code = 'CLOTHING_ALPHA'
on conflict (size_system_id, code) do nothing;

insert into public.size_system_values (size_system_id, code, label, sort_order)
select s.id, v.code, v.label, v.sort_order
from public.size_systems s
join (values
  ('UK3', 'UK 3', 3), ('UK4', 'UK 4', 4), ('UK5', 'UK 5', 5),
  ('UK6', 'UK 6', 6), ('UK7', 'UK 7', 7), ('UK8', 'UK 8', 8),
  ('UK9', 'UK 9', 9), ('UK10', 'UK 10', 10), ('UK11', 'UK 11', 11),
  ('UK12', 'UK 12', 12)
) as v(code, label, sort_order) on true
where s.code = 'UK_SHOE'
on conflict (size_system_id, code) do nothing;

insert into public.colors (name, name_normalized, hex)
values
  ('Black', 'black', '#111111'),
  ('White', 'white', '#F5F5F5'),
  ('Navy', 'navy', '#1B2A4A'),
  ('Stone', 'stone', '#C4B7A6')
on conflict (name_normalized) do nothing;

insert into public.attributes (code, name, input_type)
values
  ('color', 'Color', 'COLOR'),
  ('size', 'Size', 'SIZE'),
  ('material', 'Material', 'SELECT'),
  ('fit', 'Fit', 'SELECT'),
  ('frame_color', 'Frame Color', 'COLOR'),
  ('lens_color', 'Lens Color', 'COLOR')
on conflict (code) do nothing;

insert into public.shipping_methods (code, name, description, price_pence, vat_rate_id, eta_min_days, eta_max_days, is_active)
select 'STANDARD', 'Standard Delivery', '2–5 working days', 399, v.id, 2, 5, true
from public.vat_rates v where v.code = 'UK_STANDARD'
on conflict (code) do nothing;

insert into public.shipping_methods (code, name, description, price_pence, vat_rate_id, eta_min_days, eta_max_days, is_active)
select 'EXPRESS', 'Express Delivery', '1–2 working days', 699, v.id, 1, 2, true
from public.vat_rates v where v.code = 'UK_STANDARD'
on conflict (code) do nothing;

insert into public.payment_bank_accounts (
  bank_name, account_name, sort_code, account_number, reference_instructions, is_active
)
select 'Example Bank', 'Fareya Ltd', '00-00-00', '12345678',
  'Use your order number as the payment reference.', true
where not exists (
  select 1 from public.payment_bank_accounts where is_active = true
);

-- Sample category trees under Men / Women
insert into public.categories (department_id, parent_id, name, slug, sort_order)
select d.id, null, 'Clothing', 'clothing', 1
from public.departments d where d.slug = 'men'
on conflict (department_id, slug) do nothing;

insert into public.categories (department_id, parent_id, name, slug, sort_order)
select d.id, c.id, 'T-Shirts', 't-shirts', 1
from public.departments d
join public.categories c on c.department_id = d.id and c.slug = 'clothing' and c.parent_id is null
where d.slug = 'men'
on conflict (department_id, slug) do nothing;

insert into public.categories (department_id, parent_id, name, slug, sort_order)
select d.id, null, 'Shoes', 'shoes', 2
from public.departments d where d.slug = 'men'
on conflict (department_id, slug) do nothing;

insert into public.categories (department_id, parent_id, name, slug, sort_order)
select d.id, null, 'Clothing', 'clothing', 1
from public.departments d where d.slug = 'women'
on conflict (department_id, slug) do nothing;

insert into public.categories (department_id, parent_id, name, slug, sort_order)
select d.id, c.id, 'Dresses', 'dresses', 1
from public.departments d
join public.categories c on c.department_id = d.id and c.slug = 'clothing' and c.parent_id is null
where d.slug = 'women'
on conflict (department_id, slug) do nothing;

insert into public.categories (department_id, parent_id, name, slug, sort_order)
select d.id, null, 'Accessories', 'accessories', 1
from public.departments d where d.slug = 'unisex'
on conflict (department_id, slug) do nothing;

insert into public.collections (name, slug, status)
values
  ('New Arrivals', 'new-arrivals', 'ACTIVE'),
  ('Sale', 'sale', 'ACTIVE'),
  ('Eid', 'eid', 'ACTIVE')
on conflict (slug) do nothing;


-- ========== 008_site_content.sql ==========
-- Site content: landing billboard + curated customer reviews

create table if not exists public.site_billboards (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New Collection',
  subtitle text,
  season_label text,
  cta_label text not null default 'Go to shop',
  cta_href text not null default '/shop',
  secondary_cta_label text,
  secondary_cta_href text,
  media_type text not null default 'IMAGE'
    check (media_type in ('IMAGE', 'VIDEO', 'NONE')),
  media_url text,
  poster_url text,
  is_active boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists site_billboards_one_active_idx
  on public.site_billboards (is_active)
  where is_active = true;

create table if not exists public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  rating int not null check (rating between 1 and 5),
  title text,
  body text not null,
  image_url text,
  location text,
  is_published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_reviews_published_idx
  on public.customer_reviews (is_published, sort_order, created_at desc);

insert into public.site_billboards (
  title,
  subtitle,
  season_label,
  cta_label,
  cta_href,
  secondary_cta_label,
  secondary_cta_href,
  media_type,
  is_active,
  sort_order
)
select
  'New Collection',
  'Formed in thread. Worn with intent.',
  'Summer edit',
  'Go to shop',
  '/shop',
  'New this week',
  '/collection/new-arrivals',
  'NONE',
  true,
  0
where not exists (select 1 from public.site_billboards where is_active = true);


-- ========== 009_platform_admin.sql ==========
-- Platform settings + admin purge helpers

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.platform_settings enable row level security;

insert into public.platform_settings (key, value, description) values
  (
    'storefront',
    jsonb_build_object(
      'storeName', 'Thread N Form',
      'tagline', 'UK fashion made simple',
      'supportEmail', 'support@threadnform.example',
      'supportPhone', '',
      'currency', 'GBP',
      'maintenanceMode', false,
      'showOutOfStock', true
    ),
    'Public storefront identity and maintenance flag'
  ),
  (
    'checkout',
    jsonb_build_object(
      'guestCheckoutEnabled', true,
      'requirePhone', false,
      'minOrderPence', 0,
      'allowNotes', true
    ),
    'Checkout behaviour'
  ),
  (
    'inventory',
    jsonb_build_object(
      'reserveOnCart', true,
      'allowOversell', false,
      'lowStockThreshold', 5,
      'defaultWarehouseCode', 'UK-MAIN'
    ),
    'Stock reservation and low-stock alerts'
  ),
  (
    'payments',
    jsonb_build_object(
      'manualBankTransferEnabled', true,
      'proofRequired', true,
      'autoExpirePendingHours', 72,
      'instructions', 'Transfer the exact order total and upload proof of payment.'
    ),
    'Payment and bank-transfer rules'
  ),
  (
    'notifications',
    jsonb_build_object(
      'orderEmailsEnabled', true,
      'adminAlertEmail', '',
      'lowStockAlertsEnabled', true
    ),
    'Email and alert preferences'
  ),
  (
    'security',
    jsonb_build_object(
      'blockNewRegistrations', false,
      'requireEmailConfirmation', true,
      'sessionIdleMinutes', 10080
    ),
    'Account and access controls'
  )
on conflict (key) do nothing;

-- Soft-delete style: allow customer_id null on orders when profile purged (optional)
do $$
begin
  alter table public.orders alter column customer_id drop not null;
exception when others then
  null;
end $$;


-- ========== 010_category_images.sql ==========
-- Category / department cover images for storefront tiles
alter table public.categories
  add column if not exists image_url text;

alter table public.departments
  add column if not exists image_url text;


-- ========== 011_inventory_holds_and_price_integrity.sql ==========
-- Reference-scoped inventory holds + one price row per product/variant.
--
-- Before this migration release_inventory / fulfill_inventory only checked the
-- aggregate `reserved` column, so releasing a hold that a cart or order never
-- took silently consumed stock reserved by *other* carts/orders. Every hold is
-- now derived from the movement ledger for its (reference_type, reference_id),
-- and callers can only release or consume what that reference actually holds.
--
-- Safe to re-run: functions use CREATE OR REPLACE, indexes IF NOT EXISTS.

create index if not exists inventory_movements_hold_idx
  on public.inventory_movements (warehouse_id, variant_id, reference_type, reference_id);

-- Quantity currently held by one reference. Reservations add, releases and
-- fulfilments subtract. Never negative.
create or replace function public.inventory_hold_qty(
  p_warehouse_id uuid,
  p_variant_id uuid,
  p_reference_type text,
  p_reference_id uuid
) returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(coalesce(sum(quantity_delta), 0), 0)::int
  from public.inventory_movements
  where warehouse_id = p_warehouse_id
    and variant_id = p_variant_id
    and reference_type = p_reference_type
    and reference_id = p_reference_id
    and movement_type in ('ORDER_RESERVATION', 'ORDER_RELEASE', 'ORDER_FULFILLMENT');
$$;

-- Moves the hold for one reference to exactly p_target units.
-- Raises INSUFFICIENT_STOCK when growing the hold beyond what is free.
create or replace function public.set_inventory_hold(
  p_warehouse_id uuid,
  p_variant_id uuid,
  p_reference_type text,
  p_reference_id uuid,
  p_target int,
  p_actor_type public.actor_type default 'SYSTEM',
  p_actor_id uuid default null,
  p_reason text default null
) returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_hold int;
  v_delta int;
  v_free int;
begin
  if p_target is null or p_target < 0 then
    raise exception 'Hold quantity must be zero or positive';
  end if;

  if p_target > 0 then
    perform public.ensure_inventory_item(p_warehouse_id, p_variant_id);
  end if;

  select * into v_item
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  if v_item.id is null then
    return v_item;
  end if;

  v_hold := public.inventory_hold_qty(
    p_warehouse_id, p_variant_id, p_reference_type, p_reference_id
  );
  v_delta := p_target - v_hold;

  if v_delta > 0 then
    v_free := v_item.on_hand - v_item.reserved;
    if v_free < v_delta then
      raise exception 'INSUFFICIENT_STOCK: available %, requested %',
        v_free + v_hold, p_target;
    end if;

    update public.inventory_items
    set reserved = reserved + v_delta, updated_at = now()
    where id = v_item.id
    returning * into v_item;

    insert into public.inventory_movements (
      warehouse_id, variant_id, quantity_delta, movement_type,
      reference_type, reference_id,
      previous_on_hand, new_on_hand, previous_reserved, new_reserved,
      actor_type, actor_id, reason
    ) values (
      p_warehouse_id, p_variant_id, v_delta, 'ORDER_RESERVATION',
      p_reference_type, p_reference_id,
      v_item.on_hand, v_item.on_hand, v_item.reserved - v_delta, v_item.reserved,
      p_actor_type, p_actor_id, p_reason
    );
  elsif v_delta < 0 then
    -- Clamp to the aggregate so legacy drift can never violate reserved >= 0.
    v_delta := -least(-v_delta, v_item.reserved);
    if v_delta = 0 then
      return v_item;
    end if;

    update public.inventory_items
    set reserved = reserved + v_delta, updated_at = now()
    where id = v_item.id
    returning * into v_item;

    insert into public.inventory_movements (
      warehouse_id, variant_id, quantity_delta, movement_type,
      reference_type, reference_id,
      previous_on_hand, new_on_hand, previous_reserved, new_reserved,
      actor_type, actor_id, reason
    ) values (
      p_warehouse_id, p_variant_id, v_delta, 'ORDER_RELEASE',
      p_reference_type, p_reference_id,
      v_item.on_hand, v_item.on_hand, v_item.reserved - v_delta, v_item.reserved,
      p_actor_type, p_actor_id, p_reason
    );
  end if;

  return v_item;
end;
$$;

-- Releases up to p_qty of the reference's own hold. Releasing a hold that does
-- not exist is a no-op (returns the row unchanged, or NULL when no row).
create or replace function public.release_inventory(
  p_warehouse_id uuid,
  p_variant_id uuid,
  p_qty int,
  p_reference_type text,
  p_reference_id uuid,
  p_actor_type public.actor_type default 'SYSTEM',
  p_actor_id uuid default null,
  p_reason text default null
) returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_hold int;
begin
  if p_qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select * into v_item
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  if v_item.id is null then
    return v_item;
  end if;

  v_hold := public.inventory_hold_qty(
    p_warehouse_id, p_variant_id, p_reference_type, p_reference_id
  );

  return public.set_inventory_hold(
    p_warehouse_id, p_variant_id, p_reference_type, p_reference_id,
    greatest(v_hold - p_qty, 0), p_actor_type, p_actor_id, p_reason
  );
end;
$$;

-- Ships p_qty units for a reference: on_hand drops by p_qty and the
-- reference's own hold is consumed first. Any unheld remainder must come from
-- free stock, so other references' holds are never touched.
create or replace function public.fulfill_inventory(
  p_warehouse_id uuid,
  p_variant_id uuid,
  p_qty int,
  p_reference_type text,
  p_reference_id uuid,
  p_actor_type public.actor_type default 'SYSTEM',
  p_actor_id uuid default null,
  p_reason text default null
) returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_hold int;
  v_consume int;
  v_prev_on_hand int;
  v_prev_reserved int;
begin
  if p_qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select * into v_item
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  if v_item.id is null then
    raise exception 'INSUFFICIENT_STOCK: available %, requested %', 0, p_qty;
  end if;

  v_hold := public.inventory_hold_qty(
    p_warehouse_id, p_variant_id, p_reference_type, p_reference_id
  );
  v_consume := least(v_hold, p_qty, v_item.reserved);

  if v_item.on_hand - p_qty < v_item.reserved - v_consume then
    raise exception 'INSUFFICIENT_STOCK: available %, requested %',
      v_item.on_hand - v_item.reserved + v_consume, p_qty;
  end if;

  v_prev_on_hand := v_item.on_hand;
  v_prev_reserved := v_item.reserved;

  update public.inventory_items
  set on_hand = on_hand - p_qty,
      reserved = reserved - v_consume,
      updated_at = now()
  where id = v_item.id
  returning * into v_item;

  insert into public.inventory_movements (
    warehouse_id, variant_id, quantity_delta, movement_type,
    reference_type, reference_id,
    previous_on_hand, new_on_hand, previous_reserved, new_reserved,
    actor_type, actor_id, reason
  ) values (
    p_warehouse_id, p_variant_id, -p_qty, 'ORDER_FULFILLMENT',
    p_reference_type, p_reference_id,
    v_prev_on_hand, v_item.on_hand, v_prev_reserved, v_item.reserved,
    p_actor_type, p_actor_id, p_reason
  );

  return v_item;
end;
$$;

-- One proof row per uploaded object: retried submissions are idempotent.
-- Skipped (the API still de-duplicates) if historical duplicates exist.
do $$
begin
  if not exists (
    select 1 from public.payment_proofs
    group by payment_id, storage_path
    having count(*) > 1
  ) then
    create unique index if not exists payment_proofs_payment_path_uidx
      on public.payment_proofs (payment_id, storage_path);
  end if;
end;
$$;

-- One price row per product (variant_id null) / variant.
-- Price edits used to INSERT a new row each time while readers took an
-- arbitrary row, so admin price changes did not reliably reach the shop.
-- Keep the most recently written row (the admin's latest edit) and enforce
-- uniqueness so the API now updates in place. Orders snapshot their prices,
-- so removing superseded rows does not alter any placed order.
delete from public.product_prices p
using (
  select id,
         row_number() over (
           partition by product_id, variant_id
           order by updated_at desc, created_at desc, id desc
         ) as rn
  from public.product_prices
) ranked
where p.id = ranked.id and ranked.rn > 1;

create unique index if not exists product_prices_scope_uidx
  on public.product_prices (
    product_id,
    coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );


-- ========== 012_rate_limits.sql ==========
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


-- ========== 013_partial_fulfilment_refunds_outbox.sql ==========
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


-- ========== 014_performance_indexes.sql ==========
-- Fareya: indexes for storefront filters, admin search and queue/history lists.
-- Safe to re-run: every statement is IF NOT EXISTS.
--
-- Plain CREATE INDEX (not CONCURRENTLY) because db:migrate wraps each file in a
-- transaction. On a large production table, run the statements individually
-- with CONCURRENTLY from the SQL editor first; this file then no-ops.

-- Trigram matching for ilike '%term%' search. Supabase installs extensions into
-- the `extensions` schema; resolve the operator class wherever it lives.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
set local search_path = public, extensions;

-- Storefront attribute / colour / size filters look up variants by option.
create index if not exists product_variant_options_option_idx
  on public.product_variant_options (option_id) where option_id is not null;
create index if not exists product_variant_options_color_idx
  on public.product_variant_options (color_id) where color_id is not null;
create index if not exists product_variant_options_size_idx
  on public.product_variant_options (size_value_id) where size_value_id is not null;

-- Primary key is (product_id, collection_id); collection filter needs the reverse.
create index if not exists product_collections_collection_idx
  on public.product_collections (collection_id);

-- Default listing: status = 'ACTIVE' order by created_at desc.
create index if not exists products_status_created_idx
  on public.products (status, created_at desc);
create index if not exists products_department_idx
  on public.products (department_id);
create index if not exists products_name_trgm_idx
  on public.products using gin (name gin_trgm_ops);

-- Price range filter.
create index if not exists product_prices_base_price_idx
  on public.product_prices (base_price_pence);

-- inStock filter / badge: only variants with sellable stock.
create index if not exists inventory_items_available_idx
  on public.inventory_items (variant_id) where on_hand > reserved;

-- Customer order history: customer_id = ? order by placed_at desc.
create index if not exists orders_customer_placed_idx
  on public.orders (customer_id, placed_at desc);

-- Admin order / payment search (order number, email, phone).
create index if not exists orders_order_number_trgm_idx
  on public.orders using gin (order_number gin_trgm_ops);
create index if not exists orders_email_trgm_idx
  on public.orders using gin (email gin_trgm_ops);
create index if not exists orders_phone_trgm_idx
  on public.orders using gin (phone gin_trgm_ops);

-- Payment review queue: status in (...) order by updated_at desc.
create index if not exists payments_status_updated_idx
  on public.payments (status, updated_at desc);
