import { requireActiveContext, canManageMenu, getActiveMembership } from "@/lib/auth/permissions";
import { listInventoryItems } from "@/server/queries/inventory";
import { listActiveRecipes, listCategories, listProducts } from "@/server/queries/menu";
import { MenuManager } from "@/components/menu/menu-manager";

export const metadata = { title: "Thực đơn" };

interface PageProps {
  searchParams: { q?: string; category?: string; status?: string };
}

export default async function MenuPage({ searchParams }: PageProps) {
  const active = await getActiveMembership();
  if (!active) return null;
  const ctx = await requireActiveContext();
  const [categories, products, inventoryItems, recipes] = await Promise.all([
    listCategories(ctx.organizationId),
    listProducts(ctx.organizationId, {
      search: searchParams.q || undefined,
      isActive: searchParams.status === "active" ? true : searchParams.status === "inactive" ? false : null,
    }),
    listInventoryItems(ctx.organizationId),
    listActiveRecipes(ctx.organizationId),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Thực đơn</h1>
        <p className="text-sm text-muted-foreground">Nhóm món là filter. Món chế biến lấy giá vốn từ công thức.</p>
      </div>
      <MenuManager
        organizationId={ctx.organizationId}
        branchId={ctx.branchId}
        canManage={canManageMenu.includes(active.role)}
        categories={categories}
        products={products}
        inventoryItems={inventoryItems}
        recipes={recipes}
        initialQuery={searchParams.q ?? ""}
      />
    </div>
  );
}
