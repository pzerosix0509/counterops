import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOperationalSettings } from "@/server/queries/settings";
import type { DocumentData, DocumentParams } from "./types";

export interface DocumentContext {
  organizationId: string;
  branchId: string;
  userId: string;
  role: string;
}

function yearBoundaries(year: number): { from: string; to: string } {
  const from = new Date(year, 0, 1, 0, 0, 0, 0);
  const to = new Date(year, 11, 31, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Sum of paid order totals for the given year — used to auto-fill doanh thu. */
export async function getYearlyRevenue(organizationId: string, branchId: string, year: number): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { from, to } = yearBoundaries(year);
  const { data } = await supabase
    .from("orders")
    .select("total_amount")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .in("status", ["paid", "partially_paid"])
    .gte("opened_at", from)
    .lte("opened_at", to);
  return (data ?? []).reduce((sum, order) => sum + (order.total_amount ?? 0), 0);
}

export interface OrganizationRow {
  id: string;
  name: string;
  business_type: string;
}

export async function getOrganization(organizationId: string): Promise<OrganizationRow | null> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, name, business_type")
    .eq("id", organizationId)
    .maybeSingle();
  return data ?? null;
}

/** Assemble all DB-backed values needed by the PDF renderers. */
export async function assembleDocumentData(
  ctx: DocumentContext,
  params: DocumentParams,
  organization: OrganizationRow
): Promise<DocumentData> {
  const [settings, branch, revenue] = await Promise.all([
    getOperationalSettings(ctx.organizationId),
    (async () => {
      const supabase = createSupabaseServerClient();
      const { data } = await supabase
        .from("branches")
        .select("id, name, address, phone")
        .eq("id", ctx.branchId)
        .eq("organization_id", ctx.organizationId)
        .maybeSingle();
      return data ?? null;
    })(),
    getYearlyRevenue(ctx.organizationId, ctx.branchId, params.year),
  ]);

  return {
    organizationName: settings.receiptStoreName || organization.name,
    taxCode: settings.taxCode ?? null,
    streetAddress: settings.receiptAddress ?? null,
    commune: settings.commune ?? null,
    district: settings.district ?? null,
    province: settings.province ?? null,
    phone: settings.receiptPhone || branch?.phone || null,
    businessLine: settings.businessLine ?? null,
    businessStartDate: settings.businessStartDate ?? null,
    accountHolderName: settings.accountHolderName ?? null,
    bankCode: settings.bankCode ?? null,
    bankAccountNumber: settings.bankAccountNumber ?? null,
    branchName: branch?.name ?? null,
    branchAddress: branch?.address ?? null,
    revenue: params.revenue != null ? params.revenue : revenue,
    params,
  };
}
