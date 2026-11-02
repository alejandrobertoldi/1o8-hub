import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, varietyPackItems, variations, driveFolders } from "@/lib/db/schema";
import { and, eq, ilike, or, sql, asc, type SQL } from "drizzle-orm";
import { driveClient } from "@/lib/drive-client";
import { CLIENT_NAMES } from "@/lib/constants";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 60;

// Hard cap so a runaway export can't pull 100k rows + blow the function timeout.
const EXPORT_ROW_CAP = 5000;

type ExportRow = {
  clientIdCode: string | null;
  marketplace: string | null;
  asin: string | null;
  sku: string | null;
  status: string | null;
  parentageLevel: string | null;
  summarizedTitle: string | null;
  itemName: string | null;
  variationId: string | null;
  variationGroup: string | null;
  variationThemeName: string | null;
  brandName: string | null;
  listPrice: string | null;
  parentAsin: string | null;
  parentSku: string | null;
  updatedAt: Date | null;
  variations: Record<string, string | undefined> | null;
  vpFlavors: string[] | null;
  varietyPackItemCount: number | null;
};

/**
 * Find or create the `{clientIdCode}_Exports` subfolder inside the client root.
 * Mirrors resolveReportsFolder in src/app/api/reports/monthly/pdf/drive/route.ts.
 */
