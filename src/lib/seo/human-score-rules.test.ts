import { describe, it, expect } from "vitest";
import {
  codeDetractors,
  computeHumanScore,
  labelFor,
  isAiJudgedPattern,
  supersededPaths,
  toggleAcceptedPath,
  type HumanScore,
} from "./human-score-rules";

const F = "DetailedBulletPoint_1";
const hits = (text: string) => codeDetractors({ ASIN: "B0X", [F]: text });
const patterns = (text: string) => hits(text).map((d) => d.pattern);

describe("codeDetractors — each rule catches its words and skips near-misses", () => {
  it.each([
    ["Significance inflation", "A testament to quality", "Built to last all year", -6],
    ["Promotional fluff", "Our mat boasts vibrant colors", "Bright colors", -5],
    ["AI vocabulary", "A crucial step to delve into", "Landscape lights for paths", -4],
    ["Copula avoidance", "This kit serves as a starter", "Our kit stands out", -5],
    ["Filler phrases", "In order to clean it", "To clean it", -5],
    ["Excessive hedging", "It could potentially help", "It could help", -6],
    ["Generic positive conclusion", "The future looks bright", "The future is here", -7],
  ])("%s", (pattern, hit, miss, impact) => {
    const ds = hits(hit).filter((d) => d.pattern === pattern);
    expect(ds.length).toBeGreaterThan(0);
    expect(ds[0].impact).toBe(impact);
    expect(ds[0].field).toBe(F);
    expect(patterns(miss)).not.toContain(pattern);
  });

  it("pivotal counts once, as inflation only", () => {
    expect(patterns("A pivotal upgrade")).toEqual(["Significance inflation"]);
  });

  it("repeated hits each deduct", () => {
    expect(hits("vibrant, vibrant and vibrant").length).toBe(3);
  });

  it("curly apostrophes are normalized", () => {
    expect(patterns("It’s important to note the size")).toContain("Filler phrases");
  });

  it("em dash: first is free, each extra costs -3", () => {
    expect(patterns("A — b")).not.toContain("Em dash overuse");
    const ds = hits("A — b — c — d").filter((d) => d.pattern === "Em dash overuse");
    expect(ds.length).toBe(2);
    expect(ds[0].impact).toBe(-3);
    expect(hits("A – b – c").filter((d) => d.pattern === "Em dash overuse").length).toBe(1);
  });

  it('"This" right after the ALL CAPS header', () => {
    expect(patterns("EASY SETUP: This mat unrolls flat")).toContain('"This [product]" after header');
    expect(patterns("EASY SETUP: Our mat unrolls flat. This helps")).not.toContain('"This [product]" after header');
  });

  it("negative parallelism needs the it's/but turn", () => {
    expect(patterns("It's not just a mat, it's a system")).toContain("Negative parallelism");
    expect(patterns("Not merely soft; it is durable")).toContain("Negative parallelism");
    expect(patterns("Not only soft but also durable")).not.toContain("Negative parallelism");
  });

  it("only scores DetailedBulletPoint_1..5", () => {
    expect(codeDetractors({ ASIN: "B0X", Title: "vibrant", DetailedBulletPoint_5: "vibrant" }).map((d) => d.field)).toEqual(["DetailedBulletPoint_5"]);
  });
});

describe("labelFor", () => {
  it("bands 90/70/50", () => {
    expect([labelFor(90), labelFor(89), labelFor(70), labelFor(69), labelFor(50), labelFor(49)])
      .toEqual(["Excellent", "Good", "Good", "Needs Work", "Needs Work", "AI-Detectable"]);
  });
});

describe("isAiJudgedPattern", () => {
  it("classifies the six judgment rules, tolerating model wording", () => {
    for (const p of ["Rule of three", "Rule of three forcing", "Synonym cycling", "Elegant variation / synonym cycling",
      "Bullet incoherence", "Contradicts description", "-ing phrase padding", "Passive with no subject"]) {
      expect(isAiJudgedPattern(p)).toBe(true);
    }
    for (const p of ["AI vocabulary", "Promotional fluff", "Em dash overuse"]) expect(isAiJudgedPattern(p)).toBe(false);
  });
});

