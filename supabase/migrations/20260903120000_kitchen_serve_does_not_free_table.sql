-- Serving an item means staff delivered it. It must not end the table.
-- Table stays occupied until POS marks it available after the guest leaves.
create or replace function public.update_kitchen_status_rpc(
  p_item_id uuid,
  p_new_status kitchen_status,
  p_allowed_roles membership_role[],
  p_caller_org_id uuid,
  p_caller_branch_id uuid,
  p_caller_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_status order_status;
begin
  select o.status
    into v_order_status
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where oi.id = p_item_id
     and o.organization_id = p_caller_org_id
     and (p_caller_branch_id is null or o.branch_id = p_caller_branch_id);

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Không tìm thấy món');
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.organization_id = p_caller_org_id
      and m.user_id = p_caller_user_id
      and m.status = 'active'
      and m.role = any(p_allowed_roles)
  ) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Bạn không có quyền cập nhật món này');
  end if;

  if v_order_status in ('cancelled', 'refunded') then
    return jsonb_build_object('ok', false, 'code', 'ORDER_LOCKED', 'message', 'Đơn đã đóng, không thể cập nhật bếp');
  end if;

  update public.order_items
     set kitchen_status = p_new_status
   where id = p_item_id;

  return jsonb_build_object(
    'ok', true,
    'item_id', p_item_id,
    'status', p_new_status,
    'table_freed', false
  );
end;
$$;
