// ═══════════════════════════════════════════════════════════════
// S0 Competitive Analysis API
// GET  — fetch saved competitive analysis for a project
// POST — save competitive analysis results
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq } from "drizzle-orm";
import { logEvent } from "@/lib/event-logger";

function settingsKey(projectId: string) {
  return `competitive:${projectId}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const [row] = await db
      .select({ value: seoSettings.value })
      .from(seoSettings)
      .where(eq(seoSettings.key, settingsKey(id)))
      .limit(1);

    const competitive = row?.value ? JSON.parse(row.value) : null;
    return NextResponse.json({ competitive });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const startTime = Date.now();

  try {
    const body = await req.json();

    await db
      .insert(seoSettings)
      .values({
        key: settingsKey(id),
        value: JSON.stringify(body),
        updatedBy: session.user?.email || "system",
      })
      .onConflictDoUpdate({
        target: seoSettings.key,
        set: {
          value: JSON.stringify(body),
          updatedAt: new Date(),
          updatedBy: session.user?.email || "system",
        },
      });

    logEvent({
      userEmail: session.user?.email,
      userName: session.user?.name,
      section: "seo",
      action: "competitive:save",
      status: "success",
      message: `Saved competitive analysis for project ${id}`,
      detail: { projectId: id, competitorCount: body.competitors?.length || 0 },
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
