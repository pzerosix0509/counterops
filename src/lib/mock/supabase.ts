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
  };

  const bt = belongsTo[rootTable]?.[targetTable];
  if (bt) return { isMulti: false, ...bt };

  const hm = hasMany[rootTable]?.[targetTable];
  if (hm) return { isMulti: true, ...hm };

  return null;
}

function parseSelect(colSpec: string): { rootCols: string[]; joins: JoinSpec[] } {
  const allCols = colSpec.split(",").map((s) => s.trim()).filter(Boolean);
  const rootCols: string[] = [];
  const joins: JoinSpec[] = [];

  function parseInner(cols: string[]): { plain: string[]; nested: JoinSpec[] } {
    const nested: JoinSpec[] = [];
    const nestedRe = /^(\w+)\(([^)]*)\)$/;
    for (const c of cols) {
      const nm = c.match(nestedRe);
      if (nm) {
        const inner = parseInner(nm[2].split(",").map((s) => s.trim()).filter(Boolean));
        nested.push({ table: nm[1], type: "inner", columns: inner.plain, nested: inner.nested });
      }
    }
    const plain = cols.filter((c) => !nested.some((n) => c === n.table + "(" + n.columns.join(",") + ")") && !nested.some((n) => c.startsWith(n.table + "(")));
    return { plain, nested };
  }

  for (const col of allCols) {
    const joinMatch = col.match(/^(\w+)!(inner|left|right)\(([^)]*)\)$/);
    const relMatch = (!joinMatch && !col.includes(":")) ? col.match(/^(\w+)\(([^)]*)\)$/) : null;

    if (joinMatch) {
      const innerCols = joinMatch[3].split(",").map((s) => s.trim()).filter(Boolean);
      const { plain, nested } = parseInner(innerCols);
      joins.push({ table: joinMatch[1], type: joinMatch[2], columns: plain, nested });
    } else if (relMatch) {
      const innerCols = relMatch[2].split(",").map((s) => s.trim()).filter(Boolean);
      const { plain, nested } = parseInner(innerCols);
      joins.push({ table: relMatch[1], type: "left", columns: plain, nested });
    } else {
      rootCols.push(col);
    }
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
    case "is": return value === null ? actual === null : actual === value;
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
    for (const col of this.selectColumns.split(",").map((s) => s.trim())) {
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
            for (const c of spec.columns.split(",").map((s) => s.trim()).filter(Boolean)) {
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
        if (!newRow.id) newRow.id = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
          if (!newRow.id) newRow.id = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          if (!newRow.created_at) newRow.created_at = new Date().toISOString();
          table.push(newRow);
          upserted.push(newRow);
        }
      }
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

function makeRpcMock(_name: string, _args?: any): PromiseLike<{ data: any; error: null }> {
  return Promise.resolve({ data: [], error: null });
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
