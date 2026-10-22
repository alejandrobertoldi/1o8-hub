"use client";
import { useMemo, useState } from "react";
import type { Surface as SurfaceKind } from "./primitives/palette";
import { getSurfacePalette } from "./primitives/palette";
import type { CampaignsResponse } from "./primitives/campaigns";
import type { ProductsResponse } from "./primitives/products";
import { Surface } from "./primitives/surface";
import { MetricTable, type MetricColumn } from "./primitives/metric-table";
import { downloadCsv } from "./primitives/download-csv";
import {
  campaignToMetricRow, productToMetricRow, filterRows, sortRows, computeTotals, toCsv,
  type MetricRow, type BandFilter, type CsvColumn,
} from "./primitives/table-derivations";
import { fmtCurrencyCompact, fmtPct, fmtRoas, fmtInt } from "./primitives/kpi-derivations";

const CAMPAIGN_COLUMNS: MetricColumn[] = [
  { key: "adSpend", label: "Ad Spend", fmt: fmtCurrencyCompact, tooltip: "Total advertising spend." },
  { key: "adRevenue", label: "Ad Revenue", fmt: fmtCurrencyCompact, tooltip: "Sales attributed to advertising." },
  { key: "acos", label: "ACoS", fmt: (n) => fmtPct(n), heat: "acos", tooltip: "Advertising Cost of Sales = ad spend ÷ ad revenue." },
  { key: "roas", label: "ROAS", fmt: fmtRoas, heat: "roas", tooltip: "Return on Ad Spend = ad revenue ÷ ad spend." },
  { key: "avgCpc", label: "Avg. CPC", fmt: fmtCurrencyCompact, tooltip: "Average cost per click." },
  { key: "impressions", label: "Impressions", fmt: fmtInt },
  { key: "clicks", label: "Clicks", fmt: fmtInt },
  { key: "conversions", label: "Conversions", fmt: fmtInt },
  { key: "cvr", label: "CVR", fmt: (n) => fmtPct(n), bar: true, tooltip: "Conversion rate = conversions ÷ clicks." },
  { key: "ntbPct", label: "NTB %", fmt: (n) => fmtPct(n), tooltip: "New-to-brand orders ÷ attributed orders. Overall is recomputed from the totals row, not averaged." },
];

const PRODUCT_COLUMNS: MetricColumn[] = [
  { key: "adSpend", label: "Ad Spend", fmt: fmtCurrencyCompact, tooltip: "Total advertising spend." },
  { key: "adRevenue", label: "Attributed Sales", fmt: fmtCurrencyCompact, tooltip: "Sales attributed to advertising." },
  { key: "orders", label: "Orders", fmt: fmtInt, tooltip: "Attributed ad orders." },
  { key: "units", label: "Units", fmt: fmtInt, tooltip: "Attributed units ordered from ads." },
  { key: "acos", label: "ACoS", fmt: (n) => fmtPct(n), heat: "acos", tooltip: "Advertising Cost of Sales = ad spend ÷ attributed sales." },
  { key: "roas", label: "ROAS", fmt: fmtRoas, heat: "roas", tooltip: "Return on Ad Spend = attributed sales ÷ ad spend." },
  { key: "impressions", label: "Impressions", fmt: fmtInt },
  { key: "clicks", label: "Clicks", fmt: fmtInt },
  { key: "cvr", label: "CVR", fmt: (n) => fmtPct(n), bar: true, tooltip: "Conversion rate = orders ÷ clicks." },
];

const CAMPAIGN_CSV: CsvColumn[] = [
  { header: "Campaign", value: (r) => r.name },
  ...CAMPAIGN_COLUMNS.map((c) => ({ header: c.label, value: (r: MetricRow) => r[c.key] as number })),
];

const PRODUCT_CSV: CsvColumn[] = [
  { header: "ASIN", value: (r) => r.name },
  { header: "Title", value: (r) => r.subtitle ?? "" },
  ...PRODUCT_COLUMNS.map((c) => ({ header: c.label, value: (r: MetricRow) => r[c.key] as number })),
];

