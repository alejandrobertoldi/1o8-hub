import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SQL = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0093_listing_image_pt09.sql"),
  "utf8"
);

describe("0093_listing_image_pt09.sql", () => {
  it("allows PT09 on listing-image slot tables and seo_images", () => {
    expect(SQL).toContain("'PT09'");
    expect(SQL).toContain("listing_image_slot_versions_slot_check");
    expect(SQL).toContain("listing_image_slot_status_slot_check");
    expect(SQL).toContain("seo_images_technical_name_check");
  });

  it("raises seo_images image_number to 10", () => {
    expect(SQL).toContain("BETWEEN 1 AND 10");
  });
});
