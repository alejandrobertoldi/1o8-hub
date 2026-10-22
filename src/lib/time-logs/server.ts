import { and, asc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { aac, asanaTasks } from "@/lib/db/schema";
import { ASANA_COMPLETED_WINDOW_DAYS } from "@/lib/my-dashboard/asana-map";
import {
  INTERNAL_CLIENT_CODE,
  INTERNAL_CLIENT_NAME,
  INTERNAL_PROJECTS,
  billingTypeFor,
  generalProjectNumber,
  isValidHours,
  isWorkType,
  taskProjectNumber,
  workTypeTag,
} from "./catalog";

export type LoggableClient = { code: string; name: string; estimatedHours: number | null };
export type LoggableProject = {
  projectNumber: string;
  name: string;
  asanaTaskGid: string | null;
  status: "Open" | "Completed";
  assignee: string | null;
  url: string | null;
};

/** 1O8 (internal) first, then every ACTIVE AAC client. */
export async function listLoggableClients(): Promise<LoggableClient[]> {
  const rows = await db.select({ code: aac.clientIdCode, name: aac.clientName, status: aac.clientStatus, raw: aac.rawData }).from(aac);
  const active = rows
    .filter((r) => (r.status ?? "").toLowerCase() === "active" && r.code.toUpperCase() !== INTERNAL_CLIENT_CODE)
    .map((r) => {
      const raw = (r.raw ?? {}) as Record<string, string>;
      const est = Number(String(raw["Estimated Hours TOTAL"] ?? "").replace(/[^\d.]/g, ""));
      return { code: r.code, name: r.name ?? r.code, estimatedHours: Number.isFinite(est) && est > 0 ? est : null };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  return [{ code: INTERNAL_CLIENT_CODE, name: INTERNAL_CLIENT_NAME, estimatedHours: null }, ...active];
}

/**
 * Valid projects for a client: the general CODE00000 (or the 1O8 internal
 * codes), then Asana tasks that are open or were completed in the last 14
 * days. A department with a team tag narrows the tasks to that team; if that
 * leaves none, every task is shown (`narrowed: false`).
 */
export async function listProjects(clientCode: string, department?: string | null): Promise<{ projects: LoggableProject[]; narrowed: boolean }> {
  const code = clientCode.toUpperCase();
  const cutoff = new Date(Date.now() - ASANA_COMPLETED_WINDOW_DAYS * 86_400_000);
  const tasks = await db
    .select({
      gid: asanaTasks.gid,
      name: asanaTasks.name,
      internalId: asanaTasks.internalId,
      completed: asanaTasks.completed,
      assignee: asanaTasks.assigneeName,
      url: asanaTasks.permalinkUrl,
      tags: asanaTasks.serviceTags,
    })
    .from(asanaTasks)
    .where(
      and(
        sql`upper(${asanaTasks.clientIdCode}) = ${code}`,
        or(eq(asanaTasks.completed, false), gte(asanaTasks.completedAt, cutoff), and(eq(asanaTasks.completed, true), isNull(asanaTasks.completedAt), gte(asanaTasks.syncedAt, cutoff))),
      ),
    )
    .orderBy(asc(asanaTasks.completed), asc(asanaTasks.name));

  const taskProjects: (LoggableProject & { tags: string[] })[] = [];
  const seen = new Set<string>();
  for (const t of tasks) {
    const number = taskProjectNumber(code, t.internalId);
    if (!number || seen.has(number)) continue;
    seen.add(number);
    taskProjects.push({
      projectNumber: number,
      name: t.name,
      asanaTaskGid: t.gid,
      status: t.completed ? "Completed" : "Open",
      assignee: t.assignee,
      url: t.url,
      tags: t.tags,
    });
  }

  const tag = department ? workTypeTag(department) : null;
  const tagged = tag ? taskProjects.filter((p) => p.tags.includes(tag)) : taskProjects;
  const narrowed = !!tag && tagged.length > 0;
  const shown = (narrowed ? tagged : taskProjects).map(({ tags: _tags, ...p }) => p);

  const fixed: LoggableProject[] =
    code === INTERNAL_CLIENT_CODE
      ? INTERNAL_PROJECTS.map((p) => ({ projectNumber: p.projectNumber, name: p.name, asanaTaskGid: null, status: "Open" as const, assignee: null, url: null }))
      : [{ projectNumber: generalProjectNumber(code), name: "General account work (no Asana task)", asanaTaskGid: null, status: "Open", assignee: null, url: null }];

  return { projects: [...fixed, ...shown], narrowed };
}

export const timeLogInputSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date"),
  hours: z.coerce.number().refine(isValidHours, "Hours must be 0.25–24 in 0.25 steps"),
  clientIdCode: z.string().trim().min(1, "Pick a client"),
  department: z.string().refine(isWorkType, "Pick a department / type of work"),
  projectNumber: z.string().trim().min(1, "Pick a project"),
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => v || null),
});
export type TimeLogInput = z.infer<typeof timeLogInputSchema>;

/**
 * Validates client + project against what is loggable right now and returns
 * the row to store. `keep` lets an edit keep a project that has since dropped
 * out of the completed-task window (the snapshot name is reused).
 */
export async function resolveTimeLog(
  input: TimeLogInput,
  keep?: { projectNumber: string; projectName: string; asanaTaskGid: string | null; clientIdCode: string },
): Promise<{ ok: true; values: Omit<TimeLogInput, "clientIdCode"> & { clientIdCode: string; projectName: string; asanaTaskGid: string | null; billingType: string } } | { ok: false; error: string }> {
  const clients = await listLoggableClients();
  const client = clients.find((c) => c.code.toUpperCase() === input.clientIdCode.toUpperCase());
  if (!client) return { ok: false, error: `${input.clientIdCode} is not an active client` };
  const projectNumber = input.projectNumber.toUpperCase();

  let projectName: string;
  let asanaTaskGid: string | null;
  if (keep && keep.projectNumber === projectNumber && keep.clientIdCode.toUpperCase() === client.code.toUpperCase()) {
    projectName = keep.projectName;
    asanaTaskGid = keep.asanaTaskGid;
  } else {
    const { projects } = await listProjects(client.code);
    const project = projects.find((p) => p.projectNumber === projectNumber);
    if (!project) return { ok: false, error: `${projectNumber} is not a valid project for ${client.code}` };
    projectName = project.name;
    asanaTaskGid = project.asanaTaskGid;
  }
  return {
    ok: true,
    values: {
      ...input,
      clientIdCode: client.code,
      projectNumber,
      projectName,
      asanaTaskGid,
      billingType: billingTypeFor(client.code, projectNumber),
    },
  };
}
