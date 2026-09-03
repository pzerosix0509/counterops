-- Payroll & Payslips Module Schema
-- Migration 20260904000000

-- ============================================================
-- 1. payroll_settings
-- ============================================================
create table if not exists public.payroll_settings (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  salary_period_start_day integer not null default 1 check (salary_period_start_day >= 1 and salary_period_start_day <= 31),
  salary_period_type text not null default 'MONTHLY' check (salary_period_type in ('MONTHLY', 'WEEKLY', 'BI_WEEKLY')),
  auto_generate_payroll boolean not null default true,
  auto_update_payroll boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payroll_settings_org on public.payroll_settings(organization_id);

-- ============================================================
-- 2. salary_profiles
-- ============================================================
create table if not exists public.salary_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  salary_type text not null check (salary_type in ('PER_SHIFT', 'MONTHLY', 'HOURLY', 'STANDARD_DAY')),
  base_amount numeric not null default 0,
  effective_from date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_salary_profiles_org on public.salary_profiles(organization_id);
create index if not exists idx_salary_profiles_employee on public.salary_profiles(employee_id);

-- ============================================================
-- 3. allowance_categories & deduction_categories
-- ============================================================
create table if not exists public.allowance_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null default 'FIXED' check (type in ('FIXED', 'PERCENTAGE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_allowance_categories_org on public.allowance_categories(organization_id);

create table if not exists public.deduction_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null default 'FIXED' check (type in ('FIXED', 'PERCENTAGE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deduction_categories_org on public.deduction_categories(organization_id);

-- ============================================================
-- 4. payroll_periods
-- ============================================================
create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'FINALIZED', 'PAID')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, period_start, period_end)
);

create index if not exists idx_payroll_periods_org_branch on public.payroll_periods(organization_id, branch_id);

-- ============================================================
-- 5. payslips
-- ============================================================
create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  base_salary numeric not null default 0,
  overtime_amount numeric not null default 0,
  bonus numeric not null default 0,
  commission numeric not null default 0,
  allowance_total numeric not null default 0,
  deduction_total numeric not null default 0,
  tax_amount numeric not null default 0,
  insurance_amount numeric not null default 0,
  net_salary numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_period_id, employee_id)
);

create index if not exists idx_payslips_org_branch on public.payslips(organization_id, branch_id);
create index if not exists idx_payslips_employee on public.payslips(employee_id);
create index if not exists idx_payslips_period on public.payslips(payroll_period_id);

-- ============================================================
-- 6. payslip_line_items
-- ============================================================
create table if not exists public.payslip_line_items (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references public.payslips(id) on delete cascade,
  category_type text not null check (category_type in ('ALLOWANCE', 'DEDUCTION', 'BONUS', 'COMMISSION', 'OVERTIME', 'OTHER')),
  category_id uuid,
  amount numeric not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payslip_line_items_payslip on public.payslip_line_items(payslip_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.payroll_settings enable row level security;
alter table public.salary_profiles enable row level security;
alter table public.allowance_categories enable row level security;
alter table public.deduction_categories enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payslips enable row level security;
alter table public.payslip_line_items enable row level security;

-- Policies for payroll_settings
create policy payroll_settings_read on public.payroll_settings for select to authenticated
  using (public.is_org_member(organization_id) and public.has_branch_access(organization_id, branch_id));

create policy payroll_settings_write on public.payroll_settings for all to authenticated
  using (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id))
  with check (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id));

-- Policies for salary_profiles
create policy salary_profiles_read on public.salary_profiles for select to authenticated
  using (public.is_org_member(organization_id));

create policy salary_profiles_write on public.salary_profiles for all to authenticated
  using (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT'))
  with check (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT'));

-- Policies for allowance_categories
create policy allowance_categories_read on public.allowance_categories for select to authenticated
  using (public.is_org_member(organization_id));

create policy allowance_categories_write on public.allowance_categories for all to authenticated
  using (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT'))
  with check (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT'));

-- Policies for deduction_categories
create policy deduction_categories_read on public.deduction_categories for select to authenticated
  using (public.is_org_member(organization_id));

create policy deduction_categories_write on public.deduction_categories for all to authenticated
  using (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT'))
  with check (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT'));

-- Policies for payroll_periods
create policy payroll_periods_read on public.payroll_periods for select to authenticated
  using (public.is_org_member(organization_id) and public.has_branch_access(organization_id, branch_id));

create policy payroll_periods_write on public.payroll_periods for all to authenticated
  using (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id))
  with check (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id));

-- Policies for payslips
create policy payslips_read on public.payslips for select to authenticated
  using (
    public.is_org_member(organization_id) and 
    public.has_branch_access(organization_id, branch_id) and 
    (
      employee_id in (select id from public.employees where user_id = auth.uid()) or
      public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT')
    )
  );

create policy payslips_write on public.payslips for all to authenticated
  using (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id))
  with check (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id));

-- Policies for payslip_line_items
create policy payslip_line_items_read on public.payslip_line_items for select to authenticated
  using (
    payslip_id in (
      select id from public.payslips p
      where 
        public.is_org_member(p.organization_id) and 
        public.has_branch_access(p.organization_id, p.branch_id) and
        (
          p.employee_id in (select id from public.employees where user_id = auth.uid()) or
          public.has_employee_permission(p.organization_id, 'EMPLOYEE_EDIT')
        )
    )
  );

create policy payslip_line_items_write on public.payslip_line_items for all to authenticated
  using (
    payslip_id in (
      select id from public.payslips p
      where 
        public.has_employee_permission(p.organization_id, 'EMPLOYEE_EDIT') and 
        public.has_branch_access(p.organization_id, p.branch_id)
    )
  )
  with check (
    payslip_id in (
      select id from public.payslips p
      where 
        public.has_employee_permission(p.organization_id, 'EMPLOYEE_EDIT') and 
        public.has_branch_access(p.organization_id, p.branch_id)
    )
  );
-- ============================================================
-- Custom function for updated_at
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- Triggers for updated_at
-- ============================================================
create trigger handle_updated_at_payroll_settings before update on public.payroll_settings
  for each row execute function public.handle_updated_at();

create trigger handle_updated_at_salary_profiles before update on public.salary_profiles
  for each row execute function public.handle_updated_at();

create trigger handle_updated_at_allowance_categories before update on public.allowance_categories
  for each row execute function public.handle_updated_at();

create trigger handle_updated_at_deduction_categories before update on public.deduction_categories
  for each row execute function public.handle_updated_at();

create trigger handle_updated_at_payroll_periods before update on public.payroll_periods
  for each row execute function public.handle_updated_at();

create trigger handle_updated_at_payslips before update on public.payslips
  for each row execute function public.handle_updated_at();

create trigger handle_updated_at_payslip_line_items before update on public.payslip_line_items
  for each row execute function public.handle_updated_at();
