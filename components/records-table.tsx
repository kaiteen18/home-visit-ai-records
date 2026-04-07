"use client";

import Link from "next/link";
import type { RecordListApiItem } from "@/types";

function formatDateTime(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(str: string, maxLen: number): string {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}

/** final_text > ai_output の優先順位で表示テキストを取得。どちらも空なら「未作成」 */
function getDisplayText(record: RecordListApiItem): string {
  const text =
    (record.final_text && record.final_text.trim()) ||
    (record.ai_output && record.ai_output.trim()) ||
    "";
  if (!text) return "未作成";
  return truncate(text, 100);
}

function formatPromptType(promptType: string): string {
  return promptType?.toUpperCase() === "SOAP" ? "SOAP" : "DAR";
}

type Props = { records: RecordListApiItem[] };

export function RecordsTable({ records }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-line bg-slate-50">
            <th className="px-4 py-3 text-sm font-medium text-slate-700">
              患者名
            </th>
            <th className="px-4 py-3 text-sm font-medium text-slate-700">
              記録日時
            </th>
            <th className="px-4 py-3 text-sm font-medium text-slate-700">
              記録形式
            </th>
            <th className="px-4 py-3 text-sm font-medium text-slate-700">
              最終版テキスト
            </th>
            <th className="w-24 px-4 py-3 text-sm font-medium text-slate-700">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr
              key={record.id}
              className="border-b border-line transition hover:bg-accentSoft/50 last:border-b-0"
            >
              <td className="px-4 py-3 text-sm text-ink">
                {record.patient_name ?? "—"}
              </td>
              <td className="px-4 py-3 text-sm text-ink">
                {formatDateTime(record.created_at)}
              </td>
              <td className="px-4 py-3 text-sm text-ink">
                {formatPromptType(record.prompt_type)}
              </td>
              <td className="max-w-md truncate px-4 py-3 text-sm text-slate-600">
                {getDisplayText(record)}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                  <Link
                    href={`/records/${record.id}/edit`}
                    className="text-sm text-accent underline hover:text-teal-700"
                  >
                    編集
                  </Link>
                  <Link
                    href={`/records/${record.id}`}
                    className="text-sm text-slate-600 underline hover:text-ink"
                  >
                    詳細
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
