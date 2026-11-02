import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { getSeoVersions } from "@/lib/bigquery";
import { db } from "@/lib/db";
import { master, seoAsins, seoProjects } from "@/lib/db/schema";
import { desc, eq, or } from "drizzle-orm";
import {
  buildSeoVersionOptions,
  type SeoProjectOption,
} from "@/lib/seo-product-options";
import { unauthorized } from "@/lib/api-utils";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/products/[id]/seo-options
 * Dropdown options for SEO Project Name and SEO Version Number on product detail.
 * Version 0 is always included (inherited CLR listing copy). Other options come
 * from SEO Manager projects for this client and BigQuery SEO versions for the listing.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session) return unauthorized();

  const { id } = await params;

  const [product] = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      clientIdCode: master.clientIdCode,
    })
    .from(master)
    .where(eq(master.id, id))
    .limit(1);

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  let bqVersions: Array<{
    seoVersionNumber: string;
    seoCategory: string;
    seoStatus: string;
  }> = [];
  if (product.asin && product.sku) {
    try {
      const rows = await getSeoVersions(product.asin, product.sku);
      bqVersions = rows.map((row) => ({
        seoVersionNumber: String(row["SEOVersionNumber"] ?? "").trim(),
        seoCategory: String(row["SEOCategory"] ?? "").trim(),
        seoStatus: String(row["SEOStatus"] ?? "").trim(),
      }));
    } catch (err) {
      console.error("Failed to fetch SEO versions from BigQuery:", err);
    }
  }

  let projectRows: Array<{
    id: string;
    name: string;
    version: number;
    status: string;
    linkedProductId: string | null;
  }> = [];
  let listingProjectIds = new Set<string>();

  if (product.clientIdCode) {
    projectRows = await db
      .select({
        id: seoProjects.id,
        name: seoProjects.name,
        version: seoProjects.version,
        status: seoProjects.status,
        linkedProductId: seoProjects.linkedProductId,
      })
      .from(seoProjects)
      .where(eq(seoProjects.clientIdCode, product.clientIdCode))
      .orderBy(desc(seoProjects.createdAt));

    const listingFilters = [
      product.asin ? eq(seoAsins.asin, product.asin) : undefined,
      product.sku ? eq(seoAsins.sku, product.sku) : undefined,
    ].filter((clause): clause is NonNullable<typeof clause> => clause != null);

    if (listingFilters.length > 0) {
      const asinRows = await db
        .select({ projectId: seoAsins.projectId })
        .from(seoAsins)
        .where(
          listingFilters.length === 1
            ? listingFilters[0]
            : or(...listingFilters)
        );
      listingProjectIds = new Set(asinRows.map((row) => row.projectId));
    }
  }

  const projects: SeoProjectOption[] = projectRows
    .filter((p) => p.status !== "archived" && p.status !== "deprecated")
    .map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      status: p.status,
      linkedToProduct:
        p.linkedProductId === product.id || listingProjectIds.has(p.id),
    }));

  const versions = buildSeoVersionOptions({
    bqVersions,
    projects: projects.map((p) => ({
      name: p.name,
      version: p.version,
      linkedToProduct: p.linkedToProduct,
    })),
  });

  return NextResponse.json({ projects, versions });
}
