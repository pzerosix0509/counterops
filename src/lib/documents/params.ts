import type { DocumentParams } from "@/server/documents/types";

export interface DefaultsInput {
  branchName?: string | null;
  businessStartDate?: string | null;
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function defaultParams(documentId: string, input: DefaultsInput = {}): DocumentParams {
  const year = new Date().getFullYear();
  const base: DocumentParams = { year, signatureDate: todayIsoDate(), lanDau: true };
  switch (documentId) {
    case "01-tb-ddkd":
      return {
        ...base,
        thongBaoType: "thanh_lap",
        locationName: input.branchName ?? "",
        locationStartDate: input.businessStartDate ?? "",
        ecommerceOnly: false,
      };
    case "01-tkn-cnkd":
      return { ...base, keKhaiType: "duoi_1ty", ecommerceOnly: false };
    case "01-cnkd": {
      const month = new Date().getMonth() + 1;
      return { ...base, kyTinhThue: "thang", kyThang: month, kyQuy: Math.ceil(month / 3), doiTuong: "doanh_thu" };
    }
    case "02-cnkd-tncn-qtt":
      return { ...base, giamThue: false };
    case "01-bk-stk":
      return { ...base };
    default:
      return base;
  }
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(max, Math.max(min, Math.round(value)));
  }
  return Math.min(max, Math.max(min, fallback));
}

/** Coerce client-supplied params into a safe DocumentParams shape. */
export function normalizeDocumentParams(input: unknown): DocumentParams {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const result: DocumentParams = {
    year: clampInt(raw.year, new Date().getFullYear(), 2000, 2100),
    signatureDate:
      typeof raw.signatureDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.signatureDate)
        ? raw.signatureDate
        : todayIsoDate(),
    lanDau: raw.lanDau !== false,
  };

  if (typeof raw.thongBaoType === "string") result.thongBaoType = raw.thongBaoType as DocumentParams["thongBaoType"];
  if (typeof raw.locationName === "string") result.locationName = raw.locationName;
  if (typeof raw.locationStartDate === "string") result.locationStartDate = raw.locationStartDate;
  result.ecommerceOnly = raw.ecommerceOnly === true;
  if (typeof raw.keKhaiType === "string") result.keKhaiType = raw.keKhaiType as DocumentParams["keKhaiType"];
  if (typeof raw.kyTinhThue === "string") result.kyTinhThue = raw.kyTinhThue as DocumentParams["kyTinhThue"];
  if (typeof raw.kyThang === "number") result.kyThang = clampInt(raw.kyThang, 0, 1, 12);
  if (typeof raw.kyQuy === "number") result.kyQuy = clampInt(raw.kyQuy, 0, 1, 4);
  if (typeof raw.doiTuong === "string") result.doiTuong = raw.doiTuong;
  result.giamThue = raw.giamThue === true;
  if (typeof raw.revenue === "number" && Number.isFinite(raw.revenue) && raw.revenue >= 0) {
    result.revenue = Math.round(raw.revenue);
  }
  return result;
}
