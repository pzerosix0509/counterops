import { createBrowserClient } from "@supabase/ssr";
import { createMockBrowserClient } from "@/lib/mock/supabase";

export function createSupabaseBrowserClient() {
  if (process.env.NEXT_PUBLIC_MOCK === "true") {
    // If the user is in the mock version, return MockBrowserClient()
    return createMockBrowserClient() as any;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Thiếu biến môi trường NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return createBrowserClient(url, key);
}
