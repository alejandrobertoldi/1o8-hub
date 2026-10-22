import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, ne, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoAsins, seoProjects } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { unauthorized, serverError } from "@/lib/api-utils";
import { getSeoVersionsForAsins } from "@/lib/bigquery";
import {
  generatedToBaseline,
  hasGeneratedCopy,
  mergeListingVersions,
  projectVersionNumber,
  versionsForListing,
  type BaselineVersion,
  type ProjectVersionRow,
} from "@/lib/seo/baseline-source";

/**
 * GET /api/seo/projects/[id]/baseline-versions
 *
 * Read-only. For each of this project's listings, the versions available as an
 * S1.3 baseline, oldest first:
 *   - V00, the inherited CLR copy (BigQuery MFBibleApp.SEO; AIA clients only)
 *   - every other SEO project that reached S6 with written copy for the ASIN
 *     (Supabase seo_projects + seo_asins.generated_content), numbered by its
 *     `_vNN` name suffix — the version column is not reliable.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorized();
    const { id } = await params;

    const listings = await db
      .select({ asin: seoAsins.asin, sku: seoAsins.sku })
      .from(seoAsins)
      .where(eq(seoAsins.projectId, id));
    const asins = [...new Set(listings.map((l) => l.asin).filter(Boolean))];
    if (asins.length === 0) return NextResponse.json({ versions: {} });

    const [bqRows, projectRows] = await Promise.all([
      getSeoVersionsForAsins(asins).catch((err) => {
        // BigQuery down shouldn't hide the Hub versions
        console.error("[baseline-versions] BigQuery read failed:", err);
        return [];
      }),
      db
        .select({
          asin: seoAsins.asin,
          name: seoProjects.name,
          version: seoProjects.version,
          s6ApprovedAt: seoProjects.s6ApprovedAt,
          generatedContent: seoAsins.generatedContent,
        })
        .from(seoAsins)
        .innerJoin(seoProjects, eq(seoAsins.projectId, seoProjects.id))
        .where(and(inArray(seoAsins.asin, asins), ne(seoAsins.projectId, id), isNotNull(seoAsins.generatedContent))),
    ]);

    const versions: Record<string, BaselineVersion[]> = {};
    for (const l of listings) {
      if (!l.asin) continue;
      // Only V00 comes from BigQuery
      const v00 = versionsForListing(bqRows as Record<string, unknown>[], l.asin, l.sku).filter(
        (v) => Number(v.version) === 0
      );
      const projects: ProjectVersionRow[] = projectRows
        .filter((r) => r.asin === l.asin && hasGeneratedCopy(r.generatedContent))
        .map((r) => ({
          projectName: r.name,
          version: projectVersionNumber(r.name, r.version),
          approved: !!r.s6ApprovedAt,
          fields: generatedToBaseline(r.generatedContent),
        }));
      versions[l.asin] = mergeListingVersions(v00, projects);
    }
    return NextResponse.json({ versions });
  } catch (err) {
    return serverError(err);
  }
}
