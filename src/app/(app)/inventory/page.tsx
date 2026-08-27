import { requireActiveContext, canManageInventory, getActiveMembership } from "@/lib/auth/permissions";
import { listInventoryItems, listInventoryBalances } from "@/server/queries/inventory";
import { listCategories } from "@/server/queries/menu";
import { getOperationalSettings } from "@/server/queries/settings";
import { InventoryManager } from "@/components/inventory/inventory-manager";

export const metadata = { title: "Kho hàng" };

interface PageProps {
  searchParams: { q?: string };
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const active = await getActiveMembership();
  if (!active) return null;
  const ctx = await requireActiveContext();
  const [items, balances, settings, categories] = await Promise.all([
    listInventoryItems(ctx.organizationId, searchParams.q || undefined),
    listInventoryBalances(ctx.organizationId, ctx.branchId),
    getOperationalSettings(ctx.organizationId),
    listCategories(ctx.organizationId),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Kho hàng</h1>
        <p className="text-sm text-muted-foreground">Theo dõi tồn kho, lập phiếu nhập / điều chỉnh / xuất hủy.</p>
      </div>
      <InventoryManager
        organizationId={ctx.organizationId}
        branchId={ctx.branchId}
        canManage={canManageInventory.includes(active.role)}
        items={items}
        balances={balances}
        categories={categories}
        initialQuery={searchParams.q ?? ""}
        defaultLowStockThreshold={settings.defaultLowStockThreshold}
        lowStockAlertEnabled={settings.lowStockAlertEnabled}
      />
    </div>
  );
}
