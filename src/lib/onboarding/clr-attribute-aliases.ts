/**
 * CLR → bqName alias bridge — runtime-data-driven version.
 *
 * The hardcoded `ALIASES` array was removed in 2026-05-01 (attributes
 * table unification). Aliases are now loaded from the `attributes` table
 * via `loadClrAliases()` (see ./clr-aliases-loader.ts) and passed in as
 * the second argument. This module remains pure / synchronous so unit
 * tests can use fixture aliases without touching the DB.
 */

export interface Alias {
  /** Canonical bqName (matches CORE_COLUMNS or attributes.generalLabel). */
  bqName: string;
  patterns: RegExp[];
  multi?: "first" | "concat";
}

const MP_CAPTURE_RE = /\[marketplace_id=([^\]]+)\]/;

const MARKETPLACE_ID_TO_LABEL: Record<string, string> = {
  ATVPDKIKX0DER: "US",
  A2EUQ1WTGCTBG2: "CA",
  A1AM78C64UM0Y8: "MX",
  A2Q3Y263D00KWC: "BR",
  A1F83G8C2ARO7P: "UK",
  A1PA6795UKMFR9: "DE",
  APJ6JRA9NG5V4: "IT",
  A13V1IB3VIYZZH: "FR",
  A1RKKUPIHCS9HS: "ES",
  A1805IZSGTT6HS: "NL",
  A2NODRKZP88ZB9: "SE",
  A1C3SOZRARQ6R3: "PL",
  A33AVAJ2PDY3EV: "TR",
  A2VIGQ35RCS4UG: "AE",
  A21TJRUUN4KGV: "IN",
  A19VAU5U5O7RUS: "SG",
  A39IBJ37TRP1C6: "AU",
  A1VC38T7YXB528: "JP",
};

const BQ_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

export function clrAttributesToBqRow(
  attrs: Record<string, string>,
  aliases: Alias[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const consumed = new Set<string>();

  for (const alias of aliases) {
    const matches: Array<{ key: string; value: string }> = [];
    for (const [key, rawValue] of Object.entries(attrs)) {
      const value = trim(rawValue);
      if (value === null) continue;
      if (alias.patterns.some((p) => p.test(key))) {
        matches.push({ key, value });
        consumed.add(key);
      }
    }
    if (matches.length === 0) continue;
    if (alias.multi === "concat") {
      matches.sort((a, b) => extractIndex(a.key) - extractIndex(b.key));
      out[alias.bqName] = matches.map((m) => m.value).join(", ");
    } else {
      out[alias.bqName] = matches[0].value;
    }
  }

  for (const [key, rawValue] of Object.entries(attrs)) {
    if (consumed.has(key)) continue;
    if (!BQ_NAME_RE.test(key)) continue;
    if (out[key] !== undefined) continue;
    const value = trim(rawValue);
    if (value === null) continue;
    out[key] = value;
  }

  if (out.Marketplace === undefined) {
    const marketplace = extractMarketplace(attrs);
    if (marketplace) out.Marketplace = marketplace;
  }
  return out;
}

export function extractMarketplace(attrs: Record<string, string>): string | null {
  const tally = new Map<string, number>();
  for (const key of Object.keys(attrs)) {
    const m = key.match(MP_CAPTURE_RE);
    if (m) tally.set(m[1], (tally.get(m[1]) ?? 0) + 1);
  }
  if (tally.size === 0) return null;
  let bestId = "";
  let bestCount = -1;
  for (const [id, count] of tally) {
    if (count > bestCount) { bestCount = count; bestId = id; }
  }
  return MARKETPLACE_ID_TO_LABEL[bestId] ?? bestId;
}

function extractIndex(key: string): number {
  const m = key.match(/#(\d+)\./);
  return m ? parseInt(m[1], 10) : 0;
}

function trim(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
