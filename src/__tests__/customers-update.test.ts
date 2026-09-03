import { describe, expect, it } from "vitest";
import { updateCustomerSchema } from "@/lib/validation/schemas";

const id = "11111111-1111-4111-8111-111111111111";

describe("updateCustomerSchema", () => {
  it("accepts a valid update payload", () => {
    const parsed = updateCustomerSchema.safeParse({
      id,
      name: "Lan",
      phone: "0901234567",
      email: "lan@example.com",
      birthday: "1990-05-01",
      notes: "VIP",
    });
    expect(parsed.success).toBe(true);
  });

  it("treats empty email and birthday as null", () => {
    const parsed = updateCustomerSchema.safeParse({
      id,
      email: "  ",
      birthday: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBeNull();
      expect(parsed.data.birthday).toBeNull();
    }
  });

  it("rejects invalid email, birthday, id, and phone", () => {
    expect(updateCustomerSchema.safeParse({ id, email: "not-an-email" }).success).toBe(false);
    expect(updateCustomerSchema.safeParse({ id, birthday: "01-05-1990" }).success).toBe(false);
    expect(updateCustomerSchema.safeParse({ id: "nope", name: "A" }).success).toBe(false);
    expect(updateCustomerSchema.safeParse({ id, phone: "123" }).success).toBe(false);
  });
});
