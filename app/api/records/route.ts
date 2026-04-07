import { NextResponse } from "next/server";
import { isUuidString } from "@/lib/is-uuid";
import { recordIdToString } from "@/lib/record-list";
import { getSupabase } from "@/lib/supabase";
import { PROMPT_TYPES, type PromptType } from "@/lib/prompts";

export async function GET() {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("records")
      .select(
        "id, patient_id, prompt_type, created_at, final_text, ai_output, patients(patient_name)"
      )
      .or("organization_id.eq.1,organization_id.is.null")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[api/records GET] Supabase select error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        { error: `一覧取得に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as Array<{
      id: string;
      patient_id: string | null;
      prompt_type: string | null;
      created_at: string;
      final_text: string | null;
      ai_output: string | null;
      patients: { patient_name: string } | { patient_name: string }[] | null;
    }>;

    const records = rows.map((r) => {
      const patients = r.patients;
      const patientName = Array.isArray(patients)
        ? patients[0]?.patient_name
        : patients?.patient_name;
      return {
        id: r.id,
        patient_id: r.patient_id,
        patient_name: patientName ?? null,
        prompt_type: r.prompt_type ?? "dar",
        created_at: r.created_at,
        final_text: r.final_text ?? null,
        ai_output: r.ai_output ?? null,
      };
    });

    console.log("[api/records GET] OK, count:", records.length);
    return NextResponse.json(records);
  } catch (err) {
    console.error("Records API error:", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました。" },
      { status: 500 }
    );
  }
}

/** 文字列フィールドの正規化 */
function toText(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") return value;
  return String(value);
}

function mapInsertErrorToJa(error: {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}): string {
  const msg = error.message ?? "";
  if (
    msg.includes("row-level security") ||
    msg.includes("RLS") ||
    error.code === "42501"
  ) {
    return "保存が拒否されました。Supabase の RLS で anon の INSERT ポリシー（records_insert 等）が有効か確認してください。";
  }
  if (msg.includes("violates not-null")) {
    return "必須項目が不足しています。input_text は空にできません。";
  }
  if (msg.includes("column") && msg.includes("does not exist")) {
    return "テーブル定義と一致しません。previous_record / prompt_type 用のマイグレーションを適用したか確認してください。";
  }
  return `保存に失敗しました: ${msg}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    console.log("[api/records POST] raw body:", JSON.stringify(body, null, 2));

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "リクエスト本文が不正です。" },
        { status: 400 }
      );
    }

    const orgRaw = body.organization_id;
    const organizationId =
      typeof orgRaw === "string" && orgRaw.trim() !== ""
        ? orgRaw.trim()
        : null;

    const patientIdRaw = body.patient_id;
    const patientId =
      typeof patientIdRaw === "string" && patientIdRaw.trim() !== ""
        ? patientIdRaw.trim()
        : null;

    const inputText = toText(body.input_text).trim();
    const aiOutput = toText(body.ai_output, "");
    const finalText = toText(body.final_text, "");
    const previousRecord = toText(body.previous_record, "");
    const promptTypeRaw = toText(body.prompt_type, "dar").toLowerCase();
    const promptType: PromptType = PROMPT_TYPES.includes(
      promptTypeRaw as PromptType
    )
      ? (promptTypeRaw as PromptType)
      : "dar";

    if (!patientId || !isUuidString(patientId)) {
      return NextResponse.json(
        { error: "患者を選択してください。" },
        { status: 400 }
      );
    }

    if (!finalText) {
      return NextResponse.json(
        { error: "確定テキスト（final_text）を入力してください。" },
        { status: 400 }
      );
    }

    if (!inputText) {
      console.warn("[api/records POST] validation: input_text empty");
      return NextResponse.json(
        { error: "今回メモ（input_text）を入力してください。" },
        { status: 400 }
      );
    }

    const insertPayload: {
      input_text: string;
      ai_output: string;
      final_text: string;
      previous_record: string;
      prompt_type: string;
      patient_id?: string;
      organization_id?: string;
    } = {
      input_text: inputText,
      ai_output: aiOutput,
      final_text: finalText,
      previous_record: previousRecord,
      prompt_type: promptType,
      patient_id: patientId,
    };
    if (organizationId) {
      insertPayload.organization_id = organizationId;
    }

    console.log("[api/records POST] insert payload (DB columns only):", {
      keys: Object.keys(insertPayload),
      input_text_length: insertPayload.input_text.length,
      ai_output_length: insertPayload.ai_output.length,
      final_text_length: insertPayload.final_text.length,
      has_organization_id: "organization_id" in insertPayload,
    });

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("records")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      console.error("[api/records POST] Supabase insert error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        { error: mapInsertErrorToJa(error) },
        { status: 500 }
      );
    }

    const insertedId = data?.id != null ? recordIdToString(data.id) : "";
    console.log("[api/records POST] insert OK, id:", insertedId);
    return NextResponse.json({ id: insertedId, success: true }, { status: 200 });
  } catch (err) {
    console.error("[api/records POST] unexpected:", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました。" },
      { status: 500 }
    );
  }
}
