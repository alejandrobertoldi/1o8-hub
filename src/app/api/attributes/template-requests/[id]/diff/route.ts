/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  attributeTemplateRequests,
  categoryDefinitions,
  master,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { sheetsClient } from "@/lib/sheets-client";
import { computeDiff } from "@/lib/template-finalize-diff";
import { getProductFieldValue } from "@/lib/product-mapper";
import { getAttributesForCategory } from "@/lib/category-meta-queries";
import { categoryDefinitionColumns } from "@/lib/category-definitions/columns";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [record] = await db
    .select()
    .from(attributeTemplateRequests)
    .where(eq(attributeTemplateRequests.id, id))
    .limit(1);

  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.status === "legacy") {
    return NextResponse.json({ error: "Legacy XLSX request — no Sheet to diff" }, { status: 400 });
  }
  if (!record.googleSheetId) {
    return NextResponse.json({ error: "No sheet associated with this request" }, { status: 400 });
  }

  // Resolve the category definition(s) + attributes to know which columns to read
  const defs = record.productType === "all"
    ? await db.select(categoryDefinitionColumns).from(categoryDefinitions).where(eq(categoryDefinitions.clientIdCode, record.clientIdCode))
    : await db.select(categoryDefinitionColumns).from(categoryDefinitions).where(
        and(
          eq(categoryDefinitions.clientIdCode, record.clientIdCode),
          eq(categoryDefinitions.productType, record.productType)
        )
      );

  // Read each category tab in one batchGet call
  const ranges = defs.map((d) => `${d.productType}!A6:ZZ`);
  let valueRanges: { range: string; values: string[][] }[] = [];
  try {
    const res = await sheetsClient.getValues(record.googleSheetId, ranges);
    valueRanges = res.valueRanges ?? [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/404/.test(msg)) return NextResponse.json({ error: "Sheet deleted" }, { status: 409 });
    if (/403/.test(msg)) return NextResponse.json({ error: "Sheet permissions revoked" }, { status: 403 });
    throw e;
  }

  // Build sheetNow + catalogNow maps keyed by asin:field
  const sheetNow: Record<string, Record<string, string | null>> = {};
  const catalogNow: Record<string, Record<string, string | null>> = {};

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const tab = valueRanges[i]?.values ?? [];
    const attrs = await getAttributesForCategory(def.marketplaceId, def.productType);
    const filtered = attrs.filter((a) => {
      if (a.requirement && record.levels.includes(a.requirement)) return true;
      if (record.levels.includes("Key") && a.isKey) return true;
      return false;
    });

    // sheetNow: row 0 in `tab` = first product; col 0=name, col 1=asin, col 2+=attrs (in filtered order)
    for (const row of tab) {
      const asin = String(row[1] ?? "").trim();
      if (!asin) continue;
      const rec: Record<string, string> = {};
      for (let a = 0; a < filtered.length; a++) {
        const key = filtered[a].generalLabel;
        rec[key] = String(row[2 + a] ?? "");
      }
      sheetNow[asin] = rec;
    }

    // catalogNow: re-read current product values
    const products = await db
      .select()
      .from(master)
      .where(and(eq(master.clientIdCode, record.clientIdCode), eq(master.productType, def.productType)));
    for (const p of products) {
      const asin = getProductFieldValue(p, "ASIN") || "";
      if (!asin) continue;
      const rec: Record<string, string> = {};
      for (const attr of filtered) {
        rec[attr.generalLabel] = getProductFieldValue(p, attr.generalLabel) || "";
      }
      catalogNow[asin] = rec;
    }
  }

  const seeded = (record.seededSnapshot ?? {}) as Record<string, Record<string, string | null>>;
  const diff = computeDiff({ seeded, sheetNow, catalogNow });

  return NextResponse.json({
    request: {
      id: record.id,
      sheetUrl: record.sheetUrl,
      status: record.status,
    },
    counts: diff.counts,
    samples: diff.samples,
  });
}
