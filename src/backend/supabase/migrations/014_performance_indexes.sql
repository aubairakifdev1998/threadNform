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
