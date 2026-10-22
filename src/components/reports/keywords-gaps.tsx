/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useEffect, useState, useRef } from "react";

interface MatchTypeRow { match_type: string; keyword_count: number }
interface KeywordRow {
  keyword_text: string;
  broad_revenue: number; broad_spend: number;
  exact_revenue: number; exact_spend: number;
  phrase_revenue: number; phrase_spend: number;
}
interface CloudWord { text: string; value: number }

interface GapsData {
  matchType:   MatchTypeRow[];
  keywords:    KeywordRow[];
  exactCloud:  CloudWord[];
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

// ── Gradient cell color ───────────────────────────────────────────────────────

function getGradientColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "#ffffff"; // light red for 0
  const ratio = Math.min(value / max, 1);
  // red -> yellow -> green
  if (ratio < 0.5) {
    const r = 255;
    const g = Math.round(ratio * 2 * 255);
    return `rgb(${r},${g},0)`;
  } else {
    const r = Math.round((1 - (ratio - 0.5) * 2) * 255);
    const g = 200;
    return `rgb(${r},${g},0)`;
  }
}

// ── Word Cloud ────────────────────────────────────────────────────────────────

function WordCloud({ title, words }: { title: string; words: CloudWord[] }) {
  if (words.length === 0) return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-center h-48">
      <p className="text-xs text-gray-400">No data</p>
    </div>
  );

  const max = Math.max(...words.map((w) => w.value));
  const min = Math.min(...words.map((w) => w.value));

  console.log(title, {
  min,
  max,
  difference: max - min,
  words: words.map((w) => ({
    text: w.text,
    value: w.value,
    fontSize:
      max === min
        ? 16
        : Math.round(10 + ((w.value - min) / (max - min)) * 24),
  })),
});

  const fontSize = (value: number) => {
    if (max === min) return 16;
    return Math.round(10 + ((value - min) / (max - min)) * 24);
  };

  const colors = ["#F7BF1Ds", "#22d3ee", "#16a34a", "#dc2626", "#7c3aed", "#0ea5e9", "#ea580c"];

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden p-4">
      <h3 className="text-xs font-semibold text-gray-700 text-center mb-3">{title}</h3>
      <div className="flex flex-wrap gap-2 justify-center items-center min-h-[120px]">
        {words.map((w, i) => (
          <span
            key={w.text}
            className="leading-tight cursor-default"
            style={{
              fontSize: `${fontSize(w.value)}px`,
              color: colors[i % colors.length],
              opacity: w.value === 0 ? 0.25 : 0.7 + (w.value / max) * 0.3
            }}
            title={`${w.text}: $${fmtCurrency(w.value)}`}
          >
            {w.text}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Match Type Table ──────────────────────────────────────────────────────────

function MatchTypeTable({ rows }: { rows: MatchTypeRow[] }) {
  const total = rows.reduce((s, r) => s + r.keyword_count, 0);
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-2.5 font-semibold text-[#f5a623] whitespace-nowrap">Match Type</th>
              <th className="text-right px-4 py-2.5 font-semibold text-[#f5a623] whitespace-nowrap">Keyword</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.match_type} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                <td className="px-4 py-2 text-gray-800 font-medium">{row.match_type}</td>
                <td className="px-4 py-2 text-right text-gray-700 tabular-nums">{fmtNum(row.keyword_count)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0">
            <tr className="border-t-2 border-[#f5a623] bg-gray-50 font-bold">
              <td className="px-4 py-2.5 text-[#f5a623]">Total</td>
              <td className="px-4 py-2.5 text-right text-gray-800 tabular-nums">{fmtNum(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Keywords Gap Table ────────────────────────────────────────────────────────

const NUM_COLS: { key: keyof KeywordRow; label: string }[] = [
  { key: "broad_revenue",  label: "Broad Revenue"  },
  { key: "broad_spend",    label: "Broad Spend"    },
  { key: "exact_revenue",  label: "Exact Revenue"  },
  { key: "exact_spend",    label: "Exact Spend"    },
  { key: "phrase_revenue", label: "Phrase Revenue" },
  { key: "phrase_spend",   label: "Phrase Spend"   },
];

function KeywordsGapTable({ rows }: { rows: KeywordRow[] }) {
  const [search, setSearch] = useState("");
  const filtered = rows.filter((r) =>
    r.keyword_text.toLowerCase().includes(search.toLowerCase())
  );

  // Max per column for gradient
  const maxPerCol = NUM_COLS.reduce((acc, col) => {
    acc[col.key] = Math.max(...filtered.map((r) => r[col.key] as number));
    return acc;
  }, {} as Record<string, number>);

  const totals = NUM_COLS.reduce((acc, col) => {
    acc[col.key] = filtered.reduce((s, r) => s + (r[col.key] as number), 0);
    return acc;
  }, {} as Record<string, number>);

  return (
  <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
    <div className="px-4 py-3 bg-[#3C4043] grid grid-cols-[160px_1fr_240px] items-center gap-4">
      <span className="text-xs font-semibold text-[#F7BF1D] whitespace-nowrap">
        {filtered.length} keywords
      </span>

      <h3 className="text-sm font-semibold text-[#F7BF1D] text-center">
        Keywords Gaps
      </h3>

      <input
        type="text"
        placeholder="Search keyword…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="text-xs rounded-lg border border-[#F7BF1D] bg-white text-black
                   placeholder:text-gray-400 px-3 py-1.5 w-full outline-none
                   focus:ring-1 focus:ring-[#F7BF1D]"
      />
    </div>

    <div className="overflow-auto max-h-[500px] custom-scroll">
      <table
        className="text-xs border-collapse"
        style={{ minWidth: "max-content", width: "100%" }}
      >
        <thead className="sticky top-0 z-30 bg-[#3C4043]">
          <tr className="bg-[#3C4043] border-b border-[#F7BF1D]">
            <th
              className="sticky left-0 top-0 z-40 text-left px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap bg-[#3C4043] border-r border-white/10"
              style={{ minWidth: "260px" }}
            >
              Keyword
            </th>

            {NUM_COLS.map((col) => (
              <th
                key={col.key as string}
                className="text-right px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap border-r border-white/10"
                style={{ minWidth: "130px" }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {filtered.map((row, i) => (
            <tr
              key={`${row.keyword_text}-${i}`}
              className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                i % 2 === 0 ? "bg-white" : "bg-gray-50/40"
              }`}
            >
              <td
                className="sticky left-0 z-10 px-4 py-2 text-black font-bold border-r border-gray-200 whitespace-nowrap"
                style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}
              >
                {row.keyword_text}
              </td>

              {NUM_COLS.map((col) => {
                const val = row[col.key] as number;
                const bg = getGradientColor(val, maxPerCol[col.key as string]);

                return (
                  <td
                    key={col.key as string}
                    className="px-4 py-2 text-right tabular-nums font-medium whitespace-nowrap text-black"
                    style={{ backgroundColor: bg }}
                  >
                    {fmtCurrency(val)}
                  </td>
                );
              })}
            </tr>
          ))}

          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-black">
                No keywords found
              </td>
            </tr>
          )}
        </tbody>

        <tfoot className="sticky bottom-0 z-10">
          <tr className="bg-[#3C4043] border-t border-[#F7BF1D] font-bold">
            <td className="sticky left-0 z-20 px-4 py-2.5 text-[#F7BF1D] font-bold border-r border-white/10 bg-[#3C4043]">
              Total
            </td>

            {NUM_COLS.map((col) => (
              <td
                key={col.key as string}
                className="px-4 py-2.5 text-right text-[#F7BF1D] tabular-nums whitespace-nowrap"
              >
                {fmtCurrency(totals[col.key as string])}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
);
}

// ── Block ─────────────────────────────────────────────────────────────────────

function KeywordsGapsBlock({ title, data }: { title: string; data: GapsData }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <h2 className="text-sm font-bold text-gray-700 px-4 py-1.5 rounded-full border border-gray-200 bg-white whitespace-nowrap">
          {title}
        </h2>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <div className="grid grid-cols-4 gap-4">
        {/* Left col: match type table + word clouds */}
        <div className="flex flex-col gap-4">
          <MatchTypeTable rows={data.matchType} />
          <WordCloud title="Exact Revenue by Keyword"  words={data.exactCloud}  />
          <WordCloud title="Phrase Revenue by Keyword" words={data.phraseCloud} />
        </div>
        {/* Right: keywords gap table */}
        <div className="col-span-3">
          <KeywordsGapTable rows={data.keywords} />
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function KeywordsGaps({
  accountId, start, end, refreshKey = 0,
}: { accountId: string; start: string; end: string; refreshKey?: number }) {
  const [data, setData]       = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId || !start || !end) return;
    setLoading(true);
    fetch(`/api/reports/keywords-gaps?accountId=${accountId}&start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [accountId, start, end, refreshKey]);

  if (loading) return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white animate-pulse h-64" />
      ))}
    </div>
  );
  if (!data) return null;

  return (
    <div className="space-y-8">
      <KeywordsGapsBlock title="Sponsored Products - Keywords Gaps" data={data.sp} />
      <KeywordsGapsBlock title="Sponsored Brands - Keywords Gaps"   data={data.sb} />
    </div>
  );
}