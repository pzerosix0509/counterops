import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── Zod schemas mirroring the TypeScript interfaces from types/database.ts ──

const uuid = z.string().uuid();
const isoDate = z.string().datetime({ offset: true });
const optionalIsoDate = isoDate.nullable().optional();
const optionalUuid = uuid.nullable().optional();

const organizationSchema = z.object({
  id: uuid,
  name: z.string().min(1),
  slug: z.string().min(1),
  business_type: z.string().min(1),
  timezone: z.string().min(1),
  currency: z.string().min(1),
  allow_negative_inventory: z.boolean(),
  created_at: isoDate,
  updated_at: isoDate,
});

const branchSchema = z.object({
  id: uuid,
  organization_id: uuid,
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  timezone: z.string().min(1),
  is_active: z.boolean(),
  created_at: isoDate,
  updated_at: isoDate,
});

const profileSchema = z.object({
  id: uuid,
  full_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  default_organization_id: optionalUuid,
  created_at: isoDate,
  updated_at: isoDate,
});

const membershipSchema = z.object({
  id: uuid,
  organization_id: uuid,
  branch_id: optionalUuid,
  user_id: uuid,
  role: z.enum(["owner", "admin", "manager", "cashier", "reception", "kitchen", "staff"]),
  status: z.enum(["invited", "active", "suspended"]),
  invited_by: optionalUuid,
  joined_at: optionalIsoDate,
  created_at: isoDate,
});

const menuCategorySchema = z.object({
  id: uuid,
  organization_id: uuid,
  parent_id: optionalUuid,
  name: z.string().min(1),
  sort_order: z.number().int(),
  created_at: isoDate,
  updated_at: isoDate,
});

const productSchema = z.object({
  id: uuid,
  organization_id: uuid,
  category_id: optionalUuid,
  name: z.string().min(1),
  code: z.string().min(1),
  image_url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  menu_type: z.enum(["food", "drink", "service", "other"]),
  product_type: z.enum(["regular", "prepared"]),
  cost_price: z.number().int().min(0),
  sale_price: z.number().int().min(0),
  unit: z.string().min(1),
  is_active: z.boolean(),
  created_at: isoDate,
  updated_at: isoDate,
  deleted_at: optionalIsoDate,
});

const salesChannelSchema = z.object({
  id: uuid,
  organization_id: uuid,
  name: z.string().min(1),
  type: z.string().min(1),
  is_active: z.boolean(),
  platform_fee_percent: z.number().min(0).max(100),
  sort_order: z.number().int(),
});

const areaSchema = z.object({
  id: uuid,
  organization_id: uuid,
  branch_id: uuid,
  name: z.string().min(1),
  sort_order: z.number().int(),
});

const roomSchema = z.object({
  id: uuid,
  organization_id: uuid,
  branch_id: uuid,
  area_id: optionalUuid,
  name: z.string().min(1),
  sort_order: z.number().int(),
});

const diningTableSchema = z.object({
  id: uuid,
  organization_id: uuid,
  branch_id: uuid,
  area_id: optionalUuid,
  room_id: optionalUuid,
  name: z.string().min(1),
  seats: z.number().int().min(1),
  status: z.enum(["available", "occupied", "reserved", "disabled"]),
  sort_order: z.number().int(),
});

const inventoryItemSchema = z.object({
  id: uuid,
  organization_id: uuid,
  name: z.string().min(1),
  code: z.string().min(1),
  image_url: z.string().nullable().optional(),
  item_type: z.enum(["ingredient", "sellable_product", "packaging", "other"]),
  unit: z.string().min(1),
  cost_price: z.number().int().min(0),
  description: z.string().nullable().optional(),
  is_active: z.boolean(),
  created_at: isoDate,
  updated_at: isoDate,
  deleted_at: optionalIsoDate,
});

const inventoryBalanceSchema = z.object({
  id: uuid,
  organization_id: uuid,
  branch_id: uuid,
  inventory_item_id: uuid,
  quantity_on_hand: z.number().min(0),
  low_stock_threshold: z.number().min(0),
  high_stock_threshold: z.number().min(0).nullable().optional(),
  updated_at: isoDate,
});

