// AI document upload validation helpers.

export function validateDocumentContentLength(content: string, mimeType: string | null): string | null {
  const isImage = mimeType?.startsWith("image/") ?? false;
  const minLength = isImage ? 5 : 20;
  if (content.length === 0) {
    return "Không trích được văn bản từ tệp. Vui lòng dùng tệp text, PDF hoặc ảnh rõ nét.";
  }
  if (content.length < minLength) {
    return `Tài liệu quá ngắn để tạo ngữ cảnh AI (tối thiểu ${minLength} ký tự).`;
  }
  if (content.length > 500_000) {
    return "Tài liệu quá lớn. Vui lòng chia nhỏ trước khi upload.";
  }
  return null;
}
