/**
 * Deterministic Human Score (S6 bullets).
 *
 * The word/pattern rows of the scoring table are scored here, by code, on the
 * current text — same text ⇒ same score, no API call. The six judgment rows
 * (rule of three, synonym cycling, incoherence, contradicts description, -ing
 * padding, passive/subjectless) are AI-scored ONCE at generation (coherence.ts
 * Pass 4) and frozen on `_humanScore.detractors`; accepting a pathTo100 entry
 * clears the frozen detractors it fixes, un-accepting restores them.
 *
 * Pure module — imported by the seo route (server) and seo-phase.tsx (browser).
 */

export interface HumanScoreDetractor {
  pattern: string;
  source: string;
  field: string;
  example: string;
  impact: number;
}

export interface HumanScorePath {
  field: string;
  tip: string;
  rewrite: string;
  /** AI-judged patterns this rewrite fixes (absent on legacy data ⇒ clears every AI detractor on `field`). */
  patterns?: string[];
}

export interface AcceptedPath {
  index: number;
  /** The bullet text before the rewrite was applied — restored on un-accept. */
  original: string;
}

export type HumanScoreLabel = "Excellent" | "Good" | "Needs Work" | "AI-Detectable";

export interface HumanScore {
  asin: string;
  score: number;
  label: HumanScoreLabel;
  detractors: HumanScoreDetractor[];
  pathTo100: HumanScorePath[];
  descriptionChecked: boolean;
  accepted?: AcceptedPath[];
}

export const BULLET_FIELDS = [
  "DetailedBulletPoint_1", "DetailedBulletPoint_2", "DetailedBulletPoint_3", "DetailedBulletPoint_4", "DetailedBulletPoint_5",
] as const;

interface WordRule { pattern: string; source: string; impact: number; re: RegExp }

