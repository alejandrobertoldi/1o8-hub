"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-array-index-as-key */
import { ResponsiveContainer, ScatterChart, Scatter, Cell, XAxis, YAxis, ZAxis, Tooltip, ReferenceLine } from "recharts";
import type { CampaignsResponse } from "./primitives/campaigns";
import { toScatter } from "./primitives/chart-derivations";
import { BAND_HEX } from "./primitives/chart-colors";
import { fmtRoas, fmtCurrencyCompact } from "./primitives/kpi-derivations";
import { Surface } from "./primitives/surface";
import { ChartFrame } from "./primitives/chart-frame";

const TARGET_ROAS = 4.0;

export function SpendRoasScatter({ campaigns }: { campaigns: CampaignsResponse }) {
  // r (px) → area via ZAxis range so bubble size reads as ad revenue.
  const points = toScatter(campaigns.rows).map((p) => ({ ...p, z: p.r * p.r }));

  if (points.length === 0) {
    return (
      <Surface title="Spend vs ROAS" subtitle="Bubble = ad revenue" className="col-span-12 lg:col-span-4">
        <div className="p-[18px] text-xs text-mf-muted">No available data for the period.</div>
      </Surface>
    );
  }

  return (
    <ChartFrame title="Spend vs ROAS" subtitle="Bubble = ad revenue" className="col-span-12 lg:col-span-4">
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 12, right: 16, left: 4, bottom: 12 }}>
          <XAxis
            type="number" dataKey="x" name="Ad spend"
            tickFormatter={(v) => fmtCurrencyCompact(Number(v))}
            tick={{ fontSize: 10, fill: "#6E6C77" }} tickLine={false} axisLine={false}
          />
          <YAxis
            type="number" dataKey="y" name="ROAS"
            tickFormatter={(v) => `${fmtRoas(Number(v))}×`}
            tick={{ fontSize: 10, fill: "#6E6C77" }} tickLine={false} axisLine={false} width={44}
          />
          <ZAxis type="number" dataKey="z" range={[36, 784]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={{ borderRadius: 8, border: "1px solid #D8D7DC", fontSize: 11 }}
            formatter={(value, name) => {
              if (name === "ROAS") return [`${fmtRoas(Number(value))}×`, name];
              if (name === "Ad spend") return [fmtCurrencyCompact(Number(value)), name];
              return [String(value), String(name)];
            }}
          />
          <ReferenceLine y={TARGET_ROAS} stroke="#6E6C77" strokeDasharray="5 5" />
          <Scatter data={points} isAnimationActive={false}>
            {points.map((p, i) => (
              <Cell key={`pt-${i}`} fill={BAND_HEX[p.band]} fillOpacity={0.7} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
