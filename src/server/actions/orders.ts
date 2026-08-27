"use server";

import { revalidatePath } from "next/cache";
import { orderInputSchema, paymentInputSchema, kitchenStatusSchema, cancelOrderItemSchema } from "@/lib/validation/schemas";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { canCreateOrder, canPayOrder, canUpdateKitchen, requireRole } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateTotals, newOrderNumber, classifyPaymentStatus } from "@/lib/calculations/orders";
import { clearAiToolCache } from "@/server/ai/cache";
import { upsertCustomerByPhone } from "@/server/customers";

const OPEN_ORDER_STATUSES = ["draft", "open", "sent_to_kitchen", "partially_paid"] as const;

async function nextOrderSeq(supabase: ReturnType<typeof createSupabaseServerClient>, branchId: string): Promise<number> {
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("branch_id", branchId);
  return (count ?? 0) + 1;
}

async function loadProductCostSnapshots(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  organizationId: string,
  products: Map<string, any>
): Promise<Map<string, number>> {
  const costs = new Map<string, number>();
  const productList = Array.from(products.values());
  for (const product of productList) {
    costs.set(product.id, Number(product.cost_price ?? 0));
  }

  const preparedIds = productList
    .filter((product) => product.product_type === "prepared")
    .map((product) => product.id);
  if (preparedIds.length === 0) return costs;

  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, product_id, version, recipe_items(quantity, estimated_cost, inventory_item:inventory_items(cost_price))")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in("product_id", preparedIds)
    .order("version", { ascending: false });

  const latestRecipeByProduct = new Map<string, any>();
  for (const recipe of recipes ?? []) {
    if (!latestRecipeByProduct.has(recipe.product_id)) {
      latestRecipeByProduct.set(recipe.product_id, recipe);
    }
  }

  for (const [productId, recipe] of Array.from(latestRecipeByProduct.entries())) {
    const recipeCost = (recipe.recipe_items ?? []).reduce((sum: number, item: any) => {
      const unitCost = Number(item.inventory_item?.cost_price ?? item.estimated_cost ?? 0);
      return sum + Number(item.quantity ?? 0) * unitCost;
    }, 0);
    costs.set(productId, Math.round(recipeCost));
  }

  return costs;
}

