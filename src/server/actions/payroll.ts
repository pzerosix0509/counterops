"use server";

import { revalidatePath } from "next/cache";
import { requireActiveContext } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";

// ============================================================
// Types
// ============================================================
export type SalaryProfile = {
  id: string;
  organization_id: string;
  employee_id: string;
  salary_type: 'PER_SHIFT' | 'MONTHLY' | 'HOURLY' | 'STANDARD_DAY';
  base_amount: number;
  effective_from: string;
};

// ============================================================
// Actions
// ============================================================

export async function getEmployeeSalaryProfile(
  employeeId: string
): Promise<ActionResult<SalaryProfile | null>> {
  try {
    const { organizationId, role } = await requireActiveContext();
    if (!['owner', 'admin', 'manager'].includes(role)) {
      return actionFail("FORBIDDEN", "Bạn không có quyền xem hồ sơ lương.");
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("salary_profiles")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("employee_id", employeeId)
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("getEmployeeSalaryProfile error:", error);
      return actionFail("INTERNAL_ERROR", "Lỗi khi tải hồ sơ lương");
    }

    return actionOk(data as SalaryProfile | null);
  } catch (err: any) {
    return actionFail("INTERNAL_ERROR", err.message || "Đã xảy ra lỗi không xác định");
  }
}

export async function saveSalaryProfile(data: {
  employee_id: string;
  salary_type: 'PER_SHIFT' | 'MONTHLY' | 'HOURLY' | 'STANDARD_DAY';
  base_amount: number;
  effective_from: string;
}): Promise<ActionResult<SalaryProfile>> {
  try {
    const { organizationId, role } = await requireActiveContext();
    if (!['owner', 'admin', 'manager'].includes(role)) {
      return actionFail("FORBIDDEN", "Bạn không có quyền quản lý hồ sơ lương.");
    }

    const admin = createSupabaseAdminClient();
    const { data: profile, error } = await admin
      .from("salary_profiles")
      .insert({
        organization_id: organizationId,
        employee_id: data.employee_id,
        salary_type: data.salary_type,
        base_amount: data.base_amount,
        effective_from: data.effective_from,
      })
      .select()
      .single();

    if (error) {
      console.error("saveSalaryProfile error:", error);
      return actionFail("INTERNAL_ERROR", "Lỗi khi lưu hồ sơ lương");
    }

    revalidatePath("/employees");
    return actionOk(profile as SalaryProfile);
  } catch (err: any) {
    return actionFail("INTERNAL_ERROR", err.message || "Đã xảy ra lỗi không xác định");
  }
}