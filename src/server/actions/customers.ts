"use server";

import { revalidatePath } from "next/cache";
import { canManageCustomers, requireActiveContext, requireRole } from "@/lib/auth/permissions";
import { fallbackCustomerName, resolveUpdatedPhone } from "@/lib/customers/phone";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { updateCustomerSchema } from "@/lib/validation/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() || "";
  return trimmed ? trimmed : null;
}

export async function updateCustomer(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = updateCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return actionFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Thông tin khách không hợp lệ");
  }

  const phoneResult = resolveUpdatedPhone(parsed.data.phone);
  if (!phoneResult.ok) return actionFail("VALIDATION_ERROR", phoneResult.message);

  const ctx = await requireActiveContext();
  await requireRole(ctx.organizationId, canManageCustomers);

  const supabase = createSupabaseServerClient();

  const { data: existing, error: findError } = await supabase
    .from("customers")
    .select("id, name, phone")
    .eq("id", parsed.data.id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (findError) return actionFail("INTERNAL_ERROR", findError.message);
  if (!existing) return actionFail("NOT_FOUND", "Không tìm thấy khách hàng");

  if (phoneResult.phone) {
    const { data: duplicate, error: dupError } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("phone", phoneResult.phone)
      .neq("id", parsed.data.id)
      .maybeSingle();
    if (dupError) return actionFail("INTERNAL_ERROR", dupError.message);
    if (duplicate) return actionFail("CONFLICT", "Số điện thoại đã thuộc khách khác");
  }

  const nameRaw = emptyToNull(parsed.data.name);
  const name = nameRaw ?? (phoneResult.phone ? fallbackCustomerName(null, phoneResult.phone) : existing.name);
  const email = emptyToNull(typeof parsed.data.email === "string" ? parsed.data.email : null);
  const birthday = emptyToNull(typeof parsed.data.birthday === "string" ? parsed.data.birthday : null);
  const notes = emptyToNull(parsed.data.notes);

  const { error: updateError } = await supabase
    .from("customers")
    .update({
      name,
      phone: phoneResult.phone,
      email,
      birthday,
      notes,
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", ctx.organizationId);
  if (updateError) {
    if (updateError.message.includes("customers_org_phone_uniq")) {
      return actionFail("CONFLICT", "Số điện thoại đã thuộc khách khác");
    }
    return actionFail("INTERNAL_ERROR", "Không cập nhật được khách hàng");
  }

  revalidatePath("/customers");
  return actionOk({ id: parsed.data.id });
}
