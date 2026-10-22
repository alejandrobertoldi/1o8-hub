/**
 * Shared constants for the Hub.
 */

/** All client codes used across the app (toolbar filters, export, etc.) */
export const CLIENT_CODES = [
  "1o8M",
  "BNU_SC_US",
  "BRA_SC_US",
  "C23_SC_US",
  "C23_WF_US",
  "CHE_SC_US",
  "CHE_VC_US",
  "DLR_SC_US",
  "DRC_SC_US",
  "DRE_SC_US",
  "DRW_SC_US",
  "FRE_SC_US",
  "GAF_SC_US",
  "GLO_SC_US",
  "GOO_SC_US",
  "HOT_SC_CA",
  "HOT_SC_US",
  "PKN_SC_US",
  "POO_SC_US",
  "PRO_SC_US",
  "PUR_SC_US",
  "PUR_WM_US",
  "TAH_SC_US",
  "TRS_SC_US",
  "TRT_SC_US",
  "WHI_SC_US",
] as const;

export type ClientCode = (typeof CLIENT_CODES)[number];

/** Human-readable client names keyed by client code (from AAC table) */
export const CLIENT_NAMES: Record<string, string> = {
  "1o8M": "1o8",
  BNU_SC_US: "BNutty",
  BRA_SC_US: "Brad's",
  C23_SC_US: "Cloud23",
  C23_WF_US: "Cloud23 Whole Foods",
  CHE_SC_US: "Cheribundi (SC)",
  CHE_VC_US: "Cheribundi (VC)",
  DLR_SC_US: "DLR",
  DRC_SC_US: "Dr. Cuddles",
  DRE_SC_US: "Dreamiere",
  DRW_SC_US: "Dr. Wolff USA",
  FRE_SC_US: "Fresh Vintage Farms",
  GAF_SC_US: "Gaffer",
  GLO_SC_US: "Glo Health Foods",
  GOO_SC_US: "GoodBelly",
  HOT_SC_CA: "Hotshot CA",
  HOT_SC_US: "Hotshot US",
  PKN_SC_US: "This PKN",
  ZIN_SC_US: "Zingora",
  POO_SC_US: "Poochie Butter",
  PRO_SC_US: "Proper Good",
  PUR_SC_US: "Pura",
  PUR_WM_US: "Pura Walmart",
  TAH_SC_US: "Tahoe Trail Bar",
  TRS_SC_US: "Trejo's Spirits",
  TRT_SC_US: "Trejo's Tacos",
  WHI_SC_US: "Whitney Jordan",
};

/** Requirement levels assigned per-client in column_attributes */
export type RequirementLevel =
  | "Required"
  | "Conditionally Required"
  | "Key"
  | "Recommended"
  | "Optional"
  | "Not Required"
  | "";

/** Display colors for requirement badges (Tailwind classes) */
export const REQUIREMENT_COLORS: Record<RequirementLevel, string> = {
  Required: "bg-red-500/15 text-red-400 border-red-500/30",
  "Conditionally Required": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Key: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  Recommended: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Optional: "bg-muted text-muted-foreground border-border",
  "Not Required": "bg-muted/50 text-muted-foreground/70 border-border",
  "": "",
};

/** Short labels for compact display */
export const REQUIREMENT_SHORT_LABELS: Record<RequirementLevel, string> = {
  Required: "Req",
  "Conditionally Required": "Cond",
  Key: "Key",
  Recommended: "Rec",
  Optional: "Opt",
  "Not Required": "N/R",
  "": "",
};

/** Sort order for requirement levels (lower = higher priority) */
export const REQUIREMENT_ORDER: Record<RequirementLevel, number> = {
  Required: 0,
  "Conditionally Required": 1,
  Key: 1.5,
  Recommended: 2,
  Optional: 3,
  "Not Required": 4,
  "": 5,
};

// ── Listing Identity Field Descriptions (Column H from nuevatabla12may) ─────────────────────────

