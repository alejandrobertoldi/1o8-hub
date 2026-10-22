import { bandFigure } from "./banding";
import type { Month } from "./metrics";

export type DeckFormat = "high_level" | "detailed";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ok = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

export function usd(value: number | null | undefined, format: DeckFormat): string {
  if (format === "high_level") return ok(value) ? bandFigure(value) : "—";
  if (!ok(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}
export function usdExact(value: number | null | undefined): string {
  return ok(value) ? `$${Math.round(value).toLocaleString("en-US")}` : "—";
}
export function mult(v: number | null | undefined): string { return ok(v) ? `${v.toFixed(1)}×` : "—"; }
export function pct(v: number | null | undefined, digits = 1): string { return ok(v) ? `${v.toFixed(digits)}%` : "—"; }
export function count(v: number | null | undefined): string {
  if (!ok(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 100_000) return `${(v / 1_000).toFixed(1)}K`;
  return Math.round(v).toLocaleString("en-US");
}
export function splitMetric(s: string): { num: string; unit: string } {
  const fig = s.match(/^(.*?)(-Fig)$/);
  if (fig) return { num: fig[1], unit: fig[2] };
  const u = s.match(/^(.*\d)([KMB×%])$/);
  if (u) return { num: u[1], unit: u[2] };
  return { num: s, unit: "" };
}
/** `dropUnknown` (used on High-Level decks) blanks any token not in `tokens` — e.g. `{total}`,
 *  which HL never receives — so client PDFs never show a literal "{total}". */
export function fillTokens(text: string, tokens: Record<string, string>, dropUnknown = false): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in tokens ? tokens[k] : dropUnknown ? "" : m));
}
export function monthShort(m: Month): string { return MONTHS[Number(m.slice(5, 7)) - 1] ?? m; }
export function monthLetter(m: Month): string { return monthShort(m).charAt(0); }