export async function createOrUpdateOrder(
  organizationId: string,
  branchId: string,
  input: unknown,
  orderId: string | null
): Promise<ActionResult<{ orderId: string; subtotal: number; total: number }>> {
  const m = await requireRole(organizationId, canCreateOrder);
  const parsed = orderInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    }
    return actionFail("VALIDATION_ERROR", "Vui lòng kiểm tra các trường", fieldErrors);
  }
  const supabase = createSupabaseServerClient();

  const productIds = parsed.data.items.map((i) => i.productId);
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("*")
    .in("id", productIds)
    .eq("organization_id", m.organization.id);
  if (prodErr) return actionFail("INTERNAL_ERROR", "Không đọc được sản phẩm");
  const productMap = new Map((products ?? []).map((p) => [p.id, p]));
  for (const item of parsed.data.items) {
    if (!productMap.has(item.productId)) {
      return actionFail("VALIDATION_ERROR", `Món không tồn tại: ${item.productId}`);
    }
  }
  const productCostMap = await loadProductCostSnapshots(supabase, m.organization.id, productMap);

  let customerId: string | null = null;
  try {
    customerId = await upsertCustomerByPhone(
      supabase,
      m.organization.id,
      parsed.data.customerPhone,
      parsed.data.customerName,
    );
  } catch (error) {
    return actionFail("INTERNAL_ERROR", error instanceof Error ? error.message : "Không lưu được khách");
  }

  const itemsForCalc = parsed.data.items.map((item) => {
    const p = productMap.get(item.productId)!;
    return {
      productId: p.id,
      productName: p.name,
      unitPrice: p.sale_price,
      costPrice: productCostMap.get(p.id) ?? Number(p.cost_price ?? 0),
      quantity: item.quantity,
    };
  });
  const totals = calculateTotals(itemsForCalc, parsed.data.discountAmount, parsed.data.taxAmount, parsed.data.serviceFeeAmount);

  if (orderId) {
    const { data: existing } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("organization_id", m.organization.id)
      .maybeSingle();
    if (!existing) return actionFail("NOT_FOUND", "Không tìm thấy đơn");
    if (existing.status === "paid" || existing.status === "cancelled" || existing.status === "refunded") {
      return actionFail("ORDER_LOCKED", "Đơn đã khoá, không thể chỉnh sửa.");
    }
    if (parsed.data.tableId && parsed.data.tableId !== existing.table_id) {
      const { data: tableOrder } = await supabase
        .from("orders")
        .select("id, order_number")
        .eq("branch_id", branchId)
        .eq("table_id", parsed.data.tableId)
        .in("status", [...OPEN_ORDER_STATUSES])
        .neq("id", orderId)
        .maybeSingle();
      if (tableOrder) {
        return actionFail("TABLE_OCCUPIED", `Bàn đã có khách (${tableOrder.order_number}). Vui lòng chọn đúng đơn trên bàn để cập nhật hoặc thanh toán.`);
      }
    }
    await supabase.from("order_items").delete().eq("order_id", orderId);
    const rows = parsed.data.items.map((item) => {
      const p = productMap.get(item.productId)!;
      return {
        organization_id: m.organization.id,
        branch_id: branchId,
        order_id: orderId,
        product_id: p.id,
        product_name_snapshot: p.name,
        unit_price_snapshot: p.sale_price,
        cost_price_snapshot: productCostMap.get(p.id) ?? Number(p.cost_price ?? 0),
        quantity: item.quantity,
        note: item.note ?? null,
        kitchen_status: p.product_type === "prepared" ? "pending" : "not_required",
      };
    });
    await supabase.from("order_items").insert(rows);
    await supabase
      .from("orders")
      .update({
        table_id: parsed.data.tableId ?? null,
        sales_channel_id: parsed.data.salesChannelId ?? null,
        order_type: parsed.data.orderType,
        subtotal: totals.subtotal,
        discount_amount: totals.discountAmount,
        tax_amount: totals.taxAmount,
        service_fee_amount: totals.serviceFeeAmount,
        total_amount: totals.totalAmount,
        customer_id: customerId ?? existing.customer_id,
        status: "open",
      })
      .eq("id", orderId);
    if (existing.table_id && existing.table_id !== parsed.data.tableId) {
      const { data: otherOpenOrder } = await supabase
        .from("orders")
        .select("id")
        .eq("branch_id", branchId)
        .eq("table_id", existing.table_id)
        .in("status", [...OPEN_ORDER_STATUSES])
        .neq("id", orderId)
        .maybeSingle();
      if (!otherOpenOrder) {
        await supabase.from("dining_tables").update({ status: "available" }).eq("id", existing.table_id);
      }
    }
    if (parsed.data.tableId) {
      await supabase.from("dining_tables").update({ status: "occupied" }).eq("id", parsed.data.tableId);
    }
    revalidatePath("/pos");
    revalidatePath("/tables");
    revalidatePath("/kitchen");
    return actionOk({ orderId, subtotal: totals.subtotal, total: totals.totalAmount });
  }

  // create
  if (parsed.data.tableId) {
    const { data: tableOrder } = await supabase
      .from("orders")
      .select("id, order_number")
      .eq("branch_id", branchId)
      .eq("table_id", parsed.data.tableId)
      .in("status", [...OPEN_ORDER_STATUSES])
      .maybeSingle();
    if (tableOrder) {
      return actionFail("TABLE_OCCUPIED", `Bàn đã có khách (${tableOrder.order_number}). Vui lòng chọn đúng đơn trên bàn để cập nhật hoặc thanh toán.`);
    }
  }

  const seq = await nextOrderSeq(supabase, branchId);
  const orderNumber = newOrderNumber(seq);
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      organization_id: m.organization.id,
      branch_id: branchId,
      order_number: orderNumber,
      table_id: parsed.data.tableId ?? null,
      sales_channel_id: parsed.data.salesChannelId ?? null,
      order_type: parsed.data.orderType,
      status: "open",
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      tax_amount: totals.taxAmount,
      service_fee_amount: totals.serviceFeeAmount,
      total_amount: totals.totalAmount,
      paid_amount: 0,
      debt_amount: totals.totalAmount,
      opened_by: m.membership.user_id,
      customer_id: customerId,
    })
    .select("id")
    .single();
  if (orderErr || !order) return actionFail("INTERNAL_ERROR", "Không tạo được đơn: " + (orderErr?.message ?? ""));

  if (parsed.data.tableId) {
    await supabase.from("dining_tables").update({ status: "occupied" }).eq("id", parsed.data.tableId);
  }

  const rows = parsed.data.items.map((item) => {
    const p = productMap.get(item.productId)!;
    return {
      organization_id: m.organization.id,
      branch_id: branchId,
      order_id: order.id,
      product_id: p.id,
      product_name_snapshot: p.name,
      unit_price_snapshot: p.sale_price,
      cost_price_snapshot: productCostMap.get(p.id) ?? Number(p.cost_price ?? 0),
      quantity: item.quantity,
      note: item.note ?? null,
      kitchen_status: p.product_type === "prepared" ? "pending" : "not_required",
    };
  });
  await supabase.from("order_items").insert(rows);

  revalidatePath("/pos");
  revalidatePath("/tables");
  revalidatePath("/kitchen");
  revalidatePath("/dashboard");
  return actionOk({ orderId: order.id, subtotal: totals.subtotal, total: totals.totalAmount });
}

