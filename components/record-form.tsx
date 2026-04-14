"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Textarea } from "@/components/ui";
import { VoiceMemoControls } from "@/components/voice-memo-controls";
import { fetchApi } from "@/lib/fetch-api";
import { cn } from "@/lib/utils";
import type { GenerationMode, PromptType } from "@/lib/prompts";

const REVISE_PLACEHOLDER =
  "例：「Focusを2つにまとめる」「生活情報だけ短く」「SOAPのAをもう少し具体的に」";

type Patient = { id: string; patient_name: string };

export function RecordForm() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState<string | null>(null);

  const [patientId, setPatientId] = useState<string>("");
  const [previousRecord, setPreviousRecord] = useState("");
  const [inputText, setInputText] = useState("");
  const [promptType, setPromptType] = useState<PromptType>("dar");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("normal");
  const [aiOutput, setAiOutput] = useState("");
  const [finalText, setFinalText] = useState("");
  const [instruction, setInstruction] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevising, setIsRevising] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);

  const busy = isGenerating || isRevising || isSaving || voiceBusy;
  const hasAiOutput = Boolean(aiOutput.trim());
  const hasPatient = Boolean(patientId.trim());

  useEffect(() => {
    async function fetchPatients() {
      setPatientsLoading(true);
      setPatientsError(null);
      try {
        const res = await fetch("/api/patients");
        const text = await res.text();

        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          console.error(
            "[RecordForm] /api/patients JSONパース失敗 本文先頭120文字:",
            text.slice(0, 120)
          );
          setPatientsError("患者一覧の取得に失敗しました。APIがJSONを返していません。");
          setPatients([]);
          return;
        }

        if (!res.ok) {
          const errMsg =
            data && typeof data === "object" && "error" in data
              ? String((data as { error: unknown }).error)
              : "患者一覧の取得に失敗しました。";
          console.error("[RecordForm] /api/patients error:", errMsg);
          setPatientsError(errMsg);
          setPatients([]);
          return;
        }

        const list =
          data && typeof data === "object" && "patients" in data && Array.isArray((data as { patients: unknown }).patients)
            ? (data as { patients: Patient[] }).patients
            : [];
        setPatients(list);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "通信エラーが発生しました。";
        console.error("[RecordForm] /api/patients fetch error:", err);
        setPatientsError(msg);
        setPatients([]);
      } finally {
        setPatientsLoading(false);
      }
    }
    fetchPatients();
  }, []);

  useEffect(() => {
    if (!patientId) {
      setPreviousRecord("");
      return;
    }
  
    async function fetchLatestRecord() {
      try {
        const result = await fetchApi<{ previous_record?: string }>(
          `/api/records/latest?patient_id=${encodeURIComponent(patientId)}`
        );
        if (!result.ok) {
          console.error("[RecordForm] /api/records/latest error:", result.error);
          return;
        }
        const text =
          typeof result.data.previous_record === "string"
            ? result.data.previous_record
            : "";
        setPreviousRecord(text);
      } catch (err) {
        console.error("[RecordForm] /api/records/latest fetch error:", err);
      }
    }
  
    fetchLatestRecord();
  }, [patientId]);

  function clearMessages() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function applyVoiceText(text: string) {
    const t = text.trim();
    if (!t) return;
    setInputText((prev) => (prev.trim() ? `${prev.trim()}\n${t}` : t));
    setSuccessMessage("音声をテキストに反映しました。内容を確認してから「AIで記録作成」を押してください。");
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!hasPatient) {
      setSuccessMessage(null);
      setErrorMessage("患者を選択してください。");
      return;
    }
    if (!inputText.trim()) {
      setSuccessMessage(null);
      setErrorMessage("今回メモを入力してください。");
      return;
    }
    clearMessages();
    setIsGenerating(true);
    try {
      const result = await fetchApi<{ ai_output?: string }>("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId.trim(),
          previous_record: previousRecord,
          input_text: inputText.trim(),
          prompt_type: promptType,
          mode: generationMode,
        }),
      });
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      const next = typeof result.data.ai_output === "string" ? result.data.ai_output : "";
      setAiOutput(next);
      setFinalText(next);
      setSuccessMessage("AIで記録を作成しました。必要なら最終版を編集して保存してください。");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "通信エラーが発生しました。");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRevise(e: React.MouseEvent) {
    e.preventDefault();
    if (!aiOutput.trim()) {
      setSuccessMessage(null);
      setErrorMessage("先に「AIで記録作成」を実行してください。");
      return;
    }
    if (!instruction.trim()) {
      setSuccessMessage(null);
      setErrorMessage("修正指示を入力してください。");
      return;
    }
    clearMessages();
    setIsRevising(true);
    try {
      const result = await fetchApi<{ revised_output?: string }>("/api/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_output: aiOutput,
          instruction: instruction.trim(),
          prompt_type: promptType,
        }),
      });
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      const revised =
        typeof result.data.revised_output === "string" ? result.data.revised_output : "";
      setAiOutput(revised);
      setFinalText(revised);
      setSuccessMessage("再調整しました。最終版を確認して保存してください。");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "通信エラーが発生しました。");
    } finally {
      setIsRevising(false);
    }
  }

  async function handleSave(e: React.MouseEvent) {
    e.preventDefault();
    if (!hasPatient) {
      setSuccessMessage(null);
      setErrorMessage("患者を選択してから保存してください。");
      return;
    }
    if (!inputText.trim()) {
      setSuccessMessage(null);
      setErrorMessage("今回メモを入力してから保存してください。");
      return;
    }
    clearMessages();
    setIsSaving(true);
    const payload = {
      patient_id: patientId.trim(),
      previous_record: previousRecord,
      input_text: inputText.trim(),
      ai_output: aiOutput,
      final_text: finalText,
      prompt_type: promptType,
    };
    try {
      if (recordId) {
        const result = await fetchApi<{ error?: string }>(`/api/records/${recordId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!result.ok) {
          setErrorMessage(result.error);
          return;
        }
        setSuccessMessage("保存しました（更新）。");
      } else {
        const result = await fetchApi<{ id?: string }>("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!result.ok) {
          setErrorMessage(result.error);
          return;
        }
        const newId = typeof result.data.id === "string" ? result.data.id : null;
        if (newId) setRecordId(newId);
        setSuccessMessage(
          newId
            ? "保存しました（新規）。詳細画面で再編集できます。"
            : "保存しました（新規）。",
        );
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "通信エラーが発生しました。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-4 text-sm">
        <Link
          href="/records"
          className="text-accent underline hover:text-teal-700"
        >
          記録一覧
        </Link>
        <Link
          href="/records/new"
          className="text-accent underline hover:text-teal-700"
        >
          新規作成
        </Link>
        <Link
          href="/admin/organization-members"
          className="text-accent underline hover:text-teal-700"
        >
          {"\u7d44\u7e54\u30e1\u30f3\u30d0\u30fc\u7ba1\u7406"}
        </Link>
      </div>

      <div className="space-y-8">
        {/* 患者選択 */}
        <section className="rounded-xl border border-line bg-white p-6 shadow-panel">
          <h2 className="mb-4 text-base font-semibold text-ink">
            患者
          </h2>
          <div className="space-y-2">
            <label
              htmlFor="patient-select"
              className="block text-sm font-medium text-slate-700"
            >
              対象患者（必須）
            </label>
            <select
              id="patient-select"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              disabled={busy || patientsLoading}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {patientsLoading ? "読み込み中..." : "患者を選択してください"}
              </option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.patient_name}
                </option>
              ))}
            </select>
            {patientsError ? (
              <p className="text-sm text-red-600" role="alert">
                {patientsError}
              </p>
            ) : null}
            <p className="text-sm text-slate-600">
              <Link
                href="/patients/new"
                className="text-accent underline hover:text-teal-700"
              >
                患者を追加
              </Link>
            </p>
          </div>
        </section>

        {/* 入力ブロック */}
        <section className="rounded-xl border border-line bg-white p-6 shadow-panel">
          <h2 className="mb-4 text-base font-semibold text-ink">
            1. 入力・形式
          </h2>
          <form onSubmit={handleGenerate} className="space-y-5">
            <Textarea
              label="前回記録（任意）"
              placeholder="前回の訪問記録や要点を貼り付け"
              value={previousRecord}
              onChange={(e) => setPreviousRecord(e.target.value)}
              rows={5}
              className="bg-white"
              disabled={busy}
            />

            <Textarea
              label="今回メモ（必須・AI生成に使用）"
              placeholder="今回の観察・ケア内容などを入力"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              required
              rows={6}
              className="bg-white"
              disabled={busy}
            />

            <VoiceMemoControls
              disabled={busy}
              onApplyText={(t) => {
                clearMessages();
                applyVoiceText(t);
              }}
              onError={(msg) => {
                setSuccessMessage(null);
                setErrorMessage(msg);
              }}
              onBusyChange={setVoiceBusy}
            />

            <div className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">
                記録形式
              </span>
              <div
                className="inline-flex rounded-xl border border-line bg-slate-50 p-1"
                role="group"
                aria-label="記録形式"
              >
                <button
                  type="button"
                  disabled={busy}
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
                  disabled={busy}
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
              <p className="text-xs text-slate-500">
                DAR（Data / Action / Response）または SOAP（S / O / A / P）
              </p>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">
                生成モード
              </span>
              <div
                className="inline-flex rounded-xl border border-line bg-slate-50 p-1"
                role="group"
                aria-label="生成モード"
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setGenerationMode("normal")}
                  className={cn(
                    "min-w-[7rem] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
                    generationMode === "normal"
                      ? "bg-accent text-white shadow-sm"
                      : "text-slate-600 hover:bg-white",
                  )}
                >
                  通常
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setGenerationMode("audit")}
                  className={cn(
                    "min-w-[7rem] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
                    generationMode === "audit"
                      ? "bg-accent text-white shadow-sm"
                      : "text-slate-600 hover:bg-white",
                  )}
                >
                  監査
                </button>
              </div>
              <p className="text-xs text-slate-500">
                通常は日々の記録向け。監査は第三者確認・指摘を意識した表現を優先します。
              </p>
            </div>

            <Button
              type="submit"
              disabled={busy || !hasPatient || !inputText.trim()}
              className="w-full sm:w-auto"
            >
              {isGenerating ? "作成中..." : "AIで記録作成"}
            </Button>
          </form>
        </section>

        {/* AI 出力 */}
        {hasAiOutput && (
          <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-ink">
              2. AI出力（ai_output）
            </h2>
            <Textarea
              label="生成結果（参照用・読み取り専用）"
              value={aiOutput}
              readOnly
              rows={12}
              className="border-slate-200 bg-white"
            />
          </section>
        )}

        {/* 再調整（ai_output があるときのみ） */}
        {hasAiOutput && (
          <section className="rounded-xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-4 text-base font-semibold text-ink">
              3. 修正・再調整
            </h2>
            <div className="space-y-4">
              <Textarea
                label="修正指示"
                placeholder={REVISE_PLACEHOLDER}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={4}
                className="bg-white"
                disabled={busy}
              />
              <Button
                variant="secondary"
                type="button"
                onClick={handleRevise}
                disabled={
                  busy || !aiOutput.trim() || !instruction.trim()
                }
                className="w-full sm:w-auto"
              >
                {isRevising ? "再調整中..." : "この内容で再調整"}
              </Button>
            </div>
          </section>
        )}

        {/* 最終版・保存 */}
        <section className="rounded-xl border border-line bg-white p-6 shadow-panel">
          <h2 className="mb-4 text-base font-semibold text-ink">
            {hasAiOutput ? "4. 最終版・保存" : "2. 最終版・保存"}
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            AI生成後はここが確定用テキストです。手入力の編集もいつでも可能です。
          </p>
          <div className="space-y-4">
            <Textarea
              label="最終版（final_text）"
              placeholder={
                hasAiOutput
                  ? "必要に応じて文言を調整してください"
                  : "先に「AIで記録作成」すると、ここに初期値が入ります"
              }
              value={finalText}
              onChange={(e) => setFinalText(e.target.value)}
              rows={12}
              className="bg-white"
              disabled={busy}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <Button
                type="button"
                onClick={handleSave}
                disabled={busy || !hasPatient || !inputText.trim()}
                variant="primary"
                className="w-full sm:w-auto"
              >
                {isSaving ? "保存中..." : "保存"}
              </Button>
              {recordId ? (
                <Link
                  href={`/records/${recordId}`}
                  className="text-sm text-accent underline hover:text-teal-700"
                >
                  保存済みレコードを開く
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        {/* メッセージ */}
        {errorMessage ? (
          <p className="text-sm text-red-600" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p className="text-sm text-accent">{successMessage}</p>
        ) : null}
      </div>
    </>
  );
}
