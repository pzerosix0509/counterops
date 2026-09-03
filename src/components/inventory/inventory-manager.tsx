"use client";
import { useEffect, useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, FileUp, Trash2, ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/states";
import { RowContextMenu } from "@/components/common/row-context-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import { ExcelDownloadButton, ExcelImportDialog } from "@/components/common/excel-import";
import { formatVND } from "@/lib/date/ranges";
import { buildInventoryDeleteConflictMessage } from "@/lib/calculations/inventory";
import { formatDateTime } from "@/lib/utils/format";
import { createInventoryItem, createInventoryMovement, deleteInventoryItem, getInventoryDeleteBlockers, updateInventoryItem } from "@/server/actions/inventory";
import { CategoryFields, ensureCategoryId } from "@/components/menu/category-fields";
import { readCategoryForm } from "@/lib/ui/category-form";
import {
  commitInventoryItemImport,
  downloadInventoryItemTemplate,
  exportInventory,
  previewInventoryItemImport,
} from "@/server/actions/excel";
import { INVENTORY_ITEM_IMPORT_COLUMNS } from "@/lib/validation/excel-schemas";
import type { InventoryBalance, InventoryMovement, MenuCategory } from "@/types/database";
import type { InventoryItemView } from "@/server/queries/inventory";

type MovementIntent = {
  itemId: string;
  defaultKind: MovementKind;
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
  categories,
  initialQuery,
  defaultLowStockThreshold,
  lowStockAlertEnabled,
}: {
  organizationId: string;
  branchId: string;
  canManage: boolean;
  items: InventoryItemView[];
  balances: InventoryBalance[];
  categories: MenuCategory[];
  initialQuery: string;
  defaultLowStockThreshold: number;
  lowStockAlertEnabled: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [openItem, setOpenItem] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItemView | null>(null);
  const [movementIntent, setMovementIntent] = useState<MovementIntent | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [movements, setMovements] = useState<Record<string, InventoryMovement[]>>({});
  const [loadingMv, setLoadingMv] = useState<string | null>(null);
  const [canBeIngredient, setCanBeIngredient] = useState(true);
  const [canBeSold, setCanBeSold] = useState(false);
  const [editCanBeIngredient, setEditCanBeIngredient] = useState(true);
  const [editCanBeSold, setEditCanBeSold] = useState(false);
  const [deleteBlockedProducts, setDeleteBlockedProducts] = useState<string[]>([]);
  const [usageItem, setUsageItem] = useState<InventoryItemView | null>(null);
  const [usageProducts, setUsageProducts] = useState<string[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<InventoryItemView | null>(null);
  const [deleting, setDeleting] = useState(false);

  function confirmDeleteItem(item: InventoryItemView) {
    setDeleting(true);
    startTransition(async () => {
      const res = await deleteInventoryItem(organizationId, item.id);
      setDeleting(false);
      setPendingDelete(null);
      if (!res.ok) {
        if (editItem?.id === item.id) {
          const blocked = res.error.fieldErrors?.affectedProducts ?? deleteBlockedProducts;
          setDeleteBlockedProducts(blocked);
          setError(res.error.message);
        }
        notifyError("Không thể xóa hàng hóa", res.error.message);
        return;
      }
      if (editItem?.id === item.id) setEditItem(null);
      router.refresh();
      notifySuccess("Đã xóa hàng hóa");
    });
  }

  function onFilter(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    router.replace(params.size > 0 ? `/inventory?${params.toString()}` : "/inventory");
  }

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.trim().toLowerCase();
    return items.filter(
      (it) => it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q)
    );
  }, [items, query]);

  function onCreateItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const picked = readCategoryForm(f);
    const payload = {
      name: String(f.get("name") || ""),
      canBeIngredient,
      canBeSold,
      salePrice: canBeSold ? Number(f.get("salePrice") || 0) : undefined,
      unit: String(f.get("unit") || ""),
      costPrice: Number(f.get("costPrice") || 0),
      description: String(f.get("description") || "") || null,
      initialQuantity: Number(f.get("initialQuantity") || 0),
      lowStockThreshold: Number(f.get("lowStockThreshold") || 0),
    };
    startTransition(async () => {
      let categoryId: string | null = null;
      const menuType = picked.menuType;
      if (canBeSold) {
        const resolved = await ensureCategoryId(organizationId, picked, categories.length);
        if (resolved.error) {
          setError(resolved.error);
          notifyError("Thêm hàng hóa thất bại", resolved.error);
          return;
        }
        categoryId = resolved.categoryId;
      }
      const res = await createInventoryItem(organizationId, branchId, {
        ...payload,
        categoryId: canBeSold ? categoryId : null,
        menuType: canBeSold ? menuType : undefined,
      });
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

  function openEdit(item: InventoryItemView) {
    setError(null);
    setDeleteBlockedProducts([]);
    setEditCanBeIngredient(item.can_be_ingredient);
    setEditCanBeSold(item.can_be_sold);
    setEditItem(item);
  }

  function openUsage(item: InventoryItemView) {
    setUsageItem(item);
    setUsageProducts([]);
    setUsageLoading(true);
    getInventoryDeleteBlockers(organizationId, item.id).then((res) => {
      if (res.ok) setUsageProducts(res.data.productNames);
      setUsageLoading(false);
    });
  }

  function onDeleteFromContext(item: InventoryItemView) {
    setPendingDelete(item);
  }

  useEffect(() => {
    if (!editItem) {
      setDeleteBlockedProducts([]);
      return;
    }
    let cancelled = false;
    void getInventoryDeleteBlockers(organizationId, editItem.id).then((res) => {
      if (cancelled || !res.ok) return;
      setDeleteBlockedProducts(res.data.productNames);
    });
    return () => {
      cancelled = true;
    };
  }, [editItem, organizationId]);

  function onUpdateItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editItem) return;
    setError(null);
    const f = new FormData(e.currentTarget);
    const picked = readCategoryForm(f);
    const payload = {
      id: editItem.id,
      name: String(f.get("name") || ""),
      canBeIngredient: editCanBeIngredient,
      canBeSold: editCanBeSold,
      salePrice: editCanBeSold ? Number(f.get("salePrice") || 0) : undefined,
      unit: String(f.get("unit") || ""),
      costPrice: Number(f.get("costPrice") || 0),
      description: String(f.get("description") || "") || null,
      lowStockThreshold: Number(f.get("lowStockThreshold") || 0),
    };
    startTransition(async () => {
      let categoryId: string | null = editItem.linkedProduct?.category_id ?? null;
      const menuType = picked.menuType;
      if (editCanBeSold) {
        const resolved = await ensureCategoryId(organizationId, picked, categories.length);
        if (resolved.error) {
          setError(resolved.error);
          notifyError("Cập nhật hàng hóa thất bại", resolved.error);
          return;
        }
        categoryId = resolved.categoryId;
      }
      const res = await updateInventoryItem(organizationId, branchId, {
        ...payload,
        categoryId: editCanBeSold ? categoryId : null,
        menuType: editCanBeSold ? menuType : undefined,
      });
      if (!res.ok) {
        setError(res.error.message);
        notifyError("Cập nhật hàng hóa thất bại", res.error.message);
        return;
      }
      setEditItem(null);
      router.refresh();
      notifySuccess("Đã cập nhật hàng hóa");
    });
  }

  function onDeleteItem() {
    if (!editItem) return;
    if (deleteBlockedProducts.length > 0) {
      setError(buildInventoryDeleteConflictMessage(deleteBlockedProducts));
      return;
    }
    setPendingDelete(editItem);
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
            <Input className="pl-8" placeholder="Tìm theo tên hoặc mã hàng" value={query} onChange={(e) => setQuery(e.target.value)} />
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
                      Tên hàng unique trong cửa hàng. Không nhập mã. Tick bán để hiện trên thực đơn.
                    </DialogDescription>
                  </DialogHeader>
                  <form className="space-y-3" onSubmit={onCreateItem}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="name">Tên hàng</Label>
                        <Input id="name" name="name" required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="unit">Đơn vị</Label>
                        <Input id="unit" name="unit" required placeholder="g, ml, chai..." />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={canBeIngredient} onChange={(e) => setCanBeIngredient(e.target.checked)} />
                      Dùng làm nguyên liệu
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={canBeSold} onChange={(e) => setCanBeSold(e.target.checked)} />
                      Bán trên thực đơn
                    </label>
                    {canBeSold ? (
                      <CategoryFields
                        organizationId={organizationId}
                        categories={categories}
                        onGroupCreated={() => router.refresh()}
                      />
                    ) : null}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="initialQuantity">Tồn kho ban đầu</Label>
                        <NumberInput
                          id="initialQuantity"
                          name="initialQuantity"
                          defaultValue={0}
                          decimals={1}
                          aria-describedby="initialQuantityHint"
                        />
                        <p id="initialQuantityHint" className="text-xs text-muted-foreground">
                          Số lượng đang có trong kho lúc tạo hàng. Để 0 nếu chưa có tồn.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="lowStockThreshold">Ngưỡng cảnh báo sắp hết</Label>
                        <NumberInput
                          id="lowStockThreshold"
                          name="lowStockThreshold"
                          defaultValue={defaultLowStockThreshold}
                          decimals={1}
                          aria-describedby="lowStockThresholdHint"
                        />
                        <p id="lowStockThresholdHint" className="text-xs text-muted-foreground">
                          Khi tồn kho nhỏ hơn hoặc bằng số này, hệ thống báo “Sắp hết”.
                        </p>
                      </div>
                    </div>
                    {canBeSold ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="costPrice">Giá vốn</Label>
                          <NumberInput id="costPrice" name="costPrice" defaultValue={0} required />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="salePrice">Giá bán (đ)</Label>
                          <NumberInput id="salePrice" name="salePrice" defaultValue={0} required />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label htmlFor="costPrice">Giá vốn</Label>
                        <NumberInput id="costPrice" name="costPrice" defaultValue={0} required />
                      </div>
                    )}
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
          <CardTitle className="text-sm">Danh sách hàng ({filteredItems.length}{query.trim() && filteredItems.length !== items.length ? ` / ${items.length}` : ""})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredItems.length === 0 ? (
            <EmptyState title={items.length === 0 ? "Chưa có hàng hoá" : "Không có hàng phù hợp"} description={items.length === 0 ? "Tạo hàng hoá đầu tiên cho kho." : "Thử đổi từ khóa hoặc bấm Lọc để tìm trên toàn kho."} />
          ) : (
            <div className="overflow-x-auto">
            <Table className="min-w-[1100px] table-fixed">
              <colgroup>
                <col className="w-[280px]" />
                <col className="w-[90px]" />
                <col className="w-[140px]" />
                <col className="w-[120px]" />
                <col className="w-[130px]" />
                <col className="w-[220px]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3">Tên hàng</TableHead>
                  <TableHead className="px-3">Đơn vị</TableHead>
                  <TableHead className="px-3 text-right">Giá vốn</TableHead>
                  <TableHead className="px-3 text-right">Tồn</TableHead>
                  <TableHead className="px-3 text-center">Trạng thái</TableHead>
                  <TableHead className="px-3 text-center">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((it) => {
                  const b = balanceMap.get(it.id);
                  const qty = Number(b?.quantity_on_hand ?? 0);
                  const low = Number(b?.low_stock_threshold ?? 0);
                  const isNegative = qty < 0;
                  const isOut = qty === 0;
                  const isLow = lowStockAlertEnabled && !isNegative && !isOut && low > 0 && qty <= low;
                  const contextItems = canManage
                    ? [
                        {
                          key: "recipe",
                          label: "Công thức",
                          icon: ChefHat,
                          onClick: () => openUsage(it),
                        },
                        {
                          key: "edit",
                          label: "Chỉnh sửa",
                          icon: Pencil,
                          onClick: () => openEdit(it),
                        },
                        {
                          key: "delete",
                          label: "Xóa",
                          icon: Trash2,
                          destructive: true,
                          onClick: () => onDeleteFromContext(it),
                        },
                      ]
                    : [];
                  return (
                    <RowContextMenu key={it.id} as="tr" items={contextItems}>
                      <TableCell className="px-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium" title={it.name}>{it.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[it.can_be_ingredient ? "Nguyên liệu" : null, it.can_be_sold ? "Bán liền" : null].filter(Boolean).join(" · ") || "Chưa gán vai trò"}
                          </p>
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
                          <div className="flex w-full items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              onClick={() => openMovement({ itemId: it.id, defaultKind: "purchase" })}
                            >
                              <Plus className="h-3.5 w-3.5" /> Nhập / xuất
                            </Button>
                            <Button size="sm" variant="ghost" className="shrink-0" onClick={() => openEdit(it)} aria-label="Chỉnh sửa" title="Chỉnh sửa">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : null}
                      </TableCell>
                    </RowContextMenu>
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
              {activeMovementItem ? activeMovementItem.name : ""}
            </DialogDescription>
          </DialogHeader>
          {movementIntent && canManage ? (
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
                <NumberInput name="quantity" defaultValue={1} decimals={1} placeholder="Số lượng" required />
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

      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chỉnh sửa hàng hóa</DialogTitle>
            <DialogDescription>Cập nhật tên, giá, vai trò hoặc xóa hàng khỏi kho.</DialogDescription>
          </DialogHeader>
          {editItem ? (
            <form key={editItem.id} className="space-y-3" onSubmit={onUpdateItem}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name">Tên hàng</Label>
                  <Input id="edit-name" name="name" defaultValue={editItem.name} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-unit">Đơn vị</Label>
                  <Input id="edit-unit" name="unit" defaultValue={editItem.unit} required />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editCanBeIngredient} onChange={(e) => setEditCanBeIngredient(e.target.checked)} />
                Dùng làm nguyên liệu
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editCanBeSold} onChange={(e) => setEditCanBeSold(e.target.checked)} />
                Bán trên thực đơn
              </label>
              {editCanBeSold ? (
                <CategoryFields
                  organizationId={organizationId}
                  categories={categories}
                  defaultCategoryId={editItem.linkedProduct?.category_id ?? null}
                  defaultMenuType={editItem.linkedProduct?.menu_type ?? "food"}
                  onGroupCreated={() => router.refresh()}
                />
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="edit-lowStockThreshold">Ngưỡng cảnh báo sắp hết</Label>
                <NumberInput
                  id="edit-lowStockThreshold"
                  name="lowStockThreshold"
                  defaultValue={Number(balanceMap.get(editItem.id)?.low_stock_threshold ?? defaultLowStockThreshold)}
                  decimals={1}
                />
              </div>
              {editCanBeSold ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-costPrice">Giá vốn</Label>
                    <NumberInput id="edit-costPrice" name="costPrice" defaultValue={editItem.cost_price} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-salePrice">Giá bán (đ)</Label>
                    <NumberInput
                      id="edit-salePrice"
                      name="salePrice"
                      defaultValue={editItem.linkedProduct?.sale_price ?? editItem.cost_price}
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-costPrice">Giá vốn</Label>
                  <NumberInput id="edit-costPrice" name="costPrice" defaultValue={editItem.cost_price} required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="edit-description">Mô tả</Label>
                <Textarea id="edit-description" name="description" rows={2} defaultValue={editItem.description ?? ""} />
              </div>
              {deleteBlockedProducts.length > 0 ? (
                <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  <p className="font-medium">Không thể xóa vì đang dùng trong {deleteBlockedProducts.length} món chế biến</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {deleteBlockedProducts.slice(0, 8).map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                  {deleteBlockedProducts.length > 8 ? (
                    <p className="mt-1 text-xs text-amber-900">... và {deleteBlockedProducts.length - 8} món khác</p>
                  ) : null}
                  <Link href="/menu" className="mt-2 inline-block text-sm font-medium text-primary underline">
                    Mở Thực đơn để sửa công thức
                  </Link>
                </div>
              ) : null}
              {error ? <p className="whitespace-pre-line text-sm text-destructive">{error}</p> : null}
              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isPending || deleteBlockedProducts.length > 0}
                  onClick={onDeleteItem}
                >
                  <Trash2 className="h-4 w-4" /> Xóa hàng
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setEditItem(null)}>Huỷ</Button>
                  <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : "Lưu"}</Button>
                </div>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!usageItem} onOpenChange={(open) => !open && setUsageItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Công thức dùng: {usageItem?.name}</DialogTitle>
            <DialogDescription>Các món chế biến đang sử dụng mặt hàng này làm nguyên liệu.</DialogDescription>
          </DialogHeader>
          {usageLoading ? (
            <p className="py-4 text-sm text-muted-foreground">Đang tải...</p>
          ) : usageProducts.length > 0 ? (
            <ul className="max-h-72 overflow-auto space-y-2">
              {usageProducts.map((name) => (
                <li key={name} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <ChefHat className="h-4 w-4 text-muted-foreground" />
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">Chưa có món chế biến nào dùng mặt hàng này.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setUsageItem(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open && !deleting) setPendingDelete(null); }}
        title={`Xóa hàng "${pendingDelete?.name ?? ""}"?`}
        description="Hàng sẽ ẩn khỏi kho và thực đơn."
        pending={deleting}
        onConfirm={() => pendingDelete && confirmDeleteItem(pendingDelete)}
      />
    </div>
  );
}
