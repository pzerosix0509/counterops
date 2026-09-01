/**
 * Mock Grab HTTP Client
 * 
 * This client simulates calling GrabFood Merchant API without making real network requests.
 * All operations complete INSTANTLY (no setTimeout/delays) for demo purposes.
 * Logs all actions with [GRAB MOCK] prefix for visibility.
 * 
 * Note: In a real integration (after capstone), this would be replaced with:
 * - Actual HTTP client (axios/fetch) calling https://api.grab.com/...
 * - OAuth2 token refresh logic
 * - Retry/circuit-breaker pattern (see src/lib/ai/circuit-breaker.ts)
 */

import type { 
  GrabMockAuthToken, 
  GrabMockOrder, 
  GrabMockOrderAcceptResponse, 
  GrabMockStoreStatus 
} from "./types";

class GrabMockClient {
  private clientId: string;
  private clientSecret: string;
  private merchantId: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(clientId: string, clientSecret: string, merchantId: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.merchantId = merchantId;
    console.log(`[GRAB MOCK] Client initialized for merchant ${merchantId}`);
  }

  /**
   * Mock OAuth2 token generation (client_credentials flow)
   * In reality, calls POST https://api.grab.com/oauth2/token
   */
  async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      console.log(`[GRAB MOCK] Using cached access token`);
      return this.accessToken;
    }

    // Mock: generate new token
    console.log(`[GRAB MOCK] Generating new access token for client ${this.clientId}`);
    const token = `grab_mock_token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresIn = 3600; // 1 hour
    this.accessToken = token;
    this.tokenExpiresAt = Date.now() + expiresIn * 1000;

    return token;
  }

  /**
   * Mock: Accept or reject an incoming order
   * In reality, calls POST https://api.grab.com/v1/partner/me/orders/{orderId}/accept
   */
  async acceptOrder(grabOrderId: string, acceptRequest: { acceptance_status: "accepted" | "rejected" }): Promise<GrabMockOrderAcceptResponse> {
    const token = await this.getAccessToken();
    console.log(`[GRAB MOCK] Calling acceptOrder: orderId=${grabOrderId}, status=${acceptRequest.acceptance_status}, token=${token.substring(0, 20)}...`);

    // Mock response (instant, no network delay)
    const response: GrabMockOrderAcceptResponse = {
      success: true,
      grab_order_id: grabOrderId,
      status: acceptRequest.acceptance_status,
      message: `Order ${acceptRequest.acceptance_status} successfully by mock client`,
    };

    console.log(`[GRAB MOCK] acceptOrder response:`, response);
    return response;
  }

  /**
   * Mock: Update order status
   * In reality, calls PUT https://api.grab.com/v1/partner/me/orders/{orderId}/status
   */
  async updateOrderStatus(
    grabOrderId: string,
    status: "preparing" | "ready_for_pickup" | "picked_up" | "completed" | "cancelled"
  ): Promise<{ success: boolean; message: string }> {
    const token = await this.getAccessToken();
    console.log(`[GRAB MOCK] Calling updateOrderStatus: orderId=${grabOrderId}, status=${status}`);

    const response = {
      success: true,
      message: `Order status updated to '${status}' in mock Grab system`,
    };

    console.log(`[GRAB MOCK] updateOrderStatus response:`, response);
    return response;
  }

  /**
   * Mock: Get store online/offline status
   * In reality, calls GET https://api.grab.com/v1/partner/me/stores/{merchantId}/status
   */
  async getStoreStatus(): Promise<GrabMockStoreStatus> {
    const token = await this.getAccessToken();
    console.log(`[GRAB MOCK] Calling getStoreStatus for merchant ${this.merchantId}`);

    const response: GrabMockStoreStatus = {
      merchant_id: this.merchantId,
      is_online: true, // Mock always returns true (actual status fetched from DB)
      last_updated: new Date().toISOString(),
    };

    console.log(`[GRAB MOCK] getStoreStatus response:`, response);
    return response;
  }

  /**
   * Mock: Set store online/offline
   * In reality, calls POST https://api.grab.com/v1/partner/me/stores/{merchantId}/status
   */
  async setStoreOnlineStatus(isOnline: boolean): Promise<{ success: boolean; is_online: boolean }> {
    const token = await this.getAccessToken();
    console.log(`[GRAB MOCK] Calling setStoreOnlineStatus: isOnline=${isOnline} for merchant ${this.merchantId}`);

    const response = {
      success: true,
      is_online: isOnline,
    };

    console.log(`[GRAB MOCK] setStoreOnlineStatus response:`, response);
    return response;
  }
}

/**
 * Singleton instance (lazily initialized with env vars)
 * For use in server-side actions/API routes only
 */
let grabMockClientInstance: GrabMockClient | null = null;

export function getGrabMockClient(): GrabMockClient {
  if (!grabMockClientInstance) {
    const clientId = process.env.GRAB_MOCK_CLIENT_ID || "mock_client_id";
    const clientSecret = process.env.GRAB_MOCK_CLIENT_SECRET || "mock_client_secret";
    const merchantId = process.env.GRAB_MOCK_MERCHANT_ID || "1-MOCK000001";
    grabMockClientInstance = new GrabMockClient(clientId, clientSecret, merchantId);
  }
  return grabMockClientInstance;
}

export default GrabMockClient;
