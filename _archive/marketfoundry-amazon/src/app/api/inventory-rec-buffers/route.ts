// Per-product buffer % for the inventory recommendation. Same access rules as
// /api/inventory-rec-overrides: hub staff read, editors write.
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { inventoryRecBuffers } from "@/lib/db/schema";
import { canEditRecs, recReadScope } from "@/lib/inventory/access";
import { isClientCode } from "@/lib/inventory/overrides";
import { validateBufferBody, type BufferRow } from "@/lib/inventory/buffers";

const toRow = (r: { sku: string; bufferPct: number; setBy: string; setAt: Date | string }): BufferRow => ({
  sku: r.sku, bufferPct: r.bufferPct, setBy: r.setBy, setAt: new Date(r.setAt).toISOString(),
});

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = req.nextUrl.searchParams.get("client");
  if (!isClientCode(client)) return NextResponse.json({ error: "Missing client" }, { status: 400 });
  if (recReadScope(session.user, client) !== "hub") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(inventoryRecBuffers).where(eq(inventoryRecBuffers.clientIdCode, client));
  return NextResponse.json({ buffers: rows.map(toRow) });
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditRecs(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = validateBufferBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;
  const setBy = session.user?.email ?? "";
  const now = new Date();

  const [row] = await db
    .insert(inventoryRecBuffers)
    .values({ ...v, setBy, setAt: now })
    .onConflictDoUpdate({
      target: [inventoryRecBuffers.clientIdCode, inventoryRecBuffers.sku],
      set: { bufferPct: v.bufferPct, setBy, setAt: now },
    })
    .returning();
  return NextResponse.json({ buffer: toRow(row) });
}

export async function DELETE(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditRecs(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const client = req.nextUrl.searchParams.get("client");
  const sku = req.nextUrl.searchParams.get("sku");
  if (!isClientCode(client) || !sku) return NextResponse.json({ error: "Missing client or sku" }, { status: 400 });

  await db
    .delete(inventoryRecBuffers)
    .where(and(eq(inventoryRecBuffers.clientIdCode, client), eq(inventoryRecBuffers.sku, sku)));
  return NextResponse.json({ ok: true });
}
