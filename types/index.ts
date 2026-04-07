/**
 * 共通型定義
 */

export type RecordInsert = {
  organization_id: string | null;
  input_text: string;
  ai_output?: string | null;
  final_text?: string | null;
};

export type RecordRow = RecordInsert & {
  id: string;
  created_at: string;
  updated_at: string;
};

export type RecordListItem = {
  id: string;
  visit_date: string | null;
  input_text: string;
  previous_record?: string | null;
  prompt_type?: string | null;
  ai_output: string | null;
  final_text: string | null;
  created_at: string;
};

export type RecordDetail = RecordListItem;

export type RecordListApiItem = {
  id: string;
  patient_id: string | null;
  patient_name: string | null;
  prompt_type: string;
  created_at: string;
  final_text: string | null;
  ai_output: string | null;
};

/** GET /api/records/[id] のレスポンス（編集画面用） */
export type RecordDetailApiResponse = {
  id: string;
  patient_id: string | null;
  organization_id: string | number | null;
  patient_name: string | null;
  input_text: string;
  previous_record: string;
  ai_output: string;
  final_text: string;
  prompt_type: string;
  created_at: string;
};
