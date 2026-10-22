/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientGanttTasks, aac } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { unauthorized, resolvePortalClient } from "@/lib/api-utils";
import { PORTAL_DEMO } from "@/lib/portal-demo";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();

  if (session.user?.clientStatus === "Prospect") return NextResponse.json(PORTAL_DEMO.timeline);

  const resolved = resolvePortalClient(session, req.nextUrl.searchParams);
  if (resolved.response) return resolved.response;
  const clientIdCode = resolved.clientIdCode;

  // Check if portal timeline is enabled + get onboarding date
  const [client] = await db
    .select({
      portalTimelineEnabled: aac.portalTimelineEnabled,
      onboardingDate: aac.onboardingDate,
    })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  if (!client?.portalTimelineEnabled) {
    return NextResponse.json({ enabled: false, initialized: false });
  }

  // Fetch all tasks
  const allTasks = await db
    .select()
    .from(clientGanttTasks)
    .where(eq(clientGanttTasks.clientIdCode, clientIdCode));

  if (allTasks.length === 0) {
    return NextResponse.json({ enabled: true, initialized: false });
  }

  // Group by section + taskName to collapse subtasks into parent tasks
  const taskMap = new Map<string, {
    section: string;
    taskName: string;
    minStartDay: number;
    maxEndDay: number;
    totalPct: number;
    count: number;
    statuses: string[];
    assignees: string[];
  }>();

  // Filter out tasks hidden from portal
  const visibleTasks = allTasks.filter((t) => !t.portalHidden);

  for (const t of visibleTasks) {
    const key = `${t.section}::${t.taskName}`;
    const existing = taskMap.get(key);
    const endDay = t.startDay + t.durationDays;
    if (existing) {
      existing.minStartDay = Math.min(existing.minStartDay, t.startDay);
      existing.maxEndDay = Math.max(existing.maxEndDay, endDay);
      existing.totalPct += t.completionPct;
      existing.count += 1;
      existing.statuses.push(t.status);
      if (t.assignedTo && !existing.assignees.includes(t.assignedTo)) existing.assignees.push(t.assignedTo);
    } else {
      taskMap.set(key, {
        section: t.section,
        taskName: t.taskName,
        minStartDay: t.startDay,
        maxEndDay: endDay,
        totalPct: t.completionPct,
        count: 1,
        statuses: [t.status],
        assignees: t.assignedTo ? [t.assignedTo] : [],
      });
    }
  }

  // Build collapsed tasks
  const tasks = Array.from(taskMap.values()).map((g) => {
    const avgPct = Math.round(g.totalPct / g.count);
    const durationDays = g.maxEndDay - g.minStartDay;
    // Derive status: if all completed → completed, if any in_progress → in_progress, else pending
    const status = g.statuses.every((s) => s === "completed")
      ? "completed"
      : g.statuses.some((s) => s === "in_progress" || s === "completed")
        ? "in_progress"
        : "pending";
    return {
      section: g.section,
      taskName: g.taskName,
      startDay: g.minStartDay,
      durationDays,
      completionPct: avgPct,
      status,
      assignedTo: g.assignees.length > 0 ? g.assignees[0] : null,
    };
  });

  // Sort by section order then startDay
  const sectionOrder = ["Onboarding", "SEO", "PPC", "Design", "Recurring Tasks", "Others"];
  tasks.sort((a, b) => {
    const sa = sectionOrder.indexOf(a.section) >= 0 ? sectionOrder.indexOf(a.section) : 999;
    const sb = sectionOrder.indexOf(b.section) >= 0 ? sectionOrder.indexOf(b.section) : 999;
    if (sa !== sb) return sa - sb;
    return a.startDay - b.startDay;
  });

  // Phase summaries
  const sections = sectionOrder.map((section) => {
    const sectionTasks = tasks.filter((t) => t.section === section);
    if (sectionTasks.length === 0) return null;
    const minDay = Math.min(...sectionTasks.map((t) => t.startDay));
    const maxDay = Math.max(...sectionTasks.map((t) => t.startDay + t.durationDays));
    const totalPct = sectionTasks.reduce((sum, t) => sum + t.completionPct, 0);
    const avgPct = Math.round(totalPct / sectionTasks.length);
    const completedCount = sectionTasks.filter((t) => t.status === "completed").length;
    return { section, minDay, maxDay, avgPct, completedCount, totalCount: sectionTasks.length };
  }).filter(Boolean);

  return NextResponse.json({
    enabled: true,
    initialized: true,
    onboardingDate: client.onboardingDate,
    tasks,
    sections,
  });
}
