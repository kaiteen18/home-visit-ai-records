import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthResult =
  | { ok: true; supabase: SupabaseClient; user: User; organizationId: string }
  | { ok: false; status: 401; error: string }
  | { ok: false; status: 403; error: string };

/**
 * セッション＋ organization_members から組織コンテキストを解決する。
 * API / Server Component から1回呼び、supabase クライアントを使い回すこと。
 */
export async function requireAuth(): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      status: 401,
      error: "未ログインです。",
    };
  }

  const { data: row, error: memError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (memError) {
    console.error("[requireAuth] organization_members select error:", memError);
    return {
      ok: false,
      status: 403,
      error: `組織情報の取得に失敗しました: ${memError.message}`,
    };
  }

  const raw = row?.organization_id;
  if (raw === null || raw === undefined || raw === "") {
    return {
      ok: false,
      status: 403,
      error:
        "組織が特定できません。organization_members にユーザーを登録してください。",
    };
  }

  const organizationId =
    typeof raw === "string" ? raw : String(raw);

  return { ok: true, supabase, user, organizationId };
}

/**
 * organization_members から organization_id のみ必要な場合（後方互換）。
 * 可能なら requireAuth() を1回だけ使う方が効率的。
 */
export async function getOrganizationId(): Promise<string | null> {
  const r = await requireAuth();
  return r.ok ? r.organizationId : null;
}
