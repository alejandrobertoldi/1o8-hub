/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/no-giant-component */
"use client";

import { fmtInt, fmtPct } from "@/lib/formatters";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ChevronUp, Package } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInventoryFinal } from "./inventory-final/use-inventory-final";
import { GROUPS, useCollapsedGroups, type GroupId } from "./inventory-final/column-groups";
import { FinalCell } from "./inventory-final/final-cell";
import { SummaryStrip } from "./inventory-final/summary-strip";
import { CapacityPanel } from "./inventory-final/capacity-panel";
import { MethodSettingsButton } from "./inventory-final/method-settings-modal";
import { SendControls, sendDisabledReason, type SendResult } from "./inventory-final/send-controls";
import { buildRows, clusterByAsin, countUnsendableRows, filterRows, orphanedOverrides, toSnapshotRows, type RowFilter } from "./inventory-final/build-rows";
import { summarizeRows, toPortalRow, type SnapshotHeader } from "@/lib/inventory/snapshot";
import { downloadSnapshotXlsx } from "@/lib/inventory/export-xlsx";
import { describeMethod, resolveSeasonalWindow, todayIso, type RecSettings } from "@/lib/inventory/rec-settings";
import { MIN_STOCK_UNITS } from "@/lib/inventory/final-rec";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import { Sku } from "@/components/sku";
import { SummarizedTitle } from "@/components/summarized-title";
import { DEFAULT_BUFFER_PCT, MAX_BUFFER_PCT } from "@/lib/inventory/buffers";

interface HealthData {
  age_0_90: number;
  age_91_180: number;
  age_181_270: number;
  age_271_365: number;
  age_365_plus: number;
  shipped_7d: number;
  shipped_30d: number;
  shipped_90d: number;
  weeks_of_cover: number | null;
  sales_rank: number | null;
  total_quantity: number;
  sellable_quantity: number;
  recommend_ship_in: number;
}

interface InventoryProduct {
  asin: string;
  sku: string;
  /** Hub product (master) id — absent on responses cached before it was added. */
  product_id?: string;
  parentage_level?: string;
  product_name: string;
  summarized_title?: string;
  main_image_url: string;
  listing_status: string;
  variation_id: string;
  /** Hub variation group name (variations.name) — rows are grouped by it. */
  variation_name?: string;
  parent_asin: string;
  color: string;
  size: string;
  flavor: string;
  style: string;
  health: HealthData | null;
  /** AWD on-hand units (latest report day); absent on responses cached before it was added. */
  awd_onhand?: number;
  /** Units on their way into AWD (latest report day). */
  awd_inbound?: number;
  q1_quantity: number;
  q1_sales: number;
  units_30d: number;
  sales_30d: number;
  units_90d: number;
  sales_90d: number;
  current: {
    product_sales: number;
    units_sold: number;
    ad_spend: number;
    ad_revenue: number;
    available: number;
    inbound_quantity: number;
    reserved_quantity: number;
    reserved_customerorders: number;
    reserved_fc_transfers: number;
    reserved_fc_processing: number;
    unfulfillable_quantity: number;
    /** Absent on responses cached before they were added. */
    researching_quantity?: number;
    fba_total_quantity?: number;
    future_supply_buyable?: number;
    reserved_future_supply?: number;
  } | null;
}

interface InventoryForecastTableProps {
  products: InventoryProduct[];
  periodLabel: string;
  clientIdCode?: string;
  readOnly?: boolean;
  /** Comma-joined Amazon account ids; drives the sales-window query. */
  accountIds?: string;
  clientName?: string;
}

type HealthStatus = "Healthy" | "Warning" | "Critical" | "Out of stock" | "No Sales";

function getInventoryHealth(p: InventoryProduct): HealthStatus {
  const available = p.current?.available ?? 0;
  const inbound = p.current?.inbound_quantity ?? 0;
  const total = p.health?.total_quantity ?? 0;
  const shipped90 = p.units_90d || p.health?.shipped_90d || 0;

  if (available === 0 && inbound === 0 && total === 0) return "Out of stock";
  if (shipped90 === 0) return "No Sales";

  const woc = p.health?.weeks_of_cover ?? null;
  if (woc !== null) {
    if (woc <= 2) return "Critical";
    if (woc <= 4) return "Warning";
  }
  return "Healthy";
}

function calcDaysOfSupply(available: number, shipped30: number): number | null {
  if (shipped30 === 0) return null;
  const dailyRate = shipped30 / 30;
  return dailyRate > 0 ? Math.round(available / dailyRate) : null;
}

// Units already in Amazon's network, each counted once. Health's
// inventory_supply_at_fba already includes inbound + reserved, so it is only a
// fallback — never added to the manage-inventory components. Unfulfillable is
// excluded because it can't be sold. AWD (on hand + inbound to AWD) sits outside
// FBA (neither source includes it), so it is added on top in both cases.
// Reserved uses the reserved report's breakdown (FC transfer + customer orders +
// FC processing) when it has one — the same buckets the cells show, as Seller
// Central does — so the displayed lines add up to this number. The manage-
// inventory afn_reserved_quantity can disagree with it (4VAR12PCK 2026-10-08:
// 84 vs 76) and is only the fallback.
export function stockPosition(p: {
  current: {
    available: number; inbound_quantity: number; reserved_quantity: number;
    reserved_customerorders?: number; reserved_fc_transfers?: number; reserved_fc_processing?: number;
  } | null;
  health: { total_quantity: number } | null;
  awd_onhand?: number;
  awd_inbound?: number;
}): number {
  const c = p.current;
  const awd = (p.awd_onhand || 0) + (p.awd_inbound || 0);
  if (c) {
    const breakdown = (c.reserved_fc_transfers || 0) + (c.reserved_customerorders || 0) + (c.reserved_fc_processing || 0);
    const reserved = breakdown > 0 ? breakdown : (c.reserved_quantity || 0);
    return (c.available || 0) + (c.inbound_quantity || 0) + reserved + awd;
  }
  return (p.health?.total_quantity ?? 0) + awd;
}

