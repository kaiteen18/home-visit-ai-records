import { NextResponse } from "next/server";
import { z } from "zod";
import { isUuidString } from "@/lib/is-uuid";
import { requireOrgAdmin } from "@/lib/require-org-admin";

const patchBodySchema = z.object({
  role: z.enum(["member", "admin"]),
});

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireOrgAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status }
    );
  }

  const { userId: rawUserId } = await context.params;
  const targetUserId = rawUserId?.trim() ?? "";
  if (!isUuidString(targetUserId)) {
    return NextResponse.json({ error: "userId \u304c UUID \u3067\u306f\u3042\u308a\u307e\u305b\u3093\u3002" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "\u30ea\u30af\u30a8\u30b9\u30c8\u672c\u6587\u304c\u4e0d\u6b63\u3067\u3059\u3002" },
      { status: 400 }
    );
  }

  const parsed = patchBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "role\uff08member|admin\uff09\u304c\u5fc5\u8981\u3067\u3059\u3002" },
      { status: 400 }
    );
  }

  const { supabase, organizationId } = gate.auth;

  try {
    const { data: existing, error: selErr } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("user_id", targetUserId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (selErr) {
      console.error("[admin/organization-members PATCH] select:", selErr);
      return NextResponse.json(
        { error: "\u30e1\u30f3\u30d0\u30fc\u306e\u78ba\u8a8d\u306b\u5931\u6557\u3057\u307e\u3057\u305f: " + selErr.message },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json(
        { error: "\u3053\u306e\u7d44\u7e54\u306b\u8a72\u5f53\u3059\u308b\u30e1\u30f3\u30d0\u30fc\u304c\u3044\u307e\u305b\u3093\u3002" },
        { status: 404 }
      );
    }

    const { error: rpcErr } = await supabase.rpc("admin_upsert_organization_member", {
      p_user_id: targetUserId,
      p_organization_id: organizationId,
      p_role: parsed.data.role,
    });

    if (rpcErr) {
      console.error("[admin/organization-members PATCH] rpc:", rpcErr);
      return NextResponse.json(
        { error: "\u30ed\u30fc\u30eb\u306e\u66f4\u65b0\u306b\u5931\u6557\u3057\u307e\u3057\u305f: " + rpcErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/organization-members PATCH] unexpected:", err);
    return NextResponse.json(
      { error: "\u4e88\u671f\u3057\u306a\u3044\u30a8\u30e9\u30fc\u304c\u767a\u751f\u3057\u307e\u3057\u305f\u3002" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const gate = await requireOrgAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status }
    );
  }

  const { userId: rawUserId } = await context.params;
  const targetUserId = rawUserId?.trim() ?? "";
  if (!isUuidString(targetUserId)) {
    return NextResponse.json({ error: "userId \u304c UUID \u3067\u306f\u3042\u308a\u307e\u305b\u3093\u3002" }, { status: 400 });
  }

  const { supabase, organizationId, user } = gate.auth;

  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: "\u81ea\u5206\u81ea\u8eab\u3092\u7d44\u7e54\u304b\u3089\u5916\u3059\u3053\u3068\u306f\u3067\u304d\u307e\u305b\u3093\u3002" },
      { status: 400 }
    );
  }

  try {
    const { error: delErr } = await supabase
      .from("organization_members")
      .delete()
      .eq("user_id", targetUserId)
      .eq("organization_id", organizationId);

    if (delErr) {
      console.error("[admin/organization-members DELETE]:", delErr);
      return NextResponse.json(
        { error: "\u30e1\u30f3\u30d0\u30fc\u306e\u524a\u9664\u306b\u5931\u6557\u3057\u307e\u3057\u305f: " + delErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/organization-members DELETE] unexpected:", err);
    return NextResponse.json(
      { error: "\u4e88\u671f\u3057\u306a\u3044\u30a8\u30e9\u30fc\u304c\u767a\u751f\u3057\u307e\u3057\u305f\u3002" },
      { status: 500 }
    );
  }
}
