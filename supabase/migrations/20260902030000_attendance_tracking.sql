-- Attendance Tracking Module
-- Phase 1: Database Schema

-- ============================================================
-- Table: attendance_settings (one row per branch)
-- ============================================================
create table if not exists public.attendance_settings (
  branch_id                         uuid primary key references public.branches(id) on delete cascade,
  organization_id                   uuid not null references public.organizations(id) on delete cascade,
  standard_hours_per_day            numeric not null default 8,
  half_day_hours_threshold          numeric not null default 4,
  half_day_range_from               time,
  half_day_range_to                 time,
  record_late_early_on_half_day     boolean not null default false,
  late_threshold_minutes            integer not null default 15,
  early_leave_threshold_minutes     integer not null default 15,
  overtime_before_shift_enabled     boolean not null default false,
  overtime_after_shift_enabled      boolean not null default false,
  allow_continuous_shift_checkin    boolean not null default false,
  auto_attendance_enabled           boolean not null default false,
  allow_checkin_without_schedule    boolean not null default false,
  updated_at                        timestamptz not null default now()
);

-- ============================================================
-- Table: attendance_logs
-- ============================================================
create table if not exists public.attendance_logs (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  branch_id               uuid not null references public.branches(id) on delete cascade,
  employee_id             uuid not null references public.employees(id) on delete cascade,
  schedule_id             uuid references public.employee_schedules(id) on delete set null,
  check_in_time           timestamptz not null default now(),
  check_out_time          timestamptz,
  method                  text not null default 'MANUAL'
                          check (method in ('QR_MINI_APP', 'FINGERPRINT', 'AUTO', 'MANUAL')),
  is_late                 boolean not null default false,
  is_early_leave          boolean not null default false,
  overtime_before_minutes integer not null default 0,
  overtime_after_minutes  integer not null default 0,
  work_unit               numeric,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Prevent an employee from having multiple active (unchecked-out) logs
create unique index if not exists idx_attendance_logs_active_checkin
  on public.attendance_logs (employee_id)
  where check_out_time is null;

-- Performance indexes
create index if not exists idx_attendance_logs_org_branch
  on public.attendance_logs(organization_id, branch_id);
create index if not exists idx_attendance_logs_employee
  on public.attendance_logs(employee_id, check_in_time desc);
create index if not exists idx_attendance_logs_schedule
  on public.attendance_logs(schedule_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.attendance_settings enable row level security;
alter table public.attendance_logs enable row level security;

-- attendance_settings: branch members can read; EMPLOYEE_EDIT can write
create policy attendance_settings_read on public.attendance_settings
  for select to authenticated
  using (
    public.is_org_member(organization_id) and
    public.has_branch_access(organization_id, branch_id)
  );

create policy attendance_settings_update on public.attendance_settings
  for update to authenticated
  using (
    public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and
    public.has_branch_access(organization_id, branch_id)
  )
  with check (
    public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and
    public.has_branch_access(organization_id, branch_id)
  );

create policy attendance_settings_insert on public.attendance_settings
  for insert to authenticated
  with check (
    public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and
    public.has_branch_access(organization_id, branch_id)
  );

-- attendance_logs: employees can manage own logs; managers can view/edit all
create policy attendance_logs_select_own on public.attendance_logs
  for select to authenticated
  using (
    public.is_org_member(organization_id) and
    public.has_branch_access(organization_id, branch_id) and
    (
      employee_id in (
        select id from public.employees where user_id = auth.uid()
      )
      or
      public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT')
    )
  );

create policy attendance_logs_insert_own on public.attendance_logs
  for insert to authenticated
  with check (
    public.is_org_member(organization_id) and
    public.has_branch_access(organization_id, branch_id) and
    employee_id in (
      select id from public.employees where user_id = auth.uid()
    )
  );

create policy attendance_logs_update on public.attendance_logs
  for update to authenticated
  using (
    public.is_org_member(organization_id) and
    public.has_branch_access(organization_id, branch_id) and
    (
      employee_id in (
        select id from public.employees where user_id = auth.uid()
      )
      or
      public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT')
    )
  )
  with check (
    public.is_org_member(organization_id) and
    public.has_branch_access(organization_id, branch_id)
  );

create policy attendance_logs_delete on public.attendance_logs
  for delete to authenticated
  using (
    public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and
    public.has_branch_access(organization_id, branch_id)
  );
