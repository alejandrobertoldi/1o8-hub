import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aplusModules, aplusModuleImages, master } from "@/lib/db/schema";
import { queryBigQuery } from "@/lib/bigquery";
import { seoOutPaPlusTable } from "@/lib/bq-datasets";
import { getAuthSession } from "@/lib/auth-db";
import { eq, inArray } from "drizzle-orm";
import {
  APLUS_MODULE_SPECS,
  APLUS_MODULE_TYPES,
  type AplusModuleType,
} from "@/lib/aplus-module-specs";

export const maxDuration = 60;

// OUT_PA+ table name contains a `+`; the whole FQN is wrapped in a single
// backtick pair at the call site below (valid BigQuery for special-char ids).
// Dataset/project/table are env-driven — see src/lib/bq-datasets.ts. Values
// were inferred (unverified) pre-migration; smoke-test after any re-point.

// NOTE: BQ column names are best-effort — verify against actual OUT_PA+ schema
interface OutPaPlusRow {
  ASIN: string;
  ClientIDCode: string;
  APlusModule_Number: number;
  APlusModule_Type: string;
  APlusHeadline: string | null;
  APlusSubheadline: string | null;
  APlusBodyText: string | null;
  APlusAltText: string | null;
  APlusOverlayText: string | null;
  APlusImageDescription: string | null;
  APlusAIImagePrompt: string | null;
  APlusCosmoRelationType: string | null;
}

/**
 * Normalize a BQ module type string to the snake_case enum value.
 * Lowercases, replaces spaces and special characters with underscores,
 * collapses multiple underscores, then validates against APLUS_MODULE_TYPES.
 */
function normalizeModuleType(rawType: string | null | undefined): AplusModuleType | null {
  if (!rawType) return null;

  const normalized = rawType
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  if (APLUS_MODULE_TYPES.includes(normalized as AplusModuleType)) {
    return normalized as AplusModuleType;
  }

  // Fuzzy fallback: try removing common filler words and compare
  const fillerWords = ["standard", "a", "the", "and", "&", "with", "of"];
  const stripped = normalized
    .split("_")
    .filter((w) => !fillerWords.includes(w))
    .join("_");

  const fuzzyMatch = APLUS_MODULE_TYPES.find((type) => {
    const typeStripped = type
      .split("_")
      .filter((w) => !fillerWords.includes(w))
      .join("_");
    return typeStripped === stripped;
  });

  return fuzzyMatch ?? null;
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let clientIdCode: string;
  let asins: string[];

  try {
    const body = await req.json();
    clientIdCode = body.clientIdCode;
    asins = body.asins;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!clientIdCode || typeof clientIdCode !== "string") {
    return NextResponse.json(
      { error: "clientIdCode is required and must be a string" },
      { status: 400 }
    );
  }
  if (!Array.isArray(asins) || asins.length === 0 || !asins.every((a) => typeof a === "string")) {
    return NextResponse.json(
      { error: "asins must be a non-empty array of strings" },
      { status: 400 }
    );
  }

  try {
    // 1. Pre-load product lookup map: ASIN -> { id, clientIdCode, sku }
    const productRows = await db
      .select({
        id: master.id,
        asin: master.asin,
        sku: master.sku,
        clientIdCode: master.clientIdCode,
      })
      .from(master)
      .where(inArray(master.asin, asins));

    const productMap = new Map(
      productRows
        .filter((p): p is typeof p & { asin: string } => p.asin !== null)
        .map((p) => [p.asin, p])
    );

    // 2. Fetch all BQ rows for the requested ASINs + clientIdCode in a single query
    const placeholders = asins.map((_, i) => `@asin_${i}`).join(", ");
    const bqParams: Record<string, string> = { clientIdCode };
    asins.forEach((asin, i) => {
      bqParams[`asin_${i}`] = asin;
    });

    const bqRows = await queryBigQuery<OutPaPlusRow>(
      `SELECT ASIN, ClientIDCode, APlusModule_Number, APlusModule_Type,
              APlusHeadline, APlusSubheadline, APlusBodyText, APlusAltText,
              APlusOverlayText, APlusImageDescription, APlusAIImagePrompt,
              APlusCosmoRelationType
       FROM \`${seoOutPaPlusTable()}\`
       WHERE ClientIDCode = @clientIdCode
         AND ASIN IN (${placeholders})
       ORDER BY ASIN, APlusModule_Number`,
      bqParams
    );

    // 3. Process each ASIN atomically
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const asin of asins) {
      const product = productMap.get(asin);
      if (!product) {
        errors.push(`ASIN ${asin} not found in products table — skipped`);
        skipped++;
        continue;
      }

      const asinRows = bqRows.filter((r) => r.ASIN === asin);

      // Filter module_number > 7 with warning
      const validRows = asinRows.filter((r) => {
        const num = Number(r.APlusModule_Number);
        if (num > 7) {
          console.warn(
            `[aplus/import] ASIN ${asin}: module_number ${num} exceeds 7-module limit — skipped`
          );
          return false;
        }
        return true;
      });

      try {
        await db.transaction(async (tx) => {
          // DELETE existing modules for this product (cascade removes images)
          await tx
            .delete(aplusModules)
            .where(eq(aplusModules.productId, product.id));

          // INSERT fresh modules from BQ data
          for (const row of validRows) {
            const moduleType = normalizeModuleType(row.APlusModule_Type);

            if (!moduleType) {
              console.warn(
                `[aplus/import] ASIN ${asin}: unrecognized module type "${row.APlusModule_Type}" — skipped`
              );
              errors.push(
                `ASIN ${asin} module ${row.APlusModule_Number}: unrecognized type "${row.APlusModule_Type}"`
              );
              continue;
            }

            const [insertedModule] = await tx
              .insert(aplusModules)
              .values({
                productId: product.id,
                moduleNumber: Number(row.APlusModule_Number),
                moduleType,
                headlineText: row.APlusHeadline ?? null,
                subheadlineText: row.APlusSubheadline ?? null,
                bodyText: row.APlusBodyText ?? null,
                altText: row.APlusAltText ?? null,
                overlayText: row.APlusOverlayText ?? null,
                imageDescription: row.APlusImageDescription ?? null,
                aiImagePrompt: row.APlusAIImagePrompt ?? null,
                cosmoRelationType: row.APlusCosmoRelationType ?? null,
                importedAt: new Date(),
              })
              .returning();

            // INSERT image stub rows — one per image slot defined by the module spec
            const spec = APLUS_MODULE_SPECS[moduleType];
            if (spec.imageSlots.length > 0) {
              await tx.insert(aplusModuleImages).values(
                spec.imageSlots.map((slot, idx) => ({
                  moduleId: insertedModule.id,
                  imageSlot: idx + 1,
                  customLabel: slot.key,
                  clientIdCode: product.clientIdCode,
                  asin: product.asin,
                  sku: product.sku,
                  // Populate text fields from BQ row where available
                  altText: row.APlusAltText
                    ? row.APlusAltText.slice(0, 100)
                    : null,
                  aiImagePrompt: row.APlusAIImagePrompt ?? null,
                }))
              );
            }
          }
        });

        imported++;
      } catch (txError) {
        errors.push(
          `ASIN ${asin} transaction failed: ${txError instanceof Error ? txError.message : "unknown error"}`
        );
        skipped++;
      }
    }

    return NextResponse.json({ imported, skipped, errors });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Import failed",
      },
      { status: 500 }
    );
  }
}