export const LISTING_IDENTITY_DESCRIPTIONS: Record<string, string> = {
  "Product Status": "Product's current lifecycle status in the Hub system (Active, Inactive, Incomplete, Out of Stock, Closed, Discontinued)",
  UUID: "Universally unique identifier assigned to this row for internal tracking. Generated from ASIN + SKU + ClientIDCode",
  ASIN: "Amazon Standard Identification Number - 10-character unique identifier for products on Amazon",
  SKU: "Stock Keeping Unit - seller's internal identifier for the product",
  "Summarized Title": "Concatenated variation details (Variation Name | Flavor | Size) for quick product identification",
  "Amazon PDP URL": "Direct link to the product detail page on Amazon, auto-generated from ASIN",
  "Website Product URL": "Link to the product on client's website",
  "Client ID Code": "Unique identifier for the client account (e.g., BNU_SC_US, PRO_SC_US)",
  "Client Name": "Human-readable client name mapped from Client ID Code",
  "Brand Name": "Brand identifier sourced from Amazon Clients (AAC) data",
  "Brand URL": "Official brand website URL sourced from Amazon Clients (AAC) data",
  Marketplace: "Amazon marketplace location (e.g., US, UK, DE) validated against category_meta",
  Country: "Country marketplace code from category_meta validation",
};

// ── Product Identity Field Descriptions (Column H from nuevatabla12may) ───────────────────

export const PRODUCT_IDENTITY_DESCRIPTIONS: Record<string, string> = {
  "Product Id Type": "Select the type of external ID (barcode) type or ASIN that is being used to identify this product (GTIN, UPC, EAN, ISBN, ASIN, GCID)",
  "Product Id": "The external product identifier such as UPC, EAN, ISBN, or ASIN. Must be valid for the selected ID type",
  "Product Type": "The Amazon product type node that defines the category structure for this product in the Amazon catalog",
  "Item Type Keyword": "The leaf node in the Amazon product taxonomy that categorizes the product specifically",
  "Product Category": "High-level category classification for the product in Amazon's catalog hierarchy",
  "Product Subcategory": "Sub-category level classification within the main product category",
};

// ── Variations Field Descriptions (Column H from nuevatabla12may) ─────────────────────────

export const VARIATIONS_DESCRIPTIONS: Record<string, string> = {
  "Variation ID": "Unique identifier for the variation theme within the product family. Auto-generated from variation attributes",
  "Variation Name": "Descriptive name of the variation theme (e.g., 'Size', 'Color', 'Flavor') as defined in Amazon taxonomy",
  "Parentage Level": "Indicates whether this product is a parent (bundle) or child (individual SKU) in the variation hierarchy",
  "Child Rel. Type": "Defines the relationship type for child products - 'mixed' if family has varied attributes, 'variant' if uniform",
  "Parent SKU": "Stock Keeping Unit of the parent/bundle product that groups all child variations under one ASIN",
  "Parent ASIN": "Amazon Standard Identification Number of the parent product linking all child variations together",
  "Variation Theme Name": "Amazon's variation theme identifier that determines which attributes can vary (e.g., 'Color', 'Size', 'Flavor')",
  Flavor: "Product flavor variant attribute (e.g., 'Vanilla', 'Chocolate', 'Strawberry'). Required for flavor-based variations",
  Style: "Product style or design variant attribute (e.g., 'Matte', 'Glossy', 'Pattern'). Required for style-based variations",
  Color: "Product color variant attribute (e.g., 'Red', 'Blue', 'Black'). Required for color-based variations",
  Size: "Product size variant attribute (e.g., 'Small', 'Medium', 'Large'). Required for size-based variations",
};

// ── Product status constants ──────────────────────────────────────────

export const ALL_STATUSES = [
  "Active",
  "Inactive",
  "Out of Stock",
  "Closed",
  "Incomplete",
  "Discontinued",
  "Replacement ASIN",
] as const;

