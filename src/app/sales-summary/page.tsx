"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Input } from "@/components/ui/input";
import { AvatarCircle } from "@/components/seo/avatar-circle";
import { SalesSparkline } from "@/components/clients/sales-sparkline";
import { SalesRankChart } from "@/components/reports/sales-rank-chart";
import { isOwner } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { formatKpi, kpiValue, type KpiValue } from "@/lib/kpi/values";
import { delta } from "@/lib/kpi/report-metrics";
import { SUMMARY_ROWS, SUMMARY_SECTIONS, rowGoal, type SummaryRow } from "@/lib/kpi/sales-summary";
import type { SalesSummary, SummaryClient } from "@/lib/kpi/sales-summary-server";

const DAY = 86_400_000;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: string, n: number) => iso(new Date(new Date(`${d}T00:00:00`).getTime() + n * DAY));
const fmtDate = (d: string, year = false) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
const fmtRange = (r: { start: string; end: string }) => (r.start === r.end ? fmtDate(r.start) : `${fmtDate(r.start)} – ${fmtDate(r.end)}`);
const daysIn = (r: { start: string; end: string }) => Math.round((Date.parse(r.end) - Date.parse(r.start)) / DAY) + 1;

/** Data runs through yesterday (the daily sync), so every period ends there at the latest. */
const PERIODS = ["Last week", "This week", "Last 30 days", "This month", "Last month", "Year to date", "Custom"] as const;
type Period = (typeof PERIODS)[number];
function periodRange(p: Period): { start: string; end: string } | null {
  const today = iso(new Date());
  const yesterday = addDays(today, -1);
  const monday = addDays(today, -((new Date(`${today}T00:00:00`).getDay() + 6) % 7));
  const cap = (d: string) => (d > yesterday ? yesterday : d);
  switch (p) {
    case "Last week":
      return { start: addDays(monday, -7), end: addDays(monday, -1) };
    case "This week":
      return { start: monday > yesterday ? addDays(monday, -7) : monday, end: yesterday };
    case "Last 30 days":
      return { start: addDays(yesterday, -29), end: yesterday };
    case "This month":
      return { start: `${yesterday.slice(0, 7)}-01`, end: yesterday };
    case "Last month": {
      const firstThis = `${today.slice(0, 7)}-01`;
      const last = addDays(firstThis, -1);
      return { start: `${last.slice(0, 7)}-01`, end: cap(last) };
    }
    case "Year to date":
      return { start: `${yesterday.slice(0, 4)}-01-01`, end: yesterday };
    default:
      return null;
  }
}

/**
 * Sales Summary (owners): every client's sales on one page — a ranking of net
 * sales with logos, then one card per client with its team and its sales,
 * traffic, paid media and email metrics against the period before, last year,
 * month and year to date. MarketFoundry's Amazon page, on 1o8's sources.
 */
