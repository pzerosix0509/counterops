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
