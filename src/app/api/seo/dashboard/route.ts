/* eslint-disable react-doctor/no-giant-component */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoExports, users, aac } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq, desc, sql, count } from "drizzle-orm";

export const maxDuration = 60;

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Parallel queries
    const [projectRows, asinCounts, recentExports, clientRows] = await Promise.all([
      // 1. Projects + users join
      db
        .select({
          id: seoProjects.id,
          name: seoProjects.name,
          brandName: seoProjects.brandName,
          status: seoProjects.status,
          currentPhase: seoProjects.currentPhase,
          clientIdCode: seoProjects.clientIdCode,
          assignedTo: seoProjects.assignedTo,
          createdAt: seoProjects.createdAt,
          updatedAt: seoProjects.updatedAt,
          s1ApprovedAt: seoProjects.s1ApprovedAt,
          s2ApprovedAt: seoProjects.s2ApprovedAt,
          s3ApprovedAt: seoProjects.s3ApprovedAt,
          s4ApprovedAt: seoProjects.s4ApprovedAt,
          s5ApprovedAt: seoProjects.s5ApprovedAt,
          s6ApprovedAt: seoProjects.s6ApprovedAt,
          assigneeName: users.name,
          assigneeImage: users.image,
        })
        .from(seoProjects)
        .leftJoin(users, eq(seoProjects.assignedTo, users.id))
        .orderBy(desc(seoProjects.createdAt)),

      // 2. ASIN counts by project
      db
        .select({
          projectId: seoAsins.projectId,
          count: count(),
        })
        .from(seoAsins)
        .groupBy(seoAsins.projectId),

      // 3. Recent exports (last 30 days)
      db
        .select({
          id: seoExports.id,
          projectId: seoExports.projectId,
          type: seoExports.type,
          url: seoExports.url,
          createdAt: seoExports.createdAt,
        })
        .from(seoExports)
        .where(sql`${seoExports.createdAt} > NOW() - INTERVAL '30 days'`)
        .orderBy(desc(seoExports.createdAt))
        .limit(30),

      // 4. Client name lookup
      db
        .select({
          clientIdCode: aac.clientIdCode,
          clientName: aac.clientName,
        })
        .from(aac),
    ]);

    // Build lookup maps
    const clientNameMap: Record<string, string> = {};
    for (const c of clientRows) {
      clientNameMap[c.clientIdCode] = c.clientName ?? c.clientIdCode;
    }

    const asinCountMap: Record<string, number> = {};
    let totalAsins = 0;
    for (const row of asinCounts) {
      asinCountMap[row.projectId] = Number(row.count);
      totalAsins += Number(row.count);
    }

    // Filter non-archived / non-deprecated projects for metrics
    const active = projectRows.filter(
      (p) => p.status !== "archived" && p.status !== "deprecated",
    );
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // --- Metrics ---
    const totalProjects = active.length;
    const activeProjects = active.filter((p) => p.status === "in_progress").length;
    const completedThisMonth = active.filter(
      (p) => p.status === "completed" && p.updatedAt && new Date(p.updatedAt) >= startOfMonth
    ).length;
    const exportsThisMonth = recentExports.filter(
      (e) => new Date(e.createdAt) >= startOfMonth
    ).length;

    // Average progress: each approval = 16.67%
    function countApprovals(p: (typeof projectRows)[0]): number {
      let n = 0;
      if (p.s1ApprovedAt) n++;
      if (p.s2ApprovedAt) n++;
      if (p.s3ApprovedAt) n++;
      if (p.s4ApprovedAt) n++;
      if (p.s5ApprovedAt) n++;
      if (p.s6ApprovedAt) n++;
      return n;
    }

    const avgProgress =
      active.length > 0
        ? Math.round(
            (active.reduce((sum, p) => sum + countApprovals(p) * 16.67, 0) / active.length) * 100
          ) / 100
        : 0;

    // --- Clients ---
    const clientGroups: Record<string, (typeof projectRows)[0][]> = {};
    for (const p of active) {
      if (!p.clientIdCode) continue;
      if (!clientGroups[p.clientIdCode]) clientGroups[p.clientIdCode] = [];
      clientGroups[p.clientIdCode].push(p);
    }

    const clients = Object.entries(clientGroups).map(([clientIdCode, projects]) => {
      const completedCount = projects.filter((p) => p.status === "completed").length;
      const avgProg =
        projects.length > 0
          ? Math.round(
              (projects.reduce((sum, p) => sum + countApprovals(p) * 16.67, 0) / projects.length) *
                100
            ) / 100
          : 0;

      const phaseBreakdown = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0 };
      for (const p of projects) {
        const phase = p.currentPhase as keyof typeof phaseBreakdown;
        if (phase in phaseBreakdown) phaseBreakdown[phase]++;
      }

      const asinCount = projects.reduce((sum, p) => sum + (asinCountMap[p.id] || 0), 0);

      return {
        clientIdCode,
        clientName: clientNameMap[clientIdCode] || clientIdCode,
        projectCount: projects.length,
        completedCount,
        avgProgress: avgProg,
        phaseBreakdown,
        asinCount,
      };
    });

    // --- Team ---
    const teamMap: Record<string, { id: string; name: string | null; image: string | null; projectCount: number }> = {};
    for (const p of active) {
      if (!p.assignedTo) continue;
      if (!teamMap[p.assignedTo]) {
        teamMap[p.assignedTo] = {
          id: p.assignedTo,
          name: p.assigneeName,
          image: p.assigneeImage,
          projectCount: 0,
        };
      }
      teamMap[p.assignedTo].projectCount++;
    }
    const team = Object.values(teamMap);

    // --- Funnel ---
    const funnel = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0, completed: 0 };
    for (const p of active) {
      if (p.status === "completed" || p.status === "live") {
        funnel.completed++;
      } else {
        const phase = p.currentPhase as keyof typeof funnel;
        if (phase in funnel && phase !== "completed") {
          (funnel as Record<string, number>)[phase]++;
        }
      }
    }

    // --- Stale projects (idle 7+ days, not done / archived / deprecated) ---
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const stale: Array<{
      id: string;
      name: string;
      clientIdCode: string | null;
      currentPhase: string;
      assigneeName: string | null;
      daysSinceActivity: number;
    }> = [];

    for (const p of projectRows) {
      if (
        p.status === "completed" ||
        p.status === "live" ||
        p.status === "archived" ||
        p.status === "deprecated"
      ) {
        continue;
      }

      // Find most recent activity timestamp
      const timestamps = [
        p.s1ApprovedAt,
        p.s2ApprovedAt,
        p.s3ApprovedAt,
        p.s4ApprovedAt,
        p.s5ApprovedAt,
        p.s6ApprovedAt,
      ].filter(Boolean) as Date[];

      const lastActivity =
        timestamps.length > 0
          ? new Date(Math.max(...timestamps.map((t) => new Date(t).getTime())))
          : new Date(p.createdAt);

      if (lastActivity < sevenDaysAgo) {
        const daysSinceActivity = Math.floor(
          (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
        );
        stale.push({
          id: p.id,
          name: p.name,
          clientIdCode: p.clientIdCode,
          currentPhase: p.currentPhase,
          assigneeName: p.assigneeName,
          daysSinceActivity,
        });
      }
    }

    // Sort stale by days descending
    stale.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);

    // --- Activity feed ---
    const activityItems: Array<{
      type: "approval" | "export";
      projectId: string;
      projectName: string;
      detail: string;
      actorName: string | null;
      timestamp: string;
    }> = [];

    const phaseLabels: Record<string, string> = {
      s1: "S1 Intake",
      s2: "S2 Keywords",
      s3: "S3 Reviews",
      s4: "S4 Alexa for Shopping",
      s5: "S5 COSMO",
      s6: "S6 SEO Content",
    };

    for (const p of projectRows) {
      const approvals = [
        { key: "s1", at: p.s1ApprovedAt },
        { key: "s2", at: p.s2ApprovedAt },
        { key: "s3", at: p.s3ApprovedAt },
        { key: "s4", at: p.s4ApprovedAt },
        { key: "s5", at: p.s5ApprovedAt },
        { key: "s6", at: p.s6ApprovedAt },
      ];

      for (const a of approvals) {
        if (a.at) {
          activityItems.push({
            type: "approval",
            projectId: p.id,
            projectName: p.name,
            detail: `${phaseLabels[a.key]} approved`,
            actorName: p.assigneeName,
            timestamp: new Date(a.at).toISOString(),
          });
        }
      }
    }

    // Merge exports into activity
    // Build project name lookup for exports
    const projectNameMap: Record<string, string> = {};
    for (const p of projectRows) {
      projectNameMap[p.id] = p.name;
    }

    for (const e of recentExports) {
      activityItems.push({
        type: "export",
        projectId: e.projectId,
        projectName: projectNameMap[e.projectId] || "Unknown",
        detail: `Exported to ${e.type === "google_doc" ? "Google Drive" : e.type?.toUpperCase() || "file"}`,
        actorName: null,
        timestamp: new Date(e.createdAt).toISOString(),
      });
    }

    // Sort by timestamp desc, take top 15
    activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const activity = activityItems.slice(0, 15);

    // --- Completed in last 30 days ---
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const completed: Array<{
      id: string;
      name: string;
      clientIdCode: string | null;
      completedAt: string;
      daysToComplete: number;
    }> = [];

    for (const p of projectRows) {
      if (p.status !== "completed" || !p.updatedAt) continue;
      const completedAt = new Date(p.updatedAt);
      if (completedAt < thirtyDaysAgo) continue;

      const daysToComplete = Math.max(
        1,
        Math.floor(
          (completedAt.getTime() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        )
      );

      completed.push({
        id: p.id,
        name: p.name,
        clientIdCode: p.clientIdCode,
        completedAt: completedAt.toISOString(),
        daysToComplete,
      });
    }

    return NextResponse.json({
      metrics: {
        totalProjects,
        activeProjects,
        completedThisMonth,
        totalAsins,
        exportsThisMonth,
        avgProgress,
      },
      clients,
      team,
      funnel,
      stale,
      activity,
      completed,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
