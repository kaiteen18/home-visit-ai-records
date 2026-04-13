import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin } from "@/lib/require-org-admin";

const upsertBodySchema = z.object({
  user_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  role: z.enum(["member", "admin"]),
});

export type OrganizationMemberRow = {
  id: string;
  user_id: string;
  organization_id: string;
  role: string;
  created_at: string;
  display_name: string | null;
};

export async function GET() {
  const gate = await requireOrgAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status }
    );
  }

  const { supabase, organizationId } = gate.auth;

  try {
    const { data: orgRow, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .single();

    if (orgErr) {
      console.error("[admin/organization-members GET] org error:", orgErr);
      return NextResponse.json(
        { error: "\u7d44\u7e54\u60c5\u5831\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f: " + orgErr.message },
        { status: 500 }
      );
    }

    const { data: members, error: memErr } = await supabase
      .from("organization_members")
      .select("id, user_id, organization_id, role, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });

    if (memErr) {
      console.error("[admin/organization-members GET] members error:", memErr);
      return NextResponse.json(
        { error: "\u30e1\u30f3\u30d0\u30fc\u4e00\u89a7\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f: " + memErr.message },
        { status: 500 }
      );
    }

    const list = members ?? [];
    const userIds = list.map((m) => m.user_id);
    let profileMap = new Map<string, string | null>();

    if (userIds.length > 0) {
      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);

      if (profErr) {
        console.error("[admin/organization-members GET] profiles error:", profErr);
      } else {
        profileMap = new Map(
          (profiles ?? []).map((p) => [p.id, p.display_name ?? null])
        );
      }
    }

    const enriched: OrganizationMemberRow[] = list.map((m) => ({
      id: m.id,
      user_id: m.user_id,
      organization_id: m.organization_id,
      role: m.role,
      created_at: m.created_at,
      display_name: profileMap.get(m.user_id) ?? null,
    }));

    return NextResponse.json({
      organization: orgRow,
      members: enriched,
    });
  } catch (err) {
    console.error("[admin/organization-members GET] unexpected:", err);
    return NextResponse.json(
      { error: "\u4e88\u671f\u3057\u306a\u3044\u30a8\u30e9\u30fc\u304c\u767a\u751f\u3057\u307e\u3057\u305f\u3002" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const gate = await requireOrgAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status }
    );
  }

  const { supabase, organizationId } = gate.auth;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "\u30ea\u30af\u30a8\u30b9\u30c8\u672c\u6587\u304c\u4e0d\u6b63\u3067\u3059\u3002" },
      { status: 400 }
    );
  }

  const parsed = upsertBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "user_id\uff08UUID\uff09\u30fborganization_id\uff08UUID\uff09\u30fbrole\uff08member|admin\uff09\u304c\u5fc5\u8981\u3067\u3059\u3002" },
      { status: 400 }
    );
  }

  const { user_id, organization_id, role } = parsed.data;

  if (organization_id !== organizationId) {
    return NextResponse.json(
      { error: "organization_id \u306f\u3001\u30ed\u30b0\u30a4\u30f3\u4e2d\u306e\u7ba1\u7406\u8005\u304c\u6240\u5c5e\u3059\u308b\u7d44\u7e54\u306e ID \u3068\u4e00\u81f4\u3055\u305b\u3066\u304f\u3060\u3055\u3044\u3002" },
      { status: 403 }
    );
  }

  try {
    const { error: rpcErr } = await supabase.rpc("admin_upsert_organization_member", {
      p_user_id: user_id,
      p_organization_id: organization_id,
      p_role: role,
    });

    if (rpcErr) {
      const code = rpcErr.code ?? "";
      const msg = rpcErr.message ?? "";
      console.error("[admin/organization-members POST] rpc error:", code, msg);

      if (msg.includes("not_admin") || code === "P0001") {
        return NextResponse.json({ error: "\u7ba1\u7406\u8005\u6a29\u9650\u304c\u5fc5\u8981\u3067\u3059\u3002" }, { status: 403 });
      }
      if (msg.includes("org_mismatch")) {
        return NextResponse.json(
          { error: "\u4ed6\u7d44\u7e54\u3078\u306e\u5272\u308a\u5f53\u3066\u306f\u3067\u304d\u307e\u305b\u3093\u3002" },
          { status: 403 }
        );
      }
      if (msg.includes("invalid_role")) {
        return NextResponse.json({ error: "role \u304c\u4e0d\u6b63\u3067\u3059\u3002" }, { status: 400 });
      }

      return NextResponse.json(
        { error: "\u30e1\u30f3\u30d0\u30fc\u306e\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f: " + msg },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[admin/organization-members POST] unexpected:", err);
    return NextResponse.json(
      { error: "\u4e88\u671f\u3057\u306a\u3044\u30a8\u30e9\u30fc\u304c\u767a\u751f\u3057\u307e\u3057\u305f\u3002" },
      { status: 500 }
    );
  }
}
