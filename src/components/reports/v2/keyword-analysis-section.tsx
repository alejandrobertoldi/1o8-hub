"use client";
import { useMemo, useState } from "react";
import type { Surface as SurfaceKind } from "./primitives/palette";
import { getSurfacePalette } from "./primitives/palette";
import type { KeywordsResponse } from "./primitives/keywords";
import { Surface } from "./primitives/surface";
import { MetricTable, type MetricColumn } from "./primitives/metric-table";
import { downloadCsv } from "./primitives/download-csv";
import {
  keywordToMetricRow, filterRows, sortRows, computeTotals, toCsv,
  type MetricRow, type BandFilter, type CsvColumn,
} from "./primitives/table-derivations";
import { fmtCurrencyCompact, fmtPct, fmtRoas, fmtInt } from "./primitives/kpi-derivations";

const COLUMNS: MetricColumn[] = [
  { key: "adSpend", label: "Ad Spend", fmt: fmtCurrencyCompact, tooltip: "Total advertising spend." },
  { key: "adRevenue", label: "Ad Revenue", fmt: fmtCurrencyCompact, tooltip: "Sales attributed to advertising." },
  { key: "acos", label: "ACoS", fmt: (n) => fmtPct(n), heat: "acos", tooltip: "Advertising Cost of Sales = ad spend ÷ ad revenue." },
  { key: "roas", label: "ROAS", fmt: fmtRoas, heat: "roas", tooltip: "Return on Ad Spend = ad revenue ÷ ad spend." },
  { key: "avgCpc", label: "Avg. CPC", fmt: fmtCurrencyCompact, tooltip: "Average cost per click." },
  { key: "impressions", label: "Impressions", fmt: fmtInt },
  { key: "clicks", label: "Clicks", fmt: fmtInt },
  { key: "conversions", label: "Conversions", fmt: fmtInt },
  { key: "cvr", label: "CVR", fmt: (n) => fmtPct(n), bar: true, tooltip: "Conversion rate = conversions ÷ clicks." },
];

const CSV_COLUMNS: CsvColumn[] = [
  { header: "Keyword", value: (r) => r.name },
  { header: "Match type", value: (r) => r.matchType ?? "" },
  ...COLUMNS.map((c) => ({ header: c.label, value: (r: MetricRow) => r[c.key] as number })),
];

const ACOS_OPTIONS = [
  { value: "all", label: "All ACoS" },
  { value: "good", label: "Healthy" },
  { value: "warn", label: "Watch" },
  { value: "bad", label: "At risk" },
];
const ROAS_OPTIONS = [
  { value: "all", label: "All ROAS" },
  { value: "good", label: "Healthy" },
  { value: "warn", label: "Watch" },
  { value: "bad", label: "At risk" },
];

function Select({ value, onChange, options, aria }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; aria: string;
}) {
  return (
    <select
      aria-label={aria}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-[9px] border border-mf-line bg-white px-2 text-xs text-mf-ink"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function KeywordAnalysisSection({ surface, keywords, loading, requestKey }: {
  surface: SurfaceKind;
  keywords: KeywordsResponse | null;
  loading: boolean;
  requestKey: string;
}) {
  const palette = getSurfacePalette(surface);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof MetricRow>("adSpend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [matchType, setMatchType] = useState("all");
  const [roasBand, setRoasBand] = useState<BandFilter>("all");
  const [acosBand, setAcosBand] = useState<BandFilter>("all");

  const allRows = useMemo(() => (keywords?.keywords ?? []).map(keywordToMetricRow), [keywords]);
  const matchTypes = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.matchType).filter((m): m is string => Boolean(m)))),
    [allRows],
  );
  const visible = useMemo(
    () => sortRows(filterRows(allRows, { search, matchType, roasBand, acosBand }), sortKey, sortDir),
    [allRows, search, matchType, roasBand, acosBand, sortKey, sortDir],
  );
  const totals = useMemo(() => (visible.length ? computeTotals(visible) : null), [visible]);

  const onSort = (key: keyof MetricRow) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const onExportCsv = () => downloadCsv(`keywords-${requestKey || "export"}.csv`, toCsv(CSV_COLUMNS, visible));

  if (!requestKey) {
    return <Surface><div className="p-[18px] text-mf-muted">Select a client and date range to load the keyword table.</div></Surface>;
  }
  if (loading) {
    return <div className="h-64 animate-pulse rounded-[18px] border border-mf-line bg-white/60" />;
  }
  if (!keywords || !Array.isArray(keywords.keywords)) {
    return <Surface title="Keyword analysis"><div className="p-[18px] text-mf-muted">Data unavailable for this period.</div></Surface>;
  }

  const filters = (
    <>
      <Select
        aria="Filter by match type"
        value={matchType}
        onChange={setMatchType}
        options={[{ value: "all", label: "All match types" }, ...matchTypes.map((m) => ({ value: m, label: m }))]}
      />
      <Select aria="Filter by ROAS band" value={roasBand} onChange={(v) => setRoasBand(v as BandFilter)} options={ROAS_OPTIONS} />
      <Select aria="Filter by ACoS band" value={acosBand} onChange={(v) => setAcosBand(v as BandFilter)} options={ACOS_OPTIONS} />
    </>
  );

  return (
    <MetricTable
      rows={visible}
      columns={COLUMNS}
      firstColumnLabel="Keyword"
      totalsRow={totals}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      palette={palette}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search keyword…"
      filters={filters}
      count={`${visible.length} keyword${visible.length === 1 ? "" : "s"}`}
      onExportCsv={onExportCsv}
      emptyLabel={allRows.length === 0 ? "No keywords for this period." : "No keywords match your filters."}
    />
  );
}
