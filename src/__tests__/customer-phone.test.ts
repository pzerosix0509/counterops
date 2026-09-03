import { describe, expect, it } from "vitest";
import {
  CUSTOMER_PHONE_ERROR,
  fallbackCustomerName,
  formatAnalyticsCustomerLabel,
  getCustomerPhoneError,
  normalizeCustomerPhone,
  resolveUpdatedPhone,
} from "@/lib/customers/phone";
import { optionalCustomerPhoneSchema } from "@/lib/validation/schemas";

describe("normalizeCustomerPhone", () => {
  it("keeps digits and drops spaces", () => {
    expect(normalizeCustomerPhone("0901 234 567")).toBe("0901234567");
  });

  it("normalizes +84 prefix to local format", () => {
    expect(normalizeCustomerPhone("+84 901 234 567")).toBe("0901234567");
    expect(normalizeCustomerPhone("84901234567")).toBe("0901234567");
  });

  it("accepts valid prefixes 03, 05, 07, 08, 09", () => {
    expect(normalizeCustomerPhone("0312345678")).toBe("0312345678");
    expect(normalizeCustomerPhone("0512345678")).toBe("0512345678");
    expect(normalizeCustomerPhone("0712345678")).toBe("0712345678");
    expect(normalizeCustomerPhone("0812345678")).toBe("0812345678");
    expect(normalizeCustomerPhone("0912345678")).toBe("0912345678");
  });

  it("rejects invalid values", () => {
    expect(normalizeCustomerPhone("123")).toBeNull();
    expect(normalizeCustomerPhone("0212345678")).toBeNull();
    expect(normalizeCustomerPhone("090123456")).toBeNull();
    expect(normalizeCustomerPhone("1901234567")).toBeNull();
    expect(normalizeCustomerPhone("")).toBeNull();
    expect(normalizeCustomerPhone(null)).toBeNull();
  });
});

describe("getCustomerPhoneError", () => {
  it("allows empty phone", () => {
    expect(getCustomerPhoneError("")).toBeNull();
    expect(getCustomerPhoneError("   ")).toBeNull();
  });

  it("returns error for invalid phone", () => {
    expect(getCustomerPhoneError("123")).toBe(CUSTOMER_PHONE_ERROR);
  });
});

describe("fallbackCustomerName", () => {
  it("uses provided name", () => {
    expect(fallbackCustomerName("  An  ", "0901234567")).toBe("An");
  });

  it("falls back to last 4 digits", () => {
    expect(fallbackCustomerName("", "0901234567")).toBe("Khách 4567");
  });
});

describe("formatAnalyticsCustomerLabel", () => {
  it("shows name and phone together when both exist", () => {
    expect(formatAnalyticsCustomerLabel("0901234567", "bill")).toBe("bill · 0901234567");
    expect(formatAnalyticsCustomerLabel("0901234567", "Lan")).toBe("Lan · 0901234567");
  });

  it("falls back to name or phone alone", () => {
    expect(formatAnalyticsCustomerLabel(null, "bill")).toBe("bill");
    expect(formatAnalyticsCustomerLabel("0901234567", null)).toBe("0901234567");
    expect(formatAnalyticsCustomerLabel(null, null)).toBe("—");
  });
});

describe("resolveUpdatedPhone", () => {
  it("allows clearing a phone", () => {
    expect(resolveUpdatedPhone(null)).toEqual({ ok: true, phone: null });
    expect(resolveUpdatedPhone("")).toEqual({ ok: true, phone: null });
  });

  it("normalizes valid phone", () => {
    expect(resolveUpdatedPhone("0901 234 567")).toEqual({ ok: true, phone: "0901234567" });
  });

  it("rejects invalid phone", () => {
    expect(resolveUpdatedPhone("123")).toEqual({ ok: false, message: CUSTOMER_PHONE_ERROR });
  });
});

describe("optionalCustomerPhoneSchema", () => {
  it("accepts empty and valid phone", () => {
    expect(optionalCustomerPhoneSchema.parse(null)).toBeNull();
    expect(optionalCustomerPhoneSchema.parse("")).toBeNull();
    expect(optionalCustomerPhoneSchema.parse("0901 234 567")).toBe("0901234567");
  });

  it("rejects invalid phone", () => {
    expect(() => optionalCustomerPhoneSchema.parse("123")).toThrow(CUSTOMER_PHONE_ERROR);
  });
});
