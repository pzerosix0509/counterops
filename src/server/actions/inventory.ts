"use server";

import { revalidatePath } from "next/cache";
import { inventoryItemSchema, inventoryItemUpdateSchema, inventoryMovementSchema } from "@/lib/validation/schemas";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { canManageInventory, requireRole } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearAiToolCache } from "@/server/ai/cache";
import { normalizeItemName } from "@/lib/inventory/sku";
import { buildInventoryDeleteConflictMessage } from "@/lib/calculations/inventory";
import { listPreparedProductsUsingIngredient } from "@/server/queries/inventory";
import {
  deactivateSellableProduct,
  ensureSellableProduct,
  insertInventorySku,
  inventoryNameTaken,
  refreshPreparedCostsForItem,
  resolveCategoryMenuType,
} from "@/server/catalog";

export async function createInventoryItem(
  organizationId: string,
  branchId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageInventory);
  const parsed = inventoryItemSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Thiếu hoặc sai thông tin hàng hóa");
  const supabase = createSupabaseServerClient();
  const name = normalizeItemName(parsed.data.name);
  if (await inventoryNameTaken(supabase, m.organization.id, name)) {
    return actionFail("CONFLICT", "Tên hàng đã tồn tại trong cửa hàng", { name: ["Tên hàng đã tồn tại"] });
  }
  if (parsed.data.canBeSold && (parsed.data.salePrice === undefined || parsed.data.salePrice < 0)) {
    return actionFail("VALIDATION_ERROR", "Hàng bán trên thực đơn cần giá bán.");
  }

  const sku = await insertInventorySku(supabase, {
    organizationId: m.organization.id,
    name,
    unit: parsed.data.unit,
    costPrice: parsed.data.costPrice,
    canBeIngredient: parsed.data.canBeIngredient,
    canBeSold: parsed.data.canBeSold,
    description: parsed.data.description,
  });
  if ("error" in sku) return actionFail("INTERNAL_ERROR", "Không tạo được hàng hóa: " + sku.error);

  if (parsed.data.initialQuantity > 0) {
    await supabase.from("inventory_balances").upsert({
      organization_id: m.organization.id,
      branch_id: branchId,
      inventory_item_id: sku.id,
      quantity_on_hand: parsed.data.initialQuantity,
      low_stock_threshold: parsed.data.lowStockThreshold,
    });
    await supabase.from("inventory_movements").insert({
      organization_id: m.organization.id,
      branch_id: branchId,
      inventory_item_id: sku.id,
      movement_type: "purchase",
      quantity_delta: parsed.data.initialQuantity,
      unit_cost: parsed.data.costPrice,
      reference_type: "initial",
      note: "Tồn kho ban đầu",
      created_by: m.membership.user_id,
    });
  } else {
    await supabase.from("inventory_balances").insert({
      organization_id: m.organization.id,
      branch_id: branchId,
      inventory_item_id: sku.id,
      quantity_on_hand: 0,
      low_stock_threshold: parsed.data.lowStockThreshold,
    });
  }

  if (parsed.data.canBeSold) {
    const menuType = await resolveCategoryMenuType(
      supabase,
      m.organization.id,
      parsed.data.categoryId ?? null,
      parsed.data.menuType ?? "food"
    );
    const linked = await ensureSellableProduct(supabase, {
      organizationId: m.organization.id,
      inventoryItemId: sku.id,
      name,
      unit: parsed.data.unit,
      costPrice: parsed.data.costPrice,
      salePrice: parsed.data.salePrice ?? 0,
      categoryId: parsed.data.categoryId ?? null,
      menuType,
    });
    if ("error" in linked) return actionFail("INTERNAL_ERROR", linked.error);
  }

  revalidatePath("/inventory");
  revalidatePath("/menu");
  clearAiToolCache();
  return actionOk({ id: sku.id });
}

