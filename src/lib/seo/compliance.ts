/* eslint-disable react-doctor/js-set-map-lookups */
// src/lib/seo/compliance.ts
// v5 §6 prohibited-word scan + brand overlay + per-field bypass.

import { findProhibitedHits } from "@/lib/seo/prompts/amazon-prohibited-words";

export type ComplianceViolation = {
  field: string;
  word: string;
  type: "amazon_prohibited" | "brand_words_to_avoid";
  auto_corrected_to?: string;
  bypassed: boolean;
};

export function scanCompliance(input: {
  field: string;
  text: string;
  brandWordsToAvoid: string[];
  brandAllowList?: string[]; // ignored on Amazon §6 conflict — kept for future use
}): ComplianceViolation[] {
  const out: ComplianceViolation[] = [];
  for (const hit of findProhibitedHits(input.text)) {
    const lw = hit.word.toLowerCase();
    if (out.some((v) => v.word.toLowerCase() === lw && v.field === input.field)) continue;
    out.push({
      field: input.field,
      word: hit.word,
      type: "amazon_prohibited",
      auto_corrected_to: hit.replacement ?? undefined,
      bypassed: false,
    });
  }
  const lowerText = input.text.toLowerCase();
  for (const w of input.brandWordsToAvoid) {
    const lw = w.toLowerCase();
    // word-boundary scan
    let i = lowerText.indexOf(lw);
    while (i !== -1) {
      const before = i === 0 || /\W/.test(lowerText[i - 1]);
      const after = i + lw.length === lowerText.length || /\W/.test(lowerText[i + lw.length]);
      if (before && after) {
        // Skip if Amazon §6 already flagged this exact word
        if (out.some((v) => v.word.toLowerCase() === lw && v.field === input.field)) break;
        out.push({
          field: input.field,
          word: w,
          type: "brand_words_to_avoid",
          auto_corrected_to: undefined,
          bypassed: false,
        });
        break;
      }
      i = lowerText.indexOf(lw, i + lw.length);
    }
  }
  return out;
}

export function mergeBypass(
  fresh: ComplianceViolation[],
  prior: ComplianceViolation[]
): ComplianceViolation[] {
  return fresh.map((v) => {
    const match = prior.find(
      (p) => p.field === v.field && p.word.toLowerCase() === v.word.toLowerCase()
    );
    return match?.bypassed ? { ...v, bypassed: true } : v;
  });
}
