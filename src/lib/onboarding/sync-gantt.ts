import { db } from "@/lib/db";
import { clientGanttTasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { STEP_TO_GANTT } from "@/lib/onboarding/steps";

/**
 * When an onboarding step completes, mark the matching Gantt task
 * as "completed" with 100% progress.
 */
export async function syncGanttOnStepComplete(
  clientIdCode: string,
  stepKey: string
) {
  const mapping = STEP_TO_GANTT[stepKey];
  if (!mapping) return;

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
      status: "completed",
      completionPct: 100,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(...conditions));
}
