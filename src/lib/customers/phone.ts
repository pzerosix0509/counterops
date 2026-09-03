export const CUSTOMER_PHONE_ERROR = "Số điện thoại không hợp lệ";

const VN_MOBILE_RE = /^0(3|5|7|8|9)\d{8}$/;

export function normalizeCustomerPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length === 11) {
    digits = `0${digits.slice(2)}`;
  }
  if (!VN_MOBILE_RE.test(digits)) return null;
  return digits;
}

export function getCustomerPhoneError(phone: string | null | undefined): string | null {
  const trimmed = phone?.trim() || "";
  if (!trimmed) return null;
  return normalizeCustomerPhone(trimmed) ? null : CUSTOMER_PHONE_ERROR;
}

export function fallbackCustomerName(name: string | null | undefined, phone: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return `Khách ${phone.slice(-4)}`;
}

export function formatAnalyticsCustomerLabel(
  phone: string | null | undefined,
  name: string | null | undefined,
): string {
  const trimmedName = name?.trim();
  if (trimmedName && phone) return `${trimmedName} · ${phone}`;
  if (trimmedName) return trimmedName;
  if (phone) return phone;
  return "—";
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
  if (!phone) return { ok: false, message: CUSTOMER_PHONE_ERROR };
  return { ok: true, phone };
}
