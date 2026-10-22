/* eslint-disable react-doctor/no-giant-component */
// ═══════════════════════════════════════════════════════════════
// Save Phase Data API
// POST /api/projects/[id]/save
// Saves keywords, reviews, rufus, cosmo data to Supabase
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { phase, data } = body;

    switch (phase) {
      case "s1_intake": {
        const { metadata, asins, variety_pack_details } = data;

        // Update project metadata
        const { error: metaError } = await supabase
          .from("projects")
          .update({
            brand_name: metadata.brand_name || metadata.brandName,
            date: metadata.date,
            client_id_code: metadata.client_id_code || metadata.clientIdCode,
            client_name: metadata.client_name || metadata.clientName,
            client_bible_url: metadata.client_bible_url || metadata.clientBibleUrl,
            brand_url: metadata.brand_url || metadata.brandUrl,
            competitors: metadata.competitors || [],
            variation_theme: asins?.[0]?.variation_theme_name || "",
            brand_guidelines: metadata.brand_guidelines || "",
            brand_guidelines_lock: metadata.brand_guidelines_lock || "not_applicable",
            variety_pack_details: variety_pack_details ? JSON.stringify(variety_pack_details) : null,
          })
          .eq("id", params.id);
        if (metaError) {
          console.error("Project metadata update error:", metaError);
          throw metaError;
        }

        // Save to s1_intake (flat columns)
        if (asins && asins.length > 0) {
          await supabase.from("s1_intake").delete().eq("project_id", params.id);

          const ec = (a: any) => a.existing_content || {};
          const rows = asins.map((a: any) => ({
            project_id: params.id,
            // A-L: Structure
            asin: a.asin || "",
            sku: a.sku || "",
            amazon_pdp_url: a.amazon_url || "",
            website_pdp_url: a.website_url || "",
            variation_id: a.variation_id || "",
            variation_product: a.variation_product || "",
            parentage_level: a.parentage_level || "Child",
            variation_theme_name: a.variation_theme_name || "",
            flavor: a.flavor || "",
            style: a.style || "",
            color: a.color || "",
            size: a.size || "",
            // M-R: Item Name + Detailed Bullets
            item_name: ec(a).item_name || "",
            detailed_bullet_point_1: (ec(a).detailed_bullets || [])[0] || "",
            detailed_bullet_point_2: (ec(a).detailed_bullets || [])[1] || "",
            detailed_bullet_point_3: (ec(a).detailed_bullets || [])[2] || "",
            detailed_bullet_point_4: (ec(a).detailed_bullets || [])[3] || "",
            detailed_bullet_point_5: (ec(a).detailed_bullets || [])[4] || "",
            // S: Description
            product_description: ec(a).product_description || "",
            // T-X: Generic Keywords
            generic_keyword_1: (ec(a).generic_keywords || [])[0] || "",
            generic_keyword_2: (ec(a).generic_keywords || [])[1] || "",
            generic_keyword_3: (ec(a).generic_keywords || [])[2] || "",
            generic_keyword_4: (ec(a).generic_keywords || [])[3] || "",
            generic_keyword_5: (ec(a).generic_keywords || [])[4] || "",
            // Y-AC: Concise Bullets
            concise_bullet_point_1: (ec(a).concise_bullets || [])[0] || "",
            concise_bullet_point_2: (ec(a).concise_bullets || [])[1] || "",
            concise_bullet_point_3: (ec(a).concise_bullets || [])[2] || "",
            concise_bullet_point_4: (ec(a).concise_bullets || [])[3] || "",
            concise_bullet_point_5: (ec(a).concise_bullets || [])[4] || "",
            // AD-AH: PA+/LI Bullets
            pa_li_bullet_point_1: (ec(a).content_bullets || [])[0] || "",
            pa_li_bullet_point_2: (ec(a).content_bullets || [])[1] || "",
            pa_li_bullet_point_3: (ec(a).content_bullets || [])[2] || "",
            pa_li_bullet_point_4: (ec(a).content_bullets || [])[3] || "",
            pa_li_bullet_point_5: (ec(a).content_bullets || [])[4] || "",
            // AI-AM: Key Features
            key_feature_1: (ec(a).key_features || [])[0] || "",
            key_feature_2: (ec(a).key_features || [])[1] || "",
            key_feature_3: (ec(a).key_features || [])[2] || "",
            key_feature_4: (ec(a).key_features || [])[3] || "",
            key_feature_5: (ec(a).key_features || [])[4] || "",
            // Metadata (same on every row)
            date: metadata.date || "",
            client_id_code: metadata.client_id_code || metadata.clientIdCode || "",
            brand_name: metadata.brand_name || metadata.brandName || "",
            client_name: metadata.client_name || metadata.clientName || "",
            client_bible_url: metadata.client_bible_url || metadata.clientBibleUrl || "",
            brand_url: metadata.brand_url || metadata.brandUrl || "",
            // Competitors
            competitor_1_name: (metadata.competitors || [])[0]?.name || "",
            competitor_1_url: (metadata.competitors || [])[0]?.url || "",
            competitor_2_name: (metadata.competitors || [])[1]?.name || "",
            competitor_2_url: (metadata.competitors || [])[1]?.url || "",
            competitor_3_name: (metadata.competitors || [])[2]?.name || "",
            competitor_3_url: (metadata.competitors || [])[2]?.url || "",
            competitor_4_name: (metadata.competitors || [])[3]?.name || "",
            competitor_4_url: (metadata.competitors || [])[3]?.url || "",
            competitor_5_name: (metadata.competitors || [])[4]?.name || "",
            competitor_5_url: (metadata.competitors || [])[4]?.url || "",
          }));

          const { error } = await supabase.from("s1_intake").insert(rows);
          if (error) throw error;
        }

        // Mark S1 approved
        await supabase
          .from("projects")
          .update({ s1_approved_at: new Date().toISOString(), current_phase: "S2" })
          .eq("id", params.id);

        return NextResponse.json({ success: true });
      }

      case "s2_keywords": {
        await supabase.from("s2_keywords").delete().eq("project_id", params.id);

        const keywordRows = data.keywords.map((k: any) => ({
          project_id: params.id,
          asin: k.ASIN || "",
          keyword_text: k.KeywordText,
          keyword_search_volume: k.KeywordSearchVolume || 0,
          keyword_priority_tier: k.KeywordPriorityTier,
          keyword_search_intent: k.KeywordSearchIntent,
          keyword_primary_use_location: k.KeywordPrimaryUseLocation,
          keyword_match_type: k.KeywordMatchType,
          keyword_cosmo_relationship: k.KeywordCOSMORelationship,
          keyword_buyer_stage: k.KeywordBuyerStage,
          keyword_notes: k.KeywordNotes || "",
          keyword_source: k.KeywordSource || "Client",
        }));

        const { error } = await supabase.from("s2_keywords").insert(keywordRows);
        if (error) throw error;

        await supabase
          .from("projects")
          .update({ s2_approved_at: new Date().toISOString(), current_phase: "S3" })
          .eq("id", params.id);

        return NextResponse.json({ success: true, count: keywordRows.length });
      }

      case "s3_reviews": {
        // Delete existing reviews
        await supabase.from("s3_reviews").delete().eq("project_id", params.id);

        const reviewRows = data.reviews.map((r: any) => ({
          project_id: params.id,
          review_id: r.ReviewID || "",
          review_date: r.ReviewDate || "",
          review_reviewer_name: r.ReviewReviewerName || "",
          review_asin: r.ReviewASIN || "",
          review_product_variation: r.ReviewProductVariation || "",
          review_star_rating: r.ReviewStarRating || 0,
          review_title: r.ReviewTitle || "",
          review_text: r.ReviewText || r.originalText || "",
          review_sentiment: r.ReviewSentiment || "",
          review_key_themes: r.ReviewKeyThemes || "",
          review_usage_mentioned: r.ReviewUsageMentioned || "",
          review_packaging_feedback: r.ReviewPackagingFeedback || "",
          review_price_feedback: r.ReviewPriceFeedback || "",
          review_heat_level_feedback: r.ReviewHeatLevelFeedback || "",
          review_rufus_usable_insight: r.ReviewRufusUsableInsight || "",
          review_bullet_mapping: r.ReviewBulletMapping || "",
        }));

        const { error } = await supabase.from("s3_reviews").insert(reviewRows);
        if (error) throw error;

        await supabase
          .from("projects")
          .update({ s3_approved_at: new Date().toISOString(), current_phase: "S4" })
          .eq("id", params.id);

        return NextResponse.json({ success: true, count: reviewRows.length });
      }

      case "s4_rufus": {
        // Delete existing rufus rows and insert one row per Q&A pair
        await supabase.from("s4_rufus").delete().eq("project_id", params.id);

        const rows = (data.analyzedRows || []).map((r: any) => ({
          project_id: params.id,
          asin: r.ASIN || "",
          rufus_question: r.RufusQuestion || "",
          rufus_answer: r.RufusAnswer || "",
          rufus_question_category: r.RufusQuestionCategory || "",
          rufus_insight_type: r.RufusInsightType || "",
          rufus_primary_objection_addressed: r.RufusPrimaryObjectionAddressed || "",
          rufus_primary_desire_addressed: r.RufusPrimaryDesireAddressed || "",
          rufus_cosmo_relationship: r.RufusCOSMORelationship || "",
          rufus_usage_context: r.RufusUsageContext || "",
          rufus_notes: r.RufusNotes || "",
        }));

        if (rows.length > 0) {
          const { error } = await supabase.from("s4_rufus").insert(rows);
          if (error) throw error;
        }

        await supabase
          .from("projects")
          .update({ s4_approved_at: new Date().toISOString(), current_phase: "S5" })
          .eq("id", params.id);

        return NextResponse.json({ success: true, count: rows.length });
      }

      case "s5_cosmo": {
        // Delete existing and insert one row per COSMO relationship
        await supabase.from("s5_cosmo").delete().eq("project_id", params.id);

        const cosmoRows = (data.rows || []).map((r: any) => ({
          project_id: params.id,
          asin: r.ASIN || "",
          cosmo_entity: r.COSMOEntity || "",
          cosmo_relation_type: r.COSMORelationType || "",
          cosmo_tail_type: r.COSMOTailType || "",
          cosmo_mapped_value: r.COSMOMappedValue || "",
          cosmo_usage_explanation: r.COSMOUsageExplanation || "",
          cosmo_applied_pdp_section_1: r.COSMOAppliedPDPSection1 || "",
          cosmo_applied_pdp_section_2: r.COSMOAppliedPDPSection2 || "",
          cosmo_notes: r.COSMONotes || "",
        }));

        if (cosmoRows.length > 0) {
          const { error } = await supabase.from("s5_cosmo").insert(cosmoRows);
          if (error) throw error;
        }

        await supabase
          .from("projects")
          .update({ s5_approved_at: new Date().toISOString(), current_phase: "S6" })
          .eq("id", params.id);

        return NextResponse.json({ success: true, count: cosmoRows.length });
      }

      case "s6_compliance": {
        await supabase.from("s6_compliance").delete().eq("project_id", params.id);

        const complianceRows = (data.rows || []).map((r: any) => ({
          project_id: params.id,
          severity: r.Severity || "",
          category: r.Category || "",
          source_section: r.SourceSection || "",
          source_field: r.SourceField || "",
          flagged_term: r.FlaggedTerm || "",
          detail: r.Detail || "",
          scanned_at: r.ScannedAt || new Date().toISOString(),
        }));

        if (complianceRows.length > 0) {
          const { error } = await supabase.from("s6_compliance").insert(complianceRows);
          if (error) throw error;
        }

        // Store compliance summary on the project (compliance is integrated into S6 SEO)
        await supabase
          .from("projects")
          .update({
            compliance_summary: data.summary || null,
          })
          .eq("id", params.id);

        return NextResponse.json({ success: true, count: complianceRows.length });
      }

      case "s7_seo": {
        await supabase.from("s7_seo").delete().eq("project_id", params.id);

        const seoRows = (data.rows || []).map((r: any) => ({
          project_id: params.id,
          asin: r.ASIN || "",
          url: r.URL || "",
          variation_id: r.VariationID || "",
          variation_product: r.VariationProduct || "",
          parentage_level: r.ParentageLevel || "",
          variation_theme_name: r.VariationThemeName || "",
          flavor: r.Flavor || "",
          style: r.Style || "",
          color: r.Color || "",
          size: r.Size || "",
          title: r.Title || "",
          title_char_length: r.Title_CharLength || 0,
          detailed_bullet_point_1: r.DetailedBulletPoint_1 || "",
          detailed_bullet_point_1_char_length: r.DetailedBulletPoint_1_CharLength || 0,
          detailed_bullet_point_2: r.DetailedBulletPoint_2 || "",
          detailed_bullet_point_2_char_length: r.DetailedBulletPoint_2_CharLength || 0,
          detailed_bullet_point_3: r.DetailedBulletPoint_3 || "",
          detailed_bullet_point_3_char_length: r.DetailedBulletPoint_3_CharLength || 0,
          detailed_bullet_point_4: r.DetailedBulletPoint_4 || "",
          detailed_bullet_point_4_char_length: r.DetailedBulletPoint_4_CharLength || 0,
          detailed_bullet_point_5: r.DetailedBulletPoint_5 || "",
          detailed_bullet_point_5_char_length: r.DetailedBulletPoint_5_CharLength || 0,
          concise_bullet_point_1: r.ConciseBulletPoint_1 || "",
          concise_bullet_point_1_char_length: r.ConciseBulletPoint_1_CharLength || 0,
          concise_bullet_point_2: r.ConciseBulletPoint_2 || "",
          concise_bullet_point_2_char_length: r.ConciseBulletPoint_2_CharLength || 0,
          concise_bullet_point_3: r.ConciseBulletPoint_3 || "",
          concise_bullet_point_3_char_length: r.ConciseBulletPoint_3_CharLength || 0,
          concise_bullet_point_4: r.ConciseBulletPoint_4 || "",
          concise_bullet_point_4_char_length: r.ConciseBulletPoint_4_CharLength || 0,
          concise_bullet_point_5: r.ConciseBulletPoint_5 || "",
          concise_bullet_point_5_char_length: r.ConciseBulletPoint_5_CharLength || 0,
          content_bullet_point_1: r.ContentBulletPoint_1 || "",
          content_bullet_point_1_char_length: r.ContentBulletPoint_1_CharLength || 0,
          content_bullet_point_2: r.ContentBulletPoint_2 || "",
          content_bullet_point_2_char_length: r.ContentBulletPoint_2_CharLength || 0,
          content_bullet_point_3: r.ContentBulletPoint_3 || "",
          content_bullet_point_3_char_length: r.ContentBulletPoint_3_CharLength || 0,
          content_bullet_point_4: r.ContentBulletPoint_4 || "",
          content_bullet_point_4_char_length: r.ContentBulletPoint_4_CharLength || 0,
          content_bullet_point_5: r.ContentBulletPoint_5 || "",
          content_bullet_point_5_char_length: r.ContentBulletPoint_5_CharLength || 0,
          key_features_bullet_point_1: r.KeyFeaturesBulletPoint_1 || "",
          key_features_bullet_point_1_char_length: r.KeyFeaturesBulletPoint_1_CharLength || 0,
          key_features_bullet_point_2: r.KeyFeaturesBulletPoint_2 || "",
          key_features_bullet_point_2_char_length: r.KeyFeaturesBulletPoint_2_CharLength || 0,
          key_features_bullet_point_3: r.KeyFeaturesBulletPoint_3 || "",
          key_features_bullet_point_3_char_length: r.KeyFeaturesBulletPoint_3_CharLength || 0,
          key_features_bullet_point_4: r.KeyFeaturesBulletPoint_4 || "",
          key_features_bullet_point_4_char_length: r.KeyFeaturesBulletPoint_4_CharLength || 0,
          key_features_bullet_point_5: r.KeyFeaturesBulletPoint_5 || "",
          key_features_bullet_point_5_char_length: r.KeyFeaturesBulletPoint_5_CharLength || 0,
          product_description: r.ProductDescription || "",
          product_description_char_length: r.ProductDescription_CharLength || 0,
          search_terms_core: r.SearchTermsCore || "",
          search_terms_core_byte_length: r.SearchTermsCore_ByteLength || 0,
          search_terms_supplement: r.SearchTermsSupplement || "",
          search_terms_supplement_byte_length: r.SearchTermsSupplement_ByteLength || 0,
          search_terms_symptom: r.SearchTermsSymptom || "",
          search_terms_symptom_byte_length: r.SearchTermsSymptom_ByteLength || 0,
          search_terms_audience: r.SearchTermsAudience || "",
          search_terms_audience_byte_length: r.SearchTermsAudience_ByteLength || 0,
          search_terms_longtail: r.SearchTermsLongTail || "",
          search_terms_longtail_byte_length: r.SearchTermsLongTail_ByteLength || 0,
        }));

        if (seoRows.length > 0) {
          const { error } = await supabase.from("s7_seo").insert(seoRows);
          if (error) throw error;
        }

        await supabase
          .from("projects")
          .update({
            // Only mark fully approved when in_progress is explicitly false
            ...(data.config?.in_progress === false ? {
              s6_approved_at: new Date().toISOString(),
              current_phase: "S7",
            } : {}),
            seo_config: data.config || null,
          })
          .eq("id", params.id);

        return NextResponse.json({ success: true, count: seoRows.length });
      }

      default:
        return NextResponse.json({ error: `Unknown phase: ${phase}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error("Save error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
