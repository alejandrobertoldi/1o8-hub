// src/lib/seo/prompts/canonical-rufus-questions.ts
// v5 §4.3.1.3 — IMMUTABLE. Do not edit text. Do not reorder.

export type CanonicalRufusQuestion = {
  id: string;
  text: string;
  intent_tier: "discovery" | "consideration" | "decision";
};

export const CANONICAL_RUFUS_QUESTIONS: readonly CanonicalRufusQuestion[] = [
  { id: "RQ1", text: "What is this product for?", intent_tier: "discovery" },
  { id: "RQ2", text: "Who is this product designed for?", intent_tier: "discovery" },
  { id: "RQ3", text: "What problem does this product solve?", intent_tier: "consideration" },
  { id: "RQ4", text: "What makes this product different from alternatives?", intent_tier: "consideration" },
  { id: "RQ5", text: "Why should I buy this product over the competition?", intent_tier: "decision" },
] as const;

export const CANONICAL_RUFUS_IDS = CANONICAL_RUFUS_QUESTIONS.map((q) => q.id);
