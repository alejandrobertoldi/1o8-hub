// Pure logic for populating an A+2 Premium Q&A module from SEO Manager output.
// No DB / IO here so it can be unit-tested in isolation.

// Module spec limits for the "qa" module (see src/lib/aplus2/module-specs.ts).
export const QA_QUESTION_MAX = 120;
export const QA_ANSWER_MAX = 250;

export type SeoQaSubsetPair = { id: string; question: string; answer: string };
export type QaItemData = { type: "qa"; question: string; answer: string };

/** Deduped, non-empty ASIN list to match against seo_asins.asin. */
export function candidateAsins(set: {
  scopeIdentifier: string;
  coveredAsins: string[] | null;
}): string[] {
  const all = [set.scopeIdentifier, ...(set.coveredAsins ?? [])]
    .map((a) => (a ?? "").trim())
    .filter((a) => a.length > 0);
  return Array.from(new Set(all));
}

/** Map an aplusQaSubset to module item data, truncating to the qa field limits. */
export function subsetToItems(subset: SeoQaSubsetPair[]): {
  items: QaItemData[];
  truncated: boolean;
} {
  let truncated = false;
  const items = subset.map((p) => {
    const rawQ = p.question ?? "";
    const rawA = p.answer ?? "";
    const question = rawQ.slice(0, QA_QUESTION_MAX);
    const answer = rawA.slice(0, QA_ANSWER_MAX);
    if (question.length < rawQ.length || answer.length < rawA.length) truncated = true;
    return { type: "qa" as const, question, answer };
  });
  return { items, truncated };
}

/**
 * Map the in-app S6.7 Premium A+ Q&A pairs (stored on seo_asins.generatedContent
 * as `_aplusQA: [{ q, a }]`) to the seo_qa.aplusQaSubset shape. Trims whitespace,
 * skips pairs missing a question or answer, and assigns stable 1-based ids.
 */
export function aplusQAToSubset(
  pairs: Array<{ q?: string | null; a?: string | null }> | null | undefined
): SeoQaSubsetPair[] {
  if (!Array.isArray(pairs)) return [];
  const out: SeoQaSubsetPair[] = [];
  for (const p of pairs) {
    const question = (p?.q ?? "").trim();
    const answer = (p?.a ?? "").trim();
    if (!question || !answer) continue;
    out.push({ id: String(out.length + 1), question, answer });
  }
  return out;
}

export type QaRow = { asin: string; asinId: string; subset: SeoQaSubsetPair[] };

/**
 * Choose the best seo_qa row for a set. Prefer the row whose ASIN matches the
 * set's scopeIdentifier, else the first row that has a non-empty subset.
 * Rows must already be reduced to the latest version per ASIN.
 */
export function pickQaRow(rows: QaRow[], scopeIdentifier: string): QaRow | null {
  const withSubset = rows.filter((r) => Array.isArray(r.subset) && r.subset.length > 0);
  if (withSubset.length === 0) return null;
  return withSubset.find((r) => r.asin === scopeIdentifier) ?? withSubset[0];
}
