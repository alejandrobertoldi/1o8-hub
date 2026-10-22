"use client";
import type { AccountCard, MyDashboardPayload } from "@/lib/my-dashboard/types";
import { DUE_TODAY_TEXT, OVERDUE_TEXT, readinessBar, readinessText } from "@/lib/readiness/tone";
import { cn } from "@/lib/utils";

const compact = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

/** Mirrors the Sales Summary SparklineChart: monotone curve, gradient area, dots, value + date labels. */
function Spark({ values, dates, id }: { values: number[]; dates: string[]; id: string }) {
  if (values.length < 2) return null;
  const W = 300, H = 96, PAD = { top: 18, right: 16, bottom: 16, left: 16 };
  const cw = W - PAD.left - PAD.right, ch = H - PAD.top - PAD.bottom;
  const min = Math.min(...values), range = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => ({
    x: PAD.left + (i / (values.length - 1)) * cw,
    y: PAD.top + ch - ((v - min) / range) * ch,
    v, date: dates[i] ?? "",
  }));
  let line = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    line += ` C${midX},${pts[i].y} ${midX},${pts[i + 1].y} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  const area = `${line} L${pts[pts.length - 1].x},${PAD.top + ch} L${pts[0].x},${PAD.top + ch} Z`;
  const grad = `spark-${id}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden>
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${grad})`} />
      <path d={line} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill="var(--color-brand)" stroke="var(--color-card)" strokeWidth="1.5" />
          <text x={p.x} y={p.y - 7} textAnchor="middle" className="fill-foreground text-[8px] font-bold tabular-nums">{compact(p.v)}</text>
          {p.date && <text x={p.x} y={H - 3} textAnchor="middle" className="fill-muted-foreground text-[8px] tabular-nums">{p.date.slice(5)}</text>}
        </g>
      ))}
    </svg>
  );
}

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Card({ c }: { c: AccountCard }) {
  return (
    <a href={`/clients/${encodeURIComponent(c.clientIdCode)}`} className="flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:border-brand">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.clientLogoUrl && <img src={c.clientLogoUrl} alt="" className="size-6 rounded object-contain" />}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{c.clientName}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{c.clientIdCode} · {c.roles.join(", ")}</div>
        </div>
      </div>
      {/* Client readiness (all assignees) */}
      {c.readiness ? (
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Readiness</span>
            <span className={cn("text-lg font-semibold tabular-nums", readinessText(c.readiness.pct))}>{c.readiness.pct.toFixed(0)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", readinessBar(c.readiness.pct))} style={{ width: `${c.readiness.pct}%` }} />
          </div>
          <div className="mt-1.5 flex gap-3 text-[11px] tabular-nums text-muted-foreground">
            <span><b className="text-foreground">{c.readiness.open}</b> open</span>
            <span><b className={c.readiness.dueToday ? DUE_TODAY_TEXT : "text-foreground"}>{c.readiness.dueToday}</b> today</span>
            <span><b className={c.readiness.overdue ? OVERDUE_TEXT : "text-foreground"}>{c.readiness.overdue}</b> late</span>
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">No open Asana tasks</div>
      )}
      {/* Sales only shows once a client has a sales source connected. */}
      {c.salesLastWeek != null && (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-semibold tabular-nums">{money(c.salesLastWeek)}</span>
            {c.changePct != null && <span className={`text-xs tabular-nums ${c.changePct >= 0 ? "text-brand-green" : "text-brand-red"}`}>{c.changePct >= 0 ? "+" : ""}{c.changePct.toFixed(1)}%</span>}
          </div>
          <Spark values={c.spark} id={c.clientIdCode} dates={c.sparkDates ?? []} />
        </>
      )}
      <div className="flex gap-3 border-t pt-2 text-xs text-muted-foreground">
        <span>Mine: {c.openTasks} open</span>
        {c.overdueTasks > 0 && <span className="text-brand-red">{c.overdueTasks} overdue</span>}
        {c.alertCount > 0 && <span>{c.alertCount} alert{c.alertCount > 1 ? "s" : ""}</span>}
      </div>
    </a>
  );
}

export function AccountCards({ accounts }: { accounts: MyDashboardPayload["accounts"] }) {
  if (accounts.error) return <p className="text-sm text-brand-red">Couldn&apos;t load accounts: {accounts.error}</p>;
  const d = accounts.data!;
  if (!d.cards.length) return <p className="text-sm text-muted-foreground">No accounts linked to your name. Matched on “{d.matchedName ?? "(no name)"}” in the client team fields.</p>;
  return (
    <div className="flex flex-col gap-2">
      {d.salesWeek && <p className="text-xs text-muted-foreground">Sales: week {d.salesWeek.start} → {d.salesWeek.end} vs the week before</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{d.cards.map((c) => <Card key={c.clientIdCode} c={c} />)}</div>
    </div>
  );
}
