-- 既存DBで 20250321000005 適用時に patient_code が残っている場合のみ除去（新規は CREATE に含まれない）
ALTER TABLE patients DROP COLUMN IF EXISTS patient_code;
