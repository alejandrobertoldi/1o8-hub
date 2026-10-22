"use client";
import { stateDisplayName } from "@/lib/reports/order-geography";
import type { StateBubble } from "@/lib/fba-inventory-map/state-grouping";
import { StateFcList } from "./state-fc-list";
import { StateMiniMap } from "./state-mini-map";

const CARD = "rounded-[18px] border border-stone-200 bg-card p-5";
const MICRO = "text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground";
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function StatePanel({
  stateCode,
  bubble,
}: {
  stateCode: string | null;
  bubble: StateBubble | null;
}) {
  if (!stateCode) {
    return (
      <aside data-testid="state-panel" className={CARD}>
        <p className="text-[13px] text-muted-foreground">No FC in this month could be placed on the map.</p>
      </aside>
    );
  }
  const name = stateDisplayName(stateCode);

  return (
    <aside data-testid="state-panel" className={CARD}>
      <div className={MICRO}>State</div>
      <h2 className="mt-1 text-[20px] font-bold leading-tight">{name}</h2>
      {bubble && <StateMiniMap stateCode={stateCode} metros={bubble.metros} />}

      {bubble ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Mini label="Units" value={nf.format(bubble.units)} />
          <Mini label="Of all stock" value={pct(bubble.share)} />
          <Mini label="Est. fee" value={usd.format(bubble.fee)} />
        </div>
      ) : (
        <p className="mt-2 text-[13px]">No FBA stock in {name}.</p>
      )}

      {bubble && bubble.fcs.length > 0 && (
        <div className="mt-4">
          <StateFcList fcs={bubble.fcs} />
        </div>
      )}
    </aside>
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
