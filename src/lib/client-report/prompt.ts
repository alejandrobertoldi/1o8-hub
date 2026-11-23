import { fmt, fmtChange } from "@/components/client-report/format";
import { LIST_SECTIONS, TEXT_LABELS, type TextSection } from "./text";
import type { ClientReportData, MetricRow } from "./types";

/**
 * What Claude is asked to write for a client monthly report. Pure;
 * unit-tested. The figures are handed over already formatted, the way the
 * report prints them, so the text can quote them exactly.
 */

const LENGTH: Record<TextSection, string> = {
  summary: "3 to 5 sentences in 1 or 2 short paragraphs: how the month went overall, the 2 or 3 numbers that matter most, and what we're doing about it.",
  sales: "2 to 4 sentences.",
  paid_media: "2 to 4 sentences.",
  traffic: "2 to 4 sentences.",
  email: "2 to 4 sentences.",
  wins: "2 to 4 bullets, one sentence each.",
  watchouts: "2 to 4 bullets, one sentence each.",
  next_steps: "2 to 4 bullets, one sentence each, each a concrete action for next month.",
};

export function systemPrompt(styleRules: string, extra?: string): string {
  return `You write the commentary in 1o8's monthly performance reports for its clients. 1o8 is a performance marketing agency for direct-to-consumer brands (Shopify stores, paid media on Meta and Google, email and SMS on Klaviyo).

Who reads it: the client's founder or marketing lead. They see the tables and charts next to your text, so don't repeat every number. Tell them what the numbers mean, what changed and why it matters.

Voice: 1o8 speaking to the client. Use "we" for 1o8 and "you" / "your store" for the client. Plain, direct, confident, never salesy. US English.

Rules for the content:
- Use only the figures given in the data, copied exactly as they're written there (same rounding, same format). Never compute new numbers, totals or percentages.
- Don't invent causes. The data has no campaign, creative, product or promotion details. You may say what the numbers suggest and what we'll look into, but don't state a cause as fact.
- Platform revenue and ROAS are what each ad platform attributes to itself; they overlap and run higher than store sales. Treat MER (store net sales ÷ total ad spend) as the honest measure of paid efficiency.
- Comparisons are with the previous month and with the same month last year. When both exist, mention the one that tells the story better (seasonality makes the year-over-year view important).
- Be balanced: name what went well and what didn't. Don't hide a drop.
- If the month's data is incomplete, say so once in the summary.
- When a KPI has a target, say whether it was met.
- Bold at most one key phrase per section with **double asterisks**. No headings, no emojis, no em dashes.

1o8's writing style guide (follow it):
${styleRules}${extra?.trim() ? `\n\nAdditional instructions from 1o8:\n${extra.trim()}` : ""}`;
}

function rowLine(r: MetricRow, data: ClientReportData): string {
  const prev = r.previous === null ? "" : `; ${data.period.previousLabel}: ${fmt(r.previous, r.unit)} (${fmtChange(r.value, r.previous, r.unit, r.lowerIsBetter)?.text ?? "n/a"})`;
  const ly = r.lastYear === null ? "" : `; ${data.period.lastYearLabel}: ${fmt(r.lastYear, r.unit)} (${fmtChange(r.value, r.lastYear, r.unit, r.lowerIsBetter)?.text ?? "n/a"})`;
  return `- ${r.label}: ${fmt(r.value, r.unit)}${prev}${ly}${r.lowerIsBetter ? " [lower is better]" : ""}`;
}

/** The report's numbers as readable text for the prompt. */
export function dataForPrompt(data: ClientReportData): string {
  const lines: string[] = [];
  lines.push(`Client: ${data.client.name}`);
  lines.push(`Month: ${data.period.label} (${data.period.start} to ${data.period.end})`);
  if (data.dataThrough && data.dataThrough < data.period.end) lines.push(`Data is incomplete: it only goes through ${data.dataThrough}.`);
  lines.push("", "Main KPIs:");
  for (const k of data.kpis) {
    const target = k.target ? ` Target: ${k.target} (${k.onTrack === true ? "met" : k.onTrack === false ? "missed" : "not comparable"}).` : "";
    lines.push(`${rowLine(k, data)}.${target}`);
  }
  if (data.kpiTrend) lines.push(`Net sales by month: ${data.kpiTrend.points.map((p) => `${p.period} ${fmt(p.value, "money")}`).join(", ")}`);
  for (const s of data.sections) {
    lines.push("", `${s.title} (${s.source}):`);
    for (const g of s.groups) {
      if (g.title && s.groups.length > 1) lines.push(`${g.title}:`);
      for (const r of g.rows) lines.push(rowLine(r, data));
    }
    if (s.daily) {
      const best = s.daily.points.reduce<{ day: string; value: number } | null>((a, p) => (p.value !== null && (!a || p.value > a.value) ? { day: p.day, value: p.value } : a), null);
      if (best) lines.push(`Best day for ${s.daily.label}: ${best.day} (${fmt(best.value, s.daily.unit)})`);
    }
    if (s.trend && s.trend.points.length > 2) lines.push(`${s.trend.label} by month: ${s.trend.points.map((p) => `${p.period} ${fmt(p.value, s.trend!.unit)}`).join(", ")}`);
  }
  return lines.join("\n");
}

/** JSON schema for the requested sections: paragraphs for prose, items for lists. */
export function outputSchema(keys: TextSection[]) {
  const properties: Record<string, unknown> = {};
  for (const k of keys) {
    properties[k] = LIST_SECTIONS.includes(k)
      ? { type: "object", properties: { items: { type: "array", items: { type: "string" } } }, required: ["items"], additionalProperties: false }
      : { type: "object", properties: { paragraphs: { type: "array", items: { type: "string" } } }, required: ["paragraphs"], additionalProperties: false };
  }
  return { type: "object", properties, required: keys, additionalProperties: false };
}

export function userPrompt(opts: {
  data: ClientReportData;
  keys: TextSection[];
  context?: string;
  current?: Partial<Record<TextSection, string>>;
  instruction?: string;
}): string {
  const { data, keys } = opts;
  const parts = [
    `Write the commentary for ${data.client.name}'s ${data.period.label} report.`,
    "",
    "Sections to write:",
    ...keys.map((k) => `- ${k} (${TEXT_LABELS[k]}): ${LENGTH[k]}`),
  ];
  if (opts.context?.trim()) parts.push("", "About the client:", opts.context.trim());
  parts.push("", "The report's numbers:", dataForPrompt(data));
  const others = Object.entries(opts.current ?? {}).filter(([k, v]) => v && !keys.includes(k as TextSection));
  if (others.length) {
    parts.push("", "What the other sections already say (stay consistent, don't repeat them):");
    for (const [k, v] of others) parts.push(`${TEXT_LABELS[k as TextSection]}: ${v}`);
  }
  if (opts.instruction?.trim()) {
    const current = keys.map((k) => opts.current?.[k]).filter(Boolean);
    if (current.length) parts.push("", "Current text of the section to rewrite:", ...current.map(String));
    parts.push("", `Instruction from the team for this rewrite: ${opts.instruction.trim()}`);
  }
  return parts.join("\n");
}
