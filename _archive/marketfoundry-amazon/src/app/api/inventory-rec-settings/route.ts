import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { inventoryRecSettings, type InventoryRecSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_REC_SETTINGS, validateRecSettings, type RecSettings, type RecMethod } from "@/lib/inventory/rec-settings";
import { canEditRecs } from "@/lib/inventory/access";
import { isClientCode } from "@/lib/inventory/overrides";

export function toRecSettings(row: InventoryRecSettings | undefined): RecSettings {
  if (!row) return { ...DEFAULT_REC_SETTINGS };
  return {
    method: row.method as RecMethod,
    recentDays: row.recentDays,
    seasonalStart: row.seasonalStart,
    seasonalEnd: row.seasonalEnd,
    upliftPct: row.upliftPct,
  };
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  if (!isClientCode(clientIdCode)) return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });

  const [row] = await db
    .select()
    .from(inventoryRecSettings)
    .where(eq(inventoryRecSettings.clientIdCode, clientIdCode))
    .limit(1);

  return NextResponse.json(toRecSettings(row));
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditRecs(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!isClientCode(body?.clientIdCode)) return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
  const parsed = validateRecSettings(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const values = { ...parsed.value, updatedAt: new Date(), updatedBy: session.user?.email ?? "" };
  await db
    .insert(inventoryRecSettings)
    .values({ clientIdCode: body.clientIdCode, ...values })
    .onConflictDoUpdate({ target: inventoryRecSettings.clientIdCode, set: values });

  return NextResponse.json({ ok: true });
}
