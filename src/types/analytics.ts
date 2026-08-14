export type RfmSegment =
  | "Champions"
  | "Loyal Customers"
  | "Potential Loyalists"
  | "At Risk"
  | "Lost";

export interface RfmRule {
  segment: RfmSegment;
  rMin: number;
  rMax: number;
  fMin: number;
  fMax: number;
  mMin: number;
  mMax: number;
  priority: number;
}

export interface CustomerRfmInput {
  customerId: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
}

export interface RfmScoredCustomer extends CustomerRfmInput {
  rScore: number;
  fScore: number;
  mScore: number;
  segment: RfmSegment;
}

export interface RfmSummaryRow {
  segment: RfmSegment | null;
  customerCount: number;
  avgMonetary: number;
}

export interface RfmCustomerRow {
  customerId: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
  rScore: number | null;
  fScore: number | null;
  mScore: number | null;
  segment: RfmSegment | null;
}

export interface FeedbackListRow {
  id: string;
  rating: number;
  feedbackText: string | null;
  sentimentLabel: string | null;
  sentimentScore: number | null;
  createdAt: string;
}

export interface SentimentSummary {
  positive: number;
  neutral: number;
  negative: number;
}

export interface ClusterProfileRow {
  cluster_id: number;
  size: number;
  avg_recency: number;
  avg_frequency: number;
  avg_monetary: number;
  dinner_ratio: number;
  weekend_ratio: number;
  top_category: string | null;
  label: string;
}

export interface ClusterCustomerRow {
  customerId: string;
  clusterId: number | null;
  rfmSegment: RfmSegment | null;
  recencyDays: number;
  frequency: number;
  monetary: number;
}

export interface CustomerClustersView {
  k: number;
  silhouette: number | null;
  fittedAt: string | null;
  profiles: ClusterProfileRow[];
  customers: ClusterCustomerRow[];
  reminder: string;
}