export async function payOrder(organizationId: string, input: unknown): Promise<ActionResult<{ orderId: string; status: string; total: number; paid: number; debt: number }>> {
  const m = await requireRole(organizationId, canPayOrder);
  const parsed = paymentInputSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Thiếu thông tin thanh toán");
  const supabase = createSupabaseServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select("*, items:order_items(*, product:products(*))")
    .eq("id", parsed.data.orderId)
    .eq("organization_id", m.organization.id)
    .maybeSingle();
  if (!order) return actionFail("NOT_FOUND", "Không tìm thấy đơn");
  if (order.status === "paid") return actionFail("CONFLICT", "Đơn đã thanh toán");
  if (order.status === "cancelled" || order.status === "refunded") {
    return actionFail("ORDER_LOCKED", "Đơn đã đóng");
  }

  // Recalculate from items
  const subtotal = (order.items ?? []).reduce(
    (s: number, it: any) => s + Number(it.quantity) * it.unit_price_snapshot,
    0
  );
  const total = Math.max(0, subtotal - (order.discount_amount ?? 0) + (order.tax_amount ?? 0) + (order.service_fee_amount ?? 0));
  const paidTotal = parsed.data.payments.reduce((s, p) => s + p.amount, 0);
  if (paidTotal <= 0) return actionFail("VALIDATION_ERROR", "Số tiền thanh toán phải lớn hơn 0");
  if (paidTotal > total) return actionFail("VALIDATION_ERROR", `Số tiền thanh toán vượt quá tổng đơn (${total}).`);

  const { count: deductionCount } = await supabase
    .from("inventory_movements")
    .select("id", { count: "exact", head: true })
    .eq("branch_id", order.branch_id)
    .eq("reference_type", "order")
    .eq("reference_id", order.id)
    .eq("movement_type", "sale_deduction");
  const shouldDeductStock = (deductionCount ?? 0) === 0;

  type StockCheck = {
    inventoryItemId: string;
    itemName: string;
    unit: string;
    quantityAvailable: number;
    quantityNeeded: number;
  };
  const checkMap = new Map<string, StockCheck>();
  const addCheck = (check: StockCheck) => {
    const current = checkMap.get(check.inventoryItemId);
    if (!current) {
      checkMap.set(check.inventoryItemId, check);
      return;
    }
    current.quantityNeeded += check.quantityNeeded;
  };

  if (shouldDeductStock) {
    for (const it of order.items ?? []) {
      const product = it.product;
      if (!product) continue;
      if (product.product_type === "regular") {
        const linkedId = product.inventory_item_id as string | null;
        if (!linkedId) continue;
        const { data: link } = await supabase
          .from("inventory_items")
          .select("id, name, unit")
          .eq("id", linkedId)
          .eq("organization_id", m.organization.id)
          .maybeSingle();
        if (!link) continue;
        const { data: balance } = await supabase
          .from("inventory_balances")
          .select("quantity_on_hand")
          .eq("branch_id", order.branch_id)
          .eq("inventory_item_id", link.id)
          .maybeSingle();
        addCheck({
          inventoryItemId: link.id,
          itemName: link.name,
          unit: link.unit,
          quantityAvailable: Number(balance?.quantity_on_hand ?? 0),
          quantityNeeded: Number(it.quantity),
        });
        continue;
      }

      const { data: recipe } = await supabase
        .from("recipes")
        .select("id, recipe_items(*, inventory_item:inventory_items(id, name, unit))")
        .eq("product_id", product.id)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      for (const ri of (recipe?.recipe_items ?? []) as any[]) {
        const { data: balance } = await supabase
          .from("inventory_balances")
          .select("quantity_on_hand")
          .eq("branch_id", order.branch_id)
          .eq("inventory_item_id", ri.inventory_item_id)
          .maybeSingle();
        addCheck({
          inventoryItemId: ri.inventory_item_id,
          itemName: ri.inventory_item?.name ?? "Hàng kho",
          unit: ri.inventory_item?.unit ?? ri.unit ?? "",
          quantityAvailable: Number(balance?.quantity_on_hand ?? 0),
          quantityNeeded: Number(it.quantity) * Number(ri.quantity),
        });
      }
    }
  }

  const checks = Array.from(checkMap.values());
  const shortages = checks.filter((check) => check.quantityAvailable < check.quantityNeeded);
  if (!m.organization.allow_negative_inventory && shortages.length > 0) {
    const detail = shortages
      .slice(0, 4)
      .map((check) => {
        const missing = check.quantityNeeded - check.quantityAvailable;
        return `${check.itemName}: còn ${check.quantityAvailable.toLocaleString("vi-VN")} ${check.unit}, cần ${check.quantityNeeded.toLocaleString("vi-VN")} ${check.unit}, thiếu ${missing.toLocaleString("vi-VN")} ${check.unit}`;
      })
      .join("; ");
    return actionFail(
      "INSUFFICIENT_STOCK",
      `Không đủ tồn kho. ${detail}${shortages.length > 4 ? `; và ${shortages.length - 4} mặt hàng khác` : ""}. Bật "Cho phép âm kho" trong Cài đặt nếu muốn vẫn thanh toán.`
    );
  }

  // Insert payments + movements
  const paymentRows = parsed.data.payments.map((p) => ({
    organization_id: m.organization.id,
    branch_id: order.branch_id,
    order_id: order.id,
    method: p.method,
    amount: p.amount,
    received_by: m.membership.user_id,
    transaction_ref: p.transactionRef ?? null,
  }));
  await supabase.from("payments").insert(paymentRows);

  for (const c of checks) {
    const { data: balance } = await supabase
      .from("inventory_balances")
      .select("id, quantity_on_hand")
      .eq("branch_id", order.branch_id)
      .eq("inventory_item_id", c.inventoryItemId)
      .maybeSingle();
    const newQty = Number(balance?.quantity_on_hand ?? 0) - c.quantityNeeded;
    if (balance) {
      await supabase.from("inventory_balances").update({ quantity_on_hand: newQty }).eq("id", balance.id);
    } else {
      await supabase.from("inventory_balances").insert({
        organization_id: m.organization.id,
        branch_id: order.branch_id,
        inventory_item_id: c.inventoryItemId,
        quantity_on_hand: newQty,
        low_stock_threshold: 0,
      });
    }
    await supabase.from("inventory_movements").insert({
      organization_id: m.organization.id,
      branch_id: order.branch_id,
      inventory_item_id: c.inventoryItemId,
      movement_type: "sale_deduction",
      quantity_delta: -c.quantityNeeded,
      reference_type: "order",
      reference_id: order.id,
      created_by: m.membership.user_id,
    });
  }

  const newPaid = (order.paid_amount ?? 0) + paidTotal;
  const status = classifyPaymentStatus(total, newPaid);
  const debtAmount = Math.max(0, total - newPaid);

  await supabase
    .from("orders")
    .update({
      paid_amount: newPaid,
      debt_amount: debtAmount,
      total_amount: total,
      subtotal,
      status,
      closed_at: status === "paid" ? new Date().toISOString() : order.closed_at,
      closed_by: status === "paid" ? m.membership.user_id : order.closed_by,
    })
    .eq("id", order.id);

  if (status === "paid" && order.table_id) {
    await supabase.from("dining_tables").update({ status: "occupied" }).eq("id", order.table_id);
  }

  await supabase.from("audit_logs").insert({
    organization_id: m.organization.id,
    branch_id: order.branch_id,
    actor_user_id: m.membership.user_id,
    action: "order.pay",
    entity_type: "orders",
    entity_id: order.id,
    after: { paid: newPaid, total, status },
  });

  revalidatePath("/pos");
  revalidatePath("/tables");
  revalidatePath("/kitchen");
  revalidatePath("/dashboard");
  revalidatePath("/reports/end-of-day");
  clearAiToolCache();
  return actionOk({ orderId: order.id, status, total, paid: newPaid, debt: debtAmount });
}

