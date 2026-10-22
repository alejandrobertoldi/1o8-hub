/**
 * Functional department a person sits in — distinct from `users.clientIdCode`,
 * which is still the agency / marketplace / external team (INTERNAL_TEAMS).
 *
 * Spec D7 originally forbade a department column because clientIdCode already
 * doubled as "which internal team". That is a different fact: a person can be
 * 1o8 Agency AND Design. This enum is the org-chart axis.
 *
 * Keep the values in lockstep with `team_department` in schema.ts.
 */

/**
 * Every value the `team_department` Postgres enum holds. Postgres enums are
 * additive-only, so MarketFoundry's Amazon-era values stay here even though
 * 1o8 doesn't use them (migration 0134 appended the 1o8 values).
 */
export const ALL_TEAM_DEPARTMENTS = [
  "finance",
  "admin",
  "account_management",
  "project_management",
  "design",
  "seo",
  "ppc",
  "catalog",
  "data",
  // 1o8 Agency (0134)
  "hr",
  "creative",
  "email",
  "paid_media",
  "web",
  "social_media",
] as const satisfies readonly [string, ...string[]];

/**
 * The departments 1o8 Agency actually has, in org-chart order. Drives the
 * picker options, PATCH validation, org-chart columns and company-scale chart.
 */
export const TEAM_DEPARTMENTS = [
  "account_management",
  "project_management",
  "creative",
  "email",
  "paid_media",
  "web",
  "seo",
  "social_media",
  "finance",
  "hr",
] as const satisfies readonly (typeof ALL_TEAM_DEPARTMENTS)[number][];

export type TeamDepartment = (typeof ALL_TEAM_DEPARTMENTS)[number];

export const TEAM_DEPARTMENT_LABELS: Record<TeamDepartment, string> = {
  finance: "Finance",
  admin: "Admin",
  account_management: "Account Management",
  project_management: "Project Management",
  design: "Design",
  seo: "SEO",
  ppc: "PPC",
  catalog: "Catalog",
  data: "Data / AI",
  hr: "HR",
  creative: "Creative",
  email: "Email Marketing",
  paid_media: "Paid Media",
  web: "Web Development",
  social_media: "Social Media",
};

/** Hub categorical fills — one slot per department, not brand emphasis. */
export const TEAM_DEPARTMENT_COLORS: Record<TeamDepartment | "unassigned", string> = {
  finance: "#18864B",
  admin: "#2C2B35",
  account_management: "#006BBB",
  project_management: "#653CBD",
  design: "#F7BF1D",
  seo: "#5B6EF5",
  ppc: "#C73737",
  catalog: "#A66600",
  data: "#05893E",
  hr: "#B94F87",
  creative: "#F7BF1D",
  email: "#2F8ADC",
  paid_media: "#C73737",
  web: "#05893E",
  social_media: "#8663E6",
  unassigned: "#94A3B8",
};

export const TEAM_DEPARTMENT_OPTIONS = TEAM_DEPARTMENTS.map((value) => ({
  value,
  label: TEAM_DEPARTMENT_LABELS[value],
}));

export function isTeamDepartment(value: unknown): value is TeamDepartment {
  return (
    typeof value === "string" &&
    (TEAM_DEPARTMENTS as readonly string[]).includes(value)
  );
}

export const MAX_JOB_TITLES = 6;
export const MAX_JOB_TITLE_LENGTH = 120;

/**
 * Coerce a PATCH payload into a clean titles list, or name the problem.
 * Empty strings are dropped; order is preserved; duplicates (case-insensitive)
 * keep the first occurrence.
 */
