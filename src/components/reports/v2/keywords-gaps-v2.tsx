"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/no-array-index-as-key */

import { useEffect, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, LabelList, XAxis, YAxis, Tooltip } from "recharts";
import { Surface } from "./primitives/surface";
import { ChartFrame } from "./primitives/chart-frame";
import { accentFor } from "./primitives/chart-colors";
import { type Surface as SurfaceKind } from "./primitives/palette";

// Sponsored Products takes the surface accent; Sponsored Brands takes the
// shared categorical blue. Recharts fills cannot resolve CSS var().
export function gapsBarColor(surface: SurfaceKind, accentIndex: 0 | 1): string {
  return accentIndex === 0 ? accentFor(surface) : "#006BBB";
}

interface MatchTypeRow { match_type: string; keyword_count: number }
interface KeywordRow {
  keyword_text: string;
  broad_revenue: number; broad_spend: number;
  exact_revenue: number; exact_spend: number;
  phrase_revenue: number; phrase_spend: number;
}
interface CloudWord { text: string; value: number }

interface GapsData {
  matchType: MatchTypeRow[];
  keywords: KeywordRow[];
  exactCloud: CloudWord[];
  phraseCloud: CloudWord[];
}

interface ApiResponse { sp: GapsData; sb: GapsData }

function fmtCurrency(n: number) {
  if (!n) return "0.00";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(n: number) {
  return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const AXIS_TICK = { fontSize: 10, fill: "#6E6C77" };
const TOOLTIP_STYLE = { borderRadius: 8, border: "1px solid #D8D7DC", fontSize: 11 };

// Sequential magnitude tint — ONE hue (brand orange), light→stronger, never a
// multi-hue ramp. Text stays ink; the table's own numbers are the exact values.
function sequentialBg(value: number, max: number): string | undefined {
  if (!max || !value) return undefined;
  const ratio = Math.min(value / max, 1);
  return `rgba(247,191,29,${(0.07 + 0.33 * ratio).toFixed(3)})`;
}

// ── Top keywords by revenue (replaces the word clouds) ───────────────────────
function TopKeywordsBars({ title, words, color }: { title: string; words: CloudWord[]; color: string }) {
  const data = words
    .filter((w) => w.value > 0)
    .toSorted((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((w) => ({ name: w.text, value: w.value }));

  if (data.length === 0) {
    return (
      <Surface title={title}>
        <div className="p-[18px] text-xs text-mf-muted">No available data for the period.</div>
      </Surface>
    );
  }

  return (
    <ChartFrame title={title} subtitle={`Top ${data.length} keywords`}>
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 28)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 54, left: 0, bottom: 4 }}>
          <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} hide />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#2C2B35" }} tickLine={false} axisLine={false} width={110} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "#2C2B35" }} formatter={(v) => [`$${fmtCurrency(Number(v))}`, "Revenue"]} cursor={{ fill: "rgba(16,34,39,0.05)" }} />
          <Bar dataKey="value" fill={color} maxBarSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="value" position="right" fill="#6E6C77" fontSize={9} formatter={(v) => `$${fmtCurrency(Number(v))}`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ── Match type table ──────────────────────────────────────────────────────────
function MatchTypeTable({ rows }: { rows: MatchTypeRow[] }) {
  const total = rows.reduce((s, r) => s + r.keyword_count, 0);
  return (
    <Surface title="Match types">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border-b border-mf-line bg-mf-ghost px-4 py-2.5 text-left font-bold text-mf-ink">Match Type</th>
            <th className="border-b border-mf-line bg-mf-ghost px-4 py-2.5 text-right font-bold text-mf-ink">Keywords</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.match_type} className={`border-b border-mf-line/60 ${i % 2 === 0 ? "bg-white" : "bg-[#F7F6FB]"}`}>
              <td className="px-4 py-2 font-semibold text-mf-ink">{row.match_type}</td>
              <td className="px-4 py-2 text-right tabular-nums text-mf-ink">{fmtNum(row.keyword_count)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="border-t border-mf-line bg-mf-ghost px-4 py-2.5 font-bold text-mf-ink">Total</td>
            <td className="border-t border-mf-line bg-mf-ghost px-4 py-2.5 text-right font-bold tabular-nums text-mf-ink">{fmtNum(total)}</td>
          </tr>
        </tfoot>
      </table>
    </Surface>
  );
}

// ── Keywords gap table ────────────────────────────────────────────────────────
const NUM_COLS: { key: keyof KeywordRow; label: string }[] = [
  { key: "broad_revenue", label: "Broad Revenue" },
  { key: "broad_spend", label: "Broad Spend" },
  { key: "exact_revenue", label: "Exact Revenue" },
  { key: "exact_spend", label: "Exact Spend" },
  { key: "phrase_revenue", label: "Phrase Revenue" },
  { key: "phrase_spend", label: "Phrase Spend" },
];

function KeywordsGapTable({ rows }: { rows: KeywordRow[] }) {
  const [search, setSearch] = useState("");
  const filtered = rows.filter((r) => r.keyword_text.toLowerCase().includes(search.toLowerCase()));

  const maxPerCol = NUM_COLS.reduce((acc, col) => {
    acc[col.key] = filtered.length ? Math.max(...filtered.map((r) => r[col.key] as number)) : 0;
    return acc;
  }, {} as Record<string, number>);

  const totals = NUM_COLS.reduce((acc, col) => {
    acc[col.key] = filtered.reduce((s, r) => s + (r[col.key] as number), 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <Surface
      title="Keywords gaps"
      subtitle={`${filtered.length} keywords · tint = share of column max`}
      tools={
        <input
          type="text"
          placeholder="Search keyword…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-lg border border-mf-line bg-white px-3 py-1.5 text-xs text-mf-ink outline-none placeholder:text-mf-muted focus:border-brand"
        />
      }
    >
      <div className="custom-scroll max-h-[500px] overflow-auto">
        <table className="border-collapse text-xs" style={{ minWidth: "max-content", width: "100%" }}>
          <thead className="sticky top-0 z-30">
            <tr>
              <th className="sticky left-0 top-0 z-40 border-b border-r border-mf-line bg-mf-ghost px-4 py-2.5 text-left font-bold text-mf-ink" style={{ minWidth: "260px" }}>
                Keyword
              </th>
              {NUM_COLS.map((col) => (
                <th key={col.key as string} className="border-b border-mf-line bg-mf-ghost px-4 py-2.5 text-right font-bold text-mf-ink" style={{ minWidth: "130px" }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={`${row.keyword_text}-${i}`} className="border-b border-mf-line/60 transition-colors hover:bg-mf-ghost/60">
                <td
                  className="sticky left-0 z-10 whitespace-nowrap border-r border-mf-line px-4 py-2 font-semibold text-mf-ink"
                  style={{ backgroundColor: i % 2 === 0 ? "#FEFEFE" : "#F7F6FB" }}
                >
                  {row.keyword_text}
                </td>
                {NUM_COLS.map((col) => {
                  const val = row[col.key] as number;
                  return (
                    <td
                      key={col.key as string}
                      className={`whitespace-nowrap px-4 py-2 text-right tabular-nums text-mf-ink ${i % 2 === 0 ? "bg-white" : "bg-[#F7F6FB]"}`}
                      style={{ backgroundColor: sequentialBg(val, maxPerCol[col.key as string]) }}
                    >
                      {fmtCurrency(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-mf-muted">No keywords found</td>
              </tr>
            )}
          </tbody>
          <tfoot className="sticky bottom-0 z-10">
            <tr>
              <td className="sticky left-0 z-20 border-r border-t border-mf-line bg-mf-ghost px-4 py-2.5 font-bold text-mf-ink">Total</td>
              {NUM_COLS.map((col) => (
                <td key={col.key as string} className="whitespace-nowrap border-t border-mf-line bg-mf-ghost px-4 py-2.5 text-right font-bold tabular-nums text-mf-ink">
                  {fmtCurrency(totals[col.key as string])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Surface>
  );
}

// ── Block & main ──────────────────────────────────────────────────────────────
function KeywordsGapsBlock({
  title,
  data,
  accentIndex,
  surface,
}: {
  title: string;
  data: GapsData;
  accentIndex: 0 | 1;
  surface: SurfaceKind;
}) {
  const barColor = gapsBarColor(surface, accentIndex);
  return (
    <section>
      <h3 className="m-0 mb-3.5 text-[15px] font-bold tracking-tight text-mf-ink">{title}</h3>
      <div className="grid items-start gap-4 xl:grid-cols-4">
        <div className="flex flex-col gap-4">
          <MatchTypeTable rows={data.matchType} />
          <TopKeywordsBars title="Exact revenue by keyword" words={data.exactCloud} color={barColor} />
          <TopKeywordsBars title="Phrase revenue by keyword" words={data.phraseCloud} color={barColor} />
        </div>
        <div className="xl:col-span-3">
          <KeywordsGapTable rows={data.keywords} />
        </div>
      </div>
    </section>
  );
}

export function KeywordsGapsV2({
  surface,
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  surface: SurfaceKind;
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
  const requestKey = accountId && start && end ? `${accountId}:${start}:${end}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: ApiResponse | null } | null>(null);

  useEffect(() => {
    if (!accountId || !start || !end) return;

    let ignore = false;
    fetch(`/api/reports/keywords-gaps?accountId=${accountId}&start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d) => {
        if (!ignore) setResult({ key: requestKey, data: d });
      })
      .catch(() => {
        if (!ignore) setResult({ key: requestKey, data: null });
      });
    return () => {
      ignore = true;
    };
  }, [accountId, start, end, refreshKey, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={`sk-${i}`} className="h-64 animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8">
      <KeywordsGapsBlock title="Sponsored Products — keywords gaps" data={data.sp} accentIndex={0} surface={surface} />
      <KeywordsGapsBlock title="Sponsored Brands — keywords gaps" data={data.sb} accentIndex={1} surface={surface} />
    </div>
  );
}