const SRC = "(Wikipedia Signs of AI writing)";
const WORD_RULES: WordRule[] = [
  { pattern: "Significance inflation", source: `§1 Undue significance ${SRC}`, impact: -6,
    re: /\b(?:testament|pivotal|vital role|marks? a shift|enduring|evolving landscape)\b/gi },
  { pattern: "Promotional fluff", source: `§4 Promotional language ${SRC}`, impact: -5,
    re: /\b(?:boasts?|boasting|vibrant|breathtaking|renowned|nestled|showcas(?:e|es|ed|ing))\b/gi },
  { pattern: "AI vocabulary", source: `§7 Overused AI words ${SRC}`, impact: -4,
    re: /\b(?:delv(?:e|es|ed|ing)|tapestry|intricate(?:ly)?|interplay|foster(?:s|ed|ing)?|garner(?:s|ed|ing)?|underscor(?:e|es|ed|ing)|align(?:s|ed|ing)? with|crucial)\b/gi },
  { pattern: "Copula avoidance", source: `§8 Copula avoidance ${SRC}`, impact: -5,
    re: /\b(?:serv(?:es|ing) as|stands as|represents)\b/gi },
  { pattern: "Filler phrases", source: `§23 Filler phrases ${SRC}`, impact: -5,
    re: /\b(?:in order to|due to the fact that|it is important to note|it's important to note)\b/gi },
  { pattern: "Excessive hedging", source: `§24 Excessive hedging ${SRC}`, impact: -6,
    re: /\b(?:(?:could|may|might) (?:potentially|possibly)|might have some)\b/gi },
  { pattern: "Generic positive conclusion", source: `§25 Generic conclusions ${SRC}`, impact: -7,
    re: /\b(?:future looks bright|exciting times ahead)\b/gi },
  { pattern: "Negative parallelism", source: `§9 Negative parallelisms ${SRC}`, impact: -6,
    re: /\b(?:not|isn't|aren't) (?:just|merely|only|simply)\b[^.!?]{0,100}?[,;—–]\s*(?:it's|it is|they're|they are|this is|but)\b/gi },
];

const EM_DASH = { pattern: "Em dash overuse", source: `§14 Em dash overuse ${SRC}`, impact: -3 };
const THIS_AFTER_HEADER = { pattern: '"This [product]" after header', source: "Brand voice rule", impact: -5 };
const HEADER_THIS = /^[A-Z0-9][A-Z0-9 &'/+,-]*:\s*This\b/;

const normalize = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

/** Code-scored detractors for every bullet field on a row, in field order. */
export function codeDetractors(row: Record<string, unknown>): HumanScoreDetractor[] {
  const out: HumanScoreDetractor[] = [];
  for (const field of BULLET_FIELDS) {
    const text = normalize(String(row[field] ?? ""));
    if (!text.trim()) continue;
    for (const r of WORD_RULES) {
      for (const m of text.matchAll(r.re)) {
        out.push({ pattern: r.pattern, source: r.source, field, example: m[0], impact: r.impact });
      }
    }
    const dashes = text.match(/—| – /g) ?? [];
    for (let i = 1; i < dashes.length; i++) {
      out.push({ ...EM_DASH, field, example: `${dashes.length} em dashes in one bullet` });
    }
    const hm = text.match(HEADER_THIS);
    if (hm) out.push({ ...THIS_AFTER_HEADER, field, example: hm[0] });
  }
  return out;
}

const AI_JUDGED = [/rule of three/i, /synonym|elegant variation/i, /incoheren/i, /contradict|ignores? description/i, /-?ing (?:phrase )?padding|superficial -?ing/i, /passive|subjectless/i];

/** True for the six judgment rows that only the generation pass can score. */
export function isAiJudgedPattern(pattern: string): boolean {
  return AI_JUDGED.some((re) => re.test(pattern));
}

export function labelFor(score: number): HumanScoreLabel {
  return score >= 90 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Needs Work" : "AI-Detectable";
}

/** pathTo100 indices disabled because another entry on the same field was accepted (legacy duplicates). */
export function supersededPaths(paths: Array<{ field: string }>, accepted: AcceptedPath[]): Set<number> {
  const acceptedIdx = new Set(accepted.map((a) => a.index));
  const fields = new Set(accepted.map((a) => paths[a.index]?.field).filter(Boolean));
  const out = new Set<number>();
  paths.forEach((p, i) => { if (!acceptedIdx.has(i) && fields.has(p.field)) out.add(i); });
  return out;
}

/**
 * Score = 100 − code detractors on the current text − frozen AI detractors not cleared by an
 * accepted path, clamped to 1..100. `stored` is the generation-time score (legacy or new):
 * any word-pattern detractors in it are discarded and recounted by code.
 */
export function computeHumanScore(row: Record<string, unknown>, stored: HumanScore): HumanScore {
  const accepted = stored.accepted ?? [];
  const cleared = accepted
    .map((a) => stored.pathTo100?.[a.index])
    .filter((p): p is HumanScorePath => !!p);
  const frozen = (stored.detractors ?? []).filter((d) => {
    if (!isAiJudgedPattern(d.pattern)) return false;
    return !cleared.some((p) => p.field === d.field && (!p.patterns?.length || p.patterns.some((x) => x.toLowerCase() === d.pattern.toLowerCase())));
  });
  const detractors = [...codeDetractors(row), ...frozen];
  const total = detractors.reduce((s, d) => s + Math.abs(d.impact), 0);
  const score = Math.max(1, Math.min(100, 100 - total));
  return { ...stored, asin: stored.asin, score, label: labelFor(score), detractors, pathTo100: stored.pathTo100 ?? [], accepted };
}

/**
 * Accept / un-accept pathTo100[index] on a row carrying `_humanScore`. Accept swaps the rewrite
 * into its field and records the original; un-accept restores the original — unless the bullet
 * was edited by hand since, in which case the edit is kept. Superseded entries are a no-op.
 */
export function toggleAcceptedPath<R extends Record<string, any>>(row: R, index: number): R {
  const hs: HumanScore | undefined = row._humanScore;
  const path = hs?.pathTo100?.[index];
  if (!hs || !path?.field) return row;
  const accepted = hs.accepted ?? [];
  const existing = accepted.find((a) => a.index === index);
  if (!existing && supersededPaths(hs.pathTo100, accepted).has(index)) return row;

  let text: string = String(row[path.field] ?? "");
  let nextAccepted: AcceptedPath[];
  if (existing) {
    if (text === path.rewrite) text = existing.original;
    nextAccepted = accepted.filter((a) => a.index !== index);
  } else {
    if (!path.rewrite) return row;
    nextAccepted = [...accepted, { index, original: text }];
    text = path.rewrite;
  }
  const next: Record<string, any> = { ...row, [path.field]: text, _humanScore: { ...hs, accepted: nextAccepted } };
  if (`${path.field}_CharLength` in row) next[`${path.field}_CharLength`] = text.length;
  if (`${path.field}_ByteLength` in row) next[`${path.field}_ByteLength`] = new TextEncoder().encode(text).length;
  return next as R;
}
