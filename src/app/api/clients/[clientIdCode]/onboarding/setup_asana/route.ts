import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac, clientOnboardingSteps, clientGanttTasks, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createAsanaProject, updateAsanaTaskAssignee, asanaFetch, setAsanaTaskCompleted, STEP_TO_ASANA_TASK, findAsanaTaskInProject, hasAsanaToken, createAsanaOrgProbe } from "@/lib/onboarding/create-asana-project";
import { resolveAssigneeForProject } from "@/lib/onboarding/resolve-assignee";
import { syncGanttOnStepComplete } from "@/lib/onboarding/sync-gantt";

// Extract an Asana GID from a raw GID or a pasted Asana URL.
// For both URL shapes (/0/<project>/<task>/f and /1/.../project/<p>/task/<t>) the target
// GID is the last digit run in the path; a raw GID alone is also the last run. We only
// match runs of 6+ digits so noise like ":0" or short paths can't false-positive.
function extractAsanaGid(input: string): string | null {
  const path = input.split(/[?#]/)[0];
  // Prefer explicit /project/<gid> or /task/<gid> segments (new URL format).
  // Falls back to last digit run for raw GIDs and old /0/<gid>/list URLs.
  const explicit = path.match(/\/(?:project|task)\/(\d{6,})/);
  if (explicit) return explicit[1];
  const matches = path.match(/\d{6,}/g);
  if (!matches?.length) return null;
  return matches[matches.length - 1];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;

  // Manual complete toggle (for already-onboarded clients)
  const body = await req.json().catch(() => ({}));
  if (body.manualComplete) {
    const [existing] = await db
      .select({ status: clientOnboardingSteps.status })
      .from(clientOnboardingSteps)
      .where(and(eq(clientOnboardingSteps.clientIdCode, clientIdCode), eq(clientOnboardingSteps.stepKey, "setup_asana")))
      .limit(1);
    if (existing?.status === "completed") {
      await db.update(clientOnboardingSteps)
        .set({ status: "pending", completedAt: null, completedBy: null, updatedAt: new Date() })
        .where(and(eq(clientOnboardingSteps.clientIdCode, clientIdCode), eq(clientOnboardingSteps.stepKey, "setup_asana")));
      return NextResponse.json({ success: true, status: "pending" });
    }
    await db.insert(clientOnboardingSteps)
      .values({ clientIdCode, stepKey: "setup_asana", status: "completed", completedAt: new Date(), completedBy: session.user.email ?? session.user.name ?? "unknown", metadata: { manualComplete: true } })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: { status: "completed", completedAt: new Date(), completedBy: session.user.email ?? session.user.name ?? "unknown", updatedAt: new Date() },
      });
    await syncGanttOnStepComplete(clientIdCode, "setup_asana");
    return NextResponse.json({ success: true, status: "completed" });
  }

  // Link an already-existing Asana project (instead of creating a new one)
  if (typeof body.linkExistingProjectGid === "string" && body.linkExistingProjectGid.trim()) {
    if (!hasAsanaToken()) {
      return NextResponse.json({ error: "ASANA_ACCESS_TOKEN not configured" }, { status: 500 });
    }
    const gid = extractAsanaGid(body.linkExistingProjectGid);
    if (!gid) {
      return NextResponse.json({ error: "Could not parse an Asana project GID from the input" }, { status: 400 });
    }
    let project: { name?: string; permalink_url?: string };
    try {
      const r = await asanaFetch(`/projects/${gid}?opt_fields=name,permalink_url`);
      project = r.data as { name?: string; permalink_url?: string };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load project from Asana";
      return NextResponse.json({ error: `Asana rejected the project GID: ${msg}` }, { status: 400 });
    }
    const completedBy = session.user.email ?? session.user.name ?? "unknown";
    const metadata = {
      projectGid: gid,
      projectName: project.name ?? null,
      projectUrl: project.permalink_url ?? `https://app.asana.com/0/${gid}/list`,
      linkedExisting: true,
    };
    await db
      .insert(clientOnboardingSteps)
      .values({ clientIdCode, stepKey: "setup_asana", status: "completed", completedAt: new Date(), completedBy, metadata })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: { status: "completed", completedAt: new Date(), completedBy, metadata, updatedAt: new Date() },
      });
    await syncGanttOnStepComplete(clientIdCode, "setup_asana");
    await db.update(aac).set({ asanaProjectGid: gid }).where(eq(aac.clientIdCode, clientIdCode));

    // Best-effort: back-fill clientGanttTasks.asanaTaskGid by name-matching tasks in the linked project.
    try {
      const ganttRows = await db
        .select({ id: clientGanttTasks.id, section: clientGanttTasks.section, taskName: clientGanttTasks.taskName, subtaskTitle: clientGanttTasks.subtaskTitle })
        .from(clientGanttTasks)
        .where(eq(clientGanttTasks.clientIdCode, clientIdCode));
      for (const row of ganttRows) {
        if (row.section !== "Onboarding") continue;
        const probe = row.subtaskTitle?.trim() || row.taskName.trim();
        if (!probe) continue;
        const taskGid = await findAsanaTaskInProject(gid, probe).catch(() => null);
        if (taskGid) {
          await db.update(clientGanttTasks).set({ asanaTaskGid: taskGid, updatedAt: new Date() }).where(eq(clientGanttTasks.id, row.id));
        }
      }
    } catch (err) {
      console.error("[Asana] back-fill of gantt task GIDs failed:", err);
    }

    return NextResponse.json({ success: true, linked: true, projectUrl: metadata.projectUrl });
  }

  if (!hasAsanaToken()) {
    return NextResponse.json(
      { error: "ASANA_ACCESS_TOKEN not configured" },
      { status: 500 }
    );
  }

  // Look up client name for project naming
  const [client] = await db
    .select({ clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);
  const clientName = client?.clientName ?? undefined;

  // Mark step as in_progress
  await db
    .insert(clientOnboardingSteps)
    .values({
      clientIdCode,
      stepKey: "setup_asana",
      status: "in_progress",
    })
    .onConflictDoUpdate({
      target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
      set: { status: "in_progress", updatedAt: new Date() },
    });

  try {
    const result = await createAsanaProject(clientIdCode, clientName);

    // Mark completed
    await db
      .update(clientOnboardingSteps)
      .set({
        status: "completed",
        completedAt: new Date(),
        completedBy: session.user.email ?? session.user.name ?? "unknown",
        metadata: {
          projectGid: result.projectGid,
          projectName: result.projectName,
          projectUrl: result.projectUrl,
          sectionsCreated: result.sectionsCreated,
          tasksCreated: result.tasksCreated,
          customFieldsAdded: result.customFieldsAdded,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientOnboardingSteps.clientIdCode, clientIdCode),
          eq(clientOnboardingSteps.stepKey, "setup_asana")
        )
      );

    await syncGanttOnStepComplete(clientIdCode, "setup_asana");

    // Store project GID on aac for fast lookups
    await db
      .update(aac)
      .set({ asanaProjectGid: result.projectGid })
      .where(eq(aac.clientIdCode, clientIdCode));

    // Link Asana task GIDs to Gantt rows by matching task names
    // Strip number prefixes (e.g. "01. Create Client" → "Create Client") for matching
    const stripNum = (s: string) => s.replace(/^\d+\.\s*/, "");

    if (result.createdTasks?.length) {
      const ganttRows = await db
        .select({ id: clientGanttTasks.id, section: clientGanttTasks.section, taskName: clientGanttTasks.taskName, subtaskTitle: clientGanttTasks.subtaskTitle })
        .from(clientGanttTasks)
        .where(eq(clientGanttTasks.clientIdCode, clientIdCode));

      for (const asanaTask of result.createdTasks) {
        const parts = asanaTask.asanaTaskName.split(" | ").map((s) => s.trim());
        if (parts.length < 3) continue;

        const asanaSection = parts[1];
        const match = ganttRows.find((row) => {
          if (row.section !== asanaSection) return false;
          if (parts.length === 3) {
            const cleaned = stripNum(parts[2]);
            if (row.subtaskTitle === cleaned) return true;
            if (row.taskName === cleaned && !row.subtaskTitle) return true;
            return false;
          }
          if (parts.length === 4) {
            return row.taskName === stripNum(parts[2]) && row.subtaskTitle === stripNum(parts[3]);
          }
          return false;
        });

        if (match) {
          await db
            .update(clientGanttTasks)
            .set({ asanaTaskGid: asanaTask.asanaTaskGid })
            .where(eq(clientGanttTasks.id, match.id));
        }
      }
    }

    // Back-sync: mark Asana tasks completed for steps already done before the project existed
    try {
      const completedSteps = await db
        .select({ stepKey: clientOnboardingSteps.stepKey })
        .from(clientOnboardingSteps)
        .where(
          and(
            eq(clientOnboardingSteps.clientIdCode, clientIdCode),
            eq(clientOnboardingSteps.status, "completed")
          )
        );

      for (const { stepKey } of completedSteps) {
        if (stepKey === "setup_asana") continue;
        const taskNameFragment = STEP_TO_ASANA_TASK[stepKey];
        if (!taskNameFragment) continue;
        const suffix = `| ${taskNameFragment}`;
        const matched = result.createdTasks.find((t) => t.asanaTaskName.endsWith(suffix));
        if (!matched) continue;
        await setAsanaTaskCompleted(matched.asanaTaskGid, true).catch(() => {});
      }
    } catch (err) {
      console.error("[Asana] Failed to back-sync completed steps:", err);
    }

    // Push existing team assignees to newly created Asana tasks
    try {
      const [clientRow] = await db
        .select({ rawData: aac.rawData })
        .from(aac)
        .where(eq(aac.clientIdCode, clientIdCode))
        .limit(1);

      const rawData = (clientRow?.rawData as Record<string, string>) ?? {};
      const amName = rawData["AccountManager_MF"]?.trim();
      const esName = rawData["ExecutiveStrategist_MF"]?.trim();

      if ((amName || esName) && result.createdTasks?.length) {
        const allUsers = await db
          .select({ name: users.name, email: users.email, asanaEmail: users.asanaEmail })
          .from(users);
        // Resolve against the org that owns the destination project. No address
        // exists in both the 1o8 and 1o8 orgs, so the right answer
        // depends on where the project lives — not on which of a person's two
        // post-rebrand users rows happens to come back first.
        const probe = createAsanaOrgProbe();
        const amEmail = amName
          ? await resolveAssigneeForProject(amName, result.projectGid, allUsers, probe)
          : null;
        const esEmail = esName
          ? await resolveAssigneeForProject(esName, result.projectGid, allUsers, probe)
          : null;
        if (amName && !amEmail) {
          console.warn(`[Asana] AM "${amName}" has no identity in the project's Asana org, skipping assignments`);
        }
        if (esName && !esEmail) {
          console.warn(`[Asana] ES "${esName}" has no identity in the project's Asana org, skipping assignments`);
        }

        const esTaskNames = new Set(["Send Onboarding Email", "Setup FeedbackWhiz"]);
        const skipTaskNames = new Set<string>();

        for (const t of result.createdTasks) {
          if (!t.asanaTaskName.includes("| Onboarding |")) continue;
          const lastPart = stripNum(t.asanaTaskName.split(" | ").pop()?.trim() ?? "");
          if (skipTaskNames.has(lastPart)) continue;
          const isEs = esTaskNames.has(lastPart);
          const email = isEs ? (esEmail ?? amEmail) : amEmail;
          if (email) {
            await updateAsanaTaskAssignee(t.asanaTaskGid, email).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error("[Asana] Failed to push team assignments:", err);
    }

    return NextResponse.json({
      success: true,
      projectUrl: result.projectUrl,
      tasksCreated: result.tasksCreated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Asana project creation failed for ${clientIdCode}:`, message);

    // Mark failed
    await db
      .update(clientOnboardingSteps)
      .set({
        status: "failed",
        metadata: { error: message },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientOnboardingSteps.clientIdCode, clientIdCode),
          eq(clientOnboardingSteps.stepKey, "setup_asana")
        )
      );

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
