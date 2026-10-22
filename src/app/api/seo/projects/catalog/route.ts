/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { master, variations } from "@/lib/db/schema";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { serverError } from "@/lib/api-utils";

interface CatalogChild {
  id: string;
  asin: string;
  sku: string;
  title: string;
  /** Short AI title (products.summarized_title); null when not generated. */
  summarizedTitle: string | null;
  parentageLevel: string;
  flavor: string | null;
  style: string | null;
  color: string | null;
  size: string | null;
  status: string | null;
  mainImageUrl: string | null;
  variationId: string | null;
  variationGroup: string | null;
}

interface CatalogFamily {
  parentAsin: string;
  parentSku: string;
  parentTitle: string;
  variationTheme: string;
  themeAttributes: string[];
  variationId: string | null;
  /** products.id of the parent row; null when the family has no parent row loaded. */
  parentId: string | null;
  /** Listing status of the parent row; null when the family has no parent row loaded. */
  parentStatus: string | null;
  mainImageUrl: string | null;
  children: CatalogChild[];
  groups: string[];
}

const selectCols = {
  id: master.id,
  asin: master.asin,
  sku: master.sku,
  itemName: master.itemName,
  summarizedTitle: master.summarizedTitle,
  parentageLevel: master.parentageLevel,
  parentSku: master.parentSku,
  parentAsin: master.parentAsin,
  status: master.status,
  mainImageUrl: master.mainImageUrl,
  variations: master.variations,
  variationGroup: master.variationGroup,
  variationRef: master.variationRef,
} as const;

