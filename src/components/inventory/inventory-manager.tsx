"use client";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, AlertTriangle, History } from "lucide-react";
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
import { formatVND } from "@/lib/date/ranges";
import { formatDateTime } from "@/lib/utils/format";
import { createInventoryItem, createInventoryMovement } from "@/server/actions/inventory";
import type { InventoryItem, InventoryBalance, InventoryMovement } from "@/types/database";
import { useState as useReactState } from "react";

export function InventoryManager({
  organizationId,
  branchId,
  canManage,
  items,
  balances,
  initialQuery,
}: {
  organizationId: string;
  branchId: string;
  canManage: boolean;
  items: InventoryItem[];
  balances: InventoryBalance[];
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [openItem, setOpenItem] = useState(false);
  const [openMv, setOpenMv] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [movements, setMovements] = useReactState<Record<string, InventoryMovement[]>>({});
  const [loadingMv, setLoadingMv] = useReactState<string | null>(null);

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
        return;
      }
      setOpenItem(false);
      router.refresh();
    });
  }

  function onCreateMovement(itemId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const movementType = String(f.get("movementType") || "purchase") as "purchase" | "adjustment" | "waste" | "return" | "transfer_in" | "transfer_out";
    const direction = String(f.get("direction") || "in");
    const quantity = Number(f.get("quantity") || 0);
    const quantityDelta = direction === "out" ? -Math.abs(quantity) : Math.abs(quantity);
    const payload = {
      branchId,
      inventoryItemId: itemId,
      movementType,
      quantityDelta,
      unitCost: Number(f.get("unitCost") || 0),
      note: String(f.get("note") || "") || null,
    };
    startTransition(async () => {
      const res = await createInventoryMovement(organizationId, payload);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setOpenMv(null);
      router.refresh();
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
        {canManage ? (
          <Dialog open={openItem} onOpenChange={setOpenItem}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> Thêm hàng hoá
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Thêm hàng hoá</DialogTitle>
                <DialogDescription>Tạo hàng mới trong kho, có thể nhập tồn ban đầu.</DialogDescription>
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
                    <Label htmlFor="initialQuantity">Tồn đầu</Label>
                    <Input id="initialQuantity" name="initialQuantity" type="number" min="0" step="0.1" defaultValue={0} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lowStockThreshold">Định mức thấp</Label>
                    <Input id="lowStockThreshold" name="lowStockThreshold" type="number" min="0" step="0.1" defaultValue={0} />
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
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Danh sách hàng ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <EmptyState title="Chưa có hàng hoá" description="Tạo hàng hoá đầu tiên cho kho." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã</TableHead>
                  <TableHead>Tên</TableHead>
                  <TableHead>Đơn vị</TableHead>
                  <TableHead className="text-right">Giá vốn</TableHead>
                  <TableHead className="text-right">Tồn</TableHead>
                  <TableHead>Định mức</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const b = balanceMap.get(it.id);
                  const qty = Number(b?.quantity_on_hand ?? 0);
                  const low = Number(b?.low_stock_threshold ?? 0);
                  const isLow = qty <= low;
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="font-mono text-xs">{it.code}</TableCell>
                      <TableCell className="font-medium">{it.name}</TableCell>
                      <TableCell>{it.unit}</TableCell>
                      <TableCell className="text-right">{formatVND(it.cost_price)}</TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-1">
                          {qty.toLocaleString("vi-VN")}
                          {isLow ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{low || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {isLow ? <Badge variant="warning">Sắp hết</Badge> : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setOpenMv(it.id);
                              if (!movements[it.id]) loadMovements(it.id);
                            }}
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
          )}
        </CardContent>
      </Card>

      <Dialog open={!!openMv} onOpenChange={(v) => !v && setOpenMv(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thẻ kho & phiếu nhập / xuất</DialogTitle>
            <DialogDescription>
              {openMv ? items.find((i) => i.id === openMv)?.name : ""}
            </DialogDescription>
          </DialogHeader>
          {openMv && canManage ? (
            <form className="mb-4 grid grid-cols-2 gap-2 text-sm" onSubmit={(e) => onCreateMovement(openMv, e)}>
              <Select name="movementType" defaultValue="purchase">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Nhập hàng</SelectItem>
                  <SelectItem value="adjustment">Điều chỉnh</SelectItem>
                  <SelectItem value="waste">Xuất hủy</SelectItem>
                  <SelectItem value="return">Trả hàng</SelectItem>
                </SelectContent>
              </Select>
              <Select name="direction" defaultValue="in">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Tăng (+)</SelectItem>
                  <SelectItem value="out">Giảm (-)</SelectItem>
                </SelectContent>
              </Select>
              <Input name="quantity" type="number" step="0.1" min="0" placeholder="Số lượng" required />
              <Input name="unitCost" type="number" min="0" step="100" placeholder="Đơn giá" defaultValue={0} />
              <Input name="note" placeholder="Ghi chú" className="col-span-2" />
              {error ? <p className="col-span-2 text-sm text-destructive">{error}</p> : null}
              <Button type="submit" disabled={isPending} className="col-span-2">{isPending ? "Đang lưu..." : "Lưu phiếu"}</Button>
            </form>
          ) : null}
          <div className="max-h-80 overflow-auto rounded-md border">
            {loadingMv === openMv ? (
              <p className="p-4 text-sm text-muted-foreground">Đang tải...</p>
            ) : (openMv && movements[openMv])?.length ? (
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
                  {movements[openMv].map((mv) => (
                    <TableRow key={mv.id}>
                      <TableCell className="text-xs">{formatDateTime(mv.created_at)}</TableCell>
                      <TableCell className="text-xs">{mv.movement_type}</TableCell>
                      <TableCell className="text-right text-xs">{mv.quantity_delta}</TableCell>
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
