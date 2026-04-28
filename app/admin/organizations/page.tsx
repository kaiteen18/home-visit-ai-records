"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Input, Select } from "@/components/ui";

type Organization = {
  id: string;
  name: string;
  created_at: string;
  admin_count: number;
  member_count: number;
};

type Member = {
  id: string;
  user_id: string;
  organization_id: string;
  role: "member" | "admin";
  created_at: string;
  display_name: string | null;
};

type OrganizationsResponse = {
  organizations: Organization[];
};

type MembersResponse = {
  members: Member[];
};

function getErrorMessage(data: unknown, fallback: string): string {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
  ) {
    return (data as { error: string }).error;
  }
  return fallback;
}

export default function OrganizationsAdminPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupTarget, setLookupTarget] = useState<"create-admin" | "member">(
    "create-admin"
  );
  const [createName, setCreateName] = useState("");
  const [createAdminUserId, setCreateAdminUserId] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);

  const selectedOrganization = useMemo(
    () => organizations.find((org) => org.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId]
  );

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/organizations");
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getErrorMessage(data, "事業所一覧の取得に失敗しました。"));
        setOrganizations([]);
        return;
      }
      const list = (data as OrganizationsResponse).organizations ?? [];
      setOrganizations(list);
      setSelectedOrganizationId((current) => {
        if (current && list.some((org) => org.id === current)) return current;
        return list[0]?.id ?? "";
      });
    } catch {
      setError("通信エラーが発生しました。");
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async (organizationId: string) => {
    if (!organizationId) {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/organizations/${encodeURIComponent(organizationId)}/members`
      );
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getErrorMessage(data, "メンバー一覧の取得に失敗しました。"));
        setMembers([]);
        return;
      }
      setMembers((data as MembersResponse).members ?? []);
    } catch {
      setError("通信エラーが発生しました。");
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    loadMembers(selectedOrganizationId);
  }, [loadMembers, selectedOrganizationId]);

  async function handleLookupEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const email = lookupEmail.trim();
    if (!email) {
      setError("メールアドレスを入力してください。");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/organization-members/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getErrorMessage(data, "ユーザー検索に失敗しました。"));
        return;
      }
      const userId =
        data &&
        typeof data === "object" &&
        "user_id" in data &&
        typeof (data as { user_id: unknown }).user_id === "string"
          ? (data as { user_id: string }).user_id
          : "";
      if (!userId) {
        setError("該当するユーザーが見つかりません。");
        return;
      }
      if (lookupTarget === "create-admin") {
        setCreateAdminUserId(userId);
      } else {
        setMemberUserId(userId);
      }
      setMessage("user_id を入力欄に反映しました。");
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateOrganization(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const name = createName.trim();
    const adminUserId = createAdminUserId.trim();
    if (!name || !adminUserId) {
      setError("事業所名と初期管理者 user_id を入力してください。");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, admin_user_id: adminUserId }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getErrorMessage(data, "事業所の作成に失敗しました。"));
        return;
      }
      const newId =
        data &&
        typeof data === "object" &&
        "id" in data &&
        typeof (data as { id: unknown }).id === "string"
          ? (data as { id: string }).id
          : "";
      setCreateName("");
      setCreateAdminUserId("");
      setSelectedOrganizationId(newId);
      setMessage("事業所を作成し、初期管理者を紐付けました。");
      await loadOrganizations();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const userId = memberUserId.trim();
    if (!selectedOrganizationId || !userId) {
      setError("事業所と user_id を指定してください。");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/organizations/${encodeURIComponent(selectedOrganizationId)}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, role: memberRole }),
        }
      );
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getErrorMessage(data, "メンバーの追加に失敗しました。"));
        return;
      }
      setMemberUserId("");
      setMemberRole("member");
      setMessage("メンバーを保存しました。");
      await loadOrganizations();
      await loadMembers(selectedOrganizationId);
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex flex-wrap gap-4 text-sm">
        <Link href="/records/new" className="text-accent underline hover:text-teal-700">
          記録の新規作成
        </Link>
        <Link href="/records" className="text-accent underline hover:text-teal-700">
          記録一覧
        </Link>
        <Link
          href="/admin/organization-members"
          className="text-accent underline hover:text-teal-700"
        >
          現在の組織メンバー管理
        </Link>
      </div>

      <h1 className="mb-2 text-2xl font-bold text-ink">事業所管理</h1>
      <p className="mb-6 text-sm text-slate-600">
        管理者が事業所を作成し、初期管理者とメンバーを紐付けます。
        organization_id は DB 側で自動生成されます。
      </p>

      {error ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="mb-4 text-sm text-accent">{message}</p> : null}

      <section className="mb-8 rounded-xl border border-line bg-white p-6 shadow-panel">
        <h2 className="mb-4 text-base font-semibold text-ink">メールから user_id を検索</h2>
        <form onSubmit={handleLookupEmail} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <Input
            label="メールアドレス"
            type="email"
            autoComplete="off"
            value={lookupEmail}
            onChange={(e) => setLookupEmail(e.target.value)}
            placeholder="user@example.com"
          />
          <Select
            label="反映先"
            value={lookupTarget}
            onChange={(e) =>
              setLookupTarget(e.target.value as "create-admin" | "member")
            }
          >
            <option value="create-admin">新規事業所の初期管理者</option>
            <option value="member">選択中事業所のメンバー</option>
          </Select>
          <Button type="submit" disabled={busy} variant="secondary">
            検索
          </Button>
        </form>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-xl border border-line bg-white p-6 shadow-panel">
          <h2 className="mb-4 text-base font-semibold text-ink">事業所を新規作成</h2>
          <form onSubmit={handleCreateOrganization} className="space-y-4">
            <Input
              label="事業所名"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              maxLength={100}
              placeholder="例：中央訪問看護ステーション"
            />
            <Input
              label="初期管理者 user_id（UUID）"
              value={createAdminUserId}
              onChange={(e) => setCreateAdminUserId(e.target.value)}
              placeholder="メール検索で入力できます"
            />
            <p className="text-xs text-slate-500">
              organization_id は入力不要です。作成時に自動生成されます。
            </p>
            <Button type="submit" disabled={busy}>
              {busy ? "処理中..." : "事業所を作成"}
            </Button>
          </form>
        </section>

        <section className="rounded-xl border border-line bg-white p-6 shadow-panel">
          <h2 className="mb-4 text-base font-semibold text-ink">メンバーを追加</h2>
          <form onSubmit={handleAddMember} className="space-y-4">
            <Select
              label="対象事業所"
              value={selectedOrganizationId}
              onChange={(e) => setSelectedOrganizationId(e.target.value)}
              disabled={loading || organizations.length === 0}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
            <Input
              label="user_id（UUID）"
              value={memberUserId}
              onChange={(e) => setMemberUserId(e.target.value)}
              placeholder="メール検索で入力できます"
            />
            <Select
              label="role"
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value as "member" | "admin")}
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </Select>
            <Button type="submit" disabled={busy || !selectedOrganizationId}>
              {busy ? "処理中..." : "メンバーを保存"}
            </Button>
          </form>
        </section>
      </div>

      <section className="mt-8 rounded-xl border border-line bg-white p-6 shadow-panel">
        <h2 className="mb-4 text-base font-semibold text-ink">事業所一覧</h2>
        {loading ? (
          <p className="text-sm text-slate-600">読み込み中...</p>
        ) : organizations.length === 0 ? (
          <p className="text-sm text-slate-600">事業所がありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-slate-600">
                  <th className="py-2 pr-3 font-medium">事業所名</th>
                  <th className="py-2 pr-3 font-medium">organization_id</th>
                  <th className="py-2 pr-3 font-medium">admin</th>
                  <th className="py-2 pr-3 font-medium">members</th>
                  <th className="py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-ink">{org.name}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-700">
                      {org.id}
                    </td>
                    <td className="py-2 pr-3">{org.admin_count}</td>
                    <td className="py-2 pr-3">{org.member_count}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedOrganizationId(org.id)}
                        className="text-sm text-accent underline hover:text-teal-700"
                      >
                        選択
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8 rounded-xl border border-line bg-white p-6 shadow-panel">
        <h2 className="mb-2 text-base font-semibold text-ink">
          選択中事業所のメンバー
        </h2>
        {selectedOrganization ? (
          <p className="mb-4 text-sm text-slate-600">
            {selectedOrganization.name}
            <span className="ml-2 font-mono text-xs">{selectedOrganization.id}</span>
          </p>
        ) : null}
        {membersLoading ? (
          <p className="text-sm text-slate-600">読み込み中...</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-slate-600">メンバーがいません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-slate-600">
                  <th className="py-2 pr-3 font-medium">表示名</th>
                  <th className="py-2 pr-3 font-medium">user_id</th>
                  <th className="py-2 font-medium">role</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{member.display_name ?? "-"}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-700">
                      {member.user_id}
                    </td>
                    <td className="py-2">{member.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
