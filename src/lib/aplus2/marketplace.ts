// Resolve master.country / master.marketplace into the canonical 2-letter
// ISO country code stored in aplus2_sets.marketplace.

const TWO_LETTER_RE = /^[A-Z]{2}$/;

/** Accepts the 2-letter uppercase form (the canonical aplus2 marketplace). */
export function isValidMarketplaceCode(code: string): boolean {
  return TWO_LETTER_RE.test(code);
}

export interface MarketplaceSource {
  country: string | null;
  marketplace: string | null;
}

export function normalizeMarketplace(src: MarketplaceSource): string | null {
  const c = (src.country ?? "").trim().toUpperCase();
  if (TWO_LETTER_RE.test(c)) return c;
  const m = (src.marketplace ?? "").trim().toUpperCase();
  if (!m) return null;
  // Amazon.com is the US storefront. The naive trailing-two-letter parse
  // would yield "OM" from ".COM".
  if (m === "AMAZON.COM" || m === "AMAZONCOM") return "US";
  // Take the trailing 2-letter run after an "AMAZON" brand stem;
  // e.g. "AMAZONDE" → "DE", "AMAZON.COM.MX" → "MX".
  // Bare "AMAZON" with no suffix returns null.
  const match = m.match(/^AMAZON.*([A-Z]{2})$/);
  return match ? match[1] : null;
}
