import { displayCustomerName } from "@/lib/customers/phone";
import { RFM_SEGMENTS } from "@/lib/customers/labels";
import type { RfmSegment } from "@/types/analytics";
import type {
  CustomerIdentity,
  CustomerListFilters,
  CustomerListRow,
  CustomerSort,
  RecencyBucket,
  SegmentFilter,
} from "@/types/customers";

export const DEFAULT_CUSTOMER_FILTERS: CustomerListFilters = {
  sort: "monetary",
  dir: "desc",
};

export interface CustomerFeatureJoin {
  customerId: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
  rfmSegment: RfmSegment | null;
  clusterId: number | null;
  avgRating: number | null;
}

function asRfmSegment(value: string | null | undefined): RfmSegment | null {
  if (!value) return null;
  return RFM_SEGMENTS.includes(value as RfmSegment) ? (value as RfmSegment) : null;
}

function matchesRecency(days: number | null, bucket: RecencyBucket): boolean {
  if (days == null) return false;
  if (bucket === "recent") return days <= 30;
  if (bucket === "at_risk") return days >= 31 && days <= 90;
  return days > 90;
}

function cmpNullableNumber(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

function sortValue(row: CustomerListRow, sort: CustomerSort): number | string | null {
  switch (sort) {
    case "monetary":
      return row.monetary;
    case "recency":
      return row.recencyDays;
    case "frequency":
      return row.frequency;
    case "name":
      return row.displayName;
    case "created_at":
      return row.createdAt;
  }
}

export function mergeCustomerRows(
  customers: CustomerIdentity[],
  features: CustomerFeatureJoin[],
): CustomerListRow[] {
  const byCustomer = new Map(features.map((row) => [row.customerId, row]));
  return customers.map((customer) => {
    const feature = byCustomer.get(customer.id);
    return {
      ...customer,
      displayName: displayCustomerName(customer.name, customer.phone),
      recencyDays: feature?.recencyDays ?? null,
      frequency: feature?.frequency ?? null,
      monetary: feature?.monetary ?? null,
      rfmSegment: feature?.rfmSegment ?? null,
      clusterId: feature?.clusterId ?? null,
      avgRating: feature?.avgRating ?? null,
    };
  });
}

export function filterAndSortCustomerRows(
  rows: CustomerListRow[],
  filters: CustomerListFilters,
): CustomerListRow[] {
  const search = filters.search?.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (search) {
      const name = row.displayName.toLowerCase();
      const phone = (row.phone ?? "").toLowerCase();
      if (!name.includes(search) && !phone.includes(search)) return false;
    }
    if (filters.segment === "unclassified" && row.rfmSegment != null) return false;
    if (filters.segment && filters.segment !== "unclassified" && row.rfmSegment !== filters.segment) return false;
    if (filters.cluster === "unassigned" && row.clusterId != null) return false;
    if (typeof filters.cluster === "number" && row.clusterId !== filters.cluster) return false;
    if (filters.recency && !matchesRecency(row.recencyDays, filters.recency)) return false;
    return true;
  });

  const dir = filters.dir === "asc" ? 1 : -1;
  return filtered.slice().sort((a, b) => {
    const av = sortValue(a, filters.sort);
    const bv = sortValue(b, filters.sort);
    if (typeof av === "string" || typeof bv === "string") {
      return String(av ?? "").localeCompare(String(bv ?? ""), "vi") * dir;
    }
    return cmpNullableNumber(av, bv, dir);
  });
}

export function clusterIdsFromFeatures(features: { clusterId: number | null }[]): number[] {
  const ids = new Set<number>();
  for (const row of features) {
    if (row.clusterId != null) ids.add(row.clusterId);
  }
  return Array.from(ids).sort((a, b) => a - b);
}

export function parseCustomerListFilters(params: {
  q?: string;
  segment?: string;
  cluster?: string;
  recency?: string;
  sort?: string;
  dir?: string;
}): CustomerListFilters {
  const search = params.q?.trim() || undefined;
  let segment: SegmentFilter | undefined;
  if (params.segment === "unclassified") segment = "unclassified";
  else if (params.segment && asRfmSegment(params.segment)) segment = asRfmSegment(params.segment)!;

  let cluster: CustomerListFilters["cluster"];
  if (params.cluster === "unassigned") cluster = "unassigned";
  else if (params.cluster != null && params.cluster !== "") {
    const parsed = Number(params.cluster);
    if (Number.isInteger(parsed) && parsed >= 0) cluster = parsed;
  }

  const recency = params.recency === "recent" || params.recency === "at_risk" || params.recency === "dormant"
    ? params.recency
    : undefined;
  const sort: CustomerSort =
    params.sort === "recency"
    || params.sort === "frequency"
    || params.sort === "name"
    || params.sort === "created_at"
      ? params.sort
      : "monetary";
  const dir = params.dir === "asc" ? "asc" : "desc";
  return { search, segment, cluster, recency, sort, dir };
}

export function asRfmSegmentValue(value: string | null | undefined): RfmSegment | null {
  return asRfmSegment(value);
}
