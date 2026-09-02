export function normalizeCustomerPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function fallbackCustomerName(name: string | null | undefined, phone: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return `Khách ${phone.slice(-4)}`;
}

export function displayCustomerName(name: string | null | undefined, phone: string | null | undefined): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (phone) return `Khách ${phone.slice(-4)}`;
  return "Khách";
}

export function resolveUpdatedPhone(
  raw: string | null | undefined,
): { ok: true; phone: string | null } | { ok: false; message: string } {
  const trimmed = raw?.trim() || "";
  if (!trimmed) return { ok: true, phone: null };
  const phone = normalizeCustomerPhone(trimmed);
  if (!phone) return { ok: false, message: "Số điện thoại không hợp lệ" };
  return { ok: true, phone };
}