export const STATUS_CHIP_STYLES: Record<string, string> = {
  Active: "border bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30",
  Inactive: "border bg-stone-200 text-stone-600 border-stone-300 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-800",
  "Out of Stock": "border bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30",
  Closed: "border bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30",
  Incomplete: "border bg-stone-100 text-stone-500 border-stone-300 dark:bg-zinc-900/50 dark:text-zinc-500 dark:border-zinc-800",
  Discontinued: "border bg-red-50 text-red-600 border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30",
  "Replacement ASIN": "border bg-yellow-50 text-yellow-800 border-yellow-300 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/30",
};

export const STATUS_CHIP_EMPTY: Record<string, string> = {
  Active: "border bg-emerald-500/5 text-emerald-500/40 border-emerald-500/15",
  Inactive: "border bg-zinc-500/5 text-zinc-500/40 border-zinc-500/15",
  "Out of Stock": "border bg-amber-500/5 text-amber-500/40 border-amber-500/15",
  Closed: "border bg-blue-500/5 text-blue-500/40 border-blue-500/15",
  Incomplete: "border bg-stone-500/5 text-stone-500/40 border-stone-500/15",
  Discontinued: "border bg-red-500/5 text-red-500/40 border-red-500/15",
  "Replacement ASIN": "border bg-yellow-500/5 text-yellow-500/40 border-yellow-500/15",
};

// ── Team role mappings ────────────────────────────────────────────────

// 1o8 account-team roles, one per AAC sheet column. Keys keep the MF raw_data
// names where an equivalent exists (scripts/local/seed-local.ts aliases them);
// the three 1o8-only roles use the sheet's own column names.
export const TEAM_ROLES: Record<string, string> = {
  ExecutiveStrategist_MF: "Executive Strategist",
  AccountManager_MF: "Account Manager",
  ProjectManager_MF: "Project Manager",
  EmailManager_1o8: "Email Manager",
  WebManager_1o8: "Web Manager",
  DesignManager_MF: "Creative Manager",
  SEOManager_MF: "SEO Manager",
  PPCManager_MF: "Paid Media Manager",
  SocialMediaManager_108: "Social Media Manager",
};

// ── Time off ────────────────────────────────────────────────────────

/**
 * Approvers of team time-off requests (spec D2, revised 2026-08-07 — Manu
 * added as a second permanent approver alongside Jake; still permanent, still
 * no delegation and no timeout escalation). Deliberately the single place
 * these emails appear, so changing the approver set is a one-line edit.
 *
 * Stored lowercase: `isApprover` normalises both sides before comparing, and
 * the request notification fans out to every entry.
 */
export const TIME_OFF_APPROVER_EMAILS = [
  "jake@marketfoundry.agency",
  "manu@marketfoundry.agency",
] as const;

/** Final monthly-report send approver (CEO). After AM sign-off, CEO reviews then sends. */
export const MONTHLY_REPORT_FINAL_REVIEWER_EMAIL = "jake@marketfoundry.agency";

/**
 * The holiday calendars the time-off system recognises (spec D6).
 *
 * This is the HOLIDAY-CALENDAR key, not a residence field — residence lives in
 * `users.residence_timezone` as an IANA zone string (design D-B/D-G). A
 * calendar is a POLICY assignment: a Manila-based person working US hours is
 * legitimately assigned 'US'.
 *
 * Six entries, one per country 1o8 staff actually live in (Manu's
 * 2026-08-04 call). The alternative was collapsing PT/PH/FI onto a neighbour's
 * calendar, which would have mis-counted three people's leave from row one and
 * never self-corrected, because `working_days` is a frozen integer snapshot
 * computed at submission and never recomputed.
 *
 * Adding a code here is not sufficient on its own: every code MUST have rows
 * seeded in `public_holidays`, or `getHolidayDates` returns an empty set and
 * the D-C 422 gate does not fire (it only catches a NULL calendar). Seed
 * first, then assign — that is why the rollout order is load-bearing.
 */
