/**
 * Mock GrabFood Merchant API types
 * Simulates the shape of real GrabFood API payloads without calling actual endpoints
 */

export interface GrabMockAuthToken {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}

export interface GrabMockOrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  notes?: string;
}

export interface GrabMockOrder {
  grab_order_id: string;
  merchant_id: string;
  customer_phone: string;
  customer_name: string;
  delivery_address?: string;
  items: GrabMockOrderItem[];
  subtotal: number;
  delivery_fee: number;
  platform_fee: number;
  total_amount: number;
  special_instructions?: string;
  ordered_at: string; // ISO timestamp
}

export interface GrabMockOrderAcceptResponse {
  success: boolean;
  grab_order_id: string;
  status: "accepted" | "rejected";
  message: string;
}

export interface GrabMockOrderStatusUpdate {
  grab_order_id: string;
  status: "preparing" | "ready_for_pickup" | "picked_up" | "completed" | "cancelled";
  timestamp: string;
}

export interface GrabMockStoreStatus {
  merchant_id: string;
  is_online: boolean;
  last_updated: string;
}
