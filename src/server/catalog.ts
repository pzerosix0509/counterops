import "server-only";
import { computeBomCost } from "@/lib/calculations/inventory";
import { generateSkuCode, itemTypeFromFlags, normalizeItemName } from "@/lib/inventory/sku";
import type { MenuType } from "@/types/database";

type Client = {
  from: (table: string) => any;
};

export async function inventoryNameTaken(
  supabase: Client,
  organizationId: string,
  name: string,
  excludeId?: string
): Promise<boolean> {
  const key = normalizeItemName(name).toLowerCase();
  const { data } = await supabase
    .from("inventory_items")
    .select("id, name")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  return (data ?? []).some(
    (row: { id: string; name: string }) =>
      row.id !== excludeId && normalizeItemName(row.name).toLowerCase() === key
  );
}

export async function resolveCategoryMenuType(
  supabase: Client,
  organizationId: string,
  categoryId: string | null | undefined,
  fallback: MenuType = "food"
): Promise<MenuType> {
  if (!categoryId) return fallback;
  const { data } = await supabase
    .from("menu_categories")
    .select("menu_type")
    .eq("id", categoryId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data?.menu_type as MenuType | undefined) ?? fallback;
}

export async function insertInventorySku(
  supabase: Client,
  args: {
    organizationId: string;
    name: string;
    unit: string;
    costPrice: number;
    canBeIngredient: boolean;
    canBeSold: boolean;
    description?: string | null;
  }
): Promise<{ id: string } | { error: string }> {
  const name = normalizeItemName(args.name);
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      organization_id: args.organizationId,
      name,
      code: generateSkuCode(name),
      item_type: itemTypeFromFlags(args.canBeIngredient, args.canBeSold),
      can_be_ingredient: args.canBeIngredient,
      can_be_sold: args.canBeSold,
      unit: args.unit,
      cost_price: args.costPrice,
      description: args.description ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Không tạo được hàng kho" };
  return { id: data.id };
}

export async function ensureSellableProduct(
  supabase: Client,
  args: {
    organizationId: string;
    inventoryItemId: string;
    name: string;
    unit: string;
    costPrice: number;
    salePrice: number;
    categoryId: string | null;
    menuType: MenuType;
  }
): Promise<{ id: string } | { error: string }> {
  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("inventory_item_id", args.inventoryItemId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("products")
      .update({
        name: args.name,
        unit: args.unit,
        cost_price: args.costPrice,
        sale_price: args.salePrice,
        category_id: args.categoryId,
        menu_type: args.menuType,
        product_type: "regular",
        is_active: true,
      })
      .eq("id", existing.id);
    if (error) return { error: error.message };
    return { id: existing.id };
  }
  const { data, error } = await supabase
    .from("products")
    .insert({
      organization_id: args.organizationId,
      name: args.name,
      code: generateSkuCode(args.name),
      unit: args.unit,
      cost_price: args.costPrice,
      sale_price: args.salePrice,
      category_id: args.categoryId,
      menu_type: args.menuType,
      product_type: "regular",
      is_active: true,
      inventory_item_id: args.inventoryItemId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Không tạo được món trên thực đơn" };
  return { id: data.id };
}

export async function deactivateSellableProduct(supabase: Client, inventoryItemId: string): Promise<void> {
  await supabase.from("products").update({ is_active: false }).eq("inventory_item_id", inventoryItemId);
}

export async function loadIngredientCosts(
  supabase: Client,
  organizationId: string,
  ids: string[]
): Promise<Map<string, { cost: number; unit: string; canBeIngredient: boolean }>> {
  const map = new Map<string, { cost: number; unit: string; canBeIngredient: boolean }>();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from("inventory_items")
    .select("id, cost_price, unit, can_be_ingredient")
    .eq("organization_id", organizationId)
    .in("id", ids);
  for (const row of data ?? []) {
    map.set(row.id, {
      cost: Number(row.cost_price ?? 0),
      unit: row.unit,
      canBeIngredient: Boolean(row.can_be_ingredient),
    });
  }
  return map;
}

export async function writePreparedRecipe(
  supabase: Client,
  args: {
    organizationId: string;
    productId: string;
    recipe: Array<{ inventoryItemId: string; quantity: number; unit: string; estimatedCost: number }>;
  }
): Promise<{ cost: number } | { error: string }> {
  const costs = await loadIngredientCosts(
    supabase,
    args.organizationId,
    args.recipe.map((r) => r.inventoryItemId)
  );
  for (const line of args.recipe) {
    const item = costs.get(line.inventoryItemId);
    if (!item) return { error: "Nguyên liệu không tồn tại trong kho." };
    if (!item.canBeIngredient) return { error: "Mặt hàng này không dùng làm nguyên liệu." };
  }
  const priced = args.recipe.map((line) => {
    const item = costs.get(line.inventoryItemId)!;
    const estimatedCost = Math.round(line.quantity * item.cost);
    return {
      inventoryItemId: line.inventoryItemId,
      quantity: line.quantity,
      unit: line.unit || item.unit,
      estimatedCost,
      unitCost: item.cost,
    };
  });
  const cost = computeBomCost(priced);

  const { data: current } = await supabase
    .from("recipes")
    .select("id, version")
    .eq("product_id", args.productId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = (current?.version ?? 0) + 1;
  const { data: recipe, error: recipeErr } = await supabase
    .from("recipes")
    .insert({
      organization_id: args.organizationId,
      product_id: args.productId,
      version,
      is_active: true,
    })
    .select("id")
    .single();
  if (recipeErr || !recipe) return { error: recipeErr?.message ?? "Không tạo được công thức" };

  const { error: itemsErr } = await supabase.from("recipe_items").insert(
    priced.map((r) => ({
      recipe_id: recipe.id,
      inventory_item_id: r.inventoryItemId,
      quantity: r.quantity,
      unit: r.unit,
      estimated_cost: r.estimatedCost,
    }))
  );
  if (itemsErr) {
    await supabase.from("recipes").delete().eq("id", recipe.id);
    if (!current) await supabase.from("products").delete().eq("id", args.productId);
    return { error: itemsErr.message };
  }

  await supabase.from("recipes").update({ is_active: false }).eq("product_id", args.productId).neq("id", recipe.id);
  await supabase.from("products").update({ cost_price: cost }).eq("id", args.productId);
  return { cost };
}

export async function refreshPreparedCostsForItem(supabase: Client, organizationId: string, inventoryItemId: string) {
  const { data: lines } = await supabase
    .from("recipe_items")
    .select("recipe_id, quantity, recipes!inner(product_id, is_active, organization_id)")
    .eq("inventory_item_id", inventoryItemId);
  const productIds = new Set<string>();
  for (const line of lines ?? []) {
    const recipe = line.recipes as { product_id?: string; is_active?: boolean; organization_id?: string } | null;
    if (recipe?.is_active && recipe.organization_id === organizationId && recipe.product_id) {
      productIds.add(recipe.product_id);
    }
  }
  for (const productId of Array.from(productIds)) {
    const { data: recipe } = await supabase
      .from("recipes")
      .select("id, recipe_items(quantity, inventory_item:inventory_items(cost_price))")
      .eq("product_id", productId)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cost = computeBomCost(
      ((recipe?.recipe_items ?? []) as Array<{ quantity: number; inventory_item?: { cost_price?: number } }>).map((item) => ({
        quantity: Number(item.quantity),
        unitCost: Number(item.inventory_item?.cost_price ?? 0),
      }))
    );
    await supabase.from("products").update({ cost_price: cost }).eq("id", productId);
  }
}
