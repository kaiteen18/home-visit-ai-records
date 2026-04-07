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

let envLocalParsed: Record<string, string> | null = null;

/** プロジェクト直下の .env.local をパース（キャッシュ）。本番では通常ファイルなし。 */
function readEnvLocalMap(): Record<string, string> {
  if (envLocalParsed !== null) return envLocalParsed;
  envLocalParsed = {};
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(envPath)) return envLocalParsed;
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      envLocalParsed[k] = v.replace(/^\uFEFF/, "").trim();
    }
  } catch {
    /* ignore */
  }
  return envLocalParsed;
}

/**
 * OpenAI 用: .env.local の値を process.env より優先する。
 * Next はシェルに既にある変数を .env で上書きしないため、シェルの古い OPENAI_API_KEY だけが効いて 401 になるのを防ぐ。
 */
function pickOpenAiEnv(
  name: "OPENAI_API_KEY" | "OPENAI_PROJECT_ID" | "OPENAI_ORG_ID" | "OPENAI_MODEL"
): string | undefined {
  const fileMap = readEnvLocalMap();
  const fromFile = trimEnv(fileMap[name]);
  if (fromFile) return fromFile;
  return trimEnv(process.env[name]);
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

/** OpenAI 用: APIキー・プロジェクトID 等（前後の空白・BOM は除去。.env.local を優先） */
export function getOpenAIEnv(): OpenAIEnv {
  const key = pickOpenAiEnv("OPENAI_API_KEY") ?? "";
  const project = pickOpenAiEnv("OPENAI_PROJECT_ID");
  const organization = pickOpenAiEnv("OPENAI_ORG_ID");
  const model = pickOpenAiEnv("OPENAI_MODEL") ?? "gpt-4o-mini";

  if (process.env.NODE_ENV === "development") {
    const procOnly = trimEnv(process.env.OPENAI_API_KEY);
    const fileFirst = trimEnv(readEnvLocalMap()["OPENAI_API_KEY"]);
    if (fileFirst && procOnly && fileFirst !== procOnly && key === fileFirst) {
      console.log(
        "[OpenAI] .env.local の OPENAI_API_KEY を使用しています（シェル環境の値とは異なります）。"
      );
    }
  }

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
