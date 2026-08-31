import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { InventoryItem, InventoryBalance, InventoryMovement, MenuType } from "@/types/database";

export type InventoryLinkedProduct = {
  id: string;
  sale_price: number;
  category_id: string | null;
  menu_type: MenuType;
};

export type InventoryItemView = InventoryItem & {
  linkedProduct: InventoryLinkedProduct | null;
};

export async function listInventoryItems(organizationId: string, search?: string): Promise<InventoryItemView[]> {
  const supabase = createSupabaseServerClient();
  let q = supabase
    .from("inventory_items")
    .select("*")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name");
  if (search) {
    const term = search.replace(/[%_,]/g, "");
    if (term) q = q.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
  }
  const [{ data, error }, { data: products, error: productErr }] = await Promise.all([
    q,
    supabase
      .from("products")
      .select("id, inventory_item_id, sale_price, category_id, menu_type")
      .eq("organization_id", organizationId)
      .not("inventory_item_id", "is", null),
  ]);
  if (error) throw new Error(error.message);
  if (productErr) throw new Error(productErr.message);
  const productByInventoryId = new Map(
    (products ?? []).map((product) => [product.inventory_item_id as string, product as InventoryLinkedProduct & { inventory_item_id: string }])
  );
  return (data ?? []).map((item) => ({
    ...item,
    linkedProduct: productByInventoryId.get(item.id) ?? null,
  }));
}

export async function listInventoryBalances(organizationId: string, branchId: string): Promise<InventoryBalance[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_balances")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listInventoryMovements(branchId: string, itemId: string, limit = 50): Promise<InventoryMovement[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_movements")
    .select("*")
    .eq("branch_id", branchId)
    .eq("inventory_item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listPreparedProductsUsingIngredient(
  organizationId: string,
  inventoryItemId: string
): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("recipe_items")
    .select("recipes!inner(is_active, organization_id, products!inner(name))")
    .eq("inventory_item_id", inventoryItemId)
    .eq("recipes.is_active", true)
    .eq("recipes.organization_id", organizationId);
  if (error) throw new Error(error.message);

  const names = new Set<string>();
  for (const row of data ?? []) {
    const recipe = row.recipes as { products?: { name?: string } | null } | null;
    const name = recipe?.products?.name?.trim();
    if (name) names.add(name);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, "vi"));
}
