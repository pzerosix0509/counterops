"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { categorySchema, productSchema, recipeItemInputSchema } from "@/lib/validation/schemas";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { canManageMenu, requireRole } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeRecipeCost } from "@/lib/calculations/inventory";

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
    .insert({ organization_id: m.organization.id, name: parsed.data.name, sort_order: parsed.data.sortOrder })
    .select("id")
    .single();
  if (error || !data) return actionFail("INTERNAL_ERROR", "Không tạo được nhóm món");
  revalidatePath("/menu");
  return actionOk({ id: data.id });
}

export async function createProduct(
  organizationId: string,
  input: unknown
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
  const supabase = createSupabaseServerClient();
  const { data: codeTaken } = await supabase
    .from("products")
    .select("id")
    .eq("organization_id", m.organization.id)
    .eq("code", parsed.data.code)
    .maybeSingle();
  if (codeTaken) return actionFail("CONFLICT", "Mã món đã tồn tại trong cửa hàng", { code: ["Mã món đã tồn tại"] });
  if (parsed.data.productType === "prepared" && (!parsed.data.recipe || parsed.data.recipe.length === 0)) {
    return actionFail("VALIDATION_ERROR", "Món chế biến cần ít nhất 1 dòng công thức.", { recipe: ["Thiếu nguyên liệu"] });
  }

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      organization_id: m.organization.id,
      name: parsed.data.name,
      code: parsed.data.code,
      category_id: parsed.data.categoryId ?? null,
      description: parsed.data.description ?? null,
      image_url: parsed.data.imageUrl ?? null,
      menu_type: parsed.data.menuType,
      product_type: parsed.data.productType,
      cost_price: parsed.data.costPrice,
      sale_price: parsed.data.salePrice,
      unit: parsed.data.unit,
      is_active: parsed.data.isActive,
    })
    .select("id")
    .single();
  if (error || !product) return actionFail("INTERNAL_ERROR", "Không tạo được món: " + (error?.message ?? ""));

  if (parsed.data.recipe && parsed.data.recipe.length > 0) {
    const { data: recipe, error: recipeErr } = await supabase
      .from("recipes")
      .insert({ organization_id: m.organization.id, product_id: product.id, version: 1, is_active: true })
      .select("id")
      .single();
    if (recipeErr || !recipe) return actionFail("INTERNAL_ERROR", "Không tạo được công thức");
    const items = parsed.data.recipe.map((r) => ({
      recipe_id: recipe.id,
      inventory_item_id: r.inventoryItemId,
      quantity: r.quantity,
      unit: r.unit,
      estimated_cost: r.estimatedCost,
    }));
    await supabase.from("recipe_items").insert(items);
  }

  await supabase.from("audit_logs").insert({
    organization_id: m.organization.id,
    actor_user_id: m.membership.user_id,
    action: "product.create",
    entity_type: "products",
    entity_id: product.id,
    after: { name: parsed.data.name, code: parsed.data.code },
  });

  revalidatePath("/menu");
  return actionOk({ id: product.id });
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
