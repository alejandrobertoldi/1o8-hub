import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoKeywords, seoReviews, seoRufus, seoCosmopMaps, seoComplianceReports, variations, variationGroups, master } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import type { ContentGuidelines } from "@/lib/variation-guidelines";
import { getAuthSession } from "@/lib/auth-db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const phase = req.nextUrl.searchParams.get("phase");

    switch (phase) {
      case "s1_intake": {
        const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, id)).limit(1);
        const asins = await db.select().from(seoAsins).where(eq(seoAsins.projectId, id));
        const ec = (a: typeof asins[0]) => (a.existingContent as any) || {};

        let variation_guidelines: {
          defaults: ContentGuidelines | null;
          groups: Array<{ name: string; contentGuidelines: ContentGuidelines | null }>;
        } | null = null;

        if (project?.variationId) {
          const [varRow] = await db
            .select({ contentGuidelines: variations.contentGuidelines })
            .from(variations)
            .where(eq(variations.id, project.variationId))
            .limit(1);
          const groupRows = await db
            .select({ name: variationGroups.name, contentGuidelines: variationGroups.contentGuidelines })
            .from(variationGroups)
            .where(eq(variationGroups.variationId, project.variationId))
            .orderBy(variationGroups.sortOrder);
          variation_guidelines = {
            defaults: (varRow?.contentGuidelines as ContentGuidelines) ?? null,
            groups: groupRows.map((g) => ({
              name: g.name,
              contentGuidelines: (g.contentGuidelines as ContentGuidelines) ?? null,
            })),
          };
        }

        // Load listing-level guidelines from master for each ASIN
        const asinValues = asins.map((a) => a.asin).filter(Boolean) as string[];
        const masterRows = asinValues.length
          ? await db
              .select({ asin: master.asin, contentGuidelines: master.contentGuidelines })
              .from(master)
              .where(inArray(master.asin, asinValues))
          : [];
        const listingGuidelinesMap = new Map(
          masterRows.map((r) => [r.asin, (r.contentGuidelines as ContentGuidelines) ?? null])
        );

        return NextResponse.json({
          project: {
            brand_name: project?.brandName || "",
            client_name: project?.clientName || "",
            client_id_code: project?.clientIdCode || "",
            date: project?.date || "",
            client_bible_url: project?.clientBibleUrl || "",
            brand_url: project?.brandUrl || "",
            competitors: project?.competitors || [],
            brand_guidelines: project?.brandGuidelines || "",
            brand_guidelines_lock: project?.brandGuidelinesLock || "not_applicable",
            brand_guidelines_notes: project?.brandGuidelinesNotes || "",
            variety_pack_details: project?.varietyPackDetails ? JSON.parse(project.varietyPackDetails) : [],
            variation_guidelines,
          },
          asins: asins.map((a) => ({
            asin: a.asin, sku: a.sku, amazon_url: a.amazonUrl, website_url: a.websiteUrl,
            variation_id: a.variationId, variation_product: a.variationProduct,
            parentage_level: a.parentageLevel, variation_theme_name: a.variationThemeName,
            flavor: a.flavor, style: a.style, color: a.color, size: a.size,
            variation_group: a.variationGroup || null,
            existing_content: ec(a),
            listing_guidelines: a.asin ? (listingGuidelinesMap.get(a.asin) ?? null) : null,
          })),
        });
      }

      case "s2_keywords": {
        const keywords = await db.select().from(seoKeywords).where(eq(seoKeywords.projectId, id)).orderBy(desc(seoKeywords.searchVolume));
        return NextResponse.json({
          keywords: keywords.map((k) => ({
            KeywordText: k.text, KeywordSearchVolume: k.searchVolume,
            KeywordPriorityTier: k.priorityTier, KeywordSearchIntent: k.searchIntent,
            KeywordPrimaryUseLocation: k.primaryUseLocation, KeywordMatchType: k.matchType,
            KeywordCOSMORelationship: k.cosmoRelationship, KeywordBuyerStage: k.buyerStage,
            KeywordNotes: k.notes, KeywordSource: k.keywordSource,
            KeywordSemanticGroup: k.semanticGroup, KeywordIsNegative: k.isNegative,
            KeywordNegativeCategory: k.negativeReason, KeywordIsCompetitor: k.isCompetitor,
          })),
        });
      }

      case "s3_reviews": {
        const reviews = await db.select().from(seoReviews).where(eq(seoReviews.projectId, id)).orderBy(desc(seoReviews.starRating));
        return NextResponse.json({
          reviews: reviews.map((r) => ({
            ReviewID: r.reviewId, ReviewDate: r.date, ReviewReviewerName: r.reviewerName,
            ReviewASIN: r.asin, ReviewProductVariation: r.productVariation,
            ReviewStarRating: r.starRating, ReviewTitle: r.title, ReviewText: r.text,
            ReviewSentiment: r.sentiment, ReviewKeyThemes: r.keyThemes,
            ReviewUsageMentioned: r.usageMentioned, ReviewPackagingFeedback: r.packagingFeedback,
            ReviewPriceFeedback: r.priceFeedback, ReviewHeatLevelFeedback: r.heatLevelFeedback,
            ReviewRufusUsableInsight: r.rufusUsableInsight, ReviewBulletMapping: r.bulletMapping,
          })),
        });
      }

      case "s4_rufus": {
        const [rufus] = await db.select().from(seoRufus).where(eq(seoRufus.projectId, id)).limit(1);
        return NextResponse.json({ rows: (rufus?.rows as any[]) || [] });
      }

      case "s5_cosmo": {
        const [cosmo] = await db.select().from(seoCosmopMaps).where(eq(seoCosmopMaps.projectId, id)).limit(1);
        return NextResponse.json({ rows: (cosmo?.rows as any[]) || [] });
      }

      case "s6_compliance": {
        const [report] = await db.select().from(seoComplianceReports).where(eq(seoComplianceReports.projectId, id)).limit(1);
        return NextResponse.json({ rows: (report?.issues as any[]) || [] });
      }

      case "s7_seo": {
        const asins = await db.select({ asin: seoAsins.asin, generatedContent: seoAsins.generatedContent, variationId: seoAsins.variationId, variationProduct: seoAsins.variationProduct, parentageLevel: seoAsins.parentageLevel, variationThemeName: seoAsins.variationThemeName, flavor: seoAsins.flavor, style: seoAsins.style, color: seoAsins.color, size: seoAsins.size, amazonUrl: seoAsins.amazonUrl }).from(seoAsins).where(eq(seoAsins.projectId, id));
        const [project] = await db.select({ s6ApprovedAt: seoProjects.s6ApprovedAt }).from(seoProjects).where(eq(seoProjects.id, id)).limit(1);
        return NextResponse.json({
          rows: asins.map((a) => {
            const gc = (a.generatedContent as any) || {};
            // Recompute CharLength/ByteLength from actual content
            for (const key of Object.keys(gc)) {
              if (key.endsWith("_CharLength")) {
                const ck = key.replace("_CharLength", "");
                if (typeof gc[ck] === "string") gc[key] = gc[ck].length;
              } else if (key.endsWith("_ByteLength")) {
                const ck = key.replace("_ByteLength", "");
                if (typeof gc[ck] === "string") gc[key] = new TextEncoder().encode(gc[ck]).length;
              }
            }
            return {
              ASIN: a.asin, URL: a.amazonUrl, VariationID: a.variationId,
              VariationProduct: a.variationProduct, ParentageLevel: a.parentageLevel,
              VariationThemeName: a.variationThemeName, Flavor: a.flavor,
              Style: a.style, Color: a.color, Size: a.size, ...gc,
            };
          }),
          // S6's lock survives a reload: Save & Submit sets s6ApprovedAt; "Unlock for Editing" clears it
          config: project?.s6ApprovedAt ? { in_progress: false } : null,
        });
      }

      case "parent_asin": {
        const [parent] = await db.select({ asin: seoAsins.asin, amazonUrl: seoAsins.amazonUrl })
          .from(seoAsins).where(eq(seoAsins.projectId, id)).limit(1);
        return NextResponse.json({ parent: parent ? { asin: parent.asin, amazon_url: parent.amazonUrl } : null });
      }

      default:
        return NextResponse.json({ error: `Unknown phase: ${phase}` }, { status: 400 });
    }
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
