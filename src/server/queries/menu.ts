import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MenuCategory, Product } from "@/types/database";

export async function listCategories(organizationId: string): Promise<MenuCategory[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .select("id, organization_id, parent_id, name, sort_order, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listProducts(organizationId: string, opts?: { search?: string; categoryId?: string | null; isActive?: boolean | null }): Promise<Product[]> {
  const supabase = createSupabaseServerClient();
  let q = supabase
    .from("products")
    .select("*")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name");
  if (opts?.search) q = q.ilike("name", `%${opts.search}%`);
  if (opts?.categoryId) q = q.eq("category_id", opts.categoryId);
  if (typeof opts?.isActive === "boolean") q = q.eq("is_active", opts.isActive);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getProductWithRecipe(organizationId: string, productId: string) {
  const supabase = createSupabaseServerClient();
  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!product) return null;
  const { data: recipe } = await supabase
    .from("recipes")
    .select("*, recipe_items(*)")
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { product, recipe: recipe ?? null };
}
