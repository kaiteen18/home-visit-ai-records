import { AuthenticationError } from "openai";
import { NextResponse } from "next/server";
import { getOrganizationId } from "@/lib/get-organization-id";
import { generateDraft } from "@/lib/openai";
import { isUuidString } from "@/lib/is-uuid";
import {
  PROMPT_TYPES,
  resolveGenerationMode,
  type PromptType,
} from "@/lib/prompts";

const UNAUTHORIZED_MESSAGE =
  "\u8a8d\u8a3c\u306b\u5931\u6557\u3057\u305f\u304b\u3001\u7d44\u7e54\u306b\u6240\u5c5e\u3057\u3066\u3044\u307e\u305b\u3093\u3002\u30ed\u30b0\u30a4\u30f3\u3057\u76f4\u3057\u3066\u304f\u3060\u3055\u3044\u3002";

const OPENAI_PROJ_HINT =
  "\uff081\uff09API\u30ad\u30fc\u306f\u300c\u305d\u306e\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u300d\u753b\u9762\u306e API keys \u3067\u65b0\u898f\u767a\u884c\u3057\u305f sk-proj- \u30ad\u30fc\u3092\u4f7f\u3046\uff08\u5225\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u3084\u30a2\u30ab\u30a6\u30f3\u30c8\u5168\u4f53\u306e\u30ad\u30fc\u3060\u3068\u7121\u52b9\u306b\u306a\u308a\u307e\u3059\uff09\u3002\uff082\uff09OPENAI_PROJECT_ID \u306f proj_ \u3067\u59cb\u307e\u308b Project ID \u3067\u3059\u3002org_ \u306f Organization ID \u306a\u306e\u3067 OPENAI_ORG_ID \u7528\u3067\u3059\u3002\uff083\uff09\u8907\u6570\u7d44\u7e54\u306e\u5834\u5408\u306f OPENAI_ORG_ID\uff08org_\u2026\uff09\u3082 .env.local \u306b\u8ffd\u52a0\u3002\uff084\uff09\u4fdd\u5b58\u5f8c\u306b npm run dev \u3092\u518d\u8d77\u52d5\u3002";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "\u30ea\u30af\u30a8\u30b9\u30c8\u306e\u5f62\u5f0f\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002" },
      { status: 400 }
    );
  }

  const organizationId = await getOrganizationId();
  if (!organizationId) {
    return NextResponse.json(
      { error: UNAUTHORIZED_MESSAGE },
      { status: 401 }
    );
  }

  // organizationId: reserved for org-scoped quotas / rate limits (foundation).

  const patientIdRaw = body.patient_id;
  const patientId =
    typeof patientIdRaw === "string" ? patientIdRaw.trim() : "";

  if (!patientId || !isUuidString(patientId)) {
    return NextResponse.json(
      { error: "\u60a3\u8005\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044\u3002" },
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
      { error: "\u4eca\u56de\u30e1\u30e2\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002" },
      { status: 400 }
    );
  }

  try {
    const generatedText = await generateDraft(
      previousRecord.trim(),
      currentInput.trim(),
      promptType,
      mode
    );

    return NextResponse.json({ ai_output: generatedText });
  } catch (err: unknown) {
    console.error("[api/generate] OpenAI / generateDraft error:", err);

    const message =
      err instanceof Error ? err.message : "AI\u751f\u6210\u4e2d\u306b\u30a8\u30e9\u30fc\u304c\u767a\u751f\u3057\u307e\u3057\u305f\u3002";

    let errorText =
      "AI\u751f\u6210\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u3057\u3070\u3089\u304f\u7d4c\u3063\u3066\u304b\u3089\u518d\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002";
    if (
      message.includes("DAR\u5f62\u5f0f") ||
      message.includes("\u5fdc\u7b54\u3092\u751f\u6210\u3067\u304d\u307e\u305b\u3093") ||
      message.includes("AI \u304c\u5fdc\u7b54")
    ) {
      errorText = message;
    } else if (message.includes("OPENAI") || message.includes("\u74b0\u5883\u5909\u6570")) {
      errorText = message;
    } else if (message.includes("rate limit") || message.includes("429")) {
      errorText =
        "\u30ea\u30af\u30a8\u30b9\u30c8\u56de\u6570\u304c\u4e0a\u9650\u306b\u9054\u3057\u307e\u3057\u305f\u3002\u3057\u3070\u3089\u304f\u5f85\u3063\u3066\u304b\u3089\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002";
    } else if (
      err instanceof AuthenticationError ||
      message.includes("401") ||
      message.includes("Incorrect API key")
    ) {
      const projHint =
        message.includes("sk-proj") || message.includes("sk-proj-")
          ? OPENAI_PROJ_HINT
          : "";
      errorText = `OpenAI API \u306e\u8a8d\u8a3c\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002${projHint}`;
    } else if (message.includes("insufficient_quota")) {
      errorText =
        "OpenAI \u306e\u5229\u7528\u67a0\u304c\u4e0d\u8db3\u3057\u3066\u3044\u307e\u3059\u3002\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002";
    }

    const isOpenAiAuthFailure =
      err instanceof AuthenticationError ||
      message.includes("401") ||
      message.includes("Incorrect API key");

    return NextResponse.json(
      { error: errorText },
      { status: isOpenAiAuthFailure ? 401 : 500 }
    );
  }
}
