/**
 * Pure parser for the "1o8_Performance_Team" tab of the "All 1o8 Clients
 * (Final)" sheet (no DB access; unit-tested). Every listed person is an active
 * team member — the sheet has no status column.
 *
 * VPN codes in the sheet are deliberately NOT parsed: they are access
 * credentials, not directory data.
 */
import type { TeamDepartment } from "./departments";

export const WEEKDAYS = [
  ["MON", "mon"],
  ["TUE", "tue"],
  ["WED", "wed"],
  ["THU", "thu"],
  ["FRI", "fri"],
  ["SAT", "sat"],
  ["SUN", "sun"],
] as const;

export type SheetTeamMember = {
  sheetRow: number;
  name: string;
  company: string | null;
  title: string | null;
  expertise: string | null;
  employmentType: string | null;
  location: string | null;
  phone: string | null;
  timeZone: string | null;
  workDays: string[];
  workStartLocal: string | null;
  workEndLocal: string | null;
  workStartChicago: string | null;
  workEndChicago: string | null;
  departments: TeamDepartment[];
};

/** Sheet "Expertise" → 1o8 department. Owners/CEO sit in the Leadership band (by title), not a department. */
const EXPERTISE_DEPARTMENTS: [RegExp, TeamDepartment][] = [
  [/account management/i, "account_management"],
  [/project management/i, "project_management"],
  [/creative|design|copy/i, "creative"],
  [/email/i, "email"],
  [/paid media|ppc|media buy/i, "paid_media"],
  [/web|website|dev/i, "web"],
  [/\bseo\b/i, "seo"],
  [/social/i, "social_media"],
  [/finance|accounting/i, "finance"],
  [/\bhr\b|human resources|people/i, "hr"],
];

export function departmentsFor(expertise: string | null, title: string | null): TeamDepartment[] {
  const hay = `${expertise ?? ""} ${title ?? ""}`;
  const out: TeamDepartment[] = [];
  for (const [re, dept] of EXPERTISE_DEPARTMENTS) {
    if (re.test(hay) && !out.includes(dept)) out.push(dept);
  }
  // Expertise wins when it is set; the title only fills gaps (e.g. "Copy Writer" with blank expertise).
  if (expertise && out.length > 1) {
    const fromExpertise = EXPERTISE_DEPARTMENTS.filter(([re]) => re.test(expertise)).map(([, d]) => d);
    if (fromExpertise.length) return [...new Set(fromExpertise)];
  }
  return out;
}

const clean = (v: string | undefined): string | null => {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
};

/** "ph. 630-742-0182" → "630-742-0182". */
export function cleanPhone(v: string | undefined): string | null {
  const s = clean(v)?.replace(/^ph\.?\s*/i, "");
  return s && /\d{6,}/.test(s.replace(/\D/g, "")) ? s : null;
}

/** "09:00 AM" stays; the sheet's "12:00 AM"→"12:00 AM" placeholder (no schedule) becomes null. */
function cleanTime(v: string | undefined): string | null {
  const s = clean(v);
  return s && /^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(s) ? s.toUpperCase().replace(/\s?(AM|PM)$/, " $1") : null;
}

export function parseTeamSheet(grid: string[][]): { members: SheetTeamMember[]; warnings: string[] } {
  const warnings: string[] = [];
  const headerIdx = grid.findIndex((r) => r.some((c) => c.trim() === "Team Member"));
  if (headerIdx < 0) throw new Error('Header row not found (expected a "Team Member" column)');
  const header = grid[headerIdx].map((h) => h.trim());
  // First occurrence only: "Time Zone" repeats in the helper lookup table at the far right.
  const col = (name: string) => header.indexOf(name);
  for (const required of ["Team Member", "Title"]) {
    if (col(required) < 0) throw new Error(`Missing required column "${required}"`);
  }
  const get = (row: string[], name: string) => (col(name) < 0 ? undefined : row[col(name)]);

  const members: SheetTeamMember[] = [];
  const seen = new Set<string>();
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const name = clean(get(row, "Team Member"));
    // Stop words / notes typed into the name column ("Add start dates").
    if (!name || !/\s/.test(name) || /^add\b/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) {
      warnings.push(`Row ${r + 1}: duplicate team member "${name}" skipped`);
      continue;
    }
    seen.add(key);

    const title = clean(get(row, "Title"));
    const expertise = clean(get(row, "Expertise"));
    const workDays = WEEKDAYS.filter(([h]) => clean(get(row, h))?.toUpperCase() === "TRUE").map(([, k]) => k);
    let workStartLocal = cleanTime(get(row, "Local Time Start"));
    let workEndLocal = cleanTime(get(row, "Local Time End"));
    if (workStartLocal && workStartLocal === workEndLocal) {
      warnings.push(`Row ${r + 1} (${name}): local hours ${workStartLocal}–${workEndLocal} look like a placeholder — left blank`);
      workStartLocal = workEndLocal = null;
    }
    if (!title) warnings.push(`Row ${r + 1} (${name}): no title`);

    members.push({
      sheetRow: r + 1,
      name,
      company: clean(get(row, "Company")),
      title,
      expertise,
      employmentType: clean(get(row, "Type")),
      location: clean(get(row, "Location")),
      phone: cleanPhone(get(row, "Phone Number")),
      timeZone: clean(get(row, "Time Zone")),
      workDays,
      workStartLocal,
      workEndLocal,
      workStartChicago: cleanTime(get(row, "Chicago Time Start")),
      workEndChicago: cleanTime(get(row, "Chicago Time End")),
      departments: departmentsFor(expertise, title),
    });
  }
  return { members, warnings };
}

/** Placeholder work email until real addresses are known: "Andrés Máximo Máximo" → "andres.maximo@1o8.agency". */
export function placeholderEmail(name: string): string {
  const parts = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .trim()
    .split(/\s+/);
  return `${parts[0]}.${parts[parts.length - 1]}@1o8.agency`;
}

/**
 * Department lead from titles, used only when a department has no lead yet
 * (an admin's choice in the hub always wins). Director/Lead beat Manager.
 */
export function leadRank(title: string | null): number {
  const t = (title ?? "").toLowerCase();
  if (/\b(director|head|lead)\b/.test(t)) return 2;
  if (/\bmanager\b/.test(t) && !/\baccount manager\b/.test(t)) return 1;
  return 0;
}
