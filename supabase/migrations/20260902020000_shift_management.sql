-- Shift Management & Scheduling

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  work_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, shift_id, work_date)
);

create index if not exists idx_shifts_org_branch on public.shifts(organization_id, branch_id);
create index if not exists idx_employee_schedules_org_branch on public.employee_schedules(organization_id, branch_id);
create index if not exists idx_employee_schedules_employee_date on public.employee_schedules(employee_id, work_date);
create index if not exists idx_employee_schedules_shift on public.employee_schedules(shift_id);

alter table public.shifts enable row level security;
alter table public.employee_schedules enable row level security;

-- Policies for shifts
create policy shifts_read on public.shifts for select to authenticated
  using (public.is_org_member(organization_id) and public.has_branch_access(organization_id, branch_id));

create policy shifts_insert on public.shifts for insert to authenticated
  with check (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id));

create policy shifts_update on public.shifts for update to authenticated
  using (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id))
  with check (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id));

create policy shifts_delete on public.shifts for delete to authenticated
  using (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id));

-- Policies for employee_schedules
create policy employee_schedules_read on public.employee_schedules for select to authenticated
  using (public.is_org_member(organization_id) and public.has_branch_access(organization_id, branch_id));

create policy employee_schedules_insert on public.employee_schedules for insert to authenticated
  with check (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id));

create policy employee_schedules_update on public.employee_schedules for update to authenticated
  using (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id))
  with check (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id));

create policy employee_schedules_delete on public.employee_schedules for delete to authenticated
  using (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id));

