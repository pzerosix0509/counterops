import { describe, it, expect } from "vitest";
import { uploadDocumentSchema } from "@/lib/validation/upload";
import { validateDocumentContentLength } from "@/lib/ai/upload";

describe("UC09 — Upload AI Documents: schema validation", () => {
  it("UC09.S01 — Chấp nhận tài liệu dạng văn bản", () => {
    // Bước: gửi title, fileName và content không trống.
    // Kết quả mong đợi: parse thành công.
    const r = uploadDocumentSchema.safeParse({
      title: "Quy trình kho",
      fileName: "quy-trinh-kho.txt",
      content: "Nội dung tài liệu quy trình kiểm kê kho.",
    });
    expect(r.success).toBe(true);
  });

  it("UC09.S02 — Chấp nhận tài liệu dạng binary", () => {
    // Bước: gửi title, fileName và binary (base64) kèm mime.
    // Kết quả mong đợi: parse thành công.
    const r = uploadDocumentSchema.safeParse({
      title: "Hóa đơn",
      fileName: "hoa-don.png",
      binary: { data: "aGVsbG8=", mime: "image/png" },
    });
    expect(r.success).toBe(true);
  });

  it("UC09.S03 — Từ chối khi thiếu cả content lẫn binary", () => {
    // Bước: gửi chỉ title, fileName, không có content/binary.
    // Kết quả mong đợi: parse thất bại do refine "Cần content hoặc binary."
    const r = uploadDocumentSchema.safeParse({ title: "Tài liệu", fileName: "doc.txt" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Cần content hoặc binary.");
  });

  it("UC09.S04 — Từ chối title hoặc fileName rỗng/quá dài", () => {
    // Bước: gửi title rỗng.
    // Kết quả mong đợi: parse thất bại.
    expect(uploadDocumentSchema.safeParse({ title: "", fileName: "doc.txt", content: "abc" }).success).toBe(false);
    // Bước: gửi title > 160 ký tự.
    // Kết quả mong đợi: parse thất bại.
    expect(uploadDocumentSchema.safeParse({ title: "T".repeat(161), fileName: "doc.txt", content: "abc" }).success).toBe(false);
    // Bước: gửi fileName > 240 ký tự.
    // Kết quả mong đợi: parse thất bại.
    expect(uploadDocumentSchema.safeParse({ title: "T", fileName: "F".repeat(241), content: "abc" }).success).toBe(false);
  });

  it("UC09.S05 — Từ chối binary vượt quá kích thước cho phép", () => {
    // Bước: gửi binary.data > 20MB (20_000_000 ký tự base64).
    // Kết quả mong đợi: parse thất bại.
    const r = uploadDocumentSchema.safeParse({
      title: "Lớn",
      fileName: "big.png",
      binary: { data: "a".repeat(20_000_001), mime: "image/png" },
    });
    expect(r.success).toBe(false);
  });
});

describe("UC09 — Upload AI Documents: content length guard", () => {
  it("UC09.S06 — Văn bản ngắn hơn ngưỡng 20 ký tự bị từ chối", () => {
    // Bước: nội dung text dài 10 ký tự, mimeType không phải ảnh.
    // Kết quả mong đợi: trả về lỗi nhắc tối thiểu 20 ký tự.
    const error = validateDocumentContentLength("0123456789", "text/plain");
    expect(error).toContain("20 ký tự");
  });

  it("UC09.S07 — Ảnh chỉ cần tối thiểu 5 ký tự trích xuất", () => {
    // Bước: nội dung ảnh dài 5 ký tự, mimeType image/png.
    // Kết quả mong đợi: không có lỗi (null).
    expect(validateDocumentContentLength("12345", "image/png")).toBeNull();
    // Bước: nội dung ảnh dài 4 ký tự.
    // Kết quả mong đợi: lỗi nhắc tối thiểu 5 ký tự.
    expect(validateDocumentContentLength("1234", "image/png")).toContain("5 ký tự");
  });

  it("UC09.S08 — Tài liệu vượt 500.000 ký tự bị từ chối", () => {
    // Bước: nội dung dài 500_001 ký tự.
    // Kết quả mong đợi: lỗi nhắc chia nhỏ tài liệu.
    expect(validateDocumentContentLength("x".repeat(500_001), "text/plain")).toContain("quá lớn");
  });

  it("UC09.S09 — Nội dung rỗng bị từ chối", () => {
    // Bước: nội dung rỗng (kể cả ảnh).
    // Kết quả mong đợi: lỗi không trích được văn bản.
    expect(validateDocumentContentLength("", "text/plain")).toContain("Không trích");
    expect(validateDocumentContentLength("", "image/png")).toContain("Không trích");
  });
});
