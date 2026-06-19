-- supabase/migrations/0003_recover_memberships.sql
-- Dùng khi bảng memberships chưa được tạo do migration fail giữa chừng.
-- Tạo lại phần tối thiểu nếu chưa có. An toàn chạy nhiều lần.

create extension if not exists "pgcrypto";

do $$ begin
  create type membership_role as enum ('owner','admin','manager','cashier','reception','kitchen','staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type membership_status as enum ('invited','active','suspended');
exception when duplicate_object then null; end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  business_type text not null default 'restaurant',
  timezone text not null default 'Asia/Bangkok',
  currency text not null default 'VND',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  default_organization_id uuid references public.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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