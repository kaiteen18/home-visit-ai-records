"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";

export default function NewPatientPage() {
  const router = useRouter();
  const [patientName, setPatientName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = patientName.trim();
    if (!name) {
      setError("患者名を入力してください。");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_name: name }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "患者の登録に失敗しました。";
        setError(msg);
        return;
      }
      router.push("/records/new");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-2 text-center text-2xl font-bold text-ink">
        患者を追加
      </h1>
      <p className="mb-8 text-center text-sm text-slate-600">
        ログイン中の組織にのみ登録されます。
      </p>
      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-sm space-y-4 rounded-xl border border-line bg-white p-6 shadow-sm"
      >
        <Input
          label="患者名"
          type="text"
          autoComplete="off"
          value={patientName}
          onChange={(e) => setPatientName(e.target.value)}
          required
        />
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? "登録中…" : "登録"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={() => router.push("/records/new")}
          >
            戻る
          </Button>
        </div>
      </form>
    </main>
  );
}
