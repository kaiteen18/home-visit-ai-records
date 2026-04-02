/**
 * 環境変数
 * Supabase（publishable key / anon key）・OpenAI 用
 */

import fs from "node:fs";
import path from "node:path";

/** .env の前後空白・BOM を除去 */
function trimEnv(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const t = value.replace(/^\uFEFF/, "").trim();
  return t === "" ? undefined : t;
}

let warnedOpenAiKeyMismatchWithEnvLocal = false;

/**
 * Next.js は「シェルに既にある環境変数」を .env.local で上書きしない。
 * そのため ~/.zshrc 等で古い OPENAI_API_KEY を export していると、.env.local の新しいキーが無視され 401 になる。
 */
function warnIfOpenAiKeyDiffersFromEnvLocalFile(processKey: string): void {
  if (
    process.env.NODE_ENV !== "development" ||
    warnedOpenAiKeyMismatchWithEnvLocal ||
    !processKey
  ) {
    return;
  }
  warnedOpenAiKeyMismatchWithEnvLocal = true;
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, "utf8");
    const line = raw.split("\n").find((l) => {
      const t = l.trim();
      return t.startsWith("OPENAI_API_KEY=") && !t.startsWith("#");
    });
    if (!line) return;
    const eq = line.indexOf("=");
    let fileVal = line.slice(eq + 1).trim();
    if (
      (fileVal.startsWith('"') && fileVal.endsWith('"')) ||
      (fileVal.startsWith("'") && fileVal.endsWith("'"))
    ) {
      fileVal = fileVal.slice(1, -1);
    }
    fileVal = trimEnv(fileVal) ?? "";
    if (!fileVal || fileVal === processKey) return;
    console.warn(
      "[OpenAI] 警告: .env.local の OPENAI_API_KEY と、実行環境の OPENAI_API_KEY（シェル優先）が異なります。古いキーで 401 になることがあります。ターミナルで unset OPENAI_API_KEY を実行してから npm run dev をやり直すか、シェルの値を更新してください。"
    );
  } catch {
    /* ignore */
  }
}

export function getEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  };
}

/** Supabase 用: publishable key（anon key）のみ使用 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url === undefined || url === "") {
    console.error("[Supabase] NEXT_PUBLIC_SUPABASE_URL が未設定または空です");
    throw new Error(
      "Supabase の環境変数が設定されていません。NEXT_PUBLIC_SUPABASE_URL を設定してください。"
    );
  }

  if (!key || key.trim() === "") {
    console.error("[Supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定または空です");
    throw new Error(
      "Supabase の環境変数が設定されていません。NEXT_PUBLIC_SUPABASE_ANON_KEY（publishable key）を設定してください。"
    );
  }

  console.log("[Supabase] supabaseUrl:", url);
  console.log("[Supabase] supabaseAnonKey (先頭5文字):", key.slice(0, 5) + "***");

  return { url, key };
}

export type OpenAIEnv = {
  apiKey: string;
  model: string;
  /** 組織に複数プロジェクトがある場合など（任意） */
  organization?: string;
  /** sk-proj- キー利用時は必須になることが多い */
  project?: string;
};

/** OpenAI 用: APIキー・プロジェクトID 等（前後の空白・BOM は除去） */
export function getOpenAIEnv(): OpenAIEnv {
  const raw = process.env.OPENAI_API_KEY;
  const model = trimEnv(process.env.OPENAI_MODEL) ?? "gpt-4o-mini";
  const organization = trimEnv(process.env.OPENAI_ORG_ID);
  const project = trimEnv(process.env.OPENAI_PROJECT_ID);

  const key = trimEnv(raw) ?? "";
  warnIfOpenAiKeyDiffersFromEnvLocalFile(key);

  if (!key) {
    throw new Error(
      "OpenAI の環境変数が設定されていません。プロジェクト直下の .env.local に OPENAI_API_KEY を設定し、開発サーバーを再起動してください。"
    );
  }

  if (!key.startsWith("sk-")) {
    console.warn(
      "[OpenAI] OPENAI_API_KEY は通常 sk- で始まります。値のコピー漏れや別の値が入っていないか確認してください。"
    );
  }

  if (key.startsWith("sk-proj") && !project) {
    console.warn(
      "[OpenAI] sk-proj- で始まるキーはプロジェクトに紐づきます。.env.local に OPENAI_PROJECT_ID を追加してください（platform.openai.com → 該当プロジェクト → Settings → General）。"
    );
  }

  if (project?.startsWith("org_")) {
    console.warn(
      "[OpenAI] OPENAI_PROJECT_ID に org_ で始まる値が入っています。これは Organization ID です。Project ID（proj_ で始まる文字列）を OPENAI_PROJECT_ID に、Organization ID は OPENAI_ORG_ID に設定してください。"
    );
  }

  if (project && !project.startsWith("proj_")) {
    console.warn(
      "[OpenAI] OPENAI_PROJECT_ID は通常 proj_ で始まります。プロジェクトの Settings → General の「Project ID」をコピーしているか確認してください。"
    );
  }

  return { apiKey: key, model, organization, project };
}
