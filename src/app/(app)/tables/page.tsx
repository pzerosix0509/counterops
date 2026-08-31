import { requireActiveContext, canManageTables, getActiveMembership } from "@/lib/auth/permissions";
import { listAreas, listTables } from "@/server/queries/tables";
import { TablesManager } from "@/components/tables/tables-manager";

export const metadata = { title: "Bàn / phòng" };

export default async function TablesPage() {
  const active = await getActiveMembership();
  if (!active) return null;
  const ctx = await requireActiveContext();
  const [areas, tables] = await Promise.all([
    listAreas(ctx.branchId),
    listTables(ctx.branchId),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bàn / phòng</h1>
        <p className="text-sm text-muted-foreground">Quản lý khu vực, bàn, theo dõi trạng thái phục vụ.</p>
      </div>
      <TablesManager
        organizationId={ctx.organizationId}
        branchId={ctx.branchId}
        canManage={canManageTables.includes(active.role)}
        areas={areas}
        tables={tables}
      />
    </div>
  );
}
