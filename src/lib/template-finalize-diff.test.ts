import { describe, it, expect } from "vitest";
import { computeDiff, DIFF_KEY_SEP, type DiffBucket } from "./template-finalize-diff";

/**
 * Three-way diff rules (spec §6.3):
 *   seeded == sheetNow == catalogNow     → unchanged
 *   seeded == catalogNow !== sheetNow    → clientEdited  (safe to apply)
 *   seeded !== catalogNow && sheetNow==seeded → catalogDrifted (no client input)
 *   sheetNow !== catalogNow && sheetNow !== seeded → conflict (admin must pick)
 */
const cases: Array<{
  name: string;
  seeded: string | null;
  sheetNow: string | null;
  catalogNow: string | null;
  expected: DiffBucket;
}> = [
  { name: "all three equal", seeded: "red", sheetNow: "red", catalogNow: "red", expected: "unchanged" },
  { name: "client edited, catalog unchanged", seeded: "red", sheetNow: "green", catalogNow: "red", expected: "clientEdited" },
  { name: "catalog drifted, client untouched", seeded: "red", sheetNow: "red", catalogNow: "blue", expected: "catalogDrifted" },
  { name: "both changed differently", seeded: "red", sheetNow: "green", catalogNow: "blue", expected: "conflict" },
  { name: "client edited to same as catalog-new", seeded: "red", sheetNow: "blue", catalogNow: "blue", expected: "unchanged" },
  { name: "empty seeded, client filled", seeded: null, sheetNow: "green", catalogNow: null, expected: "clientEdited" },
  { name: "empty seeded, empty everywhere", seeded: null, sheetNow: null, catalogNow: null, expected: "unchanged" },
  { name: "empty seeded, catalog filled by someone else", seeded: null, sheetNow: null, catalogNow: "blue", expected: "catalogDrifted" },
  { name: "empty seeded, both filled differently", seeded: null, sheetNow: "green", catalogNow: "blue", expected: "conflict" },
];

describe("computeDiff", () => {
  for (const c of cases) {
    it(c.name, () => {
      const { bucketsByKey } = computeDiff({
        seeded: { "B01": { color: c.seeded ?? "" } },
        sheetNow: { "B01": { color: c.sheetNow ?? "" } },
        catalogNow: { "B01": { color: c.catalogNow ?? "" } },
      });
      expect(bucketsByKey[`B01${DIFF_KEY_SEP}color`]).toBe(c.expected);
    });
  }

  it("returns counts per bucket and sample rows", () => {
    const out = computeDiff({
      seeded: { A: { x: "a" }, B: { x: "a" } },
      sheetNow: { A: { x: "b" }, B: { x: "a" } },
      catalogNow: { A: { x: "a" }, B: { x: "a" } },
    });
    expect(out.counts.clientEdited).toBe(1);
    expect(out.counts.unchanged).toBe(1);
    expect(out.samples.clientEdited.length).toBeGreaterThan(0);
  });

  it("normalizes null/undefined/'' as equal", () => {
    const out = computeDiff({
      seeded: { A: { x: "" } },
      sheetNow: { A: { x: "" } },
      catalogNow: { A: {} as Record<string, string> },
    });
    expect(out.counts.unchanged).toBe(1);
  });

  it("round-trips diff keys when rowKey or field contains a colon", () => {
    // Field labels with colons are unusual but not forbidden by the schema;
    // rowKeys themselves may also contain colons (e.g. synthetic `sku:<sku>`
    // keys synthesized by the finalize route). The sentinel separator must
    // unambiguously delimit rowKey from field regardless.
    const rowKey = "sku:ABC-123";
    const field = "weird:field:name";
    const out = computeDiff({
      seeded: { [rowKey]: { [field]: "a" } },
      sheetNow: { [rowKey]: { [field]: "b" } },
      catalogNow: { [rowKey]: { [field]: "a" } },
    });

    const composed = `${rowKey}${DIFF_KEY_SEP}${field}`;
    expect(out.bucketsByKey[composed]).toBe("clientEdited");

    // Reader side: lastIndexOf the separator recovers both parts.
    const lastSep = composed.lastIndexOf(DIFF_KEY_SEP);
    expect(composed.slice(0, lastSep)).toBe(rowKey);
    expect(composed.slice(lastSep + DIFF_KEY_SEP.length)).toBe(field);
  });
});
