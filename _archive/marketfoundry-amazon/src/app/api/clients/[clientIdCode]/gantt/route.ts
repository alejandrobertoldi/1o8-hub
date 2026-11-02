/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/async-await-in-loop */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse, after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientGanttTasks, clientOnboardingSteps, ganttTemplates, aac, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AIA_TASKS, NTA_TASKS } from "@/lib/gantt-templates";
import { STEP_TO_GANTT, ONBOARDING_STEPS } from "@/lib/onboarding/steps";
import { STEP_TO_ASANA_TASK, findAsanaTaskInProject, updateAsanaTaskAssignee, createAsanaOrgProbe } from "@/lib/onboarding/create-asana-project";
import { resolveAssigneeForProject } from "@/lib/onboarding/resolve-assignee";
import { createAsanaTaskForGantt } from "@/lib/asana-sync";

type RouteCtx = { params: Promise<{ clientIdCode: string }> };

/** GET — fetch all gantt tasks for a client */
export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientIdCode } = await params;

  // Sync onboarding step statuses into Gantt onboarding tasks
  const onboardingSteps = await db
    .select({ stepKey: clientOnboardingSteps.stepKey, status: clientOnboardingSteps.status })
    .from(clientOnboardingSteps)
    .where(eq(clientOnboardingSteps.clientIdCode, clientIdCode));

  for (const step of onboardingSteps) {
    const mapping = STEP_TO_GANTT[step.stepKey];
    if (!mapping) continue;

    const isCompleted = step.status === "completed";
    const conditions = [
      eq(clientGanttTasks.clientIdCode, clientIdCode),
      eq(clientGanttTasks.section, "Onboarding"),
      eq(clientGanttTasks.taskName, mapping.taskName),
    ];
    if (mapping.subtaskTitle) {
      conditions.push(eq(clientGanttTasks.subtaskTitle, mapping.subtaskTitle));
    }

    await db
      .update(clientGanttTasks)
      .set({
        status: isCompleted ? "completed" : "pending",
        completionPct: isCompleted ? 100 : 0,
        updatedAt: new Date(),
      })
      .where(and(...conditions));
  }

  const tasks = await db
    .select()
    .from(clientGanttTasks)
    .where(eq(clientGanttTasks.clientIdCode, clientIdCode));

  // Also fetch client type + onboarding date from aac
  const [client] = await db
    .select({ clientType: aac.clientType, onboardingDate: aac.onboardingDate, portalTimelineEnabled: aac.portalTimelineEnabled })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  return NextResponse.json({
    tasks,
    clientType: client?.clientType ?? null,
    onboardingDate: client?.onboardingDate ?? null,
    portalTimelineEnabled: client?.portalTimelineEnabled ?? false,
    initialized: tasks.length > 0,
  });
}

