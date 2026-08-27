import { type PageState, field, spacer, paragraph, drawFormHeader, signature, table } from "../layout";
import type { DocumentData } from "../../types";

function empty(value: string | null | undefined): string {
  return value || "…";
}

export function render01BkStk(state: PageState, data: DocumentData): void {
  const { params } = data;
  const bankAccount = data.bankAccountNumber;
  const bankCode = data.bankCode;
  const accountHolder = data.accountHolderName || data.organizationName;

  drawFormHeader(state, {
    formCode: "01/BK-STK",
    circular: "quy định tại khoản 4 Điều 17 Nghị định số 68/2026/NĐ-CP của Chính phủ",
    title: "THÔNG BÁO SỐ TÀI KHOẢN/SỐ HIỆU VÍ ĐIỆN TỬ",
    subtitle: "(Kèm theo Thông báo doanh thu hoặc Tờ khai thuế đầu tiên của năm)",
  });

  field(state, "[01] Người nộp thuế:", data.organizationName);
  field(state, "[02] Mã số thuế:", empty(data.taxCode));
  field(state, "[03] Năm thông báo:", String(params.year));
  spacer(state, 4);

  paragraph(state, "Bảng kê số tài khoản ngân hàng, số hiệu ví điện tử dùng để ghi nhận các khoản nộp ngân sách nhà nước:", { size: 9.5 });

  const rows: Array<Array<string>> = [];
  if (bankAccount) {
    rows.push([
      "1",
      "Tài khoản ngân hàng",
      bankAccount,
      accountHolder,
      bankCode || "…",
      "VND",
      "…",
    ]);
  }
  rows.push([
    String(rows.length + 1),
    "Ví điện tử",
    "…",
    accountHolder,
    "…",
    "VND",
    "…",
  ]);
  if (rows.length === 0) {
    rows.push(["1", "Tài khoản ngân hàng", "…", accountHolder, "…", "VND", "…"]);
  }

  table(
    state,
    [
      { header: "STT", width: 32, align: "center" },
      { header: "Loại", width: 100 },
      { header: "Số tài khoản / số hiệu ví", width: 128, align: "center" },
      { header: "Tên chủ tài khoản", width: 120 },
      { header: "Tên ngân hàng / đơn vị ví", width: 96, align: "center" },
      { header: "Loại tiền", width: 46, align: "center" },
      { header: "Ghi chú", width: 88 },
    ],
    rows
  );

  spacer(state, 6);
  paragraph(state, "Ghi chú: Thông báo số tài khoản được gửi kèm theo Thông báo doanh thu hoặc Tờ khai thuế đầu tiên của năm theo quy định.", { size: 8.5 });

  spacer(state, 10);
  signature(state, { place: `${data.organizationName}`, signerTitle: "NGƯỜI NỘP THUẾ" });
}
