/* eslint-disable react-doctor/async-await-in-loop */
// Asana REST API integration (Personal Access Token).
// Config loaded from DB (Admin > Asana Config), falls back to hardcoded defaults.

import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { OrgProbe } from "./resolve-assignee";

const ASANA_BASE = "https://app.asana.com/api/1.0";

// Defaults — used when no DB config exists.
// Team "Market Foundry" in the marketfoundry.agency workspace (1216006599656808).
// The old 1o8 default was team "1o8 Marketplace" 1165458906654217 in org
// 1165458906651074 — the 24 legacy client projects still live there and are read
// through the fallback token in asanaFetch. New projects must not go there.
const DEFAULT_TEAM_GID = "1216009494057854";
const DEFAULT_PROJECT_NAME_FORMAT = "{CIC} - {ClientName}";
const DEFAULT_VIEW = "list";

interface SavedConfig {
  teamGid: string;
  projectNameFormat: string;
  defaultView: string;
  sections: { name: string; tasks: { name: string; notes: string }[] }[];
}

/** Load Asana config from DB, fallback to null */
async function loadConfig(): Promise<SavedConfig | null> {
  try {
    const [row] = await db
      .select({ value: seoSettings.value })
      .from(seoSettings)
      .where(eq(seoSettings.key, "asana_config"))
      .limit(1);
    return row?.value ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}

// ── Custom Field Definitions ──────────────────────────────────────
// These are created once at workspace level, then added to each project.

interface CustomFieldDef {
  name: string;
  resource_subtype: "enum" | "text" | "number";
  enum_options?: { name: string; color: string }[];
  description?: string;
  precision?: number;
}

const CUSTOM_FIELD_DEFINITIONS: CustomFieldDef[] = [
  {
    name: "Priority Levels",
    resource_subtype: "enum",
    enum_options: [
      { name: "Low", color: "blue" },
      { name: "Medium", color: "yellow" },
      { name: "High", color: "orange" },
      { name: "Urgent", color: "red" },
    ],
  },
  {
    name: "Task Status",
    resource_subtype: "enum",
    enum_options: [
      { name: "Not Started", color: "cool-gray" },
      { name: "In Progress", color: "blue" },
      { name: "On Hold", color: "yellow" },
      { name: "Completed", color: "green" },
      { name: "Blocked", color: "red" },
    ],
  },
  {
    name: "Assignee Feedback",
    resource_subtype: "text",
    description: "Feedback from the task assignee",
  },
  {
    name: "AM/PM Feedback",
    resource_subtype: "text",
    description: "Feedback from the Account Manager or Project Manager",
  },
  {
    name: "Category",
    resource_subtype: "enum",
    enum_options: [
      { name: "Onboarding", color: "purple" },
      { name: "SEO", color: "green" },
      { name: "Content", color: "blue" },
      { name: "PPC", color: "orange" },
      { name: "Admin", color: "cool-gray" },
    ],
  },
  {
    name: "Estimated Time",
    resource_subtype: "number",
    description: "Estimated time in hours",
    precision: 1,
  },
  {
    name: "Actual Time",
    resource_subtype: "number",
    description: "Actual time spent in hours",
    precision: 1,
  },
];

/** Get workspace GID from team */
async function getWorkspaceGid(teamGid: string): Promise<string> {
  const { data } = await asanaFetch(`/teams/${teamGid}?opt_fields=organization.gid`);
  return data.organization.gid as string;
}

/** Search for existing custom fields in workspace by name */
async function findWorkspaceCustomFields(
  workspaceGid: string
): Promise<{ gid: string; name: string }[]> {
  const { data } = await asanaFetch(
    `/workspaces/${workspaceGid}/custom_fields?opt_fields=name&limit=100`
  );
  return data as { gid: string; name: string }[];
}

/** Create a custom field in the workspace */
async function createCustomField(
  workspaceGid: string,
  def: CustomFieldDef
): Promise<string> {
  const body: Record<string, unknown> = {
    name: def.name,
    resource_subtype: def.resource_subtype,
    workspace: workspaceGid,
  };
  if (def.enum_options) body.enum_options = def.enum_options;
  if (def.description) body.description = def.description;
  if (def.precision !== undefined) body.precision = def.precision;

  const { data } = await asanaFetch("/custom_fields", {
    method: "POST",
    body: JSON.stringify({ data: body }),
  });
  return data.gid as string;
}

/** Add a custom field to a project */
async function addCustomFieldToProject(
  projectGid: string,
  customFieldGid: string
): Promise<void> {
  await asanaFetch(`/projects/${projectGid}/addCustomFieldSetting`, {
    method: "POST",
    body: JSON.stringify({
      data: { custom_field: customFieldGid, is_important: true },
    }),
  });
}

/**
 * Ensure all custom fields exist in the workspace and add them to the project.
 * Finds existing fields by name to avoid duplicates.
 */
async function ensureCustomFieldsOnProject(
  teamGid: string,
  projectGid: string
): Promise<number> {
  const workspaceGid = await getWorkspaceGid(teamGid);
  const existing = await findWorkspaceCustomFields(workspaceGid);
  const existingByName = new Map(existing.map((f) => [f.name, f.gid]));

  let added = 0;
  for (const def of CUSTOM_FIELD_DEFINITIONS) {
    let fieldGid = existingByName.get(def.name);
    if (!fieldGid) {
      fieldGid = await createCustomField(workspaceGid, def);
    }
    await addCustomFieldToProject(projectGid, fieldGid);
    added++;
  }
  return added;
}

interface AsanaTask {
  name: string;
  notes?: string;
}

interface AsanaSection {
  /** Section key — prefixed with CIC at runtime */
  name: string;
  tasks: AsanaTask[];
}

/**
 * Build sections with client ID code prefix.
 * Tasks without subtask: "{CIC} | {Section} | {Task}" (3-part)
 * Tasks with subtask:    "{CIC} | {Section} | {Task} | {Subtask}" (4-part)
 */
function buildSections(cic: string): AsanaSection[] {
  const p3 = (section: string, task: string) =>
    `${cic} | ${section} | ${task}`;
  const p4 = (section: string, task: string, subtask: string) =>
    `${cic} | ${section} | ${task} | ${subtask}`;

  return [
    {
      name: `${cic} | Onboarding`,
      tasks: [
        { name: p3("Onboarding", "01. Create Client"), notes: "Create client record in 1o8 Hub with ID code, name, and status" },
        { name: p3("Onboarding", "02. Assign Team"), notes: "Assign team roles — auto-assigns remaining onboarding tasks to Account Manager (1o8)" },
        { name: p3("Onboarding", "03. Setup Asana Project"), notes: "Create Asana project under 1o8" },
        { name: p3("Onboarding", "04. Setup Starting Day & Timeline"), notes: "Set onboarding start date and initialize 13-week Gantt timeline" },
        { name: p4("Onboarding", "05. Client Users", "Add Contact Emails"), notes: "Enter client contact email(s) for portal access and communication" },
        { name: p4("Onboarding", "05. Client Users", "Add User to 1o8 Hub"), notes: "Add client Gmail account(s) to 1o8 Hub Users" },
        { name: p4("Onboarding", "05. Client Users", "Assign Client Role"), notes: "Set user role to 'client' in Admin → Users" },
        { name: p4("Onboarding", "05. Client Users", "Assign Client Project"), notes: "Link user to their client account (assign clientIdCode)" },
        { name: p3("Onboarding", "06. Create Drive Folders"), notes: "Create full folder tree in Google Drive for assets, SEO, PPC, docs" },
        { name: p3("Onboarding", "07. Send Onboarding Email"), notes: "Send welcome email with portal info, strategy overview, requirements" },
        { name: p4("Onboarding", "08. Amazon Access", "Request Amazon Access"), notes: "Request access to Amazon Seller Central from client" },
        { name: p4("Onboarding", "08. Amazon Access", "Provide Team Access"), notes: "Provide team members access to Amazon Seller Central" },
        { name: p4("Onboarding", "09. Intentwise", "Add Sponsored Ads"), notes: "Add Sponsored Ads account in Intentwise" },
        { name: p4("Onboarding", "09. Intentwise", "Add Seller Central"), notes: "Add Seller Central account in Intentwise" },
        { name: p4("Onboarding", "09. Intentwise", "Get ID"), notes: "Get Intentwise advertiser ID" },
        { name: p4("Onboarding", "09. Intentwise", "Request Enable"), notes: "Request Enable status in Intentwise" },
        { name: p4("Onboarding", "10. Intentwise (AMC)", "Add Account"), notes: "Add AMC account in Intentwise" },
        { name: p4("Onboarding", "10. Intentwise (AMC)", "Get ID"), notes: "Get Intentwise AMC ID" },
        { name: p4("Onboarding", "10. Intentwise (AMC)", "Request Enable"), notes: "Request Enable status for AMC" },
        { name: p4("Onboarding", "11. FeedbackWhiz", "Setup FeedbackWhiz"), notes: "Set up FeedbackWhiz review monitoring" },
      ],
    },
    {
      name: `${cic} | SEO`,
      tasks: [
        { name: p3("SEO", "Keyword Research"), notes: "Full keyword research for all client ASINs" },
        { name: p3("SEO", "SEO Optimization"), notes: "Apply keyword strategy to titles, bullets, descriptions, and backend terms" },
        { name: p4("SEO", "Competitors", "Tracking competitors"), notes: "Track and analyze competitor listings and keywords" },
      ],
    },
    {
      name: `${cic} | PPC`,
      tasks: [
        { name: p4("PPC", "Intentwise", "Setup Campaigns"), notes: "Connect Intentwise analytics and set up PPC campaigns" },
        { name: p4("PPC", "Campaigns", "Launch"), notes: "Launch PPC campaigns" },
        { name: p4("PPC", "Campaigns", "Manage"), notes: "Ongoing PPC campaign management and optimization" },
      ],
    },
    {
      name: `${cic} | Design`,
      tasks: [
        { name: p4("Design", "Brandstory", "Create"), notes: "Design and build A+ Brand Story module" },
        { name: p4("Design", "A+ Content", "Create"), notes: "Design A+ content modules (up to 7 per ASIN)" },
        { name: p4("Design", "Listing Images", "Create"), notes: "Design, edit, and optimize listing images" },
        { name: p4("Design", "Storefront", "Create"), notes: "Design and build Amazon Storefront pages" },
      ],
    },
    {
      name: `${cic} | Recurring Tasks`,
      tasks: [],
    },
    {
      name: `${cic} | Others`,
      tasks: [],
    },
  ];
}

/** Build sections from DB-stored config, applying CIC prefix */
function buildSectionsFromConfig(
  cic: string,
  cfgSections: SavedConfig["sections"]
): AsanaSection[] {
  return cfgSections.map((s) => ({
    name: `${cic} | ${s.name}`,
    tasks: s.tasks.map((t) => ({
      // Task name may already contain " | " for group/subtask (e.g., "Client Users | Add Contact Emails")
      name: `${cic} | ${s.name} | ${t.name}`,
      notes: t.notes,
    })),
  }));
}

/**
 * Asana token routing.
 *
 * New client projects must land in the 1o8 org, but 24 legacy clients'
 * projects live in the 1o8.agency org and must keep working (Gantt sync, task
 * detail pane, comments, webhook, assignee sync). A Personal Access Token can
 * only see the orgs its owner belongs to, and no single account is in both — so
 * we hold two: ASANA_ACCESS_TOKEN_MF (the 1o8 writer) and
 * ASANA_ACCESS_TOKEN (the 1o8 reader). Calls try MF first and retry with the 1o8
 * token on 403/404, which is how Asana reports "not visible to you".
 *
 * While ASANA_ACCESS_TOKEN_MF is unset, behaviour is identical to before.
 */
function asanaTokens(): string[] {
  const mf = process.env.ASANA_ACCESS_TOKEN_MF?.trim();
  const legacy = process.env.ASANA_ACCESS_TOKEN?.trim();
  // Set dedupes: if both vars hold the same PAT, make one attempt, not two.
  return [...new Set([mf, legacy].filter((t): t is string => !!t))];
}

/** True when at least one Asana token is configured. */
export function hasAsanaToken(): boolean {
  return asanaTokens().length > 0;
}

/**
 * Calls whose destination ORG is decided by the token rather than by a gid in
 * the path. Retrying one of these with the 1o8 token would silently create an
 * MF-intended object in the 1o8 org — the exact bug this routing exists to fix,
 * and it would look like a success.
 *
 * Only the bare collection endpoints qualify. `/projects/{gid}/…` and
 * `/custom_fields/{gid}` take their org from the gid, so legacy writes there
 * must still fall back.
 */
function isOrgScopedCreate(path: string, method: string): boolean {
  if (method === "GET") return false;
  return /^\/(projects|custom_fields)(\?|$)/.test(path);
}

export async function asanaFetch(path: string, options: RequestInit = {}) {
  const tokens = asanaTokens();
  if (!tokens.length) throw new Error("ASANA_ACCESS_TOKEN not configured");

  const method = (options.method ?? "GET").toUpperCase();
  const attempts = isOrgScopedCreate(path, method) ? tokens.slice(0, 1) : tokens;

  let lastError = "";
  for (let i = 0; i < attempts.length; i++) {
    const res = await fetch(`${ASANA_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${attempts[i]}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (res.ok) return res.json();

    const body = await res.text();
    lastError = `Asana API ${res.status}: ${body}`;
    const isLast = i === attempts.length - 1;
    if (isLast) throw new Error(i > 0 ? `${lastError} [both Asana tokens tried]` : lastError);
    if (res.status !== 403 && res.status !== 404) throw new Error(lastError);
  }

  /* istanbul ignore next — the loop always returns or throws */
  throw new Error(lastError);
}

/**
 * Membership test pinned to exactly ONE token: true when that token can see the
 * object, false on 403/404 (how Asana says "not yours"), throw on anything else
 * so a transient failure is logged rather than silently read as "absent".
 *
 * Deliberately does NOT go through asanaFetch. That function's fallback is what
 * makes a plain GET useless as an org membership test — a 1o8-only address
 * "passes" a check made for an MF project, and the assignment then fails for real.
 */
async function visibleToToken(tokenIndex: number, path: string): Promise<boolean> {
  const token = asanaTokens()[tokenIndex];
  if (!token) return false;

  const res = await fetch(`${ASANA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (res.ok) return true;
  if (res.status === 403 || res.status === 404) return false;
  throw new Error(`Asana API ${res.status}: ${await res.text()}`);
}

/**
 * An OrgProbe backed by the real Asana API, memoised for the life of the instance.
 * Create one per request: a run resolves at most an AM and an ES, so the project's
 * org is probed once and each address at most once per token.
 */
export function createAsanaOrgProbe(): OrgProbe {
  const projectSlot = new Map<string, number | null>();
  const addressSlot = new Map<string, boolean>();

  return {
    async tokenIndexForProject(projectGid: string): Promise<number | null> {
      const cached = projectSlot.get(projectGid);
      if (cached !== undefined) return cached;

      let found: number | null = null;
      const tokenCount = asanaTokens().length;
      for (let i = 0; i < tokenCount; i++) {
        if (await visibleToToken(i, `/projects/${projectGid}?opt_fields=gid`)) {
          found = i;
          break;
        }
      }
      projectSlot.set(projectGid, found);
      return found;
    },

    async addressExistsForToken(email: string, tokenIndex: number): Promise<boolean> {
      const key = `${tokenIndex}:${email}`;
      const cached = addressSlot.get(key);
      if (cached !== undefined) return cached;

      const exists = await visibleToToken(
        tokenIndex,
        `/users/${encodeURIComponent(email)}?opt_fields=gid`
      );
      addressSlot.set(key, exists);
      return exists;
    },
  };
}

/**
 * Maps onboarding step keys to their Asana task name suffix.
 * Used to find the Asana task GID for assignee sync.
 * 3-part tasks end with "| {Task}", 4-part tasks end with "| {Task} | {Subtask}"
 */
export const STEP_TO_ASANA_TASK: Record<string, string> = {
  create_client: "01. Create Client",
  assign_team: "02. Assign Team",
  setup_timeline: "04. Setup Starting Day & Timeline",
  add_contact_emails: "05. Client Users | Add Contact Emails",
  drive_folders: "06. Create Drive Folders",
  send_onboarding_email: "07. Send Onboarding Email",
  hub_add_user: "05. Client Users | Add User to 1o8 Hub",
  hub_assign_role: "05. Client Users | Assign Client Role",
  hub_assign_client: "05. Client Users | Assign Client Project",
  setup_asana: "03. Setup Asana Project",
  amazon_access_request: "08. Amazon Access | Request Amazon Access",
  amazon_access_team: "08. Amazon Access | Provide Team Access",
  iw_get_merchant_id: "09. Intentwise | Get Merchant ID",
  iw_request_subscriptions: "09. Intentwise | Request Subscriptions",
  intentwise_id_provided: "09. Intentwise | Enter Intentwise ID & Name",
  iw_enabled: "09. Intentwise | Request Enable",
  iw_confirm_enabled: "09. Intentwise | Confirm Enabled",
  iw_amc_request: "10. Intentwise (AMC) | Request Amazon Marketing Cloud",
  intentwise_amc_id_provided: "10. Intentwise (AMC) | Enter AMC ID & Name",
  iw_amc_enabled: "10. Intentwise (AMC) | Request Enable",
  iw_amc_confirm_enabled: "10. Intentwise (AMC) | Confirm Enabled",
  feedbackwhiz: "11. FeedbackWhiz | Setup FeedbackWhiz",
};

/**
 * Find an Asana task by name fragment within a project.
 * Returns the task GID or null if not found.
 */
export async function findAsanaTaskInProject(
  projectGid: string,
  taskNameFragment: string
): Promise<string | null> {
  try {
    const { data: tasks } = await asanaFetch(
      `/projects/${projectGid}/tasks?opt_fields=name&limit=100`
    );
    // Match suffix — works for both 3-part ("| Task") and 4-part ("| Task | Subtask")
    const suffix = `| ${taskNameFragment}`;
    const allTasks = tasks as { gid: string; name: string }[];
    const match = allTasks.find((t) => t.name.endsWith(suffix));
    if (match) return match.gid;
    // Fallback: strip number prefix (e.g. "01. Create Client" → "Create Client") for old projects
    const stripped = taskNameFragment.replace(/^\d+\.\s*/, "").replace(/\d+\.\s*/g, "");
    const fallbackSuffix = `| ${stripped}`;
    const fallback = allTasks.find((t) => t.name.endsWith(fallbackSuffix));
    if (fallback) return fallback.gid;
    // Legacy name mapping for renamed tasks
    const LEGACY: Record<string, string> = { "Setup Starting Day & Timeline": "Setup Starting Day" };
    const legacy = LEGACY[stripped];
    if (legacy) {
      const legacyMatch = allTasks.find((t) => t.name.endsWith(`| ${legacy}`));
      if (legacyMatch) return legacyMatch.gid;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Update the assignee of an Asana task.
 * Accepts email (Asana resolves it) or Asana user GID.
 */
export async function updateAsanaTaskAssignee(
  taskGid: string,
  assigneeEmail: string
): Promise<boolean> {
  try {
    await asanaFetch(`/tasks/${taskGid}`, {
      method: "PUT",
      body: JSON.stringify({ data: { assignee: assigneeEmail } }),
    });
    return true;
  } catch (err) {
    console.error("[Asana] Failed to update task assignee:", err);
    return false;
  }
}

// ── Asana Task Details ────────────────────────────────────────────

export interface AsanaUser {
  gid: string;
  name: string;
  email?: string;
}

export interface AsanaComment {
  gid: string;
  text: string;
  created_at: string;
  created_by: AsanaUser;
}

export interface AsanaTaskDetails {
  gid: string;
  name: string;
  completed: boolean;
  assignee: AsanaUser | null;
  start_on: string | null;
  due_on: string | null;
  followers: AsanaUser[];
  permalink_url: string;
}

/** Fetch full task details */
export async function getAsanaTaskDetails(
  taskGid: string
): Promise<AsanaTaskDetails | null> {
  try {
    const { data } = await asanaFetch(
      `/tasks/${taskGid}?opt_fields=name,completed,assignee.name,assignee.email,start_on,due_on,followers.name,followers.email,permalink_url`
    );
    return data as AsanaTaskDetails;
  } catch {
    return null;
  }
}

/** Update task fields (start_on, due_on, assignee) */
export async function updateAsanaTask(
  taskGid: string,
  fields: { start_on?: string | null; due_on?: string | null; assignee?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  try {
    await asanaFetch(`/tasks/${taskGid}`, {
      method: "PUT",
      body: JSON.stringify({ data: fields }),
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Asana] Failed to update task:", msg);
    return { ok: false, error: msg };
  }
}

/** Mark an Asana task as completed or incomplete */
export async function setAsanaTaskCompleted(
  taskGid: string,
  completed: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    await asanaFetch(`/tasks/${taskGid}`, {
      method: "PUT",
      body: JSON.stringify({ data: { completed } }),
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Asana] Failed to set task completed:", msg);
    return { ok: false, error: msg };
  }
}

/** Add a collaborator (follower) to a task by email */
export async function addAsanaCollaborator(
  taskGid: string,
  email: string
): Promise<boolean> {
  try {
    await asanaFetch(`/tasks/${taskGid}/addFollowers`, {
      method: "POST",
      body: JSON.stringify({ data: { followers: [email] } }),
    });
    return true;
  } catch (err) {
    console.error("[Asana] Failed to add collaborator:", err);
    return false;
  }
}

/** Remove a collaborator (follower) from a task by email or GID */
export async function removeAsanaCollaborator(
  taskGid: string,
  identifier: string
): Promise<boolean> {
  try {
    await asanaFetch(`/tasks/${taskGid}/removeFollowers`, {
      method: "POST",
      body: JSON.stringify({ data: { followers: [identifier] } }),
    });
    return true;
  } catch (err) {
    console.error("[Asana] Failed to remove collaborator:", err);
    return false;
  }
}

/** Get comments (stories of type "comment") on a task */
export async function getAsanaComments(
  taskGid: string
): Promise<AsanaComment[]> {
  try {
    const { data } = await asanaFetch(
      `/tasks/${taskGid}/stories?opt_fields=text,created_at,created_by.name,created_by.email,type&limit=50`
    );
    return (data as (AsanaComment & { type?: string })[]).filter(
      (s) => s.type === "comment"
    );
  } catch {
    return [];
  }
}

/** Add a comment to a task */
export async function addAsanaTaskComment(
  taskGid: string,
  text: string
): Promise<boolean> {
  try {
    await asanaFetch(`/tasks/${taskGid}/stories`, {
      method: "POST",
      body: JSON.stringify({ data: { text } }),
    });
    return true;
  } catch (err) {
    console.error("[Asana] Failed to add comment:", err);
    return false;
  }
}

export interface AsanaCreatedTask {
  asanaTaskGid: string;
  asanaTaskName: string;
}

export interface AsanaProjectResult {
  projectGid: string;
  projectName: string;
  projectUrl: string;
  sectionsCreated: number;
  tasksCreated: number;
  customFieldsAdded: number;
  /** GID + name of every created task (for linking to Gantt rows) */
  createdTasks: AsanaCreatedTask[];
}

export async function createAsanaProject(
  clientIdCode: string,
  clientName?: string
): Promise<AsanaProjectResult> {
  // Load config from DB (Admin → Asana Config) or use defaults
  const cfg = await loadConfig();

  const teamGid = cfg?.teamGid || DEFAULT_TEAM_GID;
  const nameFormat = cfg?.projectNameFormat || DEFAULT_PROJECT_NAME_FORMAT;
  const defaultView = cfg?.defaultView || DEFAULT_VIEW;

  const projectName = nameFormat
    .replace("{CIC}", clientIdCode)
    .replace("{ClientName}", clientName ?? clientIdCode);

  // 1. Create the project
  const { data: project } = await asanaFetch("/projects", {
    method: "POST",
    body: JSON.stringify({
      data: {
        name: projectName,
        team: teamGid,
        default_view: defaultView,
        notes: `Client onboarding project created by 1o8 Hub on ${new Date().toISOString().slice(0, 10)}.`,
      },
    }),
  });

  const projectGid = project.gid as string;
  let tasksCreated = 0;
  const createdTasks: AsanaCreatedTask[] = [];

  // 2. Add custom fields to project
  let customFieldsAdded = 0;
  try {
    customFieldsAdded = await ensureCustomFieldsOnProject(teamGid, projectGid);
  } catch (err) {
    console.error("[Asana] Failed to add custom fields (continuing):", err);
  }

  // 3. Build sections — from DB config or hardcoded defaults
  const sections = cfg?.sections
    ? buildSectionsFromConfig(clientIdCode, cfg.sections)
    : buildSections(clientIdCode);
  for (const section of sections) {
    const { data: sec } = await asanaFetch(`/projects/${projectGid}/sections`, {
      method: "POST",
      body: JSON.stringify({ data: { name: section.name } }),
    });

    for (const task of section.tasks) {
      const { data: created } = await asanaFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          data: {
            name: task.name,
            notes: task.notes ?? "",
            projects: [projectGid],
            memberships: [{ project: projectGid, section: sec.gid }],
          },
        }),
      });
      createdTasks.push({ asanaTaskGid: created.gid, asanaTaskName: task.name });
      tasksCreated++;
    }
  }

  return {
    projectGid,
    projectName,
    projectUrl: `https://app.asana.com/0/${projectGid}/list`,
    sectionsCreated: sections.length,
    tasksCreated,
    customFieldsAdded,
    createdTasks,
  };
}
