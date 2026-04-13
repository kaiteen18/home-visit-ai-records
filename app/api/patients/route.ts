import { NextRequest, NextResponse } from "next/server";
import { getOrganizationId, requireAuth } from "@/lib/get-organization-id";

const PATIENTS_LIST_SELECT = "id, patient_name" as const;

const UNAUTHORIZED_MESSAGE =
  "認証に失敗したか、組織に所属していません。ログインし直してください。";

function authFailureResponse(
  status: 401 | 403,
  error: string
): NextResponse<{ error: string }> {
  if (status === 401) {
    return NextResponse.json({ error }, { status: 401 });
  }
  return NextResponse.json({ error: UNAUTHORIZED_MESSAGE }, { status: 401 });
}

export async function GET(_request: NextRequest) {
  try {
    const organizationId = await getOrganizationId();
    if (!organizationId) {
      return NextResponse.json(
        { error: UNAUTHORIZED_MESSAGE },
        { status: 401 }
      );
    }

    const auth = await requireAuth();
    if (!auth.ok) {
      return authFailureResponse(auth.status, auth.error);
    }

    if (auth.organizationId !== organizationId) {
      return NextResponse.json(
        { error: UNAUTHORIZED_MESSAGE },
        { status: 401 }
      );
    }

    const { supabase } = auth;

    const { data, error } = await supabase
      .from("patients")
      .select(PATIENTS_LIST_SELECT)
      .eq("organization_id", organizationId)
      .order("patient_name", { ascending: true });

    if (error) {
      console.error("[api/patients GET] Supabase select error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      return NextResponse.json(
        { error: `患者一覧の取得に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      patients: data ?? [],
    });
  } catch (err) {
    console.error("[api/patients GET] unexpected error:", {
      name: err instanceof Error ? err.name : "Unknown",
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      cause: err instanceof Error ? err.cause : undefined,
    });

    return NextResponse.json(
      { error: "予期しないエラーが発生しました。" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const organizationId = await getOrganizationId();
    if (!organizationId) {
      return NextResponse.json(
        { error: UNAUTHORIZED_MESSAGE },
        { status: 401 }
      );
    }

    const auth = await requireAuth();
    if (!auth.ok) {
      return authFailureResponse(auth.status, auth.error);
    }

    if (auth.organizationId !== organizationId) {
      return NextResponse.json(
        { error: UNAUTHORIZED_MESSAGE },
        { status: 401 }
      );
    }

    const { supabase } = auth;

    const body = await request.json().catch(() => null);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "リクエスト本文が不正です。" },
        { status: 400 }
      );
    }

    // organization_id は body から受け付けない（サーバー側の organizationId のみ使用）
    const nameRaw = (body as Record<string, unknown>).patient_name;
    const patientName =
      typeof nameRaw === "string" ? nameRaw.trim() : "";

    if (!patientName) {
      return NextResponse.json(
        { error: "患者名（patient_name）を入力してください。" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("patients")
      .insert({
        patient_name: patientName,
        organization_id: organizationId,
      })
      .select("id, patient_name")
      .single();

    if (error) {
      console.error("[api/patients POST] Supabase insert error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        { error: `患者の登録に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ patient: data }, { status: 201 });
  } catch (err) {
    console.error("[api/patients POST] unexpected error:", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました。" },
      { status: 500 }
    );
  }
}
