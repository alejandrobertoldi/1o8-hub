/**
 * SOW / term status for a client, from the AAC sheet's free-text columns
 * ("Last Day of Term", "SOW Status", "SOW"). Pure; shared by the client page,
 * the clients home and My Dashboard alerts.
 */

/** Days before the last day of term when a SOW counts as "expiring soon". */
export const SOW_WARNING_DAYS = 30;

export type SowState = "active" | "expiring" | "expired" | "rolling" | "open" | "none";

export type SowStatus = {
  state: SowState;
  label: string;
  /** Last day of term (YYYY-MM-DD) when one could be read. */
  endDate: string | null;
  /** Days until the end date (negative = days since it ended). */
  daysLeft: number | null;
  /** The sheet's own "SOW Status", when it disagrees with the date. */
  sheetMismatch: string | null;
  tone: "green" | "orange" | "red" | "gray";
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Reads a date out of the sheet's text: "April 30, 2026", "October 31 2026",
 * "October 31" (current year), "3/31/2027", "2027-03-31". Null if there's none.
 */
export function parseTermDate(text: string, today: string): string | null {
  const t = text.trim().toLowerCase();
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (us) {
    const y = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${y}-${pad(Number(us[1]))}-${pad(Number(us[2]))}`;
  }
  const named = t.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/);
  if (named) {
    const y = named[3] ?? today.slice(0, 4);
    return `${y}-${pad(MONTHS.indexOf(named[1]) + 1)}-${pad(Number(named[2]))}`;
  }
  return null;
}

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function sowStatus(raw: Record<string, unknown>, today: string): SowStatus {
  const lastDay = String(raw["Last Day of Term"] ?? "").trim();
  const sheet = String(raw["SOW Status"] ?? "").trim();
  const sow = String(raw["SOW"] ?? "").trim();
  const base = { endDate: null, daysLeft: null, sheetMismatch: null };

  if (/no scope/i.test(`${lastDay} ${sheet} ${sow}`) && !parseTermDate(lastDay, today)) {
    return { ...base, state: "none", label: "No scope", tone: "gray" };
  }
  const endDate = parseTermDate(lastDay, today);
  if (endDate) {
    const daysLeft = daysBetween(today, endDate);
    const state: SowState = daysLeft < 0 ? "expired" : daysLeft <= SOW_WARNING_DAYS ? "expiring" : "active";
    const sheetSays = /expir(ed|y)/i.test(sheet) && !/soon/i.test(sheet) ? "expired" : /soon|expring|expiring/i.test(sheet) ? "expiring" : /active/i.test(sheet) ? "active" : null;
    return {
      endDate,
      daysLeft,
      // Flag only real contradictions (e.g. the sheet says Active but the term has ended).
      sheetMismatch: sheetSays && sheetSays !== state && !(sheetSays === "active" && state === "expiring") ? sheet : null,
      state,
      label:
        state === "expired"
          ? -daysLeft > 60
            ? `Expired ${fmt(endDate)}`
            : `Expired ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago`
          : state === "expiring"
            ? daysLeft === 0
              ? "Expires today"
              : `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
            : `Active until ${fmt(endDate)}`,
      tone: state === "expired" ? "red" : state === "expiring" ? "orange" : "green",
    };
  }
  if (/month.to.month|ongoing|notice/i.test(lastDay)) return { ...base, state: "rolling", label: "Month to month", tone: "green" };
  if (/tbd|one.time|launch/i.test(lastDay)) return { ...base, state: "open", label: "No end date", tone: "gray" };
  if (/expired/i.test(sheet)) return { ...base, state: "expired", label: "Expired", tone: "red" };
  if (/active/i.test(sheet)) return { ...base, state: "open", label: "Active · no end date", tone: "gray" };
  return { ...base, state: "none", label: "No SOW info", tone: "gray" };
}

export const SOW_TONE_CLASSES: Record<SowStatus["tone"], string> = {
  green: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  orange: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  red: "bg-red-500/15 text-red-500 border-red-500/30",
  gray: "bg-muted text-muted-foreground border-border",
};

/** Services checked on the AAC row ("Service: X" keys), de-duplicated. */
export function clientServices(raw: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(raw)) if (k.startsWith("Service: ") && String(v ?? "").trim()) out.add(k.slice(9));
  return [...out].sort();
}

/** Every service column of the AAC sheet, for the editor. */
export const AAC_SERVICES = [
  "SEO", "Google", "Meta", "Instacart", "LinkedIn", "Other", "Strategy", "Paid Media", "Blogs", "Organic Social",
  "Website Design", "Email", "Audit", "Dashboard", "Photo/Video", "Website", "Impact Tag", "Website Maintenance",
  "Brand Strategy", "Brand", "Email Marketing", "Email Setup", "CRO", "Affiliate", "Amazon (1O8)",
  "Influencer Marketing", "BwP", "Flex Bank of Hours", "Consulting",
] as const;
