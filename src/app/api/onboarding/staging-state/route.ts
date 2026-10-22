/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, stagedAlrLinks, stagedClrProducts } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  if (!clientIdCode) {
    return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
  }

  const [clrSummary] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      productTypes: sql<number>`COUNT(DISTINCT ${stagedClrProducts.productType})::int`,
      missingRequired: sql<number>`COUNT(*) FILTER (WHERE NOT ${stagedClrProducts.requiredComplete})::int`,
    })
    .from(stagedClrProducts)
    .where(eq(stagedClrProducts.clientIdCode, clientIdCode));

  const alrByStatus = await db
    .select({
      status: stagedAlrLinks.status,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(stagedAlrLinks)
    .where(eq(stagedAlrLinks.clientIdCode, clientIdCode))
    .groupBy(stagedAlrLinks.status);

  const alrCount = alrByStatus.reduce((sum, r) => sum + r.count, 0);
  const byStatus = { Active: 0, Inactive: 0, Incomplete: 0, Other: 0 } as Record<
    "Active" | "Inactive" | "Incomplete" | "Other",
    number
  >;
  for (const row of alrByStatus) {
    const key =
      row.status === "Active" || row.status === "Inactive" || row.status === "Incomplete"
        ? row.status
        : "Other";
    byStatus[key] += row.count;
  }

  // Master count + last-write timestamp let the UI surface a persistent
  // "Merged" confirmation after merge-master wipes both staging tables.
  // For AIA clients these rows come exclusively from the CLR/ALR merge.
  const [masterSummary] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      lastUpdatedAt: sql<Date | null>`MAX(${master.updatedAt})`,
    })
    .from(master)
    .where(eq(master.clientIdCode, clientIdCode));

  return NextResponse.json({
    hasClr: clrSummary.count > 0,
    hasAlr: alrCount > 0,
    clr: {
      count: clrSummary.count,
      productTypes: clrSummary.productTypes,
      missingRequired: clrSummary.missingRequired,
    },
    alr: {
      count: alrCount,
      byStatus,
    },
    master: {
      count: masterSummary.count,
      lastUpdatedAt: masterSummary.lastUpdatedAt
        ? new Date(masterSummary.lastUpdatedAt).toISOString()
        : null,
    },
  });
}
