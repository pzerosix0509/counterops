"use client";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, History, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/states";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import { ExcelDownloadButton, ExcelImportDialog } from "@/components/common/excel-import";
import { formatVND } from "@/lib/date/ranges";
import { formatDateTime } from "@/lib/utils/format";
import { createInventoryItem, createInventoryMovement } from "@/server/actions/inventory";
import {
  commitInventoryItemImport,
  downloadInventoryItemTemplate,
  exportInventory,
  previewInventoryItemImport,
} from "@/server/actions/excel";
import { INVENTORY_ITEM_IMPORT_COLUMNS } from "@/lib/validation/excel-schemas";
import type { InventoryItem, InventoryBalance, InventoryMovement } from "@/types/database";

const ITEM_TYPE_LABEL: Record<string, string> = {
  ingredient: "Nguyên liệu",
  sellable_product: "Hàng bán",
  packaging: "Bao bì",
  other: "Khác",
};

type MovementIntent = {
  itemId: string;
  defaultKind: MovementKind;
  showForm: boolean;
};

type MovementKind = "purchase" | "stock_out";
type ImportMode = "items" | null;

const MOVEMENT_KIND_OPTIONS: Array<{ value: MovementKind; label: string; movementType: "purchase" | "adjustment"; direction: "in" | "out" }> = [
  { value: "purchase", label: "Nhập hàng", movementType: "purchase", direction: "in" },
  { value: "stock_out", label: "Xuất hàng", movementType: "adjustment", direction: "out" },
];

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  purchase: "Nhập hàng",
  sale_deduction: "Bán hàng",
  adjustment: "Xuất hàng",
  transfer_in: "Chuyển kho vào",
  transfer_out: "Xuất hàng",
  waste: "Xuất hàng",
  return: "Xuất hàng",
};

