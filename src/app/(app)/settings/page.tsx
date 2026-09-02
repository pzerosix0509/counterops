import { requireActiveContext, canManageMenu, getActiveMembership } from "@/lib/auth/permissions";
import { listCategories } from "@/server/queries/menu";
import { listInventoryItems } from "@/server/queries/inventory";
import { listSalesChannels } from "@/server/queries/orders";
import { getOperationalSettings } from "@/server/queries/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OperationalSettingsForm } from "@/components/settings/operational-settings-form";
import { GrabMockPanel } from "@/components/integrations/grab/grab-mock-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Store } from "lucide-react";

export const metadata = { title: "Cài đặt" };

export default async function SettingsPage() {
  const active = await getActiveMembership();
  if (!active) return null;
  if (!canManageMenu.includes(active.role)) {
    return <div className="rounded-md border bg-card p-6 text-sm">Bạn không có quyền truy cập cài đặt.</div>;
  }
  const ctx = await requireActiveContext();
  const [categories, items, channels, settings] = await Promise.all([
    listCategories(ctx.organizationId),
    listInventoryItems(ctx.organizationId),
    listSalesChannels(ctx.organizationId, { includeInactive: true }),
    getOperationalSettings(ctx.organizationId),
  ]);

  // Get Grab sales channel ID
  const grabChannel = channels.find((c) => c.name === "Grab (Mock)");
  const grabSalesChannelId = grabChannel?.id || "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">Quản lý thiết lập vận hành cho bán hàng, kho, bếp, báo cáo và hóa đơn.</p>
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
      </div>
      <Tabs defaultValue="operational" className="w-full mt-6">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="operational"><Settings className="w-4 h-4 mr-2"/> Cài đặt vận hành</TabsTrigger>
          <TabsTrigger value="grab"><Store className="w-4 h-4 mr-2"/> Tích hợp Grab</TabsTrigger>
        </TabsList>
        <TabsContent value="operational" className="space-y-4 pt-2">
          <OperationalSettingsForm
            organizationId={ctx.organizationId}
            allowNegativeInventory={active.organization.allow_negative_inventory ?? false}
            settings={settings}
            channels={channels}
          />
        </TabsContent>
        <TabsContent value="grab" className="space-y-4 pt-2">
          <GrabMockPanel
            organizationId={ctx.organizationId}
            branchId={ctx.branchId}
            salesChannelId={grabSalesChannelId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