/** POST — initialize timeline from template (snapshot) */
export async function POST(req: NextRequest, { params }: RouteCtx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientIdCode } = await params;
  const body = await req.json();
  const templateType = body.templateType as "AIA" | "NTA";

  if (!templateType || !["AIA", "NTA"].includes(templateType)) {
    return NextResponse.json({ error: "templateType must be AIA or NTA" }, { status: 400 });
  }

  // Delete any existing tasks so Initialize always works (idempotent)
  await db
    .delete(clientGanttTasks)
    .where(eq(clientGanttTasks.clientIdCode, clientIdCode));

  // Ensure gantt_templates are seeded
  const templateRows = await db.select().from(ganttTemplates).where(eq(ganttTemplates.templateType, templateType));

  let templateMap = new Map(templateRows.map((t) => [t.wbs, t.id]));

  if (templateRows.length === 0) {
    // Seed templates on first use
    const seeds = templateType === "AIA" ? AIA_TASKS : NTA_TASKS;
    const inserted = await db.insert(ganttTemplates).values(seeds).returning();
    templateMap = new Map(inserted.map((t) => [t.wbs, t.id]));
  }

  // Create client tasks (snapshot from template)
  const seeds = templateType === "AIA" ? AIA_TASKS : NTA_TASKS;
  const taskValues = seeds.map((t) => ({
    clientIdCode,
    templateTaskId: templateMap.get(t.wbs) ?? null,
    wbs: t.wbs,
    section: t.section,
    taskName: t.taskName,
    subtaskTitle: t.subtaskTitle ?? null,
    weekStart: t.weekStart,
    weekEnd: t.weekEnd,
    startDay: t.startDay,
    durationDays: t.durationDays,
    status: "pending" as const,
    completionPct: 0,
  }));

  const tasks = await db.insert(clientGanttTasks).values(taskValues).returning();

  // Update client type in aac
  await db
    .update(aac)
    .set({ clientType: templateType })
    .where(eq(aac.clientIdCode, clientIdCode));

  // Auto-assign onboarding tasks if team roles already set. Deferred with after()
  // rather than fired-and-forgotten: this writes to Postgres, and an un-awaited
  // write is abandoned when Vercel freezes the sandbox, pinning a pool slot.
  after(async () => {
    try {
      await autoAssignAfterInit(clientIdCode);
    } catch (err) {
      console.error("[AutoAssign] post-init failed:", err);
    }
  });

  return NextResponse.json({ tasks, initialized: true }, { status: 201 });
}

/** PUT — add a single custom task */
export async function PUT(req: NextRequest, { params }: RouteCtx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientIdCode } = await params;
  const body = await req.json();

  const { section, taskName, subtaskTitle, weekStart, weekEnd, wbs, startDay, durationDays } = body;
  if (!section || !taskName) {
    return NextResponse.json({ error: "section, taskName required" }, { status: 400 });
  }

  const sd = Number(startDay) || 1;
  const dur = Number(durationDays) || 0;
  const ws = Number(weekStart) || Math.ceil(sd / 7);
  const we = Number(weekEnd) || Math.ceil((sd + Math.max(dur - 1, 0)) / 7);

  const [task] = await db
    .insert(clientGanttTasks)
    .values({
      clientIdCode,
      wbs: wbs || "X.XX",
      section,
      taskName,
      subtaskTitle: subtaskTitle || null,
      weekStart: ws,
      weekEnd: we,
      startDay: sd,
      durationDays: dur,
      status: "pending",
      completionPct: 0,
    })
    .returning();

  // Create matching Asana task (fire-and-forget)
  createAsanaTaskForGantt(clientIdCode, {
    section,
    taskName,
    subtaskTitle: subtaskTitle || null,
    startDay: sd,
    durationDays: dur,
  })
    .then(async (asanaGid) => {
      if (asanaGid) {
        await db
          .update(clientGanttTasks)
          .set({ asanaTaskGid: asanaGid })
          .where(eq(clientGanttTasks.id, task.id));
      }
    })
    .catch((err) => console.error("[AsanaSync] create task error:", err));

  return NextResponse.json(task, { status: 201 });
}

/** PATCH — update client-level gantt settings (onboardingDate) */
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientIdCode } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.onboardingDate !== undefined) {
    updates.onboardingDate = body.onboardingDate ? new Date(body.onboardingDate) : null;
  }
  if (body.portalTimelineEnabled !== undefined) {
    updates.portalTimelineEnabled = Boolean(body.portalTimelineEnabled);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await db.update(aac).set(updates).where(eq(aac.clientIdCode, clientIdCode));

  return NextResponse.json({ ok: true });
}

