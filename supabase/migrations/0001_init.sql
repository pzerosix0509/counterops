-- =============================================================
-- 0001_init.sql
-- Store Operations MVP: multi-tenant foundation, menu, inventory,
-- tables, orders, payments, reports, audit.
-- =============================================================

-- Extensions ----------------------------------------------------
create extension if not exists "pgcrypto";

-- Enums ---------------------------------------------------------
do $$ begin
  create type membership_role as enum ('owner','admin','manager','cashier','reception','kitchen','staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type membership_status as enum ('invited','active','suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type menu_type as enum ('food','drink','service','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_type as enum ('regular','prepared');
exception when duplicate_object then null; end $$;

do $$ begin
  create type inventory_item_type as enum ('ingredient','sellable_product','packaging','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type table_status as enum ('available','occupied','reserved','disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_type as enum ('dine_in','takeaway','delivery','online');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('draft','open','sent_to_kitchen','partially_paid','paid','cancelled','refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type kitchen_status as enum ('not_required','pending','cooking','ready','served','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash','bank_transfer','card','ewallet','debt','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_type as enum ('purchase','sale_deduction','adjustment','transfer_in','transfer_out','waste','return');
exception when duplicate_object then null; end $$;

-- Trigger helper: updated_at ------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tenant & identity ---------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  business_type text not null default 'restaurant',
  timezone text not null default 'Asia/Bangkok',
  currency text not null default 'VND',
  allow_negative_inventory boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at before update on public.organizations
for each row execute function public.set_updated_at();

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  address text,
  phone text,
  timezone text not null default 'Asia/Bangkok',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_branches_updated_at on public.branches;
create trigger trg_branches_updated_at before update on public.branches
for each row execute function public.set_updated_at();
create index if not exists branches_organization_id_idx on public.branches(organization_id);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  default_organization_id uuid references public.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role membership_role not null,
  status membership_status not null default 'active',
  invited_by uuid references public.profiles(id),
  joined_at timestamptz default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, branch_id, user_id, role)
);
create index if not exists memberships_user_org_idx on public.memberships(user_id, organization_id, status);
create index if not exists memberships_org_idx on public.memberships(organization_id);

-- Menu ----------------------------------------------------------
create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.menu_categories(id) on delete set null,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_menu_categories_updated_at on public.menu_categories;
create trigger trg_menu_categories_updated_at before update on public.menu_categories
for each row execute function public.set_updated_at();
create index if not exists menu_categories_org_idx on public.menu_categories(organization_id);

create table if not exists public.menu_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text
);
create index if not exists menu_tags_org_idx on public.menu_tags(organization_id);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.menu_categories(id) on delete set null,
  name text not null,
  code text not null,
  image_url text,
  description text,
  menu_type menu_type not null default 'food',
  product_type product_type not null default 'regular',
  cost_price int not null default 0 check (cost_price >= 0),
  sale_price int not null default 0 check (sale_price >= 0),
  unit text not null default 'phần',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, code)
);
drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at before update on public.products
for each row execute function public.set_updated_at();
create index if not exists products_org_active_idx on public.products(organization_id, is_active);
create index if not exists products_org_category_idx on public.products(organization_id, category_id);

create table if not exists public.product_tags (
  product_id uuid not null references public.products(id) on delete cascade,
  tag_id uuid not null references public.menu_tags(id) on delete cascade,
  primary key (product_id, tag_id)
);

create table if not exists public.product_branch_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  is_available boolean not null default true,
  sale_price_override int,
  low_stock_threshold numeric,
  high_stock_threshold numeric,
  unique (product_id, branch_id)
);

-- Inventory -----------------------------------------------------
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  image_url text,
  item_type inventory_item_type not null default 'ingredient',
  unit text not null,
  cost_price int not null default 0 check (cost_price >= 0),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, code)
);
drop trigger if exists trg_inventory_items_updated_at on public.inventory_items;
create trigger trg_inventory_items_updated_at before update on public.inventory_items
for each row execute function public.set_updated_at();
create index if not exists inventory_items_org_idx on public.inventory_items(organization_id);

