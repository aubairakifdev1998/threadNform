-- Fareya combined migrations — paste into Supabase SQL Editor and Run
-- Generated for one-shot apply


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

-- end 009_platform_admin

