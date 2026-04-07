import { createBrowserClient } from "@supabase/ssr";

/**
 * ブラウザ用 Supabase（セッションは Cookie 経由でサーバーと共有）
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url?.trim() || !key?.trim()) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY が必要です。"
    );
  }
  return createBrowserClient(url, key);
}
