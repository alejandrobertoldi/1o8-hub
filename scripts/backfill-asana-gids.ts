#!/usr/bin/env tsx
/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/js-set-map-lookups */
// ═══════════════════════════════════════════════════════════════
// Backfill Asana task GIDs onto existing client_gantt_tasks rows.
// For clients that already have an Asana project, fetches all tasks
// and links them to Gantt rows by matching task names.
// Also backfills aac.asanaProjectGid from onboarding step metadata.
//
// Usage: npx tsx scripts/backfill-asana-gids.ts [--dry-run]
// ═══════════════════════════════════════════════════════════════

import { config } from "dotenv";
config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  // Dynamic imports so dotenv loads DATABASE_URL before the db client connects
  const { db } = await import("@/lib/db");
  const { aac, clientGanttTasks, clientOnboardingSteps } = await import("@/lib/db/schema");
  const { eq, and, isNull } = await import("drizzle-orm");
  const { asanaFetch } = await import("@/lib/onboarding/create-asana-project");

  console.log(`Backfilling Asana GIDs${DRY_RUN ? " (DRY RUN)" : ""}...\n`);

  // 1. Find all clients with Asana projects (from onboarding step metadata)
  const asanaSteps = await db
    .select({
      clientIdCode: clientOnboardingSteps.clientIdCode,
      metadata: clientOnboardingSteps.metadata,
    })
    .from(clientOnboardingSteps)
    .where(
      and(
        eq(clientOnboardingSteps.stepKey, "setup_asana"),
        eq(clientOnboardingSteps.status, "completed")
      )
    );

  console.log(`Found ${asanaSteps.length} clients with Asana projects.\n`);

  let totalLinked = 0;
  let totalProjectGids = 0;

  for (const step of asanaSteps) {
    const meta = step.metadata as Record<string, unknown> | null;
    const projectGid = meta?.projectGid ? String(meta.projectGid) : null;
    if (!projectGid) {
      console.log(`  ${step.clientIdCode}: No projectGid in metadata, skipping.`);
      continue;
    }

    console.log(`\n${step.clientIdCode}: project ${projectGid}`);

    // Backfill aac.asanaProjectGid
    const [client] = await db
      .select({ asanaProjectGid: aac.asanaProjectGid })
      .from(aac)
      .where(eq(aac.clientIdCode, step.clientIdCode))
      .limit(1);

    if (!client?.asanaProjectGid) {
      if (!DRY_RUN) {
        await db
          .update(aac)
          .set({ asanaProjectGid: projectGid })
          .where(eq(aac.clientIdCode, step.clientIdCode));
      }
      console.log(`  → Set aac.asanaProjectGid = ${projectGid}`);
      totalProjectGids++;
    }

    // Fetch all Asana tasks
    let asanaTasks: { gid: string; name: string }[];
    try {
      const { data } = await asanaFetch(
        `/projects/${projectGid}/tasks?opt_fields=name&limit=100`
      );
      asanaTasks = data as { gid: string; name: string }[];
    } catch (err) {
      console.log(`  → Failed to fetch Asana tasks: ${err instanceof Error ? err.message : "Unknown"}`);
      continue;
    }

    // Get Gantt rows without asanaTaskGid
    const ganttRows = await db
      .select()
      .from(clientGanttTasks)
      .where(
        and(
          eq(clientGanttTasks.clientIdCode, step.clientIdCode),
          isNull(clientGanttTasks.asanaTaskGid)
        )
      );

    if (ganttRows.length === 0) {
      console.log(`  → All Gantt rows already have GIDs.`);
      continue;
    }

    let linked = 0;
    for (const asanaTask of asanaTasks) {
      const parts = asanaTask.name.split(" | ").map((s) => s.trim());
      if (parts.length < 3) continue;

      // Asana naming: "{CIC} | {Section} | {Task}" or "{CIC} | {Section} | {Group} | {SubAction}"
      // Gantt naming: section="Onboarding", taskName="1o8Hub" (group), subtaskTitle="Create Client"
      // Match strategy: section must match parts[1], and the LAST part must match subtaskTitle or taskName
      const asanaSection = parts[1]; // e.g., "Onboarding", "SEO", "PPC", "Design"
      const asanaLastPart = parts[parts.length - 1]; // the actual task/action name
      const asanaMiddleParts = parts.slice(2, -1); // group names (may be empty for 3-part)

      // Exact match first
      let match = ganttRows.find((row) => {
        if (row.section !== asanaSection) return false;
        if (parts.length === 3) {
          if (row.subtaskTitle === asanaLastPart) return true;
          if (row.taskName === asanaLastPart && !row.subtaskTitle) return true;
          return false;
        }
        if (parts.length === 4) {
          if (row.taskName === asanaMiddleParts[0] && row.subtaskTitle === asanaLastPart) return true;
          return false;
        }
        return false;
      });

      // Fuzzy fallback: case-insensitive contains match
      if (!match) {
        const needle = asanaLastPart.toLowerCase();
        match = ganttRows.find((row) => {
          if (row.section !== asanaSection) return false;
          const sub = (row.subtaskTitle || "").toLowerCase();
          const task = row.taskName.toLowerCase();
          return (sub && (sub.includes(needle) || needle.includes(sub))) ||
                 (!row.subtaskTitle && (task.includes(needle) || needle.includes(task)));
        });
      }

      if (match) {
        if (!DRY_RUN) {
          await db
            .update(clientGanttTasks)
            .set({ asanaTaskGid: asanaTask.gid })
            .where(eq(clientGanttTasks.id, match.id));
        }
        console.log(`  → Linked: "${asanaTask.name}" → Gantt #${match.id}`);
        linked++;
        // Remove from pool so we don't double-match
        const idx = ganttRows.indexOf(match);
        if (idx >= 0) ganttRows.splice(idx, 1);
      }
    }

    if (ganttRows.length > 0) {
      console.log(`  → ${ganttRows.length} Gantt rows unmatched: ${ganttRows.map((r) => `${r.section}/${r.taskName}/${r.subtaskTitle || "-"}`).join(", ")}`);
    }

    totalLinked += linked;
    console.log(`  → Linked ${linked} tasks.`);
  }

  console.log(`\nDone! ${totalProjectGids} project GIDs set, ${totalLinked} task GIDs linked.${DRY_RUN ? " (DRY RUN — no changes made)" : ""}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
