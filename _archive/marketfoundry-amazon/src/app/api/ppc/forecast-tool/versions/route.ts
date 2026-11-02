/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/js-flatmap-filter */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import { forecastToolVersions, forecastToolAsins, master } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import {
  getIntentwiseAccountId,
  fetchAccountHistorical,
  fetchAsinHistorical,
} from "@/lib/forecast-redshift";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");

  // If no clientIdCode, return latest version per client (for landing page)
  if (!clientIdCode) {
    const all = await db
      .select({
        id: forecastToolVersions.id,
        clientIdCode: forecastToolVersions.clientIdCode,
        name: forecastToolVersions.name,
        isLocked: forecastToolVersions.isLocked,
        isCurrent: forecastToolVersions.isCurrent,
        createdAt: forecastToolVersions.createdAt,
      })
      .from(forecastToolVersions)
      .orderBy(desc(forecastToolVersions.createdAt));
    // Pick latest per client
    const latestMap: Record<string, typeof all[0]> = {};
    for (const v of all) {
      if (!latestMap[v.clientIdCode]) latestMap[v.clientIdCode] = v;
    }
    return NextResponse.json({ versions: Object.values(latestMap) });
  }

  const versions = await db
    .select()
    .from(forecastToolVersions)
    .where(eq(forecastToolVersions.clientIdCode, clientIdCode))
    .orderBy(desc(forecastToolVersions.createdAt));

  return NextResponse.json({ versions });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !isEditorOrAbove(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { clientIdCode, name, asins, skus, historicStart, forecastStart, forecastEnd } = await req.json();
  if (!clientIdCode || !name)
    return NextResponse.json({ error: "clientIdCode and name required" }, { status: 400 });

  // Unset any existing current version for this client
  await db
    .update(forecastToolVersions)
    .set({ isCurrent: false })
    .where(and(eq(forecastToolVersions.clientIdCode, clientIdCode), eq(forecastToolVersions.isCurrent, true)));

  const [version] = await db
    .insert(forecastToolVersions)
    .values({
      clientIdCode,
      name,
      createdBy: session.user.id,
      isCurrent: true,
      historicStart: historicStart || null,
      forecastStart: forecastStart || null,
      forecastEnd: forecastEnd || null,
    })
    .returning();

  // Auto-load ASINs from master table for this client
  const clientProducts = await db
    .select({
      asin: master.asin,
      sku: master.sku,
      title: master.itemName,
      price: master.listPrice,
      variations: master.variations,
    })
    .from(master)
    .where(eq(master.clientIdCode, clientIdCode));

  // Filter to selected ASINs/SKUs if provided
  const asinSet = Array.isArray(asins) && asins.length > 0 ? new Set(asins as string[]) : null;
  const skuSet = Array.isArray(skus) && skus.length > 0 ? new Set(skus as string[]) : null;
  const selected = (asinSet || skuSet)
    ? clientProducts.filter((p) =>
        (p.asin && asinSet?.has(p.asin)) || (!p.asin && p.sku && skuSet?.has(p.sku))
      )
    : clientProducts;

  if (selected.length > 0) {
    await db.insert(forecastToolAsins).values(
      selected.map((p, i) => {
        // Extract variation attributes from JSONB (Color, Size, Flavor, Style)
        const varAttrs: Record<string, string> = {};
        if (p.variations && typeof p.variations === "object") {
          const v = p.variations as Record<string, string | undefined>;
          for (const key of ["Color", "Size", "Flavor", "Style"]) {
            if (v[key]) varAttrs[key] = v[key]!;
          }
        }
        return {
          versionId: version.id,
          asin: p.asin,
          sku: p.sku,
          productName: p.title || p.asin || "Unknown",
          productPrice: String(parseFloat(p.price || "0") || 0),
          sharePct: "0",
          variationAttributes: Object.keys(varAttrs).length > 0 ? varAttrs : null,
          isNew: false,
          sortOrder: i,
        };
      })
    );
  }

  // Fetch & cache Redshift historical data on first creation
  try {
    const iwId = await getIntentwiseAccountId(clientIdCode);
    if (iwId) {
      const asinCodes = selected.map((p) => p.asin).filter(Boolean) as string[];
      const [historicalData, asinHistoricalData] = await Promise.all([
        fetchAccountHistorical(iwId),
        fetchAsinHistorical(iwId, asinCodes),
      ]);
      await db
        .update(forecastToolVersions)
        .set({ historicalData, asinHistoricalData })
        .where(eq(forecastToolVersions.id, version.id));
    }
  } catch (err) {
    console.error("[forecast-tool] Failed to cache Redshift data on version create:", err);
    // Version still created — user can refresh later
  }

  return NextResponse.json({ version }, { status: 201 });
}
