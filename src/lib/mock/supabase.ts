// This is the file create the Mock version of supabase/ssr package
// There are various methods that supabase/ssr package use that are implemented here 
// Purpose: 
// For any supabase/ssr package's method used in the codebase, we can replace it with
// the mock version of it here.
// e.g: createMockServerClient can replace the createServerClient in lib/supabase/server.ts
import { MOCK_DATA, MOCK_USER_ID } from "./data";

interface Filter {
  column: string;
  operator: "eq" | "neq" | "in" | "gte" | "lte" | "ilike" | "is";
  value: any;
}

type JoinSpec = {
  table: string;
  type: string;
  columns: string[];
  nested: JoinSpec[];
  alias?: string;
};

function findRel(rootTable: string, targetTable: string): {
  isMulti: boolean;
  fkCol: string;
  pkCol: string;
} | null {
  const belongsTo: Record<string, Record<string, { fkCol: string; pkCol: string }>> = {
    memberships: {
      organizations: { fkCol: "organization_id", pkCol: "id" },
      branches: { fkCol: "branch_id", pkCol: "id" },
    },
    order_items: {
      orders: { fkCol: "order_id", pkCol: "id" },
    },
    orders: {
      dining_tables: { fkCol: "table_id", pkCol: "id" },
    },
    inventory_balances: {
      inventory_items: { fkCol: "inventory_item_id", pkCol: "id" },
    },
    products: {
      menu_categories: { fkCol: "category_id", pkCol: "id" },
    },
  };
  const hasMany: Record<string, Record<string, { fkCol: string; pkCol: string }>> = {
    orders: {
      payments: { fkCol: "order_id", pkCol: "id" },
      order_items: { fkCol: "order_id", pkCol: "id" },
    },
    organizations: {
      branches: { fkCol: "organization_id", pkCol: "id" },
    },
    menu_categories: {
      products: { fkCol: "category_id", pkCol: "id" },
    },
    recipes: {
      recipe_items: { fkCol: "recipe_id", pkCol: "id" },
    },
  };

  const bt = belongsTo[rootTable]?.[targetTable];
  if (bt) return { isMulti: false, ...bt };

  const hm = hasMany[rootTable]?.[targetTable];
  if (hm) return { isMulti: true, ...hm };

  return null;
}

// ── Parenthesis-aware helpers for select parsing ──

