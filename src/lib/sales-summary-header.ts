/**
 * Pure helpers for the Hub /sales-summary client header: the assigned team
 * (names in aac.rawData → users rows for Google avatars) and per-client data
 * freshness. A single page-wide "latest data" date hid TRT/TRS sales stopping
 * on 2026-09-19 while other accounts were current — so each client gets its own.
 */

/**
 * aac.rawData team keys with their header labels. Order is the display order
 * Manu set (ES, AM, PM, PPC, SEO, Design, Catalog); the two secondary roles go
 * last so they only append to someone already listed, or trail the list.
 */
export const CLIENT_TEAM_ROLES: ReadonlyArray<readonly [key: string, label: string]> = [
  ["ExecutiveStrategist_MF", "Executive Strategist"],
  ["AccountManager_MF", "Account Manager"],
  ["ProjectManager_MF", "Project Manager"],
  ["PPCManager_MF", "PPC"],
  ["SEOManager_MF", "SEO"],
  ["DesignManager_MF", "Design"],
  ["CatalogManager_MF", "Catalog"],
  ["ProjectManagerAsana_MF", "PM Asana"],
  ["DesignUploadManager_MF", "Design Upload"],
  // 1o8-only roles (AAC 1o8 sheet columns), appended so MF ordering/levels are unchanged.
  ["EmailManager_1o8", "Email"],
  ["WebManager_1o8", "Web"],
  ["SocialMediaManager_108", "Social Media"],
];

/**
 * Luis heads PPC across every client, so he is not an aac.rawData field: he is
 * added to any client that has a PPC manager, at the Account Manager level of the
 * header org chart (the PPC manager stays on level 4 with the other specialists).
 */
export const PPC_DIRECTOR_NAME = "Luis Abugaber";
export const PPC_DIRECTOR_ROLE = "PPC Lead";

/** Client data is flagged when it trails the page's newest date by this many days. */
export const STALE_LAG_DAYS = 2;

export interface TeamUserRow {
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface ClientTeamMember {
  name: string;
  image: string | null;
  roles: string[];
}

export const normName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const norm = normName;

/**
 * The rebrand left 2-3 users rows per name (@1o8.agency, @marketfoundry.agency,
 * sometimes a client-side address). The MF account is the canonical staff
 * identity; fall back to @1o8, then any row with a photo.
 */
function pickUser(candidates: TeamUserRow[]): TeamUserRow | undefined {
  const byDomain = (d: string) => candidates.find((u) => u.email?.toLowerCase().endsWith(d));
  return byDomain("@marketfoundry.agency") ?? byDomain("@1o8.agency") ?? candidates.find((u) => u.image) ?? candidates[0];
}

export function resolveClientTeam(raw: Record<string, string>, users: TeamUserRow[]): ClientTeamMember[] {
  const usersByName = new Map<string, TeamUserRow[]>();
  for (const u of users) {
    if (!u.name) continue;
    const k = norm(u.name);
    usersByName.set(k, [...(usersByName.get(k) ?? []), u]);
  }

  const team = new Map<string, ClientTeamMember>();
  for (const [key, label] of CLIENT_TEAM_ROLES) {
    const value = raw[key]?.trim();
    if (!value) continue;
    const k = norm(value);
    const existing = team.get(k);
    if (existing) {
      existing.roles.push(label);
      continue;
    }
    const user = pickUser(usersByName.get(k) ?? []);
    team.set(k, { name: user?.name?.trim() || value, image: user?.image ?? null, roles: [label] });
  }

  if ([...team.values()].some((m) => m.roles.includes("PPC"))) {
    const k = norm(PPC_DIRECTOR_NAME);
    const existing = team.get(k);
    if (existing) existing.roles.push(PPC_DIRECTOR_ROLE);
    else {
      const user = pickUser(usersByName.get(k) ?? []);
      team.set(k, { name: PPC_DIRECTOR_NAME, image: user?.image ?? null, roles: [PPC_DIRECTOR_ROLE] });
    }
  }
  return [...team.values()];
}

const ORG_LEVEL_BY_ROLE: Record<string, 1 | 2 | 3> = {
  "Executive Strategist": 1,
  "Account Manager": 2,
  [PPC_DIRECTOR_ROLE]: 2,
  "Project Manager": 3,
};

/** Org-chart row for the header: ES=1, AM=2, PM=3, everyone else 4. Highest role wins. */
export function teamOrgLevel(member: ClientTeamMember): 1 | 2 | 3 | 4 {
  return member.roles.reduce<1 | 2 | 3 | 4>((lvl, r) => Math.min(lvl, ORG_LEVEL_BY_ROLE[r] ?? 4) as 1 | 2 | 3 | 4, 4);
}

/**
 * The PPC Lead (level 2) and the PPC manager he oversees (level 4), which the
 * header draws as one column joined by a vertical line. Null when either is absent
 * or the PPC manager also holds a higher role (they are then not on level 4).
 */
export function ppcDirectorLink(
  team: ClientTeamMember[],
): { director: ClientTeamMember; ppc: ClientTeamMember } | null {
  const director = team.find((m) => m.roles.includes(PPC_DIRECTOR_ROLE));
  const ppc = team.find((m) => m !== director && m.roles.includes("PPC") && teamOrgLevel(m) === 4);
  return director && ppc ? { director, ppc } : null;
}

/** Newest YYYY-MM-DD across a client's Intentwise accounts, or null if none has sales data. */
export function latestDateForAccounts(accountIds: string[], latestByAccount: Map<string, string>): string | null {
  let best: string | null = null;
  for (const id of accountIds) {
    const d = latestByAccount.get(id);
    if (d && (!best || d > best)) best = d;
  }
  return best;
}

const dayNumber = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

export function dataLagDays(clientDate: string, referenceDate: string): number {
  return Math.round(dayNumber(referenceDate) - dayNumber(clientDate));
}

export function isDataStale(clientDate: string | null, referenceDate: string | null): boolean {
  if (!referenceDate) return false;
  if (!clientDate) return true;
  return dataLagDays(clientDate, referenceDate) >= STALE_LAG_DAYS;
}

/** PM / AM for the SEO review gates (spec D4). Same name → user matching as the header. */
export function resolveClientApprovers(
  raw: Record<string, string>,
  users: TeamUserRow[],
): { pm: { name: string; email: string | null } | null; am: { name: string; email: string | null } | null; es: { name: string; email: string | null } | null } {
  const one = (key: string) => {
    const rawValue = raw[key];
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!value) return null;
    const k = norm(value);
    // Only staff accounts (@marketfoundry.agency or @1o8.agency) may be approvers
    const staffCandidates = users.filter(
      (u) => u.name && norm(u.name) === k && u.email && /(@marketfoundry\.agency|@1o8\.agency)$/i.test(u.email),
    );
    const user = pickUser(staffCandidates);
    return { name: user?.name?.trim() || value, email: user?.email ?? null };
  };
  return { pm: one("ProjectManager_MF"), am: one("AccountManager_MF"), es: one("ExecutiveStrategist_MF") };
}
