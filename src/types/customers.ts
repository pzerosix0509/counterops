import type { RfmSegment } from "@/types/analytics";

export type RecencyBucket = "recent" | "at_risk" | "dormant";
export type CustomerSort = "monetary" | "recency" | "frequency" | "name" | "created_at";
export type SegmentFilter = RfmSegment | "unclassified";
export type ClusterFilter = number | "unassigned";

export interface CustomerListFilters {
  search?: string;
  segment?: SegmentFilter;
  cluster?: ClusterFilter;
  recency?: RecencyBucket;
  sort: CustomerSort;
  dir: "asc" | "desc";
}

export interface CustomerIdentity {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CustomerFeatureSlice {
  recencyDays: number | null;
  frequency: number | null;
  monetary: number | null;
  rScore: number | null;
  fScore: number | null;
  mScore: number | null;
  rfmSegment: RfmSegment | null;
  clusterId: number | null;
  avgRating: number | null;
  sentimentScore: number | null;
  weekendRatio: number | null;
  dinnerRatio: number | null;
  favoriteCategory: string | null;
  favoriteDishId: string | null;
  favoriteDishName: string | null;
  computedAt: string | null;
}

export interface CustomerListRow extends CustomerIdentity {
  displayName: string;
  recencyDays: number | null;
  frequency: number | null;
  monetary: number | null;
  rfmSegment: RfmSegment | null;
  clusterId: number | null;
  avgRating: number | null;
}

export interface CustomerRecentOrder {
  id: string;
  orderNumber: string;
  totalAmount: number;
  openedAt: string;
  closedAt: string | null;
}

export interface CustomerRecentFeedback {
  id: string;
  rating: number;
  feedbackText: string | null;
  sentimentLabel: string | null;
  createdAt: string;
}

export interface CustomerDetail extends CustomerIdentity {
  displayName: string;
  features: CustomerFeatureSlice | null;
  recentOrders: CustomerRecentOrder[];
  recentFeedback: CustomerRecentFeedback[];
}

export interface CustomerListResult {
  rows: CustomerListRow[];
  total: number;
  clusterIds: number[];
}
