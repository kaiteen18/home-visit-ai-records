import { AuthenticationError } from "openai";
import { toFile } from "openai/uploads";
import { NextResponse } from "next/server";
import { getOrganizationId } from "@/lib/get-organization-id";
import { getOpenAI } from "@/lib/openai";

const UNAUTHORIZED_MESSAGE =
  "認証に失敗したか、組織に所属していません。ログインし直してください。";

/** Whisper API 上限に合わせる（ホスティングのリクエストボディ上限より小さい場合あり） */
const MAX_BYTES = 25 * 1024 * 1024;

export const runtime = "nodejs";

/** Vercel 等で長めの音声に備える（未使用ホストでは無視される） */
export const maxDuration = 120;

export async function POST(request: Request) {
  const organizationId = await getOrganizationId();
  if (!organizationId) {
    return NextResponse.json({ error: UNAUTHORIZED_MESSAGE }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "multipart/form-data で音声ファイル（file）を送ってください。" },
      { status: 400 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error("[api/transcribe] formData parse error:", err);
    return NextResponse.json(
      { error: "リクエスト本文の読み取りに失敗しました。ファイルサイズ上限に達していないか確認してください。" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "音声フィールド file が必要です。" },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "音声ファイルが空です。" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "音声ファイルは25MB 以下にしてください。" },
      { status: 400 }
    );
  }

  const name =
    file.name && file.name.trim() !== ""
      ? file.name
      : `audio.${guessExtension(file.type)}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadable = await toFile(buffer, name, {
      type: file.type || "application/octet-stream",
    });

    const openai = getOpenAI();
    const transcription = await openai.audio.transcriptions.create({
      file: uploadable,
      model: "whisper-1",
      language: "ja",
    });

    const text = typeof transcription.text === "string" ? transcription.text.trim() : "";
    return NextResponse.json({ text });
  } catch (err: unknown) {
    console.error("[api/transcribe] OpenAI transcription error:", err);

    const message =
      err instanceof Error ? err.message : "文字起こし中にエラーが発生しました。";

    if (
      err instanceof AuthenticationError ||
      message.includes("401") ||
      message.includes("Incorrect API key")
    ) {
      return NextResponse.json(
        { error: "OpenAI API の認証に失敗しました。APIキーを確認してください。" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "音声の文字起こしに失敗しました。別の形式で録音するか、手入力してください。" },
      { status: 500 }
    );
  }
}

function guessExtension(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  return "webm";
}
