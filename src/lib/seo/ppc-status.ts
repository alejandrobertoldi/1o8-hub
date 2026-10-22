/**
 * Pure logic for the SEO ↔ PPC status page: date windows, term matching,
 * aggregation and gap lists. No DB / Redshift imports — fully unit-testable.
 * Dates are YYYY-MM-DD strings at every boundary.
 */
import type { SearchTermTotalRow, AsinTermWindowRow } from "@/lib/ppc-queries";
import { normalizePhrase, type ListingField, type TrackedKeyword } from "./listing-match";

export type WindowDays = 30 | 60 | 90;
export interface DateWindow { start: string; end: string; days: number }
export interface Metrics { impressions: number; clicks: number; spend: number; sales: number; orders: number; roas: number | null }
export interface PerDay { impressions: number; clicks: number; spend: number; sales: number; orders: number }
export interface KeywordEntry { keyword: string; tier: string | null; asins: string[]; searchVolume: number | null; suggestedBid: number | null }
export interface SectionARow { keyword: string; tier: string | null; asins: string[]; before: PerDay | null; after: PerDay | null; beforeTotals: Metrics; afterTotals: Metrics }
export interface SectionB { noTraffic: KeywordEntry[]; missing: Array<{ searchTerm: string } & Metrics>; bothCount: number }

const MISSING_LIMIT = 50;

export function normalizeTerm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetweenInclusive(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}

export function computeWindows(liveDate: string | null, n: WindowDays, today: string) {
  const yesterday = addDays(today, -1);
  const lastN: DateWindow = { start: addDays(yesterday, -(n - 1)), end: yesterday, days: n };
  if (!liveDate) return { before: null, after: null, gapWindow: lastN, status: "no-date" as const };
  if (liveDate > today) return { before: null, after: null, gapWindow: lastN, status: "future" as const };
  const before: DateWindow = { start: addDays(liveDate, -n), end: addDays(liveDate, -1), days: n };
  const naturalEnd = addDays(liveDate, n - 1);
  const end = naturalEnd < yesterday ? naturalEnd : yesterday;
  const after: DateWindow = { start: liveDate, end, days: daysBetweenInclusive(liveDate, end) };
  return { before, after, gapWindow: after.days > 0 ? after : lastN, status: "live" as const };
}

const num = (v: unknown) => Number(v) || 0;

