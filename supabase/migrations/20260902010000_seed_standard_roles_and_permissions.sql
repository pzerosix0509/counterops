-- ============================================================
-- Migration: Seed Standard Roles and RBAC Permissions
-- ============================================================
-- Ensures all 5 standard roles exist for all organizations:
-- 1. Admin (is_system_admin: true)
-- 2. Quản lý (Manager)
-- 3. Thu ngân (Cashier)
-- 4. Bếp (Kitchen)
-- 5. Nhân viên (Staff)
-- ============================================================

-- 1. Standard Permissions
insert into public.permissions (permission_key, module, description) values
  ('EMPLOYEE_VIEW', 'EMPLOYEE', 'Xem hồ sơ nhân viên'),
  ('EMPLOYEE_EDIT', 'EMPLOYEE', 'Thêm và sửa hồ sơ nhân viên'),
  ('EMPLOYEE_STATUS_EDIT', 'EMPLOYEE', 'Đổi trạng thái nhân viên'),
  ('RBAC_VIEW', 'RBAC', 'Xem vai trò và quyền'),
  ('RBAC_EDIT', 'RBAC', 'Cấu hình vai trò và quyền'),
  ('POS_ACCESS', 'POS', 'Truy cập màn hình bán hàng'),
  ('ORDER_CREATE', 'POS', 'Tạo đơn hàng'),
  ('ORDER_PAY', 'POS', 'Thanh toán đơn hàng'),
  ('TABLE_MANAGE', 'TABLE', 'Quản lý bàn / phòng'),
  ('KITCHEN_ACCESS', 'KITCHEN', 'Truy cập màn hình bếp'),
  ('KITCHEN_UPDATE', 'KITCHEN', 'Cập nhật trạng thái món bếp'),
  ('MENU_VIEW', 'MENU', 'Xem thực đơn'),
  ('MENU_MANAGE', 'MENU', 'Thêm, sửa thực đơn và món'),
  ('INVENTORY_VIEW', 'INVENTORY', 'Xem tồn kho'),
  ('INVENTORY_MANAGE', 'INVENTORY', 'Quản lý xuất nhập tồn kho'),
  ('REPORT_VIEW', 'REPORT', 'Xem báo cáo doanh thu')
on conflict (permission_key) do update
set module = excluded.module,
    description = excluded.description;

-- 2. Update trigger function for all newly created organizations
create or replace function public.seed_employee_roles()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_admin_id uuid;
  v_manager_id uuid;
  v_cashier_id uuid;
  v_kitchen_id uuid;
  v_staff_id uuid;
begin
  -- Insert all 5 standard roles
  insert into public.roles (organization_id, name, is_system_admin)
  values
    (new.id, 'Admin', true),
    (new.id, 'Quản lý', false),
    (new.id, 'Thu ngân', false),
    (new.id, 'Bếp', false),
    (new.id, 'Nhân viên', false)
  on conflict (organization_id, name) do nothing;

  select id into v_admin_id from public.roles where organization_id = new.id and name = 'Admin' limit 1;
  select id into v_manager_id from public.roles where organization_id = new.id and name = 'Quản lý' limit 1;
  select id into v_cashier_id from public.roles where organization_id = new.id and name = 'Thu ngân' limit 1;
  select id into v_kitchen_id from public.roles where organization_id = new.id and name = 'Bếp' limit 1;
  select id into v_staff_id from public.roles where organization_id = new.id and name = 'Nhân viên' limit 1;

  -- Admin & Quản lý: all permissions
  if v_admin_id is not null then
    insert into public.role_permissions (role_id, permission_id)
    select v_admin_id, p.id from public.permissions p on conflict do nothing;
  end if;

  if v_manager_id is not null then
    insert into public.role_permissions (role_id, permission_id)
    select v_manager_id, p.id from public.permissions p on conflict do nothing;
  end if;

  -- Thu ngân: POS, orders, tables, menu
  if v_cashier_id is not null then
    insert into public.role_permissions (role_id, permission_id)
    select v_cashier_id, p.id from public.permissions p
    where p.permission_key in ('POS_ACCESS', 'ORDER_CREATE', 'ORDER_PAY', 'TABLE_MANAGE', 'MENU_VIEW')
    on conflict do nothing;
  end if;

  -- Bếp: Kitchen & menu
  if v_kitchen_id is not null then
    insert into public.role_permissions (role_id, permission_id)
    select v_kitchen_id, p.id from public.permissions p
    where p.permission_key in ('KITCHEN_ACCESS', 'KITCHEN_UPDATE', 'MENU_VIEW')
    on conflict do nothing;
  end if;

  -- Nhân viên: POS, orders, tables, menu
  if v_staff_id is not null then
    insert into public.role_permissions (role_id, permission_id)
    select v_staff_id, p.id from public.permissions p
    where p.permission_key in ('POS_ACCESS', 'ORDER_CREATE', 'ORDER_PAY', 'TABLE_MANAGE', 'MENU_VIEW')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_seed_employee_roles on public.organizations;
create trigger trg_seed_employee_roles after insert on public.organizations
for each row execute function public.seed_employee_roles();

-- 3. Backfill missing roles for all existing organizations
insert into public.roles (organization_id, name, is_system_admin)
select o.id, seed.name, seed.is_system_admin
from public.organizations o
cross join (values
  ('Admin', true),
  ('Quản lý', false),
  ('Thu ngân', false),
  ('Bếp', false),
  ('Nhân viên', false)
) as seed(name, is_system_admin)
on conflict (organization_id, name) do nothing;

-- 4. Backfill role permissions for all existing organizations
-- Admin & Quản lý
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.is_system_admin or r.name = 'Quản lý'
on conflict do nothing;

-- Thu ngân
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'Thu ngân'
  and p.permission_key in ('POS_ACCESS', 'ORDER_CREATE', 'ORDER_PAY', 'TABLE_MANAGE', 'MENU_VIEW')
on conflict do nothing;

-- Bếp
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'Bếp'
  and p.permission_key in ('KITCHEN_ACCESS', 'KITCHEN_UPDATE', 'MENU_VIEW')
on conflict do nothing;

-- Nhân viên
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'Nhân viên'
  and p.permission_key in ('POS_ACCESS', 'ORDER_CREATE', 'ORDER_PAY', 'TABLE_MANAGE', 'MENU_VIEW')
on conflict do nothing;

