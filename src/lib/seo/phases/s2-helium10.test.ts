// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
const select = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { select } }));
import { S2 } from "./s2";

describe("S2 acquired keyword inputs", () => {
  it("accepts saved MCP research without a CSV and keeps missing metrics null", async () => {
    select.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [{ contentRules: { s2_helium10_data: { dimensions: [JSON.stringify({ client: { keywords: [{ keyword_phrase: "tea", search_volume: 12, cpr: 0, missing_metrics: ["cpr"] }] }, competitors: [] })] } } }] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
    const ctx = await S2.loadContext("p");
    const slots = S2.fillSlots(ctx);
    expect(slots.cerebro_csv).toContain('"cpr": null');
    expect(slots.cerebro_csv).toContain('"keyword_phrase": "tea"');
  });
});
