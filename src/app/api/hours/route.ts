import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import {
  computeShift,
  findOverlaps,
  isValidDateString,
  addDays,
  type Segment,
  type OverlapCandidate,
} from "@/lib/hours/validation";
import {
  clientCodeExists,
  listEntries,
  insertEntries,
  entriesOnDate,
  isActiveCategory,
  type TimeEntryRow,
} from "@/lib/hours/queries";


type SessionUser = { id: string; role: string; isSuperAdmin?: boolean };

export async function requireTeamUser(): Promise<
  { user: SessionUser } | NextResponse
> {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user as unknown as SessionUser & { isSuperAdmin?: boolean };
  if (!isHubStaff(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return {
    user: {
      id: user.id,
      role: user.role,
      isSuperAdmin: Boolean(user.isSuperAdmin),
    },
  };
}

export function serializeEntry(row: TimeEntryRow) {
  return {
    id: row.id,
    userId: row.userId,
    clientIdCode: row.clientIdCode,
    entryDate: row.entryDate,
    startTime: row.startTime.slice(0, 5),
    endTime: row.endTime.slice(0, 5),
    hours: Number(row.hours),
    note: row.note,
    category: row.category,
  };
}

/** Shared body validation for POST (here) and PATCH ([id]/route.ts). */
export async function validateEntryBody(
  body: {
    entryDate?: unknown;
    clientIdCode?: unknown;
    startTime?: unknown;
    endTime?: unknown;
    durationHours?: unknown;
    note?: unknown;
    category?: unknown;
  },
  opts: { requireCategory: boolean; currentCategory?: string | null }
): Promise<
  | { ok: true; entryDate: string; clientIdCode: string; note: string | null; category: string | null; segments: Segment[] }
  | { ok: false; error: string }
> {
  const entryDate = typeof body.entryDate === "string" ? body.entryDate : "";
  if (!isValidDateString(entryDate)) {
    return { ok: false, error: "Invalid entryDate — expected YYYY-MM-DD" };
  }

  const clientIdCode =
    typeof body.clientIdCode === "string" ? body.clientIdCode.trim() : "";
  if (!clientIdCode || !(await clientCodeExists(clientIdCode))) {
    return { ok: false, error: `Unknown client code: ${clientIdCode || "(empty)"}` };
  }

  const shift = computeShift({
    startTime: typeof body.startTime === "string" ? body.startTime : "",
    endTime: typeof body.endTime === "string" ? body.endTime : undefined,
    durationHours:
      typeof body.durationHours === "number" ? body.durationHours : undefined,
  });
  if (!shift.ok) return shift;

  const note =
    typeof body.note === "string" && body.note.trim() !== "" ? body.note.trim() : null;

  const categoryRaw = typeof body.category === "string" ? body.category.trim() : "";
  let category: string | null = null;
  if (categoryRaw) {
    const isGrandfathered = categoryRaw === opts.currentCategory;
    if (!isGrandfathered && !(await isActiveCategory(categoryRaw))) {
      return { ok: false, error: `Unknown or inactive category: ${categoryRaw}` };
    }
    category = categoryRaw;
  } else if (opts.requireCategory) {
    return { ok: false, error: "A category is required" };
  }

  return { ok: true, entryDate, clientIdCode, note, category, segments: shift.segments };
}

export async function GET(req: NextRequest) {
  const auth = await requireTeamUser();
  if (auth instanceof NextResponse) return auth;

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to || !isValidDateString(from) || !isValidDateString(to)) {
    return NextResponse.json(
      { error: "from and to are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  // Hours are strictly owner-only: the raw list always returns the caller's
  // own entries. Any userId param is ignored — cross-member viewing lives
  // exclusively in the super-admin dashboard (/api/hours/summary).
  const rows = await listEntries(auth.user.id, from, to);
  return NextResponse.json({ entries: rows.map(serializeEntry) });
}

export async function POST(req: NextRequest) {
  const auth = await requireTeamUser();
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = await validateEntryBody(body, { requireCategory: true });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const { entryDate, clientIdCode, note, category, segments } = validated;

  const overlaps: OverlapCandidate[] = [];
  const insertValues: Parameters<typeof insertEntries>[0] = [];

  for (const seg of segments) {
    const segDate = seg.dayOffset === 1 ? addDays(entryDate, 1) : entryDate;
    const sameDay = await entriesOnDate(auth.user.id, segDate);
    const segOverlaps = findOverlaps(
      { startTime: seg.startTime, endTime: seg.endTime },
      sameDay.map((r) => ({
        id: r.id,
        clientIdCode: r.clientIdCode,
        startTime: r.startTime.slice(0, 5),
        endTime: r.endTime.slice(0, 5),
      }))
    );
    overlaps.push(...segOverlaps);
    insertValues.push({
      userId: auth.user.id,
      clientIdCode,
      entryDate: segDate,
      startTime: seg.startTime,
      endTime: seg.endTime,
      hours: seg.hours,
      note,
      category,
    });
  }

  const rows = await insertEntries(insertValues);
  const entries = rows.map(serializeEntry);
  return NextResponse.json({ entries, overlaps }, { status: 201 });
}
