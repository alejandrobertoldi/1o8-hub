/**
 * Pure helpers for the Readiness board (no DB; unit-tested).
 *
 * Asana display names don't always match the team directory ("Barb
 * McDonald", "Markie", "JMann", "Rye Hipolito", "med saad ben othman"), so a
 * person is matched by email first, then by name with a few nickname rules.
 */

export const READINESS_DEPARTMENTS = ["AM", "Creative", "Email", "Paid", "Web", "Ops"] as const;
export type ReadinessDepartment = (typeof READINESS_DEPARTMENTS)[number];

/** Team-directory department → Readiness department (sheet labels). Order = priority. */
const DEPARTMENT_MAP: [string, ReadinessDepartment][] = [
  ["account_management", "AM"],
  ["project_management", "AM"],
  ["paid_media", "Paid"],
  ["email", "Email"],
  ["web", "Web"],
  ["seo", "Web"],
  ["creative", "Creative"],
  ["social_media", "Creative"],
  ["finance", "Ops"],
  ["hr", "Ops"],
];

export function readinessDepartmentFor(departments: string[]): ReadinessDepartment | null {
  for (const [dept, label] of DEPARTMENT_MAP) if (departments.includes(dept)) return label;
  return null;
}

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z@.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "JMann" → ["j", "mann"]; "Barb McDonald" → ["barb", "mcdonald"]. */
function nameTokens(name: string): string[] {
  const camel = name.trim().match(/^([A-Z])([A-Z][a-z]+)$/);
  if (camel) return [camel[1].toLowerCase(), camel[2].toLowerCase()];
  return norm(name).split(" ").filter(Boolean);
}

export type MatchablePerson = { id: string; name: string | null; email: string; asanaEmail: string | null };

/**
 * Finds the team member behind an Asana assignee. Email (work or Asana email)
 * wins; then exact name; then first-name-prefix + same last name ("Barb" →
 * "Barbara", "Rye" → "Ryshel", "J" → "Jason"); then a single token equal to a
 * unique last name ("Markie").
 */
export function matchAssignee(
  assignee: { name: string | null; email: string | null },
  people: MatchablePerson[],
): MatchablePerson | null {
  const email = assignee.email?.trim().toLowerCase();
  if (email) {
    const byEmail = people.find((p) => p.email.toLowerCase() === email || p.asanaEmail?.toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  if (!assignee.name) return null;
  const exact = people.find((p) => p.name && norm(p.name) === norm(assignee.name!));
  if (exact) return exact;

  const a = nameTokens(assignee.name);
  if (a.length >= 2) {
    const [aFirst, aLast] = [a[0], a[a.length - 1]];
    const hits = people.filter((p) => {
      if (!p.name) return false;
      const t = nameTokens(p.name);
      const [pFirst, pLast] = [t[0], t[t.length - 1]];
      // Nicknames share the first letters ("Rye"/"Ryshel", "Barb"/"Barbara"); the last name must match and the hit be unique.
      const n = Math.min(aFirst.length, 2);
      const firstOk = pFirst.startsWith(aFirst.slice(0, n)) || aFirst.startsWith(pFirst.slice(0, 2));
      return pLast === aLast && firstOk;
    });
    if (hits.length === 1) return hits[0];
  }
  if (a.length === 1) {
    const hits = people.filter((p) => p.name && nameTokens(p.name).slice(-1)[0] === a[0]);
    if (hits.length === 1) return hits[0];
  }
  return null;
}

export type MatchableProvider = { id: string; name: string; emails: string[] };

/** Contracted service provider behind an Asana assignee: any of its emails, else its exact name. */
export function matchProvider(
  assignee: { name: string | null; email: string | null },
  providers: MatchableProvider[],
): MatchableProvider | null {
  const email = assignee.email?.trim().toLowerCase();
  if (email) {
    const byEmail = providers.find((p) => p.emails.some((e) => e.trim().toLowerCase() === email));
    if (byEmail) return byEmail;
  }
  if (!assignee.name) return null;
  return providers.find((p) => norm(p.name) === norm(assignee.name!)) ?? null;
}

export const assigneeKey = (a: { name: string | null; email: string | null }) =>
  (a.email?.trim().toLowerCase() || (a.name ? `name:${norm(a.name)}` : "unassigned")).slice(0, 255);

/** Readiness = share of open tasks that are NOT overdue (sheet: 1 − overdue / open). */
export function readinessPct(open: number, overdue: number): number {
  return open > 0 ? Math.round((1 - overdue / open) * 10000) / 100 : 100;
}

/** Today's date (YYYY-MM-DD) in Chicago, 1o8's home time zone. */
export function chicagoToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
