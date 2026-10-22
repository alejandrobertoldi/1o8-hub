/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Backfill Parent ASINs: set theme variation attrs (Flavor/Size/Color/Style)
 * to "Parent" — same rule as PDP when Parentage Level is saved.
 *
 * Usage:
 *   npx tsx scripts/backfill-parent-theme-attrs.ts          # dry-run
 *   npx tsx scripts/backfill-parent-theme-attrs.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { sql, eq } from "drizzle-orm";
import {
  applyParentThemeFillToProductUpdates,
  parentThemeBqNames,
} from "../src/lib/seo/parent-variation-fill";

const APPLY = process.argv.includes("--apply");

const JSONB_BLOBS = [
  "contentSeo",
  "variations",
  "packaging",
  "targetAudience",
  "fulfillment",
  "productAttributes",
  "nutritionSupplements",
  "complianceSafety",
  "images",
  "dimensionsWeight",
  "otherAttributes",
] as const;

function themeFromProduct(p: {
  variations: Record<string, string> | null;
  otherAttributes: Record<string, string> | null;
  rawColumnValues: Record<string, string> | null;
  productAttributes: Record<string, string> | null;
  contentSeo: Record<string, string> | null;
}): string | null {
  return (
    p.variations?.VariationThemeName
    || p.otherAttributes?.VariationThemeName
    || p.rawColumnValues?.VariationThemeName
    || p.productAttributes?.VariationThemeName
    || p.contentSeo?.VariationThemeName
    || null
  );
}

async function main() {
  const { db } = await import("../src/lib/db");
  const { master } = await import("../src/lib/db/schema");
  const parents = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      clientIdCode: master.clientIdCode,
      parentageLevel: master.parentageLevel,
      variations: master.variations,
      otherAttributes: master.otherAttributes,
      rawColumnValues: master.rawColumnValues,
      productAttributes: master.productAttributes,
      contentSeo: master.contentSeo,
      packaging: master.packaging,
      targetAudience: master.targetAudience,
      fulfillment: master.fulfillment,
      nutritionSupplements: master.nutritionSupplements,
      complianceSafety: master.complianceSafety,
      images: master.images,
      dimensionsWeight: master.dimensionsWeight,
      changeLog: master.changeLog,
    })
    .from(master)
    .where(sql`lower(${master.parentageLevel}) = 'parent'`);

  console.log(`Parent products: ${parents.length}`);

  const toUpdate: Array<{
    id: string;
    asin: string | null;
    sku: string | null;
    theme: string;
    fields: string[];
  }> = [];

  const noTheme: string[] = [];
  let alreadyFilled = 0;

  for (const p of parents) {
    const theme = themeFromProduct({
      variations: p.variations as Record<string, string> | null,
      otherAttributes: p.otherAttributes,
      rawColumnValues: p.rawColumnValues,
      productAttributes: p.productAttributes,
      contentSeo: p.contentSeo,
    });
    if (!theme) {
      noTheme.push(`${p.asin ?? p.sku ?? p.id}`);
      continue;
    }
    const names = parentThemeBqNames(theme);
    if (names.length === 0) {
      noTheme.push(`${p.asin ?? p.sku ?? p.id} (theme=${theme})`);
      continue;
    }

    const variationsForFill = {
      ...((p.variations as Record<string, string> | null) ?? {}),
      VariationThemeName: theme,
    };
    const updates: Record<string, unknown> = {};
    const rawValues = { ...(p.rawColumnValues ?? {}) };
    applyParentThemeFillToProductUpdates({
      product: {
        parentageLevel: "Parent",
        variations: variationsForFill,
        rawColumnValues: p.rawColumnValues,
      },
      bqName: "ParentageLevel",
      value: "Parent",
      updates,
      rawValues,
      changeLog: [],
      changedBy: "backfill-parent-theme-attrs",
      changedAt: new Date().toISOString(),
    });

    if (!updates.variations) {
      alreadyFilled++;
      continue;
    }
    toUpdate.push({
      id: p.id,
      asin: p.asin,
      sku: p.sku,
      theme,
      fields: names,
    });
  }

  console.log(`Need fill: ${toUpdate.length}`);
  console.log(`Already filled: ${alreadyFilled}`);
  console.log(`No usable theme: ${noTheme.length}`);
  if (noTheme.length > 0 && noTheme.length <= 30) {
    console.log("  ", noTheme.join(", "));
  }

  const sample = toUpdate.slice(0, 15);
  console.log("\nSample:");
  console.table(sample.map((r) => ({ asin: r.asin, sku: r.sku, theme: r.theme, fields: r.fields.join(",") })));

  if (!APPLY) {
    console.log("\nDry-run. Re-run with --apply to write.");
    process.exit(0);
  }

  const changedAt = new Date().toISOString();
  let updated = 0;

  for (const row of toUpdate) {
    const p = parents.find((x) => x.id === row.id)!;
    const updates: Record<string, unknown> = {};
    const rawValues: Record<string, string | null | undefined> = { ...(p.rawColumnValues ?? {}) };
    const changeLog = [...(p.changeLog ?? [])];
    const variationsForFill = {
      ...((p.variations as Record<string, string> | null) ?? {}),
      VariationThemeName: row.theme,
    };

    applyParentThemeFillToProductUpdates({
      product: {
        parentageLevel: "Parent",
        variations: variationsForFill,
        rawColumnValues: p.rawColumnValues,
      },
      bqName: "ParentageLevel",
      value: "Parent",
      updates,
      rawValues,
      changeLog,
      changedBy: "backfill-parent-theme-attrs",
      changedAt,
    });

    const filled = updates.variations as Record<string, string> | undefined;
    if (!filled) continue;

    // Keep other JSONB blobs from serving a stale Flavor/Size/etc.
    const productRecord = p as unknown as Record<string, Record<string, string> | null>;
    for (const blobName of JSONB_BLOBS) {
      if (blobName === "variations") continue;
      const blob = productRecord[blobName];
      if (!blob) continue;
      let touched = false;
      const next = { ...blob };
      for (const field of row.fields) {
        if (field in next && next[field] !== "Parent") {
          next[field] = "Parent";
          touched = true;
        }
      }
      if (touched) updates[blobName] = next;
    }

    await db
      .update(master)
      .set({
        ...updates,
        rawColumnValues: rawValues as Record<string, string>,
        changeLog,
        isDirty: true,
        updatedAt: new Date(),
      })
      .where(eq(master.id, row.id));
    updated++;
    if (updated % 50 === 0) console.log(`  wrote ${updated}/${toUpdate.length}`);
  }

  console.log(`\nUpdated ${updated} parent products.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
