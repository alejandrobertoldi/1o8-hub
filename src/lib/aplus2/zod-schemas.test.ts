import { describe, expect, it } from "vitest";
import {
  validateModulePatch,
  validateItemData,
  defaultItemDataFor,
} from "./zod-schemas";

describe("validateModulePatch", () => {
  it("accepts a background_image_text patch within limits", () => {
    const r = validateModulePatch("background_image_text", {
      subheadlineText: "x".repeat(40),
      headlineText: "h".repeat(60),
      bodyText: "b".repeat(300),
      status: "draft",
      textPosition: "left",
      fontColor: "dark",
    });
    expect(r.ok).toBe(true);
  });
  it("rejects subheadline over 40 chars", () => {
    const r = validateModulePatch("background_image_text", { subheadlineText: "x".repeat(41) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/subheadline/i);
  });
  it("rejects font_color for modules that don't declare it", () => {
    expect(validateModulePatch("text", { fontColor: "light" }).ok).toBe(false);
  });
  it("accepts the 5 module status values", () => {
    for (const s of ["draft", "in_review", "approved", "uploaded", "live"] as const) {
      expect(validateModulePatch("text", { status: s }).ok).toBe(true);
    }
  });
  it("rejects an unknown status", () => {
    expect(validateModulePatch("text", { status: "bogus" as never }).ok).toBe(false);
  });
  it("accepts video fields on full_video", () => {
    expect(validateModulePatch("full_video", { videoTitle: "t", videoDescription: "d" }).ok).toBe(true);
  });
  it("rejects videoTitle on text module (no video spec)", () => {
    expect(validateModulePatch("text", { videoTitle: "t" }).ok).toBe(false);
  });
  it("accepts altText on full_video (image slot, not declared as text field)", () => {
    expect(validateModulePatch("full_video", { altText: "dogs and a water bottle", mobileAltText: "dogs and a water bottle" }).ok).toBe(true);
  });
  it("rejects altText on a module with no image slot", () => {
    expect(validateModulePatch("text", { altText: "x" }).ok).toBe(false);
  });
});

describe("validateItemData", () => {
  it("accepts a Q&A item shape on qa modules", () => {
    expect(validateItemData("qa", { type: "qa", question: "Q", answer: "A" }).ok).toBe(true);
  });
  it("rejects a Q&A shape on a tech_spec module", () => {
    expect(validateItemData("technical_specifications", { type: "qa", question: "Q", answer: "A" }).ok).toBe(false);
  });
  it("accepts a tech_spec_row shape on technical_specifications", () => {
    expect(validateItemData("technical_specifications", { type: "tech_spec_row", spec_label: "L", spec_value: "V" }).ok).toBe(true);
  });
  it("enforces char limits on Q&A items", () => {
    expect(validateItemData("qa", { type: "qa", question: "x".repeat(121), answer: "A" }).ok).toBe(false);
  });
});

describe("defaultItemDataFor", () => {
  it("returns a Q&A skeleton for qa modules", () => {
    expect(defaultItemDataFor("qa")).toEqual({ type: "qa", question: "", answer: "" });
  });
  it("returns null for modules without repeatable groups", () => {
    expect(defaultItemDataFor("text")).toBeNull();
    expect(defaultItemDataFor("single_image_text")).toBeNull();
  });
});
