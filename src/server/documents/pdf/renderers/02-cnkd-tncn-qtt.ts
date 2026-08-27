import { type PageState, field, sectionTitle, checkRow, spacer, paragraph, drawFormHeader, signature, table, formatMoney } from "../layout";
import type { DocumentData } from "../../types";

function empty(value: string | null | undefined): string {
  return value || "…";
}

export function render02CnkdTncnQtt(state: PageState, data: DocumentData): void {
  const { params } = data;
  const revenue = data.revenue;
  const fixedRevenue = params.ecommerceOnly ? 0 : revenue;
  const ecommerceRevenue = params.ecommerceOnly ? revenue : 0;

  drawFormHeader(state, {
    formCode: "02/CNKD-TNCN-QTT",
    circular: "Thông tư số 89/2026/TT-BTC ngày 30 tháng 6 năm 2026 của Bộ trưởng Bộ Tài chính",
    title: "TỜ KHAI QUYẾT TOÁN THUẾ THU NHẬP CÁ NHÂN",
    subtitle: "(Áp dụng cho hộ kinh doanh, cá nhân kinh doanh thực hiện nộp thuế thu nhập cá nhân trên thu nhập tính thuế)",
  });

  field(state, "[01] Kỳ tính thuế:", `Năm ${params.year}`);
  field(state, "[02] Lần đầu:", params.lanDau === false ? "☐" : "☑");
  field(state, "[03] Bổ sung lần thứ:", "…");
  checkRow(state, "Giảm thuế do thiên tai, dịch bệnh, hỏa hoạn, tai nạn và bệnh hiểm nghèo", Boolean(params.giamThue), { indent: 8 });
  spacer(state, 4);

  field(state, "[04] Người nộp thuế:", data.organizationName);
  field(state, "[05] Mã số thuế:", empty(data.taxCode));
  field(state, "[06] Địa chỉ trụ sở kinh doanh:", data.streetAddress || "…");
  field(state, "[06.1] Số nhà, đường phố/xóm/ấp/thôn:", empty(data.streetAddress));
  field(state, "[06.2] Xã/phường/đặc khu:", empty(data.commune));
  field(state, "[06.3] Tỉnh/TP:", empty(data.province));
  field(state, "[07] Tổ chức/cá nhân khai, nộp thuế thay theo ủy quyền (nếu có):", "…");
  field(state, "[08] Tên tổ chức, cá nhân cung cấp dịch vụ làm thủ tục về thuế (nếu có):", "…");

  sectionTitle(state, "A. KÊ KHAI THÔNG TIN TÍNH THUẾ");
  paragraph(state, "Đơn vị tiền: Đồng Việt Nam", { size: 9 });

  table(
    state,
    [
      { header: "STT", width: 34, align: "center" },
      { header: "Chỉ tiêu", width: 300 },
      { header: "Mã chỉ tiêu", width: 70, align: "center" },
      { header: "Số tiền (đồng)", width: 106, align: "right" },
    ],
    [
      ["1", "Doanh thu bán hàng hoá và cung cấp dịch vụ [09] = [09a] + [09b] + [09c]", "[09]", revenue ? formatMoney(revenue) : ""],
      ["1.1", "Doanh thu từ hoạt động sản xuất kinh doanh không bao gồm các hoạt động trên nền tảng TMĐT, nền tảng số", "[09a]", fixedRevenue ? formatMoney(fixedRevenue) : ""],
      ["1.2", "Doanh thu từ hoạt động kinh doanh trên nền tảng TMĐT, nền tảng số", "[09b]", ecommerceRevenue ? formatMoney(ecommerceRevenue) : ""],
      ["2", "Chi phí được trừ", "[10]", ""],
      ["3", "Thu nhập tính thuế [12] = [09] - [10]", "[12]", ""],
      ["4", "Thuế TNCN phải nộp", "[13]", ""],
    ]
  );

  spacer(state, 6);
  paragraph(state, `Năm quyết toán: ${params.year}.`, { size: 9 });
  paragraph(state, "Số thuế TNCN phải nộp: … (tính theo biểu thuế theo quy định).", { size: 9 });
  paragraph(state, "Số thuế TNCN nộp thừa (nếu có): …", { size: 9 });

  spacer(state, 10);
  signature(state, { place: `${data.organizationName}`, signerTitle: "NGƯỜI NỘP THUẾ hoặc ĐẠI DIỆN HỢP PHÁP CỦA NGƯỜI NỘP THUẾ" });
}
