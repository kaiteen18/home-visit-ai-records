import { NextResponse } from "next/server";
import { isUuidString } from "@/lib/is-uuid";
import { getSupabase } from "@/lib/supabase";
import { PROMPT_TYPES, type PromptType } from "@/lib/prompts";

function toText(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") return value;
  return String(value);
}

type RecordRow = {
  id: string;
  patient_id: string | null;
  organization_id: string | number | null;
  input_text: string | null;
  previous_record: string | null;
  ai_output: string | null;
  final_text: string | null;
  prompt_type: string | null;
  created_at: string;
  patients: { patient_name: string } | { patient_name: string }[] | null;
};

/** GET: 1件取得（編集画面用） */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || !isUuidString(id)) {
      return NextResponse.json(
        { error: "レコードIDが不正です。" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("records")
      .select(
        "id, patient_id, organization_id, input_text, previous_record, ai_output, final_text, prompt_type, created_at, patients(patient_name)"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[api/records/[id] GET] Supabase select error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        id,
      });
      return NextResponse.json(
        { error: `記録の取得に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "記録が見つかりません。" },
        { status: 404 }
      );
    }

    const row = data as RecordRow;
    const patients = row.patients;
    const patientName = Array.isArray(patients)
      ? patients[0]?.patient_name
      : patients?.patient_name;

    return NextResponse.json({
      id: row.id,
      patient_id: row.patient_id,
      organization_id: row.organization_id,
      patient_name: patientName ?? null,
      input_text: row.input_text ?? "",
      previous_record: row.previous_record ?? "",
      ai_output: row.ai_output ?? "",
      final_text: row.final_text ?? "",
      prompt_type: row.prompt_type ?? "dar",
      created_at: row.created_at,
    });
  } catch (err) {
    console.error("[api/records/[id] GET] unexpected:", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました。" },
      { status: 500 }
    );
  }
}

/** PATCH: 既存レコード更新（organization_id は変更しない） */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || !isUuidString(id)) {
      return NextResponse.json(
        { error: "レコードIDが不正です。" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "リクエスト本文が不正です。" },
        { status: 400 }
      );
    }

    const hasUpdatableField =
      "input_text" in body ||
      "final_text" in body ||
      "ai_output" in body ||
      "previous_record" in body ||
      "prompt_type" in body ||
      "patient_id" in body;

    if (!hasUpdatableField) {
      return NextResponse.json(
        { error: "更新する項目（final_text など）を指定してください。" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const updatePayload: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };

    if ("input_text" in body) {
      const inputText = toText(body.input_text).trim();
      if (!inputText) {
        return NextResponse.json(
          { error: "今回メモ（input_text）を空にすることはできません。" },
          { status: 400 }
        );
      }
      updatePayload.input_text = inputText;
    }

    if ("final_text" in body) {
      const v = toText(body.final_text, "");
      if (!v.trim()) {
        return NextResponse.json(
          { error: "確定テキスト（final_text）を空にすることはできません。" },
          { status: 400 }
        );
      }
      updatePayload.final_text = v.trim();
    }

    if ("ai_output" in body) {
      updatePayload.ai_output = toText(body.ai_output, "");
    }

    if ("previous_record" in body) {
      updatePayload.previous_record = toText(body.previous_record, "");
    }

    if ("prompt_type" in body) {
      const promptTypeRaw = toText(body.prompt_type, "dar").toLowerCase();
      const promptType: PromptType = PROMPT_TYPES.includes(
        promptTypeRaw as PromptType
      )
        ? (promptTypeRaw as PromptType)
        : "dar";
      updatePayload.prompt_type = promptType;
    }

    if ("patient_id" in body) {
      const v = body.patient_id;
      const trimmed =
        v !== undefined && v !== null && typeof v === "string"
          ? v.trim()
          : "";
      if (!trimmed || !isUuidString(trimmed)) {
        return NextResponse.json(
          { error: "患者を選択してください。" },
          { status: 400 }
        );
      }
      updatePayload.patient_id = trimmed;
    }

    const { data: updated, error } = await supabase
      .from("records")
      .update(updatePayload)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[api/records/[id] PATCH] Supabase update error:", {
        message: error.message,
        code: error.code,
        id,
      });
      const msg = error.message ?? "";
      if (
        msg.includes("column") &&
        (msg.includes("does not exist") || msg.includes("previous_record"))
      ) {
        return NextResponse.json(
          {
            error:
              "DB に必要なカラムがありません。Supabase のマイグレーションを適用してください。",
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: "保存に失敗しました。" },
        { status: 500 }
      );
    }

    if (!updated) {
      console.error("[api/records/[id] PATCH] no row updated for id:", id);
      return NextResponse.json(
        { error: "記録が見つかりません。" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[api/records/[id] PATCH] unexpected:", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました。" },
      { status: 500 }
    );
  }
}