/**
 * GET /api/seo/projects/catalog?clientIdCode=X&search=optional
 * Returns products grouped by variation family for the wizard ASIN picker.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const clientIdCode = searchParams.get("clientIdCode");
    if (!clientIdCode) {
      return NextResponse.json({ error: "clientIdCode is required" }, { status: 400 });
    }

    const conditions = [eq(master.clientIdCode, clientIdCode)];

    const search = searchParams.get("search");
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(master.asin, pattern),
          ilike(master.itemName, pattern),
          ilike(master.summarizedTitle, pattern),
          ilike(master.sku, pattern)
        )!
      );
    }

    const rows = await db
      .select(selectCols)
      .from(master)
      .where(and(...conditions))
      .orderBy(sql`${master.parentageLevel} ASC NULLS LAST`, sql`${master.asin} ASC`);

    // ── Deduplicate by ASIN: prefer rows with variationRef ──
    const deduped = new Map<string, typeof rows[number]>();
    for (const row of rows) {
      const key = row.asin || row.id;
      const existing = deduped.get(key);
      if (!existing || (!existing.variationRef && row.variationRef)) {
        deduped.set(key, row);
      }
    }
    const uniqueRows = [...deduped.values()];

    // ── Load variation names for products that have variationRef ──
    const variationRefIds = [...new Set(uniqueRows.map(r => r.variationRef).filter(Boolean))] as string[];
    const variationNameMap = new Map<string, { name: string; theme: string; themeAttributes: string[]; image: string | null }>();
    if (variationRefIds.length > 0) {
      const varRows = await db.select({
        id: variations.id,
        name: variations.name,
        themeAttributes: variations.themeAttributes,
      }).from(variations).where(inArray(variations.id, variationRefIds));
      for (const v of varRows) {
        const themeAttrs = (v.themeAttributes || []) as string[];
        variationNameMap.set(v.id, {
          name: v.name,
          theme: themeAttrs.join("-"),
          themeAttributes: themeAttrs,
          image: null,
        });
      }
    }

    // ── Build family groupings ──
    const familyMap = new Map<string, CatalogFamily>();
    const standalone: CatalogChild[] = [];

    // Index parents first
    const parentByAsin = new Map<string, typeof uniqueRows[number]>();
    const parentBySku = new Map<string, typeof uniqueRows[number]>();

    for (const row of uniqueRows) {
      if (row.parentageLevel?.toLowerCase() === "parent") {
        if (row.asin) parentByAsin.set(row.asin, row);
        if (row.sku) parentBySku.set(row.sku, row);
      }
    }

    // Prefer variation builder grouping: group by variationRef when available
    // Otherwise fall back to parentage-based grouping
    for (const row of uniqueRows) {
      if (row.parentageLevel?.toLowerCase() === "parent") {
        // Parents: create family keyed by variationRef (preferred) or ASIN
        const varInfo = row.variationRef ? variationNameMap.get(row.variationRef) : null;
        const familyKey = row.variationRef || row.asin || row.sku || row.id;
        if (!familyMap.has(familyKey)) {
          const v = row.variations || {};
          familyMap.set(familyKey, {
            parentAsin: row.asin || "",
            parentSku: row.sku || "",
            parentTitle: row.itemName || row.summarizedTitle || row.asin || "",
            variationTheme: varInfo?.theme || v.VariationThemeName || "",
            themeAttributes: varInfo?.themeAttributes || [],
            variationId: row.variationRef || null,
            parentId: row.id,
            parentStatus: row.status ?? null,
            mainImageUrl: row.mainImageUrl,
            children: [],
            groups: [],
          });
        } else {
          // Rows sort "Child" before "Parent", so a child usually created this
          // family first with blank parent fields — fill them in from the parent.
          const existing = familyMap.get(familyKey)!;
          if (!existing.parentAsin) existing.parentAsin = row.asin || "";
          if (!existing.parentSku) existing.parentSku = row.sku || "";
          if (existing.parentStatus == null) existing.parentStatus = row.status ?? null;
          if (existing.parentId == null) existing.parentId = row.id;
          if (!existing.mainImageUrl) existing.mainImageUrl = row.mainImageUrl;
          if (existing.parentTitle === "Variation Group") {
            existing.parentTitle = row.itemName || row.summarizedTitle || row.asin || existing.parentTitle;
          }
        }
        continue;
      }

      const child: CatalogChild = {
        id: row.id,
        asin: row.asin || "",
        sku: row.sku || "",
        title: row.itemName || row.summarizedTitle || "",
        summarizedTitle: row.summarizedTitle || null,
        parentageLevel: row.parentageLevel || "",
        flavor: row.variations?.Flavor || null,
        style: row.variations?.Style || null,
        color: row.variations?.Color || null,
        size: row.variations?.Size || null,
        status: row.status,
        mainImageUrl: row.mainImageUrl,
        variationId: row.variations?.VariationID || null,
        variationGroup: row.variationGroup || null,
      };

      // Priority 1: Match by variationRef (variation builder grouping)
      if (row.variationRef && familyMap.has(row.variationRef)) {
        familyMap.get(row.variationRef)!.children.push(child);
        continue;
      }

      // Priority 2: Match by variationRef even if parent wasn't loaded
      if (row.variationRef) {
        const varInfo = variationNameMap.get(row.variationRef);
        if (!familyMap.has(row.variationRef)) {
          familyMap.set(row.variationRef, {
            parentAsin: "",
            parentSku: "",
            parentTitle: varInfo?.name || "Variation Group",
            variationTheme: varInfo?.theme || row.variations?.VariationThemeName || "",
            themeAttributes: varInfo?.themeAttributes || [],
            variationId: row.variationRef,
            parentId: null,
            parentStatus: null,
            mainImageUrl: null,
            children: [],
            groups: [],
          });
        }
        familyMap.get(row.variationRef)!.children.push(child);
        continue;
      }

      // Priority 3: Match by parentAsin/parentSku (legacy parentage grouping)
      let familyKey: string | null = null;
      if (row.parentAsin && parentByAsin.has(row.parentAsin)) {
        const parent = parentByAsin.get(row.parentAsin)!;
        familyKey = parent.variationRef || row.parentAsin;
      } else if (row.parentSku && parentBySku.has(row.parentSku)) {
        const parent = parentBySku.get(row.parentSku)!;
        familyKey = parent.variationRef || parent.asin || parent.sku || parent.id;
      }

      if (familyKey && familyMap.has(familyKey)) {
        familyMap.get(familyKey)!.children.push(child);
      } else if (row.parentageLevel?.toLowerCase() === "child") {
        // Orphan child — create a placeholder family
        const key = row.parentAsin || row.parentSku || `orphan-${row.id}`;
        if (!familyMap.has(key)) {
          familyMap.set(key, {
            parentAsin: row.parentAsin || "",
            parentSku: row.parentSku || "",
            parentTitle: `Family: ${row.parentAsin || row.parentSku || "Unknown"}`,
            variationTheme: row.variations?.VariationThemeName || "",
            themeAttributes: [],
            variationId: null,
            parentId: null,
            parentStatus: null,
            mainImageUrl: null,
            children: [],
            groups: [],
          });
        }
        familyMap.get(key)!.children.push(child);
      } else {
        standalone.push(child);
      }
    }

    // ── Merge duplicate families ──
    // A parent with no variationRef creates an ASIN-keyed family.
    // Its children with variationRef create a separate variationRef-keyed family.
    // Merge the ASIN-keyed family into the variationRef-keyed one.
    const parentAsinToVarKey = new Map<string, string>();
    for (const [key, family] of familyMap) {
      // variationRef keys are UUIDs; ASIN keys are not
      if (key.includes("-") && key.length > 20 && family.parentAsin) {
        // This is a variationRef-keyed family — record which parentAsin it covers
        parentAsinToVarKey.set(family.parentAsin, key);
      }
      // Also check children's parent ASINs for families without a parentAsin set
      if (key.includes("-") && key.length > 20 && !family.parentAsin) {
        for (const child of family.children) {
          const childRow = uniqueRows.find(r => r.id === child.id);
          if (childRow?.parentAsin) {
            parentAsinToVarKey.set(childRow.parentAsin, key);
            break;
          }
        }
      }
    }
    for (const [asinKey, family] of familyMap) {
      // Skip variationRef-keyed families
      if (asinKey.includes("-") && asinKey.length > 20) continue;
      const varKey = parentAsinToVarKey.get(asinKey);
      if (varKey && familyMap.has(varKey)) {
        const target = familyMap.get(varKey)!;
        // Merge children into the variationRef family
        target.children.push(...family.children);
        // Fill in parent info if the target was missing it
        if (!target.parentAsin && family.parentAsin) target.parentAsin = family.parentAsin;
        if (!target.parentSku && family.parentSku) target.parentSku = family.parentSku;
        if (target.parentStatus == null) target.parentStatus = family.parentStatus;
        if (target.parentId == null) target.parentId = family.parentId;
        if (!target.mainImageUrl && family.mainImageUrl) target.mainImageUrl = family.mainImageUrl;
        // Use the parent's title if target has a generic one
        if (target.parentTitle === "Variation Group" && family.parentTitle) {
          target.parentTitle = family.parentTitle;
        }
        familyMap.delete(asinKey);
      }
    }

    // ── Resolve remaining orphan titles ──
    // Any family still showing "Family: {ASIN}" has no variation match — try DB lookup
    const orphanAsins = [...familyMap.values()]
      .filter(f => f.parentTitle.startsWith("Family: ") && f.parentAsin)
      .map(f => f.parentAsin);
    if (orphanAsins.length > 0) {
      const parentRows = await db
        .select({ asin: master.asin, itemName: master.itemName, summarizedTitle: master.summarizedTitle })
        .from(master)
        .where(inArray(master.asin, orphanAsins));
      const titleMap = new Map(parentRows.map(p => [p.asin, p.itemName || p.summarizedTitle || ""]));
      for (const family of familyMap.values()) {
        if (!family.parentTitle.startsWith("Family: ")) continue;
        const resolved = titleMap.get(family.parentAsin);
        if (resolved) {
          family.parentTitle = resolved;
        } else if (family.children.length > 0) {
          // Derive from first child
          const theme = family.variationTheme || "Variations";
          family.parentTitle = `${family.parentAsin} (${theme})`;
        }
      }
    }

    // Compute distinct individual group tags per family
    // variationGroup is comma-separated (e.g. "5.5Flo2Pk, Fla01") — split into individual tags
    for (const family of familyMap.values()) {
      const groupSet = new Set<string>();
      for (const child of family.children) {
        if (child.variationGroup) {
          for (const tag of child.variationGroup.split(",")) {
            const trimmed = tag.trim();
            if (trimmed) groupSet.add(trimmed);
          }
        }
      }
      family.groups = Array.from(groupSet).sort();
    }

    // Only surface families that come from the Variation Builder (variationRef-keyed,
    // i.e. UUID keys). Legacy parent-ASIN / parent-SKU groupings are dropped — the
    // wizard should only present formally-locked variation groups.
    const variationBuilderFamilies = Array.from(familyMap.entries())
      .filter(([key]) => key.includes("-") && key.length > 20)
      .map(([, family]) => family);

    return NextResponse.json({
      families: variationBuilderFamilies,
      standalone,
      totalCount: uniqueRows.length,
    });
  } catch (err: unknown) {
    console.error("Catalog GET error:", err);
    return serverError(err);
  }
}
