import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("aplus2_sets content_type CHECK", () => {
  it("migration 0094 allows both PA+ and BA+", () => {
    const sql = readFileSync("drizzle/migrations/0094_aplus2_content_type_ba.sql", "utf8");
    expect(sql).toContain(`CHECK ("content_type" IN ('PA+', 'BA+'))`);
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS \"aplus2_sets_content_type_check\"");
  });
});