export function calcShipIn(unitsBasis: number, have: number): number {
  const needed = Math.ceil(unitsBasis * 1.1);
  return Math.max(0, needed - have);
}

const HEALTH_STYLES: Record<HealthStatus, string> = {
  Healthy: "bg-[#34C759]/10 text-[#34C759]",
  Warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Critical: "bg-[#FF5C5F]/10 text-[#FF5C5F]",
  "Out of stock": "bg-[#FF5C5F]/10 text-[#FF5C5F]",
  "No Sales": "bg-muted text-muted-foreground",
};

const STATUS_STYLES: Record<string, string> = {
  active: "border-emerald-500/40 text-emerald-400",
  inactive: "border-amber-500/40 text-amber-400",
  incomplete: "border-purple-500/40 text-purple-400",
  "out of stock": "border-red-500/40 text-red-400",
  closed: "border-zinc-500/40 text-zinc-400",
  discontinued: "border-orange-500/40 text-orange-400",
  none: "border-zinc-700 text-zinc-500",
};

export function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const style = STATUS_STYLES[s] || STATUS_STYLES.none;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${style}`}>
      {status || "None"}
    </span>
  );
}

// Product Identity title lines are name / attr 1 / attr 2. Summarized titles often
// carry only one attribute, so append the size as the next line unless it's already there.
export function withSize(title: string, size: string): string {
  const t = (title || "").trim();
  const sz = (size || "").trim();
  if (!t || !sz || t.toLowerCase().includes(sz.toLowerCase())) return t;
  return `${t} | ${sz}`;
}

export type VpItem = { flavor?: string | null; customLabel?: string | null; includedTitle?: string | null; units?: number | null };
type VpPack = { asin: string | null; sku: string | null; itemCount: number; items: VpItem[] };

/** Variety packs (master.is_vp) with their contents, keyed by ASIN|SKU and by ASIN.
 *  Hub only: /api/variety-packs is not reachable from the portal. */
function useVarietyPacks(clientIdCode: string | undefined): Map<string, VpPack> {
  const [packs, setPacks] = useState<VpPack[]>([]);
  useEffect(() => {
    if (!clientIdCode) return;
    let cancelled = false;
    fetch(`/api/variety-packs?client=${encodeURIComponent(clientIdCode)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: VpPack[]) => { if (!cancelled && Array.isArray(d)) setPacks(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [clientIdCode]);
  return useMemo(() => {
    const m = new Map<string, VpPack>();
    for (const p of packs) {
      if (!p.asin) continue;
      m.set(`${p.asin}|${p.sku ?? ""}`, p);
      // ASIN fallback (SKU without its own pack): prefer a pack whose contents are set.
      const prev = m.get(p.asin);
      if (!prev || (prev.itemCount === 0 && p.itemCount > 0)) m.set(p.asin, p);
    }
    return m;
  }, [packs]);
}

function vpItemLabel(it: VpItem): string {
  const name = it.customLabel || it.flavor || it.includedTitle || "item";
  return it.units ? `${it.units}× ${name}` : name;
}

export function variationOf(p: { variation_name?: string }): string {
  return (p.variation_name ?? "").trim();
}

const BUFFER_STEP = 5;

// The Buffer line: "Buffer [−] 10 % [+]   +161" — the buttons step by 5. Editors change it in place;
// the table applies it at once (onChange) and saves it debounced (onCommit).
// Read-only viewers see plain text.
function BufferLine({ basis, pct, editable, onChange }: {
  basis: number; pct: number; editable: boolean; onChange: (pct: number) => void;
}) {
  const [draft, setDraft] = useState(String(pct));
  useEffect(() => { setDraft(String(pct)); }, [pct]);
  const units = Math.ceil((basis * (100 + pct)) / 100) - basis;
  const clamp = (n: number) => Math.max(0, Math.min(MAX_BUFFER_PCT, Math.round(n)));
  const commitDraft = () => {
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n)) { setDraft(String(pct)); return; }
    const v = clamp(n);
    setDraft(String(v));
    if (v !== pct) onChange(v);
  };
  // Stacked up/down nudges before the field; each half is a full-width hit area.
  const nudge = "flex h-2.5 w-3.5 items-center justify-center rounded-sm hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-[10px] text-muted-foreground" title="Safety buffer on the Basis, per product (rounded up). Basis + Buffer − stock lines = Result.">
      <span className="flex items-center gap-1">
        Buffer
        {editable ? (
          <span className="flex items-center gap-0.5">
            <span className="flex flex-col">
              <button type="button" aria-label="Increase buffer" className={nudge} disabled={pct >= MAX_BUFFER_PCT} onClick={() => onChange(clamp(pct + BUFFER_STEP))}><ChevronUp className="size-3" /></button>
              <button type="button" aria-label="Decrease buffer" className={nudge} disabled={pct <= 0} onClick={() => onChange(clamp(pct - BUFFER_STEP))}><ChevronDown className="size-3" /></button>
            </span>
            <input
              aria-label="Buffer %" inputMode="numeric" value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  const v = clamp(pct + (e.key === "ArrowUp" ? BUFFER_STEP : -BUFFER_STEP));
                  if (v !== pct) onChange(v);
                }
              }}
              className="h-5 w-8 rounded-full border border-border bg-background text-center tabular-nums text-foreground"
            />
            %
          </span>
        ) : (
          <span>{pct}%</span>
        )}
      </span>
      <span className="tabular-nums">+{fmtInt(units)}</span>
    </div>
  );
}

