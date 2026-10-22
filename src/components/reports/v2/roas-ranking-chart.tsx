"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-array-index-as-key */
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import type { CampaignsResponse } from "./primitives/campaigns";
import { rankByRoas } from "./primitives/chart-derivations";
import { BAND_HEX } from "./primitives/chart-colors";
import { fmtRoas } from "./primitives/kpi-derivations";
import { Surface } from "./primitives/surface";
import { ChartFrame } from "./primitives/chart-frame";

const TARGET_ROAS = 4.0;

export function RoasRankingChart({ campaigns }: { campaigns: CampaignsResponse }) {
  const rows = rankByRoas(campaigns.rows);
  const height = Math.max(200, rows.length * 30 + 24);

  if (rows.length === 0) {
    return (
      <Surface title="ROAS by campaign" subtitle={`Target ${fmtRoas(TARGET_ROAS)}×`} className="col-span-12 lg:col-span-4">
        <div className="p-[18px] text-xs text-mf-muted">No available data for the period.</div>
      </Surface>
    );
  }

  return (
    <ChartFrame title="ROAS by campaign" subtitle={`Target ${fmtRoas(TARGET_ROAS)}×`} className="col-span-12 lg:col-span-4">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <XAxis type="number" tick={{ fontSize: 10, fill: "#6E6C77" }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" width={240} tick={{ fontSize: 10, fill: "#2C2B35" }} tickLine={false} axisLine={false} interval={0} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #D8D7DC", fontSize: 11 }}
            formatter={(value) => [`${fmtRoas(Number(value))}×`, "ROAS"]}
          />
          <ReferenceLine x={TARGET_ROAS} stroke="#6E6C77" strokeDasharray="5 5" />
          <Bar dataKey="roas" barSize={18} radius={[0, 4, 4, 0]}>
            {rows.map((r, i) => (
              <Cell key={`roas-${i}`} fill={BAND_HEX[r.band]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
