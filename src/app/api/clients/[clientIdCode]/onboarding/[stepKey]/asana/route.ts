import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientGanttTasks, clientOnboardingSteps, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getStepDef, STEP_TO_GANTT } from "@/lib/onboarding/steps";
import {
  STEP_TO_ASANA_TASK,
  findAsanaTaskInProject,
  getAsanaTaskDetails,
  getAsanaComments,
  updateAsanaTask,
  addAsanaCollaborator,
  removeAsanaCollaborator,
  addAsanaTaskComment,
  updateAsanaTaskAssignee,
  createAsanaOrgProbe,
} from "@/lib/onboarding/create-asana-project";
import { resolveAssigneeForProject } from "@/lib/onboarding/resolve-assignee";

// Extract an Asana TASK GID from a raw GID or a pasted Asana URL.
// URL shapes seen in the wild:
//   /0/<project>/<task>/f                       → last digit run = task
//   /1/<workspace>/project/<p>/task/<t>         → /task/<t> = task (must beat /project/<p>)
//   /1/<workspace>/project/<p>                  → /project/<p> (no task in URL)
// Raw GID alone is also the last digit run.
function extractAsanaGid(input: string): string | null {
  const path = input.split(/[?#]/)[0];
  const taskMatch = path.match(/\/task\/(\d{6,})/);
  if (taskMatch) return taskMatch[1];
  const projectMatch = path.match(/\/project\/(\d{6,})/);
  if (projectMatch) return projectMatch[1];
  const matches = path.match(/\d{6,}/g);
  if (!matches?.length) return null;
  return matches[matches.length - 1];
}

type Params = { params: Promise<{ clientIdCode: string; stepKey: string }> };

/** Resolve the Asana task GID for this onboarding step.
 *  Prefers a manually-linked task GID stored on the step's metadata; falls back to
 *  name-matching the task inside the project linked on the setup_asana step. */
async function resolveTaskGid(
  clientIdCode: string,
  stepKey: string
): Promise<string | null> {
  // 1. Manual override stored on the step itself
  const [stepRow] = await db
    .select({ metadata: clientOnboardingSteps.metadata })
    .from(clientOnboardingSteps)
    .where(
      and(
        eq(clientOnboardingSteps.clientIdCode, clientIdCode),
        eq(clientOnboardingSteps.stepKey, stepKey)
      )
    )
    .limit(1);

  const manualGid =
    stepRow?.metadata &&
    typeof stepRow.metadata === "object" &&
    "asanaTaskGid" in stepRow.metadata &&
    typeof stepRow.metadata.asanaTaskGid === "string"
      ? stepRow.metadata.asanaTaskGid
      : null;
  if (manualGid) return manualGid;

  // 2. Fallback: name-match inside the linked project
  const asanaTaskName = STEP_TO_ASANA_TASK[stepKey];
  if (!asanaTaskName) return null;

  const projectGid = await resolveProjectGid(clientIdCode);
  if (!projectGid) {
    return null;
  }
  const taskGid = await findAsanaTaskInProject(projectGid, asanaTaskName);
  return taskGid;
}

/**
 * The Asana project linked to this client, from the setup_asana step metadata.
 * Needed on its own for assignee resolution: which address a person has depends on
 * which org owns the project.
 */
async function resolveProjectGid(clientIdCode: string): Promise<string | null> {
  const [asanaStep] = await db
    .select({ metadata: clientOnboardingSteps.metadata })
    .from(clientOnboardingSteps)
    .where(
      and(
        eq(clientOnboardingSteps.clientIdCode, clientIdCode),
        eq(clientOnboardingSteps.stepKey, "setup_asana")
      )
    )
    .limit(1);

  return asanaStep?.metadata &&
    typeof asanaStep.metadata === "object" &&
    "projectGid" in asanaStep.metadata
    ? String(asanaStep.metadata.projectGid)
    : null;
}

/**
 * GET — Fetch Asana task details + comments for this step
 */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientIdCode, stepKey } = await params;
  if (!getStepDef(stepKey)) return NextResponse.json({ error: "Unknown step" }, { status: 400 });

  const taskGid = await resolveTaskGid(clientIdCode, stepKey);
  if (!taskGid) {
    return NextResponse.json({ linked: false, task: null, comments: [] });
  }

  const [task, comments] = await Promise.all([
    getAsanaTaskDetails(taskGid),
    getAsanaComments(taskGid),
  ]);

  // Sync: if Asana task is completed but onboarding step isn't, auto-mark it
  if (task?.completed) {
    const [step] = await db
      .select({ status: clientOnboardingSteps.status })
      .from(clientOnboardingSteps)
      .where(
        and(
          eq(clientOnboardingSteps.clientIdCode, clientIdCode),
          eq(clientOnboardingSteps.stepKey, stepKey)
        )
      )
      .limit(1);

    if (step && step.status !== "completed") {
      await db
        .update(clientOnboardingSteps)
        .set({
          status: "completed",
          completedAt: new Date(),
          completedBy: "asana-sync",
        })
        .where(
          and(
            eq(clientOnboardingSteps.clientIdCode, clientIdCode),
            eq(clientOnboardingSteps.stepKey, stepKey)
          )
        );
    }
  }

  // Sync: pull Asana assignee email into Gantt row
  const ganttMapping = STEP_TO_GANTT[stepKey];
  if (ganttMapping && task) {
    const asanaEmail = task.assignee?.email ?? null;
    const conds = [
      eq(clientGanttTasks.clientIdCode, clientIdCode),
      eq(clientGanttTasks.section, "Onboarding"),
      eq(clientGanttTasks.taskName, ganttMapping.taskName),
    ];
    if (ganttMapping.subtaskTitle) conds.push(eq(clientGanttTasks.subtaskTitle, ganttMapping.subtaskTitle));
    await db.update(clientGanttTasks).set({ assignedTo: asanaEmail, updatedAt: new Date() }).where(and(...conds));
  }

  return NextResponse.json({ linked: true, taskGid, task, comments });
}

