export const PROMPT_TYPES = ["dar", "soap"] as const;
export type PromptType = (typeof PROMPT_TYPES)[number];

export const GENERATION_MODES = ["normal", "audit"] as const;
export type GenerationMode = (typeof GENERATION_MODES)[number];

/**
 * DAR（自然文・高精度版）
 * 構造は内部で保持しつつ、出力は自然文に統一
 */
const DAR_INSTRUCTION = `
あなたは訪問看護歴20年以上の認定看護師です。
目的は「監査に耐える、かつ自然で読みやすい記録を作成すること」です。

---

【出力形式（絶対遵守）】

F：問題名

D:
　本文

A:
　本文

R:
　本文

---

【最重要ルール】

・各項目は自然な文章で記載する
・「背景」「所見」「差分」などの項目名は出力しない
・改行後は全角スペース1つで書き始める
・余計な説明は禁止

---

【Dルール】

必ず以下を文章内に含める：

・医学的背景
・現在の状態（客観的所見）
・前回との差分（以下のいずれかを文章内で表現）
　前回と同様 / 新規 / 改善 / 悪化

※構造は内部で整理し、出力は自然文とする

---

【Aルール】

必ず「目的＋介入」で自然文として記載

例：
　浮腫評価のため下肢観察を実施した。

---

【Rルール】

必ず含める：

・評価
・本人の反応
・リスク
・訪問看護継続理由

※すべて自然文で記載

---

【差分ルール】

・必ず1つ以上含める
・以下のいずれかを文章内に含める
　前回と同様 / 新規 / 改善 / 悪化

---

【禁止】

・項目名の出力（背景：所見：差分：など）
・箇条書き
・推測
・曖昧表現（やや、少し など）
・一般論

---

【精度ルール】

・1 Focus = 1問題
・最大3 Focus
・医学的重要度順
`;

/**
 * SOAP（自然文）
 */
const SOAP_INSTRUCTION = `
あなたは訪問看護歴20年以上の認定看護師です。

---

【出力形式（絶対遵守）】

S:
　本文

O:
　本文

A:
　本文

P:
　本文

---

【ルール】

■ S（主観）
・本人・家族の発言のみ

■ O（客観）
・観察・数値・事実のみ

■ A（評価）
・問題点を明確にする
・必ずリスクを含める

■ P（計画）
・具体的対応のみ
・目的が明確であること

---

【禁止】

・文章のみの出力
・SとOの混在
・曖昧表現
・一般論
`;

/**
 * 入力ブロック
 */
export function buildInputSection(previousRecord: string, currentInput: string): string {
  return `【入力】

前回記録：
${previousRecord.trim() || "（なし）"}

今回メモ：
${currentInput.trim()}
`;
}

/**
 * 差分制御
 */
const DIFF_RULES = `
【差分ルール】

・前回と比較し必ず変化を明示する
・以下のいずれかで表現する：
　前回と同様 / 新規 / 改善 / 悪化
・入力にない事実は記載しない
`;

const NO_PREVIOUS = `
【前回記録なし】

差分比較は行わず、今回メモのみで記載する
`;

export function resolveGenerationMode(mode: unknown): GenerationMode {
  return typeof mode === "string" &&
    GENERATION_MODES.includes(mode as GenerationMode)
    ? (mode as GenerationMode)
    : "normal";
}

/**
 * メインプロンプト生成
 */
export function getPrompt(
  promptType: PromptType,
  previousRecord: string,
  currentInput: string,
  mode: GenerationMode = "normal"
): string {
  const instruction =
    promptType === "soap" ? SOAP_INSTRUCTION : DAR_INSTRUCTION;

  const input = buildInputSection(previousRecord, currentInput);

  const diff = previousRecord.trim()
    ? DIFF_RULES
    : NO_PREVIOUS;

  return `${instruction}

${input}

${diff}
`;
}

/**
 * userメッセージ
 */
export function getGenerateUserContent(
  promptType: PromptType,
  previousRecord: string,
  currentInput: string
): string {
  const input = buildInputSection(previousRecord, currentInput);

  if (promptType === "dar") {
    return `以下の入力に基づき、必ずDAR形式のみで出力してください。
通常の文章は禁止です。
必ず F： D: A: R: の形式で出力してください。

${input}`;
  }

  return `以下の入力に基づき、必ずSOAP形式のみで出力してください。

${input}`;
}