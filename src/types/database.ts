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
  bank_code: string | null;
  bank_account_number: string | null;
  tax_code: string | null;
  business_line: string | null;
  business_start_date: string | null;
  account_holder_name: string | null;
  province: string | null;
  district: string | null;
  commune: string | null;
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
  embedding: unknown | null;
  embedding_model: string | null;
  created_at: string;
}
export interface AiDashboardTemplate {
  id: string;
  organization_id: string;
  branch_id: string | null;
  name: string;
  description: string | null;
  prompt: string;
  spec: Json;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export interface AiChatSession {
  id: string;
  organization_id: string;
  branch_id: string;
  user_id: string;
  title: string;
  mode: "chat" | "dashboard";
  memory_summary: string | null;
  message_count: number;
  last_message_at: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface AiChatMessage {
  id: string;
  organization_id: string;
  branch_id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  response_json: Json | null;
  tool_calls: Json;
  sources: Json;
  model_used: string | null;
  client_request_id: string | null;
  created_at: string;
}
export interface AiRun {
  id: string;
  organization_id: string;
  branch_id: string;
  user_id: string;
  session_id: string | null;
  assistant_message_id: string | null;
  mode: "chat" | "dashboard";
  provider: string | null;
  model: string | null;
  status: "success" | "fallback" | "error";
  intent: string | null;
  response_mode: string | null;
  confidence_score: number | null;
  telemetry: Json;
  tool_calls: Json;
  source_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  latency_ms: number;
  fallback_reason: string | null;
  error_message: string | null;
  created_at: string;
}
export interface AiMessageFeedback {
  id: string;
  organization_id: string;
  branch_id: string;
  message_id: string;
  user_id: string;
  rating: -1 | 1;
  comment: string | null;
  created_at: string;
  updated_at: string;
}
export interface CustomerFeature {
  id: string;
  organization_id: string;
  branch_id: string;
  customer_id: string;
  age: number | null;
  recency_days: number;
  frequency: number;
  monetary: number;
  avg_order_value: number;
  avg_order_interval: number;
  weekend_ratio: number;
  dinner_ratio: number;
  favorite_category: string | null;
  favorite_dish_id: string | null;
  web_visit_count: number;
  dish_view_count: number;
  avg_rating: number | null;
  sentiment_score: number | null;
  r_score: number | null;
  f_score: number | null;
  m_score: number | null;
  rfm_segment: string | null;
  cluster_id: number | null;
  computed_at: string;
}
export interface RfmSegmentRule {
  id: string;
  organization_id: string | null;
  branch_id: string | null;
  segment: string;
  r_min: number;
  r_max: number;
  f_min: number;
  f_max: number;
  m_min: number;
  m_max: number;
  priority: number;
}
export interface CustomerFeedback {
  id: string;
  organization_id: string;
  branch_id: string;
  customer_id: string | null;
  order_id: string | null;
  rating: number;
  feedback_text: string | null;
  sentiment_label: string | null;
  sentiment_score: number | null;
  model_name: string | null;
  scored_at: string | null;
  created_at: string;
}
export interface CustomerCluster {
  id: string;
  organization_id: string;
  branch_id: string;
  k: number;
  silhouette: number | null;
  feature_names: string[];
  profiles: Json;
  fitted_at: string;
}
export interface DemandForecast {
  id: string;
  organization_id: string;
  branch_id: string;
  horizon_days: number;
  method: string;
  product_id: string | null;
  inventory_item_id: string | null;
  target_date: string;
  forecast_qty: number;
  lower_qty: number | null;
  upper_qty: number | null;
  computed_at: string;
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
      ai_dashboard_templates: TableDescriptor<AiDashboardTemplate>;
      ai_chat_sessions: TableDescriptor<AiChatSession>;
      ai_chat_messages: TableDescriptor<AiChatMessage>;
      ai_runs: TableDescriptor<AiRun>;
      ai_message_feedback: TableDescriptor<AiMessageFeedback>;
      customer_features: TableDescriptor<CustomerFeature>;
      rfm_segment_rules: TableDescriptor<RfmSegmentRule>;
      customer_feedback: TableDescriptor<CustomerFeedback>;
      customer_clusters: TableDescriptor<CustomerCluster>;
      demand_forecasts: TableDescriptor<DemandForecast>;
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
        match_ai_document_chunks: {
          Args: {
            p_org_id: string;
            p_branch_id: string | null;
            p_query_embedding: unknown;
            p_match_count?: number;
            p_match_threshold?: number;
          };
          Returns: {
            id: string;
            document_id: string;
            title: string;
            file_name: string;
            chunk_index: number;
            content: string;
            similarity: number;
          }[];
        };
        hybrid_search_ai_document_chunks: {
          Args: {
            p_org_id: string;
            p_branch_id: string;
            p_query_text: string;
            p_query_embedding: unknown | null;
            p_match_count?: number;
            p_full_text_weight?: number;
            p_semantic_weight?: number;
            p_rrf_k?: number;
          };
          Returns: {
            id: string;
            document_id: string;
            title: string;
            file_name: string;
            chunk_index: number;
            content: string;
            similarity: number | null;
            fusion_score: number;
            keyword_rank: number | null;
            semantic_rank: number | null;
          }[];
        };
        ai_sales_timeseries: {
          Args: {
            p_org_id: string;
            p_branch_id: string;
            p_from: string;
            p_to: string;
            p_granularity?: string;
            p_timezone?: string;
          };
          Returns: {
            period_start: string;
            total_orders: number;
            net_revenue: number;
            cost_of_goods: number;
            gross_profit: number;
            channel_fees: number;
            net_profit: number;
          }[];
        };
        ai_category_summary: {
          Args: {
            p_org_id: string;
            p_branch_id: string;
            p_from: string;
            p_to: string;
            p_limit?: number;
          };
          Returns: {
            category_id: string | null;
            category_name: string;
            quantity: number;
            revenue: number;
            cost_of_goods: number;
            gross_profit: number;
          }[];
        };
        ai_period_comparison: {
          Args: { p_org_id: string; p_branch_id: string; p_from: string; p_to: string };
          Returns: {
            current_orders: number;
            previous_orders: number;
            orders_delta_percent: number | null;
            current_revenue: number;
            previous_revenue: number;
            revenue_delta_percent: number | null;
            current_profit: number;
            previous_profit: number;
            profit_delta_percent: number | null;
          }[];
        };
        ai_usage_summary: {
          Args: { p_org_id: string; p_branch_id: string; p_from: string; p_to: string };
          Returns: {
            total_runs: number;
            total_tokens: number;
            estimated_cost_usd: number;
            fallback_runs: number;
            average_latency_ms: number;
          }[];
        };
        refresh_customer_features: {
          Args: { p_org: string; p_branch: string; p_as_of: string };
          Returns: number;
        };
        ai_rfm_summary: {
          Args: { p_org_id: string; p_branch_id: string };
          Returns: {
            rfm_segment: string | null;
            customer_count: number;
            avg_monetary: number;
          }[];
        };
        ai_rfm_customers: {
          Args: { p_org_id: string; p_branch_id: string; p_segment: string };
          Returns: {
            customer_id: string;
            recency_days: number;
            frequency: number;
            monetary: number;
            r_score: number | null;
            f_score: number | null;
            m_score: number | null;
            rfm_segment: string | null;
          }[];
        };
        ai_sentiment_summary: {
          Args: { p_org_id: string; p_branch_id: string; p_from: string; p_to: string };
          Returns: {
            sentiment_label: string | null;
            feedback_count: number;
            avg_rating: number;
            avg_sentiment_score: number;
          }[];
        };
        ai_dish_demand_series: {
          Args: { p_org_id: string; p_branch_id: string; p_from: string; p_to: string };
          Returns: {
            product_id: string;
            day: string;
            qty: number;
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
