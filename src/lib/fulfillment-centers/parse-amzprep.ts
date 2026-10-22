/**
 * Parser for AMZ Prep's "Amazon FBA Locations 2025 — Master List" workbook
 * (tabs "USA Locations" + "Canada Locations"). Pure: rows in, records out.
 *
 * The sheet is hand-maintained and dirty, so the rules are:
 * - region (state/province) comes from the ADDRESS, not the sheet's state
 *   column — that column is wrong in ~11 rows (e.g. DPX7 "Alabama" is Chandler, AZ).
 *   The column is only a fallback when the address has no parseable region.
 * - country follows the parsed region, so Canadian rows filed in the US tab land as CA.
 * - codes must look like Amazon facility codes; TBD / header / numeric junk is rejected.
 * - one record per code: exact repeats collapse, conflicting repeats keep the first.
 */

export type FcCountry = "US" | "CA";

export type FulfillmentCenterRecord = {
  code: string;
  country: FcCountry;
  region: string;
  city: string | null;
  postalCode: string | null;
  address: string | null;
  facilityType: string | null;
};

export type ParseIssue = { code: string; sheetRow: number; tab: string; reason: string };

export type ParseResult = {
  records: FulfillmentCenterRecord[];
  rejected: ParseIssue[];
  /** Sheet state column disagreed with the address; the address won. */
  corrected: ParseIssue[];
  /** Same code seen twice with different data; the first was kept. */
  conflicts: ParseIssue[];
  /** Region came from the sheet column because the address had none. */
  regionFromColumn: ParseIssue[];
};

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const CA_PROVINCES: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick",
  NL: "Newfoundland and Labrador", NS: "Nova Scotia", NT: "Northwest Territories",
  NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec",
  SK: "Saskatchewan", YT: "Yukon",
};

/** Sheet-column aliases that aren't a region name ("Edmonton" is a city in AB). */
const COLUMN_ALIASES: Record<string, string> = { edmonton: "AB", dc: "DC" };

const NAME_TO_ABBR = new Map<string, string>(
  [...Object.entries(US_STATES), ...Object.entries(CA_PROVINCES)].map(([a, n]) => [n.toLowerCase(), a]),
);

function countryOf(region: string): FcCountry | null {
  if (region in US_STATES) return "US";
  if (region in CA_PROVINCES) return "CA";
  return null;
}

function regionFromName(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (COLUMN_ALIASES[s]) return COLUMN_ALIASES[s];
  if (NAME_TO_ABBR.has(s)) return NAME_TO_ABBR.get(s)!;
  const up = s.toUpperCase();
  return countryOf(up) ? up : null;
}

const CODE_RE = /^[A-Z][A-Z0-9]{2,7}$/;
const US_ZIP_RE = /\b(\d{5})(?:-?\d{4})?\b/;
const CA_POSTAL_RE = /\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d?)\b/i;
/** "... Thornton CO 80023" — an uppercase state abbreviation followed by a postal code, mid-segment. */
const INLINE_REGION_RE = /\b([A-Z]{2})\s+(?=\d{5}|[A-Z]\d[A-Z])/g;
/** Longest names first so "West Virginia" wins over "Virginia". */
const NAMES_BY_LENGTH = [...NAME_TO_ABBR.keys()].sort((a, b) => b.length - a.length);

/**
 * Hand-verified fixes for rows whose address has no state AND whose sheet column is
 * wrong. CLE1: "North Randall, 44128" is Ohio; the sheet files it under Minnesota.
 */
const KNOWN_REGION_FIXES: Record<string, string> = { CLE1: "OH" };

function postalFor(region: string, text: string): string | null {
  if (countryOf(region) === "US") return text.match(US_ZIP_RE)?.[1] ?? null;
  const m = text.match(CA_POSTAL_RE);
  return m ? `${m[1]} ${m[2]}`.toUpperCase() : null;
}