export async function updateInventoryItem(
  organizationId: string,
  branchId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageInventory);
  const parsed = inventoryItemUpdateSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Thiếu hoặc sai thông tin hàng hóa");
  const supabase = createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("inventory_items")
    .select("id, name, can_be_sold")
    .eq("id", parsed.data.id)
    .eq("organization_id", m.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) return actionFail("NOT_FOUND", "Không tìm thấy hàng hóa");

  const name = normalizeItemName(parsed.data.name);
  if (await inventoryNameTaken(supabase, m.organization.id, name, parsed.data.id)) {
    return actionFail("CONFLICT", "Tên hàng đã tồn tại trong cửa hàng", { name: ["Tên hàng đã tồn tại"] });
  }
  if (parsed.data.canBeSold && (parsed.data.salePrice === undefined || parsed.data.salePrice < 0)) {
    return actionFail("VALIDATION_ERROR", "Hàng bán trên thực đơn cần giá bán.");
  }

  const { data: linkedProduct } = await supabase
    .from("products")
    .select("id")
    .eq("organization_id", m.organization.id)
    .eq("inventory_item_id", parsed.data.id)
    .maybeSingle();

  const { error: updateErr } = await supabase
    .from("inventory_items")
    .update({
      name,
      unit: parsed.data.unit,
      cost_price: parsed.data.costPrice,
      description: parsed.data.description ?? null,
      can_be_ingredient: parsed.data.canBeIngredient,
      can_be_sold: parsed.data.canBeSold,
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", m.organization.id);
  if (updateErr) return actionFail("INTERNAL_ERROR", "Không cập nhật được hàng hóa: " + updateErr.message);

  const { data: balance } = await supabase
    .from("inventory_balances")
    .select("id")
    .eq("branch_id", branchId)
    .eq("inventory_item_id", parsed.data.id)
    .maybeSingle();
  if (balance) {
    await supabase
      .from("inventory_balances")
      .update({ low_stock_threshold: parsed.data.lowStockThreshold })
      .eq("id", balance.id);
  } else {
    await supabase.from("inventory_balances").insert({
      organization_id: m.organization.id,
      branch_id: branchId,
      inventory_item_id: parsed.data.id,
      quantity_on_hand: 0,
      low_stock_threshold: parsed.data.lowStockThreshold,
    });
  }

  if (parsed.data.canBeSold) {
    const menuType = await resolveCategoryMenuType(
      supabase,
      m.organization.id,
      parsed.data.categoryId ?? null,
      parsed.data.menuType ?? "food"
    );
    const linked = await ensureSellableProduct(supabase, {
      organizationId: m.organization.id,
      inventoryItemId: parsed.data.id,
      name,
      unit: parsed.data.unit,
      costPrice: parsed.data.costPrice,
      salePrice: parsed.data.salePrice ?? 0,
      categoryId: parsed.data.categoryId ?? null,
      menuType,
    });
    if ("error" in linked) return actionFail("INTERNAL_ERROR", linked.error);
  } else if (linkedProduct) {
    await deactivateSellableProduct(supabase, parsed.data.id);
  }

  await refreshPreparedCostsForItem(supabase, m.organization.id, parsed.data.id);

  await supabase.from("audit_logs").insert({
    organization_id: m.organization.id,
    branch_id: branchId,
    actor_user_id: m.membership.user_id,
    action: "inventory_item.update",
    entity_type: "inventory_items",
    entity_id: parsed.data.id,
    after: { name, cost_price: parsed.data.costPrice, can_be_sold: parsed.data.canBeSold },
  });

  revalidatePath("/inventory");
  revalidatePath("/menu");
  revalidatePath("/pos");
  clearAiToolCache();
  return actionOk({ id: parsed.data.id });
}

export async function getInventoryDeleteBlockers(
  organizationId: string,
  itemId: string
): Promise<ActionResult<{ productNames: string[] }>> {
  const m = await requireRole(organizationId, canManageInventory);
  const productNames = await listPreparedProductsUsingIngredient(m.organization.id, itemId);
  return actionOk({ productNames });
}

export async function deleteInventoryItem(
  organizationId: string,
  itemId: string
): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageInventory);
  const supabase = createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("inventory_items")
    .select("id, name")
    .eq("id", itemId)
    .eq("organization_id", m.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) return actionFail("NOT_FOUND", "Không tìm thấy hàng hóa");

  const affectedProducts = await listPreparedProductsUsingIngredient(m.organization.id, itemId);
  if (affectedProducts.length > 0) {
    return actionFail("CONFLICT", buildInventoryDeleteConflictMessage(affectedProducts), {
      affectedProducts,
    });
  }

  await deactivateSellableProduct(supabase, itemId);
  const { error } = await supabase
    .from("inventory_items")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", itemId)
    .eq("organization_id", m.organization.id);
  if (error) return actionFail("INTERNAL_ERROR", "Không xóa được hàng hóa: " + error.message);

  await supabase.from("audit_logs").insert({
    organization_id: m.organization.id,
    actor_user_id: m.membership.user_id,
    action: "inventory_item.delete",
    entity_type: "inventory_items",
    entity_id: itemId,
    after: { name: existing.name },
  });

  revalidatePath("/inventory");
  revalidatePath("/menu");
  revalidatePath("/pos");
  clearAiToolCache();
  return actionOk({ id: itemId });
}

export async function createInventoryMovement(
  organizationId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageInventory);
  const parsed = inventoryMovementSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Thiếu thông tin phiếu kho");
  const supabase = createSupabaseServerClient();

  const { data: balance } = await supabase
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

  const { data: mv, error } = await supabase
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
    await supabase
      .from("inventory_balances")
      .update({ quantity_on_hand: newQty })
      .eq("id", balance.id);
  } else {
    await supabase.from("inventory_balances").insert({
      organization_id: m.organization.id,
      branch_id: parsed.data.branchId,
      inventory_item_id: parsed.data.inventoryItemId,
      quantity_on_hand: parsed.data.quantityDelta,
      low_stock_threshold: 0,
    });
  }

  await supabase.from("audit_logs").insert({
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
