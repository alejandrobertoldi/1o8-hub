import { NextRequest, NextResponse } from "next/server";
import { eq, count } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aplus2Modules, aplus2ModuleItems } from "@/lib/db/schema";
import { APLUS2_MODULE_SPECS } from "@/lib/aplus2/module-specs";
import type { Aplus2ModuleType } from "@/lib/aplus2/module-specs";
import { hasAdminPowers } from "@/lib/roles";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;

  const [mod] = await db
    .select({ moduleType: aplus2Modules.moduleType })
    .from(aplus2Modules)
    .where(eq(aplus2Modules.id, moduleId))
    .limit(1);
  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  const spec = APLUS2_MODULE_SPECS[mod.moduleType as Aplus2ModuleType];
  const group = spec?.repeatableGroup;
  if (!group) return NextResponse.json({ error: "Module has no repeatable group" }, { status: 400 });

  const [{ total }] = await db
    .select({ total: count() })
    .from(aplus2ModuleItems)
    .where(eq(aplus2ModuleItems.moduleId, moduleId));

  if (total >= group.maxItems) {
    return NextResponse.json({ error: `Maximum ${group.maxItems} items reached` }, { status: 400 });
  }

  const [item] = await db
    .insert(aplus2ModuleItems)
    .values({ moduleId, position: total + 1, data: { type: group.itemDataType } })
    .returning();

  return NextResponse.json({ item });
}
