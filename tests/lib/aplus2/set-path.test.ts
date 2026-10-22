import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aplus2ContentTypeLabel,
  aplus2SetHref,
  aplus2VersionTier,
  aplusProductDetailHref,
  asAplus2ContentType,
  findAplus2SetId,
  parseAplus2ContentType,
} from "@/lib/aplus2/set-path";

describe("parseAplus2ContentType", () => {
  it("accepts BA+ aliases", () => {
    expect(parseAplus2ContentType("BA+")).toBe("BA+");
    expect(parseAplus2ContentType("ABasic")).toBe("BA+");
  });
  it("accepts PA+ aliases including APlus", () => {
    expect(parseAplus2ContentType("PA+")).toBe("PA+");
    expect(parseAplus2ContentType("APlus")).toBe("PA+");
  });
});

describe("aplus2SetHref", () => {
  it("is one URL per ASIN set (tiers are versions on that page)", () => {
    expect(
      aplus2SetHref({
        clientIdCode: "BNU_SC_US",
        marketplace: "US",
        scopeIdentifier: "B0B39MGKRQ",
        contentType: "PA+",
      })
    ).toBe("/design/aplus2/BNU_SC_US/US/B0B39MGKRQ");
  });
});

describe("aplusProductDetailHref", () => {
  it("returns to the A+ client list", () => {
    expect(aplusProductDetailHref("prod-1")).toBe("/products/prod-1?from=aplus");
  });
  it("returns to the A+ editor when marketplace and set are present", () => {
    expect(
      aplusProductDetailHref("prod-1", { marketplace: "US", setIdentifier: "B0GWZGW426" })
    ).toBe("/products/prod-1?from=aplus-editor&marketplace=US&set=B0GWZGW426");
  });
});

describe("findAplus2SetId", () => {
  const sets = [
    { id: "one", marketplace: "US", scopeIdentifier: "B0B39MGKRQ", contentType: "BA+" },
  ];

  it("finds the ASIN set regardless of requested tier", () => {
    expect(
      findAplus2SetId(sets, { marketplace: "US", scopeIdentifier: "B0B39MGKRQ", contentType: "PA+" })
    ).toBe("one");
    expect(
      findAplus2SetId(sets, { marketplace: "US", scopeIdentifier: "B0B39MGKRQ", contentType: "BA+" })
    ).toBe("one");
  });
});

describe("aplus2ContentTypeLabel", () => {
  it("labels BA+ as Basic A+", () => {
    expect(aplus2ContentTypeLabel("BA+")).toBe("Basic A+");
  });
});

describe("aplus2VersionTier", () => {
  it("prefers the version type over the set type", () => {
    expect(aplus2VersionTier("PA+", "BA+")).toBe("PA+");
    expect(aplus2VersionTier(undefined, "BA+")).toBe("BA+");
    expect(asAplus2ContentType("ABasic")).toBe("BA+");
  });
});

describe("migration 0097", () => {
  it("adds version content_type and restores set uniqueness without it", () => {
    const sql = readFileSync(
      "drizzle/migrations/0097_aplus2_version_content_type.sql",
      "utf8"
    );
    expect(sql).toContain('aplus2_versions');
    expect(sql).toContain("content_type");
    expect(sql).toContain("aplus2_sets_client_marketplace_scope_key");
  });
});

describe("migration 0103", () => {
  it("widens A+ scope identifiers for generated GROUP ids", () => {
    const sql = readFileSync(
      "drizzle/migrations/0103_aplus2_group_scope.sql",
      "utf8",
    );
    expect(sql).toContain("scope_identifier TYPE varchar(64)");
    expect(sql).toContain("GROUP");
  });
});

describe("migration 0104", () => {
  it("permits GROUP in the database scope constraint", () => {
    const sql = readFileSync(
      "drizzle/migrations/0104_aplus2_group_scope_check.sql",
      "utf8",
    );
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS aplus2_sets_scope_type_check");
    expect(sql).toContain("scope_type IN ('ASIN', 'PARENT', 'GROUP')");
  });
});