describe("computeHumanScore", () => {
  const ai = (field: string, pattern: string, impact: number) => ({ pattern, source: "x", field, example: "e", impact });
  const stored = {
    asin: "B0X", score: 50, label: "Needs Work" as const, descriptionChecked: true,
    detractors: [
      ai(F, "Rule of three", -3),
      ai("DetailedBulletPoint_2", "Synonym cycling", -4),
      ai(F, "AI vocabulary", -4), // legacy AI-guessed word row: dropped, code recounts
    ],
    pathTo100: [
      { field: F, tip: "t", rewrite: "R", patterns: ["Rule of three"] },
      { field: "DetailedBulletPoint_2", tip: "t", rewrite: "R2" },
    ],
  };
  const row = { ASIN: "B0X", [F]: "A crucial pick", DetailedBulletPoint_2: "Plain words" };

  it("100 − code detractors − active frozen AI detractors", () => {
    const hs = computeHumanScore(row, stored);
    expect(hs.score).toBe(100 - 4 - 3 - 4);
    expect(hs.label).toBe("Good");
    expect(hs.detractors.map((d) => d.pattern).sort()).toEqual(["AI vocabulary", "Rule of three", "Synonym cycling"]);
    expect(hs.pathTo100).toBe(stored.pathTo100);
    expect(hs.descriptionChecked).toBe(true);
  });

  it("is deterministic", () => {
    expect(computeHumanScore(row, stored)).toEqual(computeHumanScore(row, stored));
  });

  it("an accepted path clears the AI detractors it lists; un-accept restores", () => {
    const acc = computeHumanScore(row, { ...stored, accepted: [{ index: 0, original: "x" }] });
    expect(acc.detractors.map((d) => d.pattern)).not.toContain("Rule of three");
    expect(acc.score).toBe(100 - 4 - 4);
    expect(computeHumanScore(row, { ...stored, accepted: [] }).score).toBe(100 - 4 - 3 - 4);
  });

  it("a legacy path with no patterns clears every AI detractor on its field", () => {
    const acc = computeHumanScore(row, { ...stored, accepted: [{ index: 1, original: "x" }] });
    expect(acc.detractors.map((d) => d.pattern)).not.toContain("Synonym cycling");
  });

  it("clamps to 1..100", () => {
    const bad = { ASIN: "B0X", [F]: "vibrant ".repeat(40) };
    expect(computeHumanScore(bad, { ...stored, detractors: [] }).score).toBe(1);
    expect(computeHumanScore({ ASIN: "B0X" }, { ...stored, detractors: [] }).score).toBe(100);
  });
});

describe("supersededPaths", () => {
  it("other paths on an accepted path's field are superseded", () => {
    const paths = [{ field: F }, { field: F }, { field: "DetailedBulletPoint_2" }];
    expect([...supersededPaths(paths, [{ index: 0, original: "" }])]).toEqual([1]);
    expect([...supersededPaths(paths, [])]).toEqual([]);
  });
});

describe("toggleAcceptedPath", () => {
  const hs: HumanScore = {
    asin: "B0X", score: 90, label: "Excellent" as const, descriptionChecked: false, detractors: [],
    pathTo100: [{ field: F, tip: "t", rewrite: "NEW TEXT" }, { field: F, tip: "t", rewrite: "OTHER" }],
  };
  const row = { ASIN: "B0X", [F]: "OLD", [`${F}_CharLength`]: 3, [`${F}_ByteLength`]: 3, _humanScore: hs };

  it("accept swaps in the rewrite, syncs counts, records the original", () => {
    const next = toggleAcceptedPath(row, 0);
    expect(next[F]).toBe("NEW TEXT");
    expect(next[`${F}_CharLength`]).toBe(8);
    expect(next[`${F}_ByteLength`]).toBe(8);
    expect(next._humanScore.accepted).toEqual([{ index: 0, original: "OLD" }]);
    expect(row._humanScore).toBe(hs); // input untouched
  });

  it("un-accept restores the original text", () => {
    const back = toggleAcceptedPath(toggleAcceptedPath(row, 0), 0);
    expect(back[F]).toBe("OLD");
    expect(back[`${F}_CharLength`]).toBe(3);
    expect(back._humanScore.accepted).toEqual([]);
  });

  it("un-accept after a manual edit keeps the edit (never clobbers it)", () => {
    const edited = { ...toggleAcceptedPath(row, 0), [F]: "HAND EDIT" };
    const back = toggleAcceptedPath(edited, 0);
    expect(back[F]).toBe("HAND EDIT");
    expect(back._humanScore.accepted).toEqual([]);
  });

  it("a superseded path cannot be accepted", () => {
    const once = toggleAcceptedPath(row, 0);
    expect(toggleAcceptedPath(once, 1)).toBe(once);
  });
});
