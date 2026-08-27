/**
 * Redaction PII — trước khi ghi telemetry/tool_calls vào ai_runs,
 * strip email/SĐT/CMND trong arguments (query tài liệu/web có thể chứa PII).
 */

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_PATTERN = /(\+?84|0)(\d{9,10})\b/g;
const ID_PATTERN = /\b\d{9,12}\b/g; // CMND/CCCD 9-12 chữ số

export function redactText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, "[email]")
    .replace(PHONE_PATTERN, "[phone]")
    .replace(ID_PATTERN, "[id]");
}

/** Redact đệ quy mọi string trong object/array */
export function redactPii<T>(value: T): T {
  if (typeof value === "string") {
    return redactText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactPii(item)) as T;
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = redactPii(nested);
    }
    return result as T;
  }
  return value;
}
