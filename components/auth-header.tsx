"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function AuthHeader() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {email === undefined ? (
        <span className="text-xs text-slate-400">…</span>
      ) : email ? (
        <>
          <span className="max-w-[200px] truncate text-xs text-slate-600 md:text-sm">
            {email}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className={cn(
              "rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-slate-50 md:text-sm",
            )}
          >
            ログアウト
          </button>
        </>
      ) : (
        <Link
          href="/login"
          className="text-sm font-medium text-accent underline hover:text-teal-700"
        >
          ログイン
        </Link>
      )}
    </div>
  );
}
