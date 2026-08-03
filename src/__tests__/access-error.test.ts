import { describe, expect, it } from "vitest";
import { resolveAccessError } from "@/lib/errors/codes";

describe("resolveAccessError", () => {
  it("returns missing_branch copy", () => {
    const result = resolveAccessError("missing_branch");
    expect(result.code).toBe("missing_branch");
    expect(result.title).toContain("chi nhánh");
  });

  it("returns forbidden copy", () => {
    const result = resolveAccessError("forbidden");
    expect(result.code).toBe("forbidden");
    expect(result.title).toContain("quyền");
  });

  it("falls back for unknown codes", () => {
    const result = resolveAccessError("something_else");
    expect(result.code).toBe("unknown");
    expect(result.title).toBe("Đã xảy ra lỗi");
  });
});
