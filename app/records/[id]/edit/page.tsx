"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { RecordEditForm } from "@/components/record-edit-form";

/**
 * useParams の id は Next のルートによって string | string[] になり得るため、必ず単一の string に正規化する。
 */
function normalizeRecordId(
  raw: string | string[] | undefined
): string | null {
  if (raw === undefined) return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (typeof first !== "string") return null;
    const t = first.trim();
    return t === "" ? null : t;
  }
  const t = raw.trim();
  return t === "" ? null : t;
}

export default function RecordEditPage() {
  const params = useParams();
  const id = normalizeRecordId(params?.id as string | string[] | undefined);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/records"
          className="text-accent underline hover:text-teal-700"
        >
          ← 一覧へ戻る
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-bold text-ink">記録の編集</h1>

      {id === null ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="font-medium">記録IDが指定されていません。</p>
          <p className="mt-2 text-sm">
            URL が正しいか確認し、一覧から「編集」から開き直してください。
          </p>
          <Link
            href="/records"
            className="mt-4 inline-block text-accent underline hover:text-teal-700"
          >
            一覧へ戻る
          </Link>
        </div>
      ) : (
        <RecordEditForm recordId={id} />
      )}
    </main>
  );
}
