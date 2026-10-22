"use client";
import { useEffect, useState } from "react";
import { UsChoropleth } from "@/components/reports/v2/us-choropleth";
import { monthLabel } from "@/lib/fba-inventory-map/month";
import type { FbaMapResponse } from "@/lib/fba-inventory-map/types";
import type { StockMonths } from "./use-stock-layer";
import { StateBubbleOverlay, type BubbleHover } from "./state-bubble-overlay";
import { StatePanel } from "./state-panel";
import { groupByState } from "@/lib/fba-inventory-map/state-grouping";
import { FcTable } from "./fc-table";

const CARD = "rounded-[18px] border border-stone-200 bg-card p-5";
const MICRO = "text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground";
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number) => `${Math.round(n * 100)}%`;

type Result = { status: "error"; message: string } | { status: "ok"; data: FbaMapResponse };

export function FbaInventoryMapSection({
  accountId, refreshKey, month = null, onMonths,
}: { accountId: string; refreshKey: number; month?: string | null; onMonths?: (m: StockMonths) => void }) {
  // Keyed by account+month: a change of either drops the product/state pick in the SAME
  // render (not via a follow-up effect), so no stale pairing ever fires a wasted fetch.
  const pickKey = `${accountId}:${month ?? ""}`;
  const [selection, setSelection] = useState<{ key: string; asin: string | null; state: string | null }>({ key: pickKey, asin: null, state: null });
  const asin = selection.key === pickKey ? selection.asin : null;
  const pickedState = selection.key === pickKey ? selection.state : null;
  // us-choropleth sends null when the selected state is clicked again: ignore it, keep the state.
  const pickState = (code: string | null) => {
    if (code) setSelection({ key: pickKey, asin, state: code });
  };

  const [attempt, setAttempt] = useState(0);
  const [hover, setHover] = useState<BubbleHover | null>(null);

  // Loading is derived by comparing the in-flight request's key against the
  // last-settled one, rather than set synchronously at the top of the effect
  // (which would cascade a render on every dependency change).
  const requestKey = accountId ? `${accountId}:${month ?? ""}:${asin ?? ""}:${refreshKey}:${attempt}` : "";
  const [settled, setSettled] = useState<{ key: string; result: Result } | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let live = true;
    const key = requestKey;
    const qs = new URLSearchParams({ accountId });
    if (month) qs.set("month", month);
    if (asin) qs.set("asin", asin);
    fetch(`/api/reports/fba-inventory-map?${qs.toString()}`)
      .then(async (res) => {
        // A platform-level failure (e.g. a 504 past maxDuration) can return an HTML
        // error page instead of JSON; guard the parse so that shows the designed
        // error card with the HTTP status, not a raw "Unexpected token '<'".
        let json: unknown;
        try {
          json = await res.json();
        } catch {
          if (live) setSettled({ key, result: { status: "error", message: `HTTP ${res.status}` } });
          return;
        }
        if (!live) return;
        if (!res.ok) {
          const message = (json as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
          setSettled({ key, result: { status: "error", message } });
        } else {
          setSettled({ key, result: { status: "ok", data: json as FbaMapResponse } });
        }
      })
      .catch((e) => live && setSettled({ key, result: { status: "error", message: String(e) } }));
    return () => { live = false; };
  }, [accountId, month, asin, refreshKey, attempt, requestKey]);

  // `settled` is state-held, so this fires once per settled fetch.
  useEffect(() => {
    if (!onMonths || settled?.result.status !== "ok") return;
    const d = settled.result.data;
    onMonths({ months: [...d.availableMonths].sort().reverse(), month: d.month });
  }, [settled, onMonths]);

  if (!accountId) return <div className={CARD}>Pick an account.</div>;
  const loading = settled?.key !== requestKey;
  if (loading) return <div className={`${CARD} text-muted-foreground`}>Loading…</div>;
  const state = settled.result;
  if (state.status === "error") {
    return (
      <div className={CARD}>
        <p className="text-[13px]">Couldn&apos;t load the storage-fee report: {state.message}</p>
        <button type="button" onClick={() => setAttempt((a) => a + 1)} className="mt-3 h-9 rounded-full bg-brand px-3 text-[13px] font-medium leading-none text-white hover:bg-brand-hover">Retry</button>
      </div>
    );
  }

  const { data } = state;
  if (data.availableMonths.length === 0) return <div className={CARD}>No FBA storage-fee reports for this account</div>;

  const productSelect = data.asins.length > 0 && (
    <select
      aria-label="Product"
      value={asin ?? ""}
      onChange={(e) => setSelection({ key: pickKey, asin: e.target.value || null, state: null })}
      className="h-9 max-w-[360px] truncate rounded-full border border-stone-200 bg-card px-3 text-[13px] font-medium"
    >
      <option value="">All products</option>
      {data.asins.map((a) => <option key={a.asin} value={a.asin}>{a.title === a.asin ? a.asin : `${a.title} (${a.asin})`}</option>)}
    </select>
  );

  if (data.totals.units === 0) {
    // An ASIN filter, not a missing report, can also cause zero units for this month:
    // in that case the product select is the way back to "All products" (a dead end
    // otherwise, since this branch doesn't render the normal controls row), and the
    // copy should name the actual cause instead of claiming the report doesn't exist.
    return (
      <div className={`${CARD} space-y-3`}>
        {productSelect && <div className="flex items-center gap-2">{productSelect}</div>}
        <p className="text-[13px]">
          {data.asin ? `No stock for ${data.asin} in ${data.month}.` : `No storage-fee report for ${data.month}. Pick another month above.`}
        </p>
      </div>
    );
  }

  const placedShare = data.totals.units > 0 ? data.totals.placedUnits / data.totals.units : 0;
  const bubbles = groupByState(data.dots, data.totals.units);
  const effectiveState = pickedState ?? bubbles[0]?.state ?? null;
  const bubble = bubbles.find((b) => b.state === effectiveState) ?? null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        {productSelect}
        {data.month && <span className="text-[12px] font-bold">{`Stock: ${monthLabel(data.month)} snapshot`}</span>}
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Avg units on hand" value={nf.format(data.totals.units)} />
        <Stat label="Placed on map" value={pct(placedShare)} />
        <Stat testId="stat-unplaced" label="Unplaced" value={`${nf.format(data.unplaced.units)} units · ${pct(data.unplaced.share)}`} />
        <Stat label="Est. storage fee" value={usd.format(data.totals.fee)} />
      </div>

      <div className="grid gap-2.5 lg:grid-cols-3">
        <section className={`${CARD} lg:col-span-2`}>
          <UsChoropleth
            surface="hub"
            data={{}}
            selected={effectiveState}
            onSelect={pickState}
            formatLegend={(v) => nf.format(v)}
            overlay={<StateBubbleOverlay bubbles={bubbles} selected={effectiveState} onSelect={pickState} onHover={setHover} />}
          />
          <div className={`mt-2 flex flex-wrap items-center gap-4 ${MICRO}`}>
            <span className="flex items-center gap-1.5"><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="var(--foreground)" fillOpacity={0.85} /></svg>FBA units by state (circle size)</span>
          </div>
          {hover && (
            <div
              className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md bg-mf-ink px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg"
              style={{ left: hover.x, top: hover.y }}
            >
              <div className="font-bold">{hover.bubble.name}</div>
              <div className="tabular-nums">{nf.format(hover.bubble.units)} units · {pct(hover.bubble.share)} · {usd.format(hover.bubble.fee)}</div>
              <div className="opacity-80">{hover.bubble.fcs.length} FC{hover.bubble.fcs.length === 1 ? "" : "s"} · click for detail</div>
            </div>
          )}
        </section>
        <StatePanel stateCode={effectiveState} bubble={bubble} />
      </div>

      <FcTable data={data} />
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div data-testid={testId} className={CARD}>
      <div className={MICRO}>{label}</div>
      <div className="mt-1 text-[22px] font-bold tabular-nums">{value}</div>
    </div>
  );
}
