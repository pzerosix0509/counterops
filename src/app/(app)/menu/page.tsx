import { requireActiveContext, canManageMenu, getActiveMembership } from "@/lib/auth/permissions";
import { listCategories, listProducts } from "@/server/queries/menu";
import { MenuManager } from "@/components/menu/menu-manager";

export const metadata = { title: "Thực đơn" };

interface PageProps {
  searchParams: { q?: string; category?: string; status?: string };
}

export default async function MenuPage({ searchParams }: PageProps) {
  const active = await getActiveMembership();
  if (!active) return null;
  const ctx = await requireActiveContext();
  const [categories, products] = await Promise.all([
    listCategories(ctx.organizationId),
    listProducts(ctx.organizationId, {
      search: searchParams.q || undefined,
      categoryId: searchParams.category || undefined,
      isActive: searchParams.status === "active" ? true : searchParams.status === "inactive" ? false : null,
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Thực đơn</h1>
        <p className="text-sm text-muted-foreground">Quản lý nhóm món, sản phẩm, công thức và giá bán.</p>
      </div>
      <MenuManager
        organizationId={ctx.organizationId}
        canManage={canManageMenu.includes(active.role)}
        categories={categories}
        products={products}
        initialQuery={searchParams.q ?? ""}
      />
    </div>
  );
}
