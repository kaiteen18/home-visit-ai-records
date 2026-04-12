"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (password !== passwordConfirm) {
      setError("パスワードが一致しません。");
      return;
    }

    if (password.length < 6) {
      setError("パスワードは6文字以上にしてください。");
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signError) {
        setError(signError.message);
        return;
      }
      if (data.session) {
        router.push("/records");
        router.refresh();
      } else {
        setInfo(
          "確認メールを送信しました。メール内のリンクを確認してからログインしてください。"
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-2 text-center text-2xl font-bold text-ink">
        新規登録
      </h1>
      <p className="mb-8 text-center text-sm text-slate-600">
        メールアドレスとパスワードでアカウントを作成します。
      </p>
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <Input
          label="パスワード（確認）"
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          required
          minLength={6}
        />
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="text-sm text-slate-700" role="status">
            {info}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "登録中..." : "登録する"}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-slate-600">
        すでにアカウントをお持ちの方は{" "}
        <Link
          href="/login"
          className="font-medium text-accent underline hover:text-teal-700"
        >
          ログイン
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
