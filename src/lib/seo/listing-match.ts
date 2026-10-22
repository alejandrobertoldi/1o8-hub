/**
 * Which S2 keywords a listing version actually uses (spec §6). Pure.
 * A keyword counts when its phrase appears on word boundaries in a field;
 * single-word keywords count only at tier T1 (O4).
 */

export type ListingField = "T" | "B" | "D" | "K";
export interface ListingText { title: string; bullets: string; description: string; backend: string }
export interface TrackedKeyword { keyword: string; tier: string | null; fields: ListingField[] }

const ASIN_RE = /^b0[0-9a-z]{8}$/i;

export function normalizePhrase(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function join(row: Record<string, unknown>, prefix: string): string {
  return [1, 2, 3, 4, 5].map((i) => str(row[`${prefix}${i}`])).filter(Boolean).join(" ");
}

export function listingTextFromBqRow(row: Record<string, unknown>): ListingText {
  return {
    title: str(row.ItemName),
    bullets: join(row, "DetailedBulletPoint"),
    description: str(row.ProductDescription),
    backend: join(row, "GenericKeyword"),
  };
}

export function matchListingKeywords(s2: Array<{ text: string; tier: string | null }>, text: ListingText): TrackedKeyword[] {
  const padded: Array<[ListingField, string]> = [
    ["T", ` ${normalizePhrase(text.title)} `],
    ["B", ` ${normalizePhrase(text.bullets)} `],
    ["D", ` ${normalizePhrase(text.description)} `],
    ["K", ` ${normalizePhrase(text.backend)} `],
  ];
  const seen = new Set<string>();
  const out: TrackedKeyword[] = [];
  for (const k of s2) {
    const phrase = normalizePhrase(k.text);
    if (!phrase || ASIN_RE.test(phrase.replace(/ /g, ""))) continue;
    // O4 (Manu 2026-09-30): a single word is tracked only at T1 — generic one-word
    // T2-T4 terms ("alcohol", "spirits") matched nearly every listing and drowned the table.
    if (!phrase.includes(" ") && k.tier !== "T1") continue;
    // M1 fix: key by normalizePhrase (not normalizeTerm) so a hyphenated/punctuated
    // tracked keyword ("first-aid kit") shares its key with the unpunctuated
    // search term ("first aid kit") that buildAsinBlockRows aggregates by the
    // same normalizePhrase key. Section B / aggregateByTerm are unchanged.
    if (seen.has(phrase)) continue;
    const fields = padded.filter(([, t]) => t.includes(` ${phrase} `)).map(([f]) => f);
    if (fields.length === 0) continue;
    seen.add(phrase);
    out.push({ keyword: phrase, tier: k.tier, fields });
  }
  return out;
}
