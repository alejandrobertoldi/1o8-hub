// src/app/api/inventory-rec-overrides/route.ts
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { inventoryRecOverrides, type InventoryRecOverride } from "@/lib/db/schema";
import { canEditRecs, recReadScope } from "@/lib/inventory/access";
import { isClientCode, validateOverrideBody, type OverrideRow } from "@/lib/inventory/overrides";

const toRow = (r: Pick<InventoryRecOverride, "asin" | "sku" | "qty" | "note" | "setBy" | "setAt">): OverrideRow => ({
  asin: r.asin, sku: r.sku, qty: r.qty, note: r.note, setBy: r.setBy, setAt: new Date(r.setAt).toISOString(),
});

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = req.nextUrl.searchParams.get("client");
  if (!isClientCode(client)) return NextResponse.json({ error: "Missing client" }, { status: 400 });
  if (recReadScope(session.user, client) !== "hub") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(inventoryRecOverrides).where(eq(inventoryRecOverrides.clientIdCode, client));
  return NextResponse.json({ overrides: rows.map(toRow) });
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditRecs(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = validateOverrideBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;
  const setBy = session.user?.email ?? "";
  const now = new Date();

  const [row] = await db
    .insert(inventoryRecOverrides)
    .values({ ...v, setBy, setAt: now })
    .onConflictDoUpdate({
      target: [inventoryRecOverrides.clientIdCode, inventoryRecOverrides.sku],
      set: { asin: v.asin, qty: v.qty, note: v.note, setBy, setAt: now },
    })
    .returning();
  return NextResponse.json({ override: toRow(row) });
}

export async function DELETE(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditRecs(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const client = req.nextUrl.searchParams.get("client");
  const sku = req.nextUrl.searchParams.get("sku");
  if (!isClientCode(client) || !sku) return NextResponse.json({ error: "Missing client or sku" }, { status: 400 });

  await db
    .delete(inventoryRecOverrides)
    .where(and(eq(inventoryRecOverrides.clientIdCode, client), eq(inventoryRecOverrides.sku, sku)));
  return NextResponse.json({ ok: true });
}
