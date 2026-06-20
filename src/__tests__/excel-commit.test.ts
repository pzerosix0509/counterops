import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

type Call = { table: string; op: string; payload: unknown };

const callLog: Call[] = [];
let returnExistingInventoryItems = false;

function fromMock(table: string) {
  const builder: any = {
    select: (_cols?: string) => builder,
    insert: (rows: unknown) => {
      const list = Array.isArray(rows) ? rows : [rows];
      for (const r of list) callLog.push({ table, op: "insert", payload: r });
      return {
        select: () => ({
          single: async () => ({ data: { id: table + "-new" }, error: null }),
        }),
      };
    },
    update: (patch: unknown) => {
      callLog.push({ table, op: "update", payload: patch });
      return builder;
    },
    upsert: async (rows: unknown) => {
      const list = Array.isArray(rows) ? rows : [rows];
      for (const r of list) callLog.push({ table, op: "upsert", payload: r });
      return { data: null, error: null };
    },
    eq: () => builder,
    in: (_col: string, values: unknown) => {
      builder._inValues = values;
      return builder;
    },
    maybeSingle: async () => {
      if (table === "inventory_items") {
        const codes = (builder._inValues as string[] | undefined) ?? [];
        const data = codes.map((code) => ({ id: "i-" + code, code }));
        return { data: data.length ? data : null, error: null };
      }
      return { data: null, error: null };
    },
  };
  builder.then = (resolve: (v: unknown) => void) => {
    if (returnExistingInventoryItems && table === "inventory_items" && Array.isArray(builder._inValues)) {
      const data = (builder._inValues as string[]).map((code) => ({ id: "i-" + code, code }));
      resolve({ data });
      return;
    }
    resolve({ data: null });
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => fromMock(table),
  }),
}));

import { commitProducts, commitInventoryItems, commitInventoryMovements, type ImportPreview } from "@/server/excel/imports";

beforeEach(() => {
  callLog.length = 0;
  returnExistingInventoryItems = false;
});

function fakePreview<T>(rows: Array<{ rowNumber: number; data: T }>, fileName = "test.xlsx"): ImportPreview<T> {
  return {
    totalRows: rows.length,
    validCount: rows.length,
    errorCount: 0,
    cleaned: rows,
    errors: [],
    commitToken: "tok",
    fileName,
  };
}

describe("commitProducts", () => {
  it("creates new products and writes an audit log", async () => {
    const preview = fakePreview([
      { rowNumber: 2, data: { code: "CF-001", name: "Ca phe sua", category: "Do uong", menuType: "drink", productType: "regular", costPrice: 8000, salePrice: 25000, unit: "ly", description: null, imageUrl: null, isActive: true } },
    ]);
    const res = await commitProducts("org-1", "user-1", preview as unknown as ImportPreview<unknown>);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.created).toBe(1);
    expect(res.data.updated).toBe(0);
    const inserts = callLog.filter((c) => c.op === "insert");
    expect(inserts.length).toBe(3);
    const tables = inserts.map((c) => c.table);
    expect(tables).toContain("products");
    expect(tables).toContain("audit_logs");
    expect(tables).toContain("menu_categories");
  });
});

describe("commitInventoryItems", () => {
  it("creates an inventory item with initial balance and movement", async () => {
    const preview = fakePreview([
      {
        rowNumber: 2,
        data: {
          code: "NL-001",
          name: "Ca phe hat",
          itemType: "ingredient",
          unit: "g",
          costPrice: 200,
          description: null,
          imageUrl: null,
          initialQuantity: 5000,
          lowStockThreshold: 1000,
        },
      },
    ]);
    const res = await commitInventoryItems("org-1", "branch-1", "user-1", preview as unknown as ImportPreview<unknown>);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.created).toBe(1);
    const tables = callLog.map((c) => c.table);
    expect(tables).toContain("inventory_items");
    expect(tables).toContain("inventory_balances");
    expect(tables).toContain("inventory_movements");
    expect(tables).toContain("audit_logs");
  });

  it("skips initial movement when initialQuantity is 0", async () => {
    const preview = fakePreview([
      {
        rowNumber: 2,
        data: {
          code: "NL-001",
          name: "Ca phe hat",
          itemType: "ingredient",
          unit: "g",
          costPrice: 200,
          description: null,
          imageUrl: null,
          initialQuantity: 0,
          lowStockThreshold: 0,
        },
      },
    ]);
    await commitInventoryItems("org-1", "branch-1", "user-1", preview as unknown as ImportPreview<unknown>);
    const movementInserts = callLog.filter((c) => c.table === "inventory_movements" && c.op === "insert");
    expect(movementInserts.length).toBe(0);
  });
});

describe("commitInventoryMovements", () => {
  it("rejects negative-out movement when allow_negative_inventory=false", async () => {
    returnExistingInventoryItems = true;
    const preview = fakePreview([
      {
        rowNumber: 2,
        data: {
          itemCode: "NL-001",
          movementType: "waste",
          direction: "out",
          quantity: 100,
          unitCost: 0,
          note: null,
          movementDate: null,
        },
      },
    ]);
    const res = await commitInventoryMovements("org-1", "branch-1", "user-1", false, preview as unknown as ImportPreview<unknown>);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.written).toBe(0);
    expect(res.data.skipped.some((s) => s.toLowerCase().includes("không đủ"))).toBe(true);
  });

  it("allows negative-out movement when allow_negative_inventory=true", async () => {
    returnExistingInventoryItems = true;
    const preview = fakePreview([
      {
        rowNumber: 2,
        data: {
          itemCode: "NL-001",
          movementType: "waste",
          direction: "out",
          quantity: 100,
          unitCost: 0,
          note: null,
          movementDate: null,
        },
      },
    ]);
    const res = await commitInventoryMovements("org-1", "branch-1", "user-1", true, preview as unknown as ImportPreview<unknown>);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.written).toBe(1);
    const mv = callLog.find((c) => c.table === "inventory_movements" && c.op === "insert");
    expect(mv).toBeTruthy();
    expect((mv!.payload as { quantity_delta: number }).quantity_delta).toBe(-100);
  });

  it("accepts positive direction in/out aliases", async () => {
    returnExistingInventoryItems = true;
    const preview = fakePreview([
      {
        rowNumber: 2,
        data: {
          itemCode: "NL-001",
          movementType: "purchase",
          direction: "+",
          quantity: 50,
          unitCost: 10,
          note: null,
          movementDate: null,
        },
      },
    ]);
    const res = await commitInventoryMovements("org-1", "branch-1", "user-1", false, preview as unknown as ImportPreview<unknown>);
    if (res.ok) {
      expect(res.data.written).toBe(1);
      const mv = callLog.find((c) => c.table === "inventory_movements" && c.op === "insert");
      expect((mv!.payload as { quantity_delta: number }).quantity_delta).toBe(50);
    }
  });
});

