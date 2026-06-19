import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EndOfDayReport, Order, Payment } from "@/types/database";

export interface EodComputation {
  totalOrders: number;
  grossSales: number;
  discounts: number;
  netRevenue: number;
  tax: number;
  serviceFee: number;
  totalPaid: number;
  debtAmount: number;
  cashTotal: number;
  bankTransferTotal: number;
  cardTotal: number;
  ewalletTotal: number;
  debtPayments: number;
  otherPayments: number;
  cancelledOrders: number;
  cancelledAmount: number;
  orders: Array<{
    id: string;
    orderNumber: string;
    tableName: string | null;
    openedAt: string;
    closedAt: string | null;
    total: number;
    payments: Array<{ method: string; amount: number }>;
  }>;
}

export async function computeEod(branchId: string, reportDate: string): Promise<EodComputation> {
  const supabase = createSupabaseServerClient();
  const start = new Date(reportDate + "T00:00:00");
  const end = new Date(reportDate + "T23:59:59.999");

  const [{ data: orders }, { data: cancelled }] = await Promise.all([
    supabase
      .from("orders")
      .select("*, payments(*), dining_tables(name)")
      .eq("branch_id", branchId)
      .gte("opened_at", start.toISOString())
      .lte("opened_at", end.toISOString())
      .neq("status", "draft"),
    supabase
      .from("orders")
      .select("id, total_amount, status")
      .eq("branch_id", branchId)
      .eq("status", "cancelled")
      .gte("opened_at", start.toISOString())
      .lte("opened_at", end.toISOString()),
  ]);

  const allOrders = (orders ?? []) as Array<Order & { payments: Payment[]; dining_tables: { name: string } | null }>;
  const paid = allOrders.filter((o) => o.status === "paid" || o.status === "partially_paid");
  const gross = paid.reduce((s, o) => s + (o.subtotal ?? 0), 0);
  const discounts = paid.reduce((s, o) => s + (o.discount_amount ?? 0), 0);
  const tax = paid.reduce((s, o) => s + (o.tax_amount ?? 0), 0);
  const serviceFee = paid.reduce((s, o) => s + (o.service_fee_amount ?? 0), 0);
  const netRevenue = Math.max(0, gross - discounts + tax + serviceFee);
  const payments = paid.flatMap((o) => o.payments ?? []);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const cashTotal = payments.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0);
  const bankTransferTotal = payments.filter((p) => p.method === "bank_transfer").reduce((s, p) => s + p.amount, 0);
  const cardTotal = payments.filter((p) => p.method === "card").reduce((s, p) => s + p.amount, 0);
  const ewalletTotal = payments.filter((p) => p.method === "ewallet").reduce((s, p) => s + p.amount, 0);
  const debtPayments = payments.filter((p) => p.method === "debt").reduce((s, p) => s + p.amount, 0);
  const otherPayments = payments.filter((p) => p.method === "other").reduce((s, p) => s + p.amount, 0);
  const debtAmount = paid.reduce((s, o) => s + (o.debt_amount ?? 0), 0);
  const cancelledOrders = (cancelled ?? []).length;
  const cancelledAmount = (cancelled ?? []).reduce((s, o) => s + (o.total_amount ?? 0), 0);

  return {
    totalOrders: paid.length,
    grossSales: gross,
    discounts,
    netRevenue,
    tax,
    serviceFee,
    totalPaid,
    debtAmount,
    cashTotal,
    bankTransferTotal,
    cardTotal,
    ewalletTotal,
    debtPayments,
    otherPayments,
    cancelledOrders,
    cancelledAmount,
    orders: paid.map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      tableName: o.dining_tables?.name ?? null,
      openedAt: o.opened_at,
      closedAt: o.closed_at,
      total: o.total_amount,
      payments: (o.payments ?? []).map((p) => ({ method: p.method, amount: p.amount })),
    })),
  };
}

export async function getOrCreateEodReport(organizationId: string, branchId: string, reportDate: string): Promise<EndOfDayReport | null> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("end_of_day_reports")
    .select("*")
    .eq("branch_id", branchId)
    .eq("report_date", reportDate)
    .maybeSingle();
  return data ?? null;
}
