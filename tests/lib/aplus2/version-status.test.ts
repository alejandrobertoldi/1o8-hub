import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APLUS2_VERSION_STATUSES } from "@/lib/aplus2/zod-schemas";
import { DESIGN_STATUS_ORDER_FULL } from "@/lib/design-status";

describe("aplus2 version discontinued status", () => {
  it("API allow-list includes discontinued", () => {
    expect(APLUS2_VERSION_STATUSES).toContain("discontinued");
  });

  it("shared design-status dropdown includes discontinued", () => {
    expect(DESIGN_STATUS_ORDER_FULL).toContain("discontinued");
  });

  it("migration 0095 allows discontinued on aplus2_versions", () => {
    const sql = readFileSync(
      "drizzle/migrations/0095_aplus2_version_discontinued.sql",
      "utf8"
    );
    expect(sql).toContain("discontinued");
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS \"aplus2_versions_status_check\"");
  });
});
