"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import { updateOperationalSettings } from "@/server/actions/settings";
import type { OperationalSettings } from "@/lib/settings/operational";
import type { SalesChannel, PaymentMethod } from "@/types/database";

type ChannelForm = {
  id?: string;
  name: string;
  type: string;
  isActive: boolean;
  platformFeePercent: number;
  sortOrder: number;
};

const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Tiền mặt" },
  { value: "bank_transfer", label: "Chuyển khoản" },
  { value: "card", label: "Thẻ" },
  { value: "ewallet", label: "Ví điện tử" },
  { value: "debt", label: "Ghi nợ" },
  { value: "other", label: "Khác" },
];

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-5 text-muted-foreground">{children}</p>;
}

function CheckboxField({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border bg-background p-3">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="space-y-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export function OperationalSettingsForm({
  organizationId,
  allowNegativeInventory,
  settings,
  channels,
}: {
  organizationId: string;
  allowNegativeInventory: boolean;
  settings: OperationalSettings;
  channels: SalesChannel[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [allowNegative, setAllowNegative] = useState(allowNegativeInventory);
  const [draft, setDraft] = useState(settings);
  const [channelDrafts, setChannelDrafts] = useState<ChannelForm[]>(
    channels.map((channel, index) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      isActive: channel.is_active,
      platformFeePercent: Number(channel.platform_fee_percent ?? 0),
      sortOrder: Number(channel.sort_order ?? index),
    }))
  );

  function updateDraft<K extends keyof OperationalSettings>(key: K, value: OperationalSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateChannel(index: number, patch: Partial<ChannelForm>) {
    setChannelDrafts((current) => current.map((channel, i) => (i === index ? { ...channel, ...patch } : channel)));
  }

  function addChannel() {
    setChannelDrafts((current) => [
      ...current,
      { name: "", type: "delivery", isActive: true, platformFeePercent: 0, sortOrder: current.length },
    ]);
  }

  function save() {
    startTransition(async () => {
      const result = await updateOperationalSettings(organizationId, {
        allowNegativeInventory: allowNegative,
        ...draft,
        salesChannels: channelDrafts.filter((channel) => channel.name.trim().length > 0),
      });
      if (!result.ok) {
        notifyError("Không thể lưu cài đặt", result.error.message);
        return;
      }
      router.refresh();
      notifySuccess("Đã lưu cài đặt");
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <section className="space-y-3 rounded-md border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">Kho hàng</h2>
            <p className="text-sm text-muted-foreground">Kiểm soát tồn kho khi bán hàng và lập phiếu.</p>
          </div>
          <CheckboxField
            checked={allowNegative}
            onChange={setAllowNegative}
            title="Cho phép âm kho"
            description="Tắt để chặn thanh toán hoặc xuất kho khi tồn không đủ. Bật để vẫn cho phép bán/xuất và ghi tồn âm."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Thời điểm trừ kho</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={draft.inventoryDeductionTiming}
                onChange={(event) => updateDraft("inventoryDeductionTiming", event.target.value as OperationalSettings["inventoryDeductionTiming"])}
              >
                <option value="payment">Khi thanh toán</option>
                <option value="kitchen_start">Khi bếp nhận món</option>
              </select>
              <FieldHint>Hiện tại POS đang tối ưu cho luồng thanh toán trước.</FieldHint>
            </div>
            <div className="space-y-1.5">
              <Label>Ngưỡng cảnh báo mặc định</Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={draft.defaultLowStockThreshold}
                onChange={(event) => updateDraft("defaultLowStockThreshold", Math.max(0, Number(event.target.value) || 0))}
              />
              <FieldHint>Dùng làm gợi ý khi tạo hàng kho mới.</FieldHint>
            </div>
          </div>
          <CheckboxField
            checked={draft.lowStockAlertEnabled}
            onChange={(checked) => updateDraft("lowStockAlertEnabled", checked)}
            title="Tự cảnh báo hàng sắp hết"
            description="Bật để kho hiển thị trạng thái sắp hết khi tồn nhỏ hơn hoặc bằng ngưỡng cảnh báo."
          />
        </section>

        <section className="space-y-3 rounded-md border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">Bán hàng POS</h2>
            <p className="text-sm text-muted-foreground">Thiết lập mặc định cho màn bán hàng.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Chế độ bán mặc định</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={draft.defaultOrderType}
                onChange={(event) => updateDraft("defaultOrderType", event.target.value as OperationalSettings["defaultOrderType"])}
              >
                <option value="dine_in">Tại quán</option>
                <option value="takeaway">Mang đi</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Phương thức thanh toán mặc định</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={draft.defaultPaymentMethod}
                onChange={(event) => updateDraft("defaultPaymentMethod", event.target.value as PaymentMethod)}
              >
                {PAYMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Giới hạn giảm giá tối đa (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={draft.maxDiscountPercent}
                onChange={(event) => updateDraft("maxDiscountPercent", Math.min(100, Math.max(0, Number(event.target.value) || 0)))}
              />
            </div>
          </div>
          <CheckboxField
            checked={draft.allowUnpaidOrders}
            onChange={(checked) => updateDraft("allowUnpaidOrders", checked)}
            title="Cho phép lưu đơn chưa thanh toán"
            description="Bật để tạo/cập nhật đơn tạm. Tắt nếu cửa hàng luôn thanh toán trước."
          />
          <CheckboxField
            checked={draft.discountsEnabled}
            onChange={(checked) => updateDraft("discountsEnabled", checked)}
            title="Cho phép giảm giá"
            description="Tắt để khóa ô giảm giá trên POS."
          />
        </section>

        <section className="space-y-3 rounded-md border bg-card p-4 xl:col-span-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Kênh bán</h2>
              <p className="text-sm text-muted-foreground">Bật/tắt kênh và khai báo phí nền tảng để tính lợi nhuận thực tế hơn.</p>
            </div>
            <Button type="button" variant="outline" onClick={addChannel}>
              <Plus className="h-4 w-4" /> Thêm kênh
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Bật</th>
                  <th className="py-2 pr-3 font-medium">Tên kênh</th>
                  <th className="py-2 pr-3 font-medium">Loại</th>
                  <th className="py-2 pr-3 text-right font-medium">Phí nền tảng (%)</th>
                  <th className="py-2 text-right font-medium">Thứ tự</th>
                </tr>
              </thead>
              <tbody>
                {channelDrafts.map((channel, index) => (
                  <tr key={channel.id ?? index} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={channel.isActive}
                        onChange={(event) => updateChannel(index, { isActive: event.target.checked })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input value={channel.name} onChange={(event) => updateChannel(index, { name: event.target.value })} />
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                        value={channel.type}
                        onChange={(event) => updateChannel(index, { type: event.target.value })}
                      >
                        <option value="direct">Trực tiếp</option>
                        <option value="delivery">Giao hàng</option>
                        <option value="online">Online</option>
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        className="text-right"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={channel.platformFeePercent}
                        onChange={(event) => updateChannel(index, { platformFeePercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })}
                      />
                    </td>
                    <td className="py-2">
                      <Input
                        className="text-right"
                        type="number"
                        value={channel.sortOrder}
                        onChange={(event) => updateChannel(index, { sortOrder: Number(event.target.value) || 0 })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3 rounded-md border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">Bếp</h2>
            <p className="text-sm text-muted-foreground">Thông báo và cách hiển thị món trong màn bếp.</p>
          </div>
          <CheckboxField checked={draft.kitchenSoundEnabled} onChange={(checked) => updateDraft("kitchenSoundEnabled", checked)} title="Âm thanh khi có món mới" description="Phát âm báo nhẹ khi realtime nhận món mới vào bếp." />
          <CheckboxField checked={draft.autoSendToKitchenOnPayment} onChange={(checked) => updateDraft("autoSendToKitchenOnPayment", checked)} title="Tự gửi bếp sau thanh toán" description="Phù hợp với mô hình thanh toán trước rồi bếp mới chế biến." />
          <CheckboxField checked={draft.showRegularItemsInKitchen} onChange={(checked) => updateDraft("showRegularItemsInKitchen", checked)} title="Hiển thị món thường trong bếp" description="Bật nếu muốn bếp thấy cả hàng bán sẵn như nước suối, khăn lạnh." />
          <CheckboxField checked={draft.autoMarkServedOnReady} onChange={(checked) => updateDraft("autoMarkServedOnReady", checked)} title="Tự đánh dấu đã phục vụ khi món sẵn sàng" description="Nếu bật, thao tác sẵn sàng sẽ chuyển món thẳng sang đã phục vụ." />
        </section>

        <section className="space-y-3 rounded-md border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">Báo cáo</h2>
            <p className="text-sm text-muted-foreground">Quy tắc chốt ngày và cách đọc doanh thu.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Giờ chốt ngày kinh doanh</Label>
              <Input type="time" value={draft.businessDayStartTime} onChange={(event) => updateDraft("businessDayStartTime", event.target.value)} />
              <FieldHint>Ví dụ 05:00 nếu cửa hàng đóng sau nửa đêm.</FieldHint>
            </div>
            <div className="space-y-1.5">
              <Label>Cách tính lãi/lỗ</Label>
              <Input value="Doanh thu thuần - giá vốn - phí kênh bán" disabled />
            </div>
          </div>
          <CheckboxField checked={draft.includeServiceFeeInRevenue} onChange={(checked) => updateDraft("includeServiceFeeInRevenue", checked)} title="Tính phí dịch vụ vào doanh thu" description="Bật để doanh thu thuần bao gồm phí dịch vụ." />
          <CheckboxField checked={draft.autoGenerateEod} onChange={(checked) => updateDraft("autoGenerateEod", checked)} title="Tự tạo báo cáo cuối ngày" description="Lưu ý: cần tác vụ nền/cron để tự động hóa hoàn toàn ở production." />
        </section>

        <section className="space-y-3 rounded-md border bg-card p-4 xl:col-span-2">
          <div>
            <h2 className="text-sm font-semibold">Hóa đơn</h2>
            <p className="text-sm text-muted-foreground">Thông tin in trên hóa đơn bán hàng.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tên cửa hàng trên hóa đơn</Label>
              <Input value={draft.receiptStoreName ?? ""} onChange={(event) => updateDraft("receiptStoreName", event.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label>Số điện thoại</Label>
              <Input value={draft.receiptPhone ?? ""} onChange={(event) => updateDraft("receiptPhone", event.target.value || null)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Địa chỉ</Label>
              <Input value={draft.receiptAddress ?? ""} onChange={(event) => updateDraft("receiptAddress", event.target.value || null)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Logo URL</Label>
              <Input value={draft.receiptLogoUrl ?? ""} onChange={(event) => updateDraft("receiptLogoUrl", event.target.value || null)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Dòng chân hóa đơn</Label>
              <Textarea rows={2} value={draft.receiptFooter} onChange={(event) => updateDraft("receiptFooter", event.target.value)} />
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-md border bg-card p-4 xl:col-span-2">
          <div>
            <h2 className="text-sm font-semibold">Thuế</h2>
            <p className="text-sm text-muted-foreground">Thông tin hộ kinh doanh, cá nhân kinh doanh dùng để tự điền vào các mẫu biểu thuế.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Mã số thuế</Label>
              <Input placeholder="VD: 0123456789" value={draft.taxCode ?? ""} onChange={(event) => updateDraft("taxCode", event.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ngày bắt đầu hoạt động</Label>
              <Input type="date" value={draft.businessStartDate ?? ""} onChange={(event) => updateDraft("businessStartDate", event.target.value || null)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Ngành nghề kinh doanh chính</Label>
              <Input placeholder="VD: Quán cà phê, giải khát" value={draft.businessLine ?? ""} onChange={(event) => updateDraft("businessLine", event.target.value || null)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Tên chủ tài khoản</Label>
              <Input placeholder="Tên in trên số tài khoản ngân hàng" value={draft.accountHolderName ?? ""} onChange={(event) => updateDraft("accountHolderName", event.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label>Số nhà, đường phố (xóm/ấp/thôn)</Label>
              <Input value={draft.receiptAddress ?? ""} onChange={(event) => updateDraft("receiptAddress", event.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label>Xã/Phường/Đặc khu</Label>
              <Input value={draft.commune ?? ""} onChange={(event) => updateDraft("commune", event.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label>Quận/Huyện</Label>
              <Input value={draft.district ?? ""} onChange={(event) => updateDraft("district", event.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tỉnh/Thành phố</Label>
              <Input value={draft.province ?? ""} onChange={(event) => updateDraft("province", event.target.value || null)} />
            </div>
          </div>
        </section>

      </div>

      <div className="sticky bottom-0 flex justify-end border-t bg-background/95 py-3 backdrop-blur">
        <Button type="button" onClick={save} disabled={isPending}>
          {isPending ? "Đang lưu..." : "Lưu cài đặt"}
        </Button>
      </div>
    </div>
  );
}
