import { describe, expect, it } from "vitest";
import { chunkText, extractSearchTerms, normalizeDocumentText } from "@/lib/ai/chunk";

describe("AI document utilities", () => {
  it("normalizes whitespace before indexing documents", () => {
    expect(normalizeDocumentText("  Dòng 1\r\n\r\n\r\nDòng\t2  ")).toBe("Dòng 1\n\nDòng 2");
  });

  it("chunks long text with bounded chunk size and overlap", () => {
    const text = Array.from({ length: 80 }, (_, index) => `Câu số ${index + 1} về doanh thu và tồn kho.`).join(" ");
    const chunks = chunkText(text, 180, 30);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= 220)).toBe(true);
    expect(chunks.map((chunk) => chunk.index)).toEqual(chunks.map((_, index) => index));
  });

  it("extracts Vietnamese search terms without accents or stop words", () => {
    expect(extractSearchTerms("Tóm tắt tài liệu kho và doanh thu hôm nay")).toEqual([
      "tom",
      "tat",
      "tai",
      "lieu",
      "kho",
      "doanh",
      "thu",
      "hom",
    ]);
  });
});