const BAND_OPTIONS = [
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

function CampaignTable({
  campaigns, palette, requestKey,
}: {
  campaigns: CampaignsResponse;
  palette: ReturnType<typeof getSurfacePalette>;
  requestKey: string;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof MetricRow>("adSpend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [roasBand, setRoasBand] = useState<BandFilter>("all");
  const [acosBand, setAcosBand] = useState<BandFilter>("all");

  const allRows = useMemo(() => (campaigns.rowsByName ?? []).map(campaignToMetricRow), [campaigns]);
  const visible = useMemo(
    () => sortRows(filterRows(allRows, { search, roasBand, acosBand }), sortKey, sortDir),
    [allRows, search, roasBand, acosBand, sortKey, sortDir],
  );
  const totals = useMemo(() => (visible.length ? computeTotals(visible) : null), [visible]);

  const onSort = (key: keyof MetricRow) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  return (
    <MetricTable
      title="Campaigns"
      subtitle="New-to-brand % on each campaign; Total is the overall rate."
      rows={visible}
      columns={CAMPAIGN_COLUMNS}
      firstColumnLabel="Campaign"
      totalsRow={totals}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      palette={palette}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search campaign…"
      filters={
        <>
          <Select
            aria="Filter by ROAS band"
            value={roasBand}
            onChange={(v) => setRoasBand(v as BandFilter)}
            options={[{ value: "all", label: "All ROAS" }, ...BAND_OPTIONS]}
          />
          <Select
            aria="Filter by ACoS band"
            value={acosBand}
            onChange={(v) => setAcosBand(v as BandFilter)}
            options={[{ value: "all", label: "All ACoS" }, ...BAND_OPTIONS]}
          />
        </>
      }
      count={`${visible.length} campaign${visible.length === 1 ? "" : "s"}`}
      onExportCsv={() => downloadCsv(`campaigns-${requestKey || "export"}.csv`, toCsv(CAMPAIGN_CSV, visible))}
      emptyLabel={allRows.length === 0 ? "No campaigns for this period." : "No campaigns match your filters."}
    />
  );
}

function ProductTable({
  products, palette, requestKey,
}: {
  products: ProductsResponse;
  palette: ReturnType<typeof getSurfacePalette>;
  requestKey: string;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof MetricRow>("adSpend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [roasBand, setRoasBand] = useState<BandFilter>("all");
  const [acosBand, setAcosBand] = useState<BandFilter>("all");

  const allRows = useMemo(() => (products.products ?? []).map(productToMetricRow), [products]);
  const visible = useMemo(
    () => sortRows(filterRows(allRows, { search, roasBand, acosBand }), sortKey, sortDir),
    [allRows, search, roasBand, acosBand, sortKey, sortDir],
  );
  const totals = useMemo(() => (visible.length ? computeTotals(visible) : null), [visible]);

  const onSort = (key: keyof MetricRow) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  return (
    <MetricTable
      title="Advertised ASINs"
      subtitle="Orders, units, and attributed sales for each advertised ASIN."
      rows={visible}
      columns={PRODUCT_COLUMNS}
      firstColumnLabel="ASIN"
      totalsRow={totals}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      palette={palette}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search ASIN or title…"
      filters={
        <>
          <Select
            aria="Filter by ROAS band"
            value={roasBand}
            onChange={(v) => setRoasBand(v as BandFilter)}
            options={[{ value: "all", label: "All ROAS" }, ...BAND_OPTIONS]}
          />
          <Select
            aria="Filter by ACoS band"
            value={acosBand}
            onChange={(v) => setAcosBand(v as BandFilter)}
            options={[{ value: "all", label: "All ACoS" }, ...BAND_OPTIONS]}
          />
        </>
      }
      count={`${visible.length} ASIN${visible.length === 1 ? "" : "s"}`}
      onExportCsv={() => downloadCsv(`asins-${requestKey || "export"}.csv`, toCsv(PRODUCT_CSV, visible))}
      emptyLabel={allRows.length === 0 ? "No advertised ASINs for this period." : "No ASINs match your filters."}
    />
  );
}

export function CampaignDetailSection({
  surface, campaigns, campaignsLoading, products, productsLoading, requestKey,
}: {
  surface: SurfaceKind;
  campaigns: CampaignsResponse | null;
  campaignsLoading: boolean;
  products: ProductsResponse | null;
  productsLoading: boolean;
  requestKey: string;
}) {
  const palette = getSurfacePalette(surface);

  if (!requestKey) {
    return <Surface><div className="p-[18px] text-mf-muted">Select a client and date range to load the campaign table.</div></Surface>;
  }

  const campaignsReady = !campaignsLoading && campaigns && Array.isArray(campaigns.rowsByName);
  const productsReady = !productsLoading && products && Array.isArray(products.products);
  const campaignsFailed = !campaignsLoading && (!campaigns || !Array.isArray(campaigns.rowsByName));
  const productsFailed = !productsLoading && (!products || !Array.isArray(products.products));

  if (campaignsLoading && productsLoading) {
    return <div className="h-64 animate-pulse rounded-[18px] border border-mf-line bg-white/60" />;
  }

  return (
    <div className="flex flex-col gap-4">
      {campaignsLoading && <div className="h-64 animate-pulse rounded-[18px] border border-mf-line bg-white/60" />}
      {campaignsReady && <CampaignTable campaigns={campaigns} palette={palette} requestKey={requestKey} />}
      {campaignsFailed && (
        <Surface title="Campaigns"><div className="p-[18px] text-mf-muted">Campaign data unavailable for this period.</div></Surface>
      )}
      {productsLoading && <div className="h-64 animate-pulse rounded-[18px] border border-mf-line bg-white/60" />}
      {productsReady && <ProductTable products={products} palette={palette} requestKey={requestKey} />}
      {productsFailed && (
        <Surface title="Advertised ASINs"><div className="p-[18px] text-mf-muted">ASIN ads data unavailable for this period.</div></Surface>
      )}
    </div>
  );
}
