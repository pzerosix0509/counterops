create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  inventory_deduction_timing text not null default 'payment'
    check (inventory_deduction_timing in ('payment', 'kitchen_start')),
  low_stock_alert_enabled boolean not null default true,
  default_low_stock_threshold numeric not null default 0 check (default_low_stock_threshold >= 0),
  default_order_type text not null default 'dine_in'
    check (default_order_type in ('dine_in', 'takeaway')),
  default_takeaway_channel_id uuid references public.sales_channels(id) on delete set null,
  allow_unpaid_orders boolean not null default true,
  discounts_enabled boolean not null default true,
  max_discount_percent numeric not null default 100 check (max_discount_percent >= 0 and max_discount_percent <= 100),
  default_payment_method text not null default 'cash'
    check (default_payment_method in ('cash', 'bank_transfer', 'card', 'ewallet', 'debt', 'other')),
  kitchen_sound_enabled boolean not null default true,
  auto_send_to_kitchen_on_payment boolean not null default true,
  show_regular_items_in_kitchen boolean not null default false,
  auto_mark_served_on_ready boolean not null default false,
  business_day_start_time time not null default '00:00',
  include_service_fee_in_revenue boolean not null default true,
  auto_generate_eod boolean not null default false,
  receipt_store_name text,
  receipt_address text,
  receipt_phone text,
  receipt_logo_url text,
  receipt_footer text not null default 'Cảm ơn quý khách.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_settings enable row level security;

drop policy if exists organization_settings_all on public.organization_settings;
create policy organization_settings_all on public.organization_settings for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

alter table public.sales_channels
  add column if not exists platform_fee_percent numeric not null default 0 check (platform_fee_percent >= 0 and platform_fee_percent <= 100),
  add column if not exists sort_order int not null default 0;
