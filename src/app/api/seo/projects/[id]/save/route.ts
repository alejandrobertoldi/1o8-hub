/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoKeywords, seoReviews, seoRufus, seoCosmopMaps, seoComplianceReports, seoQa } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { applyParentVariationFill } from "@/lib/seo/parent-variation-fill";
import { aplusQAToSubset } from "@/lib/aplus2/qa-from-seo";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { phase, data } = await req.json();

    switch (phase) {
      case "s1_intake": {
        const { metadata: m, asins, variety_pack_details } = data;

        await db.update(seoProjects).set({
          brandName: m.brand_name || m.brandName || "",
          date: m.date || null,
          clientIdCode: m.client_id_code || m.clientIdCode || null,
          clientName: m.client_name || m.clientName || null,
          clientBibleUrl: m.client_bible_url || m.clientBibleUrl || null,
          brandUrl: m.brand_url || m.brandUrl || null,
          competitors: m.competitors || [],
          variationTheme: asins?.[0]?.variation_theme_name || null,
          brandGuidelines: m.brand_guidelines || "",
          brandGuidelinesLock: m.brand_guidelines_lock || null,
          brandGuidelinesNotes: m.brand_guidelines_notes || null,
          varietyPackDetails: variety_pack_details ? JSON.stringify(variety_pack_details) : null,
          updatedAt: new Date(),
        }).where(eq(seoProjects.id, id));

        if (asins?.length > 0) {
          await db.delete(seoAsins).where(eq(seoAsins.projectId, id));
          const ec = (a: any) => a.existing_content || {};
          await db.insert(seoAsins).values(asins.map((a: any) => applyParentVariationFill({
            projectId: id,
            asin: a.asin || "",
            sku: a.sku || "",
            amazonUrl: a.amazon_url || null,
            websiteUrl: a.website_url || null,
            variationId: a.variation_id || null,
            variationProduct: a.variation_product || null,
            parentageLevel: a.parentage_level || null,
            variationThemeName: a.variation_theme_name || null,
            flavor: a.flavor || null,
            style: a.style || null,
            color: a.color || null,
            size: a.size || null,
            variationGroup: a.variation_group || null,
            existingContent: ec(a),
          })));
        }

        await db.update(seoProjects).set({ s1ApprovedAt: new Date(), currentPhase: "S2", updatedAt: new Date() }).where(eq(seoProjects.id, id));
        return NextResponse.json({ success: true });
      }

      case "s2_keywords": {
        await db.delete(seoKeywords).where(eq(seoKeywords.projectId, id));
        if (data.keywords?.length > 0) {
          await db.insert(seoKeywords).values(data.keywords.map((k: any) => ({
            projectId: id,
            text: k.KeywordText,
            searchVolume: k.KeywordSearchVolume || 0,
            priorityTier: k.KeywordPriorityTier || null,
            searchIntent: k.KeywordSearchIntent || null,
            primaryUseLocation: k.KeywordPrimaryUseLocation || null,
            matchType: k.KeywordMatchType || null,
            cosmoRelationship: k.KeywordCOSMORelationship || null,
            buyerStage: k.KeywordBuyerStage || null,
            notes: k.KeywordNotes || "",
            keywordSource: k.KeywordSource || "Client",
            semanticGroup: k.KeywordSemanticGroup || null,
            isNegative: Boolean(k.KeywordIsNegative ?? false),
            negativeReason: k.KeywordNegativeCategory || null,
            isCompetitor: Boolean(k.KeywordIsCompetitor ?? false),
          })));
        }
        await db.update(seoProjects).set({ s2ApprovedAt: new Date(), currentPhase: "S3", updatedAt: new Date() }).where(eq(seoProjects.id, id));
        return NextResponse.json({ success: true, count: data.keywords?.length || 0 });
      }

      case "s3_reviews": {
        await db.delete(seoReviews).where(eq(seoReviews.projectId, id));
        if (data.reviews?.length > 0) {
          await db.insert(seoReviews).values(data.reviews.map((r: any) => ({
            projectId: id,
            reviewId: r.ReviewID || null,
            date: r.ReviewDate || null,
            reviewerName: r.ReviewReviewerName || null,
            asin: r.ReviewASIN || null,
            productVariation: r.ReviewProductVariation || null,
            starRating: r.ReviewStarRating || null,
            title: r.ReviewTitle || null,
            text: r.ReviewText || r.originalText || null,
            sentiment: r.ReviewSentiment || null,
            keyThemes: r.ReviewKeyThemes || null,
            usageMentioned: r.ReviewUsageMentioned || null,
            packagingFeedback: r.ReviewPackagingFeedback || null,
            priceFeedback: r.ReviewPriceFeedback || null,
            heatLevelFeedback: r.ReviewHeatLevelFeedback || null,
            rufusUsableInsight: r.ReviewRufusUsableInsight || null,
            bulletMapping: r.ReviewBulletMapping || null,
            helpfulVotes: 0,
          })));
        }
        await db.update(seoProjects).set({ s3ApprovedAt: new Date(), currentPhase: "S4", updatedAt: new Date() }).where(eq(seoProjects.id, id));
        return NextResponse.json({ success: true, count: data.reviews?.length || 0 });
      }

      case "s4_rufus_draft":
      case "s4_rufus": {
        const rows = data.analyzedRows || [];
        const existing = await db.select({ id: seoRufus.id }).from(seoRufus).where(eq(seoRufus.projectId, id)).limit(1);
        if (existing.length > 0) {
          await db.update(seoRufus).set({ rows, updatedAt: new Date() }).where(eq(seoRufus.projectId, id));
        } else {
          await db.insert(seoRufus).values({ projectId: id, rows });
        }
        // Only advance phase on full approval, not draft save
        if (phase === "s4_rufus") {
          await db.update(seoProjects).set({ s4ApprovedAt: new Date(), currentPhase: "S5", updatedAt: new Date() }).where(eq(seoProjects.id, id));
        }
        return NextResponse.json({ success: true, count: rows.length });
      }

      case "s5_cosmo": {
        const rows = data.rows || [];
        const existing = await db.select({ id: seoCosmopMaps.id }).from(seoCosmopMaps).where(eq(seoCosmopMaps.projectId, id)).limit(1);
        if (existing.length > 0) {
          await db.update(seoCosmopMaps).set({ rows, updatedAt: new Date() }).where(eq(seoCosmopMaps.projectId, id));
        } else {
          await db.insert(seoCosmopMaps).values({ projectId: id, rows });
        }
        await db.update(seoProjects).set({ s5ApprovedAt: new Date(), currentPhase: "S6", updatedAt: new Date() }).where(eq(seoProjects.id, id));
        return NextResponse.json({ success: true, count: rows.length });
      }

      case "s6_compliance": {
        const issues = data.rows || [];
        const existing = await db.select({ id: seoComplianceReports.id }).from(seoComplianceReports).where(eq(seoComplianceReports.projectId, id)).limit(1);
        if (existing.length > 0) {
          await db.update(seoComplianceReports).set({ issues, status: data.summary?.status || "clean" }).where(eq(seoComplianceReports.projectId, id));
        } else {
          await db.insert(seoComplianceReports).values({ projectId: id, issues, status: data.summary?.status || "clean" });
        }
        return NextResponse.json({ success: true, count: issues.length });
      }

      case "s7_seo": {
        // Store generated content on each seo_asin row
        const rows: any[] = data.rows || [];
        if (rows.length > 0 && rows[0].Title) {
        }
        const encoder = new TextEncoder();
        for (const r of rows) {
          const { ASIN, URL, VariationID, VariationProduct, ParentageLevel, VariationThemeName, Flavor, Style, Color, Size, ...content } = r;
          // Always recompute char/byte counts before persisting
          for (const key of Object.keys(content)) {
            if (key.endsWith("_CharLength")) {
              const ck = key.replace("_CharLength", "");
              if (typeof content[ck] === "string") content[key] = content[ck].length;
            } else if (key.endsWith("_ByteLength")) {
              const ck = key.replace("_ByteLength", "");
              if (typeof content[ck] === "string") content[key] = encoder.encode(content[ck]).length;
            }
          }
          // Scoped to this project: the same ASIN sits in every _vNN version (and can sit in
          // other projects), and an ASIN-only filter overwrote all of their S6 content.
          await db
            .update(seoAsins)
            .set({ generatedContent: content })
            .where(and(eq(seoAsins.projectId, id), eq(seoAsins.asin, ASIN)));

          // Mirror the S6.7 Premium A+ Q&A into the normalized seo_qa table so the
          // A+2 Premium Q&A module can populate from it. Guarded: a failure here must
          // never break the primary generatedContent save.
          try {
            const subset = aplusQAToSubset(content._aplusQA);
            if (subset.length > 0) {
              const [asinRow] = await db
                .select({ id: seoAsins.id })
                .from(seoAsins)
                .where(and(eq(seoAsins.asin, ASIN), eq(seoAsins.projectId, id)))
                .limit(1);
              if (asinRow) {
                const [latest] = await db
                  .select({ id: seoQa.id })
                  .from(seoQa)
                  .where(eq(seoQa.asinId, asinRow.id))
                  .orderBy(desc(seoQa.version))
                  .limit(1);
                if (latest) {
                  await db
                    .update(seoQa)
                    .set({ aplusQaSubset: subset, updatedAt: new Date() })
                    .where(eq(seoQa.id, latest.id));
                } else {
                  await db
                    .insert(seoQa)
                    .values({ projectId: id, asinId: asinRow.id, aplusQaSubset: subset, version: 1 });
                }
              }
            }
          } catch (qaErr) {
            console.error(`seo_qa write-through failed for ${ASIN}:`, qaErr);
          }
        }
        if (data.config?.in_progress === false) {
          await db.update(seoProjects).set({ s6ApprovedAt: new Date(), updatedAt: new Date() }).where(eq(seoProjects.id, id));
        } else if (data.config?.unlock === true) {
          // Only an explicit "Unlock for Editing" unlocks S6 — ordinary autosaves never do
          await db.update(seoProjects).set({ s6ApprovedAt: null, updatedAt: new Date() }).where(eq(seoProjects.id, id));
        }
        return NextResponse.json({ success: true, count: rows.length });
      }

      default:
        return NextResponse.json({ error: `Unknown phase: ${phase}` }, { status: 400 });
    }
  } catch (err: unknown) {
    console.error("SEO save error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
