// Hand-rolled Database type for Supabase. The actual production types
// should be generated with `supabase gen types typescript`, but we
// ship a manually maintained version so the app compiles without it.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MembershipRole = "owner" | "admin" | "manager" | "cashier" | "reception" | "kitchen" | "staff";
export type MembershipStatus = "invited" | "active" | "suspended";
export type MenuType = "food" | "drink" | "service" | "other";
export type ProductType = "regular" | "prepared";
export type InventoryItemType = "ingredient" | "sellable_product" | "packaging" | "other";
export type TableStatus = "available" | "occupied" | "reserved" | "disabled";
export type OrderType = "dine_in" | "takeaway" | "delivery" | "online";
export type OrderStatus = "draft" | "open" | "sent_to_kitchen" | "partially_paid" | "paid" | "cancelled" | "refunded";
export type KitchenStatus = "not_required" | "pending" | "cooking" | "ready" | "served" | "cancelled";
export type PaymentMethod = "cash" | "bank_transfer" | "card" | "ewallet" | "debt" | "other";
export type MovementType = "purchase" | "sale_deduction" | "adjustment" | "transfer_in" | "transfer_out" | "waste" | "return";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  business_type: string;
  timezone: string;
  currency: string;
  allow_negative_inventory: boolean;
  created_at: string;
  updated_at: string;
}
export interface OrganizationSettings {
  organization_id: string;
  inventory_deduction_timing: "payment" | "kitchen_start";
  low_stock_alert_enabled: boolean;
  default_low_stock_threshold: number;
  default_order_type: "dine_in" | "takeaway";
  default_takeaway_channel_id: string | null;
  allow_unpaid_orders: boolean;
  discounts_enabled: boolean;
  max_discount_percent: number;
  default_payment_method: PaymentMethod;
  kitchen_sound_enabled: boolean;
  auto_send_to_kitchen_on_payment: boolean;
  show_regular_items_in_kitchen: boolean;
  auto_mark_served_on_ready: boolean;
  business_day_start_time: string;
  include_service_fee_in_revenue: boolean;
  auto_generate_eod: boolean;
  receipt_store_name: string | null;
  receipt_address: string | null;
  receipt_phone: string | null;
  receipt_logo_url: string | null;
  receipt_footer: string;
  created_at: string;
  updated_at: string;
}
export interface Branch {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  default_organization_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface Membership {
  id: string;
  organization_id: string;
  branch_id: string | null;
  user_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  invited_by: string | null;
  joined_at: string | null;
  created_at: string;
}
export interface MenuCategory {
  id: string;
  organization_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
export interface MenuTag {
  id: string;
  organization_id: string;
  name: string;
  color: string | null;
}
export interface Product {
  id: string;
  organization_id: string;
  category_id: string | null;
  name: string;
  code: string;
  image_url: string | null;
  description: string | null;
  menu_type: MenuType;
  product_type: ProductType;
  cost_price: number;
  sale_price: number;
  unit: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
export interface ProductTag {
  product_id: string;
  tag_id: string;
}
export interface ProductBranchSetting {
  id: string;
  organization_id: string;
  product_id: string;
  branch_id: string;
  is_available: boolean;
  sale_price_override: number | null;
  low_stock_threshold: number | null;
  high_stock_threshold: number | null;
}
export interface InventoryItem {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  image_url: string | null;
  item_type: InventoryItemType;
  unit: string;
  cost_price: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
export interface InventoryBalance {
  id: string;
  organization_id: string;
  branch_id: string;
  inventory_item_id: string;
  quantity_on_hand: number;
  low_stock_threshold: number;
  high_stock_threshold: number | null;
  updated_at: string;
}
export interface InventoryMovement {
  id: string;
  organization_id: string;
  branch_id: string;
  inventory_item_id: string;
  movement_type: MovementType;
  quantity_delta: number;
  unit_cost: number;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}
export interface Recipe {
  id: string;
  organization_id: string;
  product_id: string;
  version: number;
  is_active: boolean;
  created_at: string;
}
export interface RecipeItem {
  id: string;
  recipe_id: string;
  inventory_item_id: string;
  quantity: number;
  unit: string;
  estimated_cost: number;
}
export interface SalesChannel {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  is_active: boolean;
  platform_fee_percent: number;
  sort_order: number;
}
export interface Area {
  id: string;
  organization_id: string;
  branch_id: string;
  name: string;
  sort_order: number;
}
export interface Room {
  id: string;
  organization_id: string;
  branch_id: string;
  area_id: string | null;
  name: string;
  sort_order: number;
}
export interface DiningTable {
  id: string;
  organization_id: string;
  branch_id: string;
  area_id: string | null;
  room_id: string | null;
  name: string;
  seats: number;
  status: TableStatus;
  sort_order: number;
}
export interface Customer {
  id: string;
  organization_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  notes: string | null;
  created_at: string;
}
export interface Order {
  id: string;
  organization_id: string;
  branch_id: string;
  order_number: string;
  table_id: string | null;
  customer_id: string | null;
  sales_channel_id: string | null;
  order_type: OrderType;
  status: OrderStatus;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  service_fee_amount: number;
  total_amount: number;
  paid_amount: number;
  debt_amount: number;
  opened_by: string | null;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
}
export interface OrderItem {
  id: string;
  organization_id: string;
  branch_id: string;
  order_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  unit_price_snapshot: number;
  cost_price_snapshot: number;
  quantity: number;
  note: string | null;
  kitchen_status: KitchenStatus;
  cancellation_stage: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_at: string;
}
export interface Payment {
  id: string;
  organization_id: string;
  branch_id: string;
  order_id: string;
  method: PaymentMethod;
  amount: number;
  paid_at: string;
  received_by: string | null;
  transaction_ref: string | null;
}
export interface EndOfDayReport {
  id: string;
  organization_id: string;
  branch_id: string;
  report_date: string;
  document_code: string;
  total_orders: number;
  gross_sales: number;
  discounts: number;
  net_revenue: number;
  other_income: number;
  tax: number;
  return_fee: number;
  total_paid: number;
  debt_amount: number;
  cash_total: number;
  bank_transfer_total: number;
  generated_by: string | null;
  generated_at: string;
}
export interface AuditLog {
  id: string;
  organization_id: string;
  branch_id: string | null;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Json | null;
  after: Json | null;
  created_at: string;
}
export interface AiDocument {
  id: string;
  organization_id: string;
  branch_id: string | null;
  title: string;
  file_name: string;
  mime_type: string | null;
  source_type: string;
  uploaded_by: string | null;
  created_at: string;
}
export interface AiDocumentChunk {
  id: string;
  organization_id: string;
  branch_id: string | null;
  document_id: string;
  chunk_index: number;
  content: string;
  created_at: string;
}

// Helper to make a Supabase-style table descriptor.
type TableDescriptor<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      organizations: TableDescriptor<Organization>;
      organization_settings: TableDescriptor<OrganizationSettings>;
      branches: TableDescriptor<Branch>;
      profiles: TableDescriptor<Profile>;
      memberships: TableDescriptor<Membership>;
      menu_categories: TableDescriptor<MenuCategory>;
      menu_tags: TableDescriptor<MenuTag>;
      products: TableDescriptor<Product>;
      product_tags: TableDescriptor<ProductTag>;
      product_branch_settings: TableDescriptor<ProductBranchSetting>;
      inventory_items: TableDescriptor<InventoryItem>;
      inventory_balances: TableDescriptor<InventoryBalance>;
      inventory_movements: TableDescriptor<InventoryMovement>;
      recipes: TableDescriptor<Recipe>;
      recipe_items: TableDescriptor<RecipeItem>;
      sales_channels: TableDescriptor<SalesChannel>;
      areas: TableDescriptor<Area>;
      rooms: TableDescriptor<Room>;
      dining_tables: TableDescriptor<DiningTable>;
      customers: TableDescriptor<Customer>;
      orders: TableDescriptor<Order>;
      order_items: TableDescriptor<OrderItem>;
      payments: TableDescriptor<Payment>;
      end_of_day_reports: TableDescriptor<EndOfDayReport>;
      audit_logs: TableDescriptor<AuditLog>;
      ai_documents: TableDescriptor<AiDocument>;
      ai_document_chunks: TableDescriptor<AiDocumentChunk>;
    };
    Views: Record<string, never>;
    Functions: {
      is_org_member: { Args: { p_org_id: string }; Returns: boolean };
      has_org_role: { Args: { p_org_id: string; allowed_roles: string[] }; Returns: boolean };
      has_branch_access: { Args: { p_org_id: string; p_branch_id: string }; Returns: boolean };
      ai_sales_summary: {
        Args: { p_org_id: string; p_branch_id: string; p_from: string; p_to: string };
        Returns: {
          total_orders: number;
          net_revenue: number;
          cost_of_goods: number;
          gross_profit: number;
          channel_fees: number;
          net_profit: number;
        }[];
      };
      ai_top_products: {
        Args: { p_org_id: string; p_branch_id: string; p_from: string; p_to: string; p_limit?: number };
        Returns: {
          product_name: string;
          quantity: number;
          revenue: number;
          cost_of_goods: number;
          gross_profit: number;
        }[];
      };
      ai_channel_summary: {
        Args: { p_org_id: string; p_branch_id: string; p_from: string; p_to: string };
        Returns: {
          channel_name: string;
          orders: number;
          revenue: number;
          channel_fees: number;
        }[];
      };
    };
    Enums: {
      membership_role: MembershipRole;
      membership_status: MembershipStatus;
      menu_type: MenuType;
      product_type: ProductType;
      inventory_item_type: InventoryItemType;
      table_status: TableStatus;
      order_type: OrderType;
      order_status: OrderStatus;
      kitchen_status: KitchenStatus;
      payment_method: PaymentMethod;
      movement_type: MovementType;
    };
    CompositeTypes: Record<string, never>;
  };
}
