import { describe, expect, it } from "vitest";
import { employeeSchema } from "@/lib/validation/schemas";

describe("Employee management validation", () => {
  const valid = {
    fullName: "Nguyen Van An",
    branchId: "00000000-0000-4000-8000-000000000001",
    startDate: "2026-08-20",
    status: "ACTIVE" as const,
  };

  it("accepts a new employee without an editable employee code", () => {
    const result = employeeSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("employeeCode");
  });

  it("requires a valid branch and start date", () => {
    expect(employeeSchema.safeParse({ ...valid, branchId: "branch", startDate: "20/08/2026" }).success).toBe(false);
  });

  it("accepts resignation with an end date", () => {
    const result = employeeSchema.safeParse({ ...valid, status: "RESIGNED", endDate: "2026-08-20" });
    expect(result.success).toBe(true);
  });
});