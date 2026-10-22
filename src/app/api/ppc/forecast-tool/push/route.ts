/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import {
  forecastToolVersions,
  forecastToolCells,
  forecastToolAsins,
  clientForecasts,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !isEditorOrAbove(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { versionId } = await req.json();
  if (!versionId) return NextResponse.json({ error: "versionId required" }, { status: 400 });

  // Get version info
  const [version] = await db
    .select()
    .from(forecastToolVersions)
    .where(eq(forecastToolVersions.id, versionId));

  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  // Get all cells for this version
  const cells = await db
    .select()
    .from(forecastToolCells)
    .where(eq(forecastToolCells.versionId, versionId));

  // Get ASINs for weighted avg price
  const asins = await db
    .select()
    .from(forecastToolAsins)
    .where(eq(forecastToolAsins.versionId, versionId));

  const weightedAvgPrice = asins.reduce(
    (sum, a) => sum + (Number(a.productPrice) * Number(a.sharePct) / 100), 0
  );

  // Group cells by month, calculate product_sales and ad_spend
  const byMonth: Record<string, Record<string, number>> = {};
  for (const cell of cells) {
    if (!byMonth[cell.month]) byMonth[cell.month] = {};
    byMonth[cell.month][cell.metric] = Number(cell.value);
  }

  // Write to clientForecasts
  for (const [month, metrics] of Object.entries(byMonth)) {
    const unitsOrdered = metrics.units_ordered || 0;
    const productSales = unitsOrdered * weightedAvgPrice;
    const adSpend = metrics.spend || 0;

    for (const [metric, value] of [["product_sales", productSales], ["ad_spend", adSpend]] as const) {
      await db
        .insert(clientForecasts)
        .values({
          clientIdCode: version.clientIdCode,
          month,
          metric,
          forecastValue: String(value),
          updatedBy: session.user.id,
        })
        .onConflictDoUpdate({
          target: [clientForecasts.clientIdCode, clientForecasts.month, clientForecasts.metric],
          set: { forecastValue: String(value), updatedBy: session.user.id },
        });
    }
  }

  return NextResponse.json({ ok: true, monthsUpdated: Object.keys(byMonth).length });
}
