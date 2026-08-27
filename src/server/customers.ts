import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fallbackCustomerName, normalizeCustomerPhone } from "@/lib/customers/phone";

export async function upsertCustomerByPhone(
  supabase: SupabaseClient,
  organizationId: string,
  phoneRaw: string | null | undefined,
  nameRaw: string | null | undefined,
): Promise<string | null> {
  const phone = normalizeCustomerPhone(phoneRaw);
  if (!phone) return null;
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
