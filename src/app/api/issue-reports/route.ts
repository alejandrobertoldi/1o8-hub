import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { issueReports, seoSettings } from "@/lib/db/schema";
import { desc, eq, and, notInArray, sql, count as dbCount } from "drizzle-orm";
import { sendEmail, buildNewReportEmail, buildStatusUpdateEmail } from "@/lib/email";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 60;

async function getSupportEmail(): Promise<string | null> {
  const [row] = await db
    .select()
    .from(seoSettings)
    .where(eq(seoSettings.key, "support_email"))
    .limit(1);
  return row?.value || null;
}

// GET — list all reports (admin sees all, others see own)
// ?count=open — returns { count: number } of unresolved issues (admin only)
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = hasAdminPowers(session.user.role);

  // Quick count of open issues for admin header badge
  if (req.nextUrl.searchParams.get("count") === "open" && isAdmin) {
    const [result] = await db
      .select({ count: dbCount() })
      .from(issueReports)
      .where(notInArray(issueReports.status, ["resolved", "closed"]));
    return NextResponse.json({ count: result?.count ?? 0 });
  }

  const reports = isAdmin
    ? await db.select().from(issueReports).orderBy(desc(issueReports.createdAt))
    : await db
        .select()
        .from(issueReports)
        .where(eq(issueReports.reportedBy, session.user.email!))
        .orderBy(desc(issueReports.createdAt));

  return NextResponse.json(reports);
}

// POST — create a new issue report
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { section, description, screenshotUrl } = body as {
    section: string;
    description: string;
    screenshotUrl?: string;
  };

  if (!section || !description) {
    return NextResponse.json(
      { error: "Section and description are required" },
      { status: 400 }
    );
  }

  // Limit screenshot to ~5MB base64
  if (screenshotUrl && screenshotUrl.length > 7_000_000) {
    return NextResponse.json(
      { error: "Screenshot too large (max 5MB)" },
      { status: 400 }
    );
  }

  const [report] = await db
    .insert(issueReports)
    .values({
      reportedBy: session.user.email!,
      reportedByName: session.user.name ?? null,
      section,
      description,
      screenshotUrl: screenshotUrl ?? null,
    })
    .returning();

  // Send email to support (non-blocking)
  getSupportEmail().then((supportEmail) => {
    if (supportEmail) {
      const { subject, html } = buildNewReportEmail(report);
      sendEmail({ to: supportEmail, subject, html });
    }
  });

  return NextResponse.json(report, { status: 201 });
}

// DELETE — remove an issue report (admin only)
export async function DELETE(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = (await req.json()) as { id: number };
  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  await db.delete(issueReports).where(eq(issueReports.id, id));

  return NextResponse.json({ ok: true });
}

// PATCH — mark admin notes as seen (reporter only)
export async function PATCH(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = (await req.json()) as { id: number };
  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  // Only the reporter can mark their own report as seen
  const [report] = await db
    .select()
    .from(issueReports)
    .where(and(eq(issueReports.id, id), eq(issueReports.reportedBy, session.user.email!)))
    .limit(1);

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .update(issueReports)
    .set({ notesSeen: true })
    .where(eq(issueReports.id, id));

  return NextResponse.json({ ok: true });
}

// PUT — update status / admin notes (admin only)
export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, status, adminNotes } = body as {
    id: number;
    status?: "pending" | "in_review" | "in_progress" | "resolved" | "closed";
    adminNotes?: string;
  };

  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  const updates: Partial<{
    status: "pending" | "in_review" | "in_progress" | "resolved" | "closed";
    adminNotes: string | null;
    notesSeen: boolean;
    resolvedBy: string | null;
    resolvedAt: Date | null;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (status) updates.status = status;
  if (adminNotes !== undefined) {
    updates.adminNotes = adminNotes;
    updates.notesSeen = false;
  }

  if (status === "resolved" || status === "closed") {
    updates.resolvedBy = session.user.email!;
    updates.resolvedAt = new Date();
  }

  await db
    .update(issueReports)
    .set(updates)
    .where(eq(issueReports.id, id));

  const [updated] = await db
    .select()
    .from(issueReports)
    .where(eq(issueReports.id, id))
    .limit(1);

  // Send status update email to reporter (non-blocking, only on status change)
  if (status && updated.reportedBy) {
    const { subject, html } = buildStatusUpdateEmail(updated);
    sendEmail({ to: updated.reportedBy, subject, html });
  }

  return NextResponse.json(updated);
}
