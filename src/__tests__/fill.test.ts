import { describe, it, expect } from "vitest";
import { fillTemplatePdf } from "@/server/documents/pdf/fill";
import { DOCUMENTS } from "@/server/documents/registry";
import type { DocumentData } from "@/server/documents/types";

const BASE: DocumentData = {
  organizationName: "CÔNG TY TNHH THỬ NGHIỆM",
  taxCode: "0312345678",
  streetAddress: "123 Lê Lợi",
  commune: "Phường Bến Nghé",
  district: "Quận 1",
  province: "TP. Hồ Chí Minh",
  phone: null,
  businessLine: null,
  businessStartDate: null,
  accountHolderName: null,
  bankCode: null,
  bankAccountNumber: null,
  branchName: null,
  branchAddress: null,
  revenue: 123_456_789,
  params: { year: 2026, signatureDate: "2026-08-15", lanDau: true },
};

const EXPECTED_PAGES: Record<string, number> = {
  "01-tb-ddkd": 3,
  "01-tkn-cnkd": 7,
  "01-cnkd": 8,
  "02-cnkd-tncn-qtt": 4,
  "01-bk-stk": 1,
};

async function extract(file: Uint8Array): Promise<Array<{ str: string; x: number; y: number; page: number }>> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: file, useSystemFonts: true }).promise;
  const out: Array<{ str: string; x: number; y: number; page: number }> = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      out.push({ str: it.str, x: it.transform[4], y: it.transform[5], page: p });
    }
  }
  return out;
}

describe("template fill", () => {
  it("fills every document template with correct page count", async () => {
    for (const doc of DOCUMENTS) {
      const buffer = await fillTemplatePdf(doc.id, BASE);
      expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
      const parsed = await extract(new Uint8Array(buffer));
      const pages = new Set(parsed.map((i) => i.page)).size;
      expect(pages).toBe(EXPECTED_PAGES[doc.id]);
    }
  });

  it("writes the taxpayer name and tax code into the header fields", async () => {
    const headerY: Record<string, [number, number]> = {
      "01-tb-ddkd": [578, 556],
      "01-tkn-cnkd": [160, 143],
      "01-cnkd": [274, 252],
      "02-cnkd-tncn-qtt": [545, 524],
      "01-bk-stk": [703, 683],
    };
    for (const doc of DOCUMENTS) {
      const buffer = await fillTemplatePdf(doc.id, BASE);
      const parsed = await extract(new Uint8Array(buffer));
      const [nameY, codeY] = headerY[doc.id];
      expect(parsed.some((i) => i.str.includes("THỬ NGHIỆM") && Math.round(i.y) === nameY)).toBe(true);
      expect(parsed.some((i) => i.str.includes("0312345678") && Math.round(i.y) === codeY)).toBe(true);
    }
  });

  it("fills the revenue amount into the Số tiền column of the QTT form", async () => {
    const buffer = await fillTemplatePdf("02-cnkd-tncn-qtt", BASE);
    const parsed = await extract(new Uint8Array(buffer));
    const amount = parsed.find((i) => i.str.includes("123.456.789"));
    expect(amount).toBeDefined();
    expect(amount!.page).toBe(1);
    expect(Math.round(amount!.y)).toBe(187);
    expect(amount!.x).toBeGreaterThan(470);
  });

  it("draws a tick in the selected checkbox on the TB form", { timeout: 10_000 }, async () => {
    const buffer = await fillTemplatePdf("01-tb-ddkd", { ...BASE, params: { ...BASE.params, thongBaoType: "thanh_lap" } });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
    const page = await doc.getPage(1);
    const op = await page.getOperatorList();
    let tick = false;
    for (let k = 0; k < op.fnArray.length; k++) {
      if (op.fnArray[k] !== pdfjs.OPS.constructPath) continue;
      const args = op.argsArray[k];
      if (args[0] !== pdfjs.OPS.stroke) continue;
      const enc = args[1][0];
      for (let i = 0; i < enc.length;) {
        const code = enc[i++];
        if (code === 0 || code === 1) {
          const x = enc[i];
          const y = enc[i + 1];
          i += 2;
          if (x > 84 && x < 100 && y > 410 && y < 440) {
            tick = true;
            break;
          }
        } else if (code === 2 || code === 3) i += 6;
        else i += 4;
      }
      if (tick) break;
    }
    expect(tick).toBe(true);
  });
});
