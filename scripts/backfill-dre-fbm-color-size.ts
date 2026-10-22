/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Copy Color + Size from FBA twins onto Dreamiere FBM listings, matched by ASIN.
 *
 * Usage:
 *   npx tsx scripts/backfill-dre-fbm-color-size.ts          # dry-run
 *   npx tsx scripts/backfill-dre-fbm-color-size.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, sql } from "drizzle-orm";
import { computeThemeSummarizedTitle } from "../src/lib/computed-fields";

const APPLY = process.argv.includes("--apply");
const CLIENT = "DRE_SC_US";

type Variations = Record<string, string> | null;

function blank(v: string | null | undefined): boolean {
  return v == null || v.trim() === "";
}

async function main() {
  const { db } = await import("../src/lib/db");
  const { master, variations } = await import("../src/lib/db/schema");

  const fbmRows = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      summarizedTitle: master.summarizedTitle,
      parentageLevel: master.parentageLevel,
      variations: master.variations,
      rawColumnValues: master.rawColumnValues,
      changeLog: master.changeLog,
      variationName: variations.name,
    })
    .from(master)
    .leftJoin(variations, eq(master.variationRef, variations.id))
    .where(
      and(
        eq(master.clientIdCode, CLIENT),
        sql`${master.sku} ILIKE '%FBM'`,
        sql`${master.asin} IS NOT NULL AND ${master.asin} <> ''`
      )
    );

  const donors = await db
    .select({
      asin: master.asin,
      sku: master.sku,
      variations: master.variations,
    })
    .from(master)
    .where(
      and(
        eq(master.clientIdCode, CLIENT),
        sql`${master.sku} NOT ILIKE '%FBM'`,
        sql`${master.asin} IS NOT NULL AND ${master.asin} <> ''`,
        sql`(
          NULLIF(${master.variations}->>'Color', '') IS NOT NULL
          OR NULLIF(${master.variations}->>'Size', '') IS NOT NULL
        )`
      )
    );

  const donorByAsin = new Map<string, { sku: string | null; color: string | null; size: string | null }>();
  const conflicts = new Set<string>();
  for (const d of donors) {
    if (!d.asin) continue;
    const v = (d.variations ?? {}) as Record<string, string>;
    const color = v.Color?.trim() || null;
    const size = v.Size?.trim() || null;
    const prev = donorByAsin.get(d.asin);
    if (prev) {
      if ((color && prev.color && color !== prev.color) || (size && prev.size && size !== prev.size)) {
        conflicts.add(d.asin);
      }
      continue;
    }
    donorByAsin.set(d.asin, { sku: d.sku, color, size });
  }

  const toUpdate: Array<{
    id: string;
    fbmSku: string | null;
    donorSku: string | null;
    asin: string;
    color: string | null;
    size: string | null;
    title: string;
  }> = [];
  let alreadyFilled = 0;
  let noDonor = 0;
  let skippedConflict = 0;

  for (const f of fbmRows) {
    const fv = (f.variations ?? {}) as Record<string, string>;
    const needsColor = blank(fv.Color);
    const needsSize = blank(fv.Size);
    if (!needsColor && !needsSize) {
      alreadyFilled++;
      continue;
    }
    if (!f.asin || conflicts.has(f.asin)) {
      if (f.asin && conflicts.has(f.asin)) skippedConflict++;
      else noDonor++;
      continue;
    }
    const donor = donorByAsin.get(f.asin);
    if (!donor || (blank(donor.color) && blank(donor.size))) {
      noDonor++;
      continue;
    }
    const color = needsColor ? donor.color : fv.Color;
    const size = needsSize ? donor.size : fv.Size;
    const theme = fv.VariationThemeName ?? null;
    const title = computeThemeSummarizedTitle(theme, f.variationName, {
      Color: color,
      Size: size,
      Flavor: fv.Flavor ?? null,
      Style: fv.Style ?? null,
    });
    toUpdate.push({
      id: f.id,
      fbmSku: f.sku,
      donorSku: donor.sku,
      asin: f.asin,
      color,
      size,
      title,
    });
  }

  console.log(`Dreamiere FBM listings: ${fbmRows.length}`);
  console.log(`Need Color/Size copy: ${toUpdate.length}`);
  console.log(`Already filled: ${alreadyFilled}`);
  console.log(`No donor: ${noDonor}`);
  console.log(`Conflicting ASINs skipped: ${skippedConflict} (${conflicts.size} ASINs)`);
  console.log("\nSample:");
  console.table(
    toUpdate.slice(0, 12).map((r) => ({
      fbm: r.fbmSku,
      donor: r.donorSku,
      color: r.color,
      size: r.size,
    }))
  );

  if (!APPLY) {
    console.log("\nDry-run. Re-run with --apply to write.");
    process.exit(0);
  }

  const changedAt = new Date().toISOString();
  let updated = 0;
  const byId = new Map(fbmRows.map((r) => [r.id, r]));

  for (const row of toUpdate) {
    const f = byId.get(row.id)!;
    const fv = { ...((f.variations ?? {}) as Record<string, string>) };
    if (row.color) fv.Color = row.color;
    if (row.size) fv.Size = row.size;
    const raw = { ...(f.rawColumnValues ?? {}) };
    if (row.color) raw.Color = row.color;
    if (row.size) raw.Size = row.size;
    if (row.title) raw.SummarizedTitle = row.title;

    const changeLog = [...(f.changeLog ?? [])];
    const fvBefore = (f.variations ?? {}) as Record<string, string>;
    if (row.color && fvBefore.Color !== row.color) {
      changeLog.push({
        field: "Color",
        oldValue: fvBefore.Color ?? null,
        newValue: row.color,
        changedBy: "backfill-dre-fbm-color-size",
        changedAt,
      });
    }
    if (row.size && fvBefore.Size !== row.size) {
      changeLog.push({
        field: "Size",
        oldValue: fvBefore.Size ?? null,
        newValue: row.size,
        changedBy: "backfill-dre-fbm-color-size",
        changedAt,
      });
    }

    await db
      .update(master)
      .set({
        variations: fv as Variations,
        rawColumnValues: raw,
        summarizedTitle: row.title || f.summarizedTitle,
        changeLog,
        isDirty: true,
        updatedAt: new Date(),
      })
      .where(eq(master.id, row.id));
    updated++;
    if (updated % 50 === 0) console.log(`  wrote ${updated}/${toUpdate.length}`);
  }

  console.log(`\nUpdated ${updated} FBM listings.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
