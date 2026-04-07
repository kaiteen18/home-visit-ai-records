"use client";

import { useState } from "react";
import { Button, Textarea } from "@/components/ui";
import { fetchApi } from "@/lib/fetch-api";
import type { RecordDetail } from "@/types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  record: RecordDetail;
};

export function RecordDetailForm({ record }: Props) {
  const [finalText, setFinalText] = useState(record.final_text ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setIsSaving(true);

    try {
      const result = await fetchApi<{ error?: string }>(
        `/api/records/${encodeURIComponent(record.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ final_text: finalText }),
        }
      );

      if (!result.ok) {
        setMessage({ type: "error", text: result.error });
        return;
      }

      setMessage({ type: "success", text: "保存しました。" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "通信エラーが発生しました。",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
        <dl className="grid gap-3 text-sm md:grid-cols-[120px_1fr]">
          <dt className="text-slate-500">訪問日</dt>
          <dd>{formatDate(record.visit_date)}</dd>

          <dt className="text-slate-500">作成日時</dt>
          <dd>{formatDateTime(record.created_at)}</dd>

          {record.previous_record ? (
            <>
              <dt className="text-slate-500">前回記録</dt>
              <dd className="whitespace-pre-wrap break-words text-ink">
                {record.previous_record}
              </dd>
            </>
          ) : null}

          <dt className="text-slate-500">今回メモ</dt>
          <dd className="whitespace-pre-wrap break-words text-ink">
            {record.input_text || "—"}
          </dd>

          {record.prompt_type ? (
            <>
              <dt className="text-slate-500">記録形式</dt>
              <dd className="uppercase text-ink">{record.prompt_type}</dd>
            </>
          ) : null}

          <dt className="text-slate-500">AI出力</dt>
          <dd className="whitespace-pre-wrap break-words text-ink">
            {record.ai_output || "—"}
          </dd>
        </dl>
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        <Textarea
          label="確定テキスト"
          value={finalText}
          onChange={(e) => setFinalText(e.target.value)}
          rows={8}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "保存中..." : "保存する"}
          </Button>
          {message && (
            <span
              className={
                message.type === "success"
                  ? "text-sm text-accent"
                  : "text-sm text-red-600"
              }
            >
              {message.text}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
