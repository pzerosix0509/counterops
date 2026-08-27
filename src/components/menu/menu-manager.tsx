"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, FileUp, Trash2, ChefHat, Pencil, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createCategory,
  createIngredientFromMenu,
  createProduct,
  deleteCategory,
  setProductCategory,
  toggleProductActive,
  updateCategory,
  updateProduct,
} from "@/server/actions/menu";
import {
  commitProductImport,
  downloadProductTemplate,
  exportMenu,
  previewProductImport,
} from "@/server/actions/excel";
import { ExcelImportDialog, ExcelDownloadButton } from "@/components/common/excel-import";
import { RecipeDialog } from "@/components/menu/recipe-dialog";
import { formatVND } from "@/lib/date/ranges";
import { computeBomCost } from "@/lib/calculations/inventory";
import type { InventoryItem, MenuCategory, MenuType, Product } from "@/types/database";
import { EmptyState } from "@/components/common/states";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import { PRODUCT_IMPORT_COLUMNS } from "@/lib/validation/excel-schemas";

const MENU_TYPE_LABEL: Record<MenuType, string> = {
  food: "Đồ ăn",
  drink: "Đồ uống",
  service: "Dịch vụ",
  other: "Khác",
};

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  regular: "Bán liền",
  prepared: "Chế biến",
};

type RecipeLine = { inventoryItemId: string; quantity: string };
type ActiveRecipe = {
  product_id: string;
  recipe_items: Array<{ inventory_item_id: string; quantity: number; unit: string }> | null;
};

