import { describe, it, expect } from "vitest";
import { getCoreFieldByBqName } from "./column-registry";

/**
 * This resolver exists because the codebase has TWO different "BQ names" and the
 * bulk-edit path used the wrong one for years:
 *
 *   PascalCase BQ Master column  "ParentageLevel"   <- attributes.general_label, ColumnDef.bqName, JSONB blob keys
 *   raw Amazon flat-file column  "parentage_level_marketplace_id=..."  <- attributes.bq_label ONLY
 *   camelCase drizzle key        "parentageLevel"   <- the master table column
 *
 * getCoreFieldByBqName maps the FIRST to the THIRD. The negative cases below are
 * the load-bearing ones: they prove neither of the other two namespaces is accepted.
 */
describe("getCoreFieldByBqName", () => {
  it("maps a PascalCase core BQ name to its camelCase drizzle key", () => {
    expect(getCoreFieldByBqName("ParentageLevel")).toBe("parentageLevel");
    expect(getCoreFieldByBqName("Status")).toBe("status");
    expect(getCoreFieldByBqName("MainImageURL")).toBe("mainImageUrl");
    expect(getCoreFieldByBqName("ClientIDCode")).toBe("clientIdCode");
    expect(getCoreFieldByBqName("ParentASIN")).toBe("parentAsin");
  });

  it("returns null for a raw Amazon flat-file column name (attributes.bq_label)", () => {
    expect(
      getCoreFieldByBqName(
        "parentage_level_marketplace_id=ATVPDKIKX0DER_#1_value"
      )
    ).toBeNull();
    expect(getCoreFieldByBqName("::listing_status")).toBeNull();
    expect(getCoreFieldByBqName("contribution_sku#1_value")).toBeNull();
  });

  it("returns null when handed the camelCase drizzle key instead of the BQ name", () => {
    expect(getCoreFieldByBqName("parentageLevel")).toBeNull();
    expect(getCoreFieldByBqName("mainImageUrl")).toBeNull();
  });

  it("returns null for a JSONB-stored field, so callers fall through to the blob branch", () => {
    expect(getCoreFieldByBqName("Size")).toBeNull();
    expect(getCoreFieldByBqName("VariationThemeName")).toBeNull();
    expect(getCoreFieldByBqName("TotallyUnknownColumn")).toBeNull();
  });

  it("returns null for the empty string", () => {
    expect(getCoreFieldByBqName("")).toBeNull();
  });
});
