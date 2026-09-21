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
