import { NextResponse } from "next/server";
import { z } from "zod";
import { isUuidString } from "@/lib/is-uuid";
import { requireOrgAdmin } from "@/lib/require-org-admin";

const memberBodySchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["member", "admin"]),
});

type RouteContext = { params: Promise<{ organizationId: string }> };

export type AdminOrganizationMemberRow = {
  id: string;
  user_id: string;
  organization_id: string;
  role: "member" | "admin";
  created_at: string;
  display_name: string | null;
};

export async function GET(_request: Request, context: RouteContext) {
  const gate = await requireOrgAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status }
    );
  }

  const { organizationId: rawOrganizationId } = await context.params;
  const organizationId = rawOrganizationId?.trim() ?? "";
  if (!isUuidString(organizationId)) {
    return NextResponse.json(
      { error: "organizationId が UUID ではありません。" },
      { status: 400 }
    );
  }

  const { supabase } = gate.auth;
  const { data, error } = await supabase.rpc(
    "admin_list_organization_members",
    { p_organization_id: organizationId }
  );

  if (error) {
    console.error("[admin/organizations members GET] rpc:", error);
    return NextResponse.json(
      { error: "メンバー一覧の取得に失敗しました: " + error.message },
      { status: error.message.includes("not_admin") ? 403 : 500 }
    );
  }

  return NextResponse.json({
    members: (data ?? []) as AdminOrganizationMemberRow[],
  });
}

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireOrgAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status }
    );
  }

  const { organizationId: rawOrganizationId } = await context.params;
  const organizationId = rawOrganizationId?.trim() ?? "";
  if (!isUuidString(organizationId)) {
    return NextResponse.json(
      { error: "organizationId が UUID ではありません。" },
      { status: 400 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエスト本文が不正です。" },
      { status: 400 }
    );
  }

  const parsed = memberBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "user_id（UUID）と role（member|admin）が必要です。" },
      { status: 400 }
    );
  }

  const { supabase } = gate.auth;
  const { user_id, role } = parsed.data;

  const { error } = await supabase.rpc("admin_upsert_member_for_organization", {
    p_user_id: user_id,
    p_organization_id: organizationId,
    p_role: role,
  });

  if (error) {
    console.error("[admin/organizations members POST] rpc:", error);
    const msg = error.message ?? "";
    if (msg.includes("not_admin")) {
      return NextResponse.json(
        { error: "管理者権限が必要です。" },
        { status: 403 }
      );
    }
    if (msg.includes("invalid_role")) {
      return NextResponse.json(
        { error: "role が不正です。" },
        { status: 400 }
      );
    }
    if (msg.includes("organization_not_found")) {
      return NextResponse.json(
        { error: "指定された事業所が見つかりません。" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "メンバーの保存に失敗しました: " + msg },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
