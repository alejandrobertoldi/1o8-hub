import { describe, expect, it } from "vitest";
import {
  ALT_TEXT_MAX,
  SUGGESTION_MAX,
  buildBrandStoryAltTextPrompt,
} from "./alt-text-prompt";

const base = {
  slotLabel: "Brand Focus Image",
  hasImage: true,
};

describe("buildBrandStoryAltTextPrompt", () => {
  it("omits current alt and guidance when they are empty", () => {
    const prompt = buildBrandStoryAltTextPrompt(base);
    expect(prompt).toContain("Image slot: Brand Focus Image");
    expect(prompt).not.toContain("Current alt text:");
    expect(prompt).not.toContain("Editor guidance");
    expect(prompt).not.toContain("TAKES PRIORITY");
  });

  it("includes current alt text and mandatory editor guidance", () => {
    const prompt = buildBrandStoryAltTextPrompt({
      ...base,
      currentAlt: "Ready Rescue logo on a blue field",
      suggestion: "mention the 5-year shelf life badge",
    });
    expect(prompt).toContain('Current alt text: "Ready Rescue logo on a blue field"');
    expect(prompt).toContain(
      'Editor guidance — you MUST incorporate these details or changes: "mention the 5-year shelf life badge"'
    );
    expect(prompt).toContain("TAKES PRIORITY over the current alt text");
    expect(prompt).toContain("Do not return the current alt unchanged");
  });

  it("clips oversized suggestion and current alt before they reach the prompt", () => {
    const prompt = buildBrandStoryAltTextPrompt({
      ...base,
      currentAlt: "x".repeat(ALT_TEXT_MAX + 40),
      suggestion: "y".repeat(SUGGESTION_MAX + 80),
    });
    expect(prompt).toContain(`Current alt text: "${"x".repeat(ALT_TEXT_MAX)}"`);
    expect(prompt).toContain(
      `Editor guidance — you MUST incorporate these details or changes: "${"y".repeat(SUGGESTION_MAX)}"`
    );
    expect(prompt).not.toContain("x".repeat(ALT_TEXT_MAX + 1));
    expect(prompt).not.toContain("y".repeat(SUGGESTION_MAX + 1));
  });

  it("uses the no-image framing when hasImage is false", () => {
    const prompt = buildBrandStoryAltTextPrompt({
      ...base,
      hasImage: false,
      headline: "Veterinary strength",
    });
    expect(prompt).toContain("No image is uploaded yet");
    expect(prompt).toContain('Headline on this module: "Veterinary strength"');
  });
});
