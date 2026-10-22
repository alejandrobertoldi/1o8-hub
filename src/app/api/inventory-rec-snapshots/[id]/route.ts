// src/app/api/inventory-rec-snapshots/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { inventoryRecSnapshots, inventoryRecSnapshotRows } from "@/lib/db/schema";
import { recReadScope } from "@/lib/inventory/access";
import { toPortalRow, type SnapshotRowInput } from "@/lib/inventory/snapshot";
import { toHeader } from "../route";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [h] = await db.select().from(inventoryRecSnapshots).where(eq(inventoryRecSnapshots.id, id)).limit(1);
  if (!h) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scope = recReadScope(session.user, h.clientIdCode);
  if (!scope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stored = await db.select().from(inventoryRecSnapshotRows).where(eq(inventoryRecSnapshotRows.snapshotId, id));
  const rows: SnapshotRowInput[] = stored.map(({ id: _id, snapshotId: _s, ...r }) => { void _id; void _s; return r; });
  const header = toHeader(h);
  return NextResponse.json(
    scope === "portal"
      ? { snapshot: { ...header, sentBy: "" }, rows: rows.map(toPortalRow) }
      : { snapshot: header, rows },
  );
}
