import { z } from "zod";
import type { CerebroRow, CerebroParseResult } from "@/lib/parsers/cerebro";

export type KeywordSnapshot = {
  client: CerebroParseResult;
  competitors: CerebroParseResult[];
  marketplace: string;
  asins: string[];
  competitorAsins: string[];
  fetchedAt: string;
};

export const marketplaces = ["US", "CA", "MX", "DE", "ES", "IT", "FR", "UK", "IN", "NL", "AU", "JP", "AE", "BR", "SA"] as const;
export function savedResearchDefaults(clientIdCode: string | null, competitors: { name: string; url: string }[] | null) {
  const suffix = clientIdCode?.split("_").pop()?.toUpperCase();
  const marketplace = marketplaces.find(m => m === suffix) ?? "US";
  const competitorAsins = [...new Set((competitors ?? []).flatMap(competitor => {
    const value = competitor.url.trim().toUpperCase();
    const asin = /^[A-Z0-9]{10}$/.test(value) ? value : value.match(/\/(?:DP|GP\/PRODUCT)\/([A-Z0-9]{10})(?:[/?#]|$)/)?.[1];
    return asin ? [asin] : [];
  }))].slice(0, 10);
  return { marketplace, competitorAsins };
}
export const acquisitionInput = z.object({
  marketplace: z.enum(marketplaces),
  competitorAsins: z.array(z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/)).max(10).default([]),
});
const rowSchema = z.object({ phrase: z.string().trim().min(1), search_volume: z.number().finite().nonnegative() }).passthrough();
const fields = {
  keyword_sales: "keyword_sales_weekly", cerebro_iq_score: "iq_score",
  search_volume_trend: "search_volume_trend_30d_pct", competing_products: "competing_products",
  cpr: "cpr", title_density: "title_density", position: "organic_rank", organic: "organic_rank",
  ppc_bid: "suggested_bid_usd", sponsored: "sponsored_rank", amazon_recommended: "amazon_recommended_rank",
  relative_rank: "relative_rank", competitor_rank: "competitor_rank", ranking_count: "ranking_count",
} as const;

export function normalizeKeywords(rows: unknown[], source: string): CerebroParseResult {
  const byPhrase = new Map<string, CerebroRow>();
  let invalidRemoved = 0, duplicatesRemoved = 0;
  for (const raw of rows) {
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success || new TextEncoder().encode(parsed.data.phrase).length > 250 || !/[\p{L}\p{N}]/u.test(parsed.data.phrase)) {
      invalidRemoved++; continue;
    }
    const data = parsed.data;
    const metrics: Record<string, number> = {};
    const missing: string[] = [];
    for (const [target, origin] of Object.entries(fields)) {
      const value = data[origin];
      const measured = typeof value === "number" && Number.isFinite(value);
      // Legacy filtering expects numbers. Track sentinels explicitly and restore null
      // before displaying metrics or passing them to the classification model.
      metrics[target] = measured ? value : 0;
      if (!measured) missing.push(target);
    }
    const keyword = { ...metrics, keyword_phrase: data.phrase.toLowerCase(), search_volume: data.search_volume, missing_metrics: missing } as CerebroRow;
    const previous = byPhrase.get(keyword.keyword_phrase);
    if (previous) duplicatesRemoved++;
    if (!previous || previous.search_volume < keyword.search_volume) byPhrase.set(keyword.keyword_phrase, keyword);
  }
  return { keywords: [...byPhrase.values()].sort((a, b) => b.search_volume - a.search_volume), source, totalRaw: rows.length, duplicatesRemoved, invalidRemoved, errors: invalidRemoved ? [`Excluded ${invalidRemoved} invalid rows or rows without measured search volume.`] : [] };
}

export function toModelKeyword(row: CerebroRow) {
  return { ...row, ...Object.fromEntries((row.missing_metrics ?? []).map(key => [key, null])) };
}

export function mergeResearchKeywords(client: CerebroParseResult, competitors: CerebroParseResult[]) {
  const merged = new Map<string, ReturnType<typeof toModelKeyword> & { keyword_source: string }>();
  for (const [index, result] of [client, ...competitors].entries()) {
    const role = index === 0 ? "Client" : "Competitor";
    const source = result.source?.startsWith(role) ? result.source : `${role}: ${result.source ?? "Helium 10 MCP"}`;
    for (const row of result.keywords) {
      const phrase = row.keyword_phrase.trim().toLowerCase();
      const previous = merged.get(phrase);
      if (previous) {
        if (!previous.keyword_source.split(" | ").includes(source)) previous.keyword_source += ` | ${source}`;
      } else merged.set(phrase, { ...toModelKeyword(row), keyword_source: source });
    }
  }
  return [...merged.values()];
}

export function attachResearchSources<T extends { KeywordText: string }>(classified: T[], research: ReturnType<typeof mergeResearchKeywords>) {
  // The model sometimes echoes a phrase with accents, curly quotes, spacing or edge
  // punctuation changed. Match exactly first, then on a loose key; drop anything still
  // unmatched (invented) instead of failing the whole run over one phrase.
  const loose = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"')
    .toLowerCase().replace(/\s+/g, " ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const byPhrase = new Map(research.map(row => [row.keyword_phrase, row]));
  const byLoose = new Map<string, (typeof research)[number]>();
  for (const row of research) if (!byLoose.has(loose(row.keyword_phrase))) byLoose.set(loose(row.keyword_phrase), row);
  const used = new Set<string>();
  const attached = classified.flatMap(keyword => {
    const source = byPhrase.get(keyword.KeywordText.trim().toLowerCase()) ?? byLoose.get(loose(keyword.KeywordText));
    if (!source || used.has(source.keyword_phrase)) return [];
    used.add(source.keyword_phrase);
    return [{ ...keyword, KeywordText: source.keyword_phrase, KeywordSearchVolume: source.search_volume, KeywordSource: source.keyword_source }];
  });
  if (classified.length && !attached.length) throw new Error("Tiering returned a phrase outside the supplied research. Please retry.");
  return attached;
}

export function readKeywordPayload(input: unknown): unknown[] {
  const envelope = z.object({ isError: z.boolean().optional(), structuredContent: z.unknown().optional(), content: z.unknown().optional() }).safeParse(input);
  if (!envelope.success) throw new Error("Helium 10 returned an invalid response.");
  const result = envelope.data;
  if (result.isError) throw new Error("Helium 10 keyword query failed. Check your account entitlement and try again.");
  let payload = result.structuredContent;
  if (!payload && Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item.type !== "text") continue;
      try { payload = JSON.parse(item.text); break; } catch { /* Non-JSON content is not keyword data. */ }
    }
  }
  const parsed = z.object({ data: z.object({ keywords: z.array(z.unknown()) }), error: z.unknown().optional() }).safeParse(payload);
  if (!parsed.success || parsed.data.error) throw new Error("Helium 10 returned no usable keyword payload.");
  return parsed.data.data.keywords;
}

export function selectProjectAsins(rows: { asin: string; parentageLevel: string | null }[]): string[] {
  const children = rows.filter(row => row.parentageLevel?.toLowerCase() !== "parent");
  const asins = [...new Set((children.length ? children : rows).map(row => row.asin.trim().toUpperCase()))];
  if (!asins.length || asins.some(asin => !/^[A-Z0-9]{10}$/.test(asin))) throw new Error("Save valid ASINs in S1 before fetching keywords.");
  if (asins.length > 20) throw new Error("Direct fetch supports up to 20 project ASINs per batch.");
  return asins;
}
