"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { upsertProductRecipe } from "@/server/actions/menu";
import { formatVND } from "@/lib/date/ranges";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import type { InventoryItem, Product } from "@/types/database";

interface RecipeRow {
  key: string;
  inventoryItemId: string;
  quantity: string;
  unit: string;
}

let rowKey = 0;
function nextKey() {
  rowKey += 1;
  return String(rowKey);
}

/**
 * Dialog chỉnh công thức (danh sách nguyên liệu) của một món.
 * Giá vốn mỗi dòng = quantity × unit_cost của nguyên liệu; tổng được
 * gửi về server để cập nhật cost_price của món.
 */
export function RecipeDialog({
  open,
  onOpenChange,
  product,
  inventoryItems,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  inventoryItems: InventoryItem[];
  organizationId: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const itemById = new Map(inventoryItems.map((it) => [it.id, it]));

  function reset() {
    setError(null);
    // Mở dialog với 1 dòng trống để bắt đầu.
    setRows([{ key: nextKey(), inventoryItemId: "", quantity: "1", unit: "" }]);
  }

  function onOpenChangeInternal(next: boolean) {
    if (next) reset();
    onOpenChange(next);
  }

  function updateRow(key: string, patch: Partial<RecipeRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { key: nextKey(), inventoryItemId: "", quantity: "1", unit: "" }]);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  const totalCost = rows.reduce((sum, r) => {
    const item = itemById.get(r.inventoryItemId);
    if (!item) return sum;
    const qty = Number(r.quantity.replace(",", "."));
    return sum + item.cost_price * (Number.isFinite(qty) ? qty : 0);
  }, 0);

  function onSave() {
    setError(null);
    const items = rows
      .filter((r) => r.inventoryItemId)
      .map((r) => ({
        inventoryItemId: r.inventoryItemId,
        quantity: Number(r.quantity.replace(",", ".")),
        unit: r.unit,
      }));
    if (items.length === 0) {
      setError("Chọn ít nhất một nguyên liệu");
      return;
    }
    if (items.some((r) => !r.unit.trim())) {
      setError("Nhập đơn vị cho từng nguyên liệu");
      return;
    }
    startTransition(async () => {
      const res = await upsertProductRecipe(organizationId, product.id, items);
      if (!res.ok) {
        setError(res.error.message);
        notifyError("Lưu công thức thất bại", res.error.message);
        return;
      }
      onOpenChange(false);
      router.refresh();
      notifySuccess("Đã lưu công thức");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChangeInternal}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Công thức: {product.name}</DialogTitle>
          <DialogDescription>
            Chọn nguyên liệu và số lượng. Giá vốn món sẽ được tính tự động từ giá nhập hiện tại của nguyên liệu.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.key} className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Nguyên liệu</Label>
                  <Select value={row.inventoryItemId} onValueChange={(v) => updateRow(row.key, { inventoryItemId: v })}>
                    <SelectTrigger><SelectValue placeholder="Chọn nguyên liệu" /></SelectTrigger>
                    <SelectContent>
                      {inventoryItems.map((it) => (
                        <SelectItem key={it.id} value={it.id}>
                          {it.name} ({formatVND(it.cost_price)}/{it.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24 space-y-1.5">
                  <Label className="text-xs">Số lượng</Label>
                  <Input
                    inputMode="decimal"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                  />
                </div>
                <div className="w-24 space-y-1.5">
                  <Label className="text-xs">Đơn vị</Label>
                  <Input value={row.unit} onChange={(e) => updateRow(row.key, { unit: e.target.value })} placeholder="g, ml..." />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.key)} aria-label="Xóa nguyên liệu">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4" /> Thêm nguyên liệu
          </Button>
          <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Tổng giá vốn</span>
            <span className="font-semibold">{formatVND(Math.round(totalCost))}</span>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button type="button" onClick={onSave} disabled={isPending}>
            {isPending ? "Đang lưu..." : "Lưu công thức"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
