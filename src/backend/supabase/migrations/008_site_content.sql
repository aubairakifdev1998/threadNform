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
