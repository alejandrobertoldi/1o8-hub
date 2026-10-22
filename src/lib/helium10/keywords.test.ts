import { describe, expect, it } from "vitest";
import { normalizeKeywords, readKeywordPayload, selectProjectAsins, toModelKeyword, savedResearchDefaults, mergeResearchKeywords, attachResearchSources } from "./keywords";

describe("Helium 10 keyword acquisition", () => {
  it("keeps measured volumes authoritative and rejects invented classification phrases", () => {
    const research = mergeResearchKeywords(normalizeKeywords([{ phrase: "tea", search_volume: 20 }], "Helium 10 MCP"), []);
    expect(attachResearchSources([{ KeywordText: "Tea", KeywordSearchVolume: 999 }], research)[0]).toMatchObject({ KeywordText: "tea", KeywordSearchVolume: 20, KeywordSource: "Client: Helium 10 MCP" });
    expect(attachResearchSources([{ KeywordText: "invented" }, { KeywordText: "tea" }], research)).toEqual([expect.objectContaining({ KeywordText: "tea" })]);
    expect(() => attachResearchSources([{ KeywordText: "invented" }], research)).toThrow();
  });
  it("matches model echoes that differ only in accents, quotes, spacing or edge punctuation, once each", () => {
    const research = mergeResearchKeywords(normalizeKeywords([{ phrase: "trejo’s tacos  cookbook", search_volume: 50 }, { phrase: "recetas de cocina mexicana", search_volume: 40 }, { phrase: "taquería", search_volume: 30 }], "Helium 10 MCP"), []);
    const out = attachResearchSources([{ KeywordText: "Trejo's Tacos Cookbook." }, { KeywordText: "taqueria" }, { KeywordText: "recetas de cocina mexicana" }, { KeywordText: "Recetas de cocina mexicana" }], research);
    expect(out.map(k => k.KeywordText)).toEqual(["trejo’s tacos  cookbook", "taquería", "recetas de cocina mexicana"]);
  });
  it("preserves client, competitor and shared phrase provenance when merging for tiering", () => {
    const client = normalizeKeywords([{ phrase: "shared", search_volume: 10 }], "Helium 10 MCP");
    const competitor = normalizeKeywords([{ phrase: "shared", search_volume: 10 }, { phrase: "gap", search_volume: 20 }], "Helium 10 MCP");
    const rows = mergeResearchKeywords(client, [competitor]);
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.keyword_phrase === "shared")?.keyword_source).toBe("Client: Helium 10 MCP | Competitor: Helium 10 MCP");
    expect(rows.find(row => row.keyword_phrase === "gap")?.keyword_source).toBe("Competitor: Helium 10 MCP");
  });
  it("reuses marketplace and competitor ASINs already saved in S1", () => {
    expect(savedResearchDefaults("BRAND_SC_UK", [{ name: "Brand", url: "https://www.amazon.co.uk/dp/B000000001?ref=x" }, { name: "Store", url: "https://brand.test" }])).toEqual({ marketplace: "UK", competitorAsins: ["B000000001"] });
  });
  it("maps measured metrics and preserves Unicode, zeroes and missing metrics", () => {
    const result = normalizeKeywords([{ phrase: "  café crème  ", search_volume: 240, iq_score: 0, organic_rank: 7, suggested_bid_usd: 1.25 }], "Client");
    expect(result.keywords[0]).toMatchObject({ keyword_phrase: "café crème", search_volume: 240, cerebro_iq_score: 0, position: 7, ppc_bid: 1.25 });
    expect(toModelKeyword(result.keywords[0])).toMatchObject({ competing_products: null, cerebro_iq_score: 0 });
  });
  it("deduplicates normalized phrases and rejects rows without measured volume", () => {
    const r = normalizeKeywords([{ phrase: "Tea", search_volume: 20 }, { phrase: " tea ", search_volume: 30 }, { phrase: "bad" }], "Client");
    expect(r.keywords).toHaveLength(1);
    expect(r.keywords[0].search_volume).toBe(30);
    expect(r.duplicatesRemoved).toBe(1);
    expect(r.invalidRemoved).toBe(1);
  });
  it("handles structured and text payloads and fails on provider errors", () => {
    const payload = { data: { keywords: [{ phrase: "tea", search_volume: 1 }] } };
    expect(readKeywordPayload({ structuredContent: payload })).toEqual(payload.data.keywords);
    expect(readKeywordPayload({ content: [{ type: "text", text: JSON.stringify(payload) }] })).toEqual(payload.data.keywords);
    expect(() => readKeywordPayload({ structuredContent: { error: { message: "secret" } } })).toThrow("Helium 10");
    expect(() => readKeywordPayload({ isError: true, content: [] })).toThrow();
    expect(() => readKeywordPayload({ content: [] })).toThrow();
  });
  it("selects unique child ASINs and rejects invalid saved identifiers", () => {
    expect(selectProjectAsins([{ asin: "B000000001", parentageLevel: "Parent" }, { asin: "b000000002", parentageLevel: "Child" }, { asin: "B000000002", parentageLevel: "Child" }])).toEqual(["B000000002"]);
    expect(() => selectProjectAsins([{ asin: "broken", parentageLevel: "Child" }])).toThrow();
  });
});
