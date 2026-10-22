"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { Assignments } from "@/lib/team/assignments";

// Short column headers for the matrix (full labels live in TEAM_ROLES).
const SHORT: Record<string, string> = {
  ExecutiveStrategist_MF: "Exec. Strategist",
  AccountManager_MF: "Account Mgr",
  ProjectManager_MF: "Project Mgr",
  EmailManager_1o8: "Email",
  WebManager_1o8: "Web",
  DesignManager_MF: "Creative",
  SEOManager_MF: "SEO",
  PPCManager_MF: "Paid Media",
  SocialMediaManager_108: "Social",
};
const LEAD_ROLES = ["ExecutiveStrategist_MF", "AccountManager_MF", "ProjectManager_MF"];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * Live version of the "By Team Member" sheet tab: who holds which account
 * role across every active client, plus per-person and per-account lookups.
 */
export function TeamAssignments() {
  const { data, isLoading, isError } = useQuery<Assignments>({
    queryKey: ["team-assignments"],
    queryFn: async () => {
      const res = await fetch("/api/team/assignments");
      if (!res.ok) throw new Error("Failed to load assignments");
      return res.json();
    },
  });

  const matrix = useMemo(() => {
    if (!data) return null;
    const rows = new Map<string, { name: string; counts: Record<string, number>; total: number }>();
    const colTotals: Record<string, number> = {};
    for (const acc of data.accounts) {
      for (const [role, person] of Object.entries(acc.roles)) {
        const k = norm(person);
        const row = rows.get(k) ?? { name: data.people[k]?.name ?? person, counts: {}, total: 0 };
        row.counts[role] = (row.counts[role] ?? 0) + 1;
        row.total++;
        rows.set(k, row);
        colTotals[role] = (colTotals[role] ?? 0) + 1;
      }
    }
    const list = [...rows.entries()].map(([key, r]) => ({ key, ...r })).sort((a, b) => a.name.localeCompare(b.name));
    const maxCell = Math.max(1, ...list.flatMap((r) => Object.values(r.counts)));
    const maxTotal = Math.max(1, ...list.map((r) => r.total));
    return { list, colTotals, maxCell, maxTotal };
  }, [data]);

  const [personKey, setPersonKey] = useState<string>("");
  const [accountCode, setAccountCode] = useState<string>("");

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading assignments…</p>;
  if (isError || !data || !matrix) return <p className="text-sm text-muted-foreground">Assignments could not be loaded.</p>;

  const roleLabel = (key: string) => data.roles.find((r) => r.key === key)?.label ?? key;
  const personHref = (name: string) => {
    const p = data.people[norm(name)];
    return p ? `/team/${p.id}` : null;
  };

  const selectedPerson = personKey ? matrix.list.find((r) => r.key === personKey) : null;
  const personAccounts = selectedPerson
    ? data.accounts
        .map((a) => ({ a, roles: Object.entries(a.roles).filter(([, n]) => norm(n) === personKey).map(([k]) => roleLabel(k)) }))
        .filter((x) => x.roles.length)
    : [];
  const account = accountCode ? data.accounts.find((a) => a.clientIdCode === accountCode) : null;

  return (
    <div className="space-y-6">
      {/* 1. Matrix */}
      <section className="rounded-xl border bg-card">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-bold">Roles per person across active accounts</h2>
          <span className="text-xs text-muted-foreground">
            Total active accounts <span className="ml-1 rounded bg-brand px-1.5 py-0.5 font-bold text-brand-foreground">{data.accounts.length}</span>
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left">Team member</th>
                {data.roles.map((r) => (
                  <th key={r.key} className="px-2 py-2 text-center" title={r.label}>
                    {SHORT[r.key] ?? r.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-center">Total roles</th>
              </tr>
              <tr className="border-b text-xs text-muted-foreground">
                <td className="px-4 pb-2" />
                {data.roles.map((r) => (
                  <td key={r.key} className="px-2 pb-2 text-center">
                    {matrix.colTotals[r.key] ?? "—"}
                  </td>
                ))}
                <td />
              </tr>
            </thead>
            <tbody>
              {matrix.list.map((row) => (
                <tr
                  key={row.key}
                  onClick={() => setPersonKey(row.key)}
                  className={cn(
                    "cursor-pointer border-b border-border/40 last:border-0 hover:bg-muted/30",
                    personKey === row.key && "bg-muted/40",
                  )}
                >
                  <td className="px-4 py-1.5 font-medium whitespace-nowrap">{row.name}</td>
                  {data.roles.map((r) => {
                    const n = row.counts[r.key] ?? 0;
                    return (
                      <td key={r.key} className="px-1 py-1 text-center">
                        {n > 0 && (
                          <span
                            className="block rounded px-2 py-1 font-semibold"
                            style={{ background: `rgba(52, 199, 89, ${0.12 + 0.55 * (n / matrix.maxCell)})` }}
                          >
                            {n}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center">
                    <span
                      className="block rounded px-2 py-1 font-bold"
                      style={{ background: `rgba(247, 191, 29, ${0.15 + 0.6 * (row.total / matrix.maxTotal)})` }}
                    >
                      {row.total}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 2. Person lookup */}
        <section className="rounded-xl border bg-card p-4">
          <label className="mb-3 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Select a team member</span>
            <select
              value={personKey}
              onChange={(e) => setPersonKey(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
            >
              <option value="">—</option>
              {matrix.list.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {selectedPerson ? (
            <>
              <p className="mb-2 text-sm">
                <span className="font-bold">{selectedPerson.total}</span> active roles across{" "}
                <span className="font-bold">{personAccounts.length}</span> accounts
                {personHref(selectedPerson.name) && (
                  <Link href={personHref(selectedPerson.name)!} className="ml-2 text-xs text-brand hover:underline">
                    Open card
                  </Link>
                )}
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="py-1.5">Account</th>
                    <th className="py-1.5">Role(s)</th>
                  </tr>
                </thead>
                <tbody>
                  {personAccounts.map(({ a, roles }) => (
                    <tr key={a.clientIdCode} className="border-t border-border/40">
                      <td className="py-1.5">
                        <Link href={`/clients/${encodeURIComponent(a.clientIdCode)}`} className="font-medium hover:underline">
                          {a.clientName}
                        </Link>
                      </td>
                      <td className="py-1.5 text-muted-foreground">{roles.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Pick someone (or click a row above) to see their accounts.</p>
          )}
        </section>

        {/* 3. Account lookup */}
        <section className="rounded-xl border bg-card p-4">
          <label className="mb-3 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Select an account</span>
            <select
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
            >
              <option value="">—</option>
              {data.accounts.map((a) => (
                <option key={a.clientIdCode} value={a.clientIdCode}>
                  {a.clientName}
                </option>
              ))}
            </select>
          </label>
          {account ? (
            <div className="flex flex-col items-center gap-2">
              {LEAD_ROLES.map((k, i) => (
                <div key={k} className="flex flex-col items-center gap-2">
                  {i > 0 && <div className="h-3 w-px bg-brand" aria-hidden />}
                  <RoleCard label={roleLabel(k)} name={account.roles[k]} href={account.roles[k] ? personHref(account.roles[k]) : null} />
                </div>
              ))}
              <div className="h-3 w-px bg-brand" aria-hidden />
              <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
                {data.roles
                  .filter((r) => !LEAD_ROLES.includes(r.key))
                  .map((r) => (
                    <RoleCard key={r.key} label={r.label} name={account.roles[r.key]} href={account.roles[r.key] ? personHref(account.roles[r.key]) : null} />
                  ))}
              </div>
              <Link href={`/clients/${encodeURIComponent(account.clientIdCode)}`} className="mt-1 text-xs text-brand hover:underline">
                Open client
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Pick an account to see who covers each role.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function RoleCard({ label, name, href }: { label: string; name?: string; href: string | null }) {
  const body = (
    <div className={cn("min-w-40 rounded-lg border px-3 py-2 text-center", name ? "bg-card" : "border-dashed")}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold", !name && "font-normal italic text-muted-foreground")}>{name ?? "Unassigned"}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-opacity hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}
