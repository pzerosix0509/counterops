// Order calculation helpers. All currency is integer VND.

export interface OrderItemInput {
  productId: string | null;
  productName: string;
  unitPrice: number;
  costPrice: number;
  quantity: number;
}

export interface OrderTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  serviceFeeAmount: number;
  totalAmount: number;
}

export interface PaymentLine {
  method: "cash" | "bank_transfer" | "card" | "ewallet" | "debt" | "other";
  amount: number;
  transactionRef?: string | null;
}

export function calculateSubtotal(items: OrderItemInput[]): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

export function calculateTotals(
  items: OrderItemInput[],
  discountAmount: number,
  taxAmount: number,
  serviceFeeAmount: number
): OrderTotals {
  const subtotal = calculateSubtotal(items);
  const totalAmount = Math.max(0, subtotal - discountAmount + taxAmount + serviceFeeAmount);
  return { subtotal, discountAmount, taxAmount, serviceFeeAmount, totalAmount };
}

export function totalPaidAmount(payments: PaymentLine[]): number {
  return payments.reduce((s, p) => s + p.amount, 0);
}

export function classifyPaymentStatus(total: number, paid: number): "paid" | "partially_paid" | "open" {
  if (paid <= 0) return "open";
  if (paid >= total) return "paid";
  return "partially_paid";
}

export function newOrderNumber(seq: number, date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `DH-${y}${m}${d}-${String(seq).padStart(4, "0")}`;
}
