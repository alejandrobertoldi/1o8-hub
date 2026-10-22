import { asanaFetch as rawAsanaFetch } from "@/lib/onboarding/create-asana-project";

// Every call gets a 20s ceiling so a hung Asana request can't pin a lease or an `after` task.
const asanaFetch = (path: string, options: RequestInit = {}) =>
  rawAsanaFetch(path, { ...options, signal: AbortSignal.timeout(20_000) });

export const MR_ASANA = {
  project: "1219237652232682",
  section: "1219237652232685",
  customFields: {
    "1219237652232690": "1219237652232694",
    "1219237652232697": "1219237652232699",
    "1219237599617929": ["1219237599617958"],
    "1219237599617938": "1219237599617939",
    "1219237599617946": "1219237599617952",
  },
  hubUrl: "https://www.marketfoundryhub.com/reports/monthly",
} as const;

type TaskInput = { name: string; notes: string; assignee: string; dueOn: string };

export async function createParent(input: TaskInput): Promise<{ gid: string; url: string }> {
  const json = await asanaFetch(`/tasks?opt_fields=permalink_url`, {
    method: "POST",
    body: JSON.stringify({ data: {
      name: input.name, notes: input.notes, assignee: input.assignee, due_on: input.dueOn,
      projects: [MR_ASANA.project],
      memberships: [{ project: MR_ASANA.project, section: MR_ASANA.section }],
      custom_fields: MR_ASANA.customFields,
    } }),
  });
  return { gid: json.data.gid, url: json.data.permalink_url };
}

export async function createSubtask(parentGid: string, input: TaskInput): Promise<{ gid: string; url: string }> {
  const json = await asanaFetch(`/tasks/${parentGid}/subtasks?opt_fields=permalink_url`, {
    method: "POST",
    body: JSON.stringify({ data: { name: input.name, notes: input.notes, assignee: input.assignee, due_on: input.dueOn } }),
  });
  return { gid: json.data.gid, url: json.data.permalink_url };
}

// Throws on failure on purpose: the orchestrator must NOT mark a subtask done in the DB when Asana failed.
export async function setCompleted(gid: string, completed: boolean): Promise<void> {
  await asanaFetch(`/tasks/${gid}`, { method: "PUT", body: JSON.stringify({ data: { completed } }) });
}

type Found = { gid: string; url: string };
const MAX_PAGES = 50; // 5,000 tasks: a hard stop so a pagination bug can never loop forever

async function listAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let offset: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const json = await asanaFetch(`${path}&limit=100${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`);
    out.push(...(json.data as T[]));
    offset = json.next_page?.offset ?? null;
    if (!offset) break;
  }
  return out;
}

// Adopt-before-create: a run killed between an Asana create and our DB save leaves an orphan; find it instead of duplicating it.
export async function findParentByName(name: string): Promise<Found | null> {
  const tasks = await listAll<{ gid: string; name: string; completed: boolean; permalink_url: string }>(
    `/sections/${MR_ASANA.section}/tasks?opt_fields=name,completed,permalink_url`,
  );
  const hit = tasks.find((t) => t.name === name && t.completed === false);
  return hit ? { gid: hit.gid, url: hit.permalink_url } : null;
}

export async function findSubtask(parentGid: string, name: string, assigneeEmail: string): Promise<Found | null> {
  const tasks = await listAll<{ gid: string; name: string; assignee: { email?: string } | null; permalink_url: string }>(
    `/tasks/${parentGid}/subtasks?opt_fields=name,assignee.email,permalink_url`,
  );
  const email = assigneeEmail.toLowerCase();
  const hit = tasks.find((t) => t.name === name && t.assignee?.email?.toLowerCase() === email);
  return hit ? { gid: hit.gid, url: hit.permalink_url } : null;
}
