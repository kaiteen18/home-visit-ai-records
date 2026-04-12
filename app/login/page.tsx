"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const safeNext =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/records";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signError) {
        setError(signError.message);
        return;
      }
      router.push(safeNext);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-sm space-y-4 rounded-xl border border-line bg-white p-6 shadow-sm"
    >
      <Input
        label="メールアドレス"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        label="パスワード"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "ログイン中..." : "ログイン"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-2 text-center text-2xl font-bold text-ink">ログイン</h1>
      <p className="mb-8 text-center text-sm text-slate-600">
        メールアドレスとパスワードでサインインしてください。
      </p>
      <Suspense fallback={<p className="text-center text-sm text-slate-500">読み込み中...</p>}>
        <LoginForm />
      </Suspense>
      <p className="mt-6 text-center text-sm text-slate-600">
        アカウントをお持ちでない方は{" "}
        <Link
          href="/signup"
          className="font-medium text-accent underline hover:text-teal-700"
        >
          新規登録
        </Link>
      </p>
      <p className="mt-4 text-center text-sm">
        <Link href="/" className="text-accent underline hover:text-teal-700">
          トップへ戻る
        </Link>
      </p>
    </main>
  );
}
