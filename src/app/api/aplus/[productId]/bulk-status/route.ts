import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aplusModules, activityLog, master } from "@/lib/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 60;

const ALLOWED_STATUSES = ["draft", "in_review", "approved", "uploaded"] as const;
const ADMIN_ONLY_STATUSES = ["approved", "uploaded"] as const;

type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessSection(session, "aplus")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { productId } = await params;

  try {

  const body = await req.json();
  const { status } = body as { status: string };

  if (!ALLOWED_STATUSES.includes(status as AllowedStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  if (
    ADMIN_ONLY_STATUSES.includes(status as "approved" | "uploaded") &&
    !hasAdminPowers(role)
  ) {
    return NextResponse.json(
      { error: "Only admins can set status to approved or uploaded" },
      { status: 403 }
    );
  }

  const updated = await db
    .update(aplusModules)
    .set({ status: status as AllowedStatus, updatedAt: new Date() })
    .where(
      and(
        eq(aplusModules.productId, productId),
        isNotNull(aplusModules.moduleType)
      )
    )
    .returning({ id: aplusModules.id });

  // Log bulk status change
  if (updated.length > 0) {
    const [product] = await db
      .select({ asin: master.asin, sku: master.sku, clientIdCode: master.clientIdCode })
      .from(master)
      .where(eq(master.id, productId))
      .limit(1);

    await db.insert(activityLog).values({
      productId,
      asin: product?.asin ?? null,
      sku: product?.sku ?? null,
      clientIdCode: product?.clientIdCode ?? null,
      itemName: null,
      fieldLabel: "A+ Bulk Status",
      bqName: "aplus_bulk_status",
      oldValue: null,
      newValue: `${status} (${updated.length} modules)`,
      changedBy: session.user.email ?? "",
      editType: "aplus",
    });
  }

  return NextResponse.json({ updated: updated.length });

  } catch (err) {
    console.error("[aplus bulk-status PATCH] Error:", err);
    return NextResponse.json({ error: "Failed to update statuses" }, { status: 500 });
  }
}
