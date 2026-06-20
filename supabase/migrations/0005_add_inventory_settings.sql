alter table public.organizations
  add column if not exists allow_negative_inventory boolean not null default false;
