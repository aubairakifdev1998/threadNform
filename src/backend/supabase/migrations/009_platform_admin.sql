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
