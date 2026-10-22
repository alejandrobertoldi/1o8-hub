import { describe, it, expect, vi, beforeEach } from "vitest";
import { coherenceRows } from "./coherence";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const rows = [{ ASIN: "B0TEST0001", DetailedBulletPoint_1: "ORIGINAL HEADER: my own words" }];
const score = { asin: "B0TEST0001", score: 82, label: "Good", detractors: [], pathTo100: [], descriptionChecked: false };

function reply(body: unknown) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ content: [{ text: JSON.stringify(body) }] }) });
}
const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

describe("coherenceRows — hybrid Human Score contract (#1)", () => {
  it("asks the model to deduct ONLY the judgment rows and leave word patterns to code", async () => {
    reply({ rows: [], scores: [score] });
    await coherenceRows(rows, new Map(), [], "k", "m", 4000);
    const sys = sent().system as string;
    expect(sys).toMatch(/ONLY for the six JUDGMENT rows/);
    expect(sys).toMatch(/scored automatically by code: do NOT list them as detractors/);
  });

  it("asks for one pathTo100 per field, carrying the patterns it fixes", async () => {
    reply({ rows: [], scores: [score] });
    await coherenceRows(rows, new Map(), [], "k", "m", 4000);
    const sys = sent().system as string;
    expect(sys).toMatch(/AT MOST ONE pathTo100 entry per field/);
    expect(sys).toContain('"patterns"');
  });

  it("generation falls back silently (never blocks a content run)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    const out = await coherenceRows(rows, new Map(), [], "k", "m", 4000);
    expect(out).toEqual({ rows, humanScores: [] });
  });
});

describe("coherenceRows — default (generation Pass 4) is unchanged", () => {
  it("still rewrites and merges, with no temperature override", async () => {
    reply({ rows: [{ ASIN: "B0TEST0001", DetailedBulletPoint_1: "AI REWRITE: different" }], scores: [score] });
    const out = await coherenceRows(rows, new Map(), [], "k", "m", 4000);
    expect(sent().temperature).toBeUndefined();
    expect(sent().system).toContain("after your Part A rewrites");
    expect(out.rows[0].DetailedBulletPoint_1).toBe("AI REWRITE: different");
  });
});
