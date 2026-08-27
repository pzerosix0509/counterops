import type { DocumentCategory, DocumentDefinition } from "./types";

export const DOCUMENT_CATEGORIES: Array<{ key: DocumentCategory; label: string }> = [
  { key: "dia-diem-kinh-doanh", label: "Thủ tục thông báo và quản lý địa điểm kinh doanh" },
  { key: "ke-khai-thue", label: "Hồ sơ thông báo doanh thu và kê khai thuế" },
  { key: "tai-khoan-ngan-hang", label: "Thông báo số tài khoản ngân hàng và ví điện tử" },
  { key: "hoan-thue", label: "Hồ sơ đề nghị hoàn thuế nộp thừa" },
];

export const DOCUMENTS: DocumentDefinition[] = [
  {
    id: "01-tb-ddkd",
    formCode: "01/TB-ĐĐKD",
    title: "Thông báo về việc thành lập địa điểm kinh doanh",
    description:
      "Thông báo thành lập, thay đổi thông tin, tạm ngừng kinh doanh, khôi phục hoặc chấm dứt hoạt động địa điểm kinh doanh.",
    circular: "Thông tư số 18/2026/TT-BTC ngày 05/3/2026 của Bộ trưởng Bộ Tài chính",
    category: "dia-diem-kinh-doanh",
    fileName: "01-tb-ddkd.pdf",
    allowedRoles: ["owner", "admin", "manager"],
  },
  {
    id: "01-tkn-cnkd",
    formCode: "01/TKN-CNKD",
    title: "Thông báo doanh thu / Tờ khai thuế năm",
    description:
      "Thông báo doanh thu thực tế phát sinh trong năm và kê khai các loại thuế khác đối với hộ, cá nhân kinh doanh.",
    circular: "Thông tư số 89/2026/TT-BTC ngày 30/6/2026 của Bộ trưởng Bộ Tài chính",
    category: "ke-khai-thue",
    fileName: "01-tkn-cnkd.pdf",
    allowedRoles: ["owner", "admin", "manager"],
  },
  {
    id: "01-cnkd",
    formCode: "01/CNKD",
    title: "Tờ khai thuế đối với hộ kinh doanh, cá nhân kinh doanh",
    description:
      "Khai thuế GTGT, thuế TNCN và các loại thuế khác theo kỳ tính thuế (tháng, quý hoặc lần phát sinh).",
    circular: "Thông tư số 50/2026/TT-BTC ngày 13/5/2026 của Bộ trưởng Bộ Tài chính",
    category: "ke-khai-thue",
    fileName: "01-cnkd.pdf",
    allowedRoles: ["owner", "admin", "manager"],
  },
  {
    id: "02-cnkd-tncn-qtt",
    formCode: "02/CNKD-TNCN-QTT",
    title: "Tờ khai quyết toán thuế thu nhập cá nhân",
    description:
      "Tờ khai quyết toán thuế TNCN áp dụng cho hộ kinh doanh, cá nhân kinh doanh nộp thuế trên thu nhập tính thuế.",
    circular: "Thông tư số 89/2026/TT-BTC ngày 30/6/2026 của Bộ trưởng Bộ Tài chính",
    category: "hoan-thue",
    fileName: "02-cnkd-tncn-qtt.pdf",
    allowedRoles: ["owner", "admin", "manager"],
  },
  {
    id: "01-bk-stk",
    formCode: "01/BK-STK",
    title: "Thông báo số tài khoản/số hiệu ví điện tử",
    description:
      "Thông báo số tài khoản ngân hàng, số hiệu ví điện tử dùng để ghi nhận các khoản nộp ngân sách nhà nước.",
    circular: "Nghị định số 68/2026/NĐ-CP ngày .../.../2026 của Chính phủ",
    category: "tai-khoan-ngan-hang",
    fileName: "01-bk-stk.pdf",
    allowedRoles: ["owner", "admin", "manager"],
  },
];

export function getDocumentDefinition(id: string): DocumentDefinition | undefined {
  return DOCUMENTS.find((d) => d.id === id);
}
