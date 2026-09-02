import { requireActiveContext, canCreateOrder, getActiveMembership } from "@/lib/auth/permissions";
import { listAreas, listTables } from "@/server/queries/tables";
import { listProductsForPos, listSalesChannels, listActiveOrdersForPos } from "@/server/queries/orders";
import { listCategories } from "@/server/queries/menu";
import { getOperationalSettings } from "@/server/queries/settings";
import { PosWorkspace } from "@/components/pos/pos-workspace";

export const metadata = { title: "Bán hàng" };

export default async function PosPage() {
  const active = await getActiveMembership();
  if (!active) return null;
  const ctx = await requireActiveContext();
  const [products, channels, areas, tables, categories, settings, activeOrders] = await Promise.all([
    listProductsForPos(ctx.organizationId, ctx.branchId),
    listSalesChannels(ctx.organizationId),
    listAreas(ctx.branchId),
    listTables(ctx.branchId),
    listCategories(ctx.organizationId),
    getOperationalSettings(ctx.organizationId),
    listActiveOrdersForPos(ctx.branchId),
  ]);
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bán hàng</h1>
        <p className="text-sm text-muted-foreground">Sơ đồ bàn, tạo đơn theo từng bước và thanh toán.</p>
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
        channels={channels}
        settings={settings}
        activeOrders={activeOrders}
      />
    </div>
  );
}
