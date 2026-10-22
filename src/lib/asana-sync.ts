/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/async-await-in-loop */
// ═══════════════════════════════════════════════════════════════
// Bidirectional Asana ↔ Hub Gantt sync utility.
// Handles: status, assignee, dates, task create/delete.
// ═══════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import { aac, clientGanttTasks, clientOnboardingSteps } from "@/lib/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import {
  asanaFetch,
  setAsanaTaskCompleted,
  updateAsanaTaskAssignee,
  updateAsanaTask,
  type AsanaTaskDetails,
} from "@/lib/onboarding/create-asana-project";

// ── Types ────────────────────────────────────────────────────────

interface AsanaProjectTask {
  gid: string;
  name: string;
  completed: boolean;
  assignee: { gid: string; name: string; email?: string } | null;
  start_on: string | null;
  due_on: string | null;
}

export interface SyncResult {
  synced: number;
  created: number;
  errors: string[];
}

// ── Helpers ──────────────────────────────────────────────────────

/** Get the Asana project GID for a client (from aac table) */
export async function getAsanaProjectGid(
  clientIdCode: string
): Promise<string | null> {
  // First check aac.asanaProjectGid (new column)
  const [client] = await db
    .select({ asanaProjectGid: aac.asanaProjectGid })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  if (client?.asanaProjectGid) return client.asanaProjectGid;

  // Fallback: read from onboarding step metadata (legacy)
  const [step] = await db
    .select({ metadata: clientOnboardingSteps.metadata })
    .from(clientOnboardingSteps)
    .where(
      and(
        eq(clientOnboardingSteps.clientIdCode, clientIdCode),
        eq(clientOnboardingSteps.stepKey, "setup_asana")
      )
    )
    .limit(1);

  const gid =
    step?.metadata &&
    typeof step.metadata === "object" &&
    "projectGid" in step.metadata
      ? String(step.metadata.projectGid)
      : null;

  // Backfill to aac for future fast lookups
  if (gid) {
    await db
      .update(aac)
      .set({ asanaProjectGid: gid })
      .where(eq(aac.clientIdCode, clientIdCode));
  }

  return gid;
}

/** Fetch all tasks from an Asana project with details */
export async function listAsanaProjectTasks(
  projectGid: string
): Promise<AsanaProjectTask[]> {
  const allTasks: AsanaProjectTask[] = [];
  let nextPage: string | null = null;
  const fields = "name,completed,assignee.name,assignee.email,start_on,due_on";

  do {
    const url = nextPage
      ? nextPage
      : `/projects/${projectGid}/tasks?opt_fields=${fields}&limit=100`;
    const res = await asanaFetch(url);
    allTasks.push(...(res.data as AsanaProjectTask[]));
    nextPage = res.next_page?.uri ?? null;
  } while (nextPage);

  return allTasks;
}

/**
 * Parse an Asana task name to extract the section, taskName, and subtaskTitle.
 * 3-part: "{CIC} | {Section} | {TaskName}" → taskName only, no subtask
 * 4-part: "{CIC} | {Section} | {TaskName} | {Subtask}" → taskName + subtask
 */
function parseAsanaTaskName(name: string): {
  section: string;
  taskName: string;
  subtaskTitle: string | null;
} | null {
  const parts = name.split(" | ").map((s) => s.trim());
  if (parts.length < 3) return null;

  // 3-part: CIC | Section | Task (standalone task, no subtask)
  if (parts.length === 3) {
    return { section: parts[1], taskName: parts[2], subtaskTitle: null };
  }

  // 4-part: CIC | Section | Task | Subtask
  return {
    section: parts[1],
    taskName: parts[2],
    subtaskTitle: parts[3],
  };
}

// ═══════════════════════════════════════════════════════════════
// HUB → ASANA (push changes from Gantt to Asana)
// ═══════════════════════════════════════════════════════════════

/** Convert Gantt startDay + onboardingDate to an ISO date string */
function ganttDayToDate(startDay: number, onboardingDate: Date): string {
  const d = new Date(onboardingDate);
  d.setDate(d.getDate() + startDay - 1);
  return d.toISOString().slice(0, 10);
}

