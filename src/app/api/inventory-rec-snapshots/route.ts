// src/app/api/inventory-rec-snapshots/route.ts
import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { inventoryRecSnapshots, inventoryRecSnapshotRows, type InventoryRecSnapshot } from "@/lib/db/schema";
import { canEditRecs, recReadScope } from "@/lib/inventory/access";
import { isClientCode } from "@/lib/inventory/overrides";
import { summarizeRows, validateSnapshotBody, type SnapshotHeader } from "@/lib/inventory/snapshot";
import type { RecMethod } from "@/lib/inventory/rec-settings";

export function toHeader(r: InventoryRecSnapshot): SnapshotHeader {
  return {
    id: r.id, clientIdCode: r.clientIdCode, sentBy: r.sentBy, sentAt: new Date(r.sentAt).toISOString(),
    method: r.method as RecMethod, recentDays: r.recentDays, seasonalStart: r.seasonalStart, seasonalEnd: r.seasonalEnd,
    upliftPct: r.upliftPct, skuCount: r.skuCount, unitsToSend: r.unitsToSend,
    overstockSkus: r.overstockSkus, overstockUnits: r.overstockUnits,
  };
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = req.nextUrl.searchParams.get("client");
  if (!isClientCode(client)) return NextResponse.json({ error: "Missing client" }, { status: 400 });
  const scope = recReadScope(session.user, client);
  if (!scope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select()
    .from(inventoryRecSnapshots)
    .where(eq(inventoryRecSnapshots.clientIdCode, client))
    .orderBy(desc(inventoryRecSnapshots.sentAt))
    .limit(50);
  const snapshots = rows.map(toHeader).map((h) => (scope === "portal" ? { ...h, sentBy: "" } : h));
  return NextResponse.json({ snapshots });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditRecs(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = validateSnapshotBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { clientIdCode, settings, rows } = parsed.value;
  const totals = summarizeRows(rows); // server-computed, never trusted from the browser

  try {
    const header = await db.transaction(async (tx) => {
      const [h] = await tx
        .insert(inventoryRecSnapshots)
        .values({ clientIdCode, sentBy: session.user?.email ?? "", ...settings, ...totals })
        .returning();
      await tx.insert(inventoryRecSnapshotRows).values(rows.map((r) => ({ ...r, snapshotId: h.id })));
      return h;
    });
    return NextResponse.json({ snapshot: toHeader(header) });
  } catch (e) {
    console.error("[inventory-rec-snapshots] insert failed", e);
    return NextResponse.json({ error: "Could not save the snapshot" }, { status: 500 });
  }
}
