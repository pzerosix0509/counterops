import { describe, it, expect } from "vitest";
import { DOCUMENTS, DOCUMENT_CATEGORIES, getDocumentDefinition } from "@/server/documents/registry";
import { defaultParams, normalizeDocumentParams, todayIsoDate } from "@/lib/documents/params";
import { renderDocumentPdf } from "@/server/documents/pdf";
import { savePdf, loadPdf, PDF_CACHE_TTL_MS } from "@/server/documents/cache";
import type { DocumentData } from "@/server/documents/types";

describe("document cache", () => {
  it("round-trips a generated PDF by token across module instances", () => {
    const token = "abc123";
    const buffer = Buffer.from("%PDF-1.4 fake pdf");
    savePdf(token, { organizationId: "org-1", fileName: "01-cnkd.pdf", createdAt: Date.now(), buffer });
    const entry = loadPdf(token);
    expect(entry).not.toBeNull();
    expect(entry?.organizationId).toBe("org-1");
    expect(entry?.buffer.equals(buffer)).toBe(true);
    expect(loadPdf("missing")).toBeNull();
  });

  it("expires stale tokens", () => {
    const token = "stale-token";
    savePdf(token, {
      organizationId: "org-1",
      fileName: "x.pdf",
      createdAt: Date.now() - PDF_CACHE_TTL_MS - 1000,
      buffer: Buffer.from("x"),
    });
    expect(loadPdf(token)).toBeNull();
  });
});

describe("document registry", () => {
  it("registers exactly the 5 tax form templates", () => {
    expect(DOCUMENTS).toHaveLength(5);
    const ids = DOCUMENTS.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(["01-tb-ddkd", "01-tkn-cnkd", "01-cnkd", "02-cnkd-tncn-qtt", "01-bk-stk"]));
  });

  it("covers all 4 categories and links them to definitions", () => {
    const categoryKeys = Array.from(new Set(DOCUMENTS.map((d) => d.category)));
    expect(DOCUMENT_CATEGORIES.map((c) => c.key)).toEqual(
      expect.arrayContaining(categoryKeys)
    );
  });

  it("looks up a definition by id", () => {
    expect(getDocumentDefinition("01-cnkd")?.formCode).toBe("01/CNKD");
    expect(getDocumentDefinition("nope")).toBeUndefined();
  });
});

describe("document params", () => {
  it("builds sensible defaults for every document", () => {
    for (const doc of DOCUMENTS) {
      const params = defaultParams(doc.id, { branchName: "CN Trung tâm", businessStartDate: "2026-01-01" });
      expect(params.year).toBeGreaterThanOrEqual(2000);
      expect(params.signatureDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(params.lanDau).toBe(true);
    }
  });

  it("normalizes unsafe client input", () => {
    const normalized = normalizeDocumentParams({
      year: 2500,
      signatureDate: "not-a-date",
      kyThang: 99,
      revenue: "x",
      ecommerceOnly: true,
    });
    expect(normalized.year).toBeLessThanOrEqual(2100);
    expect(normalized.signatureDate).toBe(todayIsoDate());
    expect(normalized.kyThang).toBe(12);
    expect(normalized.revenue).toBeUndefined();
    expect(normalized.ecommerceOnly).toBe(true);
  });

  it("keeps valid numeric fields", () => {
    const normalized = normalizeDocumentParams({ year: 2026, kyThang: 3, revenue: 12345678 });
    expect(normalized.year).toBe(2026);
    expect(normalized.kyThang).toBe(3);
    expect(normalized.revenue).toBe(12345678);
  });
});

describe("pdf renderers", () => {
  const base: DocumentData = {
    organizationName: "Quán Cafe Demo",
    taxCode: "0123456789",
    streetAddress: "123 Lê Lợi, Quận 1",
    commune: "Phường Bến Nghé",
    district: "Quận 1",
    province: "TP. Hồ Chí Minh",
    phone: "0900000000",
    businessLine: "Quán cà phê, giải khát",
    businessStartDate: "2026-01-01",
    accountHolderName: "Nguyễn Văn A",
    bankCode: "970415",
    bankAccountNumber: "123456789",
    branchName: "Chi nhánh trung tâm",
    branchAddress: "123 Lê Lợi, Quận 1",
    revenue: 150_000_000,
    params: { year: 2026, signatureDate: "2026-08-15", lanDau: true },
  };

  for (const doc of DOCUMENTS) {
    it(`renders a valid PDF for ${doc.id}`, async () => {
      const params = defaultParams(doc.id, { branchName: "Chi nhánh trung tâm", businessStartDate: "2026-01-01" });
      const buffer = await renderDocumentPdf(doc.id, { ...base, params });
      expect(buffer.length).toBeGreaterThan(1000);
      expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
      expect(buffer.toString("latin1")).toContain("/Type /Page");
    });
  }

  it("rejects unknown documents", async () => {
    await expect(renderDocumentPdf("not-a-doc", base)).rejects.toThrow();
  });
});
