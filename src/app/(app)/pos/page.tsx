import { requireActiveContext, canCreateOrder, getActiveMembership } from "@/lib/auth/permissions";
import { listAreas, listOpenOrdersByTable, listTables } from "@/server/queries/tables";
import { listProductsForPos, listSalesChannels } from "@/server/queries/orders";
import { listCategories } from "@/server/queries/menu";
import { getOperationalSettings } from "@/server/queries/settings";
import { PosWorkspace } from "@/components/pos/pos-workspace";

export const metadata = { title: "Bán hàng" };

export default async function PosPage() {
  const active = await getActiveMembership();
  if (!active) return null;
  const ctx = await requireActiveContext();
  const [products, channels, areas, tables, openByTable, categories, settings] = await Promise.all([
    listProductsForPos(ctx.organizationId, ctx.branchId),
    listSalesChannels(ctx.organizationId),
    listAreas(ctx.branchId),
    listTables(ctx.branchId),
    listOpenOrdersByTable(ctx.branchId),
    listCategories(ctx.organizationId),
    getOperationalSettings(ctx.organizationId),
  ]);
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bán hàng</h1>
        <p className="text-sm text-muted-foreground">Chọn bàn, thêm món, gửi bếp và thanh toán.</p>
      </div>
      <PosWorkspace
        organizationId={ctx.organizationId}
        branchId={ctx.branchId}
        canPay
        canCreate={canCreateOrder.includes(active.role)}
        products={products}
        categories={categories}
        areas={areas}
        tables={tables}
        openByTable={openByTable}
        channels={channels}
        settings={settings}
      />
    </div>
  );
}
