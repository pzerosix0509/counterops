/**
 * POST /api/integrations/grab/simulate
 * 
 * Generates a random mock Grab order from real menu items
 * and sends it to the webhook endpoint.
 * 
 * This is the button endpoint for "Simulate New Grab Order" in the UI.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { grabOrderPayloadSchema } from "@/lib/validation/grab-schemas";
import type { GrabMockOrder, GrabMockOrderItem } from "@/lib/integrations/grab/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationId, branchId, salesChannelId } = body;

    console.log(`[SIMULATE API] Generating mock Grab order for org=${organizationId}, branch=${branchId}`);

    if (!organizationId || !branchId || !salesChannelId) {
      return NextResponse.json(
        { error: "Missing required fields: organizationId, branchId, salesChannelId" },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdminClient();

    // Check if store is online
    const { data: storeConfig } = await admin
      .from("grab_store_config")
      .select("is_online")
      .eq("branch_id", branchId)
      .maybeSingle();

    if (!storeConfig?.is_online) {
      console.log(`[SIMULATE API] Store is offline, cannot simulate order`);
      return NextResponse.json(
        { error: "Cửa hàng không đang nhận đơn Grab" },
        { status: 400 }
      );
    }

    // Fetch active products for the branch
    const { data: products, error: productError } = await admin
      .from("products")
      .select("id, name, sale_price")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(50);

    if (productError || !products || products.length === 0) {
      console.error(`[SIMULATE API] No products found`);
      return NextResponse.json(
        { error: "Không có món ăn trong menu" },
        { status: 400 }
      );
    }

    console.log(`[SIMULATE API] Found ${products.length} active products, generating random order...`);

    // Generate random order: 1-4 items, each with quantity 1-3
    const itemCount = Math.floor(Math.random() * 4) + 1;
    const selectedIndices = new Set<number>();
    while (selectedIndices.size < itemCount && selectedIndices.size < products.length) {
      selectedIndices.add(Math.floor(Math.random() * products.length));
    }

    const items: GrabMockOrderItem[] = Array.from(selectedIndices)
      .sort()
      .map((idx) => {
        const product = products[idx];
        const quantity = Math.floor(Math.random() * 3) + 1;
        return {
          product_id: product.id,
          product_name: product.name,
          quantity,
          unit_price: product.sale_price,
        };
      });

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const deliveryFee = 15000; // Mock delivery fee
    const platformFee = Math.round(subtotal * 0.05); // 5% platform fee
    const totalAmount = subtotal + deliveryFee + platformFee;

    // Generate random customer info
    const firstNames = ["Nguyễn", "Trần", "Phạm", "Hoàng", "Đặng", "Vũ", "Đỗ", "Bùi"];
    const lastNames = ["Văn A", "Thị B", "Quốc C", "Tấn D", "Hải E"];
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const customerName = `${firstName} ${lastName}`;
    const customerPhone = `09${Math.floor(Math.random() * 900000000 + 100000000)}`;

    // Create Grab order payload
    const grabExternalId = `GRAB-MOCK-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    const grabOrder: GrabMockOrder = {
      grab_order_id: grabExternalId,
      merchant_id: "1-MOCK000001",
      customer_phone: customerPhone,
      customer_name: customerName,
      delivery_address: "123 Đường Demo, Thành phố HCM",
      items,
      subtotal,
      delivery_fee: deliveryFee,
      platform_fee: platformFee,
      total_amount: totalAmount,
      special_instructions: "Ghi chú từ Grab: Demo order",
      ordered_at: new Date().toISOString(),
    };

    console.log(`[SIMULATE API] Generated mock order:`, {
      grabOrderId: grabOrder.grab_order_id,
      itemCount: items.length,
      totalAmount: grabOrder.total_amount,
    });

    // Validate payload
    const validation = grabOrderPayloadSchema.safeParse(grabOrder);
    if (!validation.success) {
      console.error(`[SIMULATE API] Generated payload validation failed:`, validation.error);
      return NextResponse.json(
        { error: "Invalid generated payload" },
        { status: 500 }
      );
    }

    // Call webhook endpoint
    const webhookUrl = new URL(request.url);
    webhookUrl.pathname = "/api/integrations/grab/webhook";

    const webhookResponse = await fetch(webhookUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId,
        branchId,
        salesChannelId,
        payload: grabOrder,
      }),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error(`[SIMULATE API] Webhook failed:`, webhookResponse.status, errorText);
      return NextResponse.json(
        { error: "Webhook processing failed" },
        { status: 500 }
      );
    }

    const webhookResult = await webhookResponse.json();
    console.log(`[SIMULATE API] Webhook result:`, webhookResult);

    return NextResponse.json({
      success: true,
      orderId: webhookResult.orderId,
      grabExternalId: grabOrder.grab_order_id,
      order: {
        customerName: grabOrder.customer_name,
        customerPhone: grabOrder.customer_phone,
        itemCount: items.length,
        totalAmount: grabOrder.total_amount,
      },
    });
  } catch (error) {
    console.error(`[SIMULATE API] Unexpected error:`, error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
