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
