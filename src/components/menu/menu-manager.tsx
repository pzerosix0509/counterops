"use client";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, FileUp } from "lucide-react";
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
import { createCategory, createProduct, toggleProductActive } from "@/server/actions/menu";
import {
  commitProductImport,
  downloadProductTemplate,
  exportMenu,
  previewProductImport,
} from "@/server/actions/excel";
import { ExcelImportDialog, ExcelDownloadButton } from "@/components/common/excel-import";
import { formatVND } from "@/lib/date/ranges";
import type { MenuCategory, Product } from "@/types/database";
import { EmptyState } from "@/components/common/states";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import {
  PRODUCT_IMPORT_COLUMNS,
} from "@/lib/validation/excel-schemas";

const MENU_TYPE_LABEL: Record<string, string> = {
  food: "Đồ ăn",
  drink: "Đồ uống",
  service: "Dịch vụ",
  other: "Khác",
};

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  regular: "Thường",
  prepared: "Chế biến",
};

export function MenuManager({
  organizationId,
  canManage,
  categories,
  products,
  initialQuery,
}: {
  organizationId: string;
  canManage: boolean;
  categories: MenuCategory[];
  products: Product[];
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function applyFilter(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    router.replace(`/menu?${params.toString()}`);
  }

  function onCreateProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const payload = {
      name: String(f.get("name") || ""),
      code: String(f.get("code") || ""),
      categoryId: (f.get("categoryId") as string) || null,
      description: (f.get("description") as string) || null,
      menuType: (f.get("menuType") as string) || "food",
      productType: (f.get("productType") as string) || "regular",
      costPrice: Number(f.get("costPrice") || 0),
      salePrice: Number(f.get("salePrice") || 0),
      unit: String(f.get("unit") || "phần"),
      isActive: true,
    };
    startTransition(async () => {
      const res = await createProduct(organizationId, payload);
      if (!res.ok) {
        setError(res.error.message);
        notifyError("Thêm món thất bại", res.error.message);
        return;
      }
      setOpen(false);
      router.refresh();
      notifySuccess("Đã thêm món");
    });
  }

  function onAddCategory() {
    const name = window.prompt("Tên nhóm món mới");
    if (!name) return;
    startTransition(async () => {
      const res = await createCategory(organizationId, { name, sortOrder: 0 });
      if (!res.ok) {
        notifyError("Thêm nhóm món thất bại", res.error.message);
        return;
      }
      router.refresh();
      notifySuccess("Đã thêm nhóm món");
    });
  }

  function onToggleActive(productId: string, current: boolean) {
    startTransition(async () => {
      const res = await toggleProductActive(organizationId, productId, !current);
      if (!res.ok) {
        notifyError("Không thể cập nhật món", res.error.message);
        return;
      }
      router.refresh();
      notifySuccess(current ? "Đã ngừng bán" : "Đã bật bán");
    });
  }

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <form className="flex w-full max-w-sm items-center gap-2" onSubmit={applyFilter}>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Tìm theo tên món" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Button type="submit" variant="outline">Lọc</Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            <>
              <Button variant="outline" onClick={onAddCategory}>
                <Plus className="h-4 w-4" /> Nhóm món
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <FileUp className="h-4 w-4" /> Import Excel
              </Button>
            </>
          ) : null}
          <ExcelDownloadButton
            action={() => exportMenu(organizationId, query || undefined)}
            label="Xuất Excel"
          />
          {canManage ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> Thêm món
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Thêm món mới</DialogTitle>
                  <DialogDescription>Điền thông tin cơ bản, có thể bổ sung công thức sau.</DialogDescription>
                </DialogHeader>
                <form className="space-y-3" onSubmit={onCreateProduct}>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Tên món</Label>
                      <Input id="name" name="name" required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="code">Mã món</Label>
                      <Input id="code" name="code" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="categoryId">Nhóm món</Label>
                      <Select name="categoryId" defaultValue={categories[0]?.id ?? ""}>
                        <SelectTrigger><SelectValue placeholder="Chọn nhóm" /></SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="unit">Đơn vị</Label>
                      <Input id="unit" name="unit" defaultValue="phần" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="menuType">Loại thực đơn</Label>
                      <Select name="menuType" defaultValue="food">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="food">Đồ ăn</SelectItem>
                          <SelectItem value="drink">Đồ uống</SelectItem>
                          <SelectItem value="service">Dịch vụ</SelectItem>
                          <SelectItem value="other">Khác</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="productType">Loại sản phẩm</Label>
                      <Select name="productType" defaultValue="regular">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="regular">Món thường</SelectItem>
                          <SelectItem value="prepared">Món chế biến</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="costPrice">Giá vốn (đ)</Label>
                      <NumberInput id="costPrice" name="costPrice" defaultValue={0} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="salePrice">Giá bán (đ)</Label>
                      <NumberInput id="salePrice" name="salePrice" defaultValue={0} required />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="description">Mô tả</Label>
                    <Textarea id="description" name="description" rows={2} />
                  </div>
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Huỷ</Button>
                    <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : "Lưu món"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      {canManage ? (
        <ExcelImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          entityLabel="thực đơn"
          columns={PRODUCT_IMPORT_COLUMNS.map((c) => ({ key: c.key, header: c.header }))}
          previewAction={(payload) => previewProductImport(organizationId, payload)}
          commitAction={(preview) => commitProductImport(organizationId, preview)}
          templateAction={() => downloadProductTemplate(organizationId)}
          onCommitted={() => router.refresh()}
          successLabel="Ghi thực đơn"
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Danh sách món ({products.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <EmptyState
              title="Chưa có món nào"
              description="Tạo món đầu tiên để bắt đầu bán hàng."
            />
          ) : (
            <Table className="table-fixed">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3">Tên món</TableHead>
                  <TableHead className="px-3">Mã</TableHead>
                  <TableHead className="px-3">Nhóm</TableHead>
                  <TableHead className="px-3">Loại</TableHead>
                  <TableHead className="px-3 text-right">Giá bán</TableHead>
                  <TableHead className="px-3 text-center">Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="px-3 font-medium">{p.name}</TableCell>
                    <TableCell className="px-3 font-mono text-xs">{p.code}</TableCell>
                    <TableCell className="px-3 text-muted-foreground">
                      {p.category_id ? categoryMap.get(p.category_id) ?? "—" : "—"}
                    </TableCell>
                    <TableCell className="px-3">
                      <div className="flex flex-col gap-1 text-xs">
                        <span>{MENU_TYPE_LABEL[p.menu_type] ?? p.menu_type}</span>
                        <span className="text-muted-foreground">{PRODUCT_TYPE_LABEL[p.product_type] ?? p.product_type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 text-right font-medium">{formatVND(p.sale_price)}</TableCell>
                    <TableCell className="px-3 text-center">
                      {canManage ? (
                        <button
                          type="button"
                          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          title={p.is_active ? "Bấm để ngừng bán" : "Bấm để bật bán"}
                          onClick={() => onToggleActive(p.id, p.is_active)}
                        >
                          <Badge variant={p.is_active ? "success" : "outline"}>
                            {p.is_active ? "Đang bán" : "Ngừng bán"}
                          </Badge>
                        </button>
                      ) : (
                        <Badge variant={p.is_active ? "success" : "outline"}>
                          {p.is_active ? "Đang bán" : "Ngừng bán"}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

