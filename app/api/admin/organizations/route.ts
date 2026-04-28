import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin } from "@/lib/require-org-admin";

const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  admin_user_id: z.string().uuid(),
});

export type AdminOrganizationRow = {
  id: string;
  name: string;
  created_at: string;
  admin_count: number;
  member_count: number;
};

export async function GET() {
  const gate = await requireOrgAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status }
    );
  }

  const { supabase } = gate.auth;

  const { data, error } = await supabase.rpc("admin_list_organizations");

  if (error) {
    console.error("[admin/organizations GET] rpc:", error);
    return NextResponse.json(
      { error: "事業所一覧の取得に失敗しました: " + error.message },
      { status: error.message.includes("not_admin") ? 403 : 500 }
    );
  }

  return NextResponse.json({
    organizations: (data ?? []) as AdminOrganizationRow[],
  });
}

export async function POST(request: Request) {
  const gate = await requireOrgAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status }
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

  const parsed = createOrganizationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "事業所名と管理者 user_id（UUID）が必要です。" },
      { status: 400 }
    );
  }

  const { supabase } = gate.auth;
  const { name, admin_user_id } = parsed.data;

  const { data: organizationId, error } = await supabase.rpc(
    "admin_create_organization",
    {
      p_name: name,
      p_admin_user_id: admin_user_id,
    }
  );

  if (error) {
    console.error("[admin/organizations POST] rpc:", error);
    const msg = error.message ?? "";
    if (msg.includes("not_admin")) {
      return NextResponse.json(
        { error: "管理者権限が必要です。" },
        { status: 403 }
      );
    }
    if (msg.includes("invalid_name")) {
      return NextResponse.json(
        { error: "事業所名を入力してください。" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "事業所の作成に失敗しました: " + msg },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { id: String(organizationId), name },
    { status: 201 }
  );
}