function splitTopLevel(s: string, delim: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; current += ch; continue; }
    if (ch === delim && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function findMatchingParen(s: string, openPos: number): number {
  let depth = 1;
  for (let i = openPos + 1; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function parseSelect(colSpec: string): { rootCols: string[]; joins: JoinSpec[] } {
  const allParts = splitTopLevel(colSpec, ",");
  const rootCols: string[] = [];
  const joins: JoinSpec[] = [];

  function parseColumns(innerSpec: string): { plain: string[]; nested: JoinSpec[] } {
    const parts = splitTopLevel(innerSpec, ",");
    const plain: string[] = [];
    const nested: JoinSpec[] = [];
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const parenIdx = trimmed.indexOf("(");
      if (parenIdx > 0 && trimmed.endsWith(")")) {
        const tableName = trimmed.slice(0, parenIdx);
        const inner = trimmed.slice(parenIdx + 1, -1);
        const parsed = parseColumns(inner);
        nested.push({ table: tableName, type: "inner", columns: parsed.plain, nested: parsed.nested });
      } else {
        plain.push(trimmed);
      }
    }
    return { plain, nested };
  }

  for (const raw of allParts) {
    const col = raw.trim();
    if (!col) continue;

    // Check for table!type(cols) syntax — e.g. orders!inner(...)
    const bangIdx = col.search(/!(inner|left|right)\(/);
    if (bangIdx >= 0) {
      const tableName = col.slice(0, bangIdx);
      const typeEnd = col.indexOf("(", bangIdx);
      const joinType = col.slice(bangIdx + 1, typeEnd);
      const closeParen = findMatchingParen(col, typeEnd);
      if (closeParen >= 0) {
        const innerContent = col.slice(typeEnd + 1, closeParen);
        const parsed = parseColumns(innerContent);
        joins.push({ table: tableName, type: joinType, columns: parsed.plain, nested: parsed.nested });
        continue;
      }
    }

    // Check for alias:table(cols) syntax — e.g. organization:organizations(*)
    const aliasMatch = col.match(/^(\w+):(\w+)\(/);
    if (aliasMatch) {
      const openParen = col.indexOf("(", aliasMatch[0].length - 1);
      const closeParen = findMatchingParen(col, openParen);
      if (closeParen >= 0) {
        const innerContent = col.slice(openParen + 1, closeParen);
        const parsed = parseColumns(innerContent);
        joins.push({ table: resolveTable(aliasMatch[2]), type: "left", columns: parsed.plain, nested: parsed.nested, alias: aliasMatch[1] });
        continue;
      }
    }

    // Check for table(cols) syntax — e.g. recipe_items(*)
    const parenIdx = col.indexOf("(");
    if (parenIdx > 0 && col.endsWith(")")) {
      const tableName = col.slice(0, parenIdx);
      const innerContent = col.slice(parenIdx + 1, -1);
      const parsed = parseColumns(innerContent);
      joins.push({ table: tableName, type: "left", columns: parsed.plain, nested: parsed.nested });
      continue;
    }

    // Plain column
    rootCols.push(col);
  }

  return { rootCols, joins };
}

function matchValue(actual: any, operator: Filter["operator"], value: any): boolean {
  switch (operator) {
    case "eq": return actual === value;
    case "neq": return actual !== value;
    case "in": return Array.isArray(value) && value.includes(actual);
    case "gte": return actual >= value;
    case "lte": return actual <= value;
    case "ilike": {
      if (typeof actual !== "string" || typeof value !== "string") return false;
      const pattern = value.replace(/%/g, ".*").toLowerCase();
      return new RegExp(`^${pattern}$`).test(actual.toLowerCase());
    }
    case "is": return value === null ? actual == null : actual === value;
    default: return true;
  }
}

const RELATION_ALIASES: Record<string, string> = {
  organization: "organizations",
  branch: "branches",
};

function resolveTable(tableOrAlias: string): string {
  return RELATION_ALIASES[tableOrAlias] ?? tableOrAlias;
}

export class MockQueryBuilder {
  private tableName: string;
  private filters: Filter[] = [];
  private selectColumns = "*";
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitCount: number | null = null;
  private returnMaybeSingle = false;
  private returnSingle = false;
  private countMode: "exact" | "planned" | "estimated" | null = null;
  private countHead = false;

  private _insertData: any = null;
  private _updateData: any = null;
  private _isDelete = false;
  private _upsertData: { rows: any; opts?: { onConflict?: string } } | null = null;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns: string, opts?: { count?: string; head?: boolean }) {
    this.selectColumns = columns;
    if (opts?.count) this.countMode = "exact";
    if (opts?.head) this.countHead = true;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ column, operator: "eq", value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ column, operator: "neq", value });
    return this;
  }

  in(column: string, value: any[]) {
    this.filters.push({ column, operator: "in", value });
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push({ column, operator: "gte", value });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push({ column, operator: "lte", value });
    return this;
  }

  ilike(column: string, pattern: string) {
    this.filters.push({ column, operator: "ilike", value: pattern });
    return this;
  }

  is(column: string, value: any) {
    this.filters.push({ column, operator: "is", value });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderCol = column;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    this.returnMaybeSingle = true;
    return this;
  }

  single() {
    this.returnSingle = true;
    return this;
  }

  insert(rows: any) {
    this._insertData = rows;
    return this;
  }

  update(payload: any) {
    this._updateData = payload;
    return this;
  }

  delete() {
    this._isDelete = true;
    return this;
  }

  upsert(rows: any, opts?: { onConflict?: string }) {
    this._upsertData = { rows, opts };
    return this;
  }

  private get rootFilters(): Filter[] {
    return this.filters.filter((f) => !f.column.includes("."));
  }

  private get joinFilters(): Filter[] {
    return this.filters.filter((f) => f.column.includes("."));
  }

  private applyFilters(rows: any[], filterSet: Filter[]): any[] {
    return rows.filter((row) => {
      for (const f of filterSet) {
        if (!matchValue(row[f.column], f.operator, f.value)) return false;
      }
      return true;
    });
  }

  private applyJoinFilters(rows: any[]): any[] {
    return rows.filter((row) => {
      for (const f of this.joinFilters) {
        const [table, col] = f.column.split(".");
        const rel = row[RELATION_ALIASES[table] ?? table];
        if (!rel || !matchValue(rel[col], f.operator, f.value)) return false;
      }
      return true;
    });
  }

  private projectColumns(row: any, rootCols: string[]): any {
    if (rootCols.length === 0 || rootCols.includes("*")) return { ...row };
    const result: any = {};
    for (const col of rootCols) {
      if (col === "*") {
        Object.assign(result, row);
      } else if (col in row) {
        result[col] = row[col];
      }
    }
    return result;
  }

  private loadJoinData(rows: any[], joins: JoinSpec[]): any[] {
    for (const join of joins) {
      const fk = findRel(this.tableName, join.table);
      const joinedData = MOCK_DATA[join.table];
      const key = join.alias ?? join.table;
      if (!fk || !joinedData) continue;

      const project = (related: any, j: JoinSpec): any => {
        let p: any;
        if (j.columns.includes("*") || j.columns.length === 0) {
          p = { ...related };
        } else {
          p = {};
          for (const col of j.columns) {
            if (col in related) p[col] = related[col];
          }
        }
        for (const n of j.nested) {
          const nfk = findRel(j.table, n.table);
          const nd = MOCK_DATA[n.table];
          if (nfk && nd) {
            if (nfk.isMulti) {
              const items = nd.filter((nr: any) => nr[nfk.fkCol] === related[nfk.pkCol]);
              p[n.table] = items.map((nr: any) => {
                const np: any = {};
                for (const nc of n.columns) {
                  if (nc in nr) np[nc] = nr[nc];
                }
                return np;
              });
            } else {
              const nr = nd.find((nr: any) => nr[nfk.pkCol] === related[nfk.fkCol]) ?? null;
              if (nr) {
                const np: any = {};
                for (const nc of n.columns) {
                  if (nc in nr) np[nc] = nr[nc];
                }
                p[n.table] = np;
              }
            }
          }
        }
        return p;
      }

      rows = rows.map((row) => {
        if (fk.isMulti) {
          const related = joinedData.filter((r: any) => r[fk.fkCol] === row[fk.pkCol]);
          row[key] = related.map((r: any) => project(r, join));
        } else {
          const related = joinedData.find((r: any) => r[fk.pkCol] === row[fk.fkCol]) ?? null;
          row[key] = related ? project(related, join) : null;
        }
        return row;
      });
    }
    return rows;
  }

  private loadAliasRelations(rows: any[]): any[] {
    const aliasSpecs: Array<{ alias: string; table: string; columns: string }> = [];
    for (const col of splitTopLevel(this.selectColumns, ",").map((s) => s.trim())) {
      const m = col.match(/^(\w+):(\w+)\(([^)]*)\)$/);
      if (m) aliasSpecs.push({ alias: m[1], table: resolveTable(m[2]), columns: m[3] });
    }
    if (aliasSpecs.length === 0) return rows;

    return rows.map((row) => {
      for (const spec of aliasSpecs) {
        const fk = findRel(this.tableName, spec.table);
        if (!fk) continue;
        if (fk.isMulti) {
          const items = (MOCK_DATA[spec.table] ?? []).filter((r: any) => r[fk.fkCol] === row[fk.pkCol]);
          row[spec.alias] = items.map((r: any) => {
            if (spec.columns === "*") return { ...r };
            const p: any = {};
              for (const c of splitTopLevel(spec.columns, ",").map((s) => s.trim()).filter(Boolean)) {
              if (c in r) p[c] = r[c];
            }
            return p;
          });
        } else {
          const fkVal = row[fk.fkCol];
          if (!fkVal) { row[spec.alias] = null; continue; }
          const relData = (MOCK_DATA[spec.table] ?? []).find((r: any) => r[fk.pkCol] === fkVal);
          if (relData) {
            row[spec.alias] = spec.columns === "*" ? { ...relData } : relData;
          } else {
            row[spec.alias] = null;
          }
        }
      }
      return row;
    });
  }

  private applyOrder(rows: any[]): any[] {
    if (!this.orderCol) return rows;
    return [...rows].sort((a, b) => {
      const av = a[this.orderCol!];
      const bv = b[this.orderCol!];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") {
        return this.orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return this.orderAsc ? av - bv : bv - av;
    });
  }

  private filterRows(rows: any[]): any[] {
    let filtered = this.applyFilters(rows, this.rootFilters);
    const { joins } = parseSelect(this.selectColumns);
    filtered = this.loadAliasRelations(filtered);
    if (joins.length > 0) {
      filtered = this.loadJoinData(filtered, joins);
    }
    filtered = this.applyJoinFilters(filtered);
    return filtered;
  }

  private projectAndReturn(filtered: any[]): any {
    const { rootCols: _rootCols } = parseSelect(this.selectColumns);

    if (this.countHead) {
      return { data: null, count: filtered.length, error: null };
    }

    if (this.countMode != null) {
      return { data: filtered, count: filtered.length, error: null };
    }

    if (this.returnMaybeSingle) {
      return { data: filtered[0] ?? null, error: null };
    }

    if (this.returnSingle) {
      return { data: filtered[0] ?? null, error: filtered.length === 0 ? { message: "not found", code: "PGRST116", details: "", hint: "" } : null };
    }

    return { data: filtered, error: null };
  }

  private execute(): any {
    const table = MOCK_DATA[this.tableName];

    if (this._insertData) {
      const rows = Array.isArray(this._insertData) ? this._insertData : [this._insertData];
      const inserted = rows.map((row: any) => {
        const newRow = { ...row };
        if (!newRow.id) newRow.id = crypto.randomUUID();
        if (!newRow.created_at) newRow.created_at = new Date().toISOString();
        table.push(newRow);
        return newRow;
      });
      if (this.selectColumns !== "*") {
        const projected = inserted.map((row: any) => {
          const { rootCols } = parseSelect(this.selectColumns);
          return this.projectColumns(row, rootCols);
        });
        if (this.returnSingle) return { data: projected[0] ?? null, error: null };
        if (this.returnMaybeSingle) return { data: projected[0] ?? null, error: null };
        return { data: projected, error: null };
      }
      if (this.returnSingle) return { data: inserted[0] ?? null, error: null };
      if (this.returnMaybeSingle) return { data: inserted[0] ?? null, error: null };
      return { data: inserted, error: null };
    }

    if (this._upsertData) {
      const rows = Array.isArray(this._upsertData.rows) ? this._upsertData.rows : [this._upsertData.rows];
      const _onConflict = this._upsertData.opts?.onConflict;
      const upserted: any[] = [];
      for (const row of rows) {
        const existingIdx = table.findIndex((r: any) => r.id === row.id);
        if (existingIdx >= 0) {
          Object.assign(table[existingIdx], row);
          upserted.push(table[existingIdx]);
        } else {
          const newRow = { ...row };
          if (!newRow.id) newRow.id = crypto.randomUUID();
          if (!newRow.created_at) newRow.created_at = new Date().toISOString();
          table.push(newRow);
          upserted.push(newRow);
        }
      }
      if (this.selectColumns !== "*") {
        const projected = upserted.map((row: any) => {
          const { rootCols } = parseSelect(this.selectColumns);
          return this.projectColumns(row, rootCols);
        });
        if (this.returnSingle) return { data: projected[0] ?? null, error: null };
        if (this.returnMaybeSingle) return { data: projected[0] ?? null, error: null };
        return { data: projected, error: null };
      }
      if (this.returnSingle) return { data: upserted[0] ?? null, error: null };
      if (this.returnMaybeSingle) return { data: upserted[0] ?? null, error: null };
      return { data: upserted, error: null };
    }

    if (this._updateData) {
      const filtered = this.filterRows([...table]);
      for (const row of filtered) {
        Object.assign(row, this._updateData);
        if (!row.updated_at) row.updated_at = new Date().toISOString();
      }
      if (this.selectColumns !== "*") {
        const projected = filtered.map((row: any) => {
          const { rootCols } = parseSelect(this.selectColumns);
          return this.projectColumns(row, rootCols);
        });
        if (this.returnSingle) return { data: projected[0] ?? null, error: null };
        if (this.returnMaybeSingle) return { data: projected[0] ?? null, error: null };
        return { data: projected, error: null };
      }
      if (this.returnSingle) return { data: filtered[0] ?? null, error: null };
      if (this.returnMaybeSingle) return { data: filtered[0] ?? null, error: null };
      return { data: filtered, error: null };
    }

    if (this._isDelete) {
      const toDelete = this.filterRows([...table]);
      const deleteIds = new Set(toDelete.map((r: any) => r.id));
      const remaining = table.filter((r: any) => !deleteIds.has(r.id));
      MOCK_DATA[this.tableName] = remaining;
      return { data: toDelete, error: null };
    }

    let filtered = this.filterRows([...table]);

    filtered = this.applyOrder(filtered);

    if (this.limitCount != null) {
      filtered = filtered.slice(0, this.limitCount);
    }

    return this.projectAndReturn(filtered);
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

function makeAuth() {
  return {
    getUser: async () => ({
      data: {
        user: {
          id: MOCK_USER_ID,
          email: "admin@demo.com",
          user_metadata: { full_name: "Admin Demo" },
          app_metadata: {},
          aud: "authenticated",
          created_at: new Date().toISOString(),
          role: "authenticated",
        },
      },
      error: null,
    }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async (_opts: { email: string; password: string }) => ({
      data: {
        user: {
          id: MOCK_USER_ID,
          email: _opts.email,
          user_metadata: { full_name: "Admin Demo" },
          app_metadata: {},
          aud: "authenticated",
          created_at: new Date().toISOString(),
          role: "authenticated",
        },
        session: {
          access_token: "mock-token",
          refresh_token: "mock-refresh",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: "bearer",
          user: null as any,
        },
      },
      error: null,
    }),
  };
}

function makeMockChannel() {
  const handlers: Array<{ event: string; table: string; callback: (payload: Record<string, unknown>) => void }> = [];
  let _subscribeCb: ((status: string) => void) | null = null;
  const channel = {
    on: (_event: string, _filter: any, callback?: (payload: Record<string, unknown>) => void) => {
      if (callback) handlers.push({ event: _event, table: _filter?.table ?? "", callback });
      return channel;
    },
    subscribe: (cb?: (status: string) => void) => { _subscribeCb = cb ?? null; return channel; },
    unsubscribe: () => {},
  };
  return channel;
}

function getMockOrders(branchId: string, from: string, to: string) {
  const orders = (MOCK_DATA.orders ?? []) as any[];
  return orders.filter(
    (o) => o.branch_id === branchId && o.status === "paid" && o.opened_at >= from && o.opened_at <= to,
  );
}

function getMockOrderItems(branchId: string, from: string, to: string) {
  const paidOrders = getMockOrders(branchId, from, to);
  const orderIds = new Set(paidOrders.map((o) => o.id));
  const items = (MOCK_DATA.order_items ?? []) as any[];
  return items.filter((it) => orderIds.has(it.order_id));
}

function mockRpcHandlers(name: string, args: any): any[] {
  const branchId = args?.p_branch_id as string;
  const from = (args?.p_from as string) ?? "";
  const to = (args?.p_to as string) ?? "";

  switch (name) {
    case "ai_sales_summary": {
      const orders = getMockOrders(branchId, from, to);
      const totalOrders = orders.length;
      const netRevenue = orders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
      const items = getMockOrderItems(branchId, from, to);
      const costOfGoods = items.reduce((s, it) => s + (it.cost_price_snapshot ?? 0) * (it.quantity ?? 0), 0);
      const channels = (MOCK_DATA.sales_channels ?? []) as any[];
      const channelMap = new Map(channels.map((c) => [c.id, c]));
      const channelFees = orders.reduce((s, o) => {
        const ch = channelMap.get(o.sales_channel_id);
        return s + (o.total_amount ?? 0) * ((ch?.platform_fee_percent ?? 0) / 100);
      }, 0);
      const grossProfit = netRevenue - costOfGoods;
      return [{ total_orders: totalOrders, net_revenue: netRevenue, cost_of_goods: costOfGoods, gross_profit: grossProfit, channel_fees: Math.round(channelFees), net_profit: grossProfit - Math.round(channelFees) }];
    }

    case "ai_top_products": {
      const items = getMockOrderItems(branchId, from, to);
      const limit = Number(args?.p_limit ?? 10);
      const productMap = new Map<string, { product_name: string; quantity: number; revenue: number; cost_of_goods: number }>();
      for (const it of items) {
        const key = it.product_id ?? it.product_name_snapshot;
        const existing = productMap.get(key) ?? { product_name: it.product_name_snapshot, quantity: 0, revenue: 0, cost_of_goods: 0 };
        existing.quantity += it.quantity ?? 0;
        existing.revenue += (it.unit_price_snapshot ?? 0) * (it.quantity ?? 0);
        existing.cost_of_goods += (it.cost_price_snapshot ?? 0) * (it.quantity ?? 0);
        productMap.set(key, existing);
      }
      return Array.from(productMap.values())
        .map((p) => ({ ...p, gross_profit: p.revenue - p.cost_of_goods }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit);
    }

    case "ai_category_summary": {
      const items = getMockOrderItems(branchId, from, to);
      const limit = Number(args?.p_limit ?? 20);
      const products = (MOCK_DATA.products ?? []) as any[];
      const categories = (MOCK_DATA.menu_categories ?? []) as any[];
      const productCatMap = new Map(products.map((p) => [p.id, p.category_id]));
      const catNameMap = new Map(categories.map((c) => [c.id, c.name]));
      const catMap = new Map<string, { category_id: string | null; category_name: string; quantity: number; revenue: number; cost_of_goods: number }>();
      for (const it of items) {
        const catId = productCatMap.get(it.product_id) ?? null;
        const key = catId ?? "__null__";
        const existing = catMap.get(key) ?? { category_id: catId, category_name: catId ? (catNameMap.get(catId) ?? "Khác") : "Chưa phân loại", quantity: 0, revenue: 0, cost_of_goods: 0 };
        existing.quantity += it.quantity ?? 0;
        existing.revenue += (it.unit_price_snapshot ?? 0) * (it.quantity ?? 0);
        existing.cost_of_goods += (it.cost_price_snapshot ?? 0) * (it.quantity ?? 0);
        catMap.set(key, existing);
      }
      return Array.from(catMap.values())
        .map((c) => ({ ...c, gross_profit: c.revenue - c.cost_of_goods }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit);
    }

    case "ai_channel_summary": {
      const orders = getMockOrders(branchId, from, to);
      const channels = (MOCK_DATA.sales_channels ?? []) as any[];
      const channelMap = new Map(channels.map((c) => [c.id, c]));
      const sumMap = new Map<string, { channel_name: string; orders: number; revenue: number; channel_fees: number }>();
      for (const o of orders) {
        const chId = o.sales_channel_id ?? "__none__";
        const ch = channelMap.get(chId);
        const existing = sumMap.get(chId) ?? { channel_name: ch?.name ?? "Không rõ", orders: 0, revenue: 0, channel_fees: 0 };
        existing.orders += 1;
        existing.revenue += o.total_amount ?? 0;
        existing.channel_fees += Math.round((o.total_amount ?? 0) * ((ch?.platform_fee_percent ?? 0) / 100));
        sumMap.set(chId, existing);
      }
      return Array.from(sumMap.values()).sort((a, b) => b.revenue - a.revenue);
    }

    case "ai_sales_timeseries": {
      const orders = getMockOrders(branchId, from, to);
      const items = getMockOrderItems(branchId, from, to);
      const granularity = (args?.p_granularity as string) ?? "day";
      const bucketMap = new Map<string, { period_start: string; total_orders: number; net_revenue: number; cost_of_goods: number }>();
      for (const o of orders) {
        const d = new Date(o.opened_at);
        const key = granularity === "hour"
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:00:00`
          : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T00:00:00`;
        const existing = bucketMap.get(key) ?? { period_start: key, total_orders: 0, net_revenue: 0, cost_of_goods: 0 };
        existing.total_orders += 1;
        existing.net_revenue += o.total_amount ?? 0;
        bucketMap.set(key, existing);
      }
      const orderIdsByDate = new Map<string, Set<string>>();
      for (const o of orders) {
        const d = new Date(o.opened_at);
        const key = granularity === "hour"
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:00:00`
          : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T00:00:00`;
        if (!orderIdsByDate.has(key)) orderIdsByDate.set(key, new Set());
        orderIdsByDate.get(key)!.add(o.id);
      }
      for (const it of items) {
        for (const [dateKey, orderIds] of Array.from(orderIdsByDate.entries())) {
          if (orderIds.has(it.order_id)) {
            const bucket = bucketMap.get(dateKey);
            if (bucket) bucket.cost_of_goods += (it.cost_price_snapshot ?? 0) * (it.quantity ?? 0);
          }
        }
      }
      return Array.from(bucketMap.values())
        .sort((a, b) => a.period_start.localeCompare(b.period_start))
        .map((b) => ({ ...b, gross_profit: b.net_revenue - b.cost_of_goods, channel_fees: 0, net_profit: b.net_revenue - b.cost_of_goods }));
    }

    case "ai_period_comparison": {
      const currentOrders = getMockOrders(branchId, from, to);
      const currentRevenue = currentOrders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
      const durationMs = new Date(to).getTime() - new Date(from).getTime();
      const prevFrom = new Date(new Date(from).getTime() - durationMs).toISOString();
      const prevTo = from;
      const prevOrders = getMockOrders(branchId, prevFrom, prevTo);
      const prevRevenue = prevOrders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
      const curItems = getMockOrderItems(branchId, from, to);
      const curCost = curItems.reduce((s, it) => s + (it.cost_price_snapshot ?? 0) * (it.quantity ?? 0), 0);
      const prevItems = getMockOrderItems(branchId, prevFrom, prevTo);
      const prevCost = prevItems.reduce((s, it) => s + (it.cost_price_snapshot ?? 0) * (it.quantity ?? 0), 0);
      const curProfit = currentRevenue - curCost;
      const prevProfit = prevRevenue - prevCost;
      const delta = (cur: number, prev: number) => prev === 0 ? null : Math.round(((cur - prev) / prev) * 100 * 10) / 10;
      return [{
        current_orders: currentOrders.length,
        previous_orders: prevOrders.length,
        orders_delta_percent: delta(currentOrders.length, prevOrders.length),
        current_revenue: currentRevenue,
        previous_revenue: prevRevenue,
        revenue_delta_percent: delta(currentRevenue, prevRevenue),
        current_profit: curProfit,
        previous_profit: prevProfit,
        profit_delta_percent: delta(curProfit, prevProfit),
      }];
    }

    case "ai_usage_summary": {
      const runs = (MOCK_DATA.ai_runs ?? []) as any[];
      const filtered = runs.filter(
        (r) => r.branch_id === branchId && r.created_at >= from && r.created_at <= to,
      );
      return [{
        total_runs: filtered.length,
        total_tokens: filtered.reduce((s, r) => s + (r.total_tokens ?? 0), 0),
        estimated_cost_usd: filtered.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0),
        fallback_runs: filtered.filter((r) => r.status === "fallback").length,
        average_latency_ms: filtered.length > 0 ? Math.round(filtered.reduce((s, r) => s + (r.latency_ms ?? 0), 0) / filtered.length) : 0,
      }];
    }

    default:
      return [];
  }
}

function makeRpcMock(name: string, args?: any): PromiseLike<{ data: any; error: null }> {
  return Promise.resolve({ data: mockRpcHandlers(name, args), error: null });
}

export function createMockServerClient() {
  const auth = makeAuth();
  return {
    auth,
    from: (table: string) => new MockQueryBuilder(table),
    rpc: makeRpcMock,
    channel: (_name: string) => makeMockChannel(),
    removeChannel: (_ch: any) => Promise.resolve({ error: null }),
  };
}

export function createMockBrowserClient() {
  const auth = makeAuth();
  return {
    auth,
    from: (table: string) => new MockQueryBuilder(table),
    rpc: makeRpcMock,
    channel: (_name: string) => makeMockChannel(),
    removeChannel: (_ch: any) => Promise.resolve({ error: null }),
  };
}

export function createMockAdminClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: MOCK_USER_ID, email: "admin@demo.com" } },
        error: null,
      }),
    },
    from: (table: string) => new MockQueryBuilder(table),
    rpc: makeRpcMock,
    channel: (_name: string) => makeMockChannel(),
    removeChannel: (_ch: any) => Promise.resolve({ error: null }),
  };
}