/** Auto-assign onboarding Gantt tasks + onboarding steps after timeline init */
async function autoAssignAfterInit(clientIdCode: string) {
  const [client] = await db.select({ rawData: aac.rawData }).from(aac).where(eq(aac.clientIdCode, clientIdCode)).limit(1);
  const rawData = (client?.rawData ?? {}) as Record<string, string>;
  const amName = rawData["AccountManager_MF"]?.trim();
  const esName = rawData["ExecutiveStrategist_MF"]?.trim();
  if (!amName && !esName) return;

  const allUsers = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);
  const resolveEmail = (name: string) => allUsers.find((u) => u.name === name || u.email === name)?.email ?? null;
  const resolveId = (name: string) => allUsers.find((u) => u.name === name || u.email === name)?.id ?? null;
  const amEmail = amName ? resolveEmail(amName) : null;
  const esEmail = esName ? resolveEmail(esName) : null;
  const amId = amName ? resolveId(amName) : null;
  const esId = esName ? resolveId(esName) : null;

  // Gantt tasks
  const esTaskNames = new Set(["FeedbackWhiz", "Send Onboarding Email"]);
  const tasks = await db.select({ id: clientGanttTasks.id, taskName: clientGanttTasks.taskName }).from(clientGanttTasks)
    .where(and(eq(clientGanttTasks.clientIdCode, clientIdCode), eq(clientGanttTasks.section, "Onboarding")));

  for (const task of tasks) {
    const email = esTaskNames.has(task.taskName) ? (esEmail ?? amEmail) : amEmail;
    if (email) {
      await db.update(clientGanttTasks).set({ assignedTo: email, updatedAt: new Date() }).where(eq(clientGanttTasks.id, task.id));
    }
  }

  // Onboarding steps
  const esStepKeys = new Set(["send_onboarding_email", "feedbackwhiz"]);
  const skipStepKeys = new Set(["create_client", "assign_team"]);
  for (const stepDef of ONBOARDING_STEPS) {
    if (skipStepKeys.has(stepDef.key)) continue;
    const userId = esStepKeys.has(stepDef.key) ? (esId ?? amId) : amId;
    if (!userId) continue;
    await db.insert(clientOnboardingSteps)
      .values({ clientIdCode, stepKey: stepDef.key, status: "pending", assigneeId: userId })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: { assigneeId: userId, updatedAt: new Date() },
      });
  }

  // Push assignees to Asana tasks
  const [asanaStep] = await db
    .select({ metadata: clientOnboardingSteps.metadata })
    .from(clientOnboardingSteps)
    .where(and(eq(clientOnboardingSteps.clientIdCode, clientIdCode), eq(clientOnboardingSteps.stepKey, "setup_asana")))
    .limit(1);
  const projectGid = asanaStep?.metadata && typeof asanaStep.metadata === "object" && "projectGid" in asanaStep.metadata
    ? String(asanaStep.metadata.projectGid) : null;

  if (projectGid) {
    const allUsersWithAsana = await db.select({ name: users.name, email: users.email, asanaEmail: users.asanaEmail }).from(users);
    // Resolve against the org that owns this client's project: 1o8 for
    // new clients, 1o8 for the legacy ones. The same person has a different
    // address in each and neither org recognises the other's.
    const probe = createAsanaOrgProbe();
    const amAsana = amName
      ? await resolveAssigneeForProject(amName, projectGid, allUsersWithAsana, probe)
      : null;
    const esAsana = esName
      ? await resolveAssigneeForProject(esName, projectGid, allUsersWithAsana, probe)
      : null;

    for (const stepDef of ONBOARDING_STEPS) {
      if (skipStepKeys.has(stepDef.key)) continue;
      const asanaTaskName = STEP_TO_ASANA_TASK[stepDef.key];
      if (!asanaTaskName) continue;
      const email = esStepKeys.has(stepDef.key) ? (esAsana ?? amAsana) : amAsana;
      if (!email) continue;
      const taskGid = await findAsanaTaskInProject(projectGid, asanaTaskName);
      if (taskGid) {
        await updateAsanaTaskAssignee(taskGid, email).catch((err) =>
          console.error(`[AutoAssign] Asana assignee failed for ${stepDef.key}:`, err)
        );
      }
    }
  }

}
