import { requireActiveContext, canUpdateKitchen, getActiveMembership } from "@/lib/auth/permissions";
import { listKitchenItems } from "@/server/queries/kitchen";
import { KitchenBoard } from "@/components/kitchen/kitchen-board";

export const metadata = { title: "Bếp" };

export default async function KitchenPage() {
  const active = await getActiveMembership();
  if (!active) return null;
  const ctx = await requireActiveContext();
  const items = await listKitchenItems(ctx.branchId, ["pending", "cooking", "ready"]);
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Màn hình bếp</h1>
        <p className="text-sm text-muted-foreground">Theo dõi món chờ chế biến, đang làm, đã xong.</p>
      </div>
      <KitchenBoard
        organizationId={ctx.organizationId}
        items={items}
        canUpdate={canUpdateKitchen.includes(active.role)}
      />
    </div>
  );
}
