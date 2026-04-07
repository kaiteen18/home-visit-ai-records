"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Textarea } from "@/components/ui";
import { fetchApi } from "@/lib/fetch-api";
import { cn } from "@/lib/utils";
import type { RecordDetailApiResponse } from "@/types";
import type { PromptType } from "@/lib/prompts";

type Props = { recordId: string };

export function RecordEditForm({ recordId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [patientId, setPatientId] = useState("");
  const [patientName, setPatientName] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [previousRecord, setPreviousRecord] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [finalText, setFinalText] = useState("");
  const [promptType, setPromptType] = useState<PromptType>("dar");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const result = await fetchApi<RecordDetailApiResponse>(
          `/api/records/${encodeURIComponent(recordId)}`
        );
        if (cancelled) return;
        if (!result.ok) {
          setLoadError(result.error);
          return;
        }
        const d = result.data;
        setPatientId(d.patient_id ?? "");
        setPatientName(d.patient_name);
        setInputText(d.input_text ?? "");
        setPreviousRecord(d.previous_record ?? "");
        setAiOutput(d.ai_output ?? "");
        setFinalText(d.final_text ?? "");
        setPromptType(
          d.prompt_type === "soap" ? "soap" : "dar"
        );
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "通信エラーが発生しました。"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [recordId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      const result = await fetchApi<{ error?: string }>(
        `/api/records/${encodeURIComponent(recordId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patient_id: patientId,
            input_text: inputText.trim(),
            previous_record: previousRecord,
            ai_output: aiOutput,
            final_text: finalText.trim(),
            prompt_type: promptType,
          }),
        }
      );
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      router.push("/records");
      router.refresh();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "通信エラーが発生しました。"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="text-center text-slate-500">読み込み中...</p>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
        <p className="font-medium">記録を読み込めませんでした</p>
        <p className="mt-2 text-sm">{loadError}</p>
        <Link
          href="/records"
          className="mt-4 inline-block text-accent underline hover:text-teal-700"
        >
          一覧へ戻る
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
        <dl className="grid gap-2 text-sm">
          <dt className="text-slate-500">患者</dt>
          <dd className="text-ink">{patientName ?? "—"}</dd>
          <dt className="text-slate-500">患者ID（UUID）</dt>
          <dd className="break-all font-mono text-xs text-slate-600">
            {patientId || "—"}
          </dd>
        </dl>
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium text-slate-700">記録形式</span>
        <div
          className="inline-flex rounded-xl border border-line bg-slate-50 p-1"
          role="group"
          aria-label="記録形式"
        >
          <button
            type="button"
            disabled={saving}
            onClick={() => setPromptType("dar")}
            className={cn(
              "min-w-[7rem] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
              promptType === "dar"
                ? "bg-accent text-white shadow-sm"
                : "text-slate-600 hover:bg-white",
            )}
          >
            DAR
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setPromptType("soap")}
            className={cn(
              "min-w-[7rem] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
              promptType === "soap"
                ? "bg-accent text-white shadow-sm"
                : "text-slate-600 hover:bg-white",
            )}
          >
            SOAP
          </button>
        </div>
      </div>

      <Textarea
        label="前回記録"
        value={previousRecord}
        onChange={(e) => setPreviousRecord(e.target.value)}
        rows={4}
        className="bg-white"
        disabled={saving}
      />

      <Textarea
        label="今回メモ（input_text）"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        rows={5}
        className="bg-white"
        disabled={saving}
        required
      />

      <Textarea
        label="AI出力（ai_output）"
        value={aiOutput}
        onChange={(e) => setAiOutput(e.target.value)}
        rows={6}
        className="bg-white"
        disabled={saving}
      />

      <Textarea
        label="確定テキスト（final_text）"
        value={finalText}
        onChange={(e) => setFinalText(e.target.value)}
        rows={8}
        className="bg-white"
        disabled={saving}
        required
      />

      {saveError ? (
        <p className="text-sm text-red-600" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving || !inputText.trim() || !finalText.trim()}>
          {saving ? "保存中..." : "保存して一覧へ"}
        </Button>
        <Link
          href="/records"
          className="inline-flex items-center rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-slate-50"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}
