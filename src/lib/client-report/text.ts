import sanitizeHtml from "sanitize-html";
import type { ClientReportData } from "./types";

/**
 * The written parts of a report: which ones exist, turning Claude's plain
 * text into the editor's HTML, cleaning saved HTML, and spotting figures in
 * the text that aren't in the report's numbers. Pure; unit-tested.
 */

export const TEXT_SECTIONS = ["summary", "sales", "paid_media", "traffic", "email", "wins", "watchouts", "next_steps"] as const;
export type TextSection = (typeof TEXT_SECTIONS)[number];
export const isTextSection = (s: unknown): s is TextSection => typeof s === "string" && (TEXT_SECTIONS as readonly string[]).includes(s);

export const TEXT_LABELS: Record<TextSection, string> = {
  summary: "Executive summary",
  sales: "Sales",
  paid_media: "Paid media",
  traffic: "Traffic and conversion",
  email: "Email and SMS",
  wins: "Wins",
  watchouts: "Watch-outs",
  next_steps: "Next month's focus",
};

/** Sections written as bullet lists (the rest are paragraphs). */
export const LIST_SECTIONS: readonly TextSection[] = ["wins", "watchouts", "next_steps"];

/** The written sections this report has: the summary, one per data section, and the closing lists. */
export function textSectionsFor(data: ClientReportData): TextSection[] {
  const present = new Set<string>(data.sections.map((s) => s.key));
  return TEXT_SECTIONS.filter((k) => k === "summary" || LIST_SECTIONS.includes(k) || present.has(k));
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Escapes, then turns **bold** into <strong>. */
const inline = (s: string) => escapeHtml(s.trim()).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

export function paragraphsToHtml(paragraphs: string[]): string {
  return paragraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${inline(p)}</p>`)
    .join("");
}

export function bulletsToHtml(items: string[]): string {
  const li = items.map((i) => i.trim().replace(/^[-•*]\s*/, "")).filter(Boolean);
  return li.length ? `<ul>${li.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>` : "";
}

/** Only the formatting the editor offers survives (bold, italic, lists, links, paragraphs). */
export function sanitizeReportHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a"],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["https", "http", "mailto"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }) },
  }).trim();
}

export function htmlToPlain(html: string): string {
  return sanitizeHtml(html.replace(/<\/(p|li)>/g, "\n"), { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// ── Figures check ────────────────────────────────────────────────────

type Figure = { text: string; value: number; kind: "money" | "percent" | "ratio" | "count" };

/** Money, percentages, "x" ratios and large counts written in the text. */
export function figuresIn(text: string): Figure[] {
  const out: Figure[] = [];
  const re = /([-+]?)\$(\d[\d,]*(?:\.\d+)?)([kKmM](?![A-Za-z]))?|([-+]?\d[\d,]*(?:\.\d+)?)(%|\s?pts?\b|x\b)|\b(\d{1,3}(?:,\d{3})+|\d{4,})\b/g;
  for (const m of text.matchAll(re)) {
    if (m[2] !== undefined) {
      const mult = m[3] ? ({ k: 1e3, m: 1e6 } as Record<string, number>)[m[3].toLowerCase()] : 1;
      out.push({ text: m[0].trim(), value: Number(m[2].replace(/,/g, "")) * mult, kind: "money" });
    } else if (m[4] !== undefined) {
      const kind = m[5].trim().startsWith("p") || m[5] === "%" ? "percent" : "ratio";
      out.push({ text: m[0].trim(), value: Math.abs(Number(m[4].replace(/,/g, ""))), kind });
    } else if (m[6] !== undefined) {
      const n = Number(m[6].replace(/,/g, ""));
      if (n >= 1900 && n <= 2100) continue; // a year
      out.push({ text: m[0].trim(), value: n, kind: "count" });
    }
  }
  return out;
}

/** Every number the report holds, plus the changes it shows, in the units the text uses. */
export function knownFigures(data: ClientReportData): { amounts: number[]; percents: number[]; ratios: number[] } {
  const amounts: number[] = [];
  const percents: number[] = [];
  const ratios: number[] = [];
  const add = (unit: string, v: number | null | undefined) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return;
    if (unit === "percent") percents.push(Math.abs(v * 100));
    else if (unit === "ratio") ratios.push(v);
    else amounts.push(Math.abs(v));
  };
  const change = (unit: string, now: number, before: number | null) => {
    if (before === null || !Number.isFinite(before)) return;
    if (unit === "percent") percents.push(Math.abs((now - before) * 100));
    else if (before !== 0) percents.push(Math.abs(((Math.abs(now) - Math.abs(before)) / Math.abs(before)) * 100), Math.abs(((now - before) / Math.abs(before)) * 100));
  };
  const rows = [...data.kpis, ...data.sections.flatMap((s) => s.groups.flatMap((g) => g.rows))];
  for (const r of rows) {
    add(r.unit, r.value);
    add(r.unit, r.previous);
    add(r.unit, r.lastYear);
    change(r.unit, r.value, r.previous);
    change(r.unit, r.value, r.lastYear);
    if ("targetValue" in r) add(r.unit, (r as { targetValue: number | null }).targetValue);
  }
  for (const s of [data.kpiTrend, ...data.sections.flatMap((s) => [s.trend, s.daily])]) {
    for (const p of s?.points ?? []) add(s!.unit, p.value);
  }
  return { amounts, percents, ratios };
}

/** Figures in the text that match nothing in the report (rounding allowed). */
export function unsupportedFigures(text: string, data: ClientReportData): string[] {
  const known = knownFigures(data);
  const near = (list: number[], v: number, tol: (x: number) => number) => list.some((x) => Math.abs(x - v) <= tol(x));
  const bad: string[] = [];
  for (const f of figuresIn(text)) {
    const ok =
      f.kind === "percent"
        ? near(known.percents, f.value, () => 0.6) || f.value === 100
        : f.kind === "ratio"
          ? near(known.ratios, f.value, () => 0.06)
          : // "$99.3k" or "about 63,000" round: allow 1% or the rounding step.
            near(known.amounts, f.value, (x) => Math.max(x * 0.01, f.text.match(/[kK]/) ? 60 : f.text.match(/[mM]/) ? 60_000 : 1));
    if (!ok) bad.push(f.text);
  }
  return [...new Set(bad)];
}
