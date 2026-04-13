"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input } from "@/components/ui";

type Organization = { id: string; name: string };

type Member = {
  id: string;
  user_id: string;
  organization_id: string;
  role: string;
  created_at: string;
  display_name: string | null;
};

type ListResponse = {
  organization: Organization;
  members: Member[];
};

const MSG = {
  listFail: "一覧の取得に失敗しました。",
  netErr: "通信エラーが発生しました。",
  emailReq: "メールアドレスを入力してください。",
  lookupFail: "検索に失敗しました。",
  noOrg: "情報を読み込めていません。",
  uidReq:
    "user_id\uff08UUID\uff09" + "を入力するか、メールで検索してください。",
  saveFail: "保存に失敗しました。",
  updFail: "更新に失敗しました。",
  delFail: "削除に失敗しました。",
  delConfirm: "このメンバーを組織から外しますか？削除後、該ユーザーは再ログイン時に別組織が自動作成される場合があります。",
  linkNew: "記録の新規作成",
  linkList: "記録一覧",
  title: "組織メンバー管理",
  intro1: "1ユーザー1組織を前提とします。重複所属は DB の UNIQUE(user_id) と upsert で防げます。",
  intro2a: "初めて管理画面を使う場合は、Supabase の SQL で ",
  intro2b: "を ",
  intro2c: "に更新してください。",
  loading: "読み込み中…",
  h2Org: "対象組織",
  h2Form: "メンバーを追加・更新",
  lblEmail: "メールで user_id を検索",
  btnSearch: "検索",
  lblUid: "user_id\uff08UUID\uff09",
  hintOid: "organization_id は上記の組織 ID が自動で送られます。",
  saving: "保存中…",
  btnSave: "紐付けを保存",
  h2Table: "メンバー一覧",
  thName: "表示名",
  thAct: "操作",
  btnDel: "削除",
  btnUpd: "更新",
  empty: "メンバーがいません。",
} as const;

