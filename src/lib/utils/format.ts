import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.valueOf())) return "—";
  return d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.valueOf())) return "—";
  return d.toLocaleDateString("vi-VN", { dateStyle: "short" });
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.valueOf())) return "—";
  return d.toLocaleTimeString("vi-VN", { timeStyle: "short" });
}

/**
 * Format a raw numeric string with thousand separators (vi-VN: 1234 -> "1.234").
 * The decimal separator is "," (e.g. "1.234,5"); an empty input yields "".
 */
export function formatNumberInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return raw;
  return num.toLocaleString("vi-VN", { maximumFractionDigits: 6 });
}

/**
 * Parse a formatted number string back into a number (inverse of formatNumberInput).
 * Returns null when the string is empty or not a valid number.
 */
export function parseFormattedNumber(formatted: string): number | null {
  const trimmed = formatted.trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}
