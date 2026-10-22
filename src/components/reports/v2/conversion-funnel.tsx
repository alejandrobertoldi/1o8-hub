"use client";
import type { OverviewResponse } from "./primitives/kpi-derivations";
import { fmtCurrencyCompact, fmtInt, fmtPct } from "./primitives/kpi-derivations";
import { computeFunnel, type FunnelStep } from "./primitives/chart-derivations";
import { accentFor } from "./primitives/chart-colors";
import type { Surface as SurfaceKind } from "./primitives/palette";
import { Surface } from "./primitives/surface";
import { ChartFrame } from "./primitives/chart-frame";

function stepValue(s: FunnelStep): string {
  return s.unit === "currency" ? fmtCurrencyCompact(s.value) : fmtInt(s.value);
}

export function ConversionFunnel({ overview, surface }: { overview: OverviewResponse; surface: SurfaceKind }) {
  const accent = accentFor(surface);
  const steps = computeFunnel(overview);
  const maxCount = Math.max(1, ...steps.filter((s) => s.unit === "count").map((s) => s.value));

  // computeFunnel always returns the 4 steps, so an empty period shows up as all-zero values.
  if (steps.every((s) => s.value === 0)) {
    return (
      <Surface title="Conversion funnel" subtitle="Sessions → Clicks → Conversions → Sales" className="col-span-12 lg:col-span-4">
        <div className="p-[18px] text-xs text-mf-muted">No available data for the period.</div>
      </Surface>
    );
  }

  return (
    <ChartFrame title="Conversion funnel" subtitle="Sessions → Clicks → Conversions → Sales" className="col-span-12 lg:col-span-4">
      <ol className="flex flex-col gap-2.5">
        {steps.map((s) => {
          // count steps size by share of the largest count; the $ step fills the track.
          const widthPct = s.unit === "currency" ? 100 : Math.max(6, (s.value / maxCount) * 100);
          return (
            <li key={s.key}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="font-bold uppercase tracking-wide text-mf-muted">{s.label}</span>
                <span className="tabular-nums text-mf-ink">
                  <span className="font-extrabold">{stepValue(s)}</span>
                  {s.pctOfSessions != null && <span className="ml-1.5 text-mf-muted">{fmtPct(s.pctOfSessions)}</span>}
                  {s.dollarsPerOrder != null && <span className="ml-1.5 text-mf-muted">{fmtCurrencyCompact(s.dollarsPerOrder)}/order</span>}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-mf-ghost">
                <div className="h-full rounded-full" style={{ width: `${widthPct}%`, background: accent, opacity: s.unit === "currency" ? 0.55 : 1 }} />
              </div>
            </li>
          );
        })}
      </ol>
    </ChartFrame>
  );
}