export async function updateKitchenStatus(
  organizationId: string,
  orderItemId: string,
  input: unknown
): Promise<ActionResult<{ id: string; status: string }>> {
  const m = await requireRole(organizationId, canUpdateKitchen);
  const parsed = kitchenStatusSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Trạng thái không hợp lệ");

  const supabase = createSupabaseServerClient();
  const { data: result, error: rpcErr } = await supabase.rpc("update_kitchen_status_rpc", {
    p_item_id: orderItemId,
    p_new_status: parsed.data.status,
    p_allowed_roles: canUpdateKitchen,
    p_caller_org_id: organizationId,
    p_caller_branch_id: m.branch?.id ?? null,
    p_caller_user_id: m.membership.user_id,
  });

  if (rpcErr) return actionFail("INTERNAL_ERROR", "Không cập nhật được trạng thái bếp: " + rpcErr.message);

  const r = result as { ok: boolean; code?: string; message?: string; table_freed?: boolean; status: string };
  if (!r.ok) {
    const code = r.code ?? "INTERNAL_ERROR";
    return actionFail(code as any, r.message ?? "Lỗi không xác định");
  }

  revalidatePath("/kitchen");
  if (r.table_freed) {
    revalidatePath("/pos");
    revalidatePath("/tables");
  }

  return actionOk({ id: orderItemId, status: r.status });
}

