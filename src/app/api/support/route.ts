import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { supportTickets, users } from "@/lib/db/schema";
import { desc, eq, and, notInArray, sql, count as dbCount, ilike, or } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 60;

const SLA_HOURS: Record<string, number> = {
  urgent: 4,
  high: 24,
  medium: 72,
  low: 168,
};

function computeSlaDeadline(priority: string, createdAt: Date): Date {
  const hours = SLA_HOURS[priority] ?? 72;
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
}

function generateTicketNumber(id: number): string {
  return `SUP-${String(id).padStart(4, "0")}`;
}

// GET — list tickets or count
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;

  // Quick count for sidebar badge
  if (params.get("count") === "open") {
    const [result] = await db
      .select({ count: dbCount() })
      .from(supportTickets)
      .where(notInArray(supportTickets.status, ["resolved", "closed"]));
    return NextResponse.json({ count: result?.count ?? 0 });
  }

  // Build filters
  const conditions = [];
  const status = params.get("status");
  const priority = params.get("priority");
  const category = params.get("category");
  const assignee = params.get("assignee");
  const search = params.get("search");

  if (status && status !== "all") {
    conditions.push(eq(supportTickets.status, status as any));
  }
  if (priority && priority !== "all") {
    conditions.push(eq(supportTickets.priority, priority as any));
  }
  if (category && category !== "all") {
    conditions.push(eq(supportTickets.category, category as any));
  }
  if (assignee === "unassigned") {
    conditions.push(sql`${supportTickets.assignedTo} IS NULL`);
  } else if (assignee && assignee !== "all") {
    conditions.push(eq(supportTickets.assignedTo, assignee));
  }
  if (search) {
    conditions.push(
      or(
        ilike(supportTickets.title, `%${search}%`),
        ilike(supportTickets.description, `%${search}%`),
        ilike(supportTickets.ticketNumber, `%${search}%`)
      )
    );
  }

  const tickets = await db
    .select({
      ticket: supportTickets,
      assigneeName: users.name,
      assigneeImage: users.image,
    })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.assignedTo, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(supportTickets.createdAt));

  const flat = tickets.map((row) => ({
    ...row.ticket,
    assignedToName: row.assigneeName,
    assigneeImage: row.assigneeImage,
  }));

  return NextResponse.json(flat);
}

// POST — create ticket
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    title,
    description,
    category = "bug",
    priority = "medium",
    section,
    screenshotUrl,
    assignedTo,
    tags = [],
  } = body as {
    title?: string;
    description: string;
    category?: string;
    priority?: string;
    section?: string;
    screenshotUrl?: string;
    assignedTo?: string;
    tags?: string[];
  };

  if (!description) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }

  if (screenshotUrl && screenshotUrl.length > 7_000_000) {
    return NextResponse.json({ error: "Screenshot too large (max 5MB)" }, { status: 400 });
  }

  const now = new Date();
  const slaDeadline = computeSlaDeadline(priority, now);

  const [ticket] = await db
    .insert(supportTickets)
    .values({
      ticketNumber: "SUP-0000",
      title: title || description.slice(0, 80),
      description,
      category: category as any,
      priority: priority as any,
      section: section ?? null,
      screenshotUrl: screenshotUrl ?? null,
      assignedTo: assignedTo ?? null,
      tags,
      reportedBy: session.user.email!,
      reportedByName: session.user.name ?? null,
      slaDeadline,
    })
    .returning();

  const ticketNumber = generateTicketNumber(ticket.id);
  await db
    .update(supportTickets)
    .set({ ticketNumber })
    .where(eq(supportTickets.id, ticket.id));

  return NextResponse.json({ ...ticket, ticketNumber }, { status: 201 });
}

// PUT — update ticket
export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, ...fields } = body as {
    id: number;
    status?: string;
    priority?: string;
    category?: string;
    assignedTo?: string | null;
    tags?: string[];
    escalationLevel?: number;
    title?: string;
  };

  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  const updates: Record<string, any> = { updatedAt: new Date() };

  if (fields.status) updates.status = fields.status;
  if (fields.priority) {
    updates.priority = fields.priority;
    const [existing] = await db
      .select({ createdAt: supportTickets.createdAt })
      .from(supportTickets)
      .where(eq(supportTickets.id, id))
      .limit(1);
    if (existing) {
      updates.slaDeadline = computeSlaDeadline(fields.priority, existing.createdAt);
    }
  }
  if (fields.category) updates.category = fields.category;
  if (fields.assignedTo !== undefined) updates.assignedTo = fields.assignedTo;
  if (fields.tags) updates.tags = fields.tags;
  if (fields.escalationLevel !== undefined) updates.escalationLevel = fields.escalationLevel;
  if (fields.title) updates.title = fields.title;

  if (fields.status === "resolved" || fields.status === "closed") {
    updates.resolvedBy = session.user.email!;
    updates.resolvedAt = new Date();
  }
  if (fields.status === "escalated") {
    updates.escalationLevel = Math.max((fields.escalationLevel ?? 0), 1);
  }

  await db
    .update(supportTickets)
    .set(updates)
    .where(eq(supportTickets.id, id));

  const [updated] = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, id))
    .limit(1);

  return NextResponse.json(updated);
}

// DELETE — remove ticket (admin only)
export async function DELETE(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = (await req.json()) as { id: number };
  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  await db.delete(supportTickets).where(eq(supportTickets.id, id));
  return NextResponse.json({ ok: true });
}
