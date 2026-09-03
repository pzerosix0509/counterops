"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Search, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/states";
import { Input, Textarea } from "@/components/ui/input";
import { formatVND } from "@/lib/date/ranges";
import { cn } from "@/lib/utils/format";
import type { PosProduct } from "@/lib/pos/product";
import { formatStockBadge, formatStockLabel } from "@/lib/pos/stock";
import type { PosCartItem } from "@/lib/pos/session";
import type { MenuCategory } from "@/types/database";

export interface MenuAddOptions {
  quantity: number;
  note: string;
}

export function PosMenuDialog({
  open,
  onOpenChange,
  products,
  categories,
  onAddProduct,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: PosProduct[];
  categories: MenuCategory[];
  onAddProduct: (product: PosProduct, options: MenuAddOptions) => void;
}) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PosProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setQuantity(1);
      setNote("");
      setNoteOpen(false);
    }
  }, [open]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (activeCategory === "uncat") return !p.category_id;
      if (activeCategory !== "all" && p.category_id !== activeCategory) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [products, activeCategory, search]);

  function selectProduct(product: PosProduct) {
    if (!product.available) return;
    setSelected(product);
    setQuantity(1);
    setNote("");
    setNoteOpen(false);
  }

  const selectedShortage =
    selected && selected.remainingQty !== null && quantity > selected.remainingQty
      ? formatStockLabel(selected.name, selected, quantity)
      : null;

  function confirmAdd() {
    if (!selected || quantity < 1) return;
    if (selected.remainingQty !== null && quantity > selected.remainingQty) return;
    onAddProduct(selected, { quantity, note: note.trim() });
    setSelected(null);
    setQuantity(1);
    setNote("");
    setNoteOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-3 overflow-hidden p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle>Thực đơn</DialogTitle>
        </DialogHeader>
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-xs"
            placeholder="Tìm món"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <Button size="sm" variant={activeCategory === "all" ? "default" : "outline"} onClick={() => setActiveCategory("all")}>
            Tất cả
          </Button>
          <Button size="sm" variant={activeCategory === "uncat" ? "default" : "outline"} onClick={() => setActiveCategory("uncat")}>
            Chưa gán
          </Button>
          {categories.map((category) => (
            <Button
              key={category.id}
              size="sm"
              variant={activeCategory === category.id ? "default" : "outline"}
              onClick={() => setActiveCategory(category.id)}
            >
              {category.name}
            </Button>
          ))}
        </div>

        {selected ? (
          <div className="shrink-0 space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{selected.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.product_type === "prepared" ? "Chế biến" : "Thường"} · {formatVND(selected.sale_price)}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
                Đóng
              </Button>
            </div>
            {selectedShortage ? (
              <p className="text-xs font-medium text-rose-600">{selectedShortage}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Số lượng</span>
                <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="w-8 text-center text-sm font-medium">{quantity}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => setQuantity((q) => q + 1)}
                  disabled={selected.remainingQty !== null && quantity >= selected.remainingQty}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                {selected.remainingQty !== null ? (
                  <span className="text-xs text-muted-foreground">/ còn {selected.remainingQty}</span>
                ) : null}
              </div>
              <Button type="button" variant={noteOpen || note ? "default" : "outline"} size="sm" onClick={() => setNoteOpen((v) => !v)}>
                <StickyNote className="h-3.5 w-3.5" />
                Ghi chú bếp
              </Button>
              <Button type="button" size="sm" onClick={confirmAdd} disabled={Boolean(selectedShortage)}>
                Thêm vào đơn
              </Button>
            </div>
            {noteOpen ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Ghi chú cho bếp (vd: ít đá, không hành)</p>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nhập ghi chú..." />
              </div>
            ) : note ? (
              <p className="text-xs italic text-muted-foreground">Ghi chú: {note}</p>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/10 p-2">
          {filteredProducts.length === 0 ? (
            <EmptyState title="Không có món phù hợp" description="Thử đổi nhóm hoặc từ khóa khác." />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filteredProducts.map((product) => {
                const isSelected = selected?.id === product.id;
                const outOfStock = !product.available;
                const stockBadge = formatStockBadge(product);
                const stockLabel = outOfStock ? formatStockLabel(product.name, product) : null;
                const lowStock =
                  product.available && product.remainingQty !== null && product.remainingQty > 0 && product.remainingQty <= 5;
                return (
                  <div
                    key={product.id}
                    role="button"
                    tabIndex={outOfStock ? -1 : 0}
                    onClick={() => !outOfStock && selectProduct(product)}
                    onKeyDown={(e) => {
                      if (!outOfStock && (e.key === "Enter" || e.key === " ")) selectProduct(product);
                    }}
                    className={cn(
                      "relative rounded-md border p-2 text-left text-sm transition",
                      outOfStock
                        ? "cursor-not-allowed border-rose-200 bg-rose-50/80"
                        : "cursor-pointer bg-card hover:border-primary hover:bg-primary/5",
                      isSelected && !outOfStock && "border-primary ring-2 ring-primary/20"
                    )}
                  >
                    {outOfStock && stockLabel ? (
                      <span className="mb-1.5 block rounded bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-snug text-white">
                        {stockLabel}
                      </span>
                    ) : lowStock && stockBadge ? (
                      <span className="mb-1.5 block rounded bg-amber-100 px-1.5 py-0.5 text-center text-[10px] font-semibold text-amber-800">
                        {stockBadge}
                      </span>
                    ) : null}
                    <div className={cn("line-clamp-2 font-medium leading-tight", outOfStock && "text-muted-foreground line-through decoration-rose-400")}>
                      {product.name}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{product.product_type === "prepared" ? "Chế biến" : "Thường"}</span>
                      <span className={cn("font-semibold", outOfStock ? "text-muted-foreground" : "text-primary")}>
                        {formatVND(product.sale_price)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter className="shrink-0">
          <Button onClick={() => onOpenChange(false)}>Xong</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function addProductToCart(
  cart: PosCartItem[],
  product: PosProduct,
  options: MenuAddOptions = { quantity: 1, note: "" }
): PosCartItem[] {
  const note = options.note.trim();
  const idx = cart.findIndex((item) => item.productId === product.id && item.note === note);
  if (idx >= 0) {
    const next = [...cart];
    next[idx] = { ...next[idx], quantity: next[idx].quantity + options.quantity };
    return next;
  }
  return [
    ...cart,
    {
      productId: product.id,
      productName: product.name,
      unitPrice: product.sale_price,
      quantity: options.quantity,
      note,
      productType: product.product_type,
    },
  ];
}
