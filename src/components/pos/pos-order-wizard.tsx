"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CreditCard, Minus, Plus, Receipt, UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/states";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PosCheckoutStep } from "@/components/pos/pos-checkout-step";
import { PosMenuDialog, addProductToCart } from "@/components/pos/pos-menu-dialog";
import { createOrUpdateOrder, payOrder } from "@/server/actions/orders";
import { calculateDiscountAmount, calculatePercentageAmount } from "@/lib/calculations/orders";
import { formatVND } from "@/lib/date/ranges";
import { STEP_LABELS } from "@/lib/pos/table-status";
import { stepIndex, maxStepReached, type PosSessionData, type PosStep } from "@/lib/pos/session";
import { cn } from "@/lib/utils/format";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import type { PosProduct } from "@/lib/pos/product";
import type { OperationalSettings } from "@/lib/settings/operational";
import type { PosTableOrderSummary } from "@/server/queries/orders";
import type { Area, DiningTable, MenuCategory, SalesChannel } from "@/types/database";

const OPEN_ORDER_STATUSES = new Set(["draft", "open", "sent_to_kitchen", "partially_paid"]);

function numberInputValue(value: string): number {
  return Number(value) || 0;
}

interface Props {
  organizationId: string;
  branchId: string;
  canCreate: boolean;
  canPay: boolean;
  session: PosSessionData;
  steps: PosStep[];
  products: PosProduct[];
  categories: MenuCategory[];
  areas: Area[];
  tables: DiningTable[];
  channels: SalesChannel[];
  settings: OperationalSettings;
  activeOrders: PosTableOrderSummary[];
  onSessionChange: (patch: Partial<PosSessionData>) => void;
  onOrderId: (orderId: string) => void;
  onResumeOpenOrder: (orderId: string) => void;
  onBack: () => void;
  onGoNext: () => void;
  onGoBackStep: () => boolean;
  onComplete: () => void;
}

