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
