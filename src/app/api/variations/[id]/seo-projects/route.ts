/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  variations,
  variationGroups,
  variationGroupAssignments,
  seoProjects,
  seoAsins,
  master,
  aac,
} from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { serverError } from "@/lib/api-utils";
import { snapshotClientBrandGuidelines } from "@/lib/brand-guidelines/snapshot";

type Params = { params: Promise<{ id: string }> };

// POST /api/variations/[id]/seo-projects — bulk-create one SEO project per group
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await getAuthSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { assignedTo, mode = "per-group" } = body as {
      assignedTo?: string;
      mode?: "per-group" | "all";
    };

    // 1. Load variation
    const [variation] = await db
      .select()
      .from(variations)
      .where(eq(variations.id, id))
      .limit(1);

    if (!variation)
      return NextResponse.json({ error: "Variation not found" }, { status: 404 });

    if (variation.status !== "locked")
      return NextResponse.json(
        { error: "Variation must be locked before creating SEO projects" },
        { status: 400 }
      );

    // 2. Check for existing SEO projects linked to this variation
    const existing = await db
      .select({ id: seoProjects.id })
      .from(seoProjects)
      .where(eq(seoProjects.variationId, id))
      .limit(1);

    if (existing.length > 0)
      return NextResponse.json(
        { error: "SEO projects already exist for this variation" },
        { status: 409 }
      );

    // 3. Load groups with their products via junction
    const groups = await db
      .select()
      .from(variationGroups)
      .where(eq(variationGroups.variationId, id))
      .orderBy(variationGroups.sortOrder);

    if (groups.length === 0)
      return NextResponse.json(
        { error: "Variation has no groups" },
        { status: 400 }
      );

    // Get all group assignments
    const groupIds = groups.map((g) => g.id);
    const assignments = await db
      .select({
        groupId: variationGroupAssignments.groupId,
        productId: variationGroupAssignments.productId,
      })
      .from(variationGroupAssignments)
      .where(inArray(variationGroupAssignments.groupId, groupIds));

    // Build group → productIds map
    const groupProductMap = new Map<string, string[]>();
    for (const a of assignments) {
      const arr = groupProductMap.get(a.groupId) ?? [];
      arr.push(a.productId);
      groupProductMap.set(a.groupId, arr);
    }

    // Filter to non-empty groups
    const nonEmptyGroups = groups.filter(
      (g) => (groupProductMap.get(g.id)?.length ?? 0) > 0
    );

    if (nonEmptyGroups.length === 0)
      return NextResponse.json(
        { error: "All groups are empty" },
        { status: 400 }
      );

    // 4. Load all needed products in one query
    const allProductIds = [...new Set(assignments.map((a) => a.productId))];
    const products = await db
      .select({
        id: master.id,
        asin: master.asin,
        sku: master.sku,
        parentageLevel: master.parentageLevel,
        itemName: master.itemName,
        summarizedTitle: master.summarizedTitle,
        mainImageUrl: master.mainImageUrl,
        variations: master.variations,
        variationGroup: master.variationGroup,
        contentSeo: master.contentSeo,
        genericKeywords: master.genericKeywords,
        brandName: master.brandName,
        clientIdCode: master.clientIdCode,
      })
      .from(master)
      .where(inArray(master.id, allProductIds));

    const productMap = new Map(products.map((p) => [p.id, p]));

    // 5. Load client info (for competitors, brand URL, etc.)
    const clientId = variation.clientId;
    let clientRow: { clientName: string | null; rawData: unknown } | undefined;
    if (clientId) {
      const [c] = await db
        .select({
          clientName: aac.clientName,
          rawData: aac.rawData,
        })
        .from(aac)
        .where(eq(aac.clientIdCode, clientId))
        .limit(1);
      clientRow = c;
    }

    let raw: Record<string, string> = {};
    if (clientRow) {
      if (typeof clientRow.rawData === "string") {
        try { raw = JSON.parse(clientRow.rawData); } catch { /* ignore */ }
      } else if (clientRow.rawData) {
        raw = clientRow.rawData as Record<string, string>;
      }
    }

    const competitors: Array<{ name: string; url: string }> = [];
    for (let i = 1; i <= 5; i++) {
      const name = raw[`Competitor${i}Name`]?.trim();
      const url = raw[`Competitor${i}URL`]?.trim() || "";
      if (name) competitors.push({ name, url });
    }

    // Helper: build seoAsin row from a product
    const buildAsinRow = (
      projectId: string,
      p: (typeof products)[0],
      groupName: string
    ) => {
      const v = (p.variations as Record<string, string>) || {};
      const cs = (p.contentSeo as Record<string, string>) || {};
      return {
        projectId,
        asin: p.asin || "",
        sku: p.sku || "",
        parentageLevel: p.parentageLevel || "",
        variationId: v.VariationID || "",
        variationProduct: v.VariationProduct || "",
        variationThemeName: v.VariationThemeName || "",
        flavor: v.Flavor || "",
        style: v.Style || "",
        color: v.Color || "",
        size: v.Size || "",
        variationGroup: groupName,
        existingContent: {
          item_name: p.itemName || p.summarizedTitle || "",
          detailed_bullets: [
            cs.DetailedBulletPoint1 || "",
            cs.DetailedBulletPoint2 || "",
            cs.DetailedBulletPoint3 || "",
            cs.DetailedBulletPoint4 || "",
            cs.DetailedBulletPoint5 || "",
          ],
          product_description: cs.ProductDescription || "",
          generic_keywords: [p.genericKeywords || ""].filter(Boolean),
          concise_bullets: [
            cs.ConciseBulletPoint1 || "",
            cs.ConciseBulletPoint2 || "",
            cs.ConciseBulletPoint3 || "",
            cs.ConciseBulletPoint4 || "",
            cs.ConciseBulletPoint5 || "",
          ],
          content_bullets: [
            cs.PA_LIBulletPoint1 || "",
            cs.PA_LIBulletPoint2 || "",
            cs.PA_LIBulletPoint3 || "",
            cs.PA_LIBulletPoint4 || "",
            cs.PA_LIBulletPoint5 || "",
          ],
          key_features: [
            cs.KeyFeature1 || "",
            cs.KeyFeature2 || "",
            cs.KeyFeature3 || "",
            cs.KeyFeature4 || "",
            cs.KeyFeature5 || "",
          ],
        },
      };
    };

    // 6. Create projects + ASINs in a transaction
    const bgSnapshot = await snapshotClientBrandGuidelines(clientId);
    const result = await db.transaction(async (tx) => {
      // Get next version number for this variation
      const [{ count: existingCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(seoProjects)
        .where(eq(seoProjects.variationId, id));
      let nextVersion = (existingCount || 0) + 1;

      const created: Array<{
        id: string;
        name: string;
        groupName: string;
        asinCount: number;
      }> = [];

      if (mode === "all") {
        // Single project with ALL products from the variation
        const allProducts = [...productMap.values()];
        const brandName =
          allProducts[0]?.brandName || clientRow?.clientName || "";

        const [project] = await tx
          .insert(seoProjects)
          .values({
            createdBy: session.user.email!,
            name: variation.code,
            brandName,
            status: "draft",
            currentPhase: "S1",
            assignedTo: assignedTo || null,
            clientIdCode: clientId || null,
            clientName: clientRow?.clientName || "",
            brandUrl: raw.BrandURL || raw.WebsiteURL || "",
            competitors,
            variationId: id,
            version: nextVersion++,
            date: new Date().toISOString().split("T")[0],
            brandGuidelines: bgSnapshot.brandGuidelines,
            brandGuidelinesLock: bgSnapshot.brandGuidelinesLock,
          })
          .returning();

        // Build group name lookup for each product
        const productGroupNames = new Map<string, string>();
        for (const group of nonEmptyGroups) {
          for (const pid of groupProductMap.get(group.id) ?? []) {
            const existing = productGroupNames.get(pid);
            productGroupNames.set(
              pid,
              existing ? `${existing}, ${group.name}` : group.name
            );
          }
        }

        const asinRows = allProducts.map((p) =>
          buildAsinRow(project.id, p, productGroupNames.get(p.id) || "")
        );

        if (asinRows.length > 0) {
          await tx.insert(seoAsins).values(asinRows);
        }

        created.push({
          id: project.id,
          name: variation.code,
          groupName: "(all)",
          asinCount: asinRows.length,
        });
      } else {
        // One project per group
        for (const group of nonEmptyGroups) {
          const productIds = groupProductMap.get(group.id) ?? [];
          const groupProducts = productIds
            .map((pid) => productMap.get(pid))
            .filter(Boolean) as typeof products;

          const projectName = `${variation.code}_${group.name}`;
          const brandName =
            groupProducts[0]?.brandName || clientRow?.clientName || "";

          const [project] = await tx
            .insert(seoProjects)
            .values({
              createdBy: session.user.email!,
              name: projectName,
              brandName,
              status: "draft",
              currentPhase: "S1",
              assignedTo: assignedTo || null,
              clientIdCode: clientId || null,
              clientName: clientRow?.clientName || "",
              brandUrl: raw.BrandURL || raw.WebsiteURL || "",
                competitors,
              variationId: id,
              version: nextVersion++,
              date: new Date().toISOString().split("T")[0],
              brandGuidelines: bgSnapshot.brandGuidelines,
              brandGuidelinesLock: bgSnapshot.brandGuidelinesLock,
            })
            .returning();

          const asinRows = groupProducts.map((p) =>
            buildAsinRow(project.id, p, group.name)
          );

          if (asinRows.length > 0) {
            await tx.insert(seoAsins).values(asinRows);
          }

          created.push({
            id: project.id,
            name: projectName,
            groupName: group.name,
            asinCount: asinRows.length,
          });
        }
      }

      return created;
    });

    return NextResponse.json({ projects: result }, { status: 201 });
  } catch (err: unknown) {
    console.error("[Variation SEO Projects POST] Error:", err);
    return serverError(err);
  }
}
