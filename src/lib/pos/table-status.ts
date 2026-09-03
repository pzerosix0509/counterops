import type { TableStatus } from "@/types/database";

export const STATUS_LABEL: Record<TableStatus, string> = {
  available: "Trống",
  occupied: "Đang dùng",
  reserved: "Đã đặt",
  disabled: "Tạm khoá",
};

export const STATUS_VARIANT: Record<TableStatus, "success" | "warning" | "info" | "outline"> = {
  available: "success",
  occupied: "warning",
  reserved: "info",
  disabled: "outline",
};

export const STATUS_TONE: Record<TableStatus, string> = {
  available: "border-emerald-200 bg-emerald-50",
  occupied: "border-amber-300 bg-amber-50",
  reserved: "border-sky-300 bg-sky-50",
  disabled: "border-slate-200 bg-slate-50 opacity-70",
};

export const STEP_LABELS = {
  service: "Loại dịch vụ",
  table: "Chọn bàn",
  items: "Đơn hàng",
  checkout: "Thông tin & phí",
  payment: "Thanh toán",
} as const;
