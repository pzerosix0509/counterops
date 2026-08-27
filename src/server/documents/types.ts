import type { MembershipRole } from "@/types/database";

export type DocumentCategory =
  | "dia-diem-kinh-doanh"
  | "ke-khai-thue"
  | "tai-khoan-ngan-hang"
  | "hoan-thue";

export interface DocumentDefinition {
  id: string;
  formCode: string;
  title: string;
  description: string;
  circular: string;
  category: DocumentCategory;
  fileName: string;
  allowedRoles: MembershipRole[];
}

/** Per-document, non-persistent fields the user can adjust before generating. */
export interface DocumentParams {
  year: number;
  signatureDate: string;
  /** 01/TB-ĐĐKD */
  thongBaoType?: "thanh_lap" | "thay_doi" | "tam_ngung" | "khoi_phuc" | "cham_dut";
  locationName?: string;
  locationStartDate?: string;
  ecommerceOnly?: boolean;
  /** 01/TKN-CNKD, 02/CNKD-TNCN-QTT */
  lanDau?: boolean;
  /** 01/TKN-CNKD */
  keKhaiType?: "duoi_1ty" | "moi_ra" | "hoan_thue" | "khac";
  /** 01/CNKD */
  kyTinhThue?: "thang" | "quy" | "lan_phat_sinh";
  kyThang?: number | null;
  kyQuy?: number | null;
  doiTuong?: string;
  /** 02/CNKD-TNCN-QTT */
  giamThue?: boolean;
  /** Optional manual override of the DB-computed revenue (đơn vị: đồng). */
  revenue?: number | null;
}

/** All data merged together and passed to the PDF renderers. */
export interface DocumentData {
  organizationName: string;
  taxCode: string | null;
  streetAddress: string | null;
  commune: string | null;
  district: string | null;
  province: string | null;
  phone: string | null;
  businessLine: string | null;
  businessStartDate: string | null;
  accountHolderName: string | null;
  bankCode: string | null;
  bankAccountNumber: string | null;
  branchName: string | null;
  branchAddress: string | null;
  revenue: number;
  params: DocumentParams;
}

export type GenerationPhase = "authenticating" | "loading-data" | "rendering" | "finalizing";

export const GENERATION_PHASES: Array<{ key: GenerationPhase; label: string }> = [
  { key: "authenticating", label: "Đang xác thực phiên làm việc" },
  { key: "loading-data", label: "Đang tải dữ liệu từ hệ thống" },
  { key: "rendering", label: "Đang tạo tài liệu" },
  { key: "finalizing", label: "Đang hoàn tất bản xem trước" },
];
