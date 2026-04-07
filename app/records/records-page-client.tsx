"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RecordsTable } from "@/components/records-table";
import { normalizeRecordListResponse } from "@/lib/record-list";
import type { RecordListApiItem } from "@/types";

type State =
  | { status: "loading" }
  | { status: "ok"; records: RecordListApiItem[] }
  | { status: "error"; error: string };

export function RecordsPageClient() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    async function fetchRecords() {
      try {
        const res = await fetch("/api/records");
        const text = await res.text();
    
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("APIがJSONを返していません: " + text.slice(0, 100));
        }
    
        if (!res.ok) {
          const errMsg =
            data && typeof data === "object" && "error" in data
              ? String((data as { error?: unknown }).error ?? "APIエラー")
              : "APIエラー";
          throw new Error(errMsg);
        }
    
        const records = normalizeRecordListResponse(data);
        setState({ status: "ok", records });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "予期しないエラーが発生しました。";
        console.error("[RecordsPage] /api/records fetch error:", err);
        setState({ status: "error", error: msg });
      }
    }
    
    fetchRecords();
  }, []);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">記録一覧</h1>
        <div className="flex gap-2">
          <Link
            href="/records/new"
            className="rounded-lg border border-accent bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700"
          >
            新規作成
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
          >
            トップへ戻る
          </Link>
        </div>
      </div>

      {state.status === "loading" && (
        <p className="text-center text-slate-500">読み込み中...</p>
      )}

      {state.status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="font-medium">記録一覧を表示できません</p>
          <p className="mt-2 text-sm">{state.error}</p>
        </div>
      )}

      {state.status === "ok" && state.records.length === 0 && (
        <div className="rounded-xl border border-line bg-white p-12 text-center text-slate-600">
          <p className="font-medium text-slate-700">記録がありません</p>
          <p className="mt-2 text-sm text-slate-500">
            <Link href="/records/new" className="text-accent underline">
              新規作成
            </Link>
            から記録を追加してください。
          </p>
        </div>
      )}

      {state.status === "ok" && state.records.length > 0 && (
        <RecordsTable records={state.records} />
      )}
    </>
  );
}