const inventoryMovementSchema = z.object({
  id: uuid,
  organization_id: uuid,
  branch_id: uuid,
  inventory_item_id: uuid,
  movement_type: z.enum(["purchase", "sale_deduction", "adjustment", "transfer_in", "transfer_out", "waste", "return"]),
  quantity_delta: z.number(),
  unit_cost: z.number().int().min(0),
  reference_type: z.string().nullable().optional(),
  reference_id: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  created_by: optionalUuid,
  created_at: isoDate,
});

const recipeSchema = z.object({
  id: uuid,
  organization_id: uuid,
  product_id: uuid,
  version: z.number().int().min(1),
  is_active: z.boolean(),
  created_at: isoDate,
});

const recipeItemSchema = z.object({
  id: uuid,
  recipe_id: uuid,
  inventory_item_id: uuid,
  quantity: z.number().min(0),
  unit: z.string().min(1),
  estimated_cost: z.number().min(0),
});

const orderSchema = z.object({
  id: uuid,
  organization_id: uuid,
  branch_id: uuid,
  order_number: z.string().min(1),
  table_id: optionalUuid,
  customer_id: optionalUuid,
  sales_channel_id: optionalUuid,
  order_type: z.enum(["dine_in", "takeaway", "delivery", "online"]),
  status: z.enum(["draft", "open", "sent_to_kitchen", "partially_paid", "paid", "cancelled", "refunded"]),
  subtotal: z.number().int().min(0),
  discount_amount: z.number().int().min(0),
  tax_amount: z.number().int().min(0),
  service_fee_amount: z.number().int().min(0),
  total_amount: z.number().int().min(0),
  paid_amount: z.number().int().min(0),
  debt_amount: z.number().int().min(0),
  opened_by: optionalUuid,
  closed_by: optionalUuid,
  opened_at: isoDate,
  closed_at: optionalIsoDate,
  cancelled_by: optionalUuid,
  cancellation_reason: z.string().nullable().optional(),
});

const orderItemSchema = z.object({
  id: uuid,
  organization_id: uuid,
  branch_id: uuid,
  order_id: uuid,
  product_id: optionalUuid,
  product_name_snapshot: z.string().min(1),
  unit_price_snapshot: z.number().int().min(0),
  cost_price_snapshot: z.number().int().min(0),
  quantity: z.number().int().min(1),
  note: z.string().nullable().optional(),
  kitchen_status: z.enum(["not_required", "pending", "cooking", "ready", "served", "cancelled"]),
  cancellation_stage: z.string().nullable().optional(),
  cancelled_by: optionalUuid,
  cancelled_at: optionalIsoDate,
  created_at: isoDate,
});

const paymentSchema = z.object({
  id: uuid,
  organization_id: uuid,
  branch_id: uuid,
  order_id: uuid,
  method: z.enum(["cash", "bank_transfer", "card", "ewallet", "debt", "other"]),
  amount: z.number().int().min(0),
  paid_at: isoDate,
  received_by: optionalUuid,
  transaction_ref: z.string().nullable().optional(),
});

// ── Import mock data ──
import {
  MOCK_ORGANIZATIONS,
  MOCK_BRANCHES,
  MOCK_PROFILES,
  MOCK_MEMBERSHIPS,
  MOCK_CATEGORIES,
  MOCK_PRODUCTS,
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
  MOCK_DATA,
} from "@/lib/mock/data";

function validateRows<T>(label: string, rows: T[], schema: z.ZodType<T>) {
  it(`validates all ${label} (${rows.length} rows)`, () => {
    const errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const result = schema.safeParse(rows[i]);
      if (!result.success) {
        const issues = result.error.issues
          .map((iss) => `  ${iss.path.join(".")}: ${iss.message}`)
          .join("\n");
        errors.push(`Row ${i} (${(rows[i] as any).id ?? "no-id"}):\n${issues}`);
      }
    }
    if (errors.length > 0) {
      throw new Error(`${label} validation failed:\n\n${errors.join("\n\n")}`);
    }
    expect(errors).toHaveLength(0);
  });
}

// ── Tests ──

