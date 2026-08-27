"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { categorySchema, productSchema, recipeItemInputSchema } from "@/lib/validation/schemas";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { canManageMenu, requireRole } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeRecipeCost } from "@/lib/calculations/inventory";
import { generateSkuCode, normalizeItemName } from "@/lib/inventory/sku";
import {
  deactivateSellableProduct,
  ensureSellableProduct,
  insertInventorySku,
  inventoryNameTaken,
  resolveCategoryMenuType,
  writePreparedRecipe,
} from "@/server/catalog";

export async function createCategory(
  organizationId: string,
  input: z.infer<typeof categorySchema>
): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageMenu);
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Tên nhóm món không hợp lệ");
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .insert({
      organization_id: m.organization.id,
      name: parsed.data.name.trim(),
      sort_order: parsed.data.sortOrder,
      menu_type: parsed.data.menuType,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.message?.includes("menu_categories_org_name")) {
      return actionFail("CONFLICT", "Nhóm món này đã tồn tại");
    }
    return actionFail("INTERNAL_ERROR", "Không tạo được nhóm món");
  }
  revalidatePath("/menu");
  return actionOk({ id: data.id });
}

export async function updateCategory(
  organizationId: string,
  categoryId: string,
  input: z.infer<typeof categorySchema>
): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageMenu);
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Nhóm món không hợp lệ");
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("menu_categories")
    .update({
      name: parsed.data.name.trim(),
      sort_order: parsed.data.sortOrder,
      menu_type: parsed.data.menuType,
    })
    .eq("id", categoryId)
    .eq("organization_id", m.organization.id);
  if (error) return actionFail("INTERNAL_ERROR", "Không cập nhật được nhóm món");
  await supabase
    .from("products")
    .update({ menu_type: parsed.data.menuType })
    .eq("category_id", categoryId)
    .eq("organization_id", m.organization.id);
  revalidatePath("/menu");
  return actionOk({ id: categoryId });
}

export async function deleteCategory(organizationId: string, categoryId: string): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageMenu);
  const supabase = createSupabaseServerClient();
  await supabase
    .from("products")
    .update({ category_id: null })
    .eq("category_id", categoryId)
    .eq("organization_id", m.organization.id);
  const { error } = await supabase
    .from("menu_categories")
    .delete()
    .eq("id", categoryId)
    .eq("organization_id", m.organization.id);
  if (error) return actionFail("INTERNAL_ERROR", "Không xóa được nhóm món");
  revalidatePath("/menu");
  return actionOk({ id: categoryId });
}

export async function setProductCategory(
  organizationId: string,
  productId: string,
  categoryId: string | null
): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageMenu);
  const supabase = createSupabaseServerClient();
  const menuType = await resolveCategoryMenuType(supabase, m.organization.id, categoryId);
  const { error } = await supabase
    .from("products")
    .update({ category_id: categoryId, menu_type: menuType })
    .eq("id", productId)
    .eq("organization_id", m.organization.id);
  if (error) return actionFail("INTERNAL_ERROR", "Không gán được nhóm món");
  revalidatePath("/menu");
  return actionOk({ id: productId });
}

