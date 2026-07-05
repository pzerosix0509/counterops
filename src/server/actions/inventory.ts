"use server";

import { revalidatePath } from "next/cache";
import { inventoryItemSchema, inventoryMovementSchema } from "@/lib/validation/schemas";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { canManageInventory, requireRole } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clearAiToolCache } from "@/server/ai/cache";

export async function createInventoryItem(
  organizationId: string,
  branchId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageInventory);
  const parsed = inventoryItemSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Thiếu hoặc sai thông tin hàng hóa");
  const admin = createSupabaseAdminClient();
  const { data: exists } = await admin
    .from("inventory_items")
    .select("id")
    .eq("organization_id", m.organization.id)
    .eq("code", parsed.data.code)
    .maybeSingle();
  if (exists) return actionFail("CONFLICT", "Mã hàng đã tồn tại", { code: ["Mã hàng đã tồn tại"] });

  const { data: item, error } = await admin
    .from("inventory_items")
    .insert({
      organization_id: m.organization.id,
      name: parsed.data.name,
      code: parsed.data.code,
      item_type: parsed.data.itemType,
      unit: parsed.data.unit,
      cost_price: parsed.data.costPrice,
      description: parsed.data.description ?? null,
      image_url: parsed.data.imageUrl ?? null,
    })
    .select("id")
    .single();
  if (error || !item) return actionFail("INTERNAL_ERROR", "Không tạo được hàng hóa: " + (error?.message ?? ""));

  if (parsed.data.initialQuantity > 0) {
    await admin.from("inventory_balances").upsert({
      organization_id: m.organization.id,
      branch_id: branchId,
      inventory_item_id: item.id,
      quantity_on_hand: parsed.data.initialQuantity,
      low_stock_threshold: parsed.data.lowStockThreshold,
    });
    await admin.from("inventory_movements").insert({
      organization_id: m.organization.id,
      branch_id: branchId,
      inventory_item_id: item.id,
      movement_type: "purchase",
      quantity_delta: parsed.data.initialQuantity,
      unit_cost: parsed.data.costPrice,
      reference_type: "initial",
      note: "Tồn kho ban đầu",
      created_by: m.membership.user_id,
    });
  } else {
    await admin.from("inventory_balances").insert({
      organization_id: m.organization.id,
      branch_id: branchId,
      inventory_item_id: item.id,
      quantity_on_hand: 0,
      low_stock_threshold: parsed.data.lowStockThreshold,
    });
  }
  revalidatePath("/inventory");
  clearAiToolCache();
  return actionOk({ id: item.id });
}

export async function createInventoryMovement(
  organizationId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageInventory);
  const parsed = inventoryMovementSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Thiếu thông tin phiếu kho");
  const admin = createSupabaseAdminClient();

  const { data: balance } = await admin
    .from("inventory_balances")
    .select("*")
    .eq("branch_id", parsed.data.branchId)
    .eq("inventory_item_id", parsed.data.inventoryItemId)
    .maybeSingle();

  if (parsed.data.quantityDelta < 0) {
    const have = Number(balance?.quantity_on_hand ?? 0);
    const need = -parsed.data.quantityDelta;
    if (!m.organization.allow_negative_inventory && have < need) {
      return actionFail(
        "INSUFFICIENT_STOCK",
        `Tồn kho không đủ (còn ${have.toLocaleString("vi-VN")}, cần ${need.toLocaleString("vi-VN")}). Bật "Cho phép âm kho" trong Cài đặt nếu muốn vẫn ghi phiếu.`
      );
    }
  }

  const { data: mv, error } = await admin
    .from("inventory_movements")
    .insert({
      organization_id: m.organization.id,
      branch_id: parsed.data.branchId,
      inventory_item_id: parsed.data.inventoryItemId,
      movement_type: parsed.data.movementType,
      quantity_delta: parsed.data.quantityDelta,
      unit_cost: parsed.data.unitCost,
      note: parsed.data.note ?? null,
      created_by: m.membership.user_id,
    })
    .select("id")
    .single();
  if (error || !mv) return actionFail("INTERNAL_ERROR", "Không ghi được phiếu kho: " + (error?.message ?? ""));

  if (balance) {
    const newQty = Number(balance.quantity_on_hand) + parsed.data.quantityDelta;
    await admin
      .from("inventory_balances")
      .update({ quantity_on_hand: newQty })
      .eq("id", balance.id);
  } else {
    await admin.from("inventory_balances").insert({
      organization_id: m.organization.id,
      branch_id: parsed.data.branchId,
      inventory_item_id: parsed.data.inventoryItemId,
      quantity_on_hand: parsed.data.quantityDelta,
      low_stock_threshold: 0,
    });
  }

  await admin.from("audit_logs").insert({
    organization_id: m.organization.id,
    branch_id: parsed.data.branchId,
    actor_user_id: m.membership.user_id,
    action: "inventory.movement",
    entity_type: "inventory_movements",
    entity_id: mv.id,
    after: { movement_type: parsed.data.movementType, quantity_delta: parsed.data.quantityDelta },
  });

  revalidatePath("/inventory");
  clearAiToolCache();
  return actionOk({ id: mv.id });
}
