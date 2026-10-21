import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let catalogClient: SupabaseClient | null = null;

/** Anon client with no cookies, so catalog reads can sit inside a 60s cache. */
export function getCatalogSupabase(): SupabaseClient {
  if (catalogClient) return catalogClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }
  catalogClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return catalogClient;
}
