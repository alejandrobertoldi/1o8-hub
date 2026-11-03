"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDashed, Database, ExternalLink, RefreshCw, Server, XCircle } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Level, UnitKind, VercelMetric } from "@/lib/system-health/plans";
import { cn } from "@/lib/utils";

type Health = {
  checkedAt: string;
  database:
    | { ok: true; plan: string; latencyMs: number; bytes: number; limitBytes: number; level: Level; tables: { name: string; bytes: number; rows: number }[] }
    | { ok: false; plan: string; latencyMs: number; error: string };
  vercel: {
    configured: boolean;
    plan: string;
    period: { from: string; to: string };
    error?: string;
    metrics?: VercelMetric[];
    other?: { name: string; quantity: number; unit: string | null }[];
    billedUsd?: number;
  };
  jobs: { key: string; label: string; schedule: string; lastSuccess: string | null; lastError: string | null; detail: string | null; status: "ok" | "stale" | "error" | "never" }[];
  kpiSources: { source: string; clientsOk: number; failed: string[] }[];
  integrations: { label: string; configured: boolean }[];
  claude: { calls: number; errors: number; inputTokens: number; outputTokens: number; costUsd: number };
  recentErrors: { id: number; section: string; action: string; message: string | null; userEmail: string | null; createdAt: string }[];
};

