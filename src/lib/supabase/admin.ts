import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createMockAdminClient } from "@/lib/mock/supabase";

let cached: SupabaseClient | null = null;

export function createSupabaseAdminClient(): SupabaseClient {
  if (process.env.NEXT_PUBLIC_MOCK === "true") {
    // If its in the mock version, then return the MockAdminClient()
    return createMockAdminClient() as any;
  }
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Thiếu SUPABASE_SERVICE_ROLE_KEY. Không thể dùng admin client.");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
