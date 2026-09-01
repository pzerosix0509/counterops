/**
 * Webhook Handler: Process incoming mock Grab orders
 * 
 * This handler receives mock order payloads from /api/integrations/grab/webhook
 * and converts them to CounterOps orders in the database.
 * 
 * Uses admin client (bypass RLS) since this is an internal webhook, not a user request.
 */

import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { grabOrderPayloadSchema } from "@/lib/validation/grab-schemas";
import { mapGrabOrderToCounterOps } from "@/lib/integrations/grab/mapper";
import { newOrderNumber } from "@/lib/calculations/orders";
import type { GrabOrderPayload } from "@/lib/validation/grab-schemas";

export interface WebhookHandlerResult {
  success: boolean;
  orderId?: string;
  grabExternalId?: string;
  errorMessage?: string;
  eventId?: string;
}

/**
 * Main webhook handler: validate, map, create order in DB
 */
export async function handleGrabOrderWebhook(
  organizationId: string,
  branchId: string,
  salesChannelId: string,
  payload: unknown
): Promise<WebhookHandlerResult> {
  console.log(`[GRAB WEBHOOK] Received webhook for org=${organizationId}, branch=${branchId}`);

  // Validate payload against schema
  const parsed = grabOrderPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    console.error(`[GRAB WEBHOOK] Validation failed:`, parsed.error.issues);
    const admin = createSupabaseAdminClient();
    await logGrabSyncEvent(admin, organizationId, branchId, null, "error", {
      reason: "Invalid payload",
      issues: parsed.error.issues,
    });
    return {
      success: false,
      errorMessage: "Invalid Grab order payload",
    };
  }

  const grabOrder = parsed.data;
  console.log(`[GRAB WEBHOOK] Validated Grab order: ${grabOrder.grab_order_id}`);

  const admin = createSupabaseAdminClient();

  // Check store is online
  const { data: storeConfig } = await admin
    .from("grab_store_config")
    .select("is_online")
    .eq("branch_id", branchId)
    .maybeSingle();

  if (!storeConfig?.is_online) {
    console.warn(`[GRAB WEBHOOK] Store is offline, rejecting order ${grabOrder.grab_order_id}`);
    await logGrabSyncEvent(admin, organizationId, branchId, null, "error", {
      reason: "Store is offline",
      grab_order_id: grabOrder.grab_order_id,
    });
    return {
      success: false,
      errorMessage: "Cửa hàng hiện không nhận đơn Grab",
    };
  }

  try {
    // Map Grab payload to CounterOps schema
    // Calculate delivery and platform fees based on subtotal
    const deliveryFee = 15000; // Fixed 15k VND delivery fee for demo
    const platformFeePercent = 0.05; // 5% platform fee
    const platformFee = Math.floor(grabOrder.subtotal * platformFeePercent);
    
    const grabOrderWithFees = {
      ...grabOrder,
      delivery_fee: deliveryFee,
      platform_fee: platformFee,
    };
    
    const mapped = mapGrabOrderToCounterOps(grabOrderWithFees, organizationId, branchId, salesChannelId);

    // Verify all products exist
    const productIds = mapped.items.map((item) => item.productId);
    const { data: products, error: productError } = await admin
      .from("products")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", productIds);

    if (productError || (products?.length ?? 0) !== productIds.length) {
      console.error(`[GRAB WEBHOOK] Some products not found in org ${organizationId}`);
      await logGrabSyncEvent(admin, organizationId, branchId, null, "error", {
        reason: "Products not found",
        grab_order_id: grabOrder.grab_order_id,
        missing_products: productIds.filter(
          (id) => !(products ?? []).some((p) => p.id === id)
        ),
      });
      return {
        success: false,
        errorMessage: "Một số món không có trong menu",
      };
    }

    // Create order in database
    const orderNumber = newOrderNumber(1, new Date()); // Simple sequence
    const orderToCreate = {
      organization_id: organizationId,
      branch_id: branchId,
      order_number: orderNumber,
      sales_channel_id: salesChannelId,
      table_id: null,
      customer_id: null,
      order_type: mapped.orderType,
      status: "open",
      subtotal: mapped.subtotal,
      discount_amount: mapped.discountAmount,
      tax_amount: mapped.taxAmount,
      service_fee_amount: mapped.serviceFeeAmount,
      total_amount: mapped.totalAmount,
      paid_amount: 0,
      debt_amount: mapped.totalAmount,
      opened_by: null,
      opened_at: new Date().toISOString(),
      closed_by: null,
      closed_at: null,
      cancelled_by: null,
      cancellation_reason: null,
      grab_external_id: mapped.grabExternalId,
      grab_sync_status: "pending",
    };

    const { data: createdOrder, error: orderError } = await admin
      .from("orders")
      .insert([orderToCreate])
      .select("id")
      .maybeSingle();

    if (orderError || !createdOrder) {
      console.error(`[GRAB WEBHOOK] Failed to create order:`, orderError);
      await logGrabSyncEvent(admin, organizationId, branchId, null, "error", {
        reason: "Failed to create order",
        error: orderError?.message,
        grab_order_id: grabOrder.grab_order_id,
      });
      return {
        success: false,
        errorMessage: "Không thể tạo đơn hàng",
      };
    }

    const orderId = createdOrder.id;
    console.log(`[GRAB WEBHOOK] Created CounterOps order ${orderId} for Grab order ${grabOrder.grab_order_id}`);

    // Create order items
    const itemsToCreate = mapped.items.map((item) => ({
      organization_id: organizationId,
      branch_id: branchId,
      order_id: orderId,
      product_id: item.productId,
      product_name_snapshot: item.productName,
      unit_price_snapshot: item.unitPrice,
      cost_price_snapshot: 0, // TODO: fetch real cost price
      quantity: item.quantity,
      note: item.note,
      kitchen_status: "pending",
      created_at: new Date().toISOString(),
    }));

    const { error: itemsError } = await admin.from("order_items").insert(itemsToCreate);

    if (itemsError) {
      console.error(`[GRAB WEBHOOK] Failed to create order items:`, itemsError);
      await logGrabSyncEvent(admin, organizationId, branchId, orderId, "error", {
        reason: "Failed to create order items",
        error: itemsError.message,
      });
      return {
        success: false,
        errorMessage: "Không thể tạo chi tiết đơn hàng",
      };
    }

    console.log(`[GRAB WEBHOOK] Created ${itemsToCreate.length} order items`);

    // Log successful order creation
    await logGrabSyncEvent(admin, organizationId, branchId, orderId, "order_received", {
      grab_order_id: grabOrder.grab_order_id,
      customer_phone: grabOrder.customer_phone,
      customer_name: grabOrder.customer_name,
      total_amount: mapped.totalAmount,
      item_count: mapped.items.length,
    });

    // Update last order sync time
    await admin
      .from("grab_store_config")
      .update({ last_order_sync_at: new Date().toISOString() })
      .eq("branch_id", branchId);

    return {
      success: true,
      orderId,
      grabExternalId: mapped.grabExternalId,
    };
  } catch (error) {
    console.error(`[GRAB WEBHOOK] Unexpected error:`, error);
    await logGrabSyncEvent(admin, organizationId, branchId, null, "error", {
      reason: "Unexpected error",
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      errorMessage: "Lỗi xử lý đơn Grab",
    };
  }
}

/**
 * Log a sync event to grab_sync_events table
 */
export async function logGrabSyncEvent(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  branchId: string,
  orderId: string | null,
  eventType: string,
  payload: Record<string, any>
): Promise<void> {
  const { error } = await admin.from("grab_sync_events").insert({
    organization_id: organizationId,
    branch_id: branchId,
    order_id: orderId,
    event_type: eventType,
    payload,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`[GRAB WEBHOOK] Failed to log event:`, error);
  }
}
