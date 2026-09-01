/**
 * Mapper: Grab Mock Payload → CounterOps Order/OrderItem Schema
 */

import type { GrabMockOrder, GrabMockOrderItem } from "./types";

export interface MappedGrabOrder {
  organizationId: string;
  branchId: string;
  salesChannelId: string;
  orderType: "takeaway" | "delivery";
  customerName: string;
  customerPhone: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  serviceFeeAmount: number;
  totalAmount: number;
  items: Array<{
    productId: string;
    productName: string;
    unitPrice: number;
    quantity: number;
    note: string | null;
  }>;
  grabExternalId: string;
  specialInstructions?: string;
}

/**
 * Maps a Grab mock order payload to CounterOps order schema
 * Note: productId must be pre-validated to exist in the branch
 */
export function mapGrabOrderToCounterOps(
  grabOrder: GrabMockOrder,
  organizationId: string,
  branchId: string,
  salesChannelId: string
): MappedGrabOrder {
  console.log(`[GRAB MAPPER] Converting Grab order ${grabOrder.grab_order_id} to CounterOps schema`);

  // Map items
  const items = grabOrder.items.map((item: GrabMockOrderItem) => ({
    productId: item.product_id,
    productName: item.product_name,
    unitPrice: item.unit_price,
    quantity: item.quantity,
    note: item.notes ?? null,
  }));

  // Calculate subtotal from items (double-check against payload)
  const calculatedSubtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  // Map Grab fees to CounterOps schema:
  // - delivery_fee + platform_fee → service_fee_amount (or discount if desired)
  // For simplicity, we'll add these to service_fee_amount
  const serviceFeeAmount = (grabOrder.delivery_fee ?? 0) + (grabOrder.platform_fee ?? 0);

  return {
    organizationId,
    branchId,
    salesChannelId,
    orderType: "delivery", // Grab is always delivery channel
    customerName: grabOrder.customer_name,
    customerPhone: grabOrder.customer_phone,
    subtotal: calculatedSubtotal,
    discountAmount: 0,
    taxAmount: 0,
    serviceFeeAmount,
    totalAmount: calculatedSubtotal + serviceFeeAmount, // Simplified: subtotal + fees (no tax in this mock)
    items,
    grabExternalId: grabOrder.grab_order_id,
    specialInstructions: grabOrder.special_instructions,
  };
}
