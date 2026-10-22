import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { getSeoVersions } from "@/lib/bigquery";
import type { SeoVersion } from "@/lib/seo-types";

/** The 27 SEO content fields we extract from each BQ row */
const SEO_FIELD_NAMES = [
  "ItemName",
  "DetailedBulletPoint1",
  "DetailedBulletPoint2",
  "DetailedBulletPoint3",
  "DetailedBulletPoint4",
  "DetailedBulletPoint5",
  "ProductDescription",
  "GenericKeyword1",
  "GenericKeyword2",
  "GenericKeyword3",
  "GenericKeyword4",
  "GenericKeyword5",
  "ConciseBulletPoint1",
  "ConciseBulletPoint2",
  "ConciseBulletPoint3",
  "ConciseBulletPoint4",
  "ConciseBulletPoint5",
  "PA_LIBulletPoint1",
  "PA_LIBulletPoint2",
  "PA_LIBulletPoint3",
  "PA_LIBulletPoint4",
  "PA_LIBulletPoint5",
  "KeyFeature1",
  "KeyFeature2",
  "KeyFeature3",
  "KeyFeature4",
  "KeyFeature5",
];

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const asin = req.nextUrl.searchParams.get("asin");
  const sku = req.nextUrl.searchParams.get("sku");

  if (!asin || !sku) {
    return NextResponse.json(
      { error: "asin and sku are required" },
      { status: 400 }
    );
  }

  try {
    const rows = await getSeoVersions(asin, sku);

    const versions: SeoVersion[] = rows.map((row) => {
      const fields: Record<string, string> = {};
      let populatedCount = 0;

      for (const name of SEO_FIELD_NAMES) {
        const val = row[name] ?? "";
        fields[name] = val;
        if (val.trim()) populatedCount++;
      }

      return {
        seoVersionNumber: row["SEOVersionNumber"] ?? "",
        seoCategory: row["SEOCategory"] ?? "",
        seoStatus: row["SEOStatus"] ?? "",
        seoDocUrl: row["SEODocURL"] || null,
        fields,
        populatedCount,
      };
    });

    return NextResponse.json({ versions });
  } catch (err) {
    console.error("Failed to fetch SEO versions:", err);
    return NextResponse.json(
      { error: "Failed to fetch SEO versions" },
      { status: 500 }
    );
  }
}
