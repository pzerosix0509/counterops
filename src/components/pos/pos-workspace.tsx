"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, CreditCard, Minus, Plus, Receipt, Search, ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/states";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createOrUpdateOrder, payOrder } from "@/server/actions/orders";
import { formatVND } from "@/lib/date/ranges";
import { cn } from "@/lib/utils/format";
import type { Area, DiningTable, MenuCategory, Order, Product, SalesChannel } from "@/types/database";

interface CartItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  note: string;
  productType: "regular" | "prepared";
}

interface Props {
  organizationId: string;
  branchId: string;
  canCreate: boolean;
  canPay: boolean;
  products: (Product & { available: boolean })[];
  categories: MenuCategory[];
  areas: Area[];
  tables: DiningTable[];
  openByTable: Record<string, Order>;
  channels: SalesChannel[];
}

interface OrderPayload {
  branchId: string;
  tableId: string | null;
  salesChannelId: string | null;
  orderType: "dine_in" | "takeaway";
  items: { productId: string; quantity: number; note: string | null }[];
  discountAmount: number;
  taxAmount: number;
  serviceFeeAmount: number;
}

export function PosWorkspace(props: Props) {
  const router = useRouter();
  const { organizationId, branchId, products, categories, areas, tables, openByTable, channels, canPay, canCreate } = props;
  const findChannelForOrderType = (type: "dine_in" | "takeaway") => {
    const targetName = type === "dine_in" ? "tại quán" : "mang đi";
    return channels.find((channel) => channel.name.toLowerCase() === targetName)?.id ?? channels[0]?.id ?? null;
  };
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway">("dine_in");
  const [tableId, setTableId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState<string | null>(() => findChannelForOrderType("dine_in"));
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [serviceFee, setServiceFee] = useState(0);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [payOpen, setPayOpen] = useState(false);
  const [noteItemIdx, setNoteItemIdx] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");

  const [paymentLines, setPaymentLines] = useState<{ method: "cash" | "bank_transfer" | "card" | "ewallet" | "debt"; amount: number }[]>([
    { method: "cash", amount: 0 },
  ]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!p.available) return false;
      if (activeCategory !== "all" && p.category_id !== activeCategory) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [products, activeCategory, search]);

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const total = Math.max(0, subtotal - discount + tax + serviceFee);

  const tablesByArea = useMemo(() => {
    const map = new Map<string | null, DiningTable[]>();
    for (const table of tables) {
      const list = map.get(table.area_id ?? null) ?? [];
      list.push(table);
      map.set(table.area_id ?? null, list);
    }
    return map;
  }, [tables]);

  useEffect(() => {
    if (tableId && openByTable[tableId]) {
      const existing = openByTable[tableId];
      setActiveOrderId(existing.id);
      setOrderType("dine_in");
      setDiscount(existing.discount_amount ?? 0);
      setTax(existing.tax_amount ?? 0);
      setServiceFee(existing.service_fee_amount ?? 0);
    } else {
      setActiveOrderId(null);
    }
  }, [tableId, openByTable]);

  function changeOrderType(value: "dine_in" | "takeaway") {
    setOrderType(value);
    setChannelId(findChannelForOrderType(value));
    if (value === "takeaway") setTableId(null);
  }

  function addProduct(product: Product & { available: boolean }) {
    setCart((current) => {
      const idx = current.findIndex((item) => item.productId === product.id);
      if (idx >= 0) {
        const next = [...current];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          unitPrice: product.sale_price,
          quantity: 1,
          note: "",
          productType: product.product_type,
        },
      ];
    });
  }

  function changeQty(idx: number, delta: number) {
    setCart((current) => {
      const next = [...current];
      const item = { ...next[idx], quantity: next[idx].quantity + delta };
      if (item.quantity <= 0) return next.filter((_, i) => i !== idx);
      next[idx] = item;
      return next;
    });
  }

  function removeItem(idx: number) {
    setCart((current) => current.filter((_, i) => i !== idx));
  }

  function openNote(idx: number) {
    setNoteItemIdx(idx);
    setNoteText(cart[idx].note);
  }

  function saveNote() {
    if (noteItemIdx === null) return;
    setCart((current) => {
      const next = [...current];
      next[noteItemIdx] = { ...next[noteItemIdx], note: noteText };
      return next;
    });
    setNoteItemIdx(null);
  }

  function openNewOrder() {
    setCart([]);
    setDiscount(0);
    setTax(0);
    setServiceFee(0);
    setActiveOrderId(null);
    setTableId(null);
    setError(null);
  }

  function buildOrderPayload(): OrderPayload | null {
    if (cart.length === 0) {
      setError("Đơn hàng phải có ít nhất 1 món.");
      return null;
    }
    if (orderType === "dine_in" && !tableId) {
      setError("Vui lòng chọn bàn cho đơn tại quán.");
      return null;
    }

    return {
      branchId,
      tableId: orderType === "dine_in" ? tableId : null,
      salesChannelId: channelId,
      orderType,
      items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity, note: item.note || null })),
      discountAmount: discount,
      taxAmount: tax,
      serviceFeeAmount: serviceFee,
    };
  }

  async function persistOrder(): Promise<string | null> {
    if (!canCreate) {
      setError("Bạn không có quyền tạo hoặc cập nhật đơn.");
      return null;
    }
    const payload = buildOrderPayload();
    if (!payload) return null;

    setError(null);
    const result = await createOrUpdateOrder(organizationId, branchId, payload, activeOrderId);
    if (!result.ok) {
      setError(result.error.message);
      return null;
    }
    setActiveOrderId(result.data.orderId);
    router.refresh();
    return result.data.orderId;
  }

  function saveOrder() {
    startTransition(async () => {
      await persistOrder();
    });
  }

  function openPay() {
    const payload = buildOrderPayload();
    if (!payload) return;
    setError(null);
    setPaymentLines([{ method: "cash", amount: total }]);
    setPayOpen(true);
  }

  function submitPay() {
    setError(null);
    startTransition(async () => {
      const orderId = await persistOrder();
      if (!orderId) return;

      const result = await payOrder(organizationId, {
        orderId,
        payments: paymentLines.filter((payment) => payment.amount > 0).map((payment) => ({ method: payment.method, amount: payment.amount })),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setPayOpen(false);
      openNewOrder();
      router.refresh();
    });
  }

  function sendToKitchen() {
    if (!activeOrderId) {
      saveOrder();
      return;
    }
    router.refresh();
  }

  const tableGroups = useMemo(() => {
    return areas.map((area) => ({ area, tables: tablesByArea.get(area.id) ?? [] }));
  }, [areas, tablesByArea]);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_1fr_320px]">
      <Card className="lg:max-h-[calc(100vh-160px)] lg:overflow-auto">
        <CardHeader>
          <CardTitle className="text-sm">Chọn chế độ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={orderType} onValueChange={(value) => changeOrderType(value as "dine_in" | "takeaway")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dine_in">Tại quán</TabsTrigger>
              <TabsTrigger value="takeaway">Mang đi</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-1">
            <label className="text-xs font-medium">Kênh bán</label>
            <Select value={channelId ?? ""} onValueChange={setChannelId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn kênh" />
              </SelectTrigger>
              <SelectContent>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {orderType === "dine_in" ? (
            <div className="space-y-2">
              <Button size="sm" variant="outline" className="w-full" onClick={openNewOrder}>
                <Plus className="h-3.5 w-3.5" /> Đơn mới
              </Button>
              <div className="space-y-1">
                {tableGroups.map((group) => (
                  <div key={group.area.id} className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{group.area.name}</p>
                    <div className="grid grid-cols-3 gap-1">
                      {group.tables.map((table) => {
                        const isActive = tableId === table.id;
                        const occupied = openByTable[table.id];
                        return (
                          <button
                            key={table.id}
                            onClick={() => setTableId(table.id)}
                            className={cn(
                              "rounded-md border p-1.5 text-left text-xs",
                              isActive ? "border-primary bg-primary/10" : "hover:bg-muted",
                              table.status === "disabled" && "opacity-50"
                            )}
                          >
                            <div className="font-medium">{table.name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {table.status === "available"
                                ? "Trống"
                                : table.status === "occupied"
                                  ? "Có khách"
                                  : table.status === "reserved"
                                    ? "Đã đặt"
                                    : "Khóa"}
                            </div>
                            {occupied ? <div className="text-[10px] text-amber-600">{occupied.order_number}</div> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="lg:max-h-[calc(100vh-160px)] lg:overflow-auto">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">Thực đơn</CardTitle>
            <div className="relative w-48">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-8 pl-7 text-xs" placeholder="Tìm món" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant={activeCategory === "all" ? "default" : "outline"} onClick={() => setActiveCategory("all")}>
              Tất cả
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

          {filteredProducts.length === 0 ? (
            <EmptyState title="Không có món phù hợp" description="Thử đổi nhóm hoặc từ khóa khác." />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addProduct(product)}
                  className="rounded-md border bg-card p-2 text-left text-sm transition hover:border-primary hover:bg-primary/5"
                >
                  <div className="line-clamp-2 font-medium leading-tight">{product.name}</div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{product.product_type === "prepared" ? "Chế biến" : "Thường"}</span>
                    <span className="font-semibold text-primary">{formatVND(product.sale_price)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:flex lg:max-h-[calc(100vh-160px)] lg:flex-col lg:overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm">Đơn hiện tại {activeOrderId ? "- đã lưu" : "- chưa lưu"}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-3 overflow-auto">
          {cart.length === 0 ? (
            <EmptyState title="Chưa có món nào" description="Bấm vào thực đơn để thêm món." />
          ) : (
            <ul className="divide-y">
              {cart.map((item, idx) => (
                <li key={item.productId + idx} className="space-y-1 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-medium leading-tight">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatVND(item.unitPrice)} x {item.quantity}
                      </p>
                      {item.note ? <p className="text-xs italic text-muted-foreground">Ghi chú: {item.note}</p> : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => changeQty(idx, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm">{item.quantity}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => changeQty(idx, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeItem(idx)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <button className="text-primary underline-offset-2 hover:underline" onClick={() => openNote(idx)}>
                      {item.note ? "Sửa ghi chú" : "Thêm ghi chú"}
                    </button>
                    <span className="font-semibold">{formatVND(item.unitPrice * item.quantity)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
        <div className="border-t p-3 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Giảm giá</label>
              <Input type="number" min="0" value={discount} onChange={(event) => setDiscount(Math.max(0, Number(event.target.value) || 0))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Thuế</label>
              <Input type="number" min="0" value={tax} onChange={(event) => setTax(Math.max(0, Number(event.target.value) || 0))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Phí DV</label>
              <Input type="number" min="0" value={serviceFee} onChange={(event) => setServiceFee(Math.max(0, Number(event.target.value) || 0))} />
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Tạm tính</span>
              <span>{formatVND(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-semibold">
              <span>Tổng cộng</span>
              <span>{formatVND(total)}</span>
            </div>
          </div>
          {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
          <div className="mt-3 flex flex-col gap-2">
            <Button onClick={saveOrder} disabled={!canCreate || isPending} className="w-full">
              <ShoppingCart className="h-4 w-4" /> {activeOrderId ? "Cập nhật đơn" : "Lưu đơn"}
            </Button>
            <Button onClick={openPay} disabled={!canPay || isPending || cart.length === 0} variant="default" className="w-full">
              <CreditCard className="h-4 w-4" /> Thanh toán
            </Button>
            <Button onClick={sendToKitchen} disabled={isPending || !activeOrderId} variant="outline" className="w-full">
              <ChefHat className="h-4 w-4" /> Gửi bếp các món chế biến
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={noteItemIdx !== null} onOpenChange={(open) => !open && setNoteItemIdx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ghi chú món</DialogTitle>
            <DialogDescription>Ví dụ: ít đá, không hành, dị ứng đậu phộng...</DialogDescription>
          </DialogHeader>
          <Textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteItemIdx(null)}>
              Hủy
            </Button>
            <Button onClick={saveNote}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thanh toán đơn</DialogTitle>
            <DialogDescription>
              Tổng cộng: <span className="font-semibold">{formatVND(total)}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {paymentLines.map((payment, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_140px_40px] gap-2">
                <Select
                  value={payment.method}
                  onValueChange={(value) =>
                    setPaymentLines((current) => current.map((item, i) => (i === idx ? { ...item, method: value as typeof payment.method } : item)))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Tiền mặt</SelectItem>
                    <SelectItem value="bank_transfer">Chuyển khoản</SelectItem>
                    <SelectItem value="card">Thẻ</SelectItem>
                    <SelectItem value="ewallet">Ví điện tử</SelectItem>
                    <SelectItem value="debt">Ghi nợ</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  value={payment.amount}
                  onChange={(event) =>
                    setPaymentLines((current) =>
                      current.map((item, i) => (i === idx ? { ...item, amount: Math.max(0, Number(event.target.value) || 0) } : item))
                    )
                  }
                />
                <Button type="button" variant="ghost" onClick={() => setPaymentLines((current) => current.filter((_, i) => i !== idx))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setPaymentLines((current) => [...current, { method: "cash", amount: 0 }])}>
              <Plus className="h-3.5 w-3.5" /> Thêm hình thức
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/40 p-2 text-sm">
            <span>Đã nhập</span>
            <span className="font-semibold">{formatVND(paymentLines.reduce((sum, payment) => sum + payment.amount, 0))}</span>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(false)}>
              Hủy
            </Button>
            <Button onClick={submitPay} disabled={isPending}>
              <Receipt className="h-4 w-4" /> Xác nhận thanh toán
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
