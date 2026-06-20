import { requireActiveContext, canManageMenu, getActiveMembership } from "@/lib/auth/permissions";
import { listCategories } from "@/server/queries/menu";
import { listInventoryItems } from "@/server/queries/inventory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InventorySettingsForm } from "@/components/settings/inventory-settings-form";

export const metadata = { title: "Cài đặt" };

export default async function SettingsPage() {
  const active = await getActiveMembership();
  if (!active) return null;
  if (!canManageMenu.includes(active.role)) {
    return <div className="rounded-md border bg-card p-6 text-sm">Bạn không có quyền truy cập cài đặt.</div>;
  }
  const ctx = await requireActiveContext();
  const [categories, items] = await Promise.all([
    listCategories(ctx.organizationId),
    listInventoryItems(ctx.organizationId),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">Xem nhanh các thiết lập hiện tại của cửa hàng.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cửa hàng</CardTitle>
            <CardDescription>{active.organization.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Slug</span><span className="font-mono">{active.organization.slug}</span></div>
            <div className="flex justify-between"><span>Loại hình</span><span>{active.organization.business_type}</span></div>
            <div className="flex justify-between"><span>Tiền tệ</span><span>{active.organization.currency}</span></div>
            <div className="flex justify-between"><span>Múi giờ</span><span>{active.organization.timezone}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Chi nhánh hiện tại</CardTitle>
            <CardDescription>{active.branch?.name ?? "—"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Số nhóm món</span><span>{categories.length}</span></div>
            <div className="flex justify-between"><span>Số mặt hàng kho</span><span>{items.length}</span></div>
            <div className="flex justify-between"><span>Vai trò của bạn</span><span>{active.role}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Kho hàng</CardTitle>
            <CardDescription>Thiết lập kiểm soát tồn kho khi bán hàng và lập phiếu.</CardDescription>
          </CardHeader>
          <CardContent>
            <InventorySettingsForm
              organizationId={ctx.organizationId}
              allowNegativeInventory={active.organization.allow_negative_inventory ?? false}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
