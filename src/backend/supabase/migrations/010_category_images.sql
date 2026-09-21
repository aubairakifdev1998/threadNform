-- Category / department cover images for storefront tiles
alter table public.categories
  add column if not exists image_url text;

alter table public.departments
  add column if not exists image_url text;
