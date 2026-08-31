-- Employee management and organization-scoped RBAC.
create type public.employee_status as enum ('ACTIVE', 'INACTIVE', 'RESIGNED');

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  module text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_system_admin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_code text not null,
  full_name text not null,
  phone_number text,
  email text,
  user_id uuid references public.profiles(id) on delete set null,
  role_id uuid references public.roles(id) on delete set null,
  branch_id uuid not null references public.branches(id) on delete restrict,
  status public.employee_status not null default 'ACTIVE',
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_code),
  unique (organization_id, user_id),
  check (end_date is null or end_date >= start_date)
);

create index if not exists employees_org_branch_idx on public.employees(organization_id, branch_id, status);
create index if not exists employees_org_role_idx on public.employees(organization_id, role_id);

create or replace function public.next_employee_code(p_org_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  next_number integer;
begin
  select coalesce(max(substring(employee_code from 3)::integer), 0) + 1
    into next_number
    from public.employees
   where organization_id = p_org_id and employee_code ~ '^NV[0-9]+$';
  return 'NV' || lpad(next_number::text, 6, '0');
end;
$$;

create or replace function public.prevent_employee_code_change()
returns trigger language plpgsql as $$
begin
  if old.employee_code <> new.employee_code then
    raise exception 'employee_code is immutable';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_employees_immutable_code on public.employees;
create trigger trg_employees_immutable_code before update on public.employees
for each row execute function public.prevent_employee_code_change();

create or replace function public.create_employee(
  p_org_id uuid, p_full_name text, p_phone_number text, p_email text,
  p_user_id uuid, p_role_id uuid, p_branch_id uuid, p_status public.employee_status,
  p_start_date date, p_end_date date
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  created public.employees;
  v_employee_code text;
begin
  if not public.has_employee_permission(p_org_id, 'EMPLOYEE_EDIT') then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id and organization_id = p_org_id and is_active) then
    raise exception 'invalid branch';
  end if;
  if not public.has_branch_access(p_org_id, p_branch_id) then
    raise exception 'branch access denied';
  end if;
  if p_role_id is not null and not exists (select 1 from public.roles where id = p_role_id and organization_id = p_org_id) then
    raise exception 'invalid role';
  end if;
  v_employee_code := public.next_employee_code(p_org_id);
  insert into public.employees (
    organization_id, employee_code, full_name, phone_number, email, user_id,
    role_id, branch_id, status, start_date, end_date
  ) values (
    p_org_id, v_employee_code, p_full_name, p_phone_number,
    p_email, p_user_id, p_role_id, p_branch_id, p_status, p_start_date, p_end_date
  ) returning * into created;
  return created.id;
end;
$$;

insert into public.permissions (permission_key, module, description) values
  ('EMPLOYEE_VIEW', 'EMPLOYEE', 'Xem hồ sơ nhân viên'),
  ('EMPLOYEE_EDIT', 'EMPLOYEE', 'Thêm và sửa hồ sơ nhân viên'),
  ('EMPLOYEE_STATUS_EDIT', 'EMPLOYEE', 'Đổi trạng thái nhân viên'),
  ('RBAC_VIEW', 'RBAC', 'Xem vai trò và quyền'),
  ('RBAC_EDIT', 'RBAC', 'Cấu hình vai trò và quyền')
on conflict (permission_key) do nothing;

insert into public.roles (organization_id, name, is_system_admin)
select o.id, seed.name, seed.is_system_admin
from public.organizations o
cross join (values ('Admin', true), ('Quản lý', false), ('Nhân viên', false)) as seed(name, is_system_admin)
on conflict (organization_id, name) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.is_system_admin or (r.name = 'Quản lý' and p.module in ('EMPLOYEE', 'RBAC'))
on conflict do nothing;

create or replace function public.seed_employee_roles()
returns trigger language plpgsql security definer set search_path = public as $$
declare admin_role uuid;
begin
  insert into public.roles (organization_id, name, is_system_admin)
  values (new.id, 'Admin', true), (new.id, 'Quản lý', false), (new.id, 'Nhân viên', false)
  on conflict (organization_id, name) do nothing;
  select id into admin_role from public.roles where organization_id = new.id and is_system_admin limit 1;
  insert into public.role_permissions (role_id, permission_id)
  select admin_role, id from public.permissions on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists trg_seed_employee_roles on public.organizations;
create trigger trg_seed_employee_roles after insert on public.organizations
for each row execute function public.seed_employee_roles();

create or replace function public.is_employee_admin(p_org_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org_id and m.user_id = auth.uid()
      and m.status = 'active' and m.role in ('owner', 'admin')
  ) or exists (
    select 1
      from public.employees e
      join public.roles r on r.id = e.role_id
     where e.organization_id = p_org_id and e.user_id = auth.uid()
       and e.status = 'ACTIVE' and r.is_system_admin
  );
$$;

create or replace function public.has_employee_permission(p_org_id uuid, p_permission_key text)
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_employee_admin(p_org_id) or exists (
    select 1
      from public.employees e
      join public.roles r on r.id = e.role_id
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions p on p.id = rp.permission_id
     where e.organization_id = p_org_id and e.user_id = auth.uid()
       and e.status = 'ACTIVE' and p.permission_key = p_permission_key
  );
$$;

alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.employees enable row level security;

drop policy if exists permissions_read_authenticated on public.permissions;
create policy permissions_read_authenticated on public.permissions for select to authenticated using (auth.uid() is not null);
drop policy if exists roles_employee_access on public.roles;
create policy roles_employee_access on public.roles for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_employee_permission(organization_id, 'RBAC_EDIT'));
drop policy if exists role_permissions_employee_access on public.role_permissions;
create policy role_permissions_employee_access on public.role_permissions for all to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and public.is_org_member(r.organization_id)))
  with check (exists (select 1 from public.roles r where r.id = role_id and public.has_employee_permission(r.organization_id, 'RBAC_EDIT')));
drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees for select to authenticated
  using (public.is_org_member(organization_id) and public.has_branch_access(organization_id, branch_id));
drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees for insert to authenticated
  with check (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id));
drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees for update to authenticated
  using (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT'))
  with check (public.has_employee_permission(organization_id, 'EMPLOYEE_EDIT') and public.has_branch_access(organization_id, branch_id));

grant execute on function public.next_employee_code(uuid) to authenticated;
grant execute on function public.has_employee_permission(uuid, text) to authenticated;
grant execute on function public.create_employee(uuid, text, text, text, uuid, uuid, uuid, public.employee_status, date, date) to authenticated;