export function toMetrics(rows: SearchTermTotalRow[]): Metrics {
  const m = { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
  for (const r of rows) {
    m.impressions += num(r.ad_impressions);
    m.clicks += num(r.ad_clicks);
    m.spend += num(r.ad_spend);
    m.sales += num(r.ad_revenue);
    m.orders += num(r.ad_orders);
  }
  return { ...m, roas: m.spend > 0 ? m.sales / m.spend : null };
}

function groupRows(rows: SearchTermTotalRow[]): Map<string, SearchTermTotalRow[]> {
  const out = new Map<string, SearchTermTotalRow[]>();
  for (const r of rows) {
    if (r.is_asin) continue;
    const k = normalizeTerm(r.search_term);
    const arr = out.get(k);
    if (arr) arr.push(r);
    else out.set(k, [r]);
  }
  return out;
}

export function aggregateByTerm(rows: SearchTermTotalRow[]): Map<string, Metrics> {
  const out = new Map<string, Metrics>();
  for (const [k, rs] of groupRows(rows)) out.set(k, toMetrics(rs));
  return out;
}

export function buildKeywordSet(input: {
  s6: Array<{ asin: string; keywords: string[] }>;
  s2: Array<{ text: string; tier: string | null; searchVolume: number | null; suggestedBid: number | null }>;
}): { source: "listing" | "research"; entries: KeywordEntry[] } {
  const s2ByKey = new Map(input.s2.map((k) => [normalizeTerm(k.text), k]));
  const map = new Map<string, KeywordEntry>();
  for (const { asin, keywords } of input.s6) {
    for (const raw of keywords) {
      const key = normalizeTerm(raw);
      if (!key) continue;
      const e = map.get(key);
      if (e) { if (!e.asins.includes(asin)) e.asins.push(asin); continue; }
      const meta = s2ByKey.get(key);
      map.set(key, { keyword: key, tier: meta?.tier ?? null, asins: [asin], searchVolume: meta?.searchVolume ?? null, suggestedBid: meta?.suggestedBid ?? null });
    }
  }
  if (map.size > 0) return { source: "listing", entries: [...map.values()] };
  const entries: KeywordEntry[] = [];
  for (const [key, k] of s2ByKey) {
    if (!key) continue;
    entries.push({ keyword: key, tier: k.tier, asins: [], searchVolume: k.searchVolume, suggestedBid: k.suggestedBid });
  }
  return { source: "research", entries };
}

const EMPTY: Metrics = { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, roas: null };

export interface AsinBlockRow {
  keyword: string;
  tier: string | null;
  fields: ListingField[];
  before: PerDay | null;
  after: PerDay | null;
  beforeTotals: Metrics;
  afterTotals: Metrics;
}

function aggregateWindow(rows: AsinTermWindowRow[], win: "before" | "after"): Map<string, Metrics> {
  const grouped = new Map<string, SearchTermTotalRow[]>();
  for (const r of rows) {
    if (r.win !== win) continue;
    // M1 fix: normalizePhrase (not normalizeTerm) so a hyphenated tracked
    // keyword's key matches this per-ASIN aggregation's key for the same
    // unpunctuated search term. Section B / aggregateByTerm (below) are unchanged.
    const k = normalizePhrase(r.search_term);
    const t: SearchTermTotalRow = { search_term: r.search_term, is_asin: false, ad_impressions: r.ad_impressions, ad_clicks: r.ad_clicks, ad_spend: r.ad_spend, ad_revenue: r.ad_revenue, ad_orders: r.ad_orders };
    const arr = grouped.get(k);
    if (arr) arr.push(t);
    else grouped.set(k, [t]);
  }
  const out = new Map<string, Metrics>();
  for (const [k, rs] of grouped) out.set(k, toMetrics(rs));
  return out;
}

/** One ASIN block's keyword rows (spec §8): rows must already be filtered to that ASIN. */
export function buildAsinBlockRows(tracked: TrackedKeyword[], rows: AsinTermWindowRow[], before: DateWindow, after: DateWindow): AsinBlockRow[] {
  const b = aggregateWindow(rows, "before");
  const a = aggregateWindow(rows, "after");
  return tracked
    .map((t) => {
      const beforeTotals = b.get(t.keyword) ?? EMPTY;
      const afterTotals = a.get(t.keyword) ?? EMPTY;
      return { keyword: t.keyword, tier: t.tier, fields: t.fields, before: perDay(beforeTotals, before.days), after: perDay(afterTotals, after.days), beforeTotals, afterTotals };
    })
    .sort((x, y) => y.afterTotals.sales - x.afterTotals.sales);
}

export function perDay(m: Metrics, days: number): PerDay | null {
  if (days <= 0) return null;
  return { impressions: m.impressions / days, clicks: m.clicks / days, spend: m.spend / days, sales: m.sales / days, orders: m.orders / days };
}

function sumMetrics(list: Metrics[]): Metrics {
  const m = { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
  for (const x of list) {
    m.impressions += x.impressions;
    m.clicks += x.clicks;
    m.spend += x.spend;
    m.sales += x.sales;
    m.orders += x.orders;
  }
  return { ...m, roas: m.spend > 0 ? m.sales / m.spend : null };
}

/**
 * Footer totals row for Section A: sums beforeTotals/afterTotals across every
 * keyword row, then divides by each window's own day count — the same
 * per-day convention each individual row uses (spec §6 "Footer totals row").
 */
export function sectionATotals(
  rows: Array<{ beforeTotals: Metrics; afterTotals: Metrics }>,
  before: DateWindow,
  after: DateWindow,
): { before: PerDay | null; after: PerDay | null; beforeTotals: Metrics; afterTotals: Metrics } {
  const beforeTotals = sumMetrics(rows.map((r) => r.beforeTotals));
  const afterTotals = sumMetrics(rows.map((r) => r.afterTotals));
  return { before: perDay(beforeTotals, before.days), after: perDay(afterTotals, after.days), beforeTotals, afterTotals };
}

export function buildSectionA(entries: KeywordEntry[], beforeRows: SearchTermTotalRow[], afterRows: SearchTermTotalRow[], before: DateWindow, after: DateWindow): SectionARow[] {
  const b = aggregateByTerm(beforeRows);
  const a = aggregateByTerm(afterRows);
  return entries
    .map((e) => {
      const beforeTotals = b.get(e.keyword) ?? EMPTY;
      const afterTotals = a.get(e.keyword) ?? EMPTY;
      return { keyword: e.keyword, tier: e.tier, asins: e.asins, before: perDay(beforeTotals, before.days), after: perDay(afterTotals, after.days), beforeTotals, afterTotals };
    })
    .sort((x, y) => y.afterTotals.sales - x.afterTotals.sales);
}

export function buildSectionB(entries: KeywordEntry[], rows: SearchTermTotalRow[]): SectionB {
  const byTerm = aggregateByTerm(rows);
  const keys = new Set(entries.map((e) => e.keyword));
  const noTraffic = entries
    .filter((e) => (byTerm.get(e.keyword)?.impressions ?? 0) === 0)
    .sort((x, y) => {
      if (x.searchVolume == null && y.searchVolume == null) return 0;
      if (x.searchVolume == null) return 1;
      if (y.searchVolume == null) return -1;
      return y.searchVolume - x.searchVolume;
    });
  const bothCount = entries.length - noTraffic.length;
  const missing = [...byTerm]
    .filter(([term, m]) => !keys.has(term) && m.orders >= 1)
    .sort(([, x], [, y]) => y.orders - x.orders)
    .slice(0, MISSING_LIMIT)
    .map(([searchTerm, m]) => ({ searchTerm, ...m }));
  return { noTraffic, missing, bothCount };
}

const MIN_LIVE_DATE_YEAR = 2000;
const MAX_LIVE_DATE_YEAR = 2100;

export function parseLiveDate(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false };
  const year = Number(v.slice(0, 4));
  if (year < MIN_LIVE_DATE_YEAR || year > MAX_LIVE_DATE_YEAR) return { ok: false };
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? { ok: true, value: v } : { ok: false };
}
