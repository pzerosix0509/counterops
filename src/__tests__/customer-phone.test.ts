import { describe, expect, it } from "vitest";
import { fallbackCustomerName, normalizeCustomerPhone, resolveUpdatedPhone } from "@/lib/customers/phone";

describe("normalizeCustomerPhone", () => {
  it("keeps digits and drops spaces", () => {
    expect(normalizeCustomerPhone("0901 234 567")).toBe("0901234567");
  });

  it("rejects short values", () => {
    expect(normalizeCustomerPhone("123")).toBeNull();
    expect(normalizeCustomerPhone("")).toBeNull();
    expect(normalizeCustomerPhone(null)).toBeNull();
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

describe("resolveUpdatedPhone uniqueness helper", () => {
  it("allows clearing a phone", () => {
    const cleared = resolveUpdatedPhone(null);
    expect(cleared).toEqual({ ok: true, phone: null });
  });
});
