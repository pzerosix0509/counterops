"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { categorySchema, productSchema } from "@/lib/validation/schemas";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { canManageMenu, requireRole } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
