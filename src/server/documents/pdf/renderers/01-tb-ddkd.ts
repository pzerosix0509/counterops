import { type PageState, field, sectionTitle, checkRow, spacer, paragraph, drawFormHeader, signature } from "../layout";
import type { DocumentData } from "../../types";

const THONG_BAO_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "thanh_lap", label: "Thành lập địa điểm kinh doanh" },
  { key: "thay_doi", label: "Thay đổi thông tin" },
  { key: "tam_ngung", label: "Tạm ngừng kinh doanh" },
  { key: "khoi_phuc", label: "Khôi phục tạm ngừng kinh doanh trước thời hạn đã thông báo" },
  { key: "cham_dut", label: "Chấm dứt hoạt động" },
];

function empty(value: string | null | undefined): string {
  return value || "…";
}

export function render01TbDdkd(state: PageState, data: DocumentData): void {
  drawFormHeader(state, {
    formCode: "01/TB-ĐĐKD",
    circular: "Thông tư số 18/2026/TT-BTC ngày 05/3/2026 của Bộ trưởng Bộ Tài chính",
    title: "THÔNG BÁO",
    subtitle: "Về việc thành lập/thay đổi thông tin/tạm ngừng/chấm dứt hoạt động đối với địa điểm kinh doanh",
  });

  paragraph(state, "Kính gửi: (Cơ quan thuế quản lý trực tiếp NNT)", { size: 10 });
  spacer(state, 6);

  field(state, "1. Người nộp thuế:", data.organizationName);
  field(state, "2. Mã số thuế:", empty(data.taxCode));
  spacer(state, 4);
  paragraph(state, "3. Thông tin đại lý thuế (nếu có):", { size: 10, font: "sansBold" });
  field(state, "3a. Tên:", "…");
  field(state, "3b. Mã số thuế:", "…");
  spacer(state, 4);

  paragraph(state, "Thông báo về việc thành lập/thay đổi thông tin/tạm ngừng/khôi phục tạm ngừng kinh doanh trước thời hạn/chấm dứt hoạt động địa điểm kinh doanh như sau:", { size: 9.5 });
  const selected = data.params.thongBaoType ?? "thanh_lap";
  for (const option of THONG_BAO_OPTIONS) {
    checkRow(state, option.label, option.key === selected, { indent: 8 });
  }
  spacer(state, 6);

  sectionTitle(state, "1. Thành lập địa điểm kinh doanh");
  field(state, "Tên địa điểm kinh doanh:", empty(data.params.locationName || data.branchName));
  checkRow(state, "Hình thức kinh doanh thương mại điện tử", Boolean(data.params.ecommerceOnly));
  field(state, "Ngày bắt đầu hoạt động:", empty(data.params.locationStartDate || data.businessStartDate));
  field(state, "Ngành nghề kinh doanh chính:", empty(data.businessLine));
  spacer(state, 2);
  paragraph(state, "Địa chỉ địa điểm kinh doanh:", { size: 9.5, font: "sansBold" });
  field(state, "Số nhà, đường phố (thôn/xóm):", empty(data.streetAddress));
  field(state, "Xã/Phường/Đặc khu:", empty(data.commune));
  field(state, "Quận/Huyện:", empty(data.district));
  field(state, "Tỉnh/thành phố:", empty(data.province));
  field(state, "Mã định danh địa điểm (nếu có):", "…");

  spacer(state, 8);
  signature(state, { place: `${data.organizationName}`, signerTitle: "NGƯỜI NỘP THUẾ" });
}
