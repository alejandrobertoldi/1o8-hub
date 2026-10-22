import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 60;

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select()
    .from(seoSettings)
    .where(eq(seoSettings.key, "support_email"))
    .limit(1);

  return NextResponse.json({ support_email: row?.value || "" });
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { support_email } = (await req.json()) as { support_email: string };
  const trimmed = (support_email || "").trim();

  const [existing] = await db
    .select()
    .from(seoSettings)
    .where(eq(seoSettings.key, "support_email"))
    .limit(1);

  if (existing) {
    await db
      .update(seoSettings)
      .set({ value: trimmed, updatedAt: new Date(), updatedBy: session.user.email! })
      .where(eq(seoSettings.key, "support_email"));
  } else {
    await db.insert(seoSettings).values({
      key: "support_email",
      value: trimmed,
      updatedBy: session.user.email!,
    });
  }

  return NextResponse.json({ support_email: trimmed });
}
