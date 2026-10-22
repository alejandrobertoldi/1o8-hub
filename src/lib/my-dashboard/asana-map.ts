// The reporting project multi-homes every task in the workspace, so syncing it
// alone mirrors everything. Defaults are MarketFoundry's; the 1o8 Hub sets its
// own in .env.local ("AAA - 1o8 Agency Reporting", "1O8 Status", "1O8 Priority").
export const ASANA_REPORTING_PROJECT_GID = process.env.ASANA_REPORTING_PROJECT_GID || "1216052535915202";
export const ASANA_STATUS_FIELD_GID = process.env.ASANA_STATUS_FIELD_GID || "1216388146560076";
export const ASANA_PRIORITY_FIELD_GID = process.env.ASANA_PRIORITY_FIELD_GID || "1216388146560065";
// "1o8 Internal ID" (INT-8132): its digits form the time-tracking Project Number (MSN08132).
export const ASANA_INTERNAL_ID_FIELD_GID = process.env.ASANA_INTERNAL_ID_FIELD_GID || "1216772547110708";
// "Go Live Date" custom field: the day an email (or any deliverable) goes out.
export const ASANA_GO_LIVE_FIELD_GID = process.env.ASANA_GO_LIVE_FIELD_GID || "1213270453033481";
/** Completed tasks stay loggable this many days (Time Tracking 2.0 "completed task window"). */
export const ASANA_COMPLETED_WINDOW_DAYS = 14;
/** Client code for 1o8's own (non-client) work, as in the time-tracking sheet. */
export const INTERNAL_CLIENT_CODE = "1O8";

export const ASANA_OPT_FIELDS = [
  "name", "completed", "completed_at", "due_on", "permalink_url", "modified_at",
  "assignee.name", "assignee.email",
  "memberships.project.name",
  "custom_fields.gid", "custom_fields.enum_value.name", "custom_fields.display_value", "custom_fields.date_value.date",
].join(",");

/**
 * 1o8 team projects ("1o8 | Internal Paid Media Team") → the department tag a
 * task carries. They are service tags, never a client.
 */
const TEAM_PROJECT_TAGS: [RegExp, string][] = [
  [/internal paid media/i, "Paid Media"],
  [/internal email/i, "Email"],
  [/internal web ?dev/i, "Web Dev"],
  [/internal (creative|studio)/i, "Creative"],
  [/internal seo/i, "SEO"],
  [/internal social/i, "Social"],
];
const isTeamProject = (name: string) => /^1o8\s*\|\s*internal\b/i.test(name.trim());
export function serviceTagsFor(projectNames: string[]): string[] {
  const tags = new Set<string>();
  for (const n of projectNames) for (const [re, tag] of TEAM_PROJECT_TAGS) if (re.test(n)) tags.add(tag);
  return [...tags];
}

/** "INT-8132" → "08132" (5 digits, zero-padded). */
export function internalIdDigits(internalId: string | null): string | null {
  const m = internalId?.match(/(\d+)/);
  return m ? m[1].slice(-5).padStart(5, "0") : null;
}

export interface AsanaApiTask {
  gid: string;
  name: string;
  completed: boolean;
  due_on: string | null;
  permalink_url: string;
  modified_at?: string;
  assignee: { gid: string; name?: string; email?: string } | null;
  memberships: { project: { gid: string; name: string } }[];
  completed_at?: string | null;
  custom_fields?: {
    gid: string;
    enum_value: { name: string } | null;
    display_value?: string | null;
    date_value?: { date: string | null } | null;
  }[];
}

export interface AsanaTaskRow {
  gid: string;
  name: string;
  assigneeEmail: string | null;
  assigneeName: string | null;
  dueOn: string | null;
  completed: boolean;
  clientIdCode: string | null;
  originProjectName: string | null;
  taskStatus: string | null;
  priority: string | null;
  permalinkUrl: string;
  asanaModifiedAt: Date | null;
  internalId: string | null;
  serviceTags: string[];
  projectNames: string[];
  completedAt: Date | null;
  goLiveDate: string | null;
}

