import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateProfitTotals } from "@/lib/calculations/orders";
import type { EndOfDayReport, Order, OrderItem, Payment } from "@/types/database";

export interface EodComputation {
  totalOrders: number;
  grossSales: number;
  discounts: number;
  netRevenue: number;
  costOfGoods: number;
  grossProfit: number;
  grossMarginPercent: number;
  channelFees: number;
  netProfit: number;
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
    costOfGoods: number;
    grossProfit: number;
    channelFee: number;
    netProfit: number;
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
      .select("*, payments(*), items:order_items(*), dining_tables(name)")
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

  const allOrders = (orders ?? []) as Array<Order & { payments: Payment[]; items: OrderItem[]; dining_tables: { name: string } | null }>;
  const paid = allOrders.filter((o) => o.status === "paid" || o.status === "partially_paid");
  const gross = paid.reduce((s, o) => s + (o.subtotal ?? 0), 0);
  const discounts = paid.reduce((s, o) => s + (o.discount_amount ?? 0), 0);
  const tax = paid.reduce((s, o) => s + (o.tax_amount ?? 0), 0);
  const serviceFee = paid.reduce((s, o) => s + (o.service_fee_amount ?? 0), 0);
  const netRevenue = Math.max(0, gross - discounts + tax + serviceFee);
  const profitTotals = calculateProfitTotals(
    paid.flatMap((o) =>
      (o.items ?? []).map((item) => ({
        costPrice: Number(item.cost_price_snapshot ?? 0),
        quantity: Number(item.quantity ?? 0),
      }))
    ),
    netRevenue
  );
  const organizationId = paid[0]?.organization_id ?? allOrders[0]?.organization_id ?? null;
  const { data: channels } = organizationId
    ? await supabase
        .from("sales_channels")
        .select("id, platform_fee_percent")
        .eq("organization_id", organizationId)
    : { data: [] };
  const channelFeePercent = new Map<string, number>((channels ?? []).map((channel: any) => [channel.id, Number(channel.platform_fee_percent ?? 0)]));
  const getOrderChannelFee = (order: Order) => {
    const feePercent = order.sales_channel_id ? channelFeePercent.get(order.sales_channel_id) ?? 0 : 0;
    return Math.round(Number(order.total_amount ?? 0) * (feePercent / 100));
  };
  const channelFees = paid.reduce((sum, order) => sum + getOrderChannelFee(order), 0);
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
  const cancelledAmount = (cancelled ?? []).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0);

  return {
    totalOrders: paid.length,
    grossSales: gross,
    discounts,
    netRevenue,
    costOfGoods: profitTotals.costOfGoods,
    grossProfit: profitTotals.grossProfit,
    grossMarginPercent: profitTotals.grossMarginPercent,
    channelFees,
    netProfit: profitTotals.grossProfit - channelFees,
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
    orders: paid.map((o) => {
      const orderCost = Math.round(
        (o.items ?? []).reduce(
          (sum, item) => sum + Number(item.cost_price_snapshot ?? 0) * Number(item.quantity ?? 0),
          0
        )
      );
      const channelFee = getOrderChannelFee(o);
      return {
        id: o.id,
        orderNumber: o.order_number,
        tableName: o.dining_tables?.name ?? null,
        openedAt: o.opened_at,
        closedAt: o.closed_at,
        total: o.total_amount,
        costOfGoods: orderCost,
        grossProfit: o.total_amount - orderCost,
        channelFee,
        netProfit: o.total_amount - orderCost - channelFee,
        payments: (o.payments ?? []).map((p) => ({ method: p.method, amount: p.amount })),
      };
    }),
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
