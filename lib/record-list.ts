import type { RecordListApiItem } from "@/types";

/** Supabase / JSON 由来の id を URL・API 用の文字列に統一（数値の bigserial でも string 化） */
export function recordIdToString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

/** GET /api/records の各行を RecordListApiItem に正規化（index や連番は使わない） */
export function normalizeRecordListItem(raw: unknown): RecordListApiItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = recordIdToString(r.id);
  if (!id) return null;

  const pid = r.patient_id;
  const patient_id =
    pid === null || pid === undefined
      ? null
      : typeof pid === "string"
        ? pid
        : String(pid);

  const pname = r.patient_name;
  const patient_name =
    pname === null || pname === undefined
      ? null
      : typeof pname === "string"
        ? pname
        : String(pname);

  const pt = typeof r.prompt_type === "string" ? r.prompt_type.toLowerCase() : "dar";
  const prompt_type = pt === "soap" ? "soap" : "dar";

  const created =
    typeof r.created_at === "string"
      ? r.created_at
      : String(r.created_at ?? "");

  const ft = r.final_text;
  const final_text =
    ft === null || ft === undefined ? null : String(ft);

  const ao = r.ai_output;
  const ai_output =
    ao === null || ao === undefined ? null : String(ao);

  return {
    id,
    patient_id,
    patient_name,
    prompt_type,
    created_at: created,
    final_text,
    ai_output,
  };
}

export function normalizeRecordListResponse(data: unknown): RecordListApiItem[] {
  if (!Array.isArray(data)) return [];
  const out: RecordListApiItem[] = [];
  for (const item of data) {
    const row = normalizeRecordListItem(item);
    if (row) out.push(row);
  }
  return out;
}
