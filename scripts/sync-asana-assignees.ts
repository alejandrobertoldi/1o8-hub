/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/server-sequential-independent-await */
/**
 * Bulk sync Asana assignees → Gantt tasks.
 *
 * For each client with an Asana project:
 * 1. Fetches all tasks from the Asana project (with assignee emails)
 * 2. Matches Asana task names to Gantt rows
 * 3. Updates client_gantt_tasks.assigned_to with the Asana assignee email
 *
 * Asana task name format: "CLIENT | Section | TaskName" or "CLIENT | Section | TaskName | SubtaskTitle"
 * Onboarding tasks use STEP_TO_ASANA_TASK → STEP_TO_GANTT mapping.
 * Content/PPC tasks match by section + last segment against taskName or subtaskTitle.
 *
 * Usage: npx tsx scripts/sync-asana-assignees.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/lib/db");
  const { clientOnboardingSteps, clientGanttTasks } = await import("../src/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { asanaFetch, STEP_TO_ASANA_TASK } = await import(
    "../src/lib/onboarding/create-asana-project"
  );
  const { STEP_TO_GANTT } = await import("../src/lib/onboarding/steps");

  // 1. Find all clients with Asana projects
  const asanaSteps = await db
    .select({
      clientIdCode: clientOnboardingSteps.clientIdCode,
      metadata: clientOnboardingSteps.metadata,
    })
    .from(clientOnboardingSteps)
    .where(eq(clientOnboardingSteps.stepKey, "setup_asana"));

  const clientProjects: { clientIdCode: string; projectGid: string }[] = [];
  for (const step of asanaSteps) {
    const m = step.metadata as Record<string, unknown> | null;
    const projectGid = m && typeof m === "object" && "projectGid" in m ? String(m.projectGid) : null;
    if (projectGid) {
      clientProjects.push({ clientIdCode: step.clientIdCode, projectGid });
    }
  }

  console.log(`Found ${clientProjects.length} clients with Asana projects.\n`);

  // Build reverse map: Asana task name fragment → Gantt mapping (for Onboarding)
  const asanaNameToGantt = new Map<string, { taskName: string; subtaskTitle?: string }>();
  for (const [stepKey, asanaTaskName] of Object.entries(STEP_TO_ASANA_TASK)) {
    const ganttMapping = STEP_TO_GANTT[stepKey];
    if (ganttMapping) {
      asanaNameToGantt.set(asanaTaskName, ganttMapping);
    }
  }

  let totalUpdated = 0;

  // 2. For each client, fetch Asana tasks and sync assignees
  for (const { clientIdCode, projectGid } of clientProjects) {
    console.log(`── ${clientIdCode} (project: ${projectGid})`);

    let asanaTasks: { gid: string; name: string; assignee: { email?: string } | null }[];
    try {
      const { data } = await asanaFetch(
        `/projects/${projectGid}/tasks?opt_fields=name,assignee.email&limit=100`
      );
      asanaTasks = data as typeof asanaTasks;
    } catch (err) {
      console.log(`   ⚠ Failed to fetch tasks: ${err}`);
      continue;
    }

    // Load existing Gantt rows for this client
    const ganttRows = await db
      .select({
        id: clientGanttTasks.id,
        section: clientGanttTasks.section,
        taskName: clientGanttTasks.taskName,
        subtaskTitle: clientGanttTasks.subtaskTitle,
        assignedTo: clientGanttTasks.assignedTo,
      })
      .from(clientGanttTasks)
      .where(eq(clientGanttTasks.clientIdCode, clientIdCode));

    let clientUpdated = 0;

    for (const asanaTask of asanaTasks) {
      const email = asanaTask.assignee?.email ?? null;

      // Parse: "CLIENT | Section | Task" (3-part) or "CLIENT | Section | Task | Subtask" (4-part)
      const parts = asanaTask.name.split(" | ").map((s) => s.trim());
      if (parts.length < 3) continue;

      const section = parts[1]; // "Onboarding", "SEO", "PPC", "Design"
      const taskName = parts[2];
      const subtask = parts.length >= 4 ? parts[3] : null;

      let matchedGanttId: number | null = null;

      // Match by section + taskName + subtaskTitle (works for all sections)
      if (subtask) {
        // 4-part: match section + taskName + subtaskTitle
        const row = ganttRows.find(
          (r) => r.section === section && r.taskName === taskName && r.subtaskTitle === subtask
        );
        if (row) matchedGanttId = row.id;
      } else {
        // 3-part: match section + taskName (no subtask)
        const row = ganttRows.find(
          (r) => r.section === section && r.taskName === taskName && !r.subtaskTitle
        );
        if (row) matchedGanttId = row.id;
      }

      if (matchedGanttId != null) {
        const existing = ganttRows.find((r) => r.id === matchedGanttId);
        // Only update if different
        if (existing && existing.assignedTo !== email) {
          await db
            .update(clientGanttTasks)
            .set({ assignedTo: email, updatedAt: new Date() })
            .where(eq(clientGanttTasks.id, matchedGanttId));
          clientUpdated++;
          const label = subtask ? `${taskName} > ${subtask}` : taskName;
          console.log(
            `   ✓ ${section} > ${label} → ${email || "(cleared)"}`
          );
        }
      }
    }

    console.log(`   ${clientUpdated} Gantt rows updated.\n`);
    totalUpdated += clientUpdated;
  }

  console.log(`Done. ${totalUpdated} total Gantt rows updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
