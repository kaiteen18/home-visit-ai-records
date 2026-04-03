import { NextResponse } from "next/server";
import { isUuidString } from "@/lib/is-uuid";
import { getSupabase } from "@/lib/supabase";
import { PROMPT_TYPES, type PromptType } from "@/lib/prompts";

function toText(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") return value;
  return String(value);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);

    if (!id) {
      return NextResponse.json(
        { error: "レコードIDが指定されていません。" },
        { status: 400 }
      );
    }

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

    const updatePayload: Record<string, string | null> = {
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

    const { error } = await supabase
      .from("records")
      .update(updatePayload)
      .eq("id", id);

    if (error) {
      console.error("Supabase update error:", error);
      const msg = error.message ?? "";
      if (
        msg.includes("column") &&
        (msg.includes("does not exist") || msg.includes("previous_record"))
      ) {
        return NextResponse.json(
          {
            error:
              "DB に previous_record / prompt_type カラムがありません。Supabase のマイグレーションを適用してください。",
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: "保存に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("Records PATCH error:", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました。" },
      { status: 500 }
    );
  }
}
