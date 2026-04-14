"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "home-visit-ai-records:recent-patient-ids";
const MAX_RECENT = 20;

export type PatientPickerRow = { id: string; patient_name: string };

function readRecentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

function writeRecentIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* quota / private mode */
  }
}

function sortPatientsWithRecent(
  patients: PatientPickerRow[],
  recentIds: string[]
): PatientPickerRow[] {
  const order = new Map(recentIds.map((id, i) => [id, i] as const));
  return [...patients].sort((a, b) => {
    const ao = order.has(a.id) ? order.get(a.id)! : 1_000_000;
    const bo = order.has(b.id) ? order.get(b.id)! : 1_000_000;
    if (ao !== bo) return ao - bo;
    return a.patient_name.localeCompare(b.patient_name, "ja");
  });
}

type Props = {
  patients: PatientPickerRow[];
  patientId: string;
  onPatientIdChange: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
};

export function PatientPicker({
  patients,
  patientId,
  onPatientIdChange,
  disabled = false,
  loading = false,
  error = null,
}: Props) {
  const [search, setSearch] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    setRecentIds(readRecentIds());
  }, []);

  const persistRecent = useCallback((id: string) => {
    if (!id) return;
    const prev = readRecentIds();
    const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT);
    writeRecentIds(next);
    setRecentIds(next);
  }, []);

  const handlePick = useCallback(
    (id: string) => {
      onPatientIdChange(id);
      persistRecent(id);
    },
    [onPatientIdChange, persistRecent]
  );

  const filtered = useMemo(() => {
    const sorted = sortPatientsWithRecent(patients, recentIds);
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p) => p.patient_name.toLowerCase().includes(q));
  }, [patients, recentIds, search]);

  const recentSet = useMemo(() => new Set(recentIds), [recentIds]);
  const showRecentBadge = search.trim() === "";

  return (
    <div className="space-y-3">
      <label
        htmlFor="patient-search"
        className="block text-sm font-medium text-slate-700"
      >
        対象患者（必須）
      </label>
      <input
        id="patient-search"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder={loading ? "読み込み中..." : "患者名で絞り込み"}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={disabled || loading}
        className="w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-ink placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
      />
      <ul
        className="max-h-52 overflow-y-auto overscroll-contain rounded-lg border border-line bg-white shadow-sm sm:max-h-60"
        role="listbox"
        aria-label="患者一覧"
      >
        {loading ? (
          <li className="px-3 py-4 text-center text-sm text-slate-500">
            読み込み中...
          </li>
        ) : patients.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm text-slate-500">
            患者が登録されていません
          </li>
        ) : filtered.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm text-slate-500">
            該当する患者がありません
          </li>
        ) : (
          filtered.map((p) => {
            const selected = p.id === patientId;
            const recent = showRecentBadge && recentSet.has(p.id);
            return (
              <li key={p.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={disabled || loading}
                  onClick={() => handlePick(p.id)}
                  className={`flex w-full min-h-12 items-center justify-between gap-2 px-3 py-3 text-left text-base transition sm:min-h-11 sm:py-2 sm:text-sm ${
                    selected
                      ? "bg-accent/15 font-medium text-ink"
                      : "text-ink hover:bg-slate-50 active:bg-slate-100"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <span>{p.patient_name}</span>
                  {recent ? (
                    <span className="shrink-0 text-xs font-normal text-slate-400">
                      最近
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
