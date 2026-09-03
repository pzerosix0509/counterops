-- supabase/seed.sql
-- Demo data for "Quán Cafe Demo".
-- Chạy SAU khi 0001_init.sql đã chạy thành công.
-- Thay 3 biến ở đầu file bằng UUID thật, rồi chạy nguyên file trong SQL editor.
--
--   v_owner_user_id   = auth.users.id của user làm chủ cửa hàng
--   v_organization_id = uuid mới (gen_random_uuid() hoặc copy từ app)
--   v_branch_id       = uuid mới
--
-- Lấy user id: select id, email from auth.users;
-- Sinh uuid:    select gen_random_uuid();

do $$
declare
  v_owner_user_id   uuid := '1fef06b8-3998-46ae-9ad6-62faa4275ab1';
  v_organization_id uuid := gen_random_uuid();
  v_branch_id       uuid := gen_random_uuid();
begin
  insert into public.organizations (id, name, slug, business_type)
  values (v_organization_id, 'Quán Cafe Demo', 'cafe-demo', 'restaurant')
  on conflict (id) do nothing;

  insert into public.branches (id, organization_id, name, address, phone)
  values (v_branch_id, v_organization_id, 'Chi nhánh trung tâm', '123 Lê Lợi, Q1, HCM', '0900000000')
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, default_organization_id)
  values (v_owner_user_id, 'Chủ cửa hàng Demo', v_organization_id)
  on conflict (id) do nothing;

  insert into public.memberships (organization_id, branch_id, user_id, role, status, invited_by, joined_at)
  values (v_organization_id, null, v_owner_user_id, 'owner', 'active', v_owner_user_id, now())
  on conflict (organization_id, branch_id, user_id, role) do nothing;

  -- 4. Standard Permissions & Roles
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

  insert into public.roles (organization_id, name, is_system_admin)
  values
    (v_organization_id, 'Admin', true),
    (v_organization_id, 'Quản lý', false),
    (v_organization_id, 'Thu ngân', false),
    (v_organization_id, 'Bếp', false),
    (v_organization_id, 'Nhân viên', false)
  on conflict (organization_id, name) do nothing;

  -- Admin & Quản lý: all permissions
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.organization_id = v_organization_id
    and (r.is_system_admin or r.name = 'Quản lý')
  on conflict do nothing;

  -- Thu ngân: POS, orders, tables, menu view
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.organization_id = v_organization_id
    and r.name = 'Thu ngân'
    and p.permission_key in ('POS_ACCESS', 'ORDER_CREATE', 'ORDER_PAY', 'TABLE_MANAGE', 'MENU_VIEW')
  on conflict do nothing;

  -- Bếp: Kitchen & menu view
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.organization_id = v_organization_id
    and r.name = 'Bếp'
    and p.permission_key in ('KITCHEN_ACCESS', 'KITCHEN_UPDATE', 'MENU_VIEW')
  on conflict do nothing;

  -- Nhân viên: POS, orders, tables, menu view
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.organization_id = v_organization_id
    and r.name = 'Nhân viên'
    and p.permission_key in ('POS_ACCESS', 'ORDER_CREATE', 'ORDER_PAY', 'TABLE_MANAGE', 'MENU_VIEW')
  on conflict do nothing;

  -- 5. Sales channels
  insert into public.sales_channels (organization_id, name, type, is_active)
  select v_organization_id, c.name, c.type, true
  from (values
    ('Tại quán'::text,    'direct'::text),
    ('Mang đi'::text,     'direct'::text),
    ('Online'::text,      'online'::text)
  ) as c(name, type)
  where not exists (
    select 1 from public.sales_channels s
    where s.organization_id = v_organization_id and s.name = c.name
  );

  -- 6. Menu categories
  insert into public.menu_categories (organization_id, name, sort_order, menu_type)
  select v_organization_id, c.name, c.sort_order, c.menu_type::public.menu_type
  from (values
    ('Cà phê'::text, 1, 'drink'::text),
    ('Trà'::text,    2, 'drink'::text),
    ('Đồ ăn'::text,  3, 'food'::text),
    ('Khác'::text,   4, 'other'::text)
  ) as c(name, sort_order, menu_type)
  where not exists (
    select 1 from public.menu_categories m
    where m.organization_id = v_organization_id and m.name = c.name
  );

  -- 7. Inventory items (cast item_type -> enum)
  insert into public.inventory_items (organization_id, name, code, item_type, unit, cost_price, can_be_ingredient, can_be_sold)
  select v_organization_id, i.name, i.code, i.item_type::public.inventory_item_type, i.unit, i.cost_price, i.can_be_ingredient, i.can_be_sold
  from (values
    ('Cà phê bột'::text,     'INV-CF-BOT'::text,    'ingredient'::text,      'g'::text,   5, true, false),
    ('Sữa đặc'::text,        'INV-SUA-DAC'::text,   'ingredient'::text,      'ml'::text,  2, true, true),
    ('Trà đào'::text,        'INV-TRA-DAO'::text,   'ingredient'::text,      'g'::text,   3, true, false),
    ('Đào hộp'::text,        'INV-DAO-HOP'::text,   'ingredient'::text,      'g'::text,   6, true, false),
    ('Nước suối chai'::text, 'INV-NUOC-SUOI'::text, 'sellable_product'::text,'chai'::text,4000, false, true),
    ('Gạo'::text,            'INV-GAO'::text,       'ingredient'::text,      'kg'::text,  22000, true, false)
  ) as i(name, code, item_type, unit, cost_price, can_be_ingredient, can_be_sold)
  where not exists (
    select 1 from public.inventory_items ii
    where ii.organization_id = v_organization_id and ii.code = i.code
  );

  -- 8. Balances + initial movements
  insert into public.inventory_balances (organization_id, branch_id, inventory_item_id, quantity_on_hand, low_stock_threshold)
  select v_organization_id, v_branch_id, ii.id, 1000, 100
  from public.inventory_items ii
  where ii.organization_id = v_organization_id
  on conflict (branch_id, inventory_item_id) do nothing;

  insert into public.inventory_movements (organization_id, branch_id, inventory_item_id, movement_type, quantity_delta, unit_cost, note, created_by)
  select v_organization_id, v_branch_id, ib.inventory_item_id, 'purchase'::public.movement_type, 1000, 0, 'Tồn kho ban đầu'::text, v_owner_user_id
  from public.inventory_balances ib
  where ib.organization_id = v_organization_id and ib.branch_id = v_branch_id
    and not exists (
      select 1 from public.inventory_movements mv
      where mv.organization_id = v_organization_id
        and mv.branch_id = v_branch_id
        and mv.inventory_item_id = ib.inventory_item_id
        and mv.note = 'Tồn kho ban đầu'
    );

  -- 9. Products (cast menu_type, product_type)
  insert into public.products (organization_id, category_id, name, code, menu_type, product_type, cost_price, sale_price, unit)
  select v_organization_id, mc.id, p.name, p.code,
         p.menu_type::public.menu_type,
         p.product_type::public.product_type,
         p.cost_price, p.sale_price, p.unit
  from (values
    ('Cà phê'::text, 'Cà phê sữa'::text, 'P-CF-SUA'::text,    'drink'::text,   'prepared'::text, 8000,  30000, 'phần'::text),
    ('Trà'::text,    'Trà đào'::text,     'P-TRA-DAO'::text,   'drink'::text,   'prepared'::text, 9000,  35000, 'phần'::text),
    ('Khác'::text,   'Nước suối'::text,   'P-NUOC-SUOI'::text, 'drink'::text,   'regular'::text,  4000,  10000, 'chai'::text),
    ('Đồ ăn'::text,  'Cơm phần'::text,    'P-COM-PHAN'::text,  'food'::text,    'prepared'::text, 18000, 55000, 'phần'::text)
  ) as p(category_name, name, code, menu_type, product_type, cost_price, sale_price, unit)
  join public.menu_categories mc
    on mc.organization_id = v_organization_id and mc.name = p.category_name
  where not exists (
    select 1 from public.products pp
    where pp.organization_id = v_organization_id and pp.code = p.code
  );

  update public.products p
  set inventory_item_id = i.id
  from public.inventory_items i
  where p.organization_id = v_organization_id
    and i.organization_id = v_organization_id
    and p.code = 'P-NUOC-SUOI'
    and i.code = 'INV-NUOC-SUOI';

  -- 10. Recipes
  insert into public.recipes (organization_id, product_id, version, is_active)
  select v_organization_id, p.id, 1, true
  from public.products p
  where p.organization_id = v_organization_id
    and p.product_type = 'prepared'
    and not exists (select 1 from public.recipes r where r.product_id = p.id);

  -- 11. Recipe items
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity, unit, estimated_cost)
  select r.id, i.id, ri.q, ri.u, ri.c
  from (values
    ('P-CF-SUA'::text,   'INV-CF-BOT'::text,  20::numeric,  'g'::text,   100),
    ('P-CF-SUA'::text,   'INV-SUA-DAC'::text, 30::numeric,  'ml'::text,  60),
    ('P-TRA-DAO'::text,  'INV-TRA-DAO'::text, 5::numeric,   'g'::text,   15),
    ('P-TRA-DAO'::text,  'INV-DAO-HOP'::text, 30::numeric,  'g'::text,   180),
    ('P-COM-PHAN'::text, 'INV-GAO'::text,     0.2::numeric, 'kg'::text,  4400)
  ) as ri(product_code, item_code, q, u, c)
  join public.products p on p.organization_id = v_organization_id and p.code = ri.product_code
  join public.recipes r on r.product_id = p.id and r.is_active = true
  join public.inventory_items i on i.organization_id = v_organization_id and i.code = ri.item_code
  where not exists (
    select 1 from public.recipe_items existing
    where existing.recipe_id = r.id and existing.inventory_item_id = i.id
  );

  -- 12. Areas
  insert into public.areas (organization_id, branch_id, name, sort_order)
  select v_organization_id, v_branch_id, a.name, a.sort_order
  from (values
    ('Lầu 1'::text, 1),
    ('Lầu 2'::text, 2)
  ) as a(name, sort_order)
  where not exists (
    select 1 from public.areas x
    where x.organization_id = v_organization_id and x.name = a.name
  );

  -- 13. Dining tables
  insert into public.dining_tables (organization_id, branch_id, area_id, name, seats, status, sort_order)
  select v_organization_id, v_branch_id, a.id, t.name, t.seats, 'available'::public.table_status, t.sort_order
  from (values
    ('Lầu 1'::text, 'A1'::text, 4, 1),
    ('Lầu 1'::text, 'A2'::text, 4, 2),
    ('Lầu 1'::text, 'A3'::text, 6, 3),
    ('Lầu 2'::text, 'B1'::text, 2, 4),
    ('Lầu 2'::text, 'B2'::text, 4, 5)
  ) as t(area_name, name, seats, sort_order)
  join public.areas a on a.organization_id = v_organization_id and a.name = t.area_name
  where not exists (
    select 1 from public.dining_tables x
    where x.branch_id = v_branch_id and x.name = t.name
  );
end $$;
