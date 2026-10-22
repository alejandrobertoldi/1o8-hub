/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/async-await-in-loop */
import { db } from "@/lib/db";
import {
  seoProjects,
  seoKeywords,
  seoAsins,
  seoRufus,
  seoCosmopMaps,
  seoListings,
  seoQa,
  seoPassageMap,
  seoAplusPlans,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { PhaseExecutor } from "@/lib/seo/phases/s1";
import {
  scanCompliance,
  mergeBypass,
  type ComplianceViolation,
} from "@/lib/seo/compliance";
import { checkByteBudget, checkCharBudget } from "@/lib/seo/byte-budget";

type S6Context = {
  projectId: string;
  approvedKeywords: unknown[];
  rufusPhase3: unknown;
  cosmoTriples: unknown[];
  brandVoice: string;
  wordsToAvoid: string[];
  asins: Array<{ id: string; asin: string; sku: string }>;
};

type S6Output = {
  listings: Array<{
    asin_id: string;
    title: string;
    item_highlight: string;
    bullets: {
      detailed: string[];
      concise: string[];
      content: string[];
      key_features: string[];
    };
    product_description: string;
    backend_search_terms: string;
    backend_categories: {
      core: string;
      supplement: string;
      symptom: string;
      audience: string;
      longtail: string;
    };
    compliance_violations?: ComplianceViolation[];
  }>;
  qa_pairs: Array<{
    id: string;
    question: string;
    answer_short: string;
    answer_long: string;
    intent_tier: string;
    source_rufus_question_id: string | null;
    source_review_themes: string[];
  }>;
  passage_map_by_asin: Record<
    string,
    Array<{
      section: string;
      text: string;
      rufus_question_ids: string[];
      cosmo_triple_ids: string[];
      keywords_used: string[];
    }>
  >;
};

export const S6: PhaseExecutor<S6Context, S6Output> = {
  phase: "S6",
  model: "claude-sonnet-4-6",

  async loadContext(projectId) {
    const [project] = await db
      .select()
      .from(seoProjects)
      .where(eq(seoProjects.id, projectId))
      .limit(1);
    if (!project) throw new Error(`project ${projectId} not found`);

    const kws = await db
      .select()
      .from(seoKeywords)
      .where(eq(seoKeywords.projectId, projectId));
    const [rufus] = await db
      .select()
      .from(seoRufus)
      .where(eq(seoRufus.projectId, projectId))
      .limit(1);
    const [cosmo] = await db
      .select()
      .from(seoCosmopMaps)
      .where(eq(seoCosmopMaps.projectId, projectId))
      .limit(1);
    const asins = await db
      .select()
      .from(seoAsins)
      .where(eq(seoAsins.projectId, projectId));

    return {
      projectId,
      approvedKeywords: kws
        .filter((k) => !k.isNegative)
        .map((k) => ({ text: k.text, tier: k.priorityTier })),
      rufusPhase3: rufus?.optimizationSummary ?? null,
      cosmoTriples: (cosmo?.triples as unknown[]) ?? [],
      brandVoice: (project.brandGuidelinesLock as any)?.brand_voice ?? "",
      wordsToAvoid:
        (project.brandGuidelinesLock as any)?.words_to_avoid ?? [],
      asins: asins.map((a) => ({ id: a.id, asin: a.asin, sku: a.sku })),
    };
  },

  fillSlots(ctx) {
    return {
      approved_keywords_json: ctx.approvedKeywords,
      rufus_phase3: ctx.rufusPhase3 ?? "",
      cosmo_triples: ctx.cosmoTriples,
      brand_voice: ctx.brandVoice,
      words_to_avoid: ctx.wordsToAvoid.join(", "),
      variation_family_summary: ctx.asins
        .map((a) => `${a.asin} (${a.sku})`)
        .join("; "),
      asin_specific_attributes: ctx.asins,
    };
  },

  async persist(projectId, output) {
    return await db.transaction(async (tx) => {
      for (const l of output.listings) {
        // ── Compliance scan ──────────────────────────────────────────────────
        const fresh: ComplianceViolation[] = [];
        const fields: Array<{ field: string; text: string }> = [
          { field: "title", text: l.title },
          { field: "item_highlight", text: l.item_highlight },
          ...l.bullets.detailed.map((b, i) => ({
            field: `bullets.detailed.${i}`,
            text: b,
          })),
          ...l.bullets.concise.map((b, i) => ({
            field: `bullets.concise.${i}`,
            text: b,
          })),
          ...l.bullets.content.map((b, i) => ({
            field: `bullets.content.${i}`,
            text: b,
          })),
          ...l.bullets.key_features.map((b, i) => ({
            field: `bullets.key_features.${i}`,
            text: b,
          })),
          { field: "product_description", text: l.product_description },
          { field: "backend_search_terms", text: l.backend_search_terms },
        ];

        const [project] = await tx
          .select()
          .from(seoProjects)
          .where(eq(seoProjects.id, projectId))
          .limit(1);
        const brandWords =
          (project?.brandGuidelinesLock as any)?.words_to_avoid ?? [];

        for (const f of fields) {
          fresh.push(
            ...scanCompliance({
              field: f.field,
              text: f.text,
              brandWordsToAvoid: brandWords,
            })
          );
        }

        const [prior] = await tx
          .select()
          .from(seoListings)
          .where(eq(seoListings.asinId, l.asin_id))
          .orderBy(sql`version DESC`)
          .limit(1);
        const merged = mergeBypass(fresh, (prior?.complianceViolations as ComplianceViolation[]) ?? []);

        // ── Byte usage (pre-flighted deviation #3: explicit destructure, no spread) ─
        const titleBudget = checkCharBudget(l.title, 1, 75);
        const itemHighlightBudget = checkCharBudget(l.item_highlight, 1, 125);
        const descBudget = checkCharBudget(l.product_description, 1000, 1200);
        const byteUsage: Record<string, { used: number; max: number; ok: boolean }> = {
          title: { used: titleBudget.used, max: titleBudget.max, ok: titleBudget.ok },
          item_highlight: { used: itemHighlightBudget.used, max: itemHighlightBudget.max, ok: itemHighlightBudget.ok },
          product_description: {
            used: descBudget.used,
            max: descBudget.max,
            ok: descBudget.ok,
          },
          backend_search_terms: checkByteBudget(l.backend_search_terms, 500),
        };

        const nextVersion = (prior?.version ?? 0) + 1;

        // ── seo_listings ─────────────────────────────────────────────────────
        await tx.insert(seoListings).values({
          projectId,
          asinId: l.asin_id,
          title: l.title,
          itemHighlight: l.item_highlight,
          bullets: l.bullets,
          productDescription: l.product_description,
          backendSearchTerms: l.backend_search_terms,
          backendCategories: l.backend_categories,
          byteUsage,
          complianceViolations: merged,
          version: nextVersion,
        });

        // ── seo_aplus_plans (7-module headers; position 7 = premium_qa shell) ─
        const headers = Array.from({ length: 7 }, (_, i) => ({
          position: i + 1,
          module_type: i === 6 ? "premium_qa" : "hero",
          cosmo_relationship: null,
          fields: {},
          images: [],
        }));
        const [priorAplus] = await tx
          .select()
          .from(seoAplusPlans)
          .where(eq(seoAplusPlans.asinId, l.asin_id))
          .orderBy(sql`version DESC`)
          .limit(1);
        await tx.insert(seoAplusPlans).values({
          projectId,
          asinId: l.asin_id,
          modules: headers as any,
          version: (priorAplus?.version ?? 0) + 1,
        });

        // ── seo_passage_map ──────────────────────────────────────────────────
        const passages = output.passage_map_by_asin[l.asin_id] ?? [];
        const [priorPm] = await tx
          .select()
          .from(seoPassageMap)
          .where(eq(seoPassageMap.asinId, l.asin_id))
          .orderBy(sql`version DESC`)
          .limit(1);
        await tx.insert(seoPassageMap).values({
          projectId,
          asinId: l.asin_id,
          passages,
          version: (priorPm?.version ?? 0) + 1,
        });

        // ── seo_qa (with derived subsets) ────────────────────────────────────
        const aplusSubset = output.qa_pairs
          .filter((p) => p.intent_tier === "decision")
          .slice(0, 5)
          .map((p) => ({
            id: p.id,
            question: p.question,
            answer: p.answer_long,
          }));
        const customerExport = output.qa_pairs.map((p) => ({
          id: p.id,
          question: p.question,
          answer: p.answer_long,
        }));
        const passageMapQa = output.qa_pairs.map((p) => ({
          pair_id: p.id,
          rufus_question_ids: p.source_rufus_question_id
            ? [p.source_rufus_question_id]
            : [],
          cosmo_triple_ids: [],
        }));

        const [priorQa] = await tx
          .select()
          .from(seoQa)
          .where(and(eq(seoQa.projectId, projectId), eq(seoQa.asinId, l.asin_id)))
          .orderBy(sql`version DESC`)
          .limit(1);
        await tx.insert(seoQa).values({
          projectId,
          asinId: l.asin_id,
          pairs: output.qa_pairs,
          aplusQaSubset: aplusSubset,
          customerQaExport: customerExport,
          passageMapQa,
          version: (priorQa?.version ?? 0) + 1,
        });
      }

      // Stamp s6_approved_at AFTER all writes succeed
      await tx
        .update(seoProjects)
        .set({ s6ApprovedAt: new Date(), updatedAt: new Date() })
        .where(eq(seoProjects.id, projectId));

      return { version: 1 };
    });
  },
};
