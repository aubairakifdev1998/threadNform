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
