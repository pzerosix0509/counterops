-- supabase/reset_demo.sql
-- Reset dữ liệu demo (giữ schema + giữ users trong auth.users).
-- Chạy 1 lần trước khi chạy lại seed.sql với UUID mới.

-- 0. Gỡ tham chiếu từ profiles -> organizations trước tiên
update public.profiles set default_organization_id = null;

-- 1. Xoá theo thứ tự: bảng con -> bảng cha
delete from public.audit_logs;
delete from public.payments;
delete from public.order_items;
delete from public.orders;
delete from public.end_of_day_reports;
delete from public.recipe_items;
delete from public.recipes;
delete from public.product_tags;
delete from public.product_branch_settings;
delete from public.products;
delete from public.menu_categories;
delete from public.inventory_movements;
delete from public.inventory_balances;
delete from public.inventory_items;
delete from public.dining_tables;
delete from public.rooms;
delete from public.areas;
delete from public.sales_channels;
delete from public.memberships;
delete from public.branches;
delete from public.organizations;