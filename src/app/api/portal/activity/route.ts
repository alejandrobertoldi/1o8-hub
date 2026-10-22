import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { master, adminEventLog } from "@/lib/db/schema";
import { eq, and, inArray, desc, gte } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { unauthorized, resolvePortalClient } from "@/lib/api-utils";

const CURATED_SECTIONS = ["aplus", "publish", "portal", "products"];
const MAX_EVENTS = 200;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();

  const resolved = resolvePortalClient(session, req.nextUrl.searchParams);
  if (resolved.response) return resolved.response;
  const clientIdCode = resolved.clientIdCode;

  // Step 1: Get all product IDs belonging to this client
  const clientProducts = await db
    .select({ id: master.id })
    .from(master)
    .where(eq(master.clientIdCode, clientIdCode));

  const productIds = clientProducts.map((p) => p.id);

  if (productIds.length === 0) {
    return NextResponse.json({ events: [] });
  }

  // Step 2: Query events for these products (curated sections, last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const events = await db
    .select({
      id: adminEventLog.id,
      section: adminEventLog.section,
      action: adminEventLog.action,
      status: adminEventLog.status,
      message: adminEventLog.message,
      resourceLabel: adminEventLog.resourceLabel,
      createdAt: adminEventLog.createdAt,
      userName: adminEventLog.userName,
    })
    .from(adminEventLog)
    .where(
      and(
        inArray(adminEventLog.resourceId, productIds),
        inArray(adminEventLog.section, CURATED_SECTIONS),
        gte(adminEventLog.createdAt, ninetyDaysAgo)
      )
    )
    .orderBy(desc(adminEventLog.createdAt))
    .limit(MAX_EVENTS);

  return NextResponse.json({ events });
}
