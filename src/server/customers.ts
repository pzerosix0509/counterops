import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CUSTOMER_PHONE_ERROR, fallbackCustomerName, normalizeCustomerPhone } from "@/lib/customers/phone";

export async function upsertCustomerByPhone(
  supabase: SupabaseClient,
  organizationId: string,
  phoneRaw: string | null | undefined,
  nameRaw: string | null | undefined,
): Promise<string | null> {
  const trimmed = phoneRaw?.trim() || "";
  const phone = normalizeCustomerPhone(trimmed);
  if (!phone) {
    if (trimmed) throw new Error(CUSTOMER_PHONE_ERROR);
    return null;
  }
  const name = fallbackCustomerName(nameRaw, phone);

  const { data: existing, error: findError } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (existing) {
    if (nameRaw?.trim()) {
      await supabase.from("customers").update({ name }).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error: insertError } = await supabase
    .from("customers")
    .insert({ organization_id: organizationId, phone, name })
    .select("id")
    .single();
  if (insertError || !created) throw new Error(insertError?.message ?? "Không tạo được khách");
  return created.id;
}
