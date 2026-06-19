"use server";

import { revalidatePath } from "next/cache";
import { eodInputSchema } from "@/lib/validation/schemas";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { canGenerateEod, requireRole } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeEod } from "@/server/queries/eod";

export async function generateEndOfDayReport(
  organizationId: string,
  input: unknown
): Promise<ActionResult<{ id: string; reportDate: string; documentCode: string; totalOrders: number; netRevenue: number }>> {
  const m = await requireRole(organizationId, canGenerateEod);
  const parsed = eodInputSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Thiếu chi nhánh hoặc ngày");
  const admin = createSupabaseAdminClient();
  const data = await computeEod(parsed.data.branchId, parsed.data.reportDate);
  const code = `EOD-${parsed.data.branchId.slice(0, 6).toUpperCase()}-${parsed.data.reportDate.replace(/-/g, "")}`;
  const { data: existing } = await admin
    .from("end_of_day_reports")
    .select("id")
    .eq("branch_id", parsed.data.branchId)
    .eq("report_date", parsed.data.reportDate)
    .maybeSingle();
  if (existing) {
    await admin
      .from("end_of_day_reports")
      .update({
        document_code: code,
        total_orders: data.totalOrders,
        gross_sales: data.grossSales,
        discounts: data.discounts,
        net_revenue: data.netRevenue,
        other_income: 0,
        tax: data.tax,
        return_fee: 0,
        total_paid: data.totalPaid,
        debt_amount: data.debtAmount,
        cash_total: data.cashTotal,
        bank_transfer_total: data.bankTransferTotal,
        generated_by: m.membership.user_id,
        generated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    revalidatePath("/reports/end-of-day");
    return actionOk({ id: existing.id, reportDate: parsed.data.reportDate, documentCode: code, totalOrders: data.totalOrders, netRevenue: data.netRevenue });
  }
  const { data: row, error } = await admin
    .from("end_of_day_reports")
    .insert({
      organization_id: m.organization.id,
      branch_id: parsed.data.branchId,
      report_date: parsed.data.reportDate,
      document_code: code,
      total_orders: data.totalOrders,
      gross_sales: data.grossSales,
      discounts: data.discounts,
      net_revenue: data.netRevenue,
      other_income: 0,
      tax: data.tax,
      return_fee: 0,
      total_paid: data.totalPaid,
      debt_amount: data.debtAmount,
      cash_total: data.cashTotal,
      bank_transfer_total: data.bankTransferTotal,
      generated_by: m.membership.user_id,
    })
    .select("id")
    .single();
  if (error || !row) return actionFail("INTERNAL_ERROR", "Không tạo được báo cáo: " + (error?.message ?? ""));
  revalidatePath("/reports/end-of-day");
  return actionOk({ id: row.id, reportDate: parsed.data.reportDate, documentCode: code, totalOrders: data.totalOrders, netRevenue: data.netRevenue });
}
