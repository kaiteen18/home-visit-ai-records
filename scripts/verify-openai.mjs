/**
 * OpenAI の認証を .env.local だけで切り分ける（Next.js を経由しない）。
 * 使い方: プロジェクトルートで
 *   node scripts/verify-openai.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

function loadDotEnvLocal(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error("見つかりません:", filePath);
    process.exit(1);
  }
  const env = {};
  const raw = fs.readFileSync(filePath, "utf8");
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
    env[k] = v.replace(/^\uFEFF/, "").trim();
  }
  return env;
}

const env = loadDotEnvLocal(envPath);
const apiKey = env.OPENAI_API_KEY;
const project = env.OPENAI_PROJECT_ID;
const organization = env.OPENAI_ORG_ID;

if (!apiKey) {
  console.error("OPENAI_API_KEY が .env.local にありません。");
  process.exit(1);
}

console.log("キー先頭:", apiKey.slice(0, 12) + "…");
console.log("OPENAI_PROJECT_ID:", project || "（未設定）");
console.log("OPENAI_ORG_ID:", organization || "（未設定）");

const client = new OpenAI({
  apiKey,
  ...(organization ? { organization } : {}),
  ...(project ? { project } : {}),
});

try {
  console.log("models.list() を試行中…");
  const list = await client.models.list();
  console.log("成功。最初のモデル例:", list.data[0]?.id ?? "(なし)");
  process.exit(0);
} catch (e) {
  console.error("失敗:", e.message || e);
  if (e.status === 401) {
    console.error(
      "\n→ キーが OpenAI 側で無効です。platform.openai.com でプロジェクトの API keys から新規発行し、OPENAI_PROJECT_ID と同じプロジェクトのものか確認してください。"
    );
  }
  process.exit(1);
}
