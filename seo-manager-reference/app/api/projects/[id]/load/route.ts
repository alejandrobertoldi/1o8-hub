/* eslint-disable react-doctor/no-giant-component */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();
    const phase = req.nextUrl.searchParams.get("phase");

    switch (phase) {
      case "s1_intake": {
        const { data: project } = await supabase
          .from("projects")
          .select("brand_name, client_name, client_bible_url, brand_url, competitors, variation_theme, date, client_id_code, brand_guidelines, brand_guidelines_lock, variety_pack_details")
          .eq("id", params.id)
          .single();

        const { data: rows } = await supabase
          .from("s1_intake")
          .select("*")
          .eq("project_id", params.id)
          .order("parentage_level", { ascending: true });

        // Normalize s1_intake rows into the shape the frontend expects
        const asins = (rows || []).map((r: any) => ({
          asin: r.asin,
          sku: r.sku,
          amazon_url: r.amazon_pdp_url,
          website_url: r.website_pdp_url,
          variation_id: r.variation_id,
          variation_product: r.variation_product,
          parentage_level: r.parentage_level,
          variation_theme_name: r.variation_theme_name,
          flavor: r.flavor,
          style: r.style,
          color: r.color,
          size: r.size,
          existing_content: {
            item_name: r.item_name || "",
            detailed_bullets: [
              r.detailed_bullet_point_1 || "",
              r.detailed_bullet_point_2 || "",
              r.detailed_bullet_point_3 || "",
              r.detailed_bullet_point_4 || "",
              r.detailed_bullet_point_5 || "",
            ],
            product_description: r.product_description || "",
            generic_keywords: [
              r.generic_keyword_1 || "",
              r.generic_keyword_2 || "",
              r.generic_keyword_3 || "",
              r.generic_keyword_4 || "",
              r.generic_keyword_5 || "",
            ],
            concise_bullets: [
              r.concise_bullet_point_1 || "",
              r.concise_bullet_point_2 || "",
              r.concise_bullet_point_3 || "",
              r.concise_bullet_point_4 || "",
              r.concise_bullet_point_5 || "",
            ],
            content_bullets: [
              r.pa_li_bullet_point_1 || "",
              r.pa_li_bullet_point_2 || "",
              r.pa_li_bullet_point_3 || "",
              r.pa_li_bullet_point_4 || "",
              r.pa_li_bullet_point_5 || "",
            ],
            key_features: [
              r.key_feature_1 || "",
              r.key_feature_2 || "",
              r.key_feature_3 || "",
              r.key_feature_4 || "",
              r.key_feature_5 || "",
            ],
          },
        }));

        // Build competitors from first row
        const first = rows?.[0];
        const competitors: { name: string; url: string }[] = [];
        if (first) {
          for (let i = 1; i <= 5; i++) {
            const name = first[`competitor_${i}_name`];
            if (name) competitors.push({ name, url: first[`competitor_${i}_url`] || "" });
          }
        }

        return NextResponse.json({
          project: {
            ...(project || {}),
            brand_name: first?.brand_name || project?.brand_name || "",
            client_name: first?.client_name || project?.client_name || "",
            client_id_code: first?.client_id_code || project?.client_id_code || "",
            date: first?.date || project?.date || "",
            client_bible_url: first?.client_bible_url || project?.client_bible_url || "",
            brand_url: first?.brand_url || project?.brand_url || "",
            competitors: competitors.length > 0 ? competitors : (project?.competitors || []),
            brand_guidelines: project?.brand_guidelines || "",
            brand_guidelines_lock: project?.brand_guidelines_lock || "not_applicable",
            variety_pack_details: project?.variety_pack_details ? JSON.parse(project.variety_pack_details) : [],
          },
          asins,
        });
      }

      case "s2_keywords": {
        const { data: keywords } = await supabase
          .from("s2_keywords")
          .select("*")
          .eq("project_id", params.id)
          .order("keyword_search_volume", { ascending: false });
        return NextResponse.json({
          keywords: (keywords || []).map((k: any) => ({
            KeywordText: k.keyword_text,
            KeywordSearchVolume: k.keyword_search_volume,
            KeywordPriorityTier: k.keyword_priority_tier,
            KeywordSearchIntent: k.keyword_search_intent,
            KeywordPrimaryUseLocation: k.keyword_primary_use_location,
            KeywordMatchType: k.keyword_match_type,
            KeywordCOSMORelationship: k.keyword_cosmo_relationship,
            KeywordBuyerStage: k.keyword_buyer_stage,
            KeywordNotes: k.keyword_notes,
            KeywordSource: k.keyword_source,
          })),
        });
      }

      case "s3_reviews": {
        const { data: reviews } = await supabase
          .from("s3_reviews")
          .select("*")
          .eq("project_id", params.id)
          .order("review_star_rating", { ascending: false });
        return NextResponse.json({
          reviews: (reviews || []).map((r: any) => ({
            ReviewID: r.review_id,
            ReviewDate: r.review_date,
            ReviewReviewerName: r.review_reviewer_name,
            ReviewASIN: r.review_asin,
            ReviewProductVariation: r.review_product_variation,
            ReviewStarRating: r.review_star_rating,
            ReviewTitle: r.review_title,
            ReviewText: r.review_text,
            ReviewSentiment: r.review_sentiment,
            ReviewKeyThemes: r.review_key_themes,
            ReviewUsageMentioned: r.review_usage_mentioned,
            ReviewPackagingFeedback: r.review_packaging_feedback,
            ReviewPriceFeedback: r.review_price_feedback,
            ReviewHeatLevelFeedback: r.review_heat_level_feedback,
            ReviewRufusUsableInsight: r.review_rufus_usable_insight,
            ReviewBulletMapping: r.review_bullet_mapping,
          })),
        });
      }

      case "s4_rufus": {
        // Load all rufus Q&A rows for this project
        const { data: rows } = await supabase
          .from("s4_rufus")
          .select("*")
          .eq("project_id", params.id)
          .order("created_at", { ascending: true });

        if (!rows || rows.length === 0) {
          return NextResponse.json({ rows: [] });
        }

        // Return rows in the frontend's expected format
        return NextResponse.json({
          rows: rows.map((r: any) => ({
            ASIN: r.asin,
            RufusQuestion: r.rufus_question,
            RufusAnswer: r.rufus_answer,
            RufusQuestionCategory: r.rufus_question_category,
            RufusInsightType: r.rufus_insight_type,
            RufusPrimaryObjectionAddressed: r.rufus_primary_objection_addressed,
            RufusPrimaryDesireAddressed: r.rufus_primary_desire_addressed,
            RufusCOSMORelationship: r.rufus_cosmo_relationship,
            RufusUsageContext: r.rufus_usage_context,
            RufusNotes: r.rufus_notes,
          })),
        });
      }

      case "s5_cosmo": {
        const { data: rows } = await supabase
          .from("s5_cosmo")
          .select("*")
          .eq("project_id", params.id)
          .order("created_at", { ascending: true });

        return NextResponse.json({
          rows: (rows || []).map((r: any) => ({
            ASIN: r.asin,
            COSMOEntity: r.cosmo_entity,
            COSMORelationType: r.cosmo_relation_type,
            COSMOTailType: r.cosmo_tail_type,
            COSMOMappedValue: r.cosmo_mapped_value,
            COSMOUsageExplanation: r.cosmo_usage_explanation,
            COSMOAppliedPDPSection1: r.cosmo_applied_pdp_section_1,
            COSMOAppliedPDPSection2: r.cosmo_applied_pdp_section_2,
            COSMONotes: r.cosmo_notes,
          })),
        });
      }

      case "s6_compliance": {
        const { data: rows } = await supabase
          .from("s6_compliance")
          .select("*")
          .eq("project_id", params.id)
          .order("created_at", { ascending: true });

        return NextResponse.json({
          rows: (rows || []).map((r: any) => ({
            Severity: r.severity,
            Category: r.category,
            SourceSection: r.source_section,
            SourceField: r.source_field,
            FlaggedTerm: r.flagged_term,
            Detail: r.detail,
            ScannedAt: r.scanned_at,
          })),
        });
      }

      case "s7_seo": {
        const { data: rows } = await supabase
          .from("s7_seo")
          .select("*")
          .eq("project_id", params.id)
          .order("created_at", { ascending: true });

        const { data: proj } = await supabase
          .from("projects")
          .select("seo_config")
          .eq("id", params.id)
          .single();

        return NextResponse.json({
          rows: (rows || []).map((r: any) => ({
            ASIN: r.asin,
            URL: r.url,
            VariationID: r.variation_id,
            VariationProduct: r.variation_product,
            ParentageLevel: r.parentage_level,
            VariationThemeName: r.variation_theme_name,
            Flavor: r.flavor,
            Style: r.style,
            Color: r.color,
            Size: r.size,
            Title: r.title,
            Title_CharLength: r.title_char_length,
            DetailedBulletPoint_1: r.detailed_bullet_point_1,
            DetailedBulletPoint_1_CharLength: r.detailed_bullet_point_1_char_length,
            DetailedBulletPoint_2: r.detailed_bullet_point_2,
            DetailedBulletPoint_2_CharLength: r.detailed_bullet_point_2_char_length,
            DetailedBulletPoint_3: r.detailed_bullet_point_3,
            DetailedBulletPoint_3_CharLength: r.detailed_bullet_point_3_char_length,
            DetailedBulletPoint_4: r.detailed_bullet_point_4,
            DetailedBulletPoint_4_CharLength: r.detailed_bullet_point_4_char_length,
            DetailedBulletPoint_5: r.detailed_bullet_point_5,
            DetailedBulletPoint_5_CharLength: r.detailed_bullet_point_5_char_length,
            ConciseBulletPoint_1: r.concise_bullet_point_1,
            ConciseBulletPoint_1_CharLength: r.concise_bullet_point_1_char_length,
            ConciseBulletPoint_2: r.concise_bullet_point_2,
            ConciseBulletPoint_2_CharLength: r.concise_bullet_point_2_char_length,
            ConciseBulletPoint_3: r.concise_bullet_point_3,
            ConciseBulletPoint_3_CharLength: r.concise_bullet_point_3_char_length,
            ConciseBulletPoint_4: r.concise_bullet_point_4,
            ConciseBulletPoint_4_CharLength: r.concise_bullet_point_4_char_length,
            ConciseBulletPoint_5: r.concise_bullet_point_5,
            ConciseBulletPoint_5_CharLength: r.concise_bullet_point_5_char_length,
            ContentBulletPoint_1: r.content_bullet_point_1,
            ContentBulletPoint_1_CharLength: r.content_bullet_point_1_char_length,
            ContentBulletPoint_2: r.content_bullet_point_2,
            ContentBulletPoint_2_CharLength: r.content_bullet_point_2_char_length,
            ContentBulletPoint_3: r.content_bullet_point_3,
            ContentBulletPoint_3_CharLength: r.content_bullet_point_3_char_length,
            ContentBulletPoint_4: r.content_bullet_point_4,
            ContentBulletPoint_4_CharLength: r.content_bullet_point_4_char_length,
            ContentBulletPoint_5: r.content_bullet_point_5,
            ContentBulletPoint_5_CharLength: r.content_bullet_point_5_char_length,
            KeyFeaturesBulletPoint_1: r.key_features_bullet_point_1,
            KeyFeaturesBulletPoint_1_CharLength: r.key_features_bullet_point_1_char_length,
            KeyFeaturesBulletPoint_2: r.key_features_bullet_point_2,
            KeyFeaturesBulletPoint_2_CharLength: r.key_features_bullet_point_2_char_length,
            KeyFeaturesBulletPoint_3: r.key_features_bullet_point_3,
            KeyFeaturesBulletPoint_3_CharLength: r.key_features_bullet_point_3_char_length,
            KeyFeaturesBulletPoint_4: r.key_features_bullet_point_4,
            KeyFeaturesBulletPoint_4_CharLength: r.key_features_bullet_point_4_char_length,
            KeyFeaturesBulletPoint_5: r.key_features_bullet_point_5,
            KeyFeaturesBulletPoint_5_CharLength: r.key_features_bullet_point_5_char_length,
            ProductDescription: r.product_description,
            ProductDescription_CharLength: r.product_description_char_length,
            SearchTermsCore: r.search_terms_core,
            SearchTermsCore_ByteLength: r.search_terms_core_byte_length,
            SearchTermsSupplement: r.search_terms_supplement,
            SearchTermsSupplement_ByteLength: r.search_terms_supplement_byte_length,
            SearchTermsSymptom: r.search_terms_symptom,
            SearchTermsSymptom_ByteLength: r.search_terms_symptom_byte_length,
            SearchTermsAudience: r.search_terms_audience,
            SearchTermsAudience_ByteLength: r.search_terms_audience_byte_length,
            SearchTermsLongTail: r.search_terms_longtail,
            SearchTermsLongTail_ByteLength: r.search_terms_longtail_byte_length,
          })),
          config: proj?.seo_config || null,
        });
      }

      case "parent_asin": {
        const { data: parent } = await supabase
          .from("s1_intake")
          .select("asin, amazon_pdp_url")
          .eq("project_id", params.id)
          .eq("parentage_level", "Parent")
          .single();
        return NextResponse.json({
          parent: parent ? { asin: parent.asin, amazon_url: parent.amazon_pdp_url } : null,
        });
      }

      default:
        return NextResponse.json({ error: `Unknown phase: ${phase}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
