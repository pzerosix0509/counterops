export type PosStep = "service" | "table" | "items" | "checkout" | "payment";

export const DINE_IN_STEPS: PosStep[] = ["service", "table", "items", "checkout", "payment"];
export const TAKEAWAY_STEPS: PosStep[] = ["service", "items", "checkout", "payment"];

export interface PosCartItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  note: string;
  productType: "regular" | "prepared";
}

export interface PosSessionData {
  step: PosStep;
  maxStep: PosStep;
  orderId: string | null;
  channelId?: string | null;
  orderType: "dine_in" | "takeaway";
  tableId: string | null;
  cart: PosCartItem[];
  customerName: string;
  customerPhone: string;
  discount: string;
  tax: string;
  serviceFee: string;
}

export function stepsForOrderType(orderType: "dine_in" | "takeaway"): PosStep[] {
  return orderType === "dine_in" ? DINE_IN_STEPS : TAKEAWAY_STEPS;
}

export function stepIndex(steps: PosStep[], step: PosStep): number {
  return steps.indexOf(step);
}

export function nextStep(steps: PosStep[], step: PosStep): PosStep | null {
  const idx = stepIndex(steps, step);
  return idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;
}

export function prevStep(steps: PosStep[], step: PosStep): PosStep | null {
  const idx = stepIndex(steps, step);
  return idx > 0 ? steps[idx - 1] : null;
}

export function maxStepReached(steps: PosStep[], a: PosStep, b: PosStep): PosStep {
  return stepIndex(steps, a) >= stepIndex(steps, b) ? a : b;
}

export function createEmptySession(defaultOrderType: "dine_in" | "takeaway"): PosSessionData {
  return {
    step: "service",
    maxStep: "service",
    orderId: null,
    channelId: null,
    orderType: defaultOrderType,
    tableId: null,
    cart: [],
    customerName: "",
    customerPhone: "",
    discount: "0",
    tax: "0",
    serviceFee: "0",
  };
}

export function inferStepFromSession(session: Pick<PosSessionData, "orderType" | "tableId" | "cart" | "customerPhone" | "customerName" | "discount" | "tax" | "serviceFee">): PosStep {
  const hasItems = session.cart.length > 0;
  const hasCustomer = Boolean(session.customerPhone.trim() || session.customerName.trim());
  const hasFees =
    (session.discount !== "0" && session.discount !== "") ||
    (session.tax !== "0" && session.tax !== "") ||
    (session.serviceFee !== "0" && session.serviceFee !== "");

  if (hasCustomer || hasFees) return "checkout";
  if (hasItems) return "items";
  if (session.orderType === "dine_in" && session.tableId) return "table";
  return "service";
}

export function sessionStorageKey(branchId: string): string {
  return `counterops:pos-session:${branchId}`;
}

export function lastCustomerStorageKey(branchId: string): string {
  return `counterops:pos-last-customer:${branchId}`;
}

export function loadLastCustomer(branchId: string): Pick<PosSessionData, "customerName" | "customerPhone"> {
  if (typeof window === "undefined") return { customerName: "", customerPhone: "" };
  try {
    const raw = window.localStorage.getItem(lastCustomerStorageKey(branchId));
    if (!raw) return { customerName: "", customerPhone: "" };
    const parsed = JSON.parse(raw) as Partial<Pick<PosSessionData, "customerName" | "customerPhone">>;
    return {
      customerName: parsed.customerName ?? "",
      customerPhone: parsed.customerPhone ?? "",
    };
  } catch {
    return { customerName: "", customerPhone: "" };
  }
}

export function saveLastCustomer(
  branchId: string,
  customer: Pick<PosSessionData, "customerName" | "customerPhone">
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lastCustomerStorageKey(branchId), JSON.stringify(customer));
  } catch {
    // ignore quota errors
  }
}

export function createFreshSession(
  defaultOrderType: "dine_in" | "takeaway",
  branchId: string,
  overrides: Partial<PosSessionData> = {}
): PosSessionData {
  const last = loadLastCustomer(branchId);
  return {
    ...createEmptySession(defaultOrderType),
    customerPhone: last.customerPhone,
    customerName: last.customerName,
    ...overrides,
  };
}

export function percentFromAmount(subtotal: number, amount: number): string {
  if (subtotal <= 0 || amount <= 0) return "0";
  return String(Math.min(100, Math.round((amount / subtotal) * 100)));
}

export function sessionFromOrder(order: {
  id: string;
  order_type: string;
  table_id: string | null;
  discount_amount: number;
  tax_amount: number;
  service_fee_amount: number;
  items?: Array<{
    product_id: string | null;
    product_name_snapshot: string;
    unit_price_snapshot: number;
    quantity: number;
    note: string | null;
  }>;
  customer?: { phone?: string; name?: string } | { phone?: string; name?: string }[] | null;
}): PosSessionData {
  const items = order.items ?? [];
  const subtotal = items.reduce((sum, item) => sum + item.unit_price_snapshot * item.quantity, 0);
  const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer;
  const orderType: "dine_in" | "takeaway" = order.order_type === "takeaway" ? "takeaway" : "dine_in";
  const cart: PosCartItem[] = items.map((item) => ({
    productId: item.product_id ?? "",
    productName: item.product_name_snapshot,
    unitPrice: item.unit_price_snapshot,
    quantity: item.quantity,
    note: item.note ?? "",
    productType: "regular",
  }));
  const partial = {
    orderType,
    tableId: order.table_id,
    cart,
    customerPhone: customer?.phone ?? "",
    customerName: customer?.name ?? "",
    discount: percentFromAmount(subtotal, order.discount_amount ?? 0),
    tax: percentFromAmount(subtotal, order.tax_amount ?? 0),
    serviceFee: String(order.service_fee_amount ?? 0),
  };
  const step = inferStepFromSession(partial);
  return {
    ...partial,
    step,
    maxStep: step,
    orderId: order.id,
  };
}