export function normalizeJobTitles(
  value: unknown
): { ok: string[] } | { error: string } {
  if (!Array.isArray(value)) {
    return { error: "jobTitles must be an array of strings" };
  }
  if (value.length > MAX_JOB_TITLES) {
    return { error: `jobTitles may have at most ${MAX_JOB_TITLES} entries` };
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return { error: "jobTitles must be an array of strings" };
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_JOB_TITLE_LENGTH) {
      return {
        error: `each job title must be at most ${MAX_JOB_TITLE_LENGTH} characters`,
      };
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return { ok: out };
}

/** Coerce a PATCH payload into a clean, deduped department-id list. */
export function normalizeDepartments(
  value: unknown
): { ok: TeamDepartment[] } | { error: string } {
  if (!Array.isArray(value)) {
    return { error: "departments must be an array of department ids" };
  }
  const seen = new Set<string>();
  const out: TeamDepartment[] = [];
  for (const item of value) {
    if (!isTeamDepartment(item)) {
      return {
        error: `departments must all be one of ${TEAM_DEPARTMENTS.join(", ")}`,
      };
    }
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return { ok: out };
}

/** Prefer the array; fall back to the legacy single `job_title` column. */
export function displayJobTitles(
  jobTitle: string | null | undefined,
  jobTitles: string[] | null | undefined
): string[] {
  if (Array.isArray(jobTitles) && jobTitles.length > 0) {
    return jobTitles.filter((t) => typeof t === "string" && t.trim() !== "");
  }
  const single = jobTitle?.trim();
  return single ? [single] : [];
}

export type CompanyScaleRow = {
  id: TeamDepartment | "unassigned";
  label: string;
  count: number;
  color: string;
};

export type CompanyScale = {
  total: number;
  rows: CompanyScaleRow[];
};

export type OrgLevel = "president" | "am" | "pm" | "member";

/**
 * Rank from job titles. Order is load-bearing: President beats AM beats PM.
 * "PPC Manager" / "Catalog Manager" / "SEO Manager" stay members — they are
 * not account or project managers.
 */
export function orgLevelFromTitles(
  jobTitle: string | null | undefined,
  jobTitles: string[] | null | undefined
): OrgLevel {
  const blob = displayJobTitles(jobTitle, jobTitles).join(" ").toLowerCase();
  // 1o8 has no "President": its top band is the owners and the CEO.
  if (/\b(president|owner|ceo)\b/.test(blob)) return "president";
  if (/\baccount\s+managers?\b/.test(blob)) return "am";
  if (/\bproject\s+managers?\b/.test(blob)) return "pm";
  return "member";
}

export type OrgMember = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  jobTitle: string | null;
  jobTitles: string[];
  // Departments this person is a MEMBER of (0118 array). Empty = unassigned.
  departments: string[];
  // Departments this person LEADS (0118 junction, aggregated). May be empty.
  leadsDepartments: string[];
};

export type OrgDepartmentColumn = {
  id: TeamDepartment | "unassigned";
  label: string;
  color: string;
  lead: OrgMember | null;
  members: OrgMember[];
  candidates: OrgMember[];
};

export type OrgTree = {
  president: OrgMember[];
  ams: OrgMember[];
  pms: OrgMember[];
  departments: OrgDepartmentColumn[];
};

function byName(a: OrgMember, b: OrgMember): number {
  return (a.name ?? a.email).localeCompare(b.name ?? b.email);
}

/**
 * These two are org LEVELS, not department COLUMNS: the org tree already renders
 * them as the "Account managers" / "Project managers" bands above the department
 * grid, so giving them a column too would double-list the same people. They stay
 * in TEAM_DEPARTMENTS (the enum, labels, colors, and the company-scale chart all
 * still use them) — we just skip them when building `departments` columns here.
 */
const ORG_LEVEL_DEPARTMENTS = new Set<TeamDepartment>([
  "account_management",
  "project_management",
]);

/** True for the two departments that are org LEVELS, not department columns. */
export function isOrgLevelDepartment(value: unknown): boolean {
  return isTeamDepartment(value) && ORG_LEVEL_DEPARTMENTS.has(value as TeamDepartment);
}

/**
 * Rank a member's org level from BOTH title and department assignment. Manu
 * assigns AM/PM band membership via the Departments multi-select, independent
 * of job title — so a person with a non-manager title but `account_management`
 * or `project_management` in `departments` still belongs in that band.
 * President (title-only) beats everything; AM beats PM when someone carries
 * both org-level departments.
 */
export function orgLevel(m: {
  jobTitle: string | null;
  jobTitles: string[];
  departments: string[];
}): OrgLevel {
  const titleLevel = orgLevelFromTitles(m.jobTitle, m.jobTitles);
  if (titleLevel === "president") return "president";
  const depts = m.departments ?? [];
  if (titleLevel === "am" || depts.includes("account_management")) return "am";
  if (titleLevel === "pm" || depts.includes("project_management")) return "pm";
  return "member";
}

// Back-office departments render at the RIGHT end of the department row, in this
// order — admin, then finance rightmost — and ALWAYS render as columns even with
// zero members (unlike delivery departments, which are skipped when empty).
// (Manu 2026-09-21)
const RIGHT_SIDE_DEPARTMENTS: TeamDepartment[] = ["finance", "hr"];

export function buildOrgTree(members: OrgMember[]): OrgTree {
  const president: OrgMember[] = [];
  const ams: OrgMember[] = [];
  const pms: OrgMember[] = [];
  const rest: OrgMember[] = [];
  for (const m of members) {
    switch (orgLevel(m)) {
      case "president":
        president.push(m);
        break;
      case "am":
        ams.push(m);
        break;
      case "pm":
        pms.push(m);
        break;
      default:
        rest.push(m);
    }
  }
  president.sort(byName);
  ams.sort(byName);
  pms.sort(byName);
  rest.sort(byName);

  const departments: OrgDepartmentColumn[] = [];
  // Explicit order, not enum order: delivery departments first, back-office
  // (finance, admin) pushed to the right end of the row (Manu 2026-09-21).
  const orderedIds: TeamDepartment[] = [
    ...TEAM_DEPARTMENTS.filter(
      (id) => !ORG_LEVEL_DEPARTMENTS.has(id) && !RIGHT_SIDE_DEPARTMENTS.includes(id)
    ),
    ...RIGHT_SIDE_DEPARTMENTS,
  ];
  for (const id of orderedIds) {
    const candidates = members.filter((m) => m.departments.includes(id)).sort(byName);
    // Delivery departments are skipped when empty; the back-office (right-side)
    // columns always render so admin/finance have a place even with 0 members.
    if (candidates.length === 0 && !RIGHT_SIDE_DEPARTMENTS.includes(id)) continue;
    departments.push({
      id,
      label: TEAM_DEPARTMENT_LABELS[id],
      color: TEAM_DEPARTMENT_COLORS[id],
      // Search the WHOLE roster, not just this department's members: the lead
      // can now be assigned from outside (e.g. an AM leading Design).
      lead: members.find((m) => m.leadsDepartments.includes(id)) ?? null,
      // Draw from the WHOLE roster (== candidates), not just `rest`: a person
      // elevated to a band (President/AM/PM) still appears in every non-org-level
      // department column they belong to — band placement doesn't remove them
      // from their department columns (Manu 2026-09-21).
      members: candidates,
      candidates,
    });
  }
  const unassignedRest = rest.filter(
    (m) => !m.departments.some(isTeamDepartment)
  );
  if (unassignedRest.length > 0) {
    departments.push({
      id: "unassigned",
      label: "Unassigned",
      color: TEAM_DEPARTMENT_COLORS.unassigned,
      lead: null,
      members: unassignedRest,
      candidates: [],
    });
  }
  return { president, ams, pms, departments };
}

/**
 * Headcount by department for the /team company-scale chart. A person in N
 * departments counts once per department (not once overall), so `total` is
 * the sum of memberships, not the headcount. Departments with zero people
 * are omitted; Unassigned is included only when at least one person has no
 * valid department membership.
 */
export function buildCompanyScale(
  members: { departments: string[] }[]
): CompanyScale {
  const counts = new Map<TeamDepartment | "unassigned", number>();
  let total = 0;
  for (const m of members) {
    const valid = m.departments.filter(isTeamDepartment);
    if (valid.length === 0) {
      counts.set("unassigned", (counts.get("unassigned") ?? 0) + 1);
      total += 1;
      continue;
    }
    for (const d of valid) {
      counts.set(d, (counts.get(d) ?? 0) + 1);
      total += 1;
    }
  }
  const rows: CompanyScaleRow[] = TEAM_DEPARTMENTS.filter(
    (id) => (counts.get(id) ?? 0) > 0
  ).map((id) => ({
    id,
    label: TEAM_DEPARTMENT_LABELS[id],
    count: counts.get(id) ?? 0,
    color: TEAM_DEPARTMENT_COLORS[id],
  }));
  const unassigned = counts.get("unassigned") ?? 0;
  if (unassigned > 0) {
    rows.push({
      id: "unassigned",
      label: "Unassigned",
      count: unassigned,
      color: TEAM_DEPARTMENT_COLORS.unassigned,
    });
  }
  rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { total, rows };
}
