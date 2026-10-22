"use client";
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-array-index-as-key */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import { Surface } from "./primitives/surface";
import { ChartFrame } from "./primitives/chart-frame";
import { accentFor } from "./primitives/chart-colors";
import { getSurfacePalette, type Surface as SurfaceKind } from "./primitives/palette";
import { UsChoropleth, heatCellStyle, type ChoroplethDatum } from "./us-choropleth";
import { useStockLayer, type StockMonths } from "@/components/reports/fba-inventory-map/use-stock-layer";
import { StockLayerStatus } from "@/components/reports/fba-inventory-map/stock-layer-controls";
import { StateStockBlock } from "@/components/reports/fba-inventory-map/state-stock-block";
import { StateBubbleOverlay, type BubbleHover } from "@/components/reports/fba-inventory-map/state-bubble-overlay";
import {
  cityDisplayName,
  stateDisplayName,
  type GeoTotals,
  type OrderGeographyReport,
} from "@/lib/reports/order-geography";

const ALL_ASINS = "__all";
const EMPTY: GeoTotals = { orders: 0, units: 0, revenue: 0 };

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function moneyExact(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function compactMoney(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

function count(n: number): string {
  return n.toLocaleString("en-US");
}

/** One decimal place, with a floor so a real but tiny share never reads as 0.0%. */
function share(part: number, whole: number): string {
  if (whole <= 0) return "—";
  const pct = (100 * part) / whole;
  return pct > 0 && pct < 0.1 ? "<0.1%" : `${pct.toFixed(1)}%`;
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Column headers for the report's tables, matching the metric-table look. */
const TH = "py-2 text-[10px] font-bold uppercase tracking-wide text-mf-muted";

/**
 * Summarized titles are pipe-delimited — "Peanut Butter 9oz Jars - 4 Pack |
 * Fruit Lover's | 9 Ounce (Pack of 4)" — so each segment gets its own line
 * instead of wrapping mid-phrase at whatever width the panel happens to be.
 */
export function titleSegments(name: string): string[] {
  const parts = name.split("|").map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [name];
}

type ProductTableRow = { asin: string; name: string; revenue: number; units: number; orders: number };
type ProductIdentity = { productId: string | null; sku: string | null };
type GeoTableRow = { key: string; name: string; revenue: number; units: number; orders: number };

/**
 * A place | Sales | Units | Orders | % of orders table, shared by the
 * top-states list and the per-state city breakdown. `orderTotal` is the
 * denominator for the share column: the whole window's orders for states, the
 * state's own orders for its cities.
 *
 * Sales cells are shaded on the map's own ramp, rescaled to the rows shown so
 * each table reveals its internal spread rather than washing out against the
 * national maximum.
 */
function GeoTable({
  label,
  rows,
  accent,
  activeKey,
  onSelect,
  maxHeightClass,
  emptyLabel,
  orderTotal,
}: {
  label: string;
  rows: GeoTableRow[];
  orderTotal: number;
  accent: string;
  activeKey?: string | null;
  onSelect?: (key: string) => void;
  maxHeightClass: string;
  emptyLabel?: string;
}) {
  const top = rows[0]?.revenue ?? 0;
  return (
    <div className={`${maxHeightClass} overflow-auto`}>
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-mf-ghost">
            <th scope="col" className={`${TH} px-3 text-left`}>{label}</th>
            <th scope="col" className={`${TH} px-2 text-right`}>Sales</th>
            <th scope="col" className={`${TH} px-2 text-right`}>Units</th>
            <th scope="col" className={`${TH} px-2 text-right`}>Orders</th>
            <th scope="col" className={`${TH} px-3 text-right`}>% of orders</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isActive = activeKey === r.key;
            return (
              <tr
                key={r.key}
                className={`border-b border-mf-line last:border-b-0 ${isActive ? "bg-mf-ghost" : ""}`}
              >
                <td className="px-3 py-1.5 text-[12px] text-mf-ink">
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(r.key)}
                      className="block w-full break-words text-left font-medium hover:underline"
                      title={isActive ? "Clear selection" : `Show ${r.name}`}
                    >
                      {r.name}
                    </button>
                  ) : (
                    r.name
                  )}
                </td>
                <td
                  className="px-2 py-1.5 text-right text-[12px] font-bold tabular-nums"
                  style={heatCellStyle(r.revenue, top, accent)}
                >
                  {money(r.revenue)}
                </td>
                <td className="px-2 py-1.5 text-right text-[12px] tabular-nums text-mf-ink">{count(r.units)}</td>
                <td className="px-2 py-1.5 text-right text-[12px] tabular-nums text-mf-ink">{count(r.orders)}</td>
                <td className="px-3 py-1.5 text-right text-[12px] tabular-nums text-mf-ink">
                  {share(r.orders, orderTotal)}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-mf-muted">
                {emptyLabel ?? "Nothing to show."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Product | Sales | Units | Orders.
 *
 * Shared by the nationwide card and the per-state breakdown so the two read
 * identically. The per-state rows come from `StateEntry.products`, which
 * carries no catalog identity, so ASIN links and SKUs are looked up from the
 * account-wide `asins` list by ASIN rather than refetched.
 */
function ProductsTable({
  rows,
  identity,
  accent,
  activeAsin,
  onToggle,
  maxHeightClass,
  orderTotal,
}: {
  rows: ProductTableRow[];
  /** Denominator for the share column: all orders nationwide, or the state's orders. */
  orderTotal: number;
  identity: Map<string, ProductIdentity>;
  accent: string;
  activeAsin: string;
  onToggle: (asin: string) => void;
  maxHeightClass: string;
}) {
  return (
    <div className={`${maxHeightClass} overflow-auto`}>
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-mf-ghost">
            <th scope="col" className={`${TH} px-3 text-left`}>Product</th>
            <th scope="col" className={`${TH} px-2 text-right`}>Sales</th>
            <th scope="col" className={`${TH} px-2 text-right`}>Units</th>
            <th scope="col" className={`${TH} px-2 text-right`}>Orders</th>
            <th scope="col" className={`${TH} px-3 text-right`}>% of orders</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isActive = activeAsin === r.asin;
            const id = identity.get(r.asin);
            return (
              <tr
                key={r.asin}
                className={`border-b border-mf-line last:border-b-0 ${isActive ? "bg-mf-ghost" : ""}`}
              >
                <td className="px-3 py-2 align-top">
                  {/* The name is the click target rather than the whole row, so
                      the ASIN and Amazon links below stay independently
                      clickable without stopPropagation. */}
                  <button
                    type="button"
                    onClick={() => onToggle(r.asin)}
                    className="block w-full text-left text-[12px] text-mf-ink hover:underline"
                    title={isActive ? "Show all products" : "Filter the map to this product"}
                  >
                    {/* Only the product family carries weight; the variant and
                        size segments read as regular detail under it. */}
                    {titleSegments(r.name).map((part, i) => (
                      <span key={part + i} className={`block break-words ${i === 0 ? "font-medium" : ""}`}>
                        {part}
                      </span>
                    ))}
                  </button>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    {id?.productId ? (
                      <Link
                        href={`/products/${id.productId}`}
                        className="font-mono text-[11px] font-bold hover:underline"
                        style={{ color: accent }}
                        title="Open product detail"
                      >
                        {r.asin}
                      </Link>
                    ) : (
                      <span className="font-mono text-[11px] font-bold" style={{ color: accent }}>
                        {r.asin}
                      </span>
                    )}
                    <AmazonPdpLink asin={r.asin} variant="on-light" />
                    {/* Wraps rather than overflows: SKUs like
                        "CD090401_stickerless" outrun this column. */}
                    {id?.sku && (
                      <span className="break-all font-mono text-[10px] text-mf-muted">{id.sku}</span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-2 text-right align-top text-[12px] font-bold tabular-nums text-mf-ink">
                  {money(r.revenue)}
                </td>
                <td className="px-2 py-2 text-right align-top text-[12px] tabular-nums text-mf-ink">
                  {count(r.units)}
                </td>
                <td className="px-2 py-2 text-right align-top text-[12px] tabular-nums text-mf-ink">
                  {count(r.orders)}
                </td>
                <td className="px-3 py-2 text-right align-top text-[12px] tabular-nums text-mf-ink">
                  {share(r.orders, orderTotal)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function OrderGeographySection({
  surface,
  accountId,
  start,
  end,
  refreshKey = 0,
  stockMonth,
  onStockMonths,
}: {
  surface: SurfaceKind;
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
  /** Hub only: undefined = no FBA stock layer (portal never sets it); null = newest month; "YYYY-MM" = that month. */
  stockMonth?: string | null;
  /** Hub only: receives the available stock months once per settled stock fetch (feeds the header picker). */
  onStockMonths?: (m: StockMonths) => void;
}) {
  const palette = getSurfacePalette(surface);
  const accent = accentFor(surface);
  const stockLayer = stockMonth !== undefined;

  const requestKey = accountId && start && end ? `${accountId}:${start}:${end}:${refreshKey}` : "";
  // `failed` is tracked separately from a null payload so a broken query is
  // never reported to the user as "this client had no orders" — the two look
  // identical downstream and mean very different things.
  const [result, setResult] = useState<{
    key: string;
    data: OrderGeographyReport | null;
    failed: boolean;
  } | null>(null);
  const [asinFilterRaw, setAsinFilter] = useState<string>(ALL_ASINS);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [stockHover, setStockHover] = useState<BubbleHover | null>(null);

  useEffect(() => {
    if (!requestKey) return;
    let ignore = false;
    fetch(`/api/reports/order-geography?accountId=${accountId}&start=${start}&end=${end}`)
      .then(async (r) => {
        const body = (await r.json()) as OrderGeographyReport & { error?: string };
        if (ignore) return;
        const ok = r.ok && Boolean(body?.account);
        setResult({ key: requestKey, data: ok ? body : null, failed: !ok });
      })
      .catch(() => {
        if (!ignore) setResult({ key: requestKey, data: null, failed: true });
      });
    return () => {
      ignore = true;
    };
  }, [accountId, start, end, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;
  const failed = result?.key === requestKey && result.failed;

  // Catalog identity keyed by ASIN. The per-state product rows carry only
  // totals, so both tables resolve their links and SKUs through this.
  const productIdentity = useMemo(() => {
    const map = new Map<string, ProductIdentity>();
    for (const a of data?.asins ?? []) map.set(a.asin, { productId: a.productId, sku: a.sku });
    return map;
  }, [data]);

  const toggleAsin = (asin: string) => setAsinFilter((cur) => (cur === asin ? ALL_ASINS : asin));

  /**
   * Switching client keeps the previous client's ASIN in state, which this
   * account has never sold: the map went blank and titled itself with the raw
   * ASIN while the select — having no matching option — still read "All
   * products". Fall back whenever the filter is not in the loaded catalog.
   */
  const asinFilter =
    data && asinFilterRaw !== ALL_ASINS && !productIdentity.has(asinFilterRaw) ? ALL_ASINS : asinFilterRaw;

  // Under a product filter the map shows only that product's footprint, so
  // every derived figure has to come from the same filtered view.
  const statsFor = useMemo(() => {
    return (code: string): GeoTotals => {
      if (!data) return EMPTY;
      if (asinFilter === ALL_ASINS) return data.states[code] ?? EMPTY;
      return data.byAsin[asinFilter]?.[code] ?? EMPTY;
    };
  }, [data, asinFilter]);

  const mapData = useMemo(() => {
    if (!data) return {};
    const out: Record<string, ChoroplethDatum> = {};
    for (const code of Object.keys(data.states)) {
      const s = statsFor(code);
      out[code] = {
        value: s.revenue,
        label:
          s.revenue > 0
            ? `${stateDisplayName(code)} · ${money(s.revenue)} · ${count(s.units)} units`
            : `${stateDisplayName(code)} · no orders${asinFilter === ALL_ASINS ? "" : " of this product"}`,
      };
    }
    return out;
  }, [data, statsFor, asinFilter]);

  const layer = useStockLayer({
    enabled: stockLayer,
    accountId,
    asin: asinFilter === ALL_ASINS ? null : asinFilter,
    month: stockMonth ?? null,
  });

  // `layer` is the hook's state-held object, so this fires once per settled fetch.
  useEffect(() => {
    if (!onStockMonths) return;
    if (layer.status === "ok") onStockMonths({ months: layer.months, month: layer.month });
    else if (layer.status === "no-reports") onStockMonths({ months: [], month: null });
  }, [layer, onStockMonths]);

  const rankedStates = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.states)
      .map((code) => ({ code, stats: statsFor(code) }))
      .filter((s) => s.stats.revenue > 0)
      .sort((a, b) => b.stats.revenue - a.stats.revenue)
      .slice(0, 10);
  }, [data, statsFor]);

  if (!requestKey) {
    return (
      <Surface>
        <div className="p-[18px] text-mf-muted">Select a client and date range to load order geography.</div>
      </Surface>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`sk-kpi-${i}`} className="h-[132px] animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <div className="h-[560px] animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
          <div className="h-[560px] animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <Surface>
        <div className="p-[18px] text-mf-muted">
          Could not load order geography. The Seller Central order scan is a long query and may have timed out — retry,
          or use Refresh to re-run it.
        </div>
      </Surface>
    );
  }

  if (!data || data.account.orders === 0) {
    return (
      <Surface>
        <div className="p-[18px] text-mf-muted">
          No Seller Central orders found for this client in {prettyDate(start)} – {prettyDate(end)}.
        </div>
      </Surface>
    );
  }

  const { account, asins, states, military, unmapped, international } = data;
  const detail = selectedState ? states[selectedState] : null;

  const kpis: { value: string; label: string; note?: string }[] = [
    { value: money(account.revenue), label: "Gross product sales", note: "before promotions, excl. tax & shipping" },
    { value: count(account.units), label: "Units ordered" },
    { value: count(account.orders), label: "Distinct orders" },
    { value: count(Object.keys(states).length), label: "States & DC/PR with orders" },
  ];

  const asideNotes: string[] = [];
  const militaryCodes = Object.keys(military);
  if (militaryCodes.length > 0) {
    asideNotes.push(
      `Military APO/FPO addresses are in the totals but cannot be placed on the map: ${militaryCodes
        .map((k) => `${k} ${money(military[k].revenue)} (${count(military[k].orders)} orders)`)
        .join(", ")}.`,
    );
  }
  const unmappedCodes = Object.keys(unmapped);
  if (unmappedCodes.length > 0) {
    asideNotes.push(
      `${count(unmappedCodes.length)} ship-to value(s) matched no US state and are in the totals but off the map: ${unmappedCodes
        .slice(0, 5)
        .join(", ")}.`,
    );
  }
  const intlCodes = Object.keys(international);
  if (intlCodes.length > 0) {
    asideNotes.push(
      `Excluded from every figure above: ${intlCodes
        .map((k) => `${k} ${money(international[k].revenue)}`)
        .join(", ")} shipped outside the US.`,
    );
  }

  // In Both mode (stock layer on) the map moves above this table so the stock is visible without scrolling.
  const productsTable = (
    <Surface title="Nationwide Products" subtitle="Click on a product to filter the map">
      <ProductsTable
        rows={asins}
        identity={productIdentity}
        accent={accent}
        activeAsin={asinFilter}
        onToggle={toggleAsin}
        maxHeightClass="max-h-[360px]"
        orderTotal={account.orders}
      />
    </Surface>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            data-report-card="true"
            className="rounded-[18px] border border-black/10 bg-white px-[18px] py-4 shadow-[0_10px_30px_rgba(16,34,39,0.12)]"
          >
            <div className="text-[clamp(26px,2.2vw,38px)] font-extrabold leading-none tracking-[-0.045em] tabular-nums text-mf-ink">
              {k.value}
            </div>
            <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.11em] text-mf-muted">{k.label}</div>
            {k.note && <div className="mt-1 text-[11px] text-mf-muted">{k.note}</div>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-mf-muted">Filter map by product</span>
        <select
          value={asinFilter}
          onChange={(e) => setAsinFilter(e.target.value)}
          className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs font-bold text-mf-ink focus:outline-none focus:ring-1"
          style={{ outlineColor: accent }}
        >
          <option value={ALL_ASINS}>All products</option>
          {asins.map((a) => (
            <option key={a.asin} value={a.asin}>
              {a.name.slice(0, 60)} — {money(a.revenue)}
            </option>
          ))}
        </select>
        {asinFilter !== ALL_ASINS && (
          <span className="text-[11px] text-mf-muted">
            {count(Object.keys(data.byAsin[asinFilter] ?? {}).length)} states
          </span>
        )}
      </div>

      {!stockLayer && productsTable}

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          <ChartFrame
            title={
              asinFilter === ALL_ASINS
                ? "Gross product sales by state"
                : `${asins.find((a) => a.asin === asinFilter)?.name ?? asinFilter} — sales by state`
            }
            subtitle="Darker means more. Click a state for its breakdown."
          >
            {stockLayer && (
              <div className="mf-paper">
                <StockLayerStatus layer={layer} ordersLabel={`${prettyDate(start)} – ${prettyDate(end)}`} />
              </div>
            )}
            <UsChoropleth
              surface={surface}
              data={mapData}
              selected={selectedState}
              onSelect={setSelectedState}
              formatLegend={compactMoney}
              overlay={
                layer.status === "ok" ? (
                  <g className="mf-paper">
                    <StateBubbleOverlay bubbles={layer.bubbles} selected={selectedState} onSelect={setSelectedState} onHover={setStockHover} />
                  </g>
                ) : undefined
              }
            />
            {stockHover && layer.status === "ok" && (
              <div
                className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md bg-mf-ink px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg"
                style={{ left: stockHover.x, top: stockHover.y }}
              >
                <div className="font-bold">{stockHover.bubble.name}</div>
                <div className="tabular-nums">{count(stockHover.bubble.units)} units in FBA · {Math.round(stockHover.bubble.share * 100)}% of stock</div>
              </div>
            )}
          </ChartFrame>

          <Surface
            title={asinFilter === ALL_ASINS ? "Top states" : "Top states for this product"}
            subtitle="by gross product sales · % of orders is each state's share of all orders in this window · click a state to see its breakdown"
          >
            <GeoTable
              label="State"
              rows={rankedStates.map((s) => ({
                key: s.code,
                name: stateDisplayName(s.code),
                revenue: s.stats.revenue,
                units: s.stats.units,
                orders: s.stats.orders,
              }))}
              accent={accent}
              activeKey={selectedState}
              onSelect={(code) => setSelectedState(selectedState === code ? null : code)}
              maxHeightClass="max-h-[420px]"
              emptyLabel="No states have sales for this product."
              orderTotal={
                asinFilter === ALL_ASINS
                  ? account.orders
                  : (asins.find((a) => a.asin === asinFilter)?.orders ?? 0)
              }
            />
          </Surface>
        </div>

        <div className="space-y-4">
          <Surface title="State detail">
            <div className="p-[18px]">
              {!selectedState || (!detail && !stockLayer) ? (
                <div className="text-mf-muted">Select a state on the map to see its order breakdown.</div>
              ) : !detail ? (
                <>
                  <div className="text-[22px] font-extrabold leading-none tracking-[-0.03em] text-mf-ink">{stateDisplayName(selectedState)}</div>
                  <div className="mt-1 text-[12px] text-mf-muted">No orders shipped here in this window.</div>
                </>
              ) : (
                <>
                  <div className="text-[22px] font-extrabold leading-none tracking-[-0.03em] text-mf-ink">
                    {stateDisplayName(selectedState)}
                  </div>
                  <div className="mt-1 text-[11px] text-mf-muted">{selectedState} · ship-to state · all products</div>
                  <dl className="mt-3.5 space-y-0">
                    {[
                      ["Gross product sales", money(detail.revenue)],
                      ["Units", count(detail.units)],
                      ["Distinct orders", count(detail.orders)],
                      ["Avg order value", moneyExact(detail.revenue / detail.orders)],
                      ["Share of total sales", `${((100 * detail.revenue) / account.revenue).toFixed(1)}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between border-b border-mf-line py-2 last:border-b-0">
                        <dt className="text-[12px] text-mf-muted">{label}</dt>
                        <dd className="text-[13px] font-bold tabular-nums text-mf-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </div>
            {stockLayer && layer.status === "ok" && selectedState && (
              <div className="mf-paper">
                <StateStockBlock
                  stateCode={selectedState}
                  bubble={layer.bubbles.find((b) => b.state === selectedState) ?? null}
                  month={layer.month}
                  placedUnits={layer.data.totals.placedUnits}
                  orderShare={(() => {
                    const total = Object.keys(data.states).reduce((sum, c) => sum + statsFor(c).units, 0);
                    return total > 0 ? statsFor(selectedState).units / total : null;
                  })()}
                  filtered={asinFilter !== ALL_ASINS}
                />
              </div>
            )}
            {detail && selectedState && detail.cities.length > 0 && (
              <>
                <div className="border-t border-mf-line px-[18px] py-2 text-[10px] font-bold uppercase tracking-[0.11em] text-mf-muted">
                  Cities ({count(detail.cities.length)})
                </div>
                <GeoTable
                  label="City"
                  rows={detail.cities.map((c) => ({
                    key: c.city,
                    name: cityDisplayName(c.city),
                    revenue: c.revenue,
                    units: c.units,
                    orders: c.orders,
                  }))}
                  accent={accent}
                  maxHeightClass="max-h-[260px]"
                  orderTotal={detail.orders}
                />
              </>
            )}
            {detail && selectedState && (
              <>
                <div className="border-t border-mf-line px-[18px] py-2 text-[10px] font-bold uppercase tracking-[0.11em] text-mf-muted">
                  Products sold here ({count(detail.products.length)})
                </div>
                <ProductsTable
                  rows={detail.products}
                  identity={productIdentity}
                  accent={accent}
                  activeAsin={asinFilter}
                  onToggle={toggleAsin}
                  maxHeightClass="max-h-[300px]"
                  orderTotal={detail.orders}
                />
              </>
            )}
          </Surface>

        </div>
      </div>

      {stockLayer && productsTable}

      <Surface>
        <div className="space-y-2 p-[18px] text-[11px] leading-relaxed text-mf-muted">
          <p>
            <span className={`font-bold ${palette.eyebrowClass}`}>Gross product sales</span> is item price before
            promotions
            (promotions in this window: {money(account.promo)}), excluding tax and shipping. Free-text ship-to states
            are normalized to USPS codes, so &ldquo;Florida&rdquo;, &ldquo;FL&rdquo; and &ldquo;Fl&rdquo; count as one
            state. Product-level order counts within a state are distinct orders containing that product, so they can
            sum to more than the state&rsquo;s own order count when an order carries several products &mdash; and
            likewise a product&rsquo;s % of orders can add up to more than 100% across products.
          </p>
          {asideNotes.map((note, i) => (
            <p key={`note-${i}`}>{note}</p>
          ))}
        </div>
      </Surface>
    </div>
  );
}
