import { describe, it, expect } from "vitest";
import {
  APLUS2_MODULE_TYPES,
  APLUS2_MODULE_SPECS,
  moduleTypesForTier,
  maxModulesForTier,
  isQaModule,
  qaQuestionOptions,
  defaultQaQuestionCount,
} from "@/lib/aplus2/module-specs";

const PREMIUM_TYPES = [
  "background_image_text", "comparison_table_1", "comparison_table_2",
  "comparison_table_3", "dual_images_text", "four_images_text", "full_image",
  "full_video", "hotspots_1", "hotspots_2", "navigation_carousel", "qa",
  "regimen_carousel", "simple_image_carousel", "single_image_text",
  "technical_specifications", "text", "video_image_carousel", "video_text",
] as const;

describe("module-specs tier field", () => {
  it("tags all 19 existing specs as PA+", () => {
    for (const t of PREMIUM_TYPES) {
      expect(APLUS2_MODULE_SPECS[t].tier, t).toBe("PA+");
    }
  });

  it("every spec has a tier of PA+ or BA+", () => {
    for (const t of APLUS2_MODULE_TYPES) {
      expect(["PA+", "BA+"]).toContain(APLUS2_MODULE_SPECS[t].tier);
    }
  });
});

describe("moduleTypesForTier", () => {
  it("returns exactly the 19 premium types for PA+", () => {
    expect(moduleTypesForTier("PA+").sort()).toEqual([...PREMIUM_TYPES].sort());
  });
});

describe("maxModulesForTier", () => {
  it("BA+ allows 5, PA+ allows 7, unknown defaults to 7", () => {
    expect(maxModulesForTier("BA+")).toBe(5);
    expect(maxModulesForTier("PA+")).toBe(7);
    expect(maxModulesForTier("unknown")).toBe(7);
  });
});

const BASIC_TYPES = [
  "basic_text", "basic_header_image_text", "basic_single_image_text",
  "basic_three_image_text", "basic_four_image_text",
  "basic_single_image_highlights", "basic_technical_specifications",
  "basic_comparison_table",
] as const;

describe("basic (BA+) module specs", () => {
  it("registers all 8 basic types in the type union", () => {
    for (const t of BASIC_TYPES) expect(APLUS2_MODULE_TYPES).toContain(t);
  });

  it("every basic spec is tier BA+ and carries no video block", () => {
    for (const t of BASIC_TYPES) {
      const spec = APLUS2_MODULE_SPECS[t];
      expect(spec, t).toBeDefined();
      expect(spec.tier, t).toBe("BA+");
      expect(spec.video, t).toBeUndefined();
    }
  });

  it("moduleTypesForTier('BA+') returns exactly the 8 basic types", () => {
    expect(moduleTypesForTier("BA+").sort()).toEqual([...BASIC_TYPES].sort());
  });

  it("image/repeatable shapes match the spec", () => {
    expect(APLUS2_MODULE_SPECS.basic_text.imageSlots).toHaveLength(0);
    expect(APLUS2_MODULE_SPECS.basic_three_image_text.imageSlots).toHaveLength(3);
    expect(APLUS2_MODULE_SPECS.basic_four_image_text.imageSlots).toHaveLength(4);
    expect(APLUS2_MODULE_SPECS.basic_comparison_table.imageSlots).toHaveLength(6);
    expect(APLUS2_MODULE_SPECS.basic_single_image_text.layoutControls?.[0].key).toBe("text_position");
    expect(APLUS2_MODULE_SPECS.basic_single_image_highlights.repeatableGroup?.itemDataType).toBe("highlight_bullet");
    expect(APLUS2_MODULE_SPECS.basic_comparison_table.repeatableGroup?.itemDataType).toBe("basic_comparison_row");
    expect(APLUS2_MODULE_SPECS.basic_technical_specifications.repeatableGroup?.itemDataType).toBe("tech_spec_row");
    expect(APLUS2_MODULE_SPECS.basic_header_image_text.imageSlots[0].desktopSize).toEqual({ width: 970, height: 600 });
  });
});

describe("qa question count helpers", () => {
  it("identifies only the Premium Q&A module", () => {
    expect(isQaModule("qa")).toBe(true);
    expect(isQaModule("text")).toBe(false);
    expect(isQaModule("simple_image_carousel")).toBe(false);
  });

  it("offers 3 to 5 questions for new Q&A modules", () => {
    expect(qaQuestionOptions()).toEqual([3, 4, 5]);
    expect(defaultQaQuestionCount()).toBe(3);
  });
});
