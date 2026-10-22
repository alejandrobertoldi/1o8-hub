import { describe, expect, it } from "vitest";
import { inheritedContentToSeoRow } from "./seo-inherited";

describe("inheritedContentToSeoRow", () => {
  it("returns null when there is no listing copy", () => {
    expect(inheritedContentToSeoRow(null)).toBeNull();
    expect(inheritedContentToSeoRow({})).toBeNull();
  });

  it("maps CLR / S1 listing copy to Hub SEO fields as version 0", () => {
    const row = inheritedContentToSeoRow({
      item_name: "CLR inherited title",
      product_description: "CLR description",
      detailed_bullets: ["B1", "B2"],
      generic_keywords: ["fiber"],
    });
    expect(row).toMatchObject({
      SEOVersionNumber: "0",
      SEOCategory: "Inherited",
      ItemName: "CLR inherited title",
      ProductDescription: "CLR description",
      DetailedBulletPoint1: "B1",
      DetailedBulletPoint2: "B2",
      GenericKeyword1: "fiber",
    });
  });
});
