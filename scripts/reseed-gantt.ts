/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Re-seed Gantt templates + update existing clients' Onboarding tasks.
 *
 * What it does:
 * 1. Drops & re-inserts gantt_templates from AIA_TASKS / NTA_TASKS
 * 2. For each client with client_gantt_tasks:
 *    - Deletes old Onboarding-section rows
 *    - Inserts new Onboarding rows from the matching template
 *    - Preserves Content / PPC tasks untouched
 *
 * Usage: npm run reseed-gantt
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/lib/db");
  const { ganttTemplates, clientGanttTasks, aac } = await import("../src/lib/db/schema");
  const { eq, and, sql } = await import("drizzle-orm");
  const { AIA_TASKS, NTA_TASKS } = await import("../src/lib/gantt-templates");

  // ── 1. Re-seed gantt_templates ────────────────────────────────────
  console.log("Clearing gantt_templates…");
  await db.delete(ganttTemplates);

  console.log("Inserting AIA templates…");
  const aiaInserted = await db.insert(ganttTemplates).values(AIA_TASKS).returning();
  console.log(`  → ${aiaInserted.length} AIA rows`);

  console.log("Inserting NTA templates…");
  const ntaInserted = await db.insert(ganttTemplates).values(NTA_TASKS).returning();
  console.log(`  → ${ntaInserted.length} NTA rows`);

  const aiaMap = new Map(aiaInserted.map((t) => [t.wbs, t.id]));
  const ntaMap = new Map(ntaInserted.map((t) => [t.wbs, t.id]));

  // ── 2. Find clients that already have gantt tasks ─────────────────
  const clientRows = await db
    .selectDistinct({ clientIdCode: clientGanttTasks.clientIdCode })
    .from(clientGanttTasks);

  if (clientRows.length === 0) {
    console.log("\nNo clients have gantt tasks yet. Done!");
    process.exit(0);
  }

  console.log(`\nFound ${clientRows.length} client(s) with gantt tasks.`);

  for (const { clientIdCode } of clientRows) {
    // Determine template type from aac
    const [client] = await db
      .select({ clientType: aac.clientType })
      .from(aac)
      .where(eq(aac.clientIdCode, clientIdCode))
      .limit(1);

    const templateType = client?.clientType ?? "AIA";
    const seeds = templateType === "NTA" ? NTA_TASKS : AIA_TASKS;
    const templateMap = templateType === "NTA" ? ntaMap : aiaMap;

    // Read existing Onboarding tasks to preserve completion status
    const existingTasks = await db
      .select()
      .from(clientGanttTasks)
      .where(
        and(
          eq(clientGanttTasks.clientIdCode, clientIdCode),
          eq(clientGanttTasks.section, "Onboarding")
        )
      );

    // Build a lookup by subtaskTitle for status preservation
    const statusBySubtask = new Map(
      existingTasks.map((t) => [t.subtaskTitle, { status: t.status, completionPct: t.completionPct, completedAt: t.completedAt, startedAt: t.startedAt, assignedTo: t.assignedTo, notes: t.notes }])
    );

    // Delete old Onboarding tasks
    const deleted = await db
      .delete(clientGanttTasks)
      .where(
        and(
          eq(clientGanttTasks.clientIdCode, clientIdCode),
          eq(clientGanttTasks.section, "Onboarding")
        )
      )
      .returning();

    // Insert new Onboarding tasks from template, preserving status where subtask matches
    const onboardingSeeds = seeds.filter((t) => t.section === "Onboarding");
    const newTasks = onboardingSeeds.map((t) => {
      const prev = statusBySubtask.get(t.subtaskTitle ?? null);
      return {
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
        status: (prev?.status ?? "pending") as "pending" | "in_progress" | "completed",
        completionPct: prev?.completionPct ?? 0,
        completedAt: prev?.completedAt ?? null,
        startedAt: prev?.startedAt ?? null,
        assignedTo: prev?.assignedTo ?? null,
        notes: prev?.notes ?? null,
      };
    });

    await db.insert(clientGanttTasks).values(newTasks);

    const preserved = newTasks.filter((t) => t.status === "completed").length;
    console.log(
      `  ${clientIdCode} (${templateType}): removed ${deleted.length} old → inserted ${newTasks.length} new (${preserved} completed preserved)`
    );
  }

  console.log("\nDone!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
