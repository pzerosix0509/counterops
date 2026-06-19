export type DateRangePreset = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function getPresetRange(preset: DateRangePreset, now: Date = new Date()): DateRange {
  const today = startOfDay(now);
  switch (preset) {
    case "today":
      return { from: today, to: endOfDay(now), label: "Hôm nay" };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: y, to: endOfDay(y), label: "Hôm qua" };
    }
    case "last7": {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from, to: endOfDay(now), label: "7 ngày qua" };
    }
    case "thisMonth": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from, to: endOfDay(now), label: "Tháng này" };
    }
    case "lastMonth": {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from, to: endOfDay(to), label: "Tháng trước" };
    }
    case "custom":
    default:
      return { from: today, to: endOfDay(now), label: "Tùy chọn" };
  }
}

export function parseDateRangeSearchParams(params: URLSearchParams): DateRange {
  const preset = (params.get("range") as DateRangePreset) || "today";
  const range = getPresetRange(preset);
  const fromParam = params.get("from");
  const toParam = params.get("to");
  if (preset === "custom" && fromParam && toParam) {
    const f = new Date(fromParam);
    const t = new Date(toParam);
    if (!isNaN(f.valueOf()) && !isNaN(t.valueOf())) {
      return { from: startOfDay(f), to: endOfDay(t), label: "Tùy chọn" };
    }
  }
  return range;
}

export function formatVND(amount: number): string {
  return amount.toLocaleString("vi-VN") + " đ";
}