// A small group of lines with its name turned 90° down the left edge.
// Boxed like a merged table cell, so it is clear which lines the label covers.
function sideGroup(label: string, lines: ReactNode) {
  return (
    <div className="my-0.5 flex overflow-hidden rounded-sm border border-border">
      <span className="flex items-center justify-center border-r border-border bg-muted/50 px-0.5 text-[9px] font-bold tracking-wider text-muted-foreground">
        <span className="rotate-180 [writing-mode:vertical-rl]">{label}</span>
      </span>
      <div className="min-w-0 flex-1 px-1 py-0.5">{lines}</div>
    </div>
  );
}

// The Recommendation's working in one cell: the basis on top, then every part of
// the stock it is netted against (see stockPosition), so the lines add up.
export function RecBreakdown({ basis, basisName, basisLabel, stock, result, pooledNote, buffer, floor = 0, accent = "brand", awdInbound, awdAvail, fbaInbound, fbaAvail, reserved }: {
  basis: number; basisName: string; basisLabel: string; stock: number;
  /** Units the minimum-stock floor adds on top of basis + buffer (0 = not applied). */
  floor?: number;
  /** Result label colour: hub orange, or the portal accent. */
  accent?: "brand" | "portal";
  /** The Buffer line (BufferLine); omitted on sell-down rows. */
  buffer?: ReactNode;
  /** Set on the send-here SKU of a multi-SKU ASIN: the lines are the ASIN's totals. */
  pooledNote?: string;
  /** The Final cell (live calc unless overridden; editable in the hub). Omitted on the portal. */
  result?: ReactNode;
  awdInbound?: number; awdAvail?: number; fbaInbound?: number; fbaAvail?: number; reserved?: number;
}) {
  const line = (label: string, v: number | undefined) => (
    <div className="flex justify-between gap-3 text-[10px] text-muted-foreground">
      <span>{label}</span><span className="tabular-nums">{v ? fmtInt(v) : "—"}</span>
    </div>
  );
  const tip = `Basis ${fmtInt(Math.round(basis))} (${basisLabel}). Stock position ${fmtInt(stock)} = AWD inbound + AWD avail + FBA inbound + FBA on-hand + reserved.${pooledNote ? ` ${pooledNote}.` : ""}`;
  return (
    <div className="min-w-[116px]" title={tip}>
      <div className="flex justify-between gap-3 text-xs font-bold">
        <span>{basisName}</span>
        <span className="tabular-nums">{basisName === "Sell down" ? "—" : fmtInt(Math.round(basis))}</span>
      </div>
      {buffer}
      {floor > 0 && (
        <div className="flex justify-between gap-3 text-[10px] text-muted-foreground" title={`Active products are topped up to at least ${MIN_STOCK_UNITS} units after sending.`}>
          <span>Min stock {MIN_STOCK_UNITS}</span><span className="tabular-nums">+{fmtInt(floor)}</span>
        </div>
      )}
      {sideGroup("AWD", <>{line("Inbound", awdInbound)}{line("Available", awdAvail)}</>)}
      {sideGroup("FBA", <>{line("Inbound", fbaInbound)}{line("On-hand", fbaAvail)}{line("Reserved", reserved)}</>)}
      {result != null && (
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-1 text-xs font-bold">
          <span className={accent === "portal" ? "text-portal-accent" : "text-brand"} title={`Units to send: Basis + Buffer (at least ${MIN_STOCK_UNITS} for active products) − stock (+ uplift on a shortfall).`}>Result</span>
          {result}
        </div>
      )}
    </div>
  );
}

// Which window the Basis came from, named like the Sales columns. "greater"
// picks the larger side (a tie reads as the recent window).
export function basisName(method: RecSettings["method"], recentDays: number, recent: number, seasonal: number, seasonalYear: string): string {
  const last = `Last ${recentDays}d`;
  const next = `Next 90d ${seasonalYear}`;
  if (method === "recent") return last;
  if (method === "seasonal") return next;
  if (method === "greater") return seasonal > recent ? next : last;
  return "Average";
}

// Amazon's FBA inventory hierarchy (Seller Central "FBA inventory details"):
//   Total = On-hand + Inbound + Reserved + Unfulfillable + Researching
//   On-hand = Available + FC transfer;  Reserved = Customer orders + FC processing
// The manage-inventory report's afn_reserved_quantity still includes FC transfer,
// so Reserved here is rebuilt from the reserved report. Stock position is
// unchanged: available + FC transfer + inbound + customer orders + FC processing.
export function fbaParts(c: InventoryProduct["current"], healthTotal: number | undefined) {
  const available = c?.available ?? 0;
  const fcTransfer = c?.reserved_fc_transfers ?? 0;
  const customerOrders = c?.reserved_customerorders ?? 0;
  const fcProcessing = c?.reserved_fc_processing ?? 0;
  const reservedAll = c?.reserved_quantity ?? 0;
  const split = fcTransfer + customerOrders + fcProcessing > 0;
  return {
    available, fcTransfer, customerOrders, fcProcessing,
    onHand: available + (split ? fcTransfer : 0),
    // No reserved-report row ⇒ keep the whole reserved figure here, not lose it.
    reserved: split ? customerOrders + fcProcessing : reservedAll,
    inbound: c?.inbound_quantity ?? 0,
    unfulfillable: c?.unfulfillable_quantity ?? 0,
    researching: c?.researching_quantity ?? 0,
    total: c?.fba_total_quantity || healthTotal || 0,
    futureSupplyBuyable: c?.future_supply_buyable ?? 0,
    reservedFutureSupply: c?.reserved_future_supply ?? 0,
  };
}