describe("Mock data — Zod schema validation", () => {
  validateRows("organizations", MOCK_ORGANIZATIONS, organizationSchema);
  validateRows("branches", MOCK_BRANCHES, branchSchema);
  validateRows("profiles", MOCK_PROFILES, profileSchema);
  validateRows("memberships", MOCK_MEMBERSHIPS, membershipSchema);
  validateRows("menu_categories", MOCK_CATEGORIES, menuCategorySchema);
  validateRows("products", MOCK_PRODUCTS, productSchema);
  validateRows("sales_channels", MOCK_SALES_CHANNELS, salesChannelSchema);
  validateRows("areas", MOCK_AREAS, areaSchema);
  validateRows("rooms", MOCK_ROOMS, roomSchema);
  validateRows("dining_tables", MOCK_TABLES, diningTableSchema);
  validateRows("inventory_items", MOCK_INVENTORY_ITEMS, inventoryItemSchema);
  validateRows("inventory_balances", MOCK_INVENTORY_BALANCES, inventoryBalanceSchema);
  validateRows("inventory_movements", MOCK_INVENTORY_MOVEMENTS, inventoryMovementSchema);
  validateRows("recipes", MOCK_RECIPES, recipeSchema);
  validateRows("recipe_items", MOCK_RECIPE_ITEMS, recipeItemSchema);
  validateRows("orders", MOCK_ORDERS, orderSchema);
  validateRows("order_items", MOCK_ORDER_ITEMS, orderItemSchema);
  validateRows("payments", MOCK_PAYMENTS, paymentSchema);

  it("all IDs are valid UUIDs", () => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const tables = Object.entries(MOCK_DATA);
    const errors: string[] = [];
    for (const [table, rows] of tables) {
      for (const row of rows as any[]) {
        if (row.id && !uuidRe.test(row.id)) {
          errors.push(`${table}.id = "${row.id}"`);
        }
      }
    }
    if (errors.length > 0) {
      throw new Error(`Non-UUID IDs found:\n${errors.join("\n")}`);
    }
    expect(errors).toHaveLength(0);
  });

  it("all foreign key references point to existing IDs", () => {
    const allIds = new Set<string>();
    for (const rows of Object.values(MOCK_DATA)) {
      for (const row of rows as any[]) {
        if (row.id) allIds.add(row.id);
      }
    }

    const fkChecks: Array<{ table: string; row: number; field: string; value: string }> = [];

    for (const order of MOCK_ORDERS) {
      if (order.sales_channel_id && !allIds.has(order.sales_channel_id)) {
        fkChecks.push({ table: "orders", row: order.id as any, field: "sales_channel_id", value: order.sales_channel_id });
      }
      if (order.table_id && !allIds.has(order.table_id)) {
        fkChecks.push({ table: "orders", row: order.id as any, field: "table_id", value: order.table_id });
      }
    }

    for (const item of MOCK_ORDER_ITEMS) {
      if (item.order_id && !allIds.has(item.order_id)) {
        fkChecks.push({ table: "order_items", row: item.id as any, field: "order_id", value: item.order_id });
      }
      if (item.product_id && !allIds.has(item.product_id)) {
        fkChecks.push({ table: "order_items", row: item.id as any, field: "product_id", value: item.product_id });
      }
    }

    for (const pay of MOCK_PAYMENTS) {
      if (pay.order_id && !allIds.has(pay.order_id)) {
        fkChecks.push({ table: "payments", row: pay.id as any, field: "order_id", value: pay.order_id });
      }
    }

    for (const bal of MOCK_INVENTORY_BALANCES) {
      if (!allIds.has(bal.inventory_item_id)) {
        fkChecks.push({ table: "inventory_balances", row: bal.id as any, field: "inventory_item_id", value: bal.inventory_item_id });
      }
    }

    for (const mov of MOCK_INVENTORY_MOVEMENTS) {
      if (!allIds.has(mov.inventory_item_id)) {
        fkChecks.push({ table: "inventory_movements", row: mov.id as any, field: "inventory_item_id", value: mov.inventory_item_id });
      }
    }

    for (const ri of MOCK_RECIPE_ITEMS) {
      if (!allIds.has(ri.recipe_id)) {
        fkChecks.push({ table: "recipe_items", row: ri.id as any, field: "recipe_id", value: ri.recipe_id });
      }
      if (!allIds.has(ri.inventory_item_id)) {
        fkChecks.push({ table: "recipe_items", row: ri.id as any, field: "inventory_item_id", value: ri.inventory_item_id });
      }
    }

    if (fkChecks.length > 0) {
      const msg = fkChecks.map((c) => `${c.table}[${c.row}].${c.field} = "${c.value}" → NOT FOUND`).join("\n");
      throw new Error(`Broken foreign keys:\n${msg}`);
    }
    expect(fkChecks).toHaveLength(0);
  });
});
