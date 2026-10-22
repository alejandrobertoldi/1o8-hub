// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { discoverReviewTools, extractGatewaySession, fetchHeliumAsinInsights, type ReviewMcpClient } from "./helium10";

function stubClient(tools: string[], responses: Record<string, unknown>): ReviewMcpClient & { calls: Array<{ name: string; arguments: Record<string, unknown> }> } {
  const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  return {
    calls,
    listTools: vi.fn(async (params?: { cursor?: string }) => {
      if (!params?.cursor) return { tools: tools.slice(0, 1).map((name) => ({ name })), nextCursor: tools.length > 1 ? "p2" : undefined };
      return { tools: tools.slice(1).map((name) => ({ name })) };
    }),
    callTool: vi.fn(async (params: { name: string; arguments: Record<string, unknown> }) => {
      calls.push(params);
      return responses[params.name];
    }),
  };
}

describe("discoverReviewTools", () => {
  it("pages through tool discovery and only recognises the two review tools", async () => {
    const client = stubClient(["get_keywords_by_asin", "get_asin_review_analysis", "helium_10_get_asin_reviews_history", "delete_tracked_product"], {});
    const tools = await discoverReviewTools(client, Date.now() + 10_000);
    expect(tools).toEqual({ analysis: "get_asin_review_analysis", history: "helium_10_get_asin_reviews_history" });
  });
  it("returns nulls when the account lacks the tools", async () => {
    const client = stubClient(["get_keywords_by_asin"], {});
    expect(await discoverReviewTools(client, Date.now() + 10_000)).toEqual({ analysis: null, history: null });
  });
  it("fails fast once the deadline has passed", async () => {
    const client = stubClient(["get_asin_review_analysis"], {});
    await expect(discoverReviewTools(client, Date.now() - 1)).rejects.toThrow(/timed out/);
  });
});

describe("fetchHeliumAsinInsights", () => {
  const analysis = { content: [{ type: "text", text: JSON.stringify({ data: { asin: "B01LR5S6HK", topics_mentions: { itemName: "Dumbbell", dateRange: { startDate: "2026-03-11", endDate: "2026-09-11" }, topics: { positiveTopics: [{ topic: "Quality", asinMetrics: { numberOfMentions: 3, occurrencePercentage: 30 } }], negativeTopics: [] } } }, error: null }) + "\n[gateway-meta] session_id=sess-1" }] };
  const history = { content: [{ type: "text", text: JSON.stringify({ data: { asin: "B01LR5S6HK", points: [{ date: "2026-09-16", review_count: 15686, rating: 4.8 }] }, error: null }) }] };

  it("calls both tools, echoes the gateway session, normalizes and counts quota", async () => {
    const client = stubClient([], { get_asin_review_analysis: analysis, get_asin_reviews_history: history });
    const session = { id: null as string | null };
    const out = await fetchHeliumAsinInsights(client, "B01LR5S6HK", {
      marketplace: "US", tools: { analysis: "get_asin_review_analysis", history: "get_asin_reviews_history" }, deadline: Date.now() + 10_000, session, historyDays: 30,
    });
    expect(out.callsUsed).toBe(2);
    expect(out.topics?.positiveTopics[0]).toMatchObject({ topic: "Quality", mentions: 3 });
    expect(out.history).toEqual([{ day: "2026-09-16", reviewCount: 15686, rating: 4.8 }]);
    expect(session.id).toBe("sess-1");
    expect(client.calls[0].arguments).toMatchObject({ asin: "B01LR5S6HK", marketplace: "US" });
    expect(client.calls[0].arguments.session_id).toBeUndefined();
    expect(client.calls[1].arguments).toMatchObject({ session_id: "sess-1", asin: "B01LR5S6HK" });
    expect(String(client.calls[1].arguments.start_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("skips analysis for unsupported marketplaces and missing tools without failing the ASIN", async () => {
    const client = stubClient([], { get_asin_reviews_history: history });
    const out = await fetchHeliumAsinInsights(client, "B01LR5S6HK", { marketplace: "CA", tools: { analysis: "get_asin_review_analysis", history: "get_asin_reviews_history" }, deadline: Date.now() + 10_000 });
    expect(out.topics).toBeNull();
    expect(out.skipped[0]).toMatch(/not offered for marketplace CA/);
    expect(out.history).toHaveLength(1);
    const none = await fetchHeliumAsinInsights(client, "B01LR5S6HK", { marketplace: "US", tools: { analysis: null, history: null }, deadline: Date.now() + 10_000 });
    expect(none.callsUsed).toBe(0);
    expect(none.skipped).toHaveLength(2);
  });

  it("extracts the gateway session id only from trailing meta lines", () => {
    expect(extractGatewaySession(analysis)).toBe("sess-1");
    expect(extractGatewaySession(history)).toBeNull();
    expect(extractGatewaySession(null)).toBeNull();
  });
});