// Stock detail as one stacked cell: AWD, then FBA in Amazon's hierarchy.
function StockBreakdown({ awdAvail, awdInbound, f }: {
  awdAvail?: number; awdInbound?: number; f: ReturnType<typeof fbaParts>;
}) {
  const v = (n: number | undefined) => (n ? fmtInt(n) : "—");
  const line = (label: string, n: number | undefined, strong = false) => (
    <div className={`flex justify-between gap-3 ${strong ? "text-xs font-bold" : "text-[10px] text-muted-foreground"}`}>
      <span>{label}</span><span className="tabular-nums">{v(n)}</span>
    </div>
  );
  return (
    <div className="min-w-[140px]">
      {sideGroup("AWD", <>
        {line("Total", (awdAvail || 0) + (awdInbound || 0), true)}
        {line("Available", awdAvail)}
        {line("Inbound", awdInbound)}
      </>)}
      {/* On-hand and Reserved are parts of the FBA total, so they nest inside it. */}
      {sideGroup("FBA", <>
        {line("Total", f.total, true)}
        {sideGroup("On-hand", <>
          {line("Total", f.onHand, true)}
          {line("Available", f.available)}
          {line("FC transfer", f.fcTransfer)}
        </>)}
        {line("Inbound", f.inbound)}
        {sideGroup("Reserved", <>
          {line("Total", f.reserved, true)}
          {line("Customer orders", f.customerOrders)}
          {line("FC processing", f.fcProcessing)}
        </>)}
        {line("Unfulfillable", f.unfulfillable)}
        {line("Researching", f.researching)}
      </>)}
      {f.futureSupplyBuyable + f.reservedFutureSupply > 0 && sideGroup("Head start", <>
        {line("Future supply buyable", f.futureSupplyBuyable)}
        {line("Reserved future supply", f.reservedFutureSupply)}
      </>)}
    </div>
  );
}

// Health as one stacked cell: sales rank, then boxed Cover and Age groups. Same warning
// colours as the old columns (red ≤ 2 weeks / 14 days or any 365+ stock).
function HealthBreakdown({ h, dos }: { h: HealthData | null; dos: number | null }) {
  const RED = "text-[#FF5C5F] font-medium";
  const AMBER = "text-amber-400 font-medium";
  const line = (label: string, value: string, tone = "") => (
    <div className="flex justify-between gap-3 text-[10px] text-muted-foreground">
      <span>{label}</span><span className={`tabular-nums ${tone}`}>{value}</span>
    </div>
  );
  const n = (v: number | null | undefined) => (v ? fmtInt(v) : "—");
  const woc = h?.weeks_of_cover;
  return (
    <div className="min-w-[132px]">
      {line("Sales rank", h?.sales_rank != null ? fmtInt(h.sales_rank) : "—")}
      {sideGroup("Cover", <>
        {line("Weeks of cover", woc != null ? woc.toFixed(1) : "—", woc == null ? "" : woc <= 2 ? RED : woc <= 4 ? AMBER : "")}
        {line("Days of supply", dos != null ? `${dos}d` : "—", dos == null ? "" : dos <= 14 ? RED : dos <= 30 ? AMBER : "")}
        {line("Amazon rec. ship-in", n(h?.recommend_ship_in))}
      </>)}
      {sideGroup("Age", <>
        {line("0–90 days", h ? fmtInt(h.age_0_90) : "—")}
        {line("91–180 days", n(h?.age_91_180))}
        {line("181–270 days", n(h?.age_181_270))}
        {line("271–365 days", n(h?.age_271_365))}
        {line("365+ days", n(h?.age_365_plus), h && h.age_365_plus > 0 ? RED : "")}
      </>)}
    </div>
  );
}

// Parentage pill colours — same values as the SEO target display's, kept here
// so the inventory table doesn't depend on the SEO components.
const PARENTAGE_STYLES: Record<string, string> = {
  parent: "bg-blue-500/10 text-blue-400",
  child: "bg-purple-500/10 text-purple-400",
  standalone: "bg-muted text-muted-foreground",
};

const TH = "p-2 text-right font-medium text-card-foreground text-[10px] min-w-[52px] leading-tight";
const TH_LEFT = "p-2 text-left font-medium text-card-foreground text-[10px] min-w-[52px] leading-tight";
const TD = "px-2 py-1.5 text-right text-xs tabular-nums";
const GROUP_HEADER = "px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap";
const GROUP_TOGGLE = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 uppercase tracking-wider hover:bg-muted";

// Sticky product columns. Widths are pinned so the left offsets stay exact:
// image 44px, then ASIN / SKU / status 170px (SKU truncates) ⇒ Title starts at 214px.
// `bg-inherit` picks up the row's opaque zebra colour so scrolled cells hide.
const STICKY_1 = "sticky left-0 z-10 bg-inherit w-[44px] min-w-[44px]";
const STICKY_2 = "sticky left-[44px] z-10 bg-inherit w-[170px] min-w-[170px] max-w-[170px] border-r border-border";
const ROW_EVEN = "bg-card";
const ROW_ODD = "bg-[color-mix(in_oklab,var(--color-muted)_30%,var(--color-card))]";

