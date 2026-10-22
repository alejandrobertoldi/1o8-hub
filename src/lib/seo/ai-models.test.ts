import { expect, it } from "vitest";
import { modelShortLabel, summarizeSeoModels, SEO_MODEL_STEPS } from "./ai-models";

it("short labels drop the parenthetical; unknown ids pass through", () => {
  expect(modelShortLabel("claude-opus-4-7")).toBe("Opus 4.7");
  expect(modelShortLabel("claude-haiku-4-5")).toBe("Haiku 4.5");
  expect(modelShortLabel("claude-x")).toBe("claude-x");
});
it("summary: one model, mixed, or AI off; disabled steps don't count", () => {
  const s = (label: string, enabled = true) => ({ step: "x", model: "m", label, enabled });
  expect(summarizeSeoModels([s("Opus 4.7"), s("Opus 4.7")])).toBe("Opus 4.7");
  expect(summarizeSeoModels([s("Opus 4.7"), s("Haiku 4.5")])).toBe("Mixed models");
  expect(summarizeSeoModels([s("Opus 4.7"), s("Haiku 4.5", false)])).toBe("Opus 4.7");
  expect(summarizeSeoModels([s("Opus 4.7", false)])).toBe("AI off");
});
it("covers the six AI-powered SEO steps", () => {
  expect(SEO_MODEL_STEPS.map((s) => s.key)).toEqual(["seo_keywords", "seo_reviews", "seo_rufus", "seo_cosmo", "seo_content", "seo_audit"]);
});
