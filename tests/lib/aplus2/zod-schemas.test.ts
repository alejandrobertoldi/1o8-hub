import { describe, it, expect } from "vitest";
import { validateItemData, defaultItemDataFor } from "@/lib/aplus2/zod-schemas";

describe("highlight_bullet item-data (basic_single_image_highlights)", () => {
  it("accepts a valid bullet", () => {
    const r = validateItemData("basic_single_image_highlights", { type: "highlight_bullet", text: "Waterproof" });
    expect(r.ok).toBe(true);
  });
  it("rejects an over-length bullet (max 100)", () => {
    const r = validateItemData("basic_single_image_highlights", { type: "highlight_bullet", text: "x".repeat(101) });
    expect(r.ok).toBe(false);
  });
  it("rejects an unknown extra field (strictObject)", () => {
    const r = validateItemData("basic_single_image_highlights", { type: "highlight_bullet", text: "ok", bogus: "x" });
    expect(r.ok).toBe(false);
  });
  it("seeds an empty default of the right shape", () => {
    expect(defaultItemDataFor("basic_single_image_highlights")).toEqual({ type: "highlight_bullet", text: "" });
  });
});

describe("basic_comparison_row item-data (basic_comparison_table)", () => {
  it("accepts a valid row", () => {
    const r = validateItemData("basic_comparison_table", {
      type: "basic_comparison_row", metric: "Weight", metric_type: "text",
      value_1: "1kg", value_2: "2kg", value_3: "", value_4: "", value_5: "", value_6: "",
    });
    expect(r.ok).toBe(true);
  });
  it("rejects an over-length value cell (max 80)", () => {
    const r = validateItemData("basic_comparison_table", {
      type: "basic_comparison_row", metric: "Weight", metric_type: "text",
      value_1: "x".repeat(81), value_2: "", value_3: "", value_4: "", value_5: "", value_6: "",
    });
    expect(r.ok).toBe(false);
  });
  it("seeds an empty default with every value column", () => {
    expect(defaultItemDataFor("basic_comparison_table")).toEqual({
      type: "basic_comparison_row", metric: "", metric_type: "",
      value_1: "", value_2: "", value_3: "", value_4: "", value_5: "", value_6: "",
    });
  });
});

describe("reused item-data types still validate", () => {
  it("image_caption on basic_three_image_text", () => {
    const r = validateItemData("basic_three_image_text", { type: "image_caption", caption: "A", body: "B" });
    expect(r.ok).toBe(true);
  });
  it("tech_spec_row on basic_technical_specifications", () => {
    const r = validateItemData("basic_technical_specifications", { type: "tech_spec_row", spec_label: "Material", spec_value: "Steel" });
    expect(r.ok).toBe(true);
  });
});
