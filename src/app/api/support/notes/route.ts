import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { supportTickets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 60;

// POST — add internal note to a ticket
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ticketId, text } = (await req.json()) as {
    ticketId: number;
    text: string;
  };

  if (!ticketId || !text?.trim()) {
    return NextResponse.json({ error: "ticketId and text are required" }, { status: 400 });
  }

  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1);

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const newNote = {
    author: session.user.email!,
    authorName: session.user.name ?? null,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };

  const notes = [...(ticket.internalNotes ?? []), newNote];

  await db
    .update(supportTickets)
    .set({ internalNotes: notes, updatedAt: new Date() })
    .where(eq(supportTickets.id, ticketId));

  return NextResponse.json(newNote, { status: 201 });
}