const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`;
const ago = (iso: string | null) => {
  if (!iso) return "Never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};
const UNIT: Record<UnitKind, string> = { gb: "GB", hours: "h", gbHours: "GB-h", count: "" };
const fmtQty = (n: number, kind: UnitKind) =>
  `${n.toLocaleString("en-US", { maximumFractionDigits: kind === "count" ? 0 : 2 })}${UNIT[kind] ? ` ${UNIT[kind]}` : ""}`;
const SOURCE_LABEL: Record<string, string> = { ga4: "GA4", meta: "Meta", klaviyo: "Klaviyo", shopify: "Shopify" };

const LEVEL_BAR: Record<Level, string> = { ok: "bg-emerald-500", watch: "bg-amber-500", critical: "bg-red-500", unknown: "bg-muted-foreground/40" };
const LEVEL_TEXT: Record<Level, string> = { ok: "text-emerald-600 dark:text-emerald-400", watch: "text-amber-600 dark:text-amber-400", critical: "text-red-500", unknown: "text-muted-foreground" };

export function SystemHealth() {
  const { data, isLoading, isFetching, refetch } = useQuery<Health>({
    queryKey: ["system-health"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system-health");
      if (!res.ok) throw new Error("Could not load system health");
      return res.json();
    },
    refetchInterval: 5 * 60_000,
  });

  const problems = data
    ? [
        ...(!data.database.ok ? ["Database unreachable"] : data.database.level === "critical" || data.database.level === "watch" ? ["Database is filling up"] : []),
        ...(data.vercel.metrics ?? []).filter((m) => m.level === "critical" || m.level === "watch").map((m) => `Vercel ${m.label}`),
        ...data.jobs.filter((j) => j.status === "error" || j.status === "stale").map((j) => j.label),
        ...data.kpiSources.filter((s) => s.failed.length).map((s) => `${SOURCE_LABEL[s.source] ?? s.source} sync`),
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="System Health">
          <span className="font-bold text-sidebar-foreground">System</span>
          <span className="font-normal text-brand">Health</span>
        </h1>
      </PageMetaSlot>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {data ? (
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold",
              problems.length ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/40 bg-emerald-500/10",
            )}
          >
            {problems.length ? <AlertTriangle className="size-4 text-amber-500" /> : <CheckCircle2 className="size-4 text-emerald-500" />}
            {problems.length ? `Needs a look: ${problems.join(" · ")}` : "Everything is running and within the plans"}
          </div>
        ) : (
          <Skeleton className="h-10 w-80 rounded-xl" />
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {data && <span>Checked {ago(data.checkedAt)}</span>}
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : (
        <>
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Plan capacity</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel icon={Database} title="Database" subtitle={`${data.database.plan} · 500 MB`} link={{ href: "https://supabase.com/dashboard/project/_/settings/billing/usage", label: "Supabase usage" }}>
              {data.database.ok ? (
                <>
                  <Meter label="Database size" used={data.database.bytes} limit={data.database.limitBytes} level={data.database.level} text={`${mb(data.database.bytes)} of ${mb(data.database.limitBytes)}`} />
                  <p className="mt-1 text-xs text-muted-foreground">Responds in {data.database.latencyMs} ms. Largest tables:</p>
                  <ul className="mt-2 divide-y text-sm">
                    {data.database.tables.map((t) => (
                      <li key={t.name} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="truncate font-mono text-xs">{t.name}</span>
                        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                          {t.rows.toLocaleString("en-US")} rows · {mb(t.bytes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-red-500">Can&apos;t reach the database: {data.database.error}</p>
              )}
            </Panel>

            <Panel icon={Server} title="Hosting" subtitle={`${data.vercel.plan} · since ${data.vercel.period.from}`} link={{ href: "https://vercel.com/dashboard/usage", label: "Vercel usage" }}>
              {!data.vercel.configured ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Vercel usage needs an API token. To turn it on:</p>
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>Vercel → Account Settings → Tokens → create one (read access is enough).</li>
                    <li>Add it to the project as the environment variable <code className="font-mono text-xs">VERCEL_API_TOKEN</code> (Production).</li>
                    <li>Redeploy. If the project lives in a team, also add <code className="font-mono text-xs">VERCEL_TEAM_ID</code>.</li>
                  </ol>
                </div>
              ) : data.vercel.error ? (
                <p className="text-sm text-red-500">{data.vercel.error}</p>
              ) : (
                <>
                  <div className="space-y-3">
                    {data.vercel.metrics?.map((m) =>
                      m.used == null ? (
                        <div key={m.key} className="text-sm">
                          <span className="font-medium">{m.label}</span>{" "}
                          <span className="text-muted-foreground">
                            {m.raw} (limit {fmtQty(m.limit, m.kind)}/month)
                          </span>
                        </div>
                      ) : (
                        <Meter key={m.key} label={m.label} used={m.used} limit={m.limit} level={m.level} text={`${fmtQty(m.used, m.kind)} of ${fmtQty(m.limit, m.kind)}`} />
                      ),
                    )}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Hobby has no overage: when one allotment runs out, Vercel pauses the project until the next cycle. The cycle may not start on the 1st,
                    so this month-to-date view is approximate.
                  </p>
                </>
              )}
            </Panel>
          </div>

          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Daily jobs</h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-bold">Job</th>
                  <th className="px-4 py-2 font-bold">Schedule</th>
                  <th className="px-4 py-2 font-bold">Last success</th>
                  <th className="px-4 py-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.jobs.map((j) => (
                  <tr key={j.key} className="align-top">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{j.label}</p>
                      {j.detail && <p className="text-xs text-muted-foreground">{j.detail}</p>}
                      {j.lastError && <p className="mt-0.5 text-xs text-red-500">{j.lastError}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{j.schedule}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{ago(j.lastSuccess)}</td>
                    <td className="px-4 py-2.5">
                      <JobStatus status={j.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.kpiSources.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t px-4 py-3">
                <span className="text-xs text-muted-foreground">Last KPI run by source:</span>
                {data.kpiSources.map((s) => (
                  <span
                    key={s.source}
                    title={s.failed.join("\n") || undefined}
                    className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", s.failed.length ? "bg-red-500/15 text-red-500" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400")}
                  >
                    {SOURCE_LABEL[s.source] ?? s.source}: {s.clientsOk} ok{s.failed.length ? `, ${s.failed.length} failed` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_2fr]">
            <Panel title="Connections" subtitle="Keys set in this environment">
              <ul className="space-y-1.5 text-sm">
                {data.integrations.map((i) => (
                  <li key={i.label} className="flex items-center gap-2">
                    {i.configured ? <CheckCircle2 className="size-4 text-emerald-500" /> : <CircleDashed className="size-4 text-muted-foreground" />}
                    <span className={cn(!i.configured && "text-muted-foreground")}>{i.label}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Claude AI" subtitle="Last 30 days">
              <p className="text-2xl font-bold tabular-nums">{data.claude.calls.toLocaleString("en-US")}</p>
              <p className="text-xs text-muted-foreground">
                calls · {data.claude.errors} errors · {(data.claude.inputTokens + data.claude.outputTokens).toLocaleString("en-US")} tokens · ≈ $
                {data.claude.costUsd.toFixed(2)}
              </p>
            </Panel>
            <Panel title="Recent errors" subtitle="Logged by the hub">
              {data.recentErrors.length === 0 ? (
                <p className="text-sm text-muted-foreground">No errors logged.</p>
              ) : (
                <ul className="max-h-64 divide-y overflow-y-auto text-sm">
                  {data.recentErrors.map((e) => (
                    <li key={e.id} className="py-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-mono text-xs">
                          {e.section} · {e.action}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{ago(e.createdAt)}</span>
                      </div>
                      {e.message && <p className="line-clamp-2 text-xs text-muted-foreground">{e.message}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  subtitle,
  link,
  children,
}: {
  icon?: typeof Database;
  title: string;
  subtitle?: string;
  link?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-brand" />}
          <div>
            <h3 className="font-semibold leading-tight">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {link && (
          <a href={link.href} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-brand hover:underline">
            {link.label} <ExternalLink className="size-3" />
          </a>
        )}
      </header>
      {children}
    </section>
  );
}

function Meter({ label, used, limit, level, text }: { label: string; used: number; limit: number; level: Level; text: string }) {
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-xs text-muted-foreground">
          {text} · <span className={cn("font-semibold", LEVEL_TEXT[level])}>{pct < 1 && pct > 0 ? "<1" : Math.round(pct)}%</span>
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", LEVEL_BAR[level])} style={{ width: `${Math.max(pct, used > 0 ? 1 : 0)}%` }} />
      </div>
    </div>
  );
}

function JobStatus({ status }: { status: "ok" | "stale" | "error" | "never" }) {
  const map = {
    ok: { icon: CheckCircle2, text: "Running", cls: "text-emerald-600 dark:text-emerald-400" },
    stale: { icon: AlertTriangle, text: "Missed a run", cls: "text-amber-600 dark:text-amber-400" },
    error: { icon: XCircle, text: "Failing", cls: "text-red-500" },
    never: { icon: CircleDashed, text: "Never ran", cls: "text-muted-foreground" },
  }[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold", map.cls)}>
      <map.icon className="size-4" /> {map.text}
    </span>
  );
}
