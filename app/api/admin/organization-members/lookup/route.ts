import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin } from "@/lib/require-org-admin";

const bodySchema = z.object({
  email: z.string().min(3).max(320),
});

export async function POST(request: Request) {
  const gate = await requireOrgAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status }
    );
  }

  const { supabase } = gate.auth;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "\u30ea\u30af\u30a8\u30b9\u30c8\u672c\u6587\u304c\u4e0d\u6b63\u3067\u3059\u3002" },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "email \u304c\u5fc5\u8981\u3067\u3059\u3002" },
      { status: 400 }
    );
  }

  const email = parsed.data.email.trim();

  try {
    const { data: userId, error: rpcErr } = await supabase.rpc(
      "admin_lookup_user_by_email",
      { p_email: email }
    );

    if (rpcErr) {
      const msg = rpcErr.message ?? "";
      console.error("[admin/lookup POST] rpc error:", rpcErr.code, msg);
      if (msg.includes("not_admin")) {
        return NextResponse.json({ error: "\u7ba1\u7406\u8005\u6a29\u9650\u304c\u5fc5\u8981\u3067\u3059\u3002" }, { status: 403 });
      }
      return NextResponse.json(
        { error: "\u30e6\u30fc\u30b6\u30fc\u691c\u7d22\u306b\u5931\u6557\u3057\u307e\u3057\u305f: " + msg },
        { status: 500 }
      );
    }

    if (userId === null || userId === undefined || userId === "") {
      return NextResponse.json(
        { error: "\u8a72\u5f53\u3059\u308b\u30e6\u30fc\u30b6\u30fc\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002" },
        { status: 404 }
      );
    }

    return NextResponse.json({ user_id: String(userId) });
  } catch (err) {
    console.error("[admin/lookup POST] unexpected:", err);
    return NextResponse.json(
      { error: "\u4e88\u671f\u3057\u306a\u3044\u30a8\u30e9\u30fc\u304c\u767a\u751f\u3057\u307e\u3057\u305f\u3002" },
      { status: 500 }
    );
  }
}