export default function SalesSummaryPage() {
  const { data: session, status } = useSession();
  const [period, setPeriod] = useState<Period>("Last week");
  const [range, setRange] = useState(() => periodRange("Last week")!);
  const [search, setSearch] = useState("");
  const owner = isOwner(session?.user?.role);
  // Cards start collapsed; click a header (or a column in the ranking) to open one.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (code: string, force?: boolean) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (force ?? !next.has(code)) next.add(code);
      else next.delete(code);
      return next;
    });
  const pick = (code: string) => {
    toggle(code, true);
    requestAnimationFrame(() => document.getElementById(`client-${code}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const { data, isLoading, isError, error, isFetching } = useQuery<SalesSummary>({
    queryKey: ["sales-summary", range.start, range.end],
    enabled: owner && range.start <= range.end,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const res = await fetch(`/api/reports/sales-summary?start=${range.start}&end=${range.end}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load the Sales Summary");
      return json;
    },
  });

  const clients = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sales = (c: SummaryClient) => kpiValue("net_sales", c.current)?.value ?? -1;
    // Shopify is the source of truth for sales: those clients first, then the GA4 estimates.
    const shopify = (c: SummaryClient) => (c.sources.includes("shopify") ? 1 : 0);
    return (data?.clients ?? [])
      .filter((c) => !q || `${c.code} ${c.name}`.toLowerCase().includes(q))
      .sort((a, b) => shopify(b) - shopify(a) || sales(b) - sales(a));
  }, [data, search]);

  if (status === "loading") return null;
  if (!owner) return <p className="p-8 text-sm text-muted-foreground">The Sales Summary is only available to owners.</p>;

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] leading-none tracking-tighter" aria-label="Sales Summary">
          <span className="font-bold text-sidebar-foreground">Sales</span>
          <span className="font-normal text-brand">Summary</span>
        </h1>
      </PageMetaSlot>

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Period</span>
          <select
            value={period}
            onChange={(e) => {
              const p = e.target.value as Period;
              setPeriod(p);
              const r = periodRange(p);
              if (r) setRange(r);
            }}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            {PERIODS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        {period === "Custom" ? (
          <>
            <label className="grid gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">From</span>
              <Input type="date" value={range.start} onChange={(e) => e.target.value && setRange({ ...range, start: e.target.value })} className="w-40" />
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">To</span>
              <Input type="date" value={range.end} onChange={(e) => e.target.value && setRange({ ...range, end: e.target.value })} className="w-40" />
            </label>
          </>
        ) : (
          <span className="pb-2 text-xs font-medium">{fmtRange(range)}</span>
        )}
        <label className="grid gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Client</span>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-48" />
        </label>
        {isFetching && <Loader2 className="mb-2 size-4 animate-spin text-muted-foreground" />}
        {data && (
          <span className="ml-auto pb-2 text-xs text-muted-foreground">
            vs {fmtRange(data.previous)} · last year {fmtRange(data.lastYear)} · data through {fmtDate(data.end, true)}
          </span>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading every client&apos;s numbers…</p>}
      {isError && <p className="text-sm text-red-500">{(error as Error).message}</p>}

      {data && (
        <>
          <SalesRankChart clients={clients} currentLabel={fmtRange(data)} previousLabel={fmtRange(data.previous)} onPick={pick} />
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">
              Clients <span className="font-normal text-muted-foreground">· {clients.length} · Shopify first</span>
            </h2>
            <div className="flex gap-3 text-xs">
              <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setOpen(new Set(clients.map((c) => c.code)))}>
                Expand all
              </button>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setOpen(new Set())}>
                Collapse all
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {clients.map((c) => (
              <ClientCard key={c.code} client={c} data={data} open={open.has(c.code)} onToggle={() => toggle(c.code)} />
            ))}
          </div>
          {data.noData.length > 0 && (
            <p className="text-xs text-muted-foreground">
              No data connected yet: {data.noData.map((c) => c.name).join(", ")}. Connect their sources in Client Onboarding → Connections.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Ranking ─────────────────────────────────────────────────────────

function Logo({ client, size }: { client: Pick<SummaryClient, "code" | "name" | "logoFileId">; size: number }) {
  const [failed, setFailed] = useState(false);
  if (client.logoFileId && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/drive/file/${client.logoFileId}`}
        alt={`${client.name} logo`}
        onError={() => setFailed(true)}
        className="shrink-0 rounded-md bg-white object-contain p-0.5"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-md bg-sidebar font-mono text-[10px] font-bold text-sidebar-foreground"
      style={{ width: size, height: size }}
      title={client.name}
    >
      {client.code}
    </span>
  );
}

function Change({ d, lowerIsBetter = false, className }: { d: number | null; lowerIsBetter?: boolean; className?: string }) {
  if (d === null || !Number.isFinite(d)) return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  const up = d >= 0;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums", good ? "text-emerald-500" : "text-red-500", className)}>
      <Icon className="size-3" />
      {Math.abs(d * 100).toFixed(1)}%
    </span>
  );
}

// ── Client card ─────────────────────────────────────────────────────

/** Strategy, then account / project management, then the specialists. */
function ClientTeam({ team }: { team: SummaryClient["team"] }) {
  if (!team.length) return <span className="text-xs opacity-70">No team assigned</span>;
  const levels = [1, 2, 3].map((l) => team.filter((m) => m.level === l)).filter((row) => row.length);
  return (
    <div className="flex flex-col items-end gap-1.5">
      {levels.map((row, i) => (
        <div key={i} className={cn("flex flex-wrap justify-end gap-x-3 gap-y-1", i > 0 && "border-t border-sidebar/20 pt-1.5")}>
          {row.map((m) => (
            <span key={m.name} className="flex items-center gap-1.5" title={`${m.name} — ${m.roles.join(", ")}`}>
              <AvatarCircle name={m.name} image={m.image} size={22} />
              <span className="leading-tight">
                <span className="block text-[11px] font-semibold">{m.name}</span>
                <span className="block text-[9px] opacity-75">{m.roles.join(" · ")}</span>
              </span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function ClientCard({ client, data, open, onToggle }: { client: SummaryClient; data: SalesSummary; open: boolean; onToggle: () => void }) {
  const net = kpiValue("net_sales", client.current);
  const netBefore = kpiValue("net_sales", client.previous);
  const shopify = client.sources.includes("shopify");
  const days = daysIn(data);
  const rows = SUMMARY_ROWS.map((row) => ({
    row,
    now: row.value(client.current),
    before: row.value(client.previous),
    ly: row.value(client.lastYear),
    mtd: row.value(client.mtd),
    ytd: row.value(client.ytd),
  })).filter((r) => r.now || r.before || r.ly || r.mtd || r.ytd);

  return (
    <section id={`client-${client.code}`} className="scroll-mt-24 overflow-hidden rounded-xl border bg-card">
      {!open && (
        <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40" aria-expanded={false}>
          <Logo client={client} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{client.name}</span>
            <span className="block font-mono text-[10px] text-muted-foreground">
              {client.code}
              {client.tier && ` · T${client.tier.replace(/^t/i, "")}`}
            </span>
          </span>
          <SourceBadge shopify={shopify} />
          <span className="w-24 text-right font-semibold tabular-nums">{net ? formatKpi(net) : "—"}</span>
          <Change d={delta(net?.value, netBefore?.value)} className="w-16 justify-end" />
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      )}
      {open && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4 bg-brand px-5 py-3 text-sidebar">
            <div className="flex min-w-0 items-start gap-3">
              <button type="button" onClick={onToggle} aria-expanded title="Collapse" className="mt-1 rounded p-0.5 hover:bg-sidebar/10">
                <ChevronDown className="size-4 rotate-180" />
              </button>
              <Logo client={client} size={56} />
              {client.spark.some((p) => p.sales > 0) && (
                <div className="hidden rounded-md bg-sidebar/90 md:block">
                  <SalesSparkline points={client.spark} detailed label={`Sales by ${data.sparkBy}`} />
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-[family-name:var(--font-outfit)] text-2xl font-bold leading-tight tracking-tight">{client.name}</h3>
                <p className="mt-0.5 font-mono text-[11px] opacity-75">
                  {client.code}
                  {client.tier && <span className="ml-2 font-bold">T{client.tier.replace(/^t/i, "")}</span>}
                  <span className="ml-2">{client.sources.join(" · ")}</span>
                </p>
                <div className="mt-1">
                  <SourceBadge shopify={shopify} onBrand />
                </div>
                <Link href={`/reports/sales?client=${encodeURIComponent(client.code)}&range=mtd`} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold underline-offset-2 hover:underline">
                  Open reports <ExternalLink className="size-3" />
                </Link>
              </div>
            </div>
            <ClientTeam team={client.team} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="bg-sidebar text-left text-[11px] text-sidebar-foreground">
                  <th className="px-4 py-1.5 font-medium">Metric</th>
                  <th className="px-3 py-1.5 text-right font-medium">Goal</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-brand">{fmtRange(data)}</th>
                  <th className="px-3 py-1.5 text-center font-medium">Trend</th>
                  <th className="px-3 py-1.5 text-right font-medium">{fmtRange(data.previous)}</th>
                  <th className="px-3 py-1.5 text-right font-medium">Last year</th>
                  <th className="px-3 py-1.5 text-right font-medium">MTD</th>
                  <th className="px-3 py-1.5 text-right font-medium">YTD</th>
                </tr>
              </thead>
              <tbody>
                {SUMMARY_SECTIONS.map((section) => {
                  const list = rows.filter((r) => r.row.section === section);
                  if (!list.length) return null;
                  return [
                    <tr key={section} className="border-t-2 border-brand/60 bg-brand/15">
                      <td colSpan={8} className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground">
                        {section}
                      </td>
                    </tr>,
                    ...list.map((r) => <MetricRow key={r.row.key} {...r} kpis={client.kpis} days={days} />),
                  ];
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                      No data for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** Where a client's sales come from: Shopify (the source of truth) or a GA4 estimate until Shopify is connected. */
function SourceBadge({ shopify, onBrand = false }: { shopify: boolean; onBrand?: boolean }) {
  return shopify ? (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", onBrand ? "bg-sidebar text-emerald-400" : "bg-emerald-500/15 text-emerald-500")}>Shopify</span>
  ) : (
    <span
      className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", onBrand ? "bg-sidebar text-orange-300" : "bg-orange-500/15 text-orange-400")}
      title="Sales are GA4's estimate until the Shopify store is connected"
    >
      GA4 estimate
    </span>
  );
}

function MetricRow({
  row,
  now,
  before,
  ly,
  mtd,
  ytd,
  kpis,
  days,
}: {
  row: SummaryRow;
  now: KpiValue | null;
  before: KpiValue | null;
  ly: KpiValue | null;
  mtd: KpiValue | null;
  ytd: KpiValue | null;
  kpis: SummaryClient["kpis"];
  days: number;
}) {
  const unit = (now ?? before ?? ly ?? mtd ?? ytd)!.unit;
  const goal = rowGoal(row, unit, kpis, days);
  const hit = goal === null || !now ? null : row.lowerIsBetter ? now.value <= goal : now.value >= goal;
  const cell = (v: KpiValue | null) => (v ? formatKpi(v) : "—");
  return (
    <tr className="border-t border-border/40 hover:bg-muted/30">
      <td className="px-4 py-1.5">
        {row.label}
        {now?.basis.includes("until") && <span className="ml-1.5 text-[10px] text-orange-400" title={now.basis}>GA4</span>}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{goal === null ? "—" : formatKpi({ value: goal, unit, basis: "" })}</td>
      <td className={cn("px-3 py-1.5 text-right font-semibold tabular-nums", hit === true && "text-emerald-500", hit === false && "text-red-500")}>{cell(now)}</td>
      <td className="px-3 py-1.5 text-center">
        <Change d={delta(now?.value, before?.value)} lowerIsBetter={row.lowerIsBetter} />
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{cell(before)}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
        {cell(ly)}
        {now && ly && <Change d={delta(now.value, ly.value)} lowerIsBetter={row.lowerIsBetter} className="ml-1.5" />}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">{cell(mtd)}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{cell(ytd)}</td>
    </tr>
  );
}
