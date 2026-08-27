import { type PageState, field, sectionTitle, checkRow, spacer, paragraph, drawFormHeader, signature, table, formatMoney } from "../layout";
import type { DocumentData } from "../../types";

const KHAI_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "duoi_1ty", label: "Hộ kinh doanh, cá nhân kinh doanh có doanh thu năm từ 01 tỷ đồng trở xuống" },
  { key: "moi_ra", label: "Hộ kinh doanh, cá nhân kinh doanh mới ra kinh doanh có doanh thu năm từ 01 tỷ đồng trở xuống" },
  { key: "hoan_thue", label: "Hộ kinh doanh, cá nhân kinh doanh nộp thuế TNCN theo phương pháp thuế suất nhân với doanh thu tính thuế đề nghị hoàn thuế" },
  { key: "khac", label: "Cá nhân hợp tác kinh doanh với tổ chức; cá nhân làm đại lý bán đúng giá đối với hoạt động bảo hiểm, xổ số, bán hàng đa cấp; cá nhân thực hiện hoạt động môi giới thuộc trường hợp phải nộp thuế mà chưa được tổ chức khấu trừ thuế, khai thuế thay, nộp thuế thay trong năm" },
];

function empty(value: string | null | undefined): string {
  return value || "…";
}

export function render01TknCnkd(state: PageState, data: DocumentData): void {
  const { params } = data;
  const revenue = data.revenue;
  const fixedRevenue = params.ecommerceOnly ? 0 : revenue;
  const ecommerceRevenue = params.ecommerceOnly ? revenue : 0;

  drawFormHeader(state, {
    formCode: "01/TKN-CNKD",
    circular: "Thông tư số 89/2026/TT-BTC ngày 30 tháng 6 năm 2026 của Bộ trưởng Bộ Tài chính",
    title: "THÔNG BÁO DOANH THU/TỜ KHAI THUẾ NĂM",
    subtitle:
      "(Áp dụng đối với hộ kinh doanh, cá nhân kinh doanh có doanh thu năm từ 01 tỷ đồng trở xuống; hộ kinh doanh, cá nhân kinh doanh nộp thuế TNCN theo phương pháp thuế suất nhân với doanh thu tính thuế đề nghị hoàn thuế...)",
  });

  for (const option of KHAI_OPTIONS) {
    checkRow(state, option.label, option.key === (params.keKhaiType ?? "duoi_1ty"));
  }
  spacer(state, 6);

  field(state, "[01] Kỳ tính thuế:", `[01a] Năm ${params.year}`);
  field(state, "[02] Lần đầu:", params.lanDau === false ? "☐" : "☑");
  field(state, "[03] Bổ sung lần thứ:", params.lanDau === false ? "…" : "…");
  spacer(state, 4);

  field(state, "[04] Người nộp thuế:", data.organizationName);
  field(state, "[05] Mã số thuế:", empty(data.taxCode));
  field(state, "[06] Tổ chức/cá nhân kê khai, nộp thuế thay theo ủy quyền (nếu có):", "…");
  field(state, "[07] Tên tổ chức, cá nhân cung cấp dịch vụ làm thủ tục về thuế (nếu có):", "…");

  sectionTitle(state, "A. XÁC ĐỊNH NGHĨA VỤ THUẾ GTGT, TNCN");
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
        "Hoạt động sản xuất, kinh doanh hàng hóa, cung cấp dịch vụ có địa điểm kinh doanh cố định",
        "[08]",
        fixedRevenue ? formatMoney(fixedRevenue) : "",
        "",
        "",
      ],
      [
        "2",
        "Hoạt động kinh doanh trên nền tảng thương mại điện tử, nền tảng số khác",
        "[09]",
        ecommerceRevenue ? formatMoney(ecommerceRevenue) : "",
        "",
        "",
      ],
      [
        "6",
        "Tổng cộng",
        "[13]",
        revenue ? formatMoney(revenue) : "",
        "",
        "",
      ],
    ]
  );

  spacer(state, 6);
  paragraph(state, `Năm tính thuế: ${params.year}.`, { size: 9 });
  paragraph(state, "Số thuế GTGT, TNCN phải nộp: … (kê khai theo quy định tại Thông tư số 89/2026/TT-BTC).", { size: 9 });
  paragraph(state, "Số thuế nộp thừa (nếu có): …", { size: 9 });

  spacer(state, 10);
  signature(state, { place: `${data.organizationName}`, signerTitle: "NGƯỜI NỘP THUẾ hoặc ĐẠI DIỆN HỢP PHÁP CỦA NGƯỜI NỘP THUẾ" });
}
