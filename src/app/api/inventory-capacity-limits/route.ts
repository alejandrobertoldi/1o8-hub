// FBA capacity limits per client / storage type / month, typed in from Seller
// Central's Capacity Monitor. Same access as the rec overrides: hub read, editors write.
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { inventoryCapacityLimits } from "@/lib/db/schema";
import { canEditRecs, recReadScope } from "@/lib/inventory/access";
import { isClientCode } from "@/lib/inventory/overrides";
import { validateLimitBody, type CapacityLimitRow, type StorageType } from "@/lib/inventory/capacity";

const toRow = (r: { storageType: string; month: string; limitFt3: number; status: string; setBy: string; setAt: Date | string }): CapacityLimitRow => ({
  storageType: r.storageType as StorageType, month: r.month, limitFt3: r.limitFt3,
  status: r.status === "confirmed" ? "confirmed" : "estimate", setBy: r.setBy, setAt: new Date(r.setAt).toISOString(),
});

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = req.nextUrl.searchParams.get("client");
  if (!isClientCode(client)) return NextResponse.json({ error: "Missing client" }, { status: 400 });
  if (recReadScope(session.user, client) !== "hub") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db.select().from(inventoryCapacityLimits).where(eq(inventoryCapacityLimits.clientIdCode, client));
  return NextResponse.json({ limits: rows.map(toRow) });
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditRecs(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = validateLimitBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { clientIdCode, storageType, month, limitFt3, status } = parsed.value;
  const where = and(
    eq(inventoryCapacityLimits.clientIdCode, clientIdCode),
    eq(inventoryCapacityLimits.storageType, storageType),
    eq(inventoryCapacityLimits.month, month),
  );
  if (limitFt3 === null) {
    await db.delete(inventoryCapacityLimits).where(where);
    return NextResponse.json({ ok: true });
  }
  const setBy = session.user?.email ?? "";
  const now = new Date();
  const [row] = await db
    .insert(inventoryCapacityLimits)
    // New limits start as estimates; a status is only changed when the body sends one.
    .values({ clientIdCode, storageType, month, limitFt3, status: status ?? "estimate", setBy, setAt: now })
    .onConflictDoUpdate({
      target: [inventoryCapacityLimits.clientIdCode, inventoryCapacityLimits.storageType, inventoryCapacityLimits.month],
      set: status ? { limitFt3, status, setBy, setAt: now } : { limitFt3, setBy, setAt: now },
    })
    .returning();
  return NextResponse.json({ limit: toRow(row) });
}