export default function OrganizationMembersAdminPage() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [emailLookup, setEmailLookup] = useState("");
  const [userId, setUserId] = useState("");
  const [newRole, setNewRole] = useState<"member" | "admin">("member");
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/organization-members");
      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        setLoadError(MSG.listFail);
        setOrganization(null);
        setMembers([]);
        return;
      }
      if (!res.ok) {
        const err =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : MSG.listFail;
        setLoadError(err);
        setOrganization(null);
        setMembers([]);
        return;
      }
      const parsed = data as ListResponse;
      setOrganization(parsed.organization);
      setMembers(parsed.members ?? []);
    } catch {
      setLoadError(MSG.netErr);
      setOrganization(null);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLookupEmail(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const email = emailLookup.trim();
    if (!email) {
      setFormError(MSG.emailReq);
      return;
    }
    setFormBusy(true);
    try {
      const res = await fetch("/api/admin/organization-members/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : MSG.lookupFail;
        setFormError(msg);
        return;
      }
      if (
        data &&
        typeof data === "object" &&
        "user_id" in data &&
        typeof (data as { user_id: unknown }).user_id === "string"
      ) {
        setUserId((data as { user_id: string }).user_id);
      }
    } catch {
      setFormError(MSG.netErr);
    } finally {
      setFormBusy(false);
    }
  }

  async function handleAddOrUpdate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!organization) {
      setFormError(MSG.noOrg);
      return;
    }
    const uid = userId.trim();
    if (!uid) {
      setFormError(MSG.uidReq);
      return;
    }
    setFormBusy(true);
    try {
      const res = await fetch("/api/admin/organization-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: uid,
          organization_id: organization.id,
          role: newRole,
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : MSG.saveFail;
        setFormError(msg);
        return;
      }
      setUserId("");
      setEmailLookup("");
      await load();
    } catch {
      setFormError(MSG.netErr);
    } finally {
      setFormBusy(false);
    }
  }

  async function updateMemberRole(targetUserId: string, role: "member" | "admin") {
    setRowBusy((b) => ({ ...b, [targetUserId]: true }));
    try {
      const res = await fetch(
        `/api/admin/organization-members/${encodeURIComponent(targetUserId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }
      );
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        const msg =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : MSG.updFail;
        alert(msg);
        return;
      }
      await load();
    } catch {
      alert(MSG.netErr);
    } finally {
      setRowBusy((b) => ({ ...b, [targetUserId]: false }));
    }
  }

  async function removeMember(targetUserId: string) {
    if (!confirm(MSG.delConfirm)) {
      return;
    }
    setRowBusy((b) => ({ ...b, [targetUserId]: true }));
    try {
      const res = await fetch(
        `/api/admin/organization-members/${encodeURIComponent(targetUserId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        const msg =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : MSG.delFail;
        alert(msg);
        return;
      }
      await load();
    } catch {
      alert(MSG.netErr);
    } finally {
      setRowBusy((b) => ({ ...b, [targetUserId]: false }));
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex flex-wrap gap-4 text-sm">
        <Link
          href="/records/new"
          className="text-accent underline hover:text-teal-700"
        >
          {MSG.linkNew}
        </Link>
        <Link href="/records" className="text-accent underline hover:text-teal-700">
          {MSG.linkList}
        </Link>
      </div>

      <h1 className="mb-2 text-2xl font-bold text-ink">{MSG.title}</h1>
      <p className="mb-6 text-sm text-slate-600">
        {MSG.intro1}
        <br />
        {MSG.intro2a}
        <code className="rounded bg-slate-100 px-1">organization_members.role</code>
        {MSG.intro2b}
        <code className="rounded bg-slate-100 px-1">admin</code>
        {MSG.intro2c}
      </p>

      {loading ? (
        <p className="text-sm text-slate-600">{MSG.loading}</p>
      ) : loadError ? (
        <p className="text-sm text-red-600" role="alert">
          {loadError}
        </p>
      ) : organization ? (
        <>
          <section className="mb-8 rounded-xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-2 text-base font-semibold text-ink">{MSG.h2Org}</h2>
            <p className="text-sm text-slate-800">
              <span className="font-medium">{organization.name}</span>
            </p>
            <p className="mt-1 font-mono text-xs text-slate-500">{organization.id}</p>
          </section>

          <section className="mb-10 rounded-xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-4 text-base font-semibold text-ink">{MSG.h2Form}</h2>
            <form onSubmit={handleLookupEmail} className="mb-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <Input
                  label={MSG.lblEmail}
                  type="email"
                  autoComplete="off"
                  value={emailLookup}
                  onChange={(e) => setEmailLookup(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={formBusy} variant="secondary">
                {MSG.btnSearch}
              </Button>
            </form>
            <form onSubmit={handleAddOrUpdate} className="space-y-4">
              <Input
                label={MSG.lblUid}
                type="text"
                autoComplete="off"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
              <div>
                <label
                  htmlFor="new-role"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  role
                </label>
                <select
                  id="new-role"
                  value={newRole}
                  onChange={(e) =>
                    setNewRole(e.target.value as "member" | "admin")
                  }
                  className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <p className="text-xs text-slate-500">{MSG.hintOid}</p>
              {formError ? (
                <p className="text-sm text-red-600" role="alert">
                  {formError}
                </p>
              ) : null}
              <Button type="submit" disabled={formBusy}>
                {formBusy ? MSG.saving : MSG.btnSave}
              </Button>
            </form>
          </section>

          <section className="rounded-xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-4 text-base font-semibold text-ink">{MSG.h2Table}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-slate-600">
                    <th className="py-2 pr-3 font-medium">{MSG.thName}</th>
                    <th className="py-2 pr-3 font-medium">user_id</th>
                    <th className="py-2 pr-3 font-medium">role</th>
                    <th className="py-2 font-medium">{MSG.thAct}</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3">
                        {m.display_name ?? "\u2014"}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-700">
                        {m.user_id}
                      </td>
                      <td className="py-2 pr-3">
                        <MemberRoleRow
                          userId={m.user_id}
                          initialRole={m.role === "admin" ? "admin" : "member"}
                          busy={Boolean(rowBusy[m.user_id])}
                          onSave={(role) => updateMemberRole(m.user_id, role)}
                        />
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => removeMember(m.user_id)}
                          disabled={Boolean(rowBusy[m.user_id])}
                          className="text-sm text-red-600 underline hover:text-red-800 disabled:opacity-50"
                        >
                          {MSG.btnDel}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {members.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">{MSG.empty}</p>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  );
}

function MemberRoleRow({
  userId,
  initialRole,
  busy,
  onSave,
}: {
  userId: string;
  initialRole: "member" | "admin";
  busy: boolean;
  onSave: (role: "member" | "admin") => void;
}) {
  const [role, setRole] = useState(initialRole);
  useEffect(() => {
    setRole(initialRole);
  }, [initialRole, userId]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as "member" | "admin")}
        disabled={busy}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm disabled:opacity-50"
      >
        <option value="member">member</option>
        <option value="admin">admin</option>
      </select>
      <button
        type="button"
        disabled={busy || role === initialRole}
        onClick={() => onSave(role)}
        className="text-sm text-accent underline hover:text-teal-700 disabled:opacity-40"
      >
        {MSG.btnUpd}
      </button>
    </div>
  );
}
