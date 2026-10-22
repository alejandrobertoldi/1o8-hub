import { describe, it, expect } from "vitest";
import { PRINT_SECTIONS, isPrintSectionId, type PrintSectionId } from "./print-sections";

describe("PRINT_SECTIONS", () => {
  it("covers exactly the six v2 report sections", () => {
    expect(Object.keys(PRINT_SECTIONS).sort()).toEqual([
      "advertising-audit",
      "inventory",
      "overview",
      "period-comparative",
      "share-of-voice",
      "subscribe-save",
    ]);
  });

  it("keys every entry by its own id", () => {
    for (const [key, meta] of Object.entries(PRINT_SECTIONS)) {
      expect(meta.id).toBe(key);
    }
  });

  it("assigns the range kind each section's data actually has", () => {
    // inventory is a stock snapshot (no dates); S&S is a full calendar year.
    expect(PRINT_SECTIONS.inventory.rangeKind).toBe("snapshot");
    expect(PRINT_SECTIONS["subscribe-save"].rangeKind).toBe("year");
    expect(PRINT_SECTIONS.overview.rangeKind).toBe("range");
    expect(PRINT_SECTIONS["advertising-audit"].rangeKind).toBe("range");
    expect(PRINT_SECTIONS["period-comparative"].rangeKind).toBe("range");
    expect(PRINT_SECTIONS["share-of-voice"].rangeKind).toBe("range");
  });

  it("carries the same paper title the screen page shows", () => {
    expect(PRINT_SECTIONS.overview.title).toBe("Performance overview");
    expect(PRINT_SECTIONS["subscribe-save"].title).toBe("Subscribe & Save");
  });

  it("never ships an empty label, title, or standfirst", () => {
    for (const meta of Object.values(PRINT_SECTIONS)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.blurb.length).toBeGreaterThan(20);
    }
  });

  it("narrows only known ids", () => {
    expect(isPrintSectionId("overview")).toBe(true);
    expect(isPrintSectionId("business-model-audit")).toBe(false);
    expect(isPrintSectionId("")).toBe(false);
  });

  it("types the id union off the registry keys", () => {
    const id: PrintSectionId = "inventory";
    expect(PRINT_SECTIONS[id].label).toBe("Inventory");
  });
});