async function upsertProduct(
  organizationId: string,
  input: unknown,
  mode: "create" | "update"
): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageMenu);
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    }
    return actionFail("VALIDATION_ERROR", "Vui lòng kiểm tra các trường", fieldErrors);
  }
  if (parsed.data.productType === "prepared" && (!parsed.data.recipe || parsed.data.recipe.length === 0)) {
    return actionFail("VALIDATION_ERROR", "Món chế biến cần ít nhất 1 dòng công thức.", { recipe: ["Thiếu nguyên liệu"] });
  }

  const supabase = createSupabaseServerClient();
  const menuType = await resolveCategoryMenuType(
    supabase,
    m.organization.id,
    parsed.data.categoryId ?? null,
    parsed.data.menuType ?? "food"
  );
  const name = normalizeItemName(parsed.data.name);
  const code = parsed.data.code?.trim() || generateSkuCode(name);
  const productId = parsed.data.id;

  if (mode === "update" && !productId) return actionFail("VALIDATION_ERROR", "Thiếu món cần sửa");

  if (mode === "create") {
    const { data: codeTaken } = await supabase
      .from("products")
      .select("id")
      .eq("organization_id", m.organization.id)
      .eq("code", code)
      .maybeSingle();
    if (codeTaken) return actionFail("CONFLICT", "Không tạo được mã món, thử lại.", { code: ["Mã món đã tồn tại"] });
  }

  const baseRow = {
    name,
    code,
    category_id: parsed.data.categoryId ?? null,
    description: parsed.data.description ?? null,
    image_url: parsed.data.imageUrl ?? null,
    menu_type: menuType,
    product_type: parsed.data.productType,
    cost_price: parsed.data.costPrice ?? 0,
    sale_price: parsed.data.salePrice,
    unit: parsed.data.unit,
    is_active: parsed.data.isActive,
  };

  let id = productId ?? "";
  if (mode === "create") {
    const { data: product, error } = await supabase
      .from("products")
      .insert({ organization_id: m.organization.id, ...baseRow })
      .select("id")
      .single();
    if (error || !product) return actionFail("INTERNAL_ERROR", "Không tạo được món: " + (error?.message ?? ""));
    id = product.id;
  } else {
    const { error } = await supabase
      .from("products")
      .update(baseRow)
      .eq("id", id)
      .eq("organization_id", m.organization.id);
    if (error) return actionFail("INTERNAL_ERROR", "Không cập nhật được món");
  }

  if (parsed.data.productType === "prepared" && parsed.data.recipe) {
    const written = await writePreparedRecipe(supabase, {
      organizationId: m.organization.id,
      productId: id,
      recipe: parsed.data.recipe,
    });
    if ("error" in written) return actionFail("INTERNAL_ERROR", written.error);
  }

  if (parsed.data.productType === "regular") {
    const { data: existing } = await supabase
      .from("products")
      .select("inventory_item_id")
      .eq("id", id)
      .maybeSingle();
    let skuId = existing?.inventory_item_id as string | null;
    if (!skuId) {
      if (await inventoryNameTaken(supabase, m.organization.id, name)) {
        if (mode === "create") await supabase.from("products").delete().eq("id", id);
        return actionFail("CONFLICT", "Tên này đã có trong kho. Dùng đúng tên đó hoặc đổi tên món.");
      }
      const sku = await insertInventorySku(supabase, {
        organizationId: m.organization.id,
        name,
        unit: parsed.data.unit,
        costPrice: parsed.data.costPrice ?? 0,
        canBeIngredient: false,
        canBeSold: true,
      });
      if ("error" in sku) {
        if (mode === "create") await supabase.from("products").delete().eq("id", id);
        return actionFail("INTERNAL_ERROR", sku.error);
      }
      skuId = sku.id;
      await supabase.from("products").update({ inventory_item_id: skuId }).eq("id", id);
    } else {
      await supabase
        .from("inventory_items")
        .update({
          name,
          unit: parsed.data.unit,
          cost_price: parsed.data.costPrice ?? 0,
          can_be_sold: true,
        })
        .eq("id", skuId);
    }
  } else if (mode === "update") {
    const { data: existing } = await supabase
      .from("products")
      .select("inventory_item_id")
      .eq("id", id)
      .maybeSingle();
    if (existing?.inventory_item_id) {
      await deactivateSellableProduct(supabase, existing.inventory_item_id);
      await supabase.from("products").update({ inventory_item_id: null }).eq("id", id);
    }
  }

  await supabase.from("audit_logs").insert({
    organization_id: m.organization.id,
    actor_user_id: m.membership.user_id,
    action: mode === "create" ? "product.create" : "product.update",
    entity_type: "products",
    entity_id: id,
    after: { name, product_type: parsed.data.productType },
  });

  revalidatePath("/menu");
  revalidatePath("/inventory");
  return actionOk({ id });
}

export async function createProduct(organizationId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return upsertProduct(organizationId, input, "create");
}

export async function updateProduct(organizationId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return upsertProduct(organizationId, input, "update");
}

export async function toggleProductActive(organizationId: string, productId: string, isActive: boolean): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageMenu);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", productId)
    .eq("organization_id", m.organization.id);
  if (error) return actionFail("INTERNAL_ERROR", "Không cập nhật được món");
  revalidatePath("/menu");
  return actionOk({ id: productId });
}

