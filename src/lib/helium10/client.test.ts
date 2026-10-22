// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fetchAsinKeywords, HeliumProvider } from "./client";

describe("Helium 10 MCP client", () => {
  it("discovers the reverse-ASIN tool through pagination and calls exact ASINs", async () => {
    const client = {
      listTools: vi.fn().mockResolvedValueOnce({ tools: [], nextCursor: "next" }).mockResolvedValueOnce({ tools: [{ name: "get_keywords_by_asin" }] }),
      callTool: vi.fn().mockResolvedValue({ structuredContent: { data: { keywords: [{ phrase: "tea", search_volume: 2 }] } } }),
    };
    expect(await fetchAsinKeywords(client, ["B000000001"], "UK")).toHaveLength(1);
    expect(client.callTool).toHaveBeenCalledWith({ name: "get_keywords_by_asin", arguments: { asin: "B000000001", marketplace: "UK", exclude_variations: true } }, undefined, expect.any(Object));
  });
  it("refuses unavailable tools and never returns partial data after one ASIN fails", async () => {
    const client = { listTools: vi.fn().mockResolvedValue({ tools: [] }), callTool: vi.fn() };
    await expect(fetchAsinKeywords(client, ["B000000001"], "US")).rejects.toThrow("not available");
    client.listTools.mockResolvedValue({ tools: [{ name: "get_keywords_by_asin" }] });
    client.callTool.mockResolvedValueOnce({ structuredContent: { data: { keywords: [] } } }).mockResolvedValueOnce({ isError: true });
    await expect(fetchAsinKeywords(client, ["B000000001", "B000000002"], "US")).rejects.toThrow();
  });
  it("preserves refresh tokens when a refresh omits one, and clears invalid tokens", () => {
    const provider = new HeliumProvider({ tokens: { access_token: "old", token_type: "Bearer", refresh_token: "refresh" } }, "https://hub.example");
    provider.saveTokens({ access_token: "new", token_type: "Bearer" });
    expect(provider.tokens()?.refresh_token).toBe("refresh");
    provider.invalidateCredentials("tokens");
    expect(provider.tokens()).toBeUndefined();
  });
});
