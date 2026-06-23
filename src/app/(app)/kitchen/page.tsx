import { requireActiveContext, canUpdateKitchen, getActiveMembership } from "@/lib/auth/permissions";
import { listKitchenItems } from "@/server/queries/kitchen";
import { getOperationalSettings } from "@/server/queries/settings";
import { KitchenBoard } from "@/components/kitchen/kitchen-board";

export const metadata = { title: "Bếp" };

export default async function KitchenPage() {
  const active = await getActiveMembership();
  if (!active) return null;
  const ctx = await requireActiveContext();
  const settings = await getOperationalSettings(ctx.organizationId);
  const items = await listKitchenItems(ctx.branchId, ["pending", "cooking", "ready"], {
    includeRegular: settings.showRegularItemsInKitchen,
  });
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Màn hình bếp</h1>
        <p className="text-sm text-muted-foreground">Theo dõi món đã thanh toán, chờ chế biến và sẵn sàng phục vụ.</p>
      </div>
      <KitchenBoard
        organizationId={ctx.organizationId}
        branchId={ctx.branchId}
        items={items}
        canUpdate={canUpdateKitchen.includes(active.role)}
        soundEnabled={settings.kitchenSoundEnabled}
        autoMarkServedOnReady={settings.autoMarkServedOnReady}
      />
    </div>
  );
}