export function InventoryManager({
  organizationId,
  branchId,
  canManage,
  items,
  balances,
  initialQuery,
  defaultLowStockThreshold,
  lowStockAlertEnabled,
}: {
  organizationId: string;
  branchId: string;
  canManage: boolean;
  items: InventoryItem[];
  balances: InventoryBalance[];
  initialQuery: string;
  defaultLowStockThreshold: number;
  lowStockAlertEnabled: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [openItem, setOpenItem] = useState(false);
  const [movementIntent, setMovementIntent] = useState<MovementIntent | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [movements, setMovements] = useState<Record<string, InventoryMovement[]>>({});
  const [loadingMv, setLoadingMv] = useState<string | null>(null);

  function onFilter(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    router.replace(`/inventory?${params.toString()}`);
  }

  function onCreateItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const payload = {
      name: String(f.get("name") || ""),
      code: String(f.get("code") || ""),
      itemType: (f.get("itemType") as string) || "ingredient",
      unit: String(f.get("unit") || ""),
      costPrice: Number(f.get("costPrice") || 0),
      description: String(f.get("description") || "") || null,
      initialQuantity: Number(f.get("initialQuantity") || 0),
      lowStockThreshold: Number(f.get("lowStockThreshold") || 0),
    };
    startTransition(async () => {
      const res = await createInventoryItem(organizationId, branchId, payload);
      if (!res.ok) {
        setError(res.error.message);
        notifyError("Thêm hàng hóa thất bại", res.error.message);
        return;
      }
      setOpenItem(false);
      router.refresh();
      notifySuccess("Đã thêm hàng hóa");
    });
  }

  function onCreateMovement(itemId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const movementKind = String(f.get("movementKind") || "purchase") as MovementKind;
    const movement = MOVEMENT_KIND_OPTIONS.find((option) => option.value === movementKind) ?? MOVEMENT_KIND_OPTIONS[0];
    const quantity = Number(f.get("quantity") || 0);
    const quantityDelta = movement.direction === "out" ? -Math.abs(quantity) : Math.abs(quantity);
    const payload = {
      branchId,
      inventoryItemId: itemId,
      movementType: movement.movementType,
      quantityDelta,
      unitCost: 0,
      note: String(f.get("note") || "") || null,
    };
    startTransition(async () => {
      const res = await createInventoryMovement(organizationId, payload);
      if (!res.ok) {
        setError(res.error.message);
        notifyError("Không thể ghi phiếu kho", res.error.message);
        return;
      }
      setMovementIntent(null);
      router.refresh();
      notifySuccess("Đã ghi phiếu kho");
    });
  }

  async function loadMovements(itemId: string) {
    setLoadingMv(itemId);
    const res = await fetch(`/api/inventory/movements?branchId=${branchId}&itemId=${itemId}`);
    if (res.ok) {
      const json = await res.json();
      setMovements((m) => ({ ...m, [itemId]: json.movements ?? [] }));
    }
    setLoadingMv(null);
  }

  const balanceMap = useMemo(() => {
    const m = new Map<string, InventoryBalance>();
    for (const b of balances) m.set(b.inventory_item_id, b);
    return m;
  }, [balances]);

  function openMovement(intent: MovementIntent) {
    setError(null);
    setMovementIntent(intent);
    if (!movements[intent.itemId]) loadMovements(intent.itemId);
  }

  const activeMovementItem = movementIntent ? items.find((item) => item.id === movementIntent.itemId) : null;
  const activeMovementId = movementIntent?.itemId ?? null;
  const activeBalance = activeMovementId ? balanceMap.get(activeMovementId) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <form className="flex w-full max-w-sm items-center gap-2" onSubmit={onFilter}>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Tìm hàng hoá" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Button type="submit" variant="outline">Lọc</Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <ExcelDownloadButton
            action={() => exportInventory(organizationId, branchId, query || undefined)}
            label="Xuất Excel"
          />
          {canManage ? (
            <>
              <Button variant="outline" onClick={() => setImportMode("items")}>
                <FileUp className="h-4 w-4" /> Import hàng kho
              </Button>
              <Dialog open={openItem} onOpenChange={setOpenItem}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4" /> Thêm hàng hoá
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Thêm hàng hoá</DialogTitle>
                    <DialogDescription>
                      Tạo hàng mới trong kho. Nếu đang có sẵn hàng, nhập số tồn hiện có để khởi tạo kho.
                    </DialogDescription>
                  </DialogHeader>
                  <form className="space-y-3" onSubmit={onCreateItem}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="name">Tên hàng</Label>
                        <Input id="name" name="name" required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="code">Mã hàng</Label>
                        <Input id="code" name="code" required />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="itemType">Loại</Label>
                        <Select name="itemType" defaultValue="ingredient">
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ingredient">Nguyên liệu</SelectItem>
                            <SelectItem value="sellable_product">Hàng bán</SelectItem>
                            <SelectItem value="packaging">Bao bì</SelectItem>
                            <SelectItem value="other">Khác</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="unit">Đơn vị</Label>
                        <Input id="unit" name="unit" required placeholder="g, ml, chai..." />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="costPrice">Giá vốn</Label>
                        <Input id="costPrice" name="costPrice" type="number" min="0" step="100" defaultValue={0} required />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="initialQuantity">Tồn kho ban đầu</Label>
                        <Input
                          id="initialQuantity"
                          name="initialQuantity"
                          type="number"
                          min="0"
                          step="0.1"
                          defaultValue={0}
                          aria-describedby="initialQuantityHint"
                        />
                        <p id="initialQuantityHint" className="text-xs text-muted-foreground">
                          Số lượng đang có trong kho lúc tạo hàng. Để 0 nếu chưa có tồn.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="lowStockThreshold">Ngưỡng cảnh báo sắp hết</Label>
                        <Input
                          id="lowStockThreshold"
                          name="lowStockThreshold"
                          type="number"
                          min="0"
                          step="0.1"
                          defaultValue={defaultLowStockThreshold}
                          aria-describedby="lowStockThresholdHint"
                        />
                        <p id="lowStockThresholdHint" className="text-xs text-muted-foreground">
                          Khi tồn kho nhỏ hơn hoặc bằng số này, hệ thống báo “Sắp hết”.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="description">Mô tả</Label>
                      <Textarea id="description" name="description" rows={2} />
                    </div>
                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setOpenItem(false)}>Huỷ</Button>
                      <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : "Lưu"}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          ) : null}
        </div>
      </div>

      {canManage ? (
        <ExcelImportDialog
          open={importMode === "items"}
          onOpenChange={(open) => !open && setImportMode(null)}
          entityLabel="hàng hoá"
          columns={INVENTORY_ITEM_IMPORT_COLUMNS.map((c) => ({ key: c.key, header: c.header }))}
          previewAction={(payload) => previewInventoryItemImport(organizationId, branchId, payload)}
          commitAction={(preview) => commitInventoryItemImport(organizationId, branchId, preview)}
          templateAction={() => downloadInventoryItemTemplate(organizationId)}
          onCommitted={() => router.refresh()}
          successLabel="Ghi hàng hoá"
        />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Danh sách hàng ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <EmptyState title="Chưa có hàng hoá" description="Tạo hàng hoá đầu tiên cho kho." />
          ) : (
            <div className="overflow-x-auto">
            <Table className="min-w-[1100px] table-fixed">
              <colgroup>
                <col className="w-[150px]" />
                <col className="w-[260px]" />
                <col className="w-[90px]" />
                <col className="w-[140px]" />
                <col className="w-[120px]" />
                <col className="w-[130px]" />
                <col className="w-[100px]" />
                <col className="w-[110px]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3">Mã</TableHead>
                  <TableHead className="px-3">Tên hàng</TableHead>
                  <TableHead className="px-3">Đơn vị</TableHead>
                  <TableHead className="px-3 text-right">Giá vốn</TableHead>
                  <TableHead className="px-3 text-right">Tồn</TableHead>
                  <TableHead className="px-3 text-center">Trạng thái</TableHead>
                  <TableHead className="px-3 text-center">Thao tác</TableHead>
                  <TableHead className="px-3" aria-label="Lịch sử" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const b = balanceMap.get(it.id);
                  const qty = Number(b?.quantity_on_hand ?? 0);
                  const low = Number(b?.low_stock_threshold ?? 0);
                  const isNegative = qty < 0;
                  const isOut = qty === 0;
                  const isLow = lowStockAlertEnabled && !isNegative && !isOut && low > 0 && qty <= low;
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="px-3 font-mono text-xs">
                        <span className="block truncate" title={it.code}>{it.code}</span>
                      </TableCell>
                      <TableCell className="px-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium" title={it.name}>{it.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{ITEM_TYPE_LABEL[it.item_type] ?? it.item_type}</p>
                        </div>
                      </TableCell>
                      <TableCell className="px-3">{it.unit}</TableCell>
                      <TableCell className="px-3 text-right">{formatVND(it.cost_price)}</TableCell>
                      <TableCell className="px-3 text-right">
                        <div className="font-medium">{qty.toLocaleString("vi-VN")}</div>
                        <div className="text-xs text-muted-foreground">Cảnh báo ≤ {low || "—"}</div>
                      </TableCell>
                      <TableCell className="px-3 text-center">
                        {isNegative ? (
                          <Badge variant="danger" className="whitespace-nowrap">Âm kho</Badge>
                        ) : isOut ? (
                          <Badge variant="danger" className="whitespace-nowrap">Hết hàng</Badge>
                        ) : isLow ? (
                          <Badge variant="warning" className="whitespace-nowrap">Sắp hết</Badge>
                        ) : (
                          <Badge variant="success" className="whitespace-nowrap">Ổn</Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-3 text-center">
                        {canManage ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            onClick={() => openMovement({ itemId: it.id, defaultKind: "purchase", showForm: true })}
                          >
                            <Plus className="h-3.5 w-3.5" /> Nhập / xuất
                          </Button>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-3">
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="shrink-0"
                            onClick={() => openMovement({ itemId: it.id, defaultKind: "purchase", showForm: false })}
                          >
                            <History className="h-3.5 w-3.5" /> Lịch sử
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!movementIntent} onOpenChange={(open) => !open && setMovementIntent(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Thẻ kho & phiếu nhập / xuất</DialogTitle>
            <DialogDescription>
              {activeMovementItem ? `${activeMovementItem.name} (${activeMovementItem.code})` : ""}
            </DialogDescription>
          </DialogHeader>
          {movementIntent && movementIntent.showForm && canManage ? (
            <form className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-[1.4fr_1fr]" onSubmit={(e) => onCreateMovement(movementIntent.itemId, e)}>
              <div className="space-y-1">
                <Label>Loại phiếu</Label>
                <Select name="movementKind" defaultValue={movementIntent.defaultKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOVEMENT_KIND_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>
              <div className="space-y-1">
                <Label>Số lượng ({activeMovementItem?.unit ?? ""})</Label>
                <Input name="quantity" type="number" step="0.1" min="0" placeholder="Số lượng" defaultValue={1} required />
              </div>
              <Input name="note" placeholder="Ghi chú" className="sm:col-span-2" />
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Tồn hiện tại: {(Number(activeBalance?.quantity_on_hand ?? 0)).toLocaleString("vi-VN")} {activeMovementItem?.unit ?? ""}
              </p>
              {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
              <Button type="submit" disabled={isPending} className="sm:col-span-2">{isPending ? "Đang lưu..." : "Lưu phiếu"}</Button>
            </form>
          ) : null}
          <div className="max-h-80 overflow-auto rounded-md border">
            {loadingMv === activeMovementId ? (
              <p className="p-4 text-sm text-muted-foreground">Đang tải...</p>
            ) : activeMovementId && movements[activeMovementId]?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead className="text-right">SL</TableHead>
                    <TableHead>Ghi chú</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements[activeMovementId].map((mv) => (
                    <TableRow key={mv.id}>
                      <TableCell className="text-xs">{formatDateTime(mv.created_at)}</TableCell>
                      <TableCell className="text-xs">
                        {mv.movement_type === "adjustment"
                          ? Number(mv.quantity_delta) >= 0
                            ? "Nhập hàng"
                            : "Xuất hàng"
                          : MOVEMENT_TYPE_LABEL[mv.movement_type] ?? mv.movement_type}
                      </TableCell>
                      <TableCell className={Number(mv.quantity_delta) < 0 ? "text-right text-xs text-rose-600" : "text-right text-xs text-emerald-700"}>
                        {Number(mv.quantity_delta) > 0 ? "+" : ""}{Number(mv.quantity_delta).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-xs">{mv.note ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">Chưa có lịch sử kho.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
