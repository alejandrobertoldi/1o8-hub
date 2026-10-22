import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac, clientGanttTasks, ganttTemplates, clientOnboardingSteps, users } from "@/lib/db/schema";
import { AIA_TASKS, NTA_TASKS } from "@/lib/gantt-templates";
import { eq, and } from "drizzle-orm";
import { getStepDef, STEP_TO_GANTT } from "@/lib/onboarding/steps";
import { updateAacFieldInBigQuery } from "@/lib/bigquery";
import { syncGanttOnStepComplete } from "@/lib/onboarding/sync-gantt";
import { DEFAULT_CLIENT_SECTIONS } from "@/lib/permissions";
import {
  STEP_TO_ASANA_TASK,
  findAsanaTaskInProject,
  updateAsanaTaskAssignee,
  setAsanaTaskCompleted,
  updateAsanaTask,
  asanaFetch,
  createAsanaOrgProbe,
} from "@/lib/onboarding/create-asana-project";
import { resolveAssigneeForProject } from "@/lib/onboarding/resolve-assignee";

// Keys that have their own dedicated route (automated steps)
const DEDICATED_ROUTES = new Set(["drive_folders", "setup_asana", "send_onboarding_email"]);

/** Sync step completion status to the corresponding Asana task */
async function syncAsanaCompletion(clientIdCode: string, stepKey: string, completed: boolean) {
  try {
    const asanaTaskName = STEP_TO_ASANA_TASK[stepKey];
    if (!asanaTaskName) return;

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

    const projectGid =
      asanaStep?.metadata &&
      typeof asanaStep.metadata === "object" &&
      "projectGid" in asanaStep.metadata
        ? String(asanaStep.metadata.projectGid)
        : null;

    if (!projectGid) return;
    const taskGid = await findAsanaTaskInProject(projectGid, asanaTaskName);
    if (!taskGid) return;
    await setAsanaTaskCompleted(taskGid, completed);
  } catch (err) {
    console.error(`[Asana sync] Failed for ${clientIdCode}/${stepKey}:`, err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string; stepKey: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode, stepKey } = await params;

  // Reject unknown steps
  if (!getStepDef(stepKey)) {
    return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  }

  // Check for manual-complete flag (allows marking dedicated-route steps done without automation)
  const rawBody = await req.text();
  const body = rawBody ? JSON.parse(rawBody) : {};

  if (DEDICATED_ROUTES.has(stepKey) && !body.manualComplete) {
    return NextResponse.json({ error: "Use the dedicated route for this step" }, { status: 400 });
  }

  // Manual complete: toggle status for any step (including dedicated-route steps)
  if (body.manualComplete) {
    const [existing] = await db
      .select({ status: clientOnboardingSteps.status })
      .from(clientOnboardingSteps)
      .where(
        and(
          eq(clientOnboardingSteps.clientIdCode, clientIdCode),
          eq(clientOnboardingSteps.stepKey, stepKey)
        )
      )
      .limit(1);

    if (existing?.status === "completed") {
      await db
        .update(clientOnboardingSteps)
        .set({ status: "pending", completedAt: null, completedBy: null, updatedAt: new Date() })
        .where(
          and(
            eq(clientOnboardingSteps.clientIdCode, clientIdCode),
            eq(clientOnboardingSteps.stepKey, stepKey)
          )
        );
      syncAsanaCompletion(clientIdCode, stepKey, false);
      return NextResponse.json({ success: true, status: "pending" });
    }

    await db
      .insert(clientOnboardingSteps)
      .values({
        clientIdCode,
        stepKey,
        status: "completed",
        completedAt: new Date(),
        completedBy: session.user.email ?? session.user.name ?? "unknown",
        metadata: { manualComplete: true },
      })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: {
          status: "completed",
          completedAt: new Date(),
          completedBy: session.user.email ?? session.user.name ?? "unknown",
          updatedAt: new Date(),
        },
      });

    await syncGanttOnStepComplete(clientIdCode, stepKey);
    syncAsanaCompletion(clientIdCode, stepKey, true);
    return NextResponse.json({ success: true, status: "completed" });
  }

  // Special handling: intentwise ID steps save to aac.raw_data
  // Each step writes both the ID and (optional) Name back to AAC so the
  // client-detail Intentwise card and onboarding card stay in sync.
  const intentwiseIdSteps: Record<string, { idField: string; nameField: string }> = {
    intentwise_id_provided: { idField: "IntentwiseID", nameField: "IntentwiseName" },
    intentwise_amc_id_provided: { idField: "IntentwiseIDAMC", nameField: "IntentwiseNameAMC" },
  };

  if (stepKey in intentwiseIdSteps) {
    const { idField, nameField } = intentwiseIdSteps[stepKey];
    const intentwiseId = typeof body.intentwiseId === "string" ? body.intentwiseId.trim() : "";
    const hasName = typeof body.intentwiseName === "string";
    const intentwiseName = hasName ? (body.intentwiseName as string).trim() : "";

    if (!intentwiseId) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const [client] = await db
      .select({ rawData: aac.rawData })
      .from(aac)
      .where(eq(aac.clientIdCode, clientIdCode))
      .limit(1);

    const rawData: Record<string, string> = (client?.rawData as Record<string, string>) ?? {};
    rawData[idField] = intentwiseId;
    if (hasName) rawData[nameField] = intentwiseName;

    await db
      .update(aac)
      .set({ rawData, updatedAt: new Date() })
      .where(eq(aac.clientIdCode, clientIdCode));

    try {
      await updateAacFieldInBigQuery(clientIdCode, idField, intentwiseId);
      if (hasName) {
        await updateAacFieldInBigQuery(clientIdCode, nameField, intentwiseName);
      }
    } catch (err) {
      console.error(`[Onboarding] BQ sync failed for ${clientIdCode}.${idField}:`, err);
    }

    const stepMetadata = hasName ? { intentwiseId, intentwiseName } : { intentwiseId };

    await db
      .insert(clientOnboardingSteps)
      .values({
        clientIdCode,
        stepKey,
        status: "completed",
        completedAt: new Date(),
        completedBy: session.user.email ?? session.user.name ?? "unknown",
        metadata: stepMetadata,
      })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: {
          status: "completed",
          completedAt: new Date(),
          completedBy: session.user.email ?? session.user.name ?? "unknown",
          metadata: stepMetadata,
          updatedAt: new Date(),
        },
      });

    await syncGanttOnStepComplete(clientIdCode, stepKey);
    syncAsanaCompletion(clientIdCode, stepKey, true);
    return NextResponse.json({
      success: true,
      status: "completed",
      intentwiseId,
      ...(hasName ? { intentwiseName } : {}),
    });
  }

  // ── Get Merchant ID — save to aac.raw_data + BigQuery ──
  if (stepKey === "iw_get_merchant_id") {
    const merchantId = typeof body.merchantId === "string" ? body.merchantId.trim() : "";
    if (!merchantId) {
      return NextResponse.json({ error: "Merchant ID is required" }, { status: 400 });
    }

    const [client] = await db
      .select({ rawData: aac.rawData })
      .from(aac)
      .where(eq(aac.clientIdCode, clientIdCode))
      .limit(1);

    const rawData: Record<string, string> = (client?.rawData as Record<string, string>) ?? {};
    rawData["merchantID"] = merchantId;

    await db
      .update(aac)
      .set({ rawData, updatedAt: new Date() })
      .where(eq(aac.clientIdCode, clientIdCode));

    try {
      await updateAacFieldInBigQuery(clientIdCode, "merchantID", merchantId);
    } catch (err) {
      console.error(`[Onboarding] BQ sync failed for ${clientIdCode}.merchantID:`, err);
    }

    const stepMetadata = { merchantId };
    await db
      .insert(clientOnboardingSteps)
      .values({
        clientIdCode,
        stepKey,
        status: "completed",
        completedAt: new Date(),
        completedBy: session.user.email ?? session.user.name ?? "unknown",
        metadata: stepMetadata,
      })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: {
          status: "completed",
          completedAt: new Date(),
          completedBy: session.user.email ?? session.user.name ?? "unknown",
          metadata: stepMetadata,
          updatedAt: new Date(),
        },
      });
    await syncGanttOnStepComplete(clientIdCode, stepKey);
    syncAsanaCompletion(clientIdCode, stepKey, true);
    return NextResponse.json({ success: true, status: "completed", merchantId });
  }

  // ── Add Contact Email(s) — save to aac rawData ClientContactName1-5 / ClientContactEmail1-5 ──
  if (stepKey === "add_contact_emails") {
    const contacts: { name: string; email: string }[] = Array.isArray(body.contacts) ? body.contacts : [];
    const validContacts = contacts.filter((c) => typeof c.email === "string" && c.email.trim());

    if (validContacts.length === 0) {
      return NextResponse.json({ error: "At least one email is required" }, { status: 400 });
    }

    const [client] = await db
      .select({ rawData: aac.rawData })
      .from(aac)
      .where(eq(aac.clientIdCode, clientIdCode))
      .limit(1);

    const rawData: Record<string, string> = (client?.rawData as Record<string, string>) ?? {};

    // Clear existing contact slots, then fill with new data
    for (let i = 1; i <= 5; i++) {
      const contact = validContacts[i - 1];
      rawData[`ClientContactName${i}`] = contact?.name?.trim() ?? "";
      rawData[`ClientContactEmail${i}`] = contact?.email?.trim() ?? "";
    }

    await db
      .update(aac)
      .set({ rawData, updatedAt: new Date() })
      .where(eq(aac.clientIdCode, clientIdCode));

    // Sync each contact field to BigQuery
    for (let i = 1; i <= 5; i++) {
      const contact = validContacts[i - 1];
      try {
        await updateAacFieldInBigQuery(clientIdCode, `ClientContactName${i}`, contact?.name?.trim() ?? "");
        await updateAacFieldInBigQuery(clientIdCode, `ClientContactEmail${i}`, contact?.email?.trim() ?? "");
      } catch (err) {
        console.error(`[Onboarding] BQ sync failed for ${clientIdCode} contact ${i}:`, err);
      }
    }

    await db
      .insert(clientOnboardingSteps)
      .values({
        clientIdCode,
        stepKey,
        status: "completed",
        completedAt: new Date(),
        completedBy: session.user.email ?? session.user.name ?? "unknown",
        metadata: { contacts: validContacts },
      })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: {
          status: "completed",
          completedAt: new Date(),
          completedBy: session.user.email ?? session.user.name ?? "unknown",
          metadata: { contacts: validContacts },
          updatedAt: new Date(),
        },
      });

    await syncGanttOnStepComplete(clientIdCode, stepKey);
    syncAsanaCompletion(clientIdCode, stepKey, true);
    return NextResponse.json({ success: true, status: "completed", contacts: validContacts });
  }

  // ── Setup Timeline — save date + auto-init Gantt ──
  if (stepKey === "setup_timeline") {
    const startDate = typeof body.startDate === "string" ? body.startDate.trim() : "";

    if (!startDate) {
      return NextResponse.json({ error: "Start date is required" }, { status: 400 });
    }

    const date = new Date(startDate);
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    // Save onboarding date
    await db
      .update(aac)
      .set({ onboardingDate: date, updatedAt: new Date() })
      .where(eq(aac.clientIdCode, clientIdCode));

    // Auto-initialize Gantt if not already done
    const existingTasks = await db
      .select({ id: clientGanttTasks.id })
      .from(clientGanttTasks)
      .where(eq(clientGanttTasks.clientIdCode, clientIdCode))
      .limit(1);

    let ganttInitialized = existingTasks.length > 0;

    if (!ganttInitialized) {
      // Determine template type from AAC
      const [client] = await db
        .select({ clientType: aac.clientType })
        .from(aac)
        .where(eq(aac.clientIdCode, clientIdCode))
        .limit(1);

      const templateType = client?.clientType ?? "AIA";
      const seeds = templateType === "NTA" ? NTA_TASKS : AIA_TASKS;

      // Ensure templates are seeded
      const templateRows = await db.select().from(ganttTemplates).where(eq(ganttTemplates.templateType, templateType));
      let templateMap = new Map(templateRows.map((t) => [t.wbs, t.id]));
      if (templateRows.length === 0) {
        const inserted = await db.insert(ganttTemplates).values(seeds).returning();
        templateMap = new Map(inserted.map((t) => [t.wbs, t.id]));
      }

      // Create client tasks (snapshot from template)
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

      await db.insert(clientGanttTasks).values(taskValues);
      ganttInitialized = true;
    }

    // Link Gantt rows to Asana tasks and push start/due dates
    const [asanaStepRow] = await db
      .select({ metadata: clientOnboardingSteps.metadata })
      .from(clientOnboardingSteps)
      .where(and(eq(clientOnboardingSteps.clientIdCode, clientIdCode), eq(clientOnboardingSteps.stepKey, "setup_asana")))
      .limit(1);

    const projectGid = asanaStepRow?.metadata && typeof asanaStepRow.metadata === "object" && "projectGid" in asanaStepRow.metadata
      ? String(asanaStepRow.metadata.projectGid)
      : null;

    if (projectGid) {
      try {
        const { data: asanaTasks } = await asanaFetch(`/projects/${projectGid}/tasks?opt_fields=name&limit=100`);
        const asanaList = asanaTasks as { gid: string; name: string }[];
        const stripNum = (s: string) => s.replace(/^\d+\.\s*/, "");

        const allGanttRows = await db
          .select({ id: clientGanttTasks.id, section: clientGanttTasks.section, taskName: clientGanttTasks.taskName, subtaskTitle: clientGanttTasks.subtaskTitle, startDay: clientGanttTasks.startDay, durationDays: clientGanttTasks.durationDays })
          .from(clientGanttTasks)
          .where(eq(clientGanttTasks.clientIdCode, clientIdCode));

        for (const row of allGanttRows) {
          // Match Gantt row to Asana task by section + taskName/subtaskTitle
          const match = asanaList.find((a) => {
            const parts = a.name.split(" | ").map((s) => s.trim());
            if (parts.length < 3) return false;
            if (parts[1] !== row.section) return false;
            if (parts.length === 3) {
              const cleaned = stripNum(parts[2]);
              if (row.subtaskTitle === cleaned) return true;
              return row.taskName === cleaned && !row.subtaskTitle;
            }
            if (parts.length === 4) {
              return row.taskName === stripNum(parts[2]) && row.subtaskTitle === stripNum(parts[3]);
            }
            return false;
          });

          if (!match) continue;

          // Store Asana GID on Gantt row
          await db.update(clientGanttTasks).set({ asanaTaskGid: match.gid }).where(eq(clientGanttTasks.id, row.id));

          // Calculate absolute dates from onboarding start + startDay/durationDays
          const startOn = new Date(date);
          startOn.setDate(startOn.getDate() + row.startDay - 1);
          const dueOn = new Date(date);
          dueOn.setDate(dueOn.getDate() + row.startDay - 1 + Math.max(row.durationDays - 1, 0));

          await updateAsanaTask(match.gid, {
            start_on: startOn.toISOString().slice(0, 10),
            due_on: dueOn.toISOString().slice(0, 10),
          }).catch(() => {});
        }
      } catch (err) {
        console.error("[Asana] Failed to sync dates from Gantt:", err);
      }
    }

    // Mark step completed
    await db
      .insert(clientOnboardingSteps)
      .values({
        clientIdCode,
        stepKey,
        status: "completed",
        completedAt: new Date(),
        completedBy: session.user.email ?? session.user.name ?? "unknown",
        metadata: { startDate, ganttInitialized },
      })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: {
          status: "completed",
          completedAt: new Date(),
          completedBy: session.user.email ?? session.user.name ?? "unknown",
          metadata: { startDate, ganttInitialized },
          updatedAt: new Date(),
        },
      });

    await syncGanttOnStepComplete(clientIdCode, stepKey);
    syncAsanaCompletion(clientIdCode, stepKey, true);
    return NextResponse.json({ success: true, status: "completed", startDate, ganttInitialized });
  }

  // ── Hub steps with contact checklist (doneEmails) ──
  const hubChecklistSteps = new Set(["hub_add_user", "hub_assign_role", "hub_assign_client"]);
  if (hubChecklistSteps.has(stepKey)) {
    if (Array.isArray(body.doneEmails)) {
      const doneEmails: string[] = body.doneEmails;

      // Count total contacts from AAC to determine completion
      const [client] = await db
        .select({ rawData: aac.rawData })
        .from(aac)
        .where(eq(aac.clientIdCode, clientIdCode))
        .limit(1);

      let totalContacts = 0;
      for (let i = 1; i <= 5; i++) {
        if (client?.rawData?.[`ClientContactEmail${i}`]?.trim()) totalContacts++;
      }

      const allDone = totalContacts > 0 && doneEmails.length >= totalContacts;
      const status = allDone ? "completed" as const : "in_progress" as const;

      await db
        .insert(clientOnboardingSteps)
        .values({
          clientIdCode,
          stepKey,
          status,
          completedAt: allDone ? new Date() : null,
          completedBy: allDone ? (session.user.email ?? session.user.name ?? "unknown") : null,
          metadata: { doneEmails },
        })
        .onConflictDoUpdate({
          target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
          set: {
            status,
            completedAt: allDone ? new Date() : null,
            completedBy: allDone ? (session.user.email ?? session.user.name ?? "unknown") : null,
            metadata: { doneEmails },
            updatedAt: new Date(),
          },
        });

      if (allDone) {
        await syncGanttOnStepComplete(clientIdCode, stepKey);
        syncAsanaCompletion(clientIdCode, stepKey, true);

        // When hub_add_user completes, assign default portal sections to all client users for this client
        if (stepKey === "hub_add_user") {
          const clientUsers = await db
            .select({ id: users.id, allowedSections: users.allowedSections })
            .from(users)
            .where(and(eq(users.clientIdCode, clientIdCode), eq(users.role, "client")));

          for (const u of clientUsers) {
            if (!u.allowedSections || u.allowedSections.length === 0) {
              await db
                .update(users)
                .set({ allowedSections: DEFAULT_CLIENT_SECTIONS })
                .where(eq(users.id, u.id));
            }
          }
        }
      }
      return NextResponse.json({ success: true, status, doneEmails });
    }
  }

  // Toggle: if already completed, reset to pending; otherwise mark completed
  const [existing] = await db
    .select({ status: clientOnboardingSteps.status })
    .from(clientOnboardingSteps)
    .where(
      and(
        eq(clientOnboardingSteps.clientIdCode, clientIdCode),
        eq(clientOnboardingSteps.stepKey, stepKey)
      )
    )
    .limit(1);

  if (existing?.status === "completed") {
    await db
      .update(clientOnboardingSteps)
      .set({ status: "pending", completedAt: null, completedBy: null, updatedAt: new Date() })
      .where(
        and(
          eq(clientOnboardingSteps.clientIdCode, clientIdCode),
          eq(clientOnboardingSteps.stepKey, stepKey)
        )
      );
    syncAsanaCompletion(clientIdCode, stepKey, false);
    return NextResponse.json({ success: true, status: "pending" });
  }

  await db
    .insert(clientOnboardingSteps)
    .values({
      clientIdCode,
      stepKey,
      status: "completed",
      completedAt: new Date(),
      completedBy: session.user.email ?? session.user.name ?? "unknown",
    })
    .onConflictDoUpdate({
      target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
      set: {
        status: "completed",
        completedAt: new Date(),
        completedBy: session.user.email ?? session.user.name ?? "unknown",
        updatedAt: new Date(),
      },
    });

  await syncGanttOnStepComplete(clientIdCode, stepKey);
  syncAsanaCompletion(clientIdCode, stepKey, true);
  return NextResponse.json({ success: true, status: "completed" });
}

