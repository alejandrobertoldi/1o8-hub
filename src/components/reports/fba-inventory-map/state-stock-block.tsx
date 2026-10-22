"use client";
import { stateDisplayName } from "@/lib/reports/order-geography";
import { monthLabel } from "@/lib/fba-inventory-map/month";
import type { StateBubble } from "@/lib/fba-inventory-map/state-grouping";
import { GAP_TONE_CLASS, gapTone } from "./division-callout";
import { StateFcList } from "./state-fc-list";
import { StateMiniMap } from "./state-mini-map";

const MICRO = "text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground";
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
// One decimal everywhere in this block, so the gap badge always equals Stock − Orders as displayed.
const pct1 = (n: number) => Math.round(n * 1000) / 10;
const pct = (n: number) => `${pct1(n).toFixed(1)}%`;
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Order Geography's State detail add-on: this state's FBA stock for one month, beside its orders. */
export function StateStockBlock({
  stateCode, bubble, month, placedUnits, orderShare, filtered,
}: { stateCode: string; bubble: StateBubble | null; month: string; placedUnits: number; orderShare: number | null; filtered: boolean }) {
  const mon = monthLabel(month);
  const stockShare = ratio(bubble?.units ?? 0, placedUnits);
  const gapPts = orderShare === null ? 0 : Math.round((pct1(stockShare) - pct1(orderShare)) * 10) / 10;
  return (
    <div data-testid="state-stock-block" className="border-t border-stone-200 px-[18px] py-3">
      <div className={MICRO}>FBA stock · {mon}</div>
      {!bubble ? (
        <p className="mt-1 text-[13px]">No FBA stock {filtered ? "for this product " : ""}in {stateDisplayName(stateCode)} in {mon}.</p>
      ) : (
        <>
          <StateMiniMap stateCode={stateCode} metros={bubble.metros} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Mini label="Units" value={nf.format(bubble.units)} />
            <Mini label="Est. fee" value={usd.format(bubble.fee)} />
          </div>
          {orderShare !== null && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
              <span>Units ordered <span className="font-bold tabular-nums">{pct(orderShare)}</span></span>
              <span>Stock <span className="font-bold tabular-nums">{pct(stockShare)}</span></span>
              <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${GAP_TONE_CLASS[gapTone(gapPts)]}`}>
                {`${gapPts > 0 ? "+" : ""}${gapPts.toFixed(1)}%`}
              </span>
            </div>
          )}
          <div className="mt-3">
            <StateFcList fcs={bubble.fcs} />
          </div>
        </>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className={MICRO}>{label}</div>
      <div className="mt-0.5 text-[16px] font-bold tabular-nums">{value}</div>
    </div>
  );
}
