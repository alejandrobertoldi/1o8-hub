import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, aac, seoProjects } from "@/lib/db/schema";
import { ilike, or, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ products: [], clients: [], seoProjects: [] });
  }

  const pattern = `%${q}%`;

  const [productRows, clientRows, seoRows] = await Promise.all([
    db
      .select({
        id: master.id,
        asin: master.asin,
        sku: master.sku,
        itemName: master.itemName,
        summarizedTitle: master.summarizedTitle,
        clientIdCode: master.clientIdCode,
        mainImageUrl: master.mainImageUrl,
      })
      .from(master)
      .where(
        or(
          ilike(master.asin, pattern),
          ilike(master.sku, pattern),
          ilike(master.itemName, pattern),
          ilike(master.summarizedTitle, pattern),
          ilike(master.brandName, pattern)
        )
      )
      .limit(8),

    db
      .select({
        id: aac.id,
        clientIdCode: aac.clientIdCode,
        clientName: aac.clientName,
        clientStatus: aac.clientStatus,
      })
      .from(aac)
      .where(
        or(
          ilike(aac.clientIdCode, pattern),
          ilike(aac.clientName, pattern)
        )
      )
      .limit(5),

    db
      .select({
        id: seoProjects.id,
        name: seoProjects.name,
        status: seoProjects.status,
        currentPhase: seoProjects.currentPhase,
        clientIdCode: seoProjects.clientIdCode,
      })
      .from(seoProjects)
      .where(
        or(
          ilike(seoProjects.name, pattern),
          ilike(seoProjects.clientIdCode, pattern)
        )
      )
      .limit(5),
  ]);

  return NextResponse.json({
    products: productRows,
    clients: clientRows,
    seoProjects: seoRows,
  });
}
