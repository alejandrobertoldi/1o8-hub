/* eslint-disable react-doctor/async-await-in-loop */
// Asana REST API integration (Personal Access Token).
// Config loaded from DB (Admin → Configuration → Asana project template), falls back to the defaults below.

import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { OrgProbe } from "./resolve-assignee";

const ASANA_BASE = "https://app.asana.com/api/1.0";

// Defaults — used when no DB config exists. Team "1o8 Agency" in the 1o8
// workspace (1165458906651074), where 1o8's client projects live.
const DEFAULT_TEAM_GID = "1209687610482599";
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
      .where(eq(seoSettings.key, "asana_config_1o8"))
      .limit(1);
    return row?.value ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}

// ── Custom fields ─────────────────────────────────────────────────
// 1o8's own workspace fields, the ones its "CNM - Client Name" template project
// carries. They already exist: they're added to each new project, never created.
const CUSTOM_FIELD_GIDS = [
  "1213197114817830", // 1O8 Priority
  "1209866062360896", // Status
  "1210746742899759", // 1O8 Status
  "1213270453033481", // Go Live Date
  "1216772547110708", // 1o8 Internal ID
];

/** Add a custom field to a project */
async function addCustomFieldToProject(projectGid: string, customFieldGid: string): Promise<void> {
  await asanaFetch(`/projects/${projectGid}/addCustomFieldSetting`, {
    method: "POST",
    body: JSON.stringify({ data: { custom_field: customFieldGid, is_important: true } }),
  });
}

/** Adds 1o8's custom fields to the project; one that fails (e.g. another workspace) is skipped. */
async function ensureCustomFieldsOnProject(projectGid: string): Promise<number> {
  let added = 0;
  for (const gid of CUSTOM_FIELD_GIDS) {
    try {
      await addCustomFieldToProject(projectGid, gid);
      added++;
    } catch (err) {
      console.error(`[Asana] Couldn't add custom field ${gid} (continuing):`, err);
    }
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

/** 1o8's default sections (as its "CNM - Client Name" template project), named "{CIC} - Section". */
const DEFAULT_SECTIONS: SavedConfig["sections"] = [
  { name: "Form Requests", tasks: [] },
  {
    name: "Onboarding",
    tasks: [
      { name: "Project Tracker", notes: "Kick off the client: scope (SOW / quote), team, accesses and the 1o8 Hub client profile (Client Onboarding)" },
      { name: "Review Project Tracker", notes: "Review the onboarding with the account team once the client profile is complete" },
    ],
  },
  { name: "Account", tasks: [] },
  { name: "Creative", tasks: [] },
  { name: "Email", tasks: [] },
  { name: "Web Development", tasks: [] },
  { name: "Paid Media", tasks: [] },
  { name: "SEO", tasks: [] },
  { name: "Recurring Tasks", tasks: [] },
  { name: "Other", tasks: [] },
];

/** Build sections from DB-stored config, applying CIC prefix */
function buildSectionsFromConfig(
  cic: string,
  cfgSections: SavedConfig["sections"]
): AsanaSection[] {
  // 1o8's naming: "KSS - Onboarding" sections, "KSS - Onboarding - Project Tracker" tasks.
  return cfgSections.map((s) => ({
    name: `${cic} - ${s.name}`,
    tasks: s.tasks.map((t) => ({ name: `${cic} - ${s.name} - ${t.name}`, notes: t.notes })),
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
  // Load config from DB (Admin → Configuration) or use defaults
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
    customFieldsAdded = await ensureCustomFieldsOnProject(projectGid);
  } catch (err) {
    console.error("[Asana] Failed to add custom fields (continuing):", err);
  }

  // 3. Build sections — from DB config or hardcoded defaults
  const sections = buildSectionsFromConfig(clientIdCode, cfg?.sections ?? DEFAULT_SECTIONS);
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
