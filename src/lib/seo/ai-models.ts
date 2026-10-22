// Which Claude model each SEO step uses (effective config: defaults + admin overrides),
// summarized for the SEO Manager header pill.
import { AVAILABLE_MODELS, type AiFeatureKey } from "@/lib/ai-config";

export const SEO_MODEL_STEPS: { key: AiFeatureKey; step: string }[] = [
  { key: "seo_keywords", step: "S2 Keywords" },
  { key: "seo_reviews", step: "S3 Reviews" },
  { key: "seo_rufus", step: "S4 Alexa for Shopping" },
  { key: "seo_cosmo", step: "S5 COSMO" },
  { key: "seo_content", step: "S6 Content" },
  { key: "seo_audit", step: "S6 Audit" },
];

/** "claude-opus-4-7" → "Opus 4.7" (label without its parenthetical); unknown ids pass through. */
export function modelShortLabel(id: string): string {
  const label = AVAILABLE_MODELS.find((m) => m.id === id)?.label;
  return label ? label.replace(/\s*\(.*\)\s*$/, "") : id;
}

export type SeoStepModel = { step: string; model: string; label: string; enabled: boolean };

/** One model for every enabled step → its label; otherwise "Mixed models". */
export function summarizeSeoModels(steps: SeoStepModel[]): string {
  const used = [...new Set(steps.filter((s) => s.enabled).map((s) => s.label))];
  if (used.length === 0) return "AI off";
  return used.length === 1 ? used[0] : "Mixed models";
}