/**
 * Lưu công thức (recipe) cho một món: tạo version mới, vô hiệu bản cũ,
 * tính giá vốn từng nguyên liệu theo cost_price (giá nhập) hiện tại và
 * cập nhật cost_price của món bằng tổng chi phí công thức.
 */
export async function upsertProductRecipe(
  organizationId: string,
  productId: string,
  items: unknown
): Promise<ActionResult<{ id: string; costPrice: number }>> {
  const m = await requireRole(organizationId, canManageMenu);
  const parsed = z.array(recipeItemInputSchema).safeParse(items);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Công thức không hợp lệ: kiểm tra nguyên liệu và số lượng");
  const supabase = createSupabaseServerClient();

  // Món phải thuộc org này.
  const { data: product } = await supabase
    .from("products")
    .select("id, cost_price")
    .eq("id", productId)
    .eq("organization_id", m.organization.id)
    .maybeSingle();
  if (!product) return actionFail("NOT_FOUND", "Không tìm thấy món");

  // Lấy giá nhập (cost_price) của từng nguyên liệu (tenant-scoped) để tính estimated_cost.
  const ids = parsed.data.map((r) => r.inventoryItemId);
  const { data: invItems } = await supabase
    .from("inventory_items")
    .select("id, cost_price")
    .in("id", ids)
    .eq("organization_id", m.organization.id);
  const costById = new Map((invItems ?? []).map((it) => [it.id, it.cost_price]));
  const missing = ids.filter((id) => !costById.has(id));
  if (missing.length > 0) return actionFail("VALIDATION_ERROR", "Có nguyên liệu không thuộc cửa hàng này");

  const recipeItems = parsed.data.map((r) => {
    const unitCost = costById.get(r.inventoryItemId) ?? 0;
    return {
      inventory_item_id: r.inventoryItemId,
      quantity: r.quantity,
      unit: r.unit,
      // estimated_cost lưu DB là tổng chi phí của dòng (giá 1 đơn vị x số lượng).
      estimated_cost: Math.round(unitCost * r.quantity),
    };
  });
  const totalCost = computeRecipeCost(
    parsed.data.map((r) => ({ quantity: r.quantity, estimatedCost: costById.get(r.inventoryItemId) ?? 0 }))
  );

  const { data: activeRecipe } = await supabase
    .from("recipes")
    .select("version")
    .eq("product_id", productId)
    .eq("is_active", true)
    .maybeSingle();
  const nextVersion = (activeRecipe?.version ?? 0) + 1;

  const { data: recipe, error: recipeErr } = await supabase
    .from("recipes")
    .insert({
      organization_id: m.organization.id,
      product_id: productId,
      version: nextVersion,
      is_active: true,
    })
    .select("id")
    .single();
  if (recipeErr || !recipe) return actionFail("INTERNAL_ERROR", "Không lưu được công thức");

  const { error: itemsErr } = await supabase.from("recipe_items").insert(
    recipeItems.map((it) => ({ recipe_id: recipe.id, ...it }))
  );
  if (itemsErr) return actionFail("INTERNAL_ERROR", "Không lưu được nguyên liệu công thức");

  // Vô hiệu bản cũ và cập nhật giá vốn món theo tổng chi phí.
  await supabase.from("recipes").update({ is_active: false }).eq("product_id", productId).neq("id", recipe.id);
  const { error: costErr } = await supabase
    .from("products")
    .update({ cost_price: totalCost })
    .eq("id", productId)
    .eq("organization_id", m.organization.id);
  if (costErr) return actionFail("INTERNAL_ERROR", "Công thức đã lưu nhưng không cập nhật được giá vốn");

  await supabase.from("audit_logs").insert({
    organization_id: m.organization.id,
    actor_user_id: m.membership.user_id,
    action: "product.recipe.upsert",
    entity_type: "products",
    entity_id: productId,
    after: { version: nextVersion, cost_price: totalCost, items: recipeItems.length },
  });

  revalidatePath("/menu");
  return actionOk({ id: recipe.id, costPrice: totalCost });
}

export async function createIngredientFromMenu(
  organizationId: string,
  branchId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const { createInventoryItem } = await import("@/server/actions/inventory");
  return createInventoryItem(organizationId, branchId, {
    ...(typeof input === "object" && input ? input : {}),
    canBeIngredient: true,
    canBeSold: false,
  });
}
