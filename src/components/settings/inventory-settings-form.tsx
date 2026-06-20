"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateInventorySettings } from "@/server/actions/settings";

export function InventorySettingsForm({
  organizationId,
  allowNegativeInventory,
}: {
  organizationId: string;
  allowNegativeInventory: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(allowNegativeInventory);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateInventorySettings(organizationId, { allowNegativeInventory: checked });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setMessage("Đã lưu thiết lập kho.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 rounded-md border bg-background p-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
        />
        <span className="space-y-1">
          <span className="block text-sm font-medium">Cho phép âm kho</span>
          <span className="block text-xs text-muted-foreground">
            Tắt để chặn thanh toán hoặc xuất kho khi tồn không đủ. Bật để vẫn cho phép bán/xuất và ghi tồn âm.
          </span>
        </span>
      </label>
      {message ? (
        <p className={message.startsWith("Đã") ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{message}</p>
      ) : null}
      <Button type="button" onClick={save} disabled={isPending}>
        {isPending ? "Đang lưu..." : "Lưu thiết lập"}
      </Button>
    </div>
  );
}
