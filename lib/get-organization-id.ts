import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthResult =
  | { ok: true; supabase: SupabaseClient; user: User; organizationId: string }
  | { ok: false; status: 401; error: string }
  | { ok: false; status: 403; error: string };

const DEFAULT_ORG_NAME = "デフォルト組織";

function toOrganizationIdString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" ? value : String(value);
}

/**
 * organization_members を解決する。無ければ organizations を1件作成し、
 * organization_members に user_id と紐づけて挿入する（1ユーザー1組織）。
 * 競合時は UNIQUE(user_id) を検知して再取得する。
 */
async function resolveOrganizationIdWithAutoProvision(
  supabase: SupabaseClient,
  user: User
): Promise<
  | { ok: true; organizationId: string }
  | { ok: false; status: 403; error: string }
> {
  const { data: row, error: selectError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (selectError) {
    console.error(
      "[organization] organization_members select error:",
      selectError.message,
      selectError.code,
      selectError.details,
      selectError.hint
    );
    return {
      ok: false,
      status: 403,
      error: `組織情報の取得に失敗しました: ${selectError.message}`,
    };
  }

  const existingId = toOrganizationIdString(row?.organization_id);
  if (existingId) {
    return { ok: true, organizationId: existingId };
  }

  const { data: orgRow, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: DEFAULT_ORG_NAME })
    .select("id")
    .single();

  if (orgError) {
    console.error(
      "[organization] organizations insert error:",
      orgError.message,
      orgError.code,
      orgError.details,
      orgError.hint
    );
    return {
      ok: false,
      status: 403,
      error: `組織の作成に失敗しました: ${orgError.message}`,
    };
  }

  const newOrgId = toOrganizationIdString(orgRow?.id);
  if (!newOrgId) {
    console.error("[organization] organizations insert returned no id");
    return {
      ok: false,
      status: 403,
      error: "組織の作成に失敗しました（ID が取得できませんでした）。",
    };
  }

  const { data: afterOrgRace, error: afterOrgRaceErr } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!afterOrgRaceErr) {
    const racedId = toOrganizationIdString(afterOrgRace?.organization_id);
    if (racedId) {
      return { ok: true, organizationId: racedId };
    }
  }

  const { error: memberError } = await supabase.from("organization_members").insert({
    user_id: user.id,
    organization_id: newOrgId,
    role: "member",
  });

  if (memberError) {
    const isUniqueViolation = String(memberError.code) === "23505";
    if (isUniqueViolation) {
      const { data: retryRow, error: retryErr } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (retryErr) {
        console.error(
          "[organization] organization_members re-fetch after conflict:",
          retryErr.message,
          retryErr.code,
          retryErr.details,
          retryErr.hint
        );
        return {
          ok: false,
          status: 403,
          error: `組織の紐付けに失敗しました: ${retryErr.message}`,
        };
      }

      const retryId = toOrganizationIdString(retryRow?.organization_id);
      if (!retryId) {
        return {
          ok: false,
          status: 403,
          error: "組織の紐付けを確認できませんでした。",
        };
      }
      return { ok: true, organizationId: retryId };
    }

    console.error(
      "[organization] organization_members insert error:",
      memberError.message,
      memberError.code,
      memberError.details,
      memberError.hint
    );
    return {
      ok: false,
      status: 403,
      error: `組織メンバーの登録に失敗しました: ${memberError.message}`,
    };
  }

  return { ok: true, organizationId: newOrgId };
}

/**
 * セッション＋ organization_members（必要なら自動作成）から組織コンテキストを解決する。
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

  const resolved = await resolveOrganizationIdWithAutoProvision(supabase, user);
  if (!resolved.ok) {
    return {
      ok: false,
      status: resolved.status,
      error: resolved.error,
    };
  }

  return {
    ok: true,
    supabase,
    user,
    organizationId: resolved.organizationId,
  };
}

/**
 * organization_id のみ必要な場合（後方互換）。
 * 可能なら requireAuth() を1回だけ使う方が効率的。
 */
export async function getOrganizationId(): Promise<string | null> {
  const r = await requireAuth();
  return r.ok ? r.organizationId : null;
}
