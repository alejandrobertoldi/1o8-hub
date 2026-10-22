import { hasAdminPowers } from "@/lib/roles";
/**
 * PATCH /api/aplus2/items/[itemId]
 *   Body: { data: Aplus2ItemData }
 *   Validates the data shape against the parent module's type. Replaces
 *   the JSONB column atomically.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, count } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aplus2ModuleItems, aplus2Modules, aplus2Versions } from "@/lib/db/schema";
import { validateItemData } from "@/lib/aplus2/zod-schemas";
import type { Aplus2ModuleType } from "@/lib/aplus2/module-specs";
import { APLUS2_MODULE_SPECS } from "@/lib/aplus2/module-specs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { itemId } = await params;
  const body = await req.json().catch(() => null) as { data?: unknown } | null;
  if (!body || !("data" in body)) {
    return NextResponse.json({ error: "Body must contain 'data'" }, { status: 400 });
  }

  const [itemRow] = await db
    .select({
      itemId: aplus2ModuleItems.id,
      moduleId: aplus2ModuleItems.moduleId,
      moduleType: aplus2Modules.moduleType,
      versionId: aplus2Modules.versionId,
    })
    .from(aplus2ModuleItems)
    .innerJoin(aplus2Modules, eq(aplus2Modules.id, aplus2ModuleItems.moduleId))
    .where(eq(aplus2ModuleItems.id, itemId))
    .limit(1);
  if (!itemRow) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const check = validateItemData(itemRow.moduleType as Aplus2ModuleType, body.data);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  await db.transaction(async (tx) => {
    await tx
      .update(aplus2ModuleItems)
      .set({ data: check.value as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(aplus2ModuleItems.id, itemId));
    await tx.update(aplus2Versions).set({ updatedAt: new Date() }).where(eq(aplus2Versions.id, itemRow.versionId));
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { itemId } = await params;

  const [itemRow] = await db
    .select({ moduleId: aplus2ModuleItems.moduleId, moduleType: aplus2Modules.moduleType, versionId: aplus2Modules.versionId })
    .from(aplus2ModuleItems)
    .innerJoin(aplus2Modules, eq(aplus2Modules.id, aplus2ModuleItems.moduleId))
    .where(eq(aplus2ModuleItems.id, itemId))
    .limit(1);
  if (!itemRow) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const spec = APLUS2_MODULE_SPECS[itemRow.moduleType as Aplus2ModuleType];
  const minItems = spec?.repeatableGroup?.minItems ?? 1;

  const [{ total }] = await db.select({ total: count() }).from(aplus2ModuleItems).where(eq(aplus2ModuleItems.moduleId, itemRow.moduleId));
  if (total <= minItems) {
    return NextResponse.json({ error: `Minimum ${minItems} items required` }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    await tx.delete(aplus2ModuleItems).where(eq(aplus2ModuleItems.id, itemId));
    await tx.update(aplus2Versions).set({ updatedAt: new Date() }).where(eq(aplus2Versions.id, itemRow.versionId));
  });

  return NextResponse.json({ ok: true });
}
