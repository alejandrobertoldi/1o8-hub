import { hasAdminPowers } from "@/lib/roles";
/**
 * POST /api/aplus2/versions/[versionId]/modules
 *   Body: { moduleType: Aplus2ModuleType, itemCount?: number }
 *   Inserts a new module at the next position (rejects once the tier cap is
 *   reached: 5 modules for BA+, 7 for PA+).
 *   Pre-seeds aplus2_module_items with `defaultCount` empty rows per the
 *   spec's repeatableGroup, or `itemCount` when provided (clamped to min/max).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aplus2ModuleItems, aplus2Modules, aplus2Versions } from "@/lib/db/schema";
import { APLUS2_MODULE_SPECS, APLUS2_MODULE_TYPES, maxModulesForTier, type Aplus2ModuleType } from "@/lib/aplus2/module-specs";
import { defaultItemDataFor } from "@/lib/aplus2/zod-schemas";

const schema = z.strictObject({
  moduleType: z.enum(APLUS2_MODULE_TYPES),
  itemCount: z.number().int().min(1).max(16).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { versionId } = await params;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body", details: body.error.flatten() }, { status: 400 });
  }

  const moduleType = body.data.moduleType as Aplus2ModuleType;
  const spec = APLUS2_MODULE_SPECS[moduleType];

  const [version] = await db
    .select({ id: aplus2Versions.id, contentType: aplus2Versions.contentType })
    .from(aplus2Versions)
    .where(eq(aplus2Versions.id, versionId))
    .limit(1);
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const result = await db.transaction(async (tx) => {
    const [maxRow] = await tx
      .select({ maxPos: sql<number>`COALESCE(MAX(${aplus2Modules.position}), 0)::int` })
      .from(aplus2Modules)
      .where(eq(aplus2Modules.versionId, versionId));
    const nextPos = (maxRow?.maxPos ?? 0) + 1;
    const maxModules = maxModulesForTier(version.contentType);
    if (nextPos > maxModules) {
      throw new Error(`This tier allows ${maxModules} modules`);
    }

    const [moduleRow] = await tx
      .insert(aplus2Modules)
      .values({
        versionId,
        position: nextPos,
        moduleType,
        status: "draft",
      })
      .returning({ id: aplus2Modules.id, position: aplus2Modules.position });

    if (spec.repeatableGroup) {
      const seed = defaultItemDataFor(moduleType);
      const group = spec.repeatableGroup;
      const requested = body.data.itemCount ?? group.defaultCount;
      const count = Math.min(group.maxItems, Math.max(group.minItems, requested));
      await tx.insert(aplus2ModuleItems).values(
        Array.from({ length: count }, (_, i) => ({
          moduleId: moduleRow.id,
          position: i + 1,
          data: seed ?? {},
        }))
      );
    }

    await tx
      .update(aplus2Versions)
      .set({ updatedAt: new Date() })
      .where(eq(aplus2Versions.id, versionId));

    return { moduleId: moduleRow.id, position: moduleRow.position };
  }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg } as const;
  });

  if ("error" in result) {
    const code = result.error.includes("allows") && result.error.includes("modules") ? 409 : 500;
    return NextResponse.json({ error: result.error }, { status: code });
  }

  return NextResponse.json({ ok: true, ...result, moduleType });
}
