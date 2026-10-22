import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/async-await-in-loop */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoAsins } from "@/lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";

export async function POST() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allAsins = await db
    .select({ id: seoAsins.id, generatedContent: seoAsins.generatedContent })
    .from(seoAsins)
    .where(isNotNull(seoAsins.generatedContent));

  const encoder = new TextEncoder();
  let updated = 0;

  for (const row of allAsins) {
    const gc = row.generatedContent as Record<string, unknown> | null;
    if (!gc) continue;

    let changed = false;
    for (const key of Object.keys(gc)) {
      if (key.endsWith("_CharLength")) {
        const contentKey = key.replace("_CharLength", "");
        if (typeof gc[contentKey] === "string") {
          const correct = (gc[contentKey] as string).length;
          if (gc[key] !== correct) {
            gc[key] = correct;
            changed = true;
          }
        }
      } else if (key.endsWith("_ByteLength")) {
        const contentKey = key.replace("_ByteLength", "");
        if (typeof gc[contentKey] === "string") {
          const correct = encoder.encode(gc[contentKey] as string).length;
          if (gc[key] !== correct) {
            gc[key] = correct;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      await db.update(seoAsins).set({ generatedContent: gc as any }).where(eq(seoAsins.id, row.id));
      updated++;
    }
  }

  return NextResponse.json({ success: true, total: allAsins.length, updated });
}
