import { describe, expect, it } from "vitest";
import { displayCustomerName, resolveUpdatedPhone } from "@/lib/customers/phone";
import {
  clusterIdsFromFeatures,
  filterAndSortCustomerRows,
  mergeCustomerRows,
  parseCustomerListFilters,
  type CustomerFeatureJoin,
} from "@/lib/customers/list";
import type { CustomerIdentity } from "@/types/customers";

function customer(partial: Partial<CustomerIdentity> & { id: string }): CustomerIdentity {
  return {
    name: null,
    phone: null,
    email: null,
    birthday: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function feature(partial: Partial<CustomerFeatureJoin> & { customerId: string }): CustomerFeatureJoin {
  return {
    recencyDays: 10,
    frequency: 2,
    monetary: 100_000,
    rfmSegment: "Champions",
    clusterId: 0,
    avgRating: 4.5,
    ...partial,
  };
}

describe("mergeCustomerRows", () => {
  it("joins features and falls back to display name", () => {
    const rows = mergeCustomerRows(
      [customer({ id: "a", phone: "0901234567" }), customer({ id: "b", name: "An" })],
      [feature({ customerId: "a", monetary: 50_000, rfmSegment: "At Risk" })],
    );
    expect(rows[0].displayName).toBe("Khách 4567");
    expect(rows[0].monetary).toBe(50_000);
    expect(rows[0].rfmSegment).toBe("At Risk");
    expect(rows[1].displayName).toBe("An");
    expect(rows[1].rfmSegment).toBeNull();
    expect(rows[1].monetary).toBeNull();
  });
});

describe("filterAndSortCustomerRows", () => {
  const rows = mergeCustomerRows(
    [
      customer({ id: "champ", name: "Lan", phone: "0901111111", createdAt: "2026-03-01T00:00:00Z" }),
      customer({ id: "risk", name: "Minh", phone: "0902222222", createdAt: "2026-02-01T00:00:00Z" }),
      customer({ id: "none", name: "Huy", createdAt: "2026-01-01T00:00:00Z" }),
    ],
    [
      feature({ customerId: "champ", recencyDays: 5, frequency: 8, monetary: 900_000, rfmSegment: "Champions", clusterId: 1 }),
      feature({ customerId: "risk", recencyDays: 45, frequency: 2, monetary: 120_000, rfmSegment: "At Risk", clusterId: null, avgRating: 3 }),
    ],
  );

  it("filters unclassified and search", () => {
    const unclassified = filterAndSortCustomerRows(rows, { sort: "name", dir: "asc", segment: "unclassified" });
    expect(unclassified.map((row) => row.id)).toEqual(["none"]);
    const search = filterAndSortCustomerRows(rows, { sort: "name", dir: "asc", search: "0902" });
    expect(search.map((row) => row.id)).toEqual(["risk"]);
  });

  it("filters recency buckets and cluster", () => {
    const recent = filterAndSortCustomerRows(rows, { sort: "name", dir: "asc", recency: "recent" });
    expect(recent.map((row) => row.id)).toEqual(["champ"]);
    const atRisk = filterAndSortCustomerRows(rows, { sort: "name", dir: "asc", recency: "at_risk" });
    expect(atRisk.map((row) => row.id)).toEqual(["risk"]);
    const unassigned = filterAndSortCustomerRows(rows, { sort: "name", dir: "asc", cluster: "unassigned" });
    expect(unassigned.map((row) => row.id).sort()).toEqual(["none", "risk"]);
  });

  it("sorts monetary desc with nulls last", () => {
    const sorted = filterAndSortCustomerRows(rows, { sort: "monetary", dir: "desc" });
    expect(sorted.map((row) => row.id)).toEqual(["champ", "risk", "none"]);
  });
});

describe("parseCustomerListFilters", () => {
  it("parses known values and ignores junk", () => {
    const parsed = parseCustomerListFilters({
      q: " An ",
      segment: "At Risk",
      cluster: "2",
      recency: "dormant",
      sort: "name",
      dir: "asc",
    });
    expect(parsed).toEqual({
      search: "An",
      segment: "At Risk",
      cluster: 2,
      recency: "dormant",
      sort: "name",
      dir: "asc",
    });
    expect(parseCustomerListFilters({ segment: "nope", cluster: "x", recency: "soon" })).toEqual({
      search: undefined,
      segment: undefined,
      cluster: undefined,
      recency: undefined,
      sort: "monetary",
      dir: "desc",
    });
  });
});

describe("clusterIdsFromFeatures", () => {
  it("returns unique sorted cluster ids", () => {
    expect(clusterIdsFromFeatures([
      { clusterId: 2 },
      { clusterId: null },
      { clusterId: 0 },
      { clusterId: 2 },
    ])).toEqual([0, 2]);
  });
});

describe("displayCustomerName and resolveUpdatedPhone", () => {
  it("displays fallbacks", () => {
    expect(displayCustomerName("  An  ", "0901")).toBe("An");
    expect(displayCustomerName(null, "0901234567")).toBe("Khách 4567");
    expect(displayCustomerName(null, null)).toBe("Khách");
  });

  it("normalizes or rejects phone updates", () => {
    expect(resolveUpdatedPhone("")).toEqual({ ok: true, phone: null });
    expect(resolveUpdatedPhone("0901 234 567")).toEqual({ ok: true, phone: "0901234567" });
    expect(resolveUpdatedPhone("123")).toEqual({ ok: false, message: "Số điện thoại không hợp lệ" });
  });
});
