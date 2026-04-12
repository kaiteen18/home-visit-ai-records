import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";

let serverClient: SupabaseClient | null = null;

/**
 * サーバー側の Supabase クライアント（anon key）。
 * organization_id は API で getOrganizationId() により決定し、クエリで .eq する。
 */
export function getSupabase(): SupabaseClient {
  if (!serverClient) {
    const { url, key } = getSupabaseEnv();
    serverClient = createClient(url, key);
  }
  return serverClient;
}

export { createSupabaseBrowserClient } from "./supabase/client";
export { createSupabaseServerClient } from "./supabase/server";
