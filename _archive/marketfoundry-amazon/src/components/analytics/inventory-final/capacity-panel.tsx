"use client";

// FBA capacity per storage type (hub only), modelled on Seller Central's
// Capacity Monitor: on-hand + open shipments + this recommendation as one wide
// stacked column, checked against the limits the team types in from Capacity
// Monitor (this month + the next two). Usage comes from the Restock report.
import { useState } from "react";
import { Oswald } from "next/font/google";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { fmtInt } from "@/lib/formatters";
import { todayIso } from "@/lib/inventory/rec-settings";
import { addedByType, outlookMonths, parseLimitInput, type CapacityLimitRow, type LimitStatus, type CapacityResponse, type StorageType } from "@/lib/inventory/capacity";

const CARD = "rounded-[18px] border border-stone-200 bg-card px-4 py-3 dark:border-zinc-800";
const COLUMN_PX = 160; // h-40: the monthly columns' height, for "is this segment tall enough for a label"
const ft3 = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} ft³`;
const monthLabel = (ym: string) =>
  new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

// Split-flap tiles copied from the /me dashboard's FlapClock
// (src/components/my-dashboard/flap-clock.tsx) so month labels match it exactly.
// Narrow, tall glyphs read like a departures board (SIL OFL — free for commercial use).
const flipFont = Oswald({ subsets: ["latin"], weight: ["600"], display: "swap" });
const FLAP_SIZE = {
  half: "h-[22px] min-w-6 px-1 text-sm",
  lg: "h-12 min-w-9 px-1.5 text-3xl",
} as const;

function Flap({ ch, size = "lg" }: { ch: string; size?: keyof typeof FLAP_SIZE }) {
  return (
    <span className={`relative inline-flex items-center justify-center overflow-hidden rounded-[5px] bg-gradient-to-b from-zinc-800 to-zinc-900 ${flipFont.className} leading-none text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.5)] ${FLAP_SIZE[size]}`}>
      {ch}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-px bg-black/70" />
    </span>
  );
}

/** Month + year in the dashboard's departures-board frame: big "OCT", "2026" half-height beside it. */
function FlipMonth({ month, year }: { month: string; year: string }) {
  return (
    <div role="img" aria-label={`${month} ${year}`} data-testid="capacity-month-label"
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
      <Flap ch={month.toUpperCase()} />
      <Flap ch={year} size="half" />
    </div>
  );
}

/** Confirmed / Estimate pill. For editors it is a dropdown; the team sets it from Capacity Monitor. */
function StatusPill({ month, confirmed, editable, onChange }: {
  month: string; confirmed: boolean; editable: boolean; onChange: (s: LimitStatus) => void;
}) {
  const tone = confirmed
    ? "border border-brand-green/40 bg-brand-green/15 text-brand-green"
    : "border border-dashed border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400";
  const title = confirmed ? "Confirmed by Amazon — not expected to change." : "Amazon's estimate — can change until Amazon confirms it.";
  if (!editable) {
    return <span data-testid={`capacity-status-${month}`} title={title} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>{confirmed ? "Confirmed" : "Estimate"}</span>;
  }
  return (
    <span className="relative inline-flex">
      <select data-testid={`capacity-status-${month}`} aria-label={`Limit status ${month}`} title={title}
        value={confirmed ? "confirmed" : "estimate"} onChange={(e) => onChange(e.target.value as LimitStatus)}
        className={`cursor-pointer appearance-none rounded-full py-0.5 pl-2 pr-5 text-[10px] font-bold ${tone}`}>
        <option value="confirmed">Confirmed</option>
        <option value="estimate">Estimate</option>
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 opacity-70" />
    </span>
  );
}

/** A limit field: commits on blur / Enter; empty clears the month's limit.
 *  Keyed by the saved value at the call site, so a new value resets the draft. */
function LimitInput({ value, editable, onCommit, label }: {
  value: number | undefined; editable: boolean; label: string; onCommit: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  // The label above says "(cubic feet)", so the value carries no unit.
  if (!editable) return <span className="tabular-nums">{value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>;
  const commit = () => {
    if (draft.trim() === "") { if (value != null) onCommit(null); return; }
    // Accepts 6706,57 (EU numpad comma) as well as 6,706.57 — see parseLimitInput.
    const n = parseLimitInput(draft);
    if (n == null) { setDraft(value == null ? "" : String(value)); return; }
    if (n !== value) onCommit(n);
  };
  return (
    <span className="flex items-center gap-1">
      <input aria-label={label} inputMode="decimal" value={draft} placeholder="limit"
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="h-6 w-24 rounded-full border border-border bg-background px-2 text-right tabular-nums text-foreground" />
    </span>
  );
}

export function CapacityPanel({ accountIds, clientIdCode, editable = false, sends }: {
  accountIds?: string; clientIdCode?: string; editable?: boolean; sends: { sku: string; qty: number }[];
}) {
  const qc = useQueryClient();
  // One card for all storage types; the header pills switch between them (like Capacity Monitor's tabs).
  const [selectedType, setSelectedType] = useState<StorageType | null>(null);
  const q = useQuery({
    queryKey: ["inv-capacity", accountIds],
    queryFn: () => getJson<CapacityResponse>(`/api/sales-summary/inventory/capacity?accountIds=${encodeURIComponent(accountIds ?? "")}`),
    enabled: !!accountIds,
    staleTime: 10 * 60_000,
  });
  const limitsQ = useQuery({
    queryKey: ["inv-capacity-limits", clientIdCode],
    queryFn: () => getJson<{ limits: CapacityLimitRow[] }>(`/api/inventory-capacity-limits?client=${encodeURIComponent(clientIdCode ?? "")}`),
    enabled: !!clientIdCode,
  });
  if (!accountIds || q.isError || !q.data || q.data.types.length === 0) return null;

  const months = outlookMonths(todayIso());
  const limitRowOf = (type: StorageType, month: string) =>
    limitsQ.data?.limits.find((l) => l.storageType === type && l.month === month);
  const limitOf = (type: StorageType, month: string) => limitRowOf(type, month)?.limitFt3;
  // status undefined ⇒ the server keeps the stored one (new limits start as estimates).
  const saveLimit = async (type: StorageType, month: string, limitFt3: number | null, status?: LimitStatus) => {
    const res = await fetch("/api/inventory-capacity-limits", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientIdCode, storageType: type, month, limitFt3, ...(status ? { status } : {}) }),
    });
    if (!res.ok) console.error("[capacity] limit save failed", res.status);
    await qc.invalidateQueries({ queryKey: ["inv-capacity-limits", clientIdCode] });
  };

  const added = addedByType(sends, q.data.skus);
  return (
    <section aria-label="FBA capacity" className="space-y-2">
      {(() => {
        const types = q.data.types;
        const t = types.find((x) => x.type === selectedType) ?? types[0];
        const add = added.get(t.type) ?? { units: 0, ft3: 0 };
        const used = t.onhandFt3 + t.openFt3;
        const after = used + add.ft3;
        const limit = limitOf(t.type, months[0]);
        // One scale for all three months so their limit lines compare directly.
        // ~8% headroom so the highest limit line sits inside the chart, not on its top edge.
        const scale = Math.max(after, ...months.map((m) => limitOf(t.type, m) ?? 0), 1) * 1.08;
        const pct = (n: number) => `${(100 * n) / scale}%`;
        const perUnit = used / Math.max(t.onhandUnits + t.openUnits, 1);
        const maxShip = limit == null ? null : limit - used;
        return (
          <div className={CARD}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex items-center gap-2">
                <h3 className="text-sm font-bold">Capacity Monitor</h3>
                <span role="tablist" aria-label="Storage type" className="flex flex-wrap gap-1">
                  {types.map((x) => (
                    <button key={x.type} type="button" role="tab" aria-selected={x.type === t.type}
                      onClick={() => setSelectedType(x.type)}
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${x.type === t.type ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {x.type}
                    </button>
                  ))}
                </span>
              </span>
              <span className="text-sm">
                {limit == null ? (
                  <span className="text-muted-foreground">Enter this month&apos;s limit to see % used</span>
                ) : (
                  <>
                    <span className="font-bold tabular-nums">{((100 * used) / Math.max(limit, 1)).toFixed(1)}% used</span>
                    <span className="text-muted-foreground"> ({ft3(used)} of {ft3(limit)}) · Maximum shipment </span>
                    <span className={`font-bold tabular-nums ${maxShip! < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{ft3(maxShip!)}</span>
                    <span className="text-muted-foreground"> (~{fmtInt(Math.max(0, maxShip!) / perUnit)} units)</span>
                  </>
                )}
              </span>
            </div>
            {/* One card per month: label + limit field on top, then that month's column and usage table. */}
            <div className="mt-3 grid gap-3 xl:grid-cols-3">
              {months.map((m) => {
                const lim = limitOf(t.type, m);
                const over = lim != null && after > lim;
                // Set by the team from Capacity Monitor (dropdown on the pill) — never from the date.
                const confirmed = limitRowOf(t.type, m)?.status === "confirmed";
                const share = (v: number, plus = false) => (lim == null ? "—" : `${plus ? "+" : ""}${((100 * v) / Math.max(lim, 1)).toFixed(1)}%`);
                return (
                  <div key={m} className="rounded-[14px] border border-border p-3" data-testid={`capacity-month-${m}`}>
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-[11px]">
                      <FlipMonth month={monthLabel(m)} year={m.slice(0, 4)} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-4">
                      {/* Wraps: the small cards sit beside the chart when there is room, below it when not. */}
                      <div className="flex w-full flex-wrap items-start gap-3">
                      {/* Stacked column: open shipments at the base, on-hand, this recommendation;
                          dashed line = this month's limit (green fits, red over). 2px gaps, rounded top. */}
                      {/* ml-16 reserves the strip left of the column for the limit-line labels. */}
                      <div className="relative ml-16 h-40 w-40 shrink-0">
                        <div className="absolute inset-0 flex flex-col-reverse gap-[2px]" role="img"
                          aria-label={`${monthLabel(m)}: open shipments ${ft3(t.openFt3)}, on-hand ${ft3(t.onhandFt3)}, this recommendation ${ft3(add.ft3)}${lim != null ? `, limit ${ft3(lim)}` : ", no limit entered"}`}>
                          {[
                            { label: "Open shipments", v: t.openFt3, units: t.openUnits, cls: "bg-foreground/70 text-background" },
                            { label: "On-hand", v: t.onhandFt3, units: t.onhandUnits, cls: "bg-foreground/25 text-foreground" },
                            { label: "This recommendation", v: add.ft3, units: add.units, cls: "bg-brand text-white" },
                          ].filter((seg) => seg.v > 0).map((seg, i, all) => (
                            <span key={seg.label} title={`${seg.label}: ${ft3(seg.v)} · ${fmtInt(seg.units)} units`}
                              className={`${seg.cls} ${i === all.length - 1 ? "rounded-t-[4px]" : ""} flex items-start justify-start overflow-hidden px-1.5 pt-0.5 text-[10px] font-bold leading-tight tabular-nums hover:opacity-80`}
                              style={{ height: pct(seg.v) }}>
                              {/* z-20: segment text sits above the limit line (z-10); the segment fill stays below it. */}
                              {(COLUMN_PX * seg.v) / scale >= 12 && <span className="relative z-20">{seg.label === "This recommendation" ? "+" : ""}{ft3(seg.v)}</span>}
                            </span>
                          ))}
                        </div>
                        {lim != null && (
                          <div className="pointer-events-none absolute inset-x-[-10px] z-10" style={{ bottom: pct(lim) }}>
                            {/* Thick line with a dark outline so it reads on the orange segment too. */}
                            <div className={`border-t-[3px] drop-shadow-[0_0_1px_rgba(0,0,0,0.9)] ${confirmed ? "border-solid" : "border-dashed"} ${over ? "border-red-500" : "border-brand-green"}`}
                              title={`Limit ${monthLabel(m)}: ${ft3(lim)}`} data-testid={`capacity-limit-line-${m}`} />
                            {/* Label left of the column, centred on the line — never over the segments. */}
                            <span className={`absolute right-full top-0 mr-1 -translate-y-1/2 whitespace-nowrap text-right text-[9px] font-bold leading-tight ${over ? "text-red-600 dark:text-red-400" : "text-brand-green"}`}
                              data-testid={`capacity-limit-label-${m}`}>
                              Limit<br />{ft3(lim)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-[190px] flex-1 flex-col gap-2">
                      {/* Limit card: Total FBA capacity limit (cubic feet), the field and the Confirmed / Estimate pill. */}
                          <div data-testid={`capacity-limit-${m}`} className="flex flex-col gap-1 rounded-[14px] border border-border px-3 py-2 text-[11px]">
                          <span className="text-muted-foreground">Total FBA capacity limit (cubic feet)</span>
                          <span className="flex items-center gap-2">
                            <LimitInput key={`${m}:${lim ?? ""}`} value={lim} editable={editable} label={`${t.type} limit ${m}`} onCommit={(v) => saveLimit(t.type, m, v)} />
                            <StatusPill month={m} confirmed={confirmed} editable={editable && lim != null}
                              onChange={(st) => saveLimit(t.type, m, lim!, st)} />
                          </span>
                        </div>
                      {/* Usage before and after this recommendation, as ft³ and % of this month's limit. */}
                      <div data-testid={`capacity-usage-${m}`} className="rounded-[14px] border border-border px-3 py-2 text-[11px]">
                        <div className="mb-1 text-[10px] font-bold text-muted-foreground">Usage</div>
                        <table className="tabular-nums">
                          <tbody>
                            {[
                              { label: "Before sending", v: used },
                              { label: "After sending", v: after },
                            ].map((r) => (
                              <tr key={r.label}>
                                <td className="pr-3 text-muted-foreground">{r.label}</td>
                                <td className="pr-3 text-right font-bold">{ft3(r.v)}</td>
                                <td className={`text-right font-bold ${lim == null ? "text-muted-foreground" : r.label === "After sending" ? (r.v > lim ? "text-red-600 dark:text-red-400" : "text-brand-green") : ""}`}>
                                  {lim == null ? "—" : `${((100 * r.v) / Math.max(lim, 1)).toFixed(1)}%`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Callout: room left under this month's limit (green ▼) or how far over (red ▲). */}
                      <div data-testid={`capacity-callout-${m}`}
                        className={`rounded-[14px] border px-3 py-2 ${lim == null ? "border-border text-muted-foreground" : over ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" : "border-brand-green/40 bg-brand-green/10 text-brand-green"}`}>
                        {lim == null ? (
                          <span className="text-[11px]">no limit</span>
                        ) : (
                          <>
                            <div className="flex items-center gap-1 text-lg font-bold tabular-nums leading-none">
                              {over ? <ArrowUp className="size-4" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />}
                              {ft3(Math.abs(lim - after))}
                            </div>
                            <div className="mt-1 text-[10px] font-medium">{over ? "over the limit" : "left under the limit"}</div>
                          </>
                        )}
                      </div>
                      </div>
                      </div>
                      {/* Usage, reading top-down as a sum; Volume % is of this month's limit. */}
                      <table className="w-auto text-[11px]" aria-label={`Capacity usage ${m}`}>
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="pb-1 font-bold">Usage</th>
                            <th className="pb-1 pl-4 text-right font-bold">Volume (ft³)</th>
                            <th className="pb-1 pl-4 text-right font-bold">Volume %</th>
                            <th className="pb-1 pl-4 text-right font-bold">Units</th>
                          </tr>
                        </thead>
                        <tbody className="tabular-nums">
                          {[
                            { label: "Open shipments", dot: "bg-foreground/70", v: t.openFt3, u: t.openUnits },
                            { label: "On-hand", dot: "bg-foreground/25", v: t.onhandFt3, u: t.onhandUnits },
                            { label: "Total used space", v: used, u: t.onhandUnits + t.openUnits, total: true },
                            { label: "This recommendation", dot: "bg-brand", v: add.ft3, u: add.units, plus: true },
                            { label: "After sending", v: after, u: t.onhandUnits + t.openUnits + add.units, total: true },
                          ].map((r) => (
                            <tr key={r.label} className={r.total ? "border-t border-border font-bold" : ""}>
                              <td className="py-0.5">
                                <span className={`flex items-center gap-1.5 ${r.total ? "" : "text-muted-foreground"}`}>
                                  {r.dot ? <span className={`size-2 rounded-full ${r.dot}`} /> : <span className="size-2" />}
                                  {r.label}
                                </span>
                              </td>
                              <td className={`py-0.5 pl-4 text-right ${r.plus ? "font-bold" : ""}`}>{r.plus ? "+" : ""}{fmtInt(r.v)}</td>
                              <td className={`py-0.5 pl-4 text-right ${r.plus ? "font-bold" : ""} ${lim != null && r.label === "After sending" ? (r.v > lim ? "text-red-600 dark:text-red-400" : "text-brand-green") : ""}`}>
                                {share(r.v, r.plus)}
                              </td>
                              <td className={`py-0.5 pl-4 text-right ${r.plus ? "font-bold" : ""}`}>{r.plus ? "+" : ""}{fmtInt(r.u)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      <p className="text-[10px] text-muted-foreground">
        Usage as of {q.data.asOf ?? "—"} (Restock Inventory report). Limits are typed in from Seller Central → Inventory → Capacity Monitor.
      </p>
    </section>
  );
}
