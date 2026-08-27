import { type PageState, field, sectionTitle, checkRow, spacer, paragraph, drawFormHeader, signature, table, formatMoney } from "../layout";
import type { DocumentData } from "../../types";

const DOI_TUONG_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "doanh_thu", label: "Hộ kinh doanh, cá nhân kinh doanh thuộc đối tượng nộp thuế TNCN trên doanh thu tính thuế" },
  { key: "thu_nhap", label: "Hộ kinh doanh, cá nhân kinh doanh thuộc đối tượng nộp thuế TNCN trên thu nhập tính thuế" },
  { key: "tmdt", label: "Hộ kinh doanh, cá nhân kinh doanh chỉ có hoạt động kinh doanh trên nền tảng thương mại điện tử, nền tảng số khác" },
  { key: "khac", label: "Hộ kinh doanh, cá nhân kinh doanh khai các loại thuế khác (thuế TTĐB, thuế tài nguyên, thuế/phí bảo vệ môi trường)" },
  { key: "hoa_don", label: "Trường hợp đề nghị cấp hóa đơn điện tử có mã của cơ quan thuế theo lần phát sinh" },
];

function empty(value: string | null | undefined): string {
  return value || "…";
}

export function render01Cnkd(state: PageState, data: DocumentData): void {
  const { params } = data;
  const revenue = data.revenue;
  const ky = params.kyTinhThue ?? "thang";

  drawFormHeader(state, {
    formCode: "01/CNKD",
    circular: "Thông tư số 50/2026/TT-BTC ngày 13 tháng 5 năm 2026 của Bộ trưởng Bộ Tài chính",
    title: "TỜ KHAI THUẾ ĐỐI VỚI HỘ KINH DOANH, CÁ NHÂN KINH DOANH",
    subtitle: "(Áp dụng cho hộ kinh doanh, cá nhân kinh doanh có doanh thu năm trên 01 tỷ đồng)",
  });

  for (const option of DOI_TUONG_OPTIONS) {
    checkRow(state, option.label, option.key === (params.doiTuong ?? "doanh_thu"));
  }
  spacer(state, 6);

  const kyLabel =
    ky === "thang"
      ? `[01a] Tháng ${params.kyThang ?? "…"} năm ${params.year}`
      : ky === "quy"
        ? `[01b] Quý ${params.kyQuy ?? "…"} năm ${params.year}`
        : `[01c] Lần phát sinh ${params.year}`;
  field(state, "[01] Kỳ tính thuế:", kyLabel);
  field(state, "[02] Lần đầu:", params.lanDau === false ? "☐" : "☑");
  field(state, "[03] Bổ sung lần thứ:", "…");
  spacer(state, 4);

  field(state, "[04] Người nộp thuế:", data.organizationName);
  field(state, "[05] Mã số thuế:", empty(data.taxCode));
  field(state, "[06] Tổ chức/cá nhân khai, nộp thuế thay theo ủy quyền (nếu có):", "…");
  field(state, "[07] Tên đại lý thuế (nếu có):", "…");

  sectionTitle(state, "A. KÊ KHAI THÔNG TIN TÍNH THUẾ");
  paragraph(state, "Đơn vị tiền: Đồng Việt Nam", { size: 9 });

  table(
    state,
    [
      { header: "STT", width: 34, align: "center" },
      { header: "Chỉ tiêu", width: 230 },
      { header: "Mã chỉ tiêu", width: 78, align: "center" },
      { header: "Doanh thu (đồng)", width: 112, align: "right" },
      { header: "Thuế GTGT (đồng)", width: 76, align: "right" },
      { header: "Thuế TNCN (đồng)", width: 76, align: "right" },
    ],
    [
      [
        "1",
        "Doanh thu bán hàng hóa, cung cấp dịch vụ",
        "[09]",
        revenue ? formatMoney(revenue) : "",
        "",
        "",
      ],
      [
        "1.1",
        "Doanh thu từ hoạt động sản xuất kinh doanh có địa điểm kinh doanh cố định",
        "[09a]",
        params.ecommerceOnly ? "" : revenue ? formatMoney(revenue) : "",
        "",
        "",
      ],
      [
        "1.2",
        "Doanh thu từ hoạt động kinh doanh trên nền tảng TMĐT, nền tảng số khác",
        "[09b]",
        params.ecommerceOnly && revenue ? formatMoney(revenue) : "",
        "",
        "",
      ],
      [
        "",
        "Tổng cộng",
        "[13]",
        revenue ? formatMoney(revenue) : "",
        "",
        "",
      ],
    ]
  );

  spacer(state, 6);
  paragraph(state, `Kỳ tính thuế: ${ky === "thang" ? "tháng" : ky === "quy" ? "quý" : "lần phát sinh"} ${params.year}.`, { size: 9 });
  paragraph(state, "Số thuế GTGT, TNCN phải nộp: … (tính theo tỷ lệ % trên doanh thu theo ngành nghề quy định).", { size: 9 });

  spacer(state, 10);
  signature(state, { place: `${data.organizationName}`, signerTitle: "NGƯỜI NỘP THUẾ hoặc ĐẠI DIỆN HỢP PHÁP CỦA NGƯỜI NỘP THUẾ" });
}