// 1o8 holiday calendars: one per country the team works from. MF's PK, ES, PT
// and FI were removed (migration 0137). Admins can hide a calendar from the
// general calendar (holiday_calendar_settings, 0138) without affecting the
// time-off maths of the people assigned to it.
export const VALID_COUNTRY_CODES = ["US", "MX", "BO", "BR", "PE", "PH", "TN"] as const;
export type CountryCode = (typeof VALID_COUNTRY_CODES)[number];

/**
 * Short display labels for holiday chips / UI (not ISO alpha-3 — Spain is
 * SPA rather than ESP, matching how the team refers to these calendars).
 */
export const COUNTRY_DISPLAY_CODES: Record<CountryCode, string> = {
  US: "USA",
  MX: "MEX",
  BO: "BOL",
  BR: "BRA",
  PE: "PER",
  PH: "PHL",
  TN: "TUN",
};

/** Full English names for residence / address country pickers. */
export const COUNTRY_FULL_NAMES: Record<CountryCode, string> = {
  US: "United States",
  MX: "Mexico",
  BO: "Bolivia",
  BR: "Brazil",
  PE: "Peru",
  PH: "Philippines",
  TN: "Tunisia",
};

export function isCountryCode(value: unknown): value is CountryCode {
  return (
    typeof value === "string" &&
    (VALID_COUNTRY_CODES as readonly string[]).includes(value)
  );
}

/** Alpha-2 calendar key → 3-letter display code (e.g. "US" → "USA"). */
export function countryCodeToDisplayCode(code: string): string {
  if (isCountryCode(code)) return COUNTRY_DISPLAY_CODES[code];
  return code.toUpperCase().slice(0, 3);
}

/** Alpha-2 calendar key → full English name (e.g. "ES" → "Spain"). */
export function countryCodeToFullName(code: string): string {
  if (isCountryCode(code)) return COUNTRY_FULL_NAMES[code];
  return code;
}

/**
 * ISO 3166-1 alpha-2 → regional-indicator flag emoji (e.g. "US" → 🇺🇸).
 * Returns "" for anything that isn't two Latin letters so callers can fall
 * back without rendering a broken glyph.
 */
export function countryCodeToFlagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    0x1f1e6 + (upper.charCodeAt(0) - 65),
    0x1f1e6 + (upper.charCodeAt(1) - 65)
  );
}

/**
 * Shared select options for holiday calendar + country of residence.
 * Native <option> cannot host SVG — emoji flag + full English name.
 */
export function countrySelectOptions(): { value: CountryCode; label: string }[] {
  return VALID_COUNTRY_CODES.map((code) => ({
    value: code,
    label: `${countryCodeToFlagEmoji(code)} ${COUNTRY_FULL_NAMES[code]}`,
  }));
}

// ── Internal teams ──────────────────────────────────────────────────

/**
 * The internal team a person belongs to, stored in `users.client_id_code`.
 *
 * There is deliberately NO separate `team` or `department` column (spec D7):
 * clientIdCode already doubles as this field for internal staff, and adding a
 * second one would create two sources of truth for the same fact.
 *
 * The VALUES are legacy 1o8-era keys that exist in production rows — renaming
 * them is a data migration, not a constant edit. Only the labels are
 * brand-current. Lifted out of src/app/admin/users/page.tsx so the permission
 * matrix and the /team directory share one definition.
 */
export const INTERNAL_TEAMS = [
  {
    value: "1o8-agency",
    label: "1o8 Agency",
    activeClass: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  },
  {
    value: "1o8-marketplace",
    label: "1o8 Agency",
    activeClass: "border-brand/40 bg-brand/10 text-brand",
  },
  {
    value: "external",
    label: "External",
    activeClass: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
  },
] as const;

export type InternalTeamValue = (typeof INTERNAL_TEAMS)[number]["value"];

/** The display label for a clientIdCode, or null when it is not an internal team. */
export function internalTeamLabel(code: string | null): string | null {
  return INTERNAL_TEAMS.find((t) => t.value === code)?.label ?? null;
}
