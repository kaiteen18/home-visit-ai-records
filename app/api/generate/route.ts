import { AuthenticationError } from "openai";
import { NextResponse } from "next/server";
import { generateDraft } from "@/lib/openai";
import {
  PROMPT_TYPES,
  resolveGenerationMode,
  type PromptType,
} from "@/lib/prompts";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "リクエストの形式が正しくありません。" },
      { status: 400 }
    );
  }

  try {

    let patientId: string | number | null = null;
    if (typeof body.patient_id === "number") {
      patientId = body.patient_id;
    } else if (typeof body.patient_id === "string") {
      const trimmed = body.patient_id.trim();
      if (trimmed === "") {
        patientId = null;
      } else {
        const asNum = Number(trimmed);
        patientId = Number.isNaN(asNum) ? trimmed : asNum;
      }
    }

    if (patientId === null) {
      return NextResponse.json(
        { error: "患者を選択してください。" },
        { status: 400 }
      );
    }

    if (typeof patientId === "number" && Number.isNaN(patientId)) {
      return NextResponse.json(
        { error: "患者を選択してください。" },
        { status: 400 }
      );
    }

    const previousRecord =
      typeof body.previous_record === "string" ? body.previous_record : "";
    const currentInput =
      typeof body.current_input === "string"
        ? body.current_input
        : typeof body.input_text === "string"
          ? body.input_text
          : "";

    const promptType =
      typeof body.prompt_type === "string" &&
      PROMPT_TYPES.includes(body.prompt_type as PromptType)
        ? (body.prompt_type as PromptType)
        : "dar";

    const mode = resolveGenerationMode(body.mode);

    if (!currentInput.trim()) {
      return NextResponse.json(
        { error: "今回メモを入力してください。" },
        { status: 400 }
      );
    }

    const generatedText = await generateDraft(
      previousRecord.trim(),
      currentInput.trim(),
      promptType,
      mode
    );

    return NextResponse.json({ ai_output: generatedText });
  } catch (err: unknown) {
    console.error("Generate API error:", err);

    const message =
      err instanceof Error ? err.message : "AI生成中にエラーが発生しました。";

    let errorText = "AI生成に失敗しました。しばらく経ってから再度お試しください。";
    if (
      message.includes("DAR形式") ||
      message.includes("応答を生成できません") ||
      message.includes("AI が応答")
    ) {
      errorText = message;
    } else if (message.includes("OPENAI") || message.includes("環境変数")) {
      errorText = message;
    } else if (message.includes("rate limit") || message.includes("429")) {
      errorText =
        "リクエスト回数が上限に達しました。しばらく待ってからお試しください。";
    } else if (
      err instanceof AuthenticationError ||
      message.includes("401") ||
      message.includes("Incorrect API key")
    ) {
      const projHint =
        message.includes("sk-proj") || message.includes("sk-proj-")
          ? "（1）APIキーは「そのプロジェクト」画面の API keys で新規発行した sk-proj- キーを使う（別プロジェクトやアカウント全体のキーだと無効になります）。（2）OPENAI_PROJECT_ID は proj_ で始まる Project ID です。org_ は Organization ID なので OPENAI_ORG_ID 用です。（3）複数組織の場合は OPENAI_ORG_ID（org_…）も .env.local に追加。（4）保存後に npm run dev を再起動。"
          : "";
      errorText = `OpenAI API の認証に失敗しました。${projHint}`;
    } else if (message.includes("insufficient_quota")) {
      errorText =
        "OpenAI の利用枠が不足しています。アカウントを確認してください。";
    }

    const isAuthFailure =
      err instanceof AuthenticationError ||
      message.includes("401") ||
      message.includes("Incorrect API key");

    return NextResponse.json(
      { error: errorText },
      { status: isAuthFailure ? 401 : 500 }
    );
  }
}
