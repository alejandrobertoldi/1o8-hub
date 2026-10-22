import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

export async function GET(req: NextRequest) {
  try {
    const settingsKey = req.nextUrl.searchParams.get("key") || "config_doc";
    const rows = await db.select().from(seoSettings).where(eq(seoSettings.key, settingsKey)).limit(1);
    const value = rows[0]?.value ?? "";
    const updatedAt = rows[0]?.updatedAt ?? null;
    const updatedBy = rows[0]?.updatedBy ?? "";
    return NextResponse.json({ value, updated_at: updatedAt, updated_by: updatedBy });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session || !hasAdminPowers(session.user.role)) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const body = await req.json();
    const settingsKey = body.key || "config_doc";
    const value = body.value;
    if (typeof value !== "string") {
      return NextResponse.json({ error: "value must be a string" }, { status: 400 });
    }
    const [row] = await db
      .insert(seoSettings)
      .values({ key: settingsKey, value, updatedBy: session.user.email! })
      .onConflictDoUpdate({
        target: seoSettings.key,
        set: { value, updatedAt: new Date(), updatedBy: session.user.email! },
      })
      .returning();
    return NextResponse.json({ value: row.value, updated_at: row.updatedAt, updated_by: row.updatedBy });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