create table if not exists public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity_on_hand numeric not null default 0,
  low_stock_threshold numeric not null default 0,
  high_stock_threshold numeric,
  updated_at timestamptz not null default now(),
  unique (branch_id, inventory_item_id)
);
drop trigger if exists trg_inventory_balances_updated_at on public.inventory_balances;
create trigger trg_inventory_balances_updated_at before update on public.inventory_balances
for each row execute function public.set_updated_at();

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  movement_type movement_type not null,
  quantity_delta numeric not null,
  unit_cost int not null default 0,
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_branch_item_idx on public.inventory_movements(branch_id, inventory_item_id, created_at desc);

-- Recipes -------------------------------------------------------
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  version int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id, version)
);

create table if not exists public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id),
  quantity numeric not null check (quantity > 0),
  unit text not null,
  estimated_cost int not null default 0
);

-- Sales channels ------------------------------------------------
create table if not exists public.sales_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null default 'direct',
  is_active boolean not null default true
);

-- Tables, areas, rooms ------------------------------------------
create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  sort_order int not null default 0
);
create index if not exists areas_branch_idx on public.areas(branch_id);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  name text not null,
  sort_order int not null default 0
);
create index if not exists rooms_branch_idx on public.rooms(branch_id);

create table if not exists public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  name text not null,
  seats int not null default 2 check (seats > 0),
  status table_status not null default 'available',
  sort_order int not null default 0,
  unique (branch_id, name)
);
create index if not exists dining_tables_branch_status_idx on public.dining_tables(branch_id, status);

-- Customers -----------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text,
  phone text,
  email text,
  birthday date,
  notes text,
  created_at timestamptz not null default now()
);
create unique index if not exists customers_org_phone_uniq on public.customers(organization_id, phone) where phone is not null;

-- Orders / items / payments -------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  order_number text not null,
  table_id uuid references public.dining_tables(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  sales_channel_id uuid references public.sales_channels(id) on delete set null,
  order_type order_type not null default 'dine_in',
  status order_status not null default 'open',
  subtotal int not null default 0,
  discount_amount int not null default 0,
  tax_amount int not null default 0,
  service_fee_amount int not null default 0,
  total_amount int not null default 0,
  paid_amount int not null default 0,
  debt_amount int not null default 0,
  opened_by uuid references public.profiles(id),
  closed_by uuid references public.profiles(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancellation_reason text,
  unique (branch_id, order_number)
);
create index if not exists orders_branch_opened_idx on public.orders(branch_id, opened_at desc);
create index if not exists orders_branch_status_idx on public.orders(branch_id, status);
create index if not exists orders_org_opened_idx on public.orders(organization_id, opened_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  unit_price_snapshot int not null,
  cost_price_snapshot int not null default 0,
  quantity numeric not null check (quantity > 0),
  note text,
  kitchen_status kitchen_status not null default 'not_required',
  cancellation_stage text,
  cancelled_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_branch_kitchen_idx on public.order_items(branch_id, kitchen_status);
create index if not exists order_items_branch_kitchen_created_idx on public.order_items(branch_id, kitchen_status, created_at);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  method payment_method not null,
  amount int not null check (amount > 0),
  paid_at timestamptz not null default now(),
  received_by uuid references public.profiles(id),
  transaction_ref text
);
create index if not exists payments_branch_paid_idx on public.payments(branch_id, paid_at desc);

-- Reports / audit -----------------------------------------------
create table if not exists public.end_of_day_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  report_date date not null,
  document_code text not null,
  total_orders int not null default 0,
  gross_sales int not null default 0,
  discounts int not null default 0,
  net_revenue int not null default 0,
  other_income int not null default 0,
  tax int not null default 0,
  return_fee int not null default 0,
  total_paid int not null default 0,
  debt_amount int not null default 0,
  cash_total int not null default 0,
  bank_transfer_total int not null default 0,
  generated_by uuid references public.profiles(id),
  generated_at timestamptz not null default now(),
  unique (branch_id, report_date)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  actor_user_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_org_created_idx on public.audit_logs(organization_id, created_at desc);

-- =============================================================
-- RLS helper functions
-- =============================================================
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(p_org_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(allowed_roles::membership_role[])
  );
$$;

create or replace function public.has_branch_access(p_org_id uuid, p_branch_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (m.branch_id is null or m.branch_id = p_branch_id)
  );
$$;

-- =============================================================
-- RLS enable on every business table
-- =============================================================
alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_tags enable row level security;
alter table public.products enable row level security;
alter table public.product_tags enable row level security;
alter table public.product_branch_settings enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.sales_channels enable row level security;
alter table public.areas enable row level security;
alter table public.rooms enable row level security;
alter table public.dining_tables enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.end_of_day_reports enable row level security;
alter table public.audit_logs enable row level security;

-- =============================================================
-- RLS policies
-- =============================================================

-- organizations
drop policy if exists org_member_select on public.organizations;
create policy org_member_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
drop policy if exists org_insert_self on public.organizations;
create policy org_insert_self on public.organizations for insert to authenticated
  with check (auth.uid() is not null);
drop policy if exists org_update_owner on public.organizations;
create policy org_update_owner on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner']));

-- branches
drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists branches_write on public.branches;
create policy branches_write on public.branches for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','manager']))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.memberships m
    where m.user_id = profiles.id
      and m.organization_id in (
        select organization_id from public.memberships where user_id = auth.uid() and status='active'
      )
  ));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- memberships
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists memberships_write on public.memberships;
create policy memberships_write on public.memberships for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','manager']))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

