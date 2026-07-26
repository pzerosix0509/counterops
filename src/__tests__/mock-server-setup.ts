import { vi, beforeEach } from "vitest";

// ── Activate mock mode ──
process.env.NEXT_PUBLIC_MOCK = "true";

// ── Mock react.cache (not available in Vitest node env) ──
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    cache: <T extends (...args: any[]) => any>(fn: T): T => fn,
  };
});

// ── Mock next/cache ──
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// ── Mock next/navigation — redirect throws RedirectError with target URL ──
export class RedirectError extends Error {
  public url: string;
  public statusCode: number;
  constructor(url: string, statusCode = 303) {
    super(`Redirect to ${url}`);
    this.url = url;
    this.statusCode = statusCode;
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// ── Mock next/headers — controllable cookie jar ──
const mockCookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) =>
      mockCookieStore.has(name)
        ? { value: mockCookieStore.get(name)! }
        : undefined,
    set: (opts: { name: string; value: string }) => {
      mockCookieStore.set(opts.name, opts.value);
    },
    delete: (name: string) => {
      mockCookieStore.delete(typeof name === "string" ? name : name);
    },
    getAll: () =>
      Array.from(mockCookieStore.entries()).map(([name, value]) => ({
        name,
        value,
      })),
  }),
}));

// ── Deep-clone seed data for reset between tests ──
// Import the seed arrays at module level so they're resolved by Vitest's alias.
import {
  MOCK_ORGANIZATIONS,
  MOCK_BRANCHES,
  MOCK_PROFILES,
  MOCK_MEMBERSHIPS,
  MOCK_CATEGORIES,
  MOCK_PRODUCTS,
  MOCK_PRODUCT_BRANCH_SETTINGS,
  MOCK_SALES_CHANNELS,
  MOCK_AREAS,
  MOCK_ROOMS,
  MOCK_TABLES,
  MOCK_INVENTORY_ITEMS,
  MOCK_INVENTORY_BALANCES,
  MOCK_INVENTORY_MOVEMENTS,
  MOCK_RECIPES,
  MOCK_RECIPE_ITEMS,
  MOCK_ORDERS,
  MOCK_ORDER_ITEMS,
  MOCK_PAYMENTS,
} from "@/lib/mock/data";

const SEED: Record<string, any[]> = {
  organizations: MOCK_ORGANIZATIONS,
  branches: MOCK_BRANCHES,
  profiles: MOCK_PROFILES,
  memberships: MOCK_MEMBERSHIPS,
  menu_categories: MOCK_CATEGORIES,
  products: MOCK_PRODUCTS,
  product_branch_settings: MOCK_PRODUCT_BRANCH_SETTINGS,
  sales_channels: MOCK_SALES_CHANNELS,
  areas: MOCK_AREAS,
  rooms: MOCK_ROOMS,
  dining_tables: MOCK_TABLES,
  inventory_items: MOCK_INVENTORY_ITEMS,
  inventory_balances: MOCK_INVENTORY_BALANCES,
  inventory_movements: MOCK_INVENTORY_MOVEMENTS,
  recipes: MOCK_RECIPES,
  recipe_items: MOCK_RECIPE_ITEMS,
  orders: MOCK_ORDERS,
  order_items: MOCK_ORDER_ITEMS,
  payments: MOCK_PAYMENTS,
  end_of_day_reports: [],
  customers: [],
  audit_logs: [],
  menu_tags: [],
  product_tags: [],
  organization_settings: [],
  ai_chat_sessions: [],
  ai_chat_messages: [],
  ai_message_feedback: [],
  ai_runs: [],
  ai_documents: [],
  ai_document_chunks: [],
  ai_dashboard_templates: [],
};

// ── Reset mock state between tests ──
beforeEach(() => {
  mockCookieStore.clear();

  // Rebuild globalThis.__MOCK_DATA from deep-cloned seed arrays
  const fresh: Record<string, any[]> = {};
  for (const [key, rows] of Object.entries(SEED)) {
    fresh[key] = rows.map((row) => ({ ...row }));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__MOCK_DATA = fresh;
});

// ── Export cookie jar for tests that need to seed active_branch ──
export { mockCookieStore };