export function PosOrderWizard(props: Props) {
  const router = useRouter();
  const {
    organizationId,
    branchId,
    canCreate,
    canPay,
    session,
    steps,
    products,
    categories,
    areas,
    tables,
    channels,
    settings,
    activeOrders,
    onSessionChange,
    onOrderId,
    onResumeOpenOrder,
    onBack,
    onGoNext,
    onGoBackStep,
    onComplete,
  } = props;

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [noteItemIdx, setNoteItemIdx] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [paymentLines, setPaymentLines] = useState<{ method: "cash" | "bank_transfer" | "card" | "ewallet" | "debt" | "other"; amount: number }[]>([
    { method: settings.defaultPaymentMethod, amount: 0 },
  ]);

  const orderIdRef = useRef<string | null>(session.orderId);
  const persistLockRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    orderIdRef.current = session.orderId;
  }, [session.orderId]);

  function findOpenOrderForTable(tableId: string | null) {
    if (!tableId) return undefined;
    return activeOrders.find((order) => order.tableId === tableId && OPEN_ORDER_STATUSES.has(order.status));
  }

  function selectTable(tableId: string) {
    const openOrder = findOpenOrderForTable(tableId);
    if (openOrder) {
      onResumeOpenOrder(openOrder.orderId);
      return;
    }
    onSessionChange({
      tableId,
      step: "items",
      maxStep: maxStepReached(steps, session.maxStep, "items"),
    });
  }

  const normalizeChannelName = (name: string) =>
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "d")
      .toLowerCase()
      .trim();
  const isDineInChannel = (channel: SalesChannel) => normalizeChannelName(channel.name) === "tai quan";
  const isTakeawayChannel = (channel: SalesChannel) => normalizeChannelName(channel.name) === "mang di";
  const findChannelForOrderType = (type: "dine_in" | "takeaway") => {
    if (type === "dine_in") return channels.find(isDineInChannel)?.id ?? null;
    return channels.find(isTakeawayChannel)?.id ?? null;
  };

  const subtotal = session.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discountAmount = calculateDiscountAmount(subtotal, numberInputValue(session.discount));
  const taxAmount = calculatePercentageAmount(subtotal, numberInputValue(session.tax));
  const serviceFeeAmount = numberInputValue(session.serviceFee);
  const total = Math.max(0, subtotal - discountAmount + taxAmount + serviceFeeAmount);

  const tablesByArea = useMemo(() => {
    const map = new Map<string | null, DiningTable[]>();
    for (const table of tables) {
      const list = map.get(table.area_id ?? null) ?? [];
      list.push(table);
      map.set(table.area_id ?? null, list);
    }
    return map;
  }, [tables]);

  const tableGroups = useMemo(() => areas.map((area) => ({ area, tables: tablesByArea.get(area.id) ?? [] })), [areas, tablesByArea]);

  const takeawayChannels = useMemo(
    () => channels.filter((c) => c.type === "takeaway" || c.name.toLowerCase().includes("grab")),
    [channels]
  );

  function changeQty(idx: number, delta: number) {
    const next = [...session.cart];
    const item = { ...next[idx], quantity: next[idx].quantity + delta };
    if (item.quantity <= 0) {
      onSessionChange({ cart: next.filter((_, i) => i !== idx) });
      return;
    }
    next[idx] = item;
    onSessionChange({ cart: next });
  }

  function removeItem(idx: number) {
    onSessionChange({ cart: session.cart.filter((_, i) => i !== idx) });
  }

  function openNote(idx: number) {
    setNoteItemIdx(idx);
    setNoteText(session.cart[idx].note);
  }

  function saveNote() {
    if (noteItemIdx === null) return;
    const next = [...session.cart];
    next[noteItemIdx] = { ...next[noteItemIdx], note: noteText };
    onSessionChange({ cart: next });
    setNoteItemIdx(null);
  }

  function buildOrderPayload() {
    const salesChannelId =
      session.orderType === "takeaway" && session.channelId
        ? session.channelId
        : findChannelForOrderType(session.orderType);
    return {
      branchId,
      tableId: session.orderType === "dine_in" ? session.tableId : null,
      salesChannelId,
      orderType: session.orderType,
      customerName: session.customerName.trim() || null,
      customerPhone: session.customerPhone.trim() || null,
      items: session.cart.map((item) => ({ productId: item.productId, quantity: item.quantity, note: item.note || null })),
      discountAmount,
      taxAmount,
      serviceFeeAmount,
    };
  }

  async function persistOrder(options: { quiet?: boolean } = {}): Promise<string | null> {
    if (!canCreate) {
      notifyError("Không có quyền", "Tài khoản không có quyền tạo hoặc cập nhật đơn.");
      return null;
    }
    if (session.cart.length === 0) {
      notifyError("Giỏ hàng trống", "Vui lòng thêm ít nhất 1 món.");
      return null;
    }
    if (session.orderType === "dine_in" && !session.tableId) {
      notifyError("Chưa chọn bàn", "Vui lòng chọn bàn cho đơn tại quán.");
      return null;
    }
    if (persistLockRef.current) return persistLockRef.current;

    const run = async (): Promise<string | null> => {
      setError(null);
      let orderId = orderIdRef.current;
      let result = await createOrUpdateOrder(organizationId, branchId, buildOrderPayload(), orderId);

      if (!result.ok && result.error.code === "TABLE_OCCUPIED" && session.tableId) {
        const existing = findOpenOrderForTable(session.tableId);
        if (existing) {
          orderId = existing.orderId;
          orderIdRef.current = existing.orderId;
          onOrderId(existing.orderId);
          result = await createOrUpdateOrder(organizationId, branchId, buildOrderPayload(), orderId);
        }
      }

      if (!result.ok) {
        setError(result.error.message);
        notifyError("Không thể lưu đơn", result.error.message);
        return null;
      }
      orderIdRef.current = result.data.orderId;
      onOrderId(result.data.orderId);
      router.refresh();
      if (!options.quiet) notifySuccess("Đã lưu đơn");
      return result.data.orderId;
    };

    persistLockRef.current = run().finally(() => {
      persistLockRef.current = null;
    });
    return persistLockRef.current;
  }

  function validateStep(step: PosStep): boolean {
    if (step === "service" && session.orderType === "takeaway" && !session.channelId) {
      setError("Vui lòng chọn kênh bán mang đi.");
      return false;
    }
    if (step === "table" && session.orderType === "dine_in" && !session.tableId) {
      setError("Vui lòng chọn bàn.");
      return false;
    }
    if (step === "items" && session.cart.length === 0) {
      setError("Vui lòng thêm ít nhất 1 món.");
      return false;
    }
    setError(null);
    return true;
  }

  async function autoSaveOrder() {
    if (session.cart.length === 0) return;
    await persistOrder({ quiet: true });
  }

  useEffect(() => {
    if (session.cart.length === 0) return;
    const timer = window.setTimeout(() => {
      void autoSaveOrder();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    session.cart,
    session.customerPhone,
    session.customerName,
    session.discount,
    session.tax,
    session.serviceFee,
    session.tableId,
    session.orderType,
    session.orderId,
  ]);

  function handleNext() {
    if (!validateStep(session.step)) return;
    if (session.step === "checkout") {
      startTransition(async () => {
        const orderId = await persistOrder({ quiet: true });
        if (!orderId) return;
        setPaymentLines([{ method: settings.defaultPaymentMethod, amount: total }]);
        onSessionChange({ step: "payment", maxStep: "payment" });
        setPayOpen(true);
      });
      return;
    }
    if (session.step === "payment") {
      setPaymentLines([{ method: settings.defaultPaymentMethod, amount: total }]);
      setPayOpen(true);
      return;
    }
    startTransition(async () => {
      if (session.cart.length > 0) await autoSaveOrder();
      onGoNext();
    });
  }

  function submitPay() {
    setError(null);
    startTransition(async () => {
      const orderId = session.orderId ?? (await persistOrder({ quiet: true }));
      if (!orderId) return;

      const result = await payOrder(organizationId, {
        orderId,
        payments: paymentLines.filter((p) => p.amount > 0).map((p) => ({ method: p.method, amount: p.amount })),
      });
      if (!result.ok) {
        setError(result.error.message);
        notifyError("Thanh toán thất bại", result.error.message);
        return;
      }
      setPayOpen(false);
      notifySuccess("Thanh toán thành công");
      router.refresh();
      onComplete();
    });
  }

  const currentIdx = stepIndex(steps, session.step);
  const stepTitle =
    session.step === "service" && session.orderType === "takeaway"
      ? "Kênh bán mang đi"
      : STEP_LABELS[session.step];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Về sơ đồ bàn
        </Button>
        <Button variant="outline" size="sm" onClick={() => (onGoBackStep() ? null : onBack())}>
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {steps.map((step, idx) => (
          <div
            key={step}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              idx === currentIdx ? "bg-primary text-primary-foreground" : idx < currentIdx ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            )}
          >
            {idx + 1}. {step === "service" && session.orderType === "takeaway" ? "Kênh bán mang đi" : STEP_LABELS[step]}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{stepTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {session.step === "service" && session.orderType === "takeaway" ? (
            <div className="space-y-1">
              <Select
                value={session.channelId ?? ""}
                onValueChange={(val) => onSessionChange({ channelId: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn kênh (Grab, ShopeeFood...)" />
                </SelectTrigger>
                <SelectContent>
                  {takeawayChannels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {takeawayChannels.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Chưa có kênh mang đi. Hãy cấu hình Grab (Mock) trong cài đặt kênh bán.
                </p>
              ) : null}
            </div>
          ) : null}

          {session.step === "table" ? (
            <div className="space-y-3">
              {tableGroups.map((group) => (
                <div key={group.area.id} className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{group.area.name}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {group.tables.map((table) => (
                      <button
                        key={table.id}
                        type="button"
                        onClick={() => selectTable(table.id)}
                        disabled={table.status === "disabled"}
                        className={cn(
                          "rounded-md border p-2 text-left text-xs",
                          session.tableId === table.id ? "border-primary bg-primary/10" : "hover:bg-muted",
                          table.status === "disabled" && "opacity-50"
                        )}
                      >
                        <div className="font-medium">{table.name}</div>
                        <div className="text-[10px] text-muted-foreground">{table.seats} ghế</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {session.step === "items" ? (
            <div className="flex flex-col gap-3">
              <Button className="shrink-0" onClick={() => setMenuOpen(true)}>
                <UtensilsCrossed className="h-4 w-4" />
                Thực đơn
              </Button>
              {session.cart.length === 0 ? (
                <EmptyState title="Chưa có món nào" description="Bấm Thực đơn để thêm món." />
              ) : (
                <div className="max-h-[min(50vh,24rem)] overflow-y-auto rounded-md border bg-muted/20">
                  <ul className="divide-y">
                    {session.cart.map((item, idx) => (
                      <li key={item.productId + idx} className="space-y-1 px-3 py-2 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-medium">{item.productName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatVND(item.unitPrice)} x {item.quantity}
                            </p>
                            {item.note ? <p className="text-xs italic text-muted-foreground">Ghi chú: {item.note}</p> : null}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => changeQty(idx, -1)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center">{item.quantity}</span>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => changeQty(idx, 1)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeItem(idx)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => openNote(idx)}>
                          {item.note ? "Sửa ghi chú" : "Thêm ghi chú"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex shrink-0 justify-between border-t pt-2 text-sm font-semibold">
                <span>Tạm tính</span>
                <span>{formatVND(subtotal)}</span>
              </div>
            </div>
          ) : null}

          {session.step === "checkout" ? (
            <PosCheckoutStep
              customerPhone={session.customerPhone}
              customerName={session.customerName}
              discount={session.discount}
              tax={session.tax}
              serviceFee={session.serviceFee}
              settings={settings}
              onCustomerPhoneChange={(v) => onSessionChange({ customerPhone: v })}
              onCustomerNameChange={(v) => onSessionChange({ customerName: v })}
              onDiscountChange={(v) => onSessionChange({ discount: v })}
              onTaxChange={(v) => onSessionChange({ tax: v })}
              onServiceFeeChange={(v) => onSessionChange({ serviceFee: v })}
            />
          ) : null}

          {session.step === "payment" ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Tổng cộng</span>
                <span className="font-semibold">{formatVND(total)}</span>
              </div>
              <Button onClick={() => { setPaymentLines([{ method: settings.defaultPaymentMethod, amount: total }]); setPayOpen(true); }} disabled={!canPay}>
                <CreditCard className="h-4 w-4" />
                Mở thanh toán
              </Button>
            </div>
          ) : null}

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          {session.step !== "payment" ? (
            <Button className="w-full" onClick={handleNext} disabled={isPending}>
              Tiếp theo
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <PosMenuDialog
        open={menuOpen}
        onOpenChange={setMenuOpen}
        products={products}
        categories={categories}
        onAddProduct={(product, options) => onSessionChange({ cart: addProductToCart(session.cart, product, options) })}
      />

      <Dialog open={noteItemIdx !== null} onOpenChange={(open) => !open && setNoteItemIdx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ghi chú món</DialogTitle>
          </DialogHeader>
          <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteItemIdx(null)}>Hủy</Button>
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
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Tiền mặt</SelectItem>
                    <SelectItem value="bank_transfer">Chuyển khoản</SelectItem>
                    <SelectItem value="card">Thẻ</SelectItem>
                    <SelectItem value="ewallet">Ví điện tử</SelectItem>
                    <SelectItem value="debt">Ghi nợ</SelectItem>
                    <SelectItem value="other">Khác</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  value={payment.amount}
                  onChange={(e) =>
                    setPaymentLines((current) => current.map((item, i) => (i === idx ? { ...item, amount: Math.max(0, Number(e.target.value) || 0) } : item)))
                  }
                />
                <Button type="button" variant="ghost" onClick={() => setPaymentLines((current) => current.filter((_, i) => i !== idx))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setPaymentLines((current) => [...current, { method: settings.defaultPaymentMethod, amount: 0 }])}>
              <Plus className="h-3.5 w-3.5" /> Thêm hình thức
            </Button>
          </div>
          {paymentLines.some((p) => p.method === "bank_transfer") && settings.bankCode && settings.bankAccountNumber ? (
            <div className="flex flex-col items-center gap-2 rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Quét mã QR để chuyển khoản</p>
              <img
                src={`https://img.vietqr.io/image/${settings.bankCode}-${settings.bankAccountNumber}-compact2.png?amount=${paymentLines.find((p) => p.method === "bank_transfer")?.amount ?? total}&addInfo=DH${""}`}
                alt="QR chuyển khoản"
                className="h-48 w-48 rounded-md"
              />
            </div>
          ) : null}
          <div className="flex items-center justify-between rounded-md bg-muted/40 p-2 text-sm">
            <span>Đã nhập</span>
            <span className="font-semibold">{formatVND(paymentLines.reduce((sum, p) => sum + p.amount, 0))}</span>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(false)}>Hủy</Button>
            <Button onClick={submitPay} disabled={isPending || !canPay}>
              <Receipt className="h-4 w-4" /> Xác nhận thanh toán
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
