import { NextRequest, NextResponse } from "next/server";
import { isUuidString } from "@/lib/is-uuid";
import { requireAuth } from "@/lib/get-organization-id";

/** 患者の最新記録1件を取得（前回記録欄の自動表示用） */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { supabase, organizationId } = auth;

    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("patient_id")?.trim();

    if (!patientId || !isUuidString(patientId)) {
      return NextResponse.json(
        { error: "patient_id には患者の UUID（patients.id）を指定してください。" },
        { status: 400 }
      );
    }

    const { data: patientRow, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("id", patientId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (patientError) {
      console.error("[api/records/latest GET] patients select error:", {
        message: patientError.message,
        code: patientError.code,
      });
      return NextResponse.json(
        { error: `患者の確認に失敗しました: ${patientError.message}` },
        { status: 500 }
      );
    }

    if (!patientRow) {
      return NextResponse.json(
        { error: "患者が見つかりません。" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("records")
      .select("id, final_text, ai_output")
      .eq("patient_id", patientId)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[api/records/latest GET] Supabase select error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        { error: `最新記録の取得に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    const record = data;
    const finalText =
      record?.final_text != null && String(record.final_text).trim() !== ""
        ? String(record.final_text).trim()
        : "";
    const aiOutput =
      record?.ai_output != null && String(record.ai_output).trim() !== ""
        ? String(record.ai_output).trim()
        : "";

    const previousRecord = finalText || aiOutput || "";

    return NextResponse.json({
      previous_record: previousRecord,
      record_id: record?.id ?? null,
    });
  } catch (err) {
    console.error("Records latest API error:", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました。" },
      { status: 500 }
    );
  }
}
