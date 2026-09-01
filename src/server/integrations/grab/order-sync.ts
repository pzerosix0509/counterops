/**
 * Order Sync: Accept/Reject orders and update Grab sync status
 * 
 * This module handles when a kitchen user accepts or rejects a Grab order,
 * and notifies the mock Grab system of the status change.
 */

import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getGrabMockClient } from "@/lib/integrations/grab/mock-client";
import { logGrabSyncEvent } from "./webhook-handler";

export interface AcceptOrderResult {
  success: boolean;
  message: string;
}

/**
 * Accept a Grab order in the kitchen
 * Updates order status and notifies Grab mock
 */
export async function acceptGrabOrder(
  organizationId: string,
  branchId: string,
  orderId: string
): Promise<AcceptOrderResult> {
  console.log(`[GRAB ORDER_SYNC] Accepting order ${orderId}`);

  const admin = createSupabaseAdminClient();

  // Fetch the order
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, grab_external_id, grab_sync_status, status")
    .eq("id", orderId)
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (orderError || !order) {
    console.error(`[GRAB ORDER_SYNC] Order not found: ${orderId}`);
    await logGrabSyncEvent(admin, organizationId, branchId, orderId, "error", {
      reason: "Order not found during accept",
    });
    return {
      success: false,
      message: "Không tìm thấy đơn hàng",
    };
  }

  if (!order.grab_external_id) {
    // This is not a Grab order, skip
    return {
      success: true,
      message: "Đơn hàng không phải từ Grab",
    };
  }

  try {
    // Update local order status
    const { error: updateError } = await admin
      .from("orders")
      .update({
        grab_sync_status: "accepted",
        status: "sent_to_kitchen",
      })
      .eq("id", orderId);

    if (updateError) {
      console.error(`[GRAB ORDER_SYNC] Failed to update order:`, updateError);
      await logGrabSyncEvent(admin, organizationId, branchId, orderId, "error", {
        reason: "Failed to update order status",
        error: updateError.message,
      });
      return {
        success: false,
        message: "Không cập nhật được trạng thái đơn",
      };
    }

    // Notify mock Grab client
    const grabClient = getGrabMockClient();
    const response = await grabClient.acceptOrder(order.grab_external_id, {
      acceptance_status: "accepted",
    });

    console.log(`[GRAB ORDER_SYNC] Grab mock response:`, response);

    // Log the acceptance event
    await logGrabSyncEvent(admin, organizationId, branchId, orderId, "order_accepted", {
      grab_order_id: order.grab_external_id,
      acceptance_status: "accepted",
      grab_response: response,
    });

    return {
      success: true,
      message: "Đơn Grab được chấp nhận",
    };
  } catch (error) {
    console.error(`[GRAB ORDER_SYNC] Unexpected error:`, error);
    await logGrabSyncEvent(admin, organizationId, branchId, orderId, "error", {
      reason: "Unexpected error during accept",
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      message: "Lỗi trong quá trình chấp nhận đơn",
    };
  }
}

/**
 * Reject a Grab order
 * Updates order status to cancelled and notifies Grab mock
 */
export async function rejectGrabOrder(
  organizationId: string,
  branchId: string,
  orderId: string,
  reason?: string
): Promise<AcceptOrderResult> {
  console.log(`[GRAB ORDER_SYNC] Rejecting order ${orderId}, reason: ${reason ?? "none"}`);

  const admin = createSupabaseAdminClient();

  // Fetch the order
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, grab_external_id, grab_sync_status, status")
    .eq("id", orderId)
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (orderError || !order) {
    console.error(`[GRAB ORDER_SYNC] Order not found: ${orderId}`);
    await logGrabSyncEvent(admin, organizationId, branchId, orderId, "error", {
      reason: "Order not found during reject",
    });
    return {
      success: false,
      message: "Không tìm thấy đơn hàng",
    };
  }

  if (!order.grab_external_id) {
    // This is not a Grab order, skip
    return {
      success: true,
      message: "Đơn hàng không phải từ Grab",
    };
  }

  try {
    // Update local order status
    const { error: updateError } = await admin
      .from("orders")
      .update({
        grab_sync_status: "rejected",
        status: "cancelled",
        cancellation_reason: reason ?? "Cửa hàng từ chối đơn hàng",
      })
      .eq("id", orderId);

    if (updateError) {
      console.error(`[GRAB ORDER_SYNC] Failed to update order:`, updateError);
      await logGrabSyncEvent(admin, organizationId, branchId, orderId, "error", {
        reason: "Failed to update order status",
        error: updateError.message,
      });
      return {
        success: false,
        message: "Không cập nhật được trạng thái đơn",
      };
    }

    // Notify mock Grab client
    const grabClient = getGrabMockClient();
    const response = await grabClient.acceptOrder(order.grab_external_id, {
      acceptance_status: "rejected",
    });

    console.log(`[GRAB ORDER_SYNC] Grab mock rejection response:`, response);

    // Log the rejection event
    await logGrabSyncEvent(admin, organizationId, branchId, orderId, "order_rejected", {
      grab_order_id: order.grab_external_id,
      acceptance_status: "rejected",
      rejection_reason: reason ?? "unspecified",
      grab_response: response,
    });

    return {
      success: true,
      message: "Đơn Grab bị từ chối",
    };
  } catch (error) {
    console.error(`[GRAB ORDER_SYNC] Unexpected error:`, error);
    await logGrabSyncEvent(admin, organizationId, branchId, orderId, "error", {
      reason: "Unexpected error during reject",
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      message: "Lỗi trong quá trình từ chối đơn",
    };
  }
}

/**
 * Update Grab order status when order progresses (e.g., ready for pickup)
 */
export async function updateGrabOrderStatus(
  organizationId: string,
  branchId: string,
  orderId: string,
  newStatus: "preparing" | "ready_for_pickup" | "picked_up" | "completed" | "cancelled"
): Promise<AcceptOrderResult> {
  console.log(`[GRAB ORDER_SYNC] Updating order ${orderId} to status ${newStatus}`);

  const admin = createSupabaseAdminClient();

  // Fetch the order
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, grab_external_id")
    .eq("id", orderId)
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (orderError || !order?.grab_external_id) {
    return {
      success: true,
      message: "Đơn hàng không phải từ Grab",
    };
  }

  try {
    // Notify mock Grab client
    const grabClient = getGrabMockClient();
    const response = await grabClient.updateOrderStatus(order.grab_external_id, newStatus);

    console.log(`[GRAB ORDER_SYNC] Grab mock status update response:`, response);

    // Log the status update event
    await logGrabSyncEvent(admin, organizationId, branchId, orderId, "status_updated", {
      grab_order_id: order.grab_external_id,
      status: newStatus,
      grab_response: response,
    });

    return {
      success: true,
      message: `Trạng thái cập nhật: ${newStatus}`,
    };
  } catch (error) {
    console.error(`[GRAB ORDER_SYNC] Unexpected error:`, error);
    await logGrabSyncEvent(admin, organizationId, branchId, orderId, "error", {
      reason: "Unexpected error during status update",
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      message: "Lỗi cập nhật trạng thái",
    };
  }
}
