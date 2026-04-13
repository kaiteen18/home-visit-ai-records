import { requireAuth, type AuthResult } from "@/lib/get-organization-id";

export type OrgAdminOk = {
  ok: true;
  auth: Extract<AuthResult, { ok: true }>;
};

export type OrgAdminFail = {
  ok: false;
  status: number;
  error: string;
};

export type OrgAdminResult = OrgAdminOk | OrgAdminFail;

/**
 * ログイン済みかつ organization_members.role = admin のみ通す。
 */
export async function requireOrgAdmin(): Promise<OrgAdminResult> {
  const auth = await requireAuth();
  if (!auth.ok) {
    return { ok: false, status: auth.status, error: auth.error };
  }

  const { supabase, user, organizationId } = auth;

  const { data: row, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[requireOrgAdmin] select error:", error.message, error.code);
    return {
      ok: false,
      status: 500,
      error: "権限の確認に失敗しました。",
    };
  }

  if (!row || row.role !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "管理者権限が必要です。",
    };
  }

  return { ok: true, auth };
}
