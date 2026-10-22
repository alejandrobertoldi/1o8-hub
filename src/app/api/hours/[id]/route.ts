import { NextRequest, NextResponse } from "next/server";
import {
  requireTeamUser,
  serializeEntry,
  validateEntryBody,
} from "../route";
import { findOverlaps } from "@/lib/hours/validation";
import {
  getEntryById,
  updateEntry,
  deleteEntry,
  entriesOnDate,
} from "@/lib/hours/queries";

type Ctx = { params: Promise<{ id: string }> };

async function loadOwned(id: string, user: { id: string; role: string; isSuperAdmin?: boolean }) {
  const entry = await getEntryById(id);
  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  // Owners can always edit their own entries. Super admins (Admin Hours) may
  // edit anyone's — regular admins/editors still cannot touch others' rows.
  if (entry.userId !== user.id && !user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return entry;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireTeamUser();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const entry = await loadOwned(id, auth.user);
  if (entry instanceof NextResponse) return entry;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = await validateEntryBody(body, {
    requireCategory: false,
    currentCategory: entry.category,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  if (validated.segments.length !== 1) {
    return NextResponse.json(
      { error: "Editing an entry to cross midnight isn't supported — delete and re-log it." },
      { status: 400 }
    );
  }
  const seg = validated.segments[0];
  const data = {
    entryDate: validated.entryDate,
    clientIdCode: validated.clientIdCode,
    startTime: seg.startTime,
    endTime: seg.endTime,
    hours: seg.hours,
    note: validated.note,
    category: validated.category,
  };

  // Overlaps are computed against the entry OWNER's other entries that day,
  // excluding the entry being edited.
  const sameDay = await entriesOnDate(entry.userId, data.entryDate, id);
  const overlaps = findOverlaps(
    { startTime: data.startTime, endTime: data.endTime },
    sameDay.map((r) => ({
      id: r.id,
      clientIdCode: r.clientIdCode,
      startTime: r.startTime.slice(0, 5),
      endTime: r.endTime.slice(0, 5),
    }))
  );

  const updated = await updateEntry(id, data);
  return NextResponse.json({ entry: serializeEntry(updated), overlaps });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireTeamUser();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const entry = await loadOwned(id, auth.user);
  if (entry instanceof NextResponse) return entry;

  await deleteEntry(id);
  return NextResponse.json({ ok: true });
}