function ganttEndDate(startDay: number, durationDays: number, onboardingDate: Date): string {
  const d = new Date(onboardingDate);
  d.setDate(d.getDate() + startDay - 1 + Math.max(durationDays - 1, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Push a single Gantt task update to Asana.
 * Called after Gantt task PATCH. Only syncs if asanaTaskGid exists.
 */
export async function pushTaskToAsana(
  ganttTask: {
    asanaTaskGid: string | null;
    status: string;
    assignedTo: string | null;
    startDay: number;
    durationDays: number;
    clientIdCode: string;
  },
  changedFields: string[]
): Promise<{ ok: boolean; error?: string }> {
  if (!ganttTask.asanaTaskGid) return { ok: true }; // no linked Asana task

  try {
    // Get onboarding date for date calculations
    const [client] = await db
      .select({ onboardingDate: aac.onboardingDate })
      .from(aac)
      .where(eq(aac.clientIdCode, ganttTask.clientIdCode))
      .limit(1);

    const promises: Promise<unknown>[] = [];

    // Status sync
    if (changedFields.includes("status")) {
      const completed = ganttTask.status === "completed";
      promises.push(setAsanaTaskCompleted(ganttTask.asanaTaskGid, completed));
    }

    // Assignee sync
    if (changedFields.includes("assignedTo")) {
      promises.push(
        updateAsanaTaskAssignee(
          ganttTask.asanaTaskGid,
          ganttTask.assignedTo || "null"
        )
      );
    }

    // Date sync (only if we have an onboarding date)
    if (
      client?.onboardingDate &&
      (changedFields.includes("startDay") || changedFields.includes("durationDays"))
    ) {
      const start_on = ganttDayToDate(ganttTask.startDay, client.onboardingDate);
      const due_on = ganttEndDate(
        ganttTask.startDay,
        ganttTask.durationDays,
        client.onboardingDate
      );
      promises.push(updateAsanaTask(ganttTask.asanaTaskGid, { start_on, due_on }));
    }

    await Promise.all(promises);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[AsanaSync] pushTaskToAsana error:", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Create an Asana task in the client's project and return its GID.
 * Called when a new task is added in Hub Gantt.
 */
export async function createAsanaTaskForGantt(
  clientIdCode: string,
  task: {
    section: string;
    taskName: string;
    subtaskTitle: string | null;
    startDay: number;
    durationDays: number;
  }
): Promise<string | null> {
  const projectGid = await getAsanaProjectGid(clientIdCode);
  if (!projectGid) return null;

  try {
    // Build Asana task name in the standard format
    const nameParts = [clientIdCode, task.section];
    if (task.subtaskTitle) {
      nameParts.push(task.taskName, task.subtaskTitle);
    } else {
      nameParts.push(task.taskName);
    }
    const asanaName = nameParts.join(" | ");

    // Get onboarding date for date fields
    const [client] = await db
      .select({ onboardingDate: aac.onboardingDate })
      .from(aac)
      .where(eq(aac.clientIdCode, clientIdCode))
      .limit(1);

    const taskData: Record<string, unknown> = {
      name: asanaName,
      projects: [projectGid],
    };

    if (client?.onboardingDate) {
      taskData.start_on = ganttDayToDate(task.startDay, client.onboardingDate);
      taskData.due_on = ganttEndDate(task.startDay, task.durationDays, client.onboardingDate);
    }

    const { data } = await asanaFetch("/tasks", {
      method: "POST",
      body: JSON.stringify({ data: taskData }),
    });

    return data.gid as string;
  } catch (err) {
    console.error("[AsanaSync] createAsanaTaskForGantt error:", err);
    return null;
  }
}

/**
 * Mark an Asana task as completed when deleted from Hub Gantt.
 * We don't delete from Asana — just mark completed to preserve history.
 */
export async function markAsanaTaskOnDelete(
  asanaTaskGid: string | null
): Promise<void> {
  if (!asanaTaskGid) return;
  try {
    await setAsanaTaskCompleted(asanaTaskGid, true);
  } catch (err) {
    console.error("[AsanaSync] markAsanaTaskOnDelete error:", err);
  }
}

// ═══════════════════════════════════════════════════════════════
// ASANA → HUB (pull changes from Asana into Gantt)
// ═══════════════════════════════════════════════════════════════

/** Convert an ISO date string to a Gantt startDay relative to onboarding date */
function dateToGanttDay(dateStr: string, onboardingDate: Date): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const base = new Date(onboardingDate);
  base.setHours(0, 0, 0, 0);
  const diffMs = d.getTime() - base.getTime();
  return Math.max(1, Math.round(diffMs / 86400000) + 1);
}

/**
 * Full pull sync: fetch all Asana tasks and reconcile with Gantt rows.
 * Matches by asanaTaskGid first, then by name pattern.
 */
export async function pullSyncFromAsana(
  clientIdCode: string
): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, created: 0, errors: [] };

  const projectGid = await getAsanaProjectGid(clientIdCode);
  if (!projectGid) {
    result.errors.push("No Asana project linked");
    return result;
  }

  // Get onboarding date
  const [client] = await db
    .select({ onboardingDate: aac.onboardingDate })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  // Fetch all Asana tasks
  let asanaTasks: AsanaProjectTask[];
  try {
    asanaTasks = await listAsanaProjectTasks(projectGid);
  } catch (err) {
    result.errors.push(`Failed to fetch Asana tasks: ${err instanceof Error ? err.message : "Unknown"}`);
    return result;
  }

  // Get all Gantt rows for this client
  const ganttRows = await db
    .select()
    .from(clientGanttTasks)
    .where(eq(clientGanttTasks.clientIdCode, clientIdCode));

  // Build lookup maps
  const ganttByGid = new Map(
    ganttRows.filter((r) => r.asanaTaskGid).map((r) => [r.asanaTaskGid!, r])
  );

  for (const asanaTask of asanaTasks) {
    try {
      // Skip section headers (Asana sections appear as tasks with ":" suffix)
      if (asanaTask.name.endsWith(":")) continue;

      // 1. Try matching by stored GID
      let ganttRow = ganttByGid.get(asanaTask.gid);

      // 2. Try matching by name pattern
      // Asana: "{CIC} | Section | Task" or "{CIC} | Section | Group | SubAction"
      // Gantt: section="Onboarding", taskName="1o8 Hub" (group), subtaskTitle="Create Client"
      if (!ganttRow) {
        const parts = asanaTask.name.split(" | ").map((s) => s.trim());
        if (parts.length >= 3) {
          const asanaSection = parts[1];
          const asanaLastPart = parts[parts.length - 1];

          ganttRow = ganttRows.find((row) => {
            if (row.section !== asanaSection) return false;
            if (parts.length === 3) {
              // 3-part: match subtaskTitle first, then taskName
              if (row.subtaskTitle === asanaLastPart) return true;
              if (row.taskName === asanaLastPart && !row.subtaskTitle) return true;
              return false;
            }
            if (parts.length === 4) {
              // 4-part: group=parts[2], action=parts[3]
              return row.taskName === parts[2] && row.subtaskTitle === parts[3];
            }
            return false;
          });
        }
      }

      if (ganttRow) {
        // Update existing Gantt row from Asana
        const updates: Record<string, unknown> = { updatedAt: new Date() };

        // Always store/update the Asana GID
        if (!ganttRow.asanaTaskGid) {
          updates.asanaTaskGid = asanaTask.gid;
        }

        // Status sync
        const asanaCompleted = asanaTask.completed;
        if (asanaCompleted && ganttRow.status !== "completed") {
          updates.status = "completed";
          updates.completionPct = 100;
          updates.completedAt = new Date();
        } else if (!asanaCompleted && ganttRow.status === "completed") {
          updates.status = "in_progress";
          updates.completionPct = 0;
          updates.completedAt = null;
        }

        // Assignee sync
        const asanaEmail = asanaTask.assignee?.email ?? null;
        if (asanaEmail !== ganttRow.assignedTo) {
          updates.assignedTo = asanaEmail;
        }

        // Date sync (only if onboarding date exists)
        if (client?.onboardingDate && asanaTask.start_on) {
          const newStartDay = dateToGanttDay(asanaTask.start_on, client.onboardingDate);
          if (newStartDay !== ganttRow.startDay) {
            updates.startDay = newStartDay;
            updates.weekStart = Math.ceil(newStartDay / 7);
          }

          if (asanaTask.due_on) {
            const endDay = dateToGanttDay(asanaTask.due_on, client.onboardingDate);
            const newDuration = Math.max(1, endDay - newStartDay + 1);
            if (newDuration !== ganttRow.durationDays) {
              updates.durationDays = newDuration;
              updates.weekEnd = Math.ceil(endDay / 7);
            }
          }
        }

        if (Object.keys(updates).length > 1) {
          // More than just updatedAt
          await db
            .update(clientGanttTasks)
            .set(updates)
            .where(eq(clientGanttTasks.id, ganttRow.id));
          result.synced++;
        }
      }
      // Note: we don't auto-create Gantt rows from new Asana tasks,
      // since Gantt is template-driven. New tasks should be added in Hub first.
    } catch (err) {
      result.errors.push(
        `Task "${asanaTask.name}": ${err instanceof Error ? err.message : "Unknown"}`
      );
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// WEBHOOK HANDLER (Asana → Hub push via webhook)
// ═══════════════════════════════════════════════════════════════

interface AsanaWebhookEvent {
  action: "changed" | "added" | "deleted" | "removed" | "undeleted";
  resource: {
    gid: string;
    resource_type: "task" | "story" | "project";
  };
  parent?: { gid: string };
  change?: {
    field: string;
    action: string;
    new_value?: unknown;
  };
}

/**
 * Process a batch of Asana webhook events.
 * Called from the webhook API route.
 */
export async function processWebhookEvents(
  events: AsanaWebhookEvent[]
): Promise<{ processed: number; errors: string[] }> {
  const result = { processed: 0, errors: [] as string[] };

  // Collect unique task GIDs that changed
  const changedTaskGids = new Set<string>();
  for (const event of events) {
    if (event.resource.resource_type === "task") {
      changedTaskGids.add(event.resource.gid);
    }
  }

  if (changedTaskGids.size === 0) return result;

  // Find matching Gantt rows by asanaTaskGid
  const ganttRows = await db
    .select()
    .from(clientGanttTasks)
    .where(isNotNull(clientGanttTasks.asanaTaskGid));

  const ganttByGid = new Map(
    ganttRows.filter((r) => r.asanaTaskGid).map((r) => [r.asanaTaskGid!, r])
  );

  // Fetch updated task details from Asana and sync
  for (const taskGid of changedTaskGids) {
    const ganttRow = ganttByGid.get(taskGid);
    if (!ganttRow) continue; // Not a tracked task

    try {
      const { data: asanaTask } = await asanaFetch(
        `/tasks/${taskGid}?opt_fields=name,completed,assignee.email,start_on,due_on`
      );

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      // Status
      if (asanaTask.completed && ganttRow.status !== "completed") {
        updates.status = "completed";
        updates.completionPct = 100;
        updates.completedAt = new Date();
      } else if (!asanaTask.completed && ganttRow.status === "completed") {
        updates.status = "in_progress";
        updates.completionPct = 0;
        updates.completedAt = null;
      }

      // Assignee
      const asanaEmail = asanaTask.assignee?.email ?? null;
      if (asanaEmail !== ganttRow.assignedTo) {
        updates.assignedTo = asanaEmail;
      }

      // Dates
      if (asanaTask.start_on) {
        const [client] = await db
          .select({ onboardingDate: aac.onboardingDate })
          .from(aac)
          .where(eq(aac.clientIdCode, ganttRow.clientIdCode))
          .limit(1);

        if (client?.onboardingDate) {
          const newStartDay = dateToGanttDay(asanaTask.start_on, client.onboardingDate);
          if (newStartDay !== ganttRow.startDay) {
            updates.startDay = newStartDay;
            updates.weekStart = Math.ceil(newStartDay / 7);
          }
          if (asanaTask.due_on) {
            const endDay = dateToGanttDay(asanaTask.due_on, client.onboardingDate);
            const newDuration = Math.max(1, endDay - newStartDay + 1);
            if (newDuration !== ganttRow.durationDays) {
              updates.durationDays = newDuration;
              updates.weekEnd = Math.ceil(endDay / 7);
            }
          }
        }
      }

      if (Object.keys(updates).length > 1) {
        await db
          .update(clientGanttTasks)
          .set(updates)
          .where(eq(clientGanttTasks.id, ganttRow.id));
        result.processed++;
      }
    } catch (err) {
      result.errors.push(
        `Task ${taskGid}: ${err instanceof Error ? err.message : "Unknown"}`
      );
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// WEBHOOK REGISTRATION
// ═══════════════════════════════════════════════════════════════

/**
 * Register an Asana webhook for a project.
 * The target URL must be publicly accessible (production).
 */
export async function registerAsanaWebhook(
  projectGid: string,
  targetUrl: string
): Promise<{ webhookGid: string } | { error: string }> {
  try {
    const { data } = await asanaFetch("/webhooks", {
      method: "POST",
      body: JSON.stringify({
        data: {
          resource: projectGid,
          target: targetUrl,
          filters: [
            { resource_type: "task", action: "changed" },
            { resource_type: "task", action: "added" },
            { resource_type: "task", action: "deleted" },
          ],
        },
      }),
    });
    return { webhookGid: data.gid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[AsanaSync] registerWebhook error:", msg);
    return { error: msg };
  }
}