const GROUP_COLS: Record<GroupId, number> = { stock: 1, sales: 2, health: 1, methods: 3 };
const SEND_FAILED = "Could not send — check your connection and try again";

const FILTERS: { id: RowFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs-action", label: "Needs action" },
  { id: "overstock", label: "Overstock" },
];

export function InventoryForecastTable({ products, periodLabel, clientIdCode, readOnly, accountIds, clientName }: InventoryForecastTableProps) {
  const final = useInventoryFinal({ clientIdCode, accountIds, enabled: !readOnly });
  const { isOpen, toggle } = useCollapsedGroups();
  const [filter, setFilter] = useState<RowFilter>("all");
  const editable = !readOnly && final.canEdit;

  // Buffer edits apply at once (local) and save after a short pause, so clicking
  // + five times is one write. The default (0%) is stored as "no row".
  const [localBuffers, setLocalBuffers] = useState<Map<string, number>>(new Map());
  const bufferTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const buffers = useMemo(() => new Map([...final.buffers, ...localBuffers]), [final.buffers, localBuffers]);
  const changeBuffer = useCallback((sku: string, pct: number) => {
    setLocalBuffers((m) => new Map(m).set(sku, pct));
    const timers = bufferTimers.current;
    clearTimeout(timers.get(sku));
    timers.set(sku, setTimeout(async () => {
      timers.delete(sku);
      const err = pct === DEFAULT_BUFFER_PCT ? await final.clearBuffer(sku) : await final.saveBuffer(sku, pct);
      if (err) console.error("[inventory] buffer save failed", sku, err);
      // Drop the local value once saved (server now agrees) or failed (show the saved one).
      setLocalBuffers((m) => { const n = new Map(m); n.delete(sku); return n; });
    }, 600));
  }, [final]);
  const vpPacks = useVarietyPacks(readOnly ? undefined : clientIdCode);

  // Best sellers first, then pulled together by variation: each group sits where
  // its top-selling SKU would, and keeps that order inside the group.
  const sorted = useMemo(() => {
    const byUnits = products.toSorted((a, b) => (b.units_90d || b.health?.shipped_90d || 0) - (a.units_90d || a.health?.shipped_90d || 0));
    const rank = new Map<string, number>();
    byUnits.forEach((p, i) => { if (!rank.has(variationOf(p))) rank.set(variationOf(p), i); });
    return byUnits.toSorted((a, b) => rank.get(variationOf(a))! - rank.get(variationOf(b))!);
  }, [products]);
  const grouped = useMemo(() => products.some((p) => variationOf(p)), [products]);
  const rows = useMemo(
    () => clusterByAsin(buildRows(sorted, final.settings, final.windows, final.overrides, stockPosition, buffers)),
    [sorted, final.settings, final.windows, final.overrides, buffers],
  );
  const visible = useMemo(() => (readOnly ? rows : filterRows(rows, filter)), [rows, filter, readOnly]);
  const totals = useMemo(() => summarizeRows(rows.map((r) => r.rec)), [rows]);
  // What "Mark as sent" actually posts: rows with a blank ASIN/SKU are left out.
  const sendRows = useMemo(() => toSnapshotRows(rows), [rows]);
  const sendTotals = useMemo(() => summarizeRows(sendRows), [sendRows]);
  const excludedCount = useMemo(() => countUnsendableRows(rows), [rows]);
  const orphans = useMemo(() => orphanedOverrides(rows, final.overrides), [rows, final.overrides]);

  // Variation attributes (flavor, colour, size, style) live in the title cell, not in columns.
  const VP_PATTERN = /variety\s*pack/i;

  // Build VP lookup: for each parent_asin, collect the non-VP flavor/color values
  const vpIncluded = useMemo(() => {
    const byParent = new Map<string, string[]>();
    for (const p of products) {
      if (!p.parent_asin) continue;
      const flavor = p.flavor || p.color || "";
      if (flavor && !VP_PATTERN.test(flavor)) {
        const list = byParent.get(p.parent_asin) || [];
        list.push(flavor);
        byParent.set(p.parent_asin, list);
      }
    }
    return byParent;
  }, [products]);


  const productCols = 3;
  // One Recommendation cell. The hub's ends with the (editable) Result; the
  // portal's (before a recommendation is sent) shows the breakdown only.
  const coreCols = 1;
  // The portal never sees the unclamped "All methods" figures.
  const groups = readOnly ? GROUPS.filter((g) => g.id !== "methods") : GROUPS;
  const showGroup = (id: GroupId) => !readOnly || id !== "methods";
  const seasonal = resolveSeasonalWindow(final.settings, todayIso());
  const groupSpan = (id: GroupId) => (isOpen(id) ? GROUP_COLS[id] : 1);
  const totalCols = productCols + coreCols + groups.reduce((n, g) => n + groupSpan(g.id), 0);

  const disabledReason = sendDisabledReason({
    editable,
    hasAccounts: !!accountIds,
    windowsStatus: final.windowsStatus,
    settingsReady: final.settingsReady,
    overridesStatus: final.overridesStatus,
    rowCount: sendRows.length,
  });

  async function handleSend(): Promise<SendResult> {
    const snapRows = sendRows;
    let r: Awaited<ReturnType<typeof final.createSnapshot>>;
    try {
      r = await final.createSnapshot(snapRows);
    } catch (e) {
      console.error("inventory snapshot send failed", e);
      return { error: SEND_FAILED };
    }
    if (r.error !== undefined) return { error: r.error };
    const portalRows = snapRows.map(toPortalRow);
    // The snapshot is saved at this point; a failed download must not read as a
    // failed send. The file can be fetched again from the history menu.
    try {
      await downloadSnapshotXlsx(r.snapshot, clientName ?? r.snapshot.clientIdCode, portalRows);
    } catch (e) {
      console.error("inventory snapshot download failed", e);
      return { snapshot: r.snapshot, rows: portalRows, downloadFailed: true };
    }
    return { snapshot: r.snapshot, rows: portalRows };
  }

  async function handleDownload(h: SnapshotHeader) {
    try {
      const stored = await final.loadSnapshotRows(h.id);
      await downloadSnapshotXlsx(h, clientName ?? h.clientIdCode, stored.map(toPortalRow));
    } catch (e) {
      console.error("inventory snapshot download failed", e);
    }
  }

  const groupHeader = (id: GroupId, label: string) => (
    <th key={id} colSpan={groupSpan(id)} className={`${GROUP_HEADER} border-l border-border text-card-foreground`}>
      <button type="button" className={GROUP_TOGGLE} aria-expanded={isOpen(id)} onClick={() => toggle(id)}>
        {label} {isOpen(id) ? "▾" : "▸"}
      </button>
    </th>
  );
  const collapsedTh = (id: GroupId) => <th key={id} className={`${TH} border-l border-border`} />;
  const collapsedTd = (id: GroupId) => <td key={id} className={`${TD} border-l border-border`} />;

  return (
    <div className="space-y-3">
      {!readOnly && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MethodSettingsButton settings={final.settings} editable={editable} onSave={final.saveSettings} />
            <SendControls
              clientName={clientName ?? clientIdCode ?? ""}
              snapshots={final.snapshots}
              canSend={disabledReason === null}
              disabledReason={disabledReason}
              totals={sendTotals}
              excludedCount={excludedCount}
              onSend={handleSend}
              onDownload={handleDownload}
            />
          </div>
          <SummaryStrip
            needsAction={rows.filter((r) => r.needsAction).length}
            unitsToSend={totals.unitsToSend}
            overstockSkus={totals.overstockSkus}
            overstockUnits={totals.overstockUnits}
            lastSent={final.snapshots[0]?.sentAt.slice(0, 10) ?? null}
          />
          <CapacityPanel accountIds={accountIds} clientIdCode={clientIdCode} editable={editable} sends={sendRows.map((r) => ({ sku: r.sku, qty: r.final }))} />
          <div className="flex gap-1" role="tablist" aria-label="Filter rows">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                className={`h-9 rounded-full px-3 text-[13px] font-medium leading-none transition-colors ${filter === f.id ? "bg-brand text-white" : "border border-stone-300 text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"}`}>
                {f.label}
              </button>
            ))}
          </div>
          {final.windowsStatus === "error" && (
            <p className="text-xs text-red-600 dark:text-red-400">Could not load sales for the chosen windows — Final numbers use the default 90d / last-year-quarter data.</p>
          )}
        </>
      )}

      <div className="w-fit max-w-full overflow-x-auto rounded-lg border border-border">
        <table className="w-max text-xs tabular-nums">
          <thead>
            {/* Group headers */}
            <tr className={`border-b border-border ${ROW_ODD}`}>
              <th colSpan={2} className="sticky left-0 z-10 bg-inherit" />
              <th colSpan={productCols - 2} />
              <th colSpan={coreCols} className="border-l border-border" />
              {groups.map((g) => groupHeader(g.id, g.label))}
            </tr>
            {/* Column headers */}
            <tr className={`border-b border-border ${ROW_ODD}`}>
              <th className={`${TH_LEFT} ${STICKY_1}`} />
              <th className={`${TH_LEFT} ${STICKY_2}`}>ASIN / SKU / Status</th>
              <th className={`${TH_LEFT} w-[180px] min-w-[180px]`}>Title</th>
              {/* Recommendation (always visible) */}
              <th className={`${TH} border-l border-border min-w-[132px]`} title={`Basis: ${describeMethod(final.settings, todayIso())}`}>Recommendation</th>
              {/* Stock detail */}
              {isOpen("stock") ? (
                <>
                  <th className={`${TH} border-l border-border min-w-[132px]`} title="AWD and FBA units from the latest reports. AWD avail + inbound, FBA available + inbound and reserved all count in Stock position.">Stock</th>
                </>
              ) : collapsedTh("stock")}
              {/* Sales */}
              {isOpen("sales") ? (
                <>
                  {/* The two numbers the Basis is chosen from. */}
                  <th className={`${TH} border-l border-border`}>Units<br/>last {final.settings.recentDays}d</th>
                  <th className={TH} title={`${seasonal.start} → ${seasonal.end}`}>Units next<br/>90d {seasonal.start.slice(0, 4)}</th>
                </>
              ) : collapsedTh("sales")}
              {/* Health */}
              {isOpen("health") ? (
                <>
                  <th className={`${TH} border-l border-border min-w-[132px]`}>Health</th>
                </>
              ) : collapsedTh("health")}
              {/* All methods (hub only) */}
              {showGroup("methods") && (isOpen("methods") ? (
                <>
                  <th className={`${TH} border-l border-border`}>Recent</th>
                  <th className={TH}>Seasonal</th>
                  <th className={TH}>Average</th>
                </>
              ) : collapsedTh("methods"))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, idx) => {
              const p = r.p;
              const c = p.current;
              const h = p.health;

              // Inventory numbers — fall back to manage inventory when health report missing
              const available = c?.available ?? 0;
              const unfulfillable = c?.unfulfillable_quantity ?? 0;
              const fba = fbaParts(c, h?.total_quantity ?? (available + unfulfillable));

              // Velocity — product_summary 30d/90d preferred, health report as fallback
              const shipped7d = h?.shipped_7d ?? c?.units_sold ?? 0;
              const shipped30d = p.units_30d || h?.shipped_30d || 0;
              const shipped90d = p.units_90d || h?.shipped_90d || 0;
              const q1Qty = p.q1_quantity;

              // Days of supply — use best available velocity, fall back to Q1
              const dailyRate = shipped30d > 0
                ? shipped30d / 30
                : shipped90d > 0
                  ? shipped90d / 90
                  : q1Qty > 0
                    ? q1Qty / 90
                    : shipped7d > 0
                      ? shipped7d / 7
                      : 0;
              const dos = dailyRate > 0 ? Math.round(r.stock / dailyRate) : null;

              const group = variationOf(p);
              const newGroup = grouped && (idx === 0 || variationOf(visible[idx - 1].p) !== group);
              const role = r.group.role;
              const newAsin = role !== "single" && (idx === 0 || visible[idx - 1].p.asin !== p.asin);
              // Pooled lines for the send-here SKU: every SKU of the ASIN added up.
              const siblings = role === "primary" ? rows.filter((x) => x.p.asin === p.asin) : [r];
              const pool = siblings.reduce((acc, x) => {
                const f = fbaParts(x.p.current, x.p.health?.total_quantity);
                return {
                  awdInbound: acc.awdInbound + (x.p.awd_inbound || 0), awdAvail: acc.awdAvail + (x.p.awd_onhand || 0),
                  inbound: acc.inbound + f.inbound, onHand: acc.onHand + f.onHand, reserved: acc.reserved + f.reserved,
                };
              }, { awdInbound: 0, awdAvail: 0, inbound: 0, onHand: 0, reserved: 0 });
              const groupRows = newGroup ? visible.filter((v) => variationOf(v.p) === group) : [];
              const groupSize = groupRows.length;
              const groupIds = [...new Set(groupRows.map((v) => (v.p.variation_id ?? "").trim()).filter(Boolean))].join(", ");

              return (
                <Fragment key={r.key}>
                {newGroup && (
                  <tr className="border-b border-border bg-muted/40">
                    <td colSpan={totalCols} className="px-2 py-2">
                      <div className="sticky left-2 w-fit">
                        {/* Mirrors the /variations card: bold name, mono ID underneath. */}
                        <div className="text-sm font-bold text-foreground">
                          {group || "No variation"} <span className="text-[10px] font-medium text-muted-foreground">· {groupSize} SKU{groupSize === 1 ? "" : "s"}</span>
                        </div>
                        {groupIds && <div className="font-mono text-[10px] font-bold text-muted-foreground">{groupIds}</div>}
                      </div>
                    </td>
                  </tr>
                )}
                {newAsin && (
                  <tr className="border-b border-border">
                    <td colSpan={totalCols} className="px-2 py-1">
                      <span className="sticky left-2 text-[10px] text-muted-foreground">
                        <span className="font-mono font-bold text-foreground/80">{p.asin}</span>
                        {" · "}{r.group.skus.length} SKUs on one ASIN · stock and sales pooled · send to{" "}
                        <span className="font-mono font-medium text-sku">{r.group.primarySku}</span>
                      </span>
                    </td>
                  </tr>
                )}
                <tr className={`border-b border-border ${idx % 2 === 0 ? ROW_EVEN : ROW_ODD} ${role === "selldown" ? "opacity-70" : ""}`}>
                  {/* Product info */}
                  <td className={`px-2 py-1.5 align-top ${STICKY_1}`}>
                    {p.main_image_url ? (
                      <Image src={p.main_image_url} alt={p.product_name} width={28} height={28} className="rounded object-cover" unoptimized />
                    ) : (
                      <div className="size-7 rounded bg-muted" />
                    )}
                  </td>
                  <td className={`px-2 py-1.5 align-top ${STICKY_2}`}>
                    {/* DESIGN.md → Product Identity: orange ASIN (Hub PDP) · Amazon icon · Parentage, then sky SKU */}
                    <div className="flex items-center gap-1.5">
                      {/* Portal clients cannot open /products, so no Hub link there. */}
                      {!readOnly && p.product_id ? (
                        <Link href={`/products/${p.product_id}?from=inventory`} className="font-mono text-[11px] font-bold text-brand hover:underline underline-offset-2" title="Open product detail">
                          {p.asin}
                        </Link>
                      ) : (
                        <span className={`font-mono text-[11px] font-bold ${readOnly ? "text-portal-accent" : "text-brand"}`}>{p.asin}</span>
                      )}
                      <AmazonPdpLink asin={p.asin} />
                      {p.parentage_level && (
                        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${PARENTAGE_STYLES[p.parentage_level.toLowerCase()] ?? "bg-muted text-muted-foreground"}`}>
                          {p.parentage_level}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 truncate text-[10px]" title={p.sku}>
                      <Sku sku={p.sku} className="break-normal" />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <StatusBadge status={p.listing_status} />
                      {role === "primary" && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">Send here</span>}
                      {role === "selldown" && <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground" title={`Not sent to: its stock and sales are pooled into ${r.group.primarySku}`}>Sell down</span>}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 align-top w-[180px] min-w-[180px] max-w-[180px] text-[11px] leading-tight">
                    <div className="flex items-start gap-1.5">
                      <SummarizedTitle title={withSize(p.summarized_title || p.product_name, p.size)} layout="lines" className="min-w-0 flex-1" />
                      {(() => {
                        const pack = vpPacks.get(`${p.asin}|${p.sku}`) ?? vpPacks.get(p.asin);
                        if (!pack && !VP_PATTERN.test(p.flavor || p.color || "")) return null;
                        // Red = flagged as a variety pack on /variety-packs but its contents are not set.
                        const warn = !!pack && pack.itemCount === 0;
                        const tip = warn
                          ? "Variety pack — needs items: click to set its contents on Variety Packs"
                          : pack
                            ? `Variety pack — ${pack.items.map(vpItemLabel).join(", ")}`
                            : `Variety pack — includes: ${(vpIncluded.get(p.parent_asin) || []).join(", ") || "unknown"}`;
                        const icon = <Package className={`size-3 ${warn ? "text-red-500 dark:text-red-400" : "text-emerald-400"}`} />;
                        const box = "inline-flex size-5 shrink-0 items-center justify-center rounded-md border";
                        return warn ? (
                          <Link
                            href={`/variety-packs?client=${encodeURIComponent(clientIdCode ?? "")}`}
                            className={`${box} border-red-500/40 bg-red-500/10 hover:bg-red-500/20`}
                            title={tip}
                            aria-label="Variety pack needs items"
                          >
                            {icon}
                          </Link>
                        ) : (
                          <span className={`${box} border-emerald-500/30 bg-emerald-500/10`} title={tip} aria-label="Variety pack">
                            {icon}
                          </span>
                        );
                      })()}
                    </div>
                  </td>

                  {/* Recommendation */}
                  <td className={`${TD} border-l border-border`}>
                    <RecBreakdown
                      basis={r.rec.basis}
                      basisName={role === "selldown" ? "Sell down" : basisName(final.settings.method, final.settings.recentDays, r.recentUnits, r.seasonalUnits, seasonal.start.slice(0, 4))}
                      basisLabel={describeMethod(final.settings, todayIso())}
                      stock={role === "single" ? r.stock : r.group.pooledStock}
                      pooledNote={role === "primary" ? `Pooled across ${r.group.skus.join(", ")}` : undefined}
                      floor={readOnly ? 0 : r.rec.floorUnits}
                      // The portal can't read buffers; no Result there, so no buffer either.
                      buffer={r.bufferPct == null || readOnly ? undefined : (
                        <BufferLine basis={r.rec.basis} pct={r.bufferPct} editable={editable} onChange={(pct) => changeBuffer(p.sku, pct)} />
                      )}
                      result={readOnly ? undefined : role === "selldown" ? (
                        <span className="text-[10px] font-medium text-muted-foreground">pooled into <span className="font-mono text-sku">{r.group.primarySku}</span></span>
                      ) : (
                        <FinalCell
                          rec={r.rec}
                          override={r.override}
                          editable={editable}
                          onSave={(qty, note) => final.saveOverride({ asin: p.asin, sku: p.sku, qty, note })}
                          onClear={() => final.clearOverride(p.sku)}
                        />
                      )}
                      awdInbound={pool.awdInbound}
                      awdAvail={pool.awdAvail}
                      fbaInbound={pool.inbound}
                      fbaAvail={pool.onHand}
                      reserved={pool.reserved}
                    />
                  </td>

                  {/* Stock detail */}
                  {isOpen("stock") ? (
                    <>
                      <td className={`${TD} border-l border-border`}>
                        <StockBreakdown awdAvail={p.awd_onhand} awdInbound={p.awd_inbound} f={fba} />
                      </td>
                    </>
                  ) : collapsedTd("stock")}

                  {/* Sales */}
                  {isOpen("sales") ? (
                    <>
                      <td className={`${TD} border-l border-border`}>{fmtInt(r.recentUnits)}</td>
                      <td className={TD}>{fmtInt(r.seasonalUnits)}</td>
                    </>
                  ) : collapsedTd("sales")}

                  {/* Health */}
                  {isOpen("health") ? (
                    <>
                      <td className={`${TD} border-l border-border`}>
                        <HealthBreakdown h={h} dos={dos} />
                      </td>
                    </>
                  ) : collapsedTd("health")}

                  {/* All methods (hub only) */}
                  {showGroup("methods") && (isOpen("methods") ? (
                    <>
                      <td className={`${TD} border-l border-border`}>{fmtInt(r.allMethods.recent)}</td>
                      <td className={TD}>{fmtInt(r.allMethods.seasonal)}</td>
                      <td className={TD}>{fmtInt(r.allMethods.average)}</td>
                    </>
                  ) : collapsedTd("methods"))}
                </tr>
                </Fragment>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="px-4 py-8 text-center text-muted-foreground">
                  {rows.length === 0 ? `No inventory data for ${periodLabel}` : "No SKUs match this filter"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && orphans.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Orphaned overrides ({orphans.length})</summary>
          <ul className="mt-2 space-y-1">
            {orphans.map((o) => (
              <li key={o.sku} className="flex items-center gap-2">
                <span>{o.sku} · {o.qty} · {o.note}</span>
                {editable && (
                  <button type="button" className="text-brand hover:underline" onClick={() => { final.clearOverride(o.sku).catch((e) => console.error("clear override failed", e)); }}>
                    Clear
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
