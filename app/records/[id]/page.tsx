import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RecordDetailForm } from "@/components/record-detail-form";
import { requireAuth } from "@/lib/get-organization-id";
import type { RecordDetail } from "@/types";

export const dynamic = "force-dynamic";

async function getRecord(
  supabase: SupabaseClient,
  id: string,
  organizationId: string
): Promise<RecordDetail | null> {
  const { data, error } = await supabase
    .from("records")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (error) {
    console.error("[records/detail] Supabase select error:", {
      message: error.message,
      code: error.code,
      id,
    });
    return null;
  }
  if (!data) {
    return null;
  }

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    visit_date: (row.visit_date as string | null | undefined) ?? null,
    input_text: String(row.input_text ?? ""),
    previous_record:
      row.previous_record !== undefined && row.previous_record !== null
        ? String(row.previous_record)
        : null,
    prompt_type:
      row.prompt_type !== undefined && row.prompt_type !== null
        ? String(row.prompt_type)
        : null,
    ai_output: (row.ai_output as string | null | undefined) ?? null,
    final_text: (row.final_text as string | null | undefined) ?? null,
    created_at: String(row.created_at ?? ""),
  };
}

export default async function RecordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const auth = await requireAuth();
  if (!auth.ok) {
    if (auth.status === 401) {
      redirect(
        "/login?next=" + encodeURIComponent(`/records/${id}`)
      );
    }
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/records"
            className="text-accent underline hover:text-teal-700"
          >
            ← 一覧へ戻る
          </Link>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="font-medium text-amber-900">{auth.error}</p>
        </div>
      </main>
    );
  }

  const record = await getRecord(auth.supabase, id, auth.organizationId);

  if (!record) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/records"
          className="text-accent underline hover:text-teal-700"
        >
          ← 一覧へ戻る
        </Link>
        <Link
          href="/records/new"
          className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
        >
          新規作成
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-bold text-ink">記録詳細</h1>
      <RecordDetailForm record={record} />
    </main>
  );
}