/** "SOP_SC_US | Sopreme" / "CFX_SC_US - Culture Fix" → code. AAA_* is the internal prefix. */
const CODE_RE = /^([A-Z0-9]+(?:_[A-Z0-9]+){1,2})\s*[|\-–]/;
/**
 * 1o8 Agency names projects (and many tasks) with the bare AAC code:
 * "KSS | K9 Sport Sack", "STS  - Star Sweat", "EXT: MSN | Mission", "MSN | 12 Days of Gifting".
 * A bare 2–6 char prefix is ambiguous ("IDS - Tracker", "OTP - One Time Projects"),
 * so it only counts when it is a known client code.
 */
const SHORT_CODE_RE = /^(?:EXT:\s*)?([A-Z0-9]{2,6})\s*[|\-–]/;
export function parseClientCode(projectName: string, knownCodes?: ReadonlySet<string>): string | null {
  const name = projectName.trim();
  const m = CODE_RE.exec(name.replace(/^EXT:\s*/, ""));
  if (m) return m[1].startsWith("AAA_") ? null : m[1];
  if (!knownCodes) return null;
  const short = SHORT_CODE_RE.exec(name);
  return short && knownCodes.has(short[1]) ? short[1] : null;
}

function enumField(t: AsanaApiTask, gid: string): string | null {
  return t.custom_fields?.find((f) => f.gid === gid)?.enum_value?.name ?? null;
}

export function mapAsanaTask(t: AsanaApiTask, knownCodes?: ReadonlySet<string>): AsanaTaskRow {
  const memberships = t.memberships ?? [];
  const nonReporting = memberships.filter((m) => m.project.gid !== ASANA_REPORTING_PROJECT_GID);
  // Prefer the project that identifies a client (a task can sit in "1o8 | Internal Creative Team" AND "STS - Star Sweat").
  const clientProject = nonReporting.find((m) => !isTeamProject(m.project.name) && parseClientCode(m.project.name, knownCodes));
  const origin = clientProject ?? nonReporting[0] ?? memberships[0];
  const originName = origin?.project.name ?? null;
  // Last resort (1o8 only): tasks kept in internal team projects are named "MSN | …".
  // The reporting/aggregation projects (AAA…) carry no information about the task.
  const projectNames = nonReporting.map((m) => m.project.name.trim()).filter((n) => n && !/^AAA[\s_\-]/.test(n));
  const clientIdCode =
    (clientProject ? parseClientCode(clientProject.project.name, knownCodes) : null) ??
    (knownCodes ? parseClientCode(t.name, knownCodes) : null) ??
    // 1o8's own work: "1o8 | New Branding Mood Board", "1o8 - Complete the vendor payment…"
    (knownCodes && /^1o8\s*[|\-–]/i.test(t.name.trim()) ? INTERNAL_CLIENT_CODE : null);
  return {
    gid: t.gid,
    name: t.name,
    assigneeEmail: t.assignee?.email ? t.assignee.email.trim().toLowerCase() : null,
    assigneeName: t.assignee?.name ?? null,
    dueOn: t.due_on ?? null,
    completed: t.completed,
    clientIdCode,
    originProjectName: originName,
    taskStatus: enumField(t, ASANA_STATUS_FIELD_GID),
    priority: enumField(t, ASANA_PRIORITY_FIELD_GID),
    permalinkUrl: t.permalink_url,
    asanaModifiedAt: t.modified_at ? new Date(t.modified_at) : null,
    internalId: t.custom_fields?.find((f) => f.gid === ASANA_INTERNAL_ID_FIELD_GID)?.display_value?.trim() || null,
    serviceTags: serviceTagsFor(projectNames),
    projectNames,
    completedAt: t.completed_at ? new Date(t.completed_at) : null,
    goLiveDate: t.custom_fields?.find((f) => f.gid === ASANA_GO_LIVE_FIELD_GID)?.date_value?.date?.slice(0, 10) ?? null,
  };
}