function regionInSegment(seg: string): { region: string; rest: string; inline: boolean } | null {
  const abbr = seg.match(/^([A-Za-z]{2})\b(.*)$/);
  if (abbr && countryOf(abbr[1].toUpperCase())) return { region: abbr[1].toUpperCase(), rest: abbr[2], inline: false };
  const lower = seg.toLowerCase();
  for (const name of NAMES_BY_LENGTH) {
    // Only a postal code (or nothing) may follow the name: "Washington County" is not WA.
    if (lower.startsWith(name) && /^\s*(?:$|\d|[a-z]\d[a-z])/.test(lower.slice(name.length))) {
      return { region: NAME_TO_ABBR.get(name)!, rest: seg.slice(name.length), inline: false };
    }
  }
  for (const m of seg.matchAll(INLINE_REGION_RE)) {
    if (countryOf(m[1])) return { region: m[1], rest: seg.slice(m.index! + 2), inline: true };
  }
  return null;
}

export function parseAddress(
  address: string,
): { region: string; city: string | null; postalCode: string | null } | null {
  const segments = address.split(",").map((s) => s.split(/\s[–—-]\s/)[0].trim()).filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const hit = regionInSegment(segments[i]);
    if (!hit) continue;
    const prev = i > 0 ? segments[i - 1] : null;
    const city = !hit.inline && prev && !/^\d/.test(prev) ? prev : null;
    return { region: hit.region, city, postalCode: postalFor(hit.region, hit.rest) };
  }
  return null;
}

function cell(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export type SheetTab = { tab: string; rows: unknown[][] };

export function parseAmzPrepSheets(tabs: SheetTab[]): ParseResult {
  const out: ParseResult = { records: [], rejected: [], corrected: [], conflicts: [], regionFromColumn: [] };
  const byCode = new Map<string, FulfillmentCenterRecord>();

  for (const { tab, rows } of tabs) {
    const headerIdx = rows.findIndex((r) => cell(r?.[1]).toLowerCase() === "code");
    rows.forEach((r, idx) => {
      if (idx <= headerIdx) return;
      const sheetRow = idx + 1;
      let regionCol = cell(r?.[0]);
      let rawCode = cell(r?.[1]);
      const rawType = cell(r?.[2]);
      const address = cell(r?.[3]) || null;
      if (!rawCode && !regionCol) return;

      // Swapped columns: code in the state cell and a state name in the code cell.
      if (regionFromName(rawCode) && CODE_RE.test(regionCol.toUpperCase())) {
        [regionCol, rawCode] = [rawCode, regionCol];
      }

      const code = rawCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (code === "CODE") return; // repeated header row
      if (!CODE_RE.test(code) || code === "TBD") {
        out.rejected.push({ code: rawCode, sheetRow, tab, reason: "not a facility code" });
        return;
      }

      const parsed = address ? parseAddress(address) : null;
      const colRegion = regionFromName(regionCol);
      const region = parsed?.region ?? KNOWN_REGION_FIXES[code] ?? colRegion;
      if (!region) {
        out.rejected.push({ code, sheetRow, tab, reason: "no region in address or state column" });
        return;
      }
      if (!parsed && KNOWN_REGION_FIXES[code]) {
        out.corrected.push({ code, sheetRow, tab, reason: `column "${regionCol}" → known fix ${region}` });
      } else if (!parsed) {
        out.regionFromColumn.push({ code, sheetRow, tab, reason: `column "${regionCol}" → ${region}` });
      } else if (colRegion && colRegion !== region) {
        out.corrected.push({ code, sheetRow, tab, reason: `column "${regionCol}" (${colRegion}) → address ${region}` });
      }

      const rec: FulfillmentCenterRecord = {
        code,
        country: countryOf(region)!,
        region,
        city: parsed?.city ?? null,
        postalCode: parsed?.postalCode ?? (address ? postalFor(region, address) : null),
        address,
        facilityType: rawType || null,
      };

      const prior = byCode.get(code);
      if (!prior) {
        byCode.set(code, rec);
        return;
      }
      const squash = (s: string | null) => (s ?? "").toLowerCase().replace(/\W/g, "");
      if (prior.region !== rec.region || squash(prior.address) !== squash(rec.address)) {
        out.conflicts.push({ code, sheetRow, tab, reason: `kept ${prior.region} "${prior.address}", dropped ${rec.region} "${rec.address}"` });
      }
      if (!prior.facilityType && rec.facilityType) prior.facilityType = rec.facilityType;
    });
  }

  out.records = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  return out;
}