export function MenuManager({
  organizationId,
  branchId,
  canManage,
  categories,
  products,
  inventoryItems,
  recipes,
  initialQuery,
}: {
  organizationId: string;
  branchId: string;
  canManage: boolean;
  categories: MenuCategory[];
  products: Product[];
  inventoryItems: InventoryItem[];
  recipes: ActiveRecipe[];
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [recipeProduct, setRecipeProduct] = useState<Product | null>(null);
  const [ingredientOpen, setIngredientOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [productType, setProductType] = useState<"regular" | "prepared">("regular");
  const [recipeLines, setRecipeLines] = useState<RecipeLine[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>("");

  const ingredients = useMemo(
    () => inventoryItems.filter((item) => item.can_be_ingredient),
    [inventoryItems]
  );
  const recipeByProduct = useMemo(() => new Map(recipes.map((r) => [r.product_id, r])), [recipes]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
      if (categoryFilter === "uncat") return !p.category_id;
      if (categoryFilter !== "all" && p.category_id !== categoryFilter) return false;
      return true;
    });
  }, [products, query, categoryFilter]);

  const bomCost = useMemo(() => {
    return computeBomCost(
      recipeLines
        .filter((line) => line.inventoryItemId)
        .map((line) => {
          const item = inventoryItems.find((inv) => inv.id === line.inventoryItemId);
          return { quantity: Number(line.quantity || 0), unitCost: Number(item?.cost_price ?? 0) };
        })
    );
  }, [recipeLines, inventoryItems]);

  function openCreate() {
    setEditing(null);
    setProductType("regular");
    setRecipeLines([]);
    setError(null);
    setOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setProductType(product.product_type);
    const recipe = recipeByProduct.get(product.id);
    setRecipeLines(
      (recipe?.recipe_items ?? []).map((item) => ({
        inventoryItemId: item.inventory_item_id,
        quantity: String(item.quantity),
      }))
    );
    setError(null);
    setOpen(true);
  }

  function onSaveProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const rawCategory = String(f.get("categoryId") || "none");
    const categoryId = rawCategory === "none" || !rawCategory ? null : rawCategory;
    const payload = {
      id: editing?.id,
      name: String(f.get("name") || ""),
      categoryId,
      description: String(f.get("description") || "") || null,
      productType,
      costPrice: productType === "prepared" ? bomCost : Number(f.get("costPrice") || 0),
      salePrice: Number(f.get("salePrice") || 0),
      unit: String(f.get("unit") || "phần"),
      isActive: true,
      recipe:
        productType === "prepared"
          ? recipeLines
              .filter((line) => line.inventoryItemId)
              .map((line) => {
                const item = inventoryItems.find((inv) => inv.id === line.inventoryItemId);
                return {
                  inventoryItemId: line.inventoryItemId,
                  quantity: Number(line.quantity || 0),
                  unit: item?.unit ?? "g",
                  estimatedCost: 0,
                };
              })
          : undefined,
    };
    if (productType === "prepared" && (!payload.recipe || payload.recipe.length === 0)) {
      setError("Món chế biến cần ít nhất 1 dòng công thức.");
      notifyError("Lưu món thất bại", "Món chế biến cần ít nhất 1 dòng công thức.");
      return;
    }
    startTransition(async () => {
      const res = editing
        ? await updateProduct(organizationId, payload)
        : await createProduct(organizationId, payload);
      if (!res.ok) {
        setError(res.error.message);
        notifyError("Lưu món thất bại", res.error.message);
        return;
      }
      setOpen(false);
      setEditing(null);
      router.refresh();
      notifySuccess(editing ? "Đã cập nhật món" : "Đã thêm món");
    });
  }

  function onCreateIngredient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createIngredientFromMenu(organizationId, branchId, {
        name: String(f.get("name") || ""),
        unit: String(f.get("unit") || ""),
        costPrice: Number(f.get("costPrice") || 0),
        initialQuantity: Number(f.get("initialQuantity") || 0),
        lowStockThreshold: 0,
        canBeIngredient: true,
        canBeSold: false,
      });
      if (!res.ok) {
        notifyError("Không tạo được nguyên liệu", res.error.message);
        return;
      }
      setIngredientOpen(false);
      setRecipeLines((rows) => [...rows, { inventoryItemId: res.data.id, quantity: "1" }]);
      router.refresh();
      notifySuccess("Đã thêm nguyên liệu");
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

  const activeGroup = categories.find((c) => c.id === activeGroupId) ?? categories[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <form
          className="flex w-full max-w-sm items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Tìm theo tên món" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            <>
              <Button variant="outline" onClick={() => { setActiveGroupId(categories[0]?.id ?? ""); setGroupsOpen(true); }}>
                <Filter className="h-4 w-4" /> Nhóm món
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <FileUp className="h-4 w-4" /> Import Excel
              </Button>
            </>
          ) : null}
          <ExcelDownloadButton action={() => exportMenu(organizationId, query || undefined)} label="Xuất Excel" />
          {canManage ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Thêm món
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant={categoryFilter === "all" ? "default" : "outline"} onClick={() => setCategoryFilter("all")}>
          Tất cả
        </Button>
        <Button size="sm" variant={categoryFilter === "uncat" ? "default" : "outline"} onClick={() => setCategoryFilter("uncat")}>
          Chưa gán
        </Button>
        {categories.map((category) => (
          <Button
            key={category.id}
            size="sm"
            variant={categoryFilter === category.id ? "default" : "outline"}
            onClick={() => setCategoryFilter(category.id)}
          >
            {category.name}
          </Button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Sửa món" : "Thêm món mới"}</DialogTitle>
            <DialogDescription>
              Món chế biến: giá vốn = tổng định lượng × đơn giá nguyên liệu trên 1 đơn vị món.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSaveProduct}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Tên món</Label>
                <Input id="name" name="name" required defaultValue={editing?.name ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit">Đơn vị</Label>
                <Input id="unit" name="unit" defaultValue={editing?.unit ?? "phần"} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nhóm món</Label>
                <Select name="categoryId" defaultValue={editing?.category_id ?? "none"}>
                  <SelectTrigger><SelectValue placeholder="Chưa gán" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Chưa gán</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({MENU_TYPE_LABEL[c.menu_type]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cách bán</Label>
                <Select
                  value={productType}
                  onValueChange={(value) => {
                    const next = value as "regular" | "prepared";
                    setProductType(next);
                    if (next === "prepared" && recipeLines.length === 0) {
                      setRecipeLines([{ inventoryItemId: ingredients[0]?.id ?? "", quantity: "1" }]);
                    }
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">Bán liền</SelectItem>
                    <SelectItem value="prepared">Món chế biến</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {productType === "prepared" ? (
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Label>Công thức (trên 1 đơn vị món)</Label>
                  <div className="flex gap-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => setIngredientOpen(true)}>
                      Nguyên liệu mới
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRecipeLines((rows) => [...rows, { inventoryItemId: ingredients[0]?.id ?? "", quantity: "1" }])}
                    >
                      <Plus className="h-4 w-4" /> Thêm dòng
                    </Button>
                  </div>
                </div>
                {ingredients.length === 0 ? (
                  <p className="text-sm text-destructive">Chưa có nguyên liệu. Bấm Nguyên liệu mới để tạo ngay.</p>
                ) : (
                  recipeLines.map((line, index) => (
                    <div key={`${line.inventoryItemId}-${index}`} className="grid grid-cols-[1fr_88px_auto] gap-2">
                      <Select
                        value={line.inventoryItemId}
                        onValueChange={(value) => setRecipeLines((rows) => rows.map((row, i) => (i === index ? { ...row, inventoryItemId: value } : row)))}
                      >
                        <SelectTrigger><SelectValue placeholder="Nguyên liệu" /></SelectTrigger>
                        <SelectContent>
                          {ingredients.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name} ({item.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={line.quantity}
                        onChange={(event) => setRecipeLines((rows) => rows.map((row, i) => (i === index ? { ...row, quantity: event.target.value } : row)))}
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => setRecipeLines((rows) => rows.filter((_, i) => i !== index))} aria-label="Xoá dòng">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
                <p className="text-sm">Giá vốn: <span className="font-medium">{formatVND(bomCost)}</span></p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="costPrice">Giá vốn (đ)</Label>
                <NumberInput id="costPrice" name="costPrice" defaultValue={editing?.cost_price ?? 0} required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="salePrice">Giá bán (đ)</Label>
              <NumberInput id="salePrice" name="salePrice" defaultValue={editing?.sale_price ?? 0} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Mô tả</Label>
              <Textarea id="description" name="description" rows={2} defaultValue={editing?.description ?? ""} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Huỷ</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : "Lưu món"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={ingredientOpen} onOpenChange={setIngredientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm nguyên liệu</DialogTitle>
            <DialogDescription>Tên phải unique trong cửa hàng. Không cần mã.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onCreateIngredient}>
            <div className="space-y-1.5">
              <Label htmlFor="ingName">Tên</Label>
              <Input id="ingName" name="name" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ingUnit">Đơn vị</Label>
                <Input id="ingUnit" name="unit" required placeholder="g, ml, kg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ingCost">Giá vốn / đơn vị</Label>
                <NumberInput id="ingCost" name="costPrice" defaultValue={0} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ingQty">Tồn đầu (tuỳ chọn)</Label>
              <NumberInput id="ingQty" name="initialQuantity" defaultValue={0} decimals={1} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIngredientOpen(false)}>Huỷ</Button>
              <Button type="submit" disabled={isPending}>Lưu nguyên liệu</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={groupsOpen} onOpenChange={setGroupsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nhóm món (filter)</DialogTitle>
            <DialogDescription>Đổi tên, thêm nhóm, gán hoặc gỡ món. Loại đồ ăn / nước / dịch vụ gắn trên nhóm.</DialogDescription>
          </DialogHeader>
          <GroupEditor
            organizationId={organizationId}
            categories={categories}
            products={products}
            activeGroup={activeGroup}
            onSelectGroup={setActiveGroupId}
            pending={isPending}
            startTransition={startTransition}
            onDone={() => router.refresh()}
          />
        </DialogContent>
      </Dialog>

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
          <CardTitle className="text-sm">Danh sách món ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState title="Chưa có món nào" description="Tạo món hoặc đổi filter nhóm." />
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>Tên món</TableHead>
                  <TableHead>Nhóm</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead className="text-right">Giá vốn</TableHead>
                  <TableHead className="text-right">Giá bán</TableHead>
                  <TableHead className="text-center">Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const group = p.category_id ? categoryMap.get(p.category_id) : null;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <button type="button" className="text-left hover:underline" onClick={() => canManage && openEdit(p)}>
                          {p.name}
                        </button>
                        {p.product_type === "prepared" && recipeByProduct.get(p.id)?.recipe_items?.length ? (
                          <p className="text-xs text-muted-foreground">
                            {(recipeByProduct.get(p.id)?.recipe_items ?? [])
                              .map((item) => {
                                const inv = inventoryItems.find((i) => i.id === item.inventory_item_id);
                                return `${inv?.name ?? "NL"} ${item.quantity}${item.unit}`;
                              })
                              .join(", ")}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{group?.name ?? "Chưa gán"}</TableCell>
                      <TableCell className="text-xs">
                        <div>{group ? MENU_TYPE_LABEL[group.menu_type] : MENU_TYPE_LABEL[p.menu_type]}</div>
                        <div className="text-muted-foreground">{PRODUCT_TYPE_LABEL[p.product_type]}</div>
                      </TableCell>
                      <TableCell className="text-right">{formatVND(p.cost_price)}</TableCell>
                      <TableCell className="text-right font-medium">{formatVND(p.sale_price)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canManage ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(p)} aria-label="Sửa món">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setRecipeProduct(p)}
                              >
                                <ChefHat className="h-3.5 w-3.5" /> Công thức
                              </Button>
                              <button
                                type="button"
                                title={p.is_active ? "Bấm để ngừng bán" : "Bấm để bật bán"}
                                onClick={() => onToggleActive(p.id, p.is_active)}
                              >
                                <Badge variant={p.is_active ? "success" : "outline"}>{p.is_active ? "Đang bán" : "Ngừng bán"}</Badge>
                              </button>
                            </>
                          ) : (
                            <Badge variant={p.is_active ? "success" : "outline"}>{p.is_active ? "Đang bán" : "Ngừng bán"}</Badge>
                          )}
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
      {recipeProduct ? (
        <RecipeDialog
          open={recipeProduct !== null}
          onOpenChange={(o) => { if (!o) setRecipeProduct(null); }}
          product={recipeProduct}
          inventoryItems={inventoryItems}
          organizationId={organizationId}
        />
      ) : null}
    </div>
  );
}

function GroupEditor({
  organizationId,
  categories,
  products,
  activeGroup,
  onSelectGroup,
  pending,
  startTransition,
  onDone,
}: {
  organizationId: string;
  categories: MenuCategory[];
  products: Product[];
  activeGroup: MenuCategory | null;
  onSelectGroup: (id: string) => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(activeGroup?.name ?? "");
  const [menuType, setMenuType] = useState<MenuType>(activeGroup?.menu_type ?? "food");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<MenuType>("food");
  const [addProductId, setAddProductId] = useState("");

  const members = products.filter((p) => p.category_id === activeGroup?.id);
  const outsiders = products.filter((p) => p.category_id !== activeGroup?.id);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {categories.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={c.id === activeGroup?.id ? "default" : "outline"}
            onClick={() => {
              onSelectGroup(c.id);
              setName(c.name);
              setMenuType(c.menu_type);
            }}
          >
            {c.name}
          </Button>
        ))}
      </div>
      {activeGroup ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Select value={menuType} onValueChange={(v) => setMenuType(v as MenuType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="food">Đồ ăn</SelectItem>
                <SelectItem value="drink">Đồ uống</SelectItem>
                <SelectItem value="service">Dịch vụ</SelectItem>
                <SelectItem value="other">Khác</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await updateCategory(organizationId, activeGroup.id, { name, menuType, sortOrder: activeGroup.sort_order });
                  if (!res.ok) notifyError("Không sửa được nhóm", res.error.message);
                  else { notifySuccess("Đã lưu nhóm"); onDone(); }
                })
              }
            >
              Lưu tên / loại
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await deleteCategory(organizationId, activeGroup.id);
                  if (!res.ok) notifyError("Không xóa được nhóm", res.error.message);
                  else { notifySuccess("Đã xóa nhóm, món về Chưa gán"); onDone(); }
                })
              }
            >
              Xóa nhóm
            </Button>
          </div>
          <p className="text-sm font-medium">Món trong nhóm</p>
          {members.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có món.</p> : members.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span>{p.name}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  startTransition(async () => {
                    const res = await setProductCategory(organizationId, p.id, null);
                    if (!res.ok) notifyError("Không gỡ được", res.error.message);
                    else onDone();
                  })
                }
              >
                Gỡ
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Select value={addProductId} onValueChange={setAddProductId}>
              <SelectTrigger><SelectValue placeholder="Thêm món vào nhóm" /></SelectTrigger>
              <SelectContent>
                {outsiders.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!addProductId || pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await setProductCategory(organizationId, addProductId, activeGroup.id);
                  if (!res.ok) notifyError("Không gán được", res.error.message);
                  else { setAddProductId(""); notifySuccess("Đã thêm vào nhóm"); onDone(); }
                })
              }
            >
              Thêm
            </Button>
          </div>
        </>
      ) : null}
      <div className="border-t pt-3 space-y-2">
        <p className="text-sm font-medium">Nhóm mới</p>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Tên nhóm" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Select value={newType} onValueChange={(v) => setNewType(v as MenuType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="food">Đồ ăn</SelectItem>
              <SelectItem value="drink">Đồ uống</SelectItem>
              <SelectItem value="service">Dịch vụ</SelectItem>
              <SelectItem value="other">Khác</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          disabled={!newName.trim() || pending}
          onClick={() =>
            startTransition(async () => {
              const res = await createCategory(organizationId, { name: newName.trim(), menuType: newType, sortOrder: categories.length });
              if (!res.ok) notifyError("Không tạo nhóm", res.error.message);
              else { setNewName(""); notifySuccess("Đã thêm nhóm"); onDone(); }
            })
          }
        >
          Thêm nhóm
        </Button>
      </div>
    </div>
  );
}
