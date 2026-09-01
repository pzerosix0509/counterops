/**
 * POST /api/integrations/grab/webhook
 * 
 * Internal webhook endpoint that receives mock Grab orders.
 * Called from simulate endpoint (or in real scenario, from Grab's servers).
 * 
 * No authentication required (internal endpoint, should be protected at infrastructure level).
 */

import { NextRequest, NextResponse } from "next/server";
import { handleGrabOrderWebhook } from "@/server/integrations/grab/webhook-handler";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationId, branchId, salesChannelId, payload } = body;

    console.log(`[WEBHOOK API] Received webhook request for org=${organizationId}, branch=${branchId}`);

    if (!organizationId || !branchId || !salesChannelId || !payload) {
      console.error(`[WEBHOOK API] Missing required fields`);
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Process webhook
    const result = await handleGrabOrderWebhook(organizationId, branchId, salesChannelId, payload);

    if (!result.success) {
      console.log(`[WEBHOOK API] Webhook processing failed: ${result.errorMessage}`);
      return NextResponse.json(
        { error: result.errorMessage },
        { status: 400 }
      );
    }

    console.log(`[WEBHOOK API] Webhook processed successfully, created order ${result.orderId}`);
    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      grabExternalId: result.grabExternalId,
    });
  } catch (error) {
    console.error(`[WEBHOOK API] Unexpected error:`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
