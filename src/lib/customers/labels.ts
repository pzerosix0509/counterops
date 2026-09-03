import type { RfmSegment } from "@/types/analytics";

export const RFM_SEGMENTS: RfmSegment[] = [
  "Champions",
  "Loyal Customers",
  "Potential Loyalists",
  "At Risk",
  "Lost",
];

export const SEGMENT_LABELS: Record<RfmSegment, string> = {
  Champions: "Champion",
  "Loyal Customers": "Khách thân thiết",
  "Potential Loyalists": "Tiềm năng trung thành",
  "At Risk": "Sắp mất",
  Lost: "Đã mất",
};

export const SEGMENT_VARIANT: Record<RfmSegment, "success" | "info" | "secondary" | "warning" | "danger"> = {
  Champions: "success",
  "Loyal Customers": "info",
  "Potential Loyalists": "secondary",
  "At Risk": "warning",
  Lost: "danger",
};

export function rfmSegmentLabel(segment: RfmSegment | null | undefined): string {
  if (!segment) return "Chưa phân loại";
  return SEGMENT_LABELS[segment];
}

export function clusterLabel(clusterId: number | null | undefined): string {
  if (clusterId == null) return "—";
  return `Nhóm ${clusterId + 1}`;
}
