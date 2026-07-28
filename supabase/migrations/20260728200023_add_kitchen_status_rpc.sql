-- RPC: update kitchen status atomically, reducing round-trips from 3-4 to 1.
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
  v_order_id uuid;
  v_order_status order_status;
  v_table_id uuid;
  v_remaining_count int;
begin
  -- 1. Read order_item + order in a single scan
  select oi.order_id, o.status, o.table_id
    into v_order_id, v_order_status, v_table_id
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where oi.id = p_item_id
     and o.organization_id = p_caller_org_id
     and (p_caller_branch_id is null or o.branch_id = p_caller_branch_id);

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Không tìm thấy món');
  end if;

  -- 2. Authorization: caller must have an active membership with a permitted role
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

  -- 3. Update the item
  update public.order_items
     set kitchen_status = p_new_status
   where id = p_item_id;

  -- 4. If served + paid + table, check if table becomes free
  if p_new_status = 'served' and v_order_status = 'paid' and v_table_id is not null then
    select count(*) into v_remaining_count
      from public.order_items
     where order_id = v_order_id
       and kitchen_status in ('pending', 'cooking', 'ready');

    if v_remaining_count = 0 then
      update public.dining_tables
         set status = 'available'
       where id = v_table_id;
      return jsonb_build_object(
        'ok', true,
        'item_id', p_item_id,
        'status', p_new_status,
        'table_freed', true
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'item_id', p_item_id,
    'status', p_new_status,
    'table_freed', false
  );
end;
$$;
