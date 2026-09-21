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
