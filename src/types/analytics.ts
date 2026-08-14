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