/**
 * PATCH — Update Asana task fields (start_on, due_on, assignee)
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode, stepKey } = await params;
  if (!getStepDef(stepKey)) return NextResponse.json({ error: "Unknown step" }, { status: 400 });

  const taskGid = await resolveTaskGid(clientIdCode, stepKey);
  if (!taskGid) {
    return NextResponse.json({ error: "No linked Asana task" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, string | null> = {};

  if ("start_on" in body) updates.start_on = body.start_on || null;
  if ("due_on" in body) updates.due_on = body.due_on || null;

  // Asana requires both start_on and due_on together — fill missing from current task
  if (("start_on" in updates || "due_on" in updates) && !("start_on" in updates && "due_on" in updates)) {
    const current = await getAsanaTaskDetails(taskGid);
    if (!("start_on" in updates)) updates.start_on = current?.start_on ?? null;
    if (!("due_on" in updates)) updates.due_on = current?.due_on ?? updates.start_on ?? null;
  }
  // Ensure due_on >= start_on
  if (updates.start_on && !updates.due_on) updates.due_on = updates.start_on;
  if ("assignee" in body) {
    // Assignee accepts email or "null" to clear.
    let target = body.assignee ? String(body.assignee) : "null";

    // The dropdown sends `asanaEmail || email`, which is only ever correct for one
    // of the two orgs — and after the rebrand a person has a row in each. Treat
    // whatever arrived as an identifier and re-resolve it against the org that owns
    // this project, so picking either of a person's rows works.
    if (target !== "null") {
      const projectGid = await resolveProjectGid(clientIdCode);
      if (projectGid) {
        const allUsers = await db
          .select({ name: users.name, email: users.email, asanaEmail: users.asanaEmail })
          .from(users);
        const resolved = await resolveAssigneeForProject(
          target,
          projectGid,
          allUsers,
          createAsanaOrgProbe()
        );
        if (resolved) target = resolved;
      }
    }

    const ok = await updateAsanaTaskAssignee(taskGid, target);
    if (!ok) return NextResponse.json({ error: "Failed — user may not be in the Asana organization" }, { status: 400 });

    // Sync assignee to Gantt timeline (store the address Asana actually holds, which
    // the Gantt dropdown matches on either email or asanaEmail)
    const ganttMapping = STEP_TO_GANTT[stepKey];
    if (ganttMapping) {
      const assigneeEmail: string | null = target === "null" ? null : target;
      const conds = [
        eq(clientGanttTasks.clientIdCode, clientIdCode),
        eq(clientGanttTasks.section, "Onboarding"),
        eq(clientGanttTasks.taskName, ganttMapping.taskName),
      ];
      if (ganttMapping.subtaskTitle) conds.push(eq(clientGanttTasks.subtaskTitle, ganttMapping.subtaskTitle));
      await db.update(clientGanttTasks).set({ assignedTo: assigneeEmail, updatedAt: new Date() }).where(and(...conds));
    }
  }

  if (Object.keys(updates).length > 0) {
    const result = await updateAsanaTask(taskGid, updates);
    if (!result.ok) return NextResponse.json({ error: result.error || "Failed to update task" }, { status: 500 });
  }

  const task = await getAsanaTaskDetails(taskGid);
  return NextResponse.json({ success: true, task });
}

/**
 * POST — Add collaborator or comment
 * Body: { action: "add_collaborator", email: "..." }
 *     | { action: "remove_collaborator", identifier: "..." }
 *     | { action: "add_comment", text: "..." }
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode, stepKey } = await params;
  if (!getStepDef(stepKey)) return NextResponse.json({ error: "Unknown step" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // Manual link: paste an Asana task GID or URL to map it to this onboarding step.
  if (body.action === "link_task") {
    const taskGid = extractAsanaGid(String(body.taskGid ?? ""));
    if (!taskGid) {
      return NextResponse.json({ error: "Could not parse an Asana task GID from the input" }, { status: 400 });
    }
    // Validate the task exists in Asana
    const task = await getAsanaTaskDetails(taskGid);
    if (!task) {
      return NextResponse.json({ error: "Asana task not found for that GID" }, { status: 400 });
    }
    // Merge asanaTaskGid into the step's metadata
    const [existing] = await db
      .select({ metadata: clientOnboardingSteps.metadata })
      .from(clientOnboardingSteps)
      .where(and(eq(clientOnboardingSteps.clientIdCode, clientIdCode), eq(clientOnboardingSteps.stepKey, stepKey)))
      .limit(1);
    const baseMeta: Record<string, unknown> =
      existing?.metadata && typeof existing.metadata === "object" ? { ...(existing.metadata as Record<string, unknown>) } : {};
    baseMeta.asanaTaskGid = taskGid;
    await db
      .insert(clientOnboardingSteps)
      .values({ clientIdCode, stepKey, status: "pending", metadata: baseMeta })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: { metadata: baseMeta, updatedAt: new Date() },
      });
    // Mirror the link onto the matching gantt row (when there's a mapping)
    const mapping = STEP_TO_GANTT[stepKey];
    if (mapping) {
      const conds = [
        eq(clientGanttTasks.clientIdCode, clientIdCode),
        eq(clientGanttTasks.section, "Onboarding"),
        eq(clientGanttTasks.taskName, mapping.taskName),
      ];
      if (mapping.subtaskTitle) conds.push(eq(clientGanttTasks.subtaskTitle, mapping.subtaskTitle));
      await db.update(clientGanttTasks).set({ asanaTaskGid: taskGid, updatedAt: new Date() }).where(and(...conds));
    }
    const comments = await getAsanaComments(taskGid);
    return NextResponse.json({ success: true, linked: true, taskGid, task, comments });
  }

  if (body.action === "unlink_task") {
    const [existing] = await db
      .select({ metadata: clientOnboardingSteps.metadata })
      .from(clientOnboardingSteps)
      .where(and(eq(clientOnboardingSteps.clientIdCode, clientIdCode), eq(clientOnboardingSteps.stepKey, stepKey)))
      .limit(1);
    if (existing?.metadata && typeof existing.metadata === "object") {
      const meta = { ...(existing.metadata as Record<string, unknown>) };
      delete meta.asanaTaskGid;
      await db
        .update(clientOnboardingSteps)
        .set({ metadata: meta, updatedAt: new Date() })
        .where(and(eq(clientOnboardingSteps.clientIdCode, clientIdCode), eq(clientOnboardingSteps.stepKey, stepKey)));
    }
    const mapping = STEP_TO_GANTT[stepKey];
    if (mapping) {
      const conds = [
        eq(clientGanttTasks.clientIdCode, clientIdCode),
        eq(clientGanttTasks.section, "Onboarding"),
        eq(clientGanttTasks.taskName, mapping.taskName),
      ];
      if (mapping.subtaskTitle) conds.push(eq(clientGanttTasks.subtaskTitle, mapping.subtaskTitle));
      await db.update(clientGanttTasks).set({ asanaTaskGid: null, updatedAt: new Date() }).where(and(...conds));
    }
    return NextResponse.json({ success: true, linked: false });
  }

  const taskGid = await resolveTaskGid(clientIdCode, stepKey);
  if (!taskGid) {
    return NextResponse.json({ error: "No linked Asana task" }, { status: 404 });
  }

  if (body.action === "add_collaborator") {
    if (!body.email) return NextResponse.json({ error: "Email required" }, { status: 400 });
    const ok = await addAsanaCollaborator(taskGid, body.email);
    if (!ok) return NextResponse.json({ error: "Failed to add collaborator" }, { status: 500 });
    const task = await getAsanaTaskDetails(taskGid);
    return NextResponse.json({ success: true, task });
  }

  if (body.action === "remove_collaborator") {
    if (!body.identifier) return NextResponse.json({ error: "Identifier required" }, { status: 400 });
    const ok = await removeAsanaCollaborator(taskGid, body.identifier);
    if (!ok) return NextResponse.json({ error: "Failed to remove collaborator" }, { status: 500 });
    const task = await getAsanaTaskDetails(taskGid);
    return NextResponse.json({ success: true, task });
  }

  if (body.action === "add_comment") {
    if (!body.text?.trim()) return NextResponse.json({ error: "Comment text required" }, { status: 400 });
    const ok = await addAsanaTaskComment(taskGid, body.text.trim());
    if (!ok) return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
    const comments = await getAsanaComments(taskGid);
    return NextResponse.json({ success: true, comments });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