// ── PATCH: Update assignee ──────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string; stepKey: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode, stepKey } = await params;

  if (!getStepDef(stepKey)) {
    return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const assigneeId: string | null = typeof body.assigneeId === "string" ? body.assigneeId : null;

  // Upsert the step row with the assignee
  await db
    .insert(clientOnboardingSteps)
    .values({
      clientIdCode,
      stepKey,
      status: "pending",
      assigneeId,
    })
    .onConflictDoUpdate({
      target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
      set: {
        assigneeId,
        updatedAt: new Date(),
      },
    });

  // Gantt assignee is synced via the Asana panel (source of truth)

  // Sync to Asana if a project exists
  const asanaTaskName = STEP_TO_ASANA_TASK[stepKey];
  if (asanaTaskName) {
    // Find the Asana project GID from the setup_asana step metadata
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

    const projectGid =
      asanaStep?.metadata &&
      typeof asanaStep.metadata === "object" &&
      "projectGid" in asanaStep.metadata
        ? String(asanaStep.metadata.projectGid)
        : null;

    if (projectGid) {
      const taskGid = await findAsanaTaskInProject(projectGid, asanaTaskName);
      if (taskGid) {
        if (assigneeId) {
          // Resolve against the org that owns this project. The rebrand left most
          // people with two users rows carrying different Asana addresses, and
          // neither org recognises the other's, so the stored value on the picked
          // row is only right for one of them.
          const [picked] = await db
            .select({ name: users.name, email: users.email })
            .from(users)
            .where(eq(users.id, assigneeId))
            .limit(1);
          const identifier = picked?.name ?? picked?.email ?? null;
          const allUsers = await db
            .select({ name: users.name, email: users.email, asanaEmail: users.asanaEmail })
            .from(users);
          const emailForAsana = identifier
            ? await resolveAssigneeForProject(
                identifier,
                projectGid,
                allUsers,
                createAsanaOrgProbe()
              )
            : null;
          if (emailForAsana) {
            await updateAsanaTaskAssignee(taskGid, emailForAsana);
          } else if (identifier) {
            console.warn(
              `[Asana] "${identifier}" has no identity in the project's Asana org, leaving task unassigned`
            );
          }
        } else {
          // Clear assignee — set to null
          await updateAsanaTaskAssignee(taskGid, "null");
        }
      }
    }
  }

  // Return the updated assignee info
  if (assigneeId) {
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email, image: users.image, role: users.role })
      .from(users)
      .where(eq(users.id, assigneeId))
      .limit(1);
    return NextResponse.json({ success: true, assignee: user ?? null });
  }

  return NextResponse.json({ success: true, assignee: null });
}