async function resolveExportsFolder(clientIdCode: string): Promise<string> {
  const exportsFolderPath = `${clientIdCode}/Exports`;

  const [existing] = await db
    .select({ driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(
      and(
        eq(driveFolders.clientIdCode, clientIdCode),
        eq(driveFolders.path, exportsFolderPath)
      )
    )
    .limit(1);

  if (existing) return existing.driveFolderId;

  const [root] = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(
      and(
        eq(driveFolders.clientIdCode, clientIdCode),
        eq(driveFolders.folderType, "client")
      )
    )
    .limit(1);

  if (!root) {
    throw new Error(
      `No Drive root folder for client ${clientIdCode}. Complete onboarding (drive_folders step) first.`
    );
  }

  const folderName = `${clientIdCode}_Exports`;
  const created = await driveClient.createFolder(folderName, root.driveFolderId);

  await db.insert(driveFolders).values({
    clientIdCode,
    driveFolderId: created.id,
    folderType: "exports",
    path: exportsFolderPath,
    parentFolderId: root.id,
    name: folderName,
  });

  return created.id;
}

function buildXlsxBuffer(rows: ExportRow[]): Buffer {
  const data = rows.map((r) => {
    const v = r.variations || {};
    const isVariety = (r.varietyPackItemCount ?? 0) > 0 || (r.vpFlavors?.length ?? 0) > 0;
    return {
      "Client Name": CLIENT_NAMES[r.clientIdCode || ""] || r.clientIdCode || "",
      "Client Code": r.clientIdCode || "",
      "Marketplace": r.marketplace || "",
      "ASIN": r.asin || "",
      "SKU": r.sku || "",
      "Listing Status": r.status || "",
      "Parentage Level": r.parentageLevel || "",
      "Summarized Title": r.summarizedTitle || r.itemName || "",
      "Variation ID": r.variationId || "",
      "Variation Group": r.variationGroup || "",
      "Variation Theme": r.variationThemeName || "",
      "Variety Pack": isVariety ? "Yes" : "",
      "Variety Pack Items": r.vpFlavors?.join(", ") || "",
      "Color": v.Color || "",
      "Size": v.Size || "",
      "Flavor": v.Flavor || "",
      "Style": v.Style || "",
      "Brand": r.brandName || "",
      "List Price": r.listPrice || "",
      "Parent ASIN": r.parentAsin || "",
      "Parent SKU": r.parentSku || "",
      "Updated At": r.updatedAt ? new Date(r.updatedAt).toISOString() : "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  if (data.length > 0) {
    const headers = Object.keys(data[0]);
    ws["!cols"] = headers.map((h) => ({
      wch: Math.min(
        50,
        Math.max(
          h.length,
          ...data.slice(0, 200).map((d) => String((d as Record<string, unknown>)[h] ?? "").length)
        ) + 2
      ),
    }));
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");

  // sheetJS returns a Node Buffer when type="buffer"
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = req.nextUrl.searchParams;
  const client = (url.get("client") || "").trim();
  if (!client) {
    return NextResponse.json(
      { error: "A specific client must be selected to save to Google Sheets" },
      { status: 400 }
    );
  }
  // Sheet target requires a single client (path is per-client).
  if (client.includes(",")) {
    return NextResponse.json(
      { error: "Pick a single client to save to Google Sheets" },
      { status: 400 }
    );
  }

  const search = url.get("search") || "";
  const marketplace = url.get("marketplace") || "";
  const status = url.get("status") || "";
  const isDirty = url.get("isDirty");
  const parentsOnly = url.get("parentsOnly") === "true";

  // ── Build where clause (mirrors /api/products GET filters) ────────────
  const conditions: SQL[] = [];

  if (parentsOnly) {
    const p = or(
      ilike(master.parentageLevel, "parent"),
      sql`${master.parentSku} IS NULL`,
      sql`(${master.parentageLevel} = 'Child' AND (${master.variations}->>'VariationID' IS NULL OR ${master.variations}->>'VariationID' = ''))`
    );
    if (p) conditions.push(p);
  }

  conditions.push(ilike(master.clientIdCode, client));

  if (search) {
    const s = or(
      ilike(master.asin, `%${search}%`),
      ilike(master.sku, `%${search}%`),
      ilike(master.brandName, `%${search}%`),
      ilike(master.itemName, `%${search}%`),
      ilike(master.summarizedTitle, `%${search}%`),
      ilike(master.clientIdCode, `%${search}%`)
    );
    if (s) conditions.push(s);
  }

  if (marketplace) {
    conditions.push(ilike(master.marketplace, marketplace));
  }

  if (status) {
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push(ilike(master.status, statuses[0]));
    } else if (statuses.length > 1) {
      const s = or(...statuses.map((s) => ilike(master.status, s)));
      if (s) conditions.push(s);
    }
  }

  if (isDirty === "true") conditions.push(sql`${master.isDirty} = true`);
  else if (isDirty === "false") conditions.push(sql`${master.isDirty} = false`);

  const where = and(...conditions);

  const variationIdExpr = sql<string | null>`COALESCE(${master.variations}->>'VariationID', ${master.otherAttributes}->>'VariationID', ${master.rawColumnValues}->>'VariationID')`;
  const variationThemeExpr = sql<string | null>`COALESCE(${master.variations}->>'VariationThemeName', ${master.otherAttributes}->>'VariationThemeName', ${master.rawColumnValues}->>'VariationThemeName')`;

  // Pull only what the export needs, plus client/variation grouping for predictable order.
  const rows = (await db
    .select({
      clientIdCode: master.clientIdCode,
      marketplace: master.marketplace,
      asin: master.asin,
      sku: master.sku,
      status: master.status,
      parentageLevel: master.parentageLevel,
      summarizedTitle: master.summarizedTitle,
      itemName: master.itemName,
      variationId: variationIdExpr,
      variationGroup: master.variationGroup,
      variationThemeName: variationThemeExpr,
      brandName: master.brandName,
      listPrice: master.listPrice,
      parentAsin: master.parentAsin,
      parentSku: master.parentSku,
      updatedAt: master.updatedAt,
      variations: sql<Record<string, string | undefined> | null>`
        COALESCE(${master.variations}, '{}'::jsonb) ||
        jsonb_strip_nulls(jsonb_build_object(
          'Flavor', COALESCE(${master.variations}->>'Flavor', ${master.otherAttributes}->>'Flavor', ${master.rawColumnValues}->>'Flavor'),
          'Size',   COALESCE(${master.variations}->>'Size',   ${master.otherAttributes}->>'Size',   ${master.rawColumnValues}->>'Size'),
          'Color',  COALESCE(${master.variations}->>'Color',  ${master.otherAttributes}->>'Color',  ${master.rawColumnValues}->>'Color'),
          'Style',  COALESCE(${master.variations}->>'Style',  ${master.otherAttributes}->>'Style',  ${master.rawColumnValues}->>'Style')
        ))
      `,
      varietyPackItemCount: sql<number>`(SELECT count(*)::int FROM ${varietyPackItems} WHERE ${varietyPackItems.packProductId} = "master"."id")`,
      vpFlavors: sql<string[] | null>`(SELECT json_agg(CASE WHEN vpi.units > 1 THEN vpi.units || '× ' || vpi.flavor ELSE vpi.flavor END ORDER BY vpi.sort_order) FROM ${varietyPackItems} vpi WHERE vpi.pack_product_id = "master"."id" AND vpi.flavor IS NOT NULL)`,
    })
    .from(master)
    .leftJoin(variations, eq(master.variationRef, variations.id))
    .where(where)
    .orderBy(
      asc(master.clientIdCode),
      asc(sql`${variationIdExpr} IS NULL`),
      asc(variationIdExpr),
      asc(sql`CASE WHEN ${master.parentageLevel} ILIKE 'parent' THEN 0 WHEN ${master.parentageLevel} ILIKE 'child' THEN 1 ELSE 2 END`),
      asc(sql`${master.variationGroup} IS NULL`),
      asc(master.variationGroup)
    )
    .limit(EXPORT_ROW_CAP)) as ExportRow[];

  if (rows.length === 0) {
    return NextResponse.json({ error: "No products match the current filters" }, { status: 400 });
  }

  let folderId: string;
  try {
    folderId = await resolveExportsFolder(client);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to locate client Drive folder" },
      { status: 500 }
    );
  }

  const buffer = buildXlsxBuffer(rows);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const sheetName = `${client}_products_${stamp}`;

  const driveFile = await driveClient.uploadAsSheet(sheetName, folderId, buffer);

  return NextResponse.json({
    fileId: driveFile.id,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${driveFile.id}/edit`,
    folderId,
    count: rows.length,
    capped: rows.length >= EXPORT_ROW_CAP,
    name: driveFile.name,
  });
}