export async function cancelOrderItem(organizationId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canPayOrder);
  const parsed = cancelOrderItemSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Thiếu lý do hủy");
  const supabase = createSupabaseServerClient();
  const { data: item } = await supabase
    .from("order_items")
    .select("id, order_id, quantity, unit_price_snapshot, orders!inner(organization_id, status)")
    .eq("id", parsed.data.orderItemId)
    .maybeSingle();
  if (!item) return actionFail("NOT_FOUND", "Không tìm thấy món");
  if ((item as any).orders.status === "paid") {
    return actionFail("ORDER_LOCKED", "Đơn đã thanh toán, dùng luồng hoàn tiền.");
  }
  await supabase
    .from("order_items")
    .update({
      kitchen_status: "cancelled",
      cancellation_stage: parsed.data.stage,
      cancelled_by: m.membership.user_id,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.orderItemId);
  const { data: order } = await supabase
    .from("orders")
    .select("subtotal, total_amount, discount_amount, tax_amount, service_fee_amount")
    .eq("id", (item as any).order_id)
    .maybeSingle();
  if (order) {
    const newSubtotal = (order.subtotal ?? 0) - (item as any).unit_price_snapshot * (item as any).quantity;
    const newTotal = Math.max(0, newSubtotal - (order.discount_amount ?? 0) + (order.tax_amount ?? 0) + (order.service_fee_amount ?? 0));
    await supabase
      .from("orders")
      .update({ subtotal: newSubtotal, total_amount: newTotal })
      .eq("id", (item as any).order_id);
  }
  await supabase.from("audit_logs").insert({
    organization_id: m.organization.id,
    actor_user_id: m.membership.user_id,
    action: "order_item.cancel",
    entity_type: "order_items",
    entity_id: parsed.data.orderItemId,
    after: { reason: parsed.data.reason, stage: parsed.data.stage },
  });
  revalidatePath("/pos");
  revalidatePath("/kitchen");
  revalidatePath("/dashboard");
  return actionOk({ id: parsed.data.orderItemId });
}
