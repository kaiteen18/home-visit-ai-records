import { NextRequest, NextResponse } from "next/server";
import { getOrganizationId, requireAuth } from "@/lib/get-organization-id";
import { getSupabase } from "@/lib/supabase";

const PATIENTS_LIST_SELECT = "id, patient_name" as const;

const UNAUTHORIZED_MESSAGE =
  "認証に失敗したか、組織に所属していません。ログインし直してください。";

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { supabase, organizationId } = auth;

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

    const body = await request.json().catch(() => null);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "リクエスト本文が不正です。" },
        { status: 400 }
      );
    }

    const nameRaw = body.patient_name;
    const patientName =
      typeof nameRaw === "string" ? nameRaw.trim() : "";

    if (!patientName) {
      return NextResponse.json(
        { error: "患者名（patient_name）を入力してください。" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

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
