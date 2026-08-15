-- 0011_add_tax_settings.sql
-- Persistent business facts used to auto-fill tax documents (mẫu biểu thuế).
alter table public.organization_settings
  add column if not exists tax_code text,
  add column if not exists business_line text,
  add column if not exists business_start_date date,
  add column if not exists account_holder_name text,
  add column if not exists province text,
  add column if not exists district text,
  add column if not exists commune text;