-- menu
drop policy if exists menu_categories_all on public.menu_categories;
create policy menu_categories_all on public.menu_categories for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

drop policy if exists menu_tags_all on public.menu_tags;
create policy menu_tags_all on public.menu_tags for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

drop policy if exists products_all on public.products;
create policy products_all on public.products for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

drop policy if exists product_tags_all on public.product_tags;
create policy product_tags_all on public.product_tags for all to authenticated
  using (exists (select 1 from public.products p where p.id = product_id and public.is_org_member(p.organization_id)))
  with check (exists (select 1 from public.products p where p.id = product_id and public.has_org_role(p.organization_id, array['owner','admin','manager'])));

drop policy if exists product_branch_settings_all on public.product_branch_settings;
create policy product_branch_settings_all on public.product_branch_settings for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

-- inventory
drop policy if exists inventory_items_all on public.inventory_items;
create policy inventory_items_all on public.inventory_items for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

drop policy if exists inventory_balances_all on public.inventory_balances;
create policy inventory_balances_all on public.inventory_balances for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager','cashier']));

drop policy if exists inventory_movements_all on public.inventory_movements;
create policy inventory_movements_all on public.inventory_movements for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

-- recipes
drop policy if exists recipes_all on public.recipes;
create policy recipes_all on public.recipes for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

drop policy if exists recipe_items_all on public.recipe_items;
create policy recipe_items_all on public.recipe_items for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and public.is_org_member(r.organization_id)))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and public.has_org_role(r.organization_id, array['owner','admin','manager'])));

-- tables/areas/rooms
drop policy if exists sales_channels_all on public.sales_channels;
create policy sales_channels_all on public.sales_channels for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

drop policy if exists areas_all on public.areas;
create policy areas_all on public.areas for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager','cashier','reception']));

drop policy if exists rooms_all on public.rooms;
create policy rooms_all on public.rooms for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager','cashier','reception']));

drop policy if exists dining_tables_all on public.dining_tables;
create policy dining_tables_all on public.dining_tables for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager','cashier','reception']));

-- customers
drop policy if exists customers_all on public.customers;
create policy customers_all on public.customers for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- orders / items / payments
drop policy if exists orders_all on public.orders;
create policy orders_all on public.orders for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager','cashier','reception']));

drop policy if exists order_items_all on public.order_items;
create policy order_items_all on public.order_items for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager','cashier','kitchen']));

drop policy if exists payments_all on public.payments;
create policy payments_all on public.payments for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager','cashier']));

-- reports
drop policy if exists eod_all on public.end_of_day_reports;
create policy eod_all on public.end_of_day_reports for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

-- audit logs
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','manager']));
drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert to authenticated
  with check (public.is_org_member(organization_id));
