/* eslint-disable react-doctor/js-cache-property-access */
/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  attributeTemplateRequests,
  categoryDefinitions,
  master,
} from "@/lib/db/schema";
import type { Product } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { driveClient } from "@/lib/drive-client";
import { sheetsClient } from "@/lib/sheets-client";
import { computeDiff, DIFF_KEY_SEP } from "@/lib/template-finalize-diff";
import { getProductFieldValue, setProductFieldValue } from "@/lib/product-mapper";
import { getAccessToken } from "@/lib/gcp-auth";
import { getAttributesForCategory } from "@/lib/category-meta-queries";
import {
  pickAttributesForLevels,
  type PickedAttributes,
} from "@/lib/template-attributes";
import {
  resolveRowIdentity,
  type MasterCandidate,
} from "@/lib/onboarding/identity-resolver";
import {
  categoryDefinitionColumns,
  type CategoryDefinitionRow,
} from "@/lib/category-definitions/columns";

// PATCH /api/attributes/template-requests/[id]/finalize
// Body (v1): { conflictResolutions?: Record<`${rowKey}${DIFF_KEY_SEP}${field}`, "sheet" | "catalog"> }
// where DIFF_KEY_SEP is the ASCII Unit Separator (U+001F). See
// @/lib/template-finalize-diff for the key encoding contract.
//
// Two operating modes — driven by record.levels.includes("Essential"):
//
//  - Legacy mode (Essential NOT in levels): unchanged from v1. Sheet columns
//    are [Product Name, ASIN, attr0, attr1, ...]. Rows lookup is ASIN-only.
//    Three-way diff drives clientEdited / conflict writes.
//
//  - Min+Necessary mode (Essential IS in levels): identity columns lead the
//    sheet [SKU, ASIN, ItemName, ProductType, attr0, ...]. Per row routing:
//      ASIN match → UPDATE (three-way diff applies)
//      SKU match within client → UPDATE (+ optional ASIN backfill)
//      No match + SKU present → INSERT (skip diff, client value wins)
//      No SKU → REJECT
//    Validation gates: SKU duplicate across sheet, Amazon-Required complete-
//    ness for INSERT rows.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    conflictResolutions?: Record<string, "sheet" | "catalog">;
  };

  const [record] = await db
    .select()
    .from(attributeTemplateRequests)
    .where(eq(attributeTemplateRequests.id, id))
    .limit(1);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.status !== "in_progress" && record.status !== "reopened") {
    return NextResponse.json({ error: `Cannot finalize request with status ${record.status}` }, { status: 400 });
  }
  if (!record.googleSheetId) {
    return NextResponse.json({ error: "No sheet associated with this request" }, { status: 400 });
  }

  const serviceAccountEmail = process.env.GCP_CLIENT_EMAIL?.trim();
  if (!serviceAccountEmail) {
    return NextResponse.json(
      { error: "GCP_CLIENT_EMAIL not configured" },
      { status: 500 }
    );
  }

  const minNecessaryMode = record.levels.includes("Essential");

  // ── Re-read sheet ──
  const defs = record.productType === "all"
    ? await db.select(categoryDefinitionColumns).from(categoryDefinitions).where(eq(categoryDefinitions.clientIdCode, record.clientIdCode))
    : await db.select(categoryDefinitionColumns).from(categoryDefinitions).where(
        and(
          eq(categoryDefinitions.clientIdCode, record.clientIdCode),
          eq(categoryDefinitions.productType, record.productType)
        )
      );

  const ranges = defs.map((d) => `${d.productType}!A6:ZZ`);
  const valueRanges = (await sheetsClient.getValues(record.googleSheetId, ranges)).valueRanges ?? [];

  // Branch the per-mode processing. The legacy branch is preserved byte-for-byte
  // (modulo the response shape change at the very end).
  if (!minNecessaryMode) {
    return finalizeLegacyMode({
      record,
      defs,
      valueRanges,
      body,
      serviceAccountEmail,
      session,
    });
  }
  return finalizeMinNecessaryMode({
    record,
    defs,
    valueRanges,
    body,
    serviceAccountEmail,
    session,
  });
}

// ───────────────────────────────────────────────────────────────
// Legacy mode (Essential NOT in record.levels)
// Identical to v1 prior to T7. Only addition: empty `inserted`/`rejected`
// arrays in the response so callers can rely on a uniform shape.
// ───────────────────────────────────────────────────────────────
async function finalizeLegacyMode(opts: {
  record: typeof attributeTemplateRequests.$inferSelect;
  defs: CategoryDefinitionRow[];
  valueRanges: Array<{ values?: string[][] }>;
  body: { conflictResolutions?: Record<string, "sheet" | "catalog"> };
  serviceAccountEmail: string;
  session: { user: { email?: string | null } };
}): Promise<NextResponse> {
  const { record, defs, valueRanges, body, serviceAccountEmail, session } = opts;

  const sheetNow: Record<string, Record<string, string>> = {};
  const catalogNow: Record<string, Record<string, string>> = {};
  const asinToProductId: Record<string, string> = {};

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const tab = valueRanges[i]?.values ?? [];
    const attrs = await getAttributesForCategory(def.marketplaceId, def.productType);
    const filtered = attrs.filter((a) => {
      if (a.requirement && record.levels.includes(a.requirement)) return true;
      if (record.levels.includes("Key") && a.isKey) return true;
      if (record.levels.includes("Essential") && a.isEssential) return true;
      return false;
    });

    for (const row of tab) {
      const asin = String(row[1] ?? "").trim();
      if (!asin) continue;
      const rec: Record<string, string> = {};
      for (let a = 0; a < filtered.length; a++) {
        rec[filtered[a].generalLabel] = String(row[2 + a] ?? "");
      }
      sheetNow[asin] = rec;
    }

    const products = await db
      .select()
      .from(master)
      .where(and(eq(master.clientIdCode, record.clientIdCode), eq(master.productType, def.productType)));
    for (const p of products) {
      const asin = getProductFieldValue(p, "ASIN") || "";
      if (!asin) continue;
      asinToProductId[asin] = p.id;
      const rec: Record<string, string> = {};
      for (const attr of filtered) {
        rec[attr.generalLabel] = getProductFieldValue(p, attr.generalLabel) || "";
      }
      catalogNow[asin] = rec;
    }
  }

  const seeded = (record.seededSnapshot ?? {}) as Record<string, Record<string, string | null>>;
  const diff = computeDiff({ seeded, sheetNow, catalogNow });

  const writes: Array<{ productId: string; field: string; newValue: string }> = [];
  for (const [key, bucket] of Object.entries(diff.bucketsByKey)) {
    if (bucket === "unchanged" || bucket === "catalogDrifted") continue;
    // Key shape is `${asin}${DIFF_KEY_SEP}${field}` — see template-finalize-diff.
    const sepIdx = key.lastIndexOf(DIFF_KEY_SEP);
    if (sepIdx < 0) continue;
    const asin = key.slice(0, sepIdx);
    const field = key.slice(sepIdx + DIFF_KEY_SEP.length);
    const productId = asinToProductId[asin];
    if (!productId) continue;
    if (bucket === "conflict" && body.conflictResolutions?.[key] === "catalog") continue;
    writes.push({ productId, field, newValue: sheetNow[asin]?.[field] ?? "" });
  }

  await db.transaction(async (tx) => {
    const byProduct = new Map<string, Record<string, string>>();
    for (const w of writes) {
      const current = byProduct.get(w.productId) ?? {};
      current[w.field] = w.newValue;
      byProduct.set(w.productId, current);
    }
    for (const [productId, patch] of byProduct) {
      await tx.execute(sql`
        UPDATE master
          SET raw_column_values = COALESCE(raw_column_values, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb
          WHERE id = ${productId}
      `);
    }
    // Atomic status flip — commits with data writes so a post-txn
    // failure can't leave the row stuck in_progress.
    await tx
      .update(attributeTemplateRequests)
      .set({
        status: "finalized",
        finalizedAt: new Date(),
        finalizedBy: session.user.email ?? "unknown",
        seededSnapshot: null,
      })
      .where(eq(attributeTemplateRequests.id, record.id));
  });

  // Post-write side effects (Sheet protect + Drive archive) can't be part
  // of the DB txn. If they fail, the row is already finalized and data is
  // safe — we surface the error as a warning so the caller can re-trigger
  // protect/archive manually without re-processing the data.
  let postProcessingWarning: string | null = null;
  try {
    await protectAndArchive({ record, defs, serviceAccountEmail, session });
  } catch (err) {
    console.error("[finalize:legacy] post-write side effects failed", { id: record.id, err });
    postProcessingWarning = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    ok: true,
    counts: diff.counts,
    written: writes.length,
    inserted: [],
    rejected: [],
    postProcessingWarning,
  });
}

// ───────────────────────────────────────────────────────────────
// Min+Necessary mode (Essential IS in record.levels)
// ───────────────────────────────────────────────────────────────
interface RejectedRow {
  productType: string;
  row: number; // sheet row index (6-based humanized: first data row = 6)
  reason: string;
}
interface InsertedRow {
  sku: string;
  productType: string;
}

async function finalizeMinNecessaryMode(opts: {
  record: typeof attributeTemplateRequests.$inferSelect;
  defs: CategoryDefinitionRow[];
  valueRanges: Array<{ values?: string[][] }>;
  body: { conflictResolutions?: Record<string, "sheet" | "catalog"> };
  serviceAccountEmail: string;
  session: { user: { email?: string | null } };
}): Promise<NextResponse> {
  const { record, defs, valueRanges, body, serviceAccountEmail, session } = opts;

  // Candidate master rows for identity resolution (client-scoped).
  const clientMasterRows = await db
    .select({ id: master.id, sku: master.sku, asin: master.asin })
    .from(master)
    .where(eq(master.clientIdCode, record.clientIdCode));
  const candidates: MasterCandidate[] = clientMasterRows.map((r) => ({
    id: r.id,
    sku: r.sku,
    asin: r.asin,
  }));

  // Per-tab attribute order MUST match the builder. pickAttributesForLevels
  // is the single source of truth for both create-Sheet and finalize.
  type TabPlan = {
    def: CategoryDefinitionRow;
    filtered: PickedAttributes["attrs"];
    rows: string[][];
  };
  const tabPlans: TabPlan[] = [];
  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const { attrs: filtered } = await pickAttributesForLevels(
      def.marketplaceId,
      def.productType,
      record.levels,
    );
    tabPlans.push({ def, filtered, rows: valueRanges[i]?.values ?? [] });
  }

  // ── Phase 1: classify rows + sheet-wide SKU duplicate detection ──
  type ClassifiedRow = {
    productType: string;
    rowIndex: number; // human row number (starting at 6)
    sku: string;
    asin: string;
    attrValues: Record<string, string>;
    action: "update" | "insert" | "reject";
    productId?: string;
    backfillAsin?: boolean;
    rejectReason?: string;
  };
  const classified: ClassifiedRow[] = [];
  const skuFirstSeen = new Map<string, { productType: string; rowIndex: number }>();
  const duplicateSkuErrors: RejectedRow[] = [];

  for (const plan of tabPlans) {
    // First 4 columns are identity (SKU, ASIN, ItemName, ProductType). Then attrs.
    // Sanity check: pickAttributesForLevels prepends identity cols in this mode.
    // If it ever stops doing so, the slice math is wrong — fail loud.
    const expectIdentity = ["SKU", "ASIN", "ItemName", "ProductType"];
    for (let k = 0; k < expectIdentity.length; k++) {
      if (plan.filtered[k]?.generalLabel !== expectIdentity[k]) {
        return NextResponse.json(
          {
            error: `Internal layout error: expected identity column ${expectIdentity[k]} at index ${k} for productType ${plan.def.productType}`,
          },
          { status: 500 }
        );
      }
    }

    for (let r = 0; r < plan.rows.length; r++) {
      const row = plan.rows[r];
      const rowIndex = 6 + r; // sheet row range starts at A6
      const sku = String(row[0] ?? "").trim();
      const asin = String(row[1] ?? "").trim();
      // Skip totally blank rows
      if (!sku && !asin && row.every((c) => String(c ?? "").trim() === "")) continue;

      // Capture attr values for cols 4+ (identity is 0..3).
      const attrValues: Record<string, string> = {};
      for (let a = 4; a < plan.filtered.length; a++) {
        attrValues[plan.filtered[a].generalLabel] = String(row[a] ?? "");
      }

      // SKU duplicate detection runs across ALL tabs.
      if (sku) {
        const seen = skuFirstSeen.get(sku);
        if (seen) {
          duplicateSkuErrors.push({
            productType: plan.def.productType,
            row: rowIndex,
            reason: `Duplicate SKU "${sku}" — first seen at ${seen.productType} row ${seen.rowIndex}`,
          });
          continue;
        }
        skuFirstSeen.set(sku, { productType: plan.def.productType, rowIndex });
      }

      const resolution = resolveRowIdentity({ sku, asin }, candidates);
      if (resolution.action === "update") {
        classified.push({
          productType: plan.def.productType,
          rowIndex,
          sku,
          asin,
          attrValues,
          action: "update",
          productId: resolution.productId,
          backfillAsin: resolution.backfillAsin,
        });
      } else if (resolution.action === "insert") {
        classified.push({
          productType: plan.def.productType,
          rowIndex,
          sku,
          asin,
          attrValues,
          action: "insert",
        });
      } else {
        classified.push({
          productType: plan.def.productType,
          rowIndex,
          sku,
          asin,
          attrValues,
          action: "reject",
          rejectReason: `missing SKU`,
        });
      }
    }
  }

  if (duplicateSkuErrors.length > 0) {
    return NextResponse.json(
      {
        error: "Duplicate SKUs detected in submission",
        rejected: duplicateSkuErrors,
      },
      { status: 400 }
    );
  }

  // ── Phase 2: Amazon-Required validation for INSERT rows ──
  // Build a per-productType list of Required generalLabels (excluding the
  // identity cols, which are SKU/ASIN/ItemName/ProductType — SKU is already
  // guaranteed non-empty for inserts, but the others must be filled).
  const requiredByType = new Map<string, string[]>();
  for (const plan of tabPlans) {
    const required = plan.filtered
      .filter((a) => a.requirement === "Required")
      .map((a) => a.generalLabel);
    requiredByType.set(plan.def.productType, required);
  }

  const rejected: RejectedRow[] = [];
  const inserts: ClassifiedRow[] = [];
  const updates: ClassifiedRow[] = [];

  for (const c of classified) {
    if (c.action === "reject") {
      rejected.push({ productType: c.productType, row: c.rowIndex, reason: c.rejectReason ?? "rejected" });
      continue;
    }
    if (c.action === "insert") {
      // Validate Amazon-Required completeness. ItemName + ProductType count.
      const reqList = requiredByType.get(c.productType) ?? [];
      const missing: string[] = [];
      // ItemName (col 2) is always required for new master rows — it's the
      // human-readable identifier; the column may not carry requirement="Required"
      // in attributes metadata, but Hub needs it.
      // We treat the canonical four identity cols this way:
      //   SKU — already guaranteed (would be reject otherwise)
      //   ASIN — nullable, may be empty for brand-new listings
      //   ItemName — required
      //   ProductType — auto-filled from tab title if blank
      // (See spec §4.3 step 4.)
      // Additionally enforce Amazon-Required attribute completeness.
      for (const field of reqList) {
        const v = (c.attrValues[field] ?? "").trim();
        if (!v) missing.push(field);
      }
      if (missing.length > 0) {
        rejected.push({
          productType: c.productType,
          row: c.rowIndex,
          reason: `Missing Amazon-Required fields: ${missing.join(", ")}`,
        });
        continue;
      }
      inserts.push(c);
      continue;
    }
    updates.push(c);
  }

  // ── Phase 3: build the UPDATE write set via three-way diff ──
  // For UPDATE rows we honor the existing diff/conflict semantics. Build the
  // sheetNow/catalogNow/asinToProductId maps but keyed by productId-derived
  // pseudo-key. Existing computeDiff is asin-keyed; to avoid restructuring it
  // we re-use ASIN keys for rows that have an ASIN, and synthesize a stable
  // pseudo-key (`sku:<sku>`) for ASIN-less UPDATE rows.
  const sheetNow: Record<string, Record<string, string>> = {};
  const catalogNow: Record<string, Record<string, string>> = {};
  const keyToProductId: Record<string, string> = {};

  // Need catalog values for the productIds being touched, per tab's attrs.
  const productIdsToFetch = new Set<string>();
  for (const u of updates) if (u.productId) productIdsToFetch.add(u.productId);
  const productsById = new Map<string, Product>();
  if (productIdsToFetch.size > 0) {
    const allClientProducts = await db
      .select()
      .from(master)
      .where(eq(master.clientIdCode, record.clientIdCode));
    for (const p of allClientProducts) {
      if (productIdsToFetch.has(p.id)) productsById.set(p.id, p);
    }
  }

  // Build per-productType filtered attr list so we can write catalogNow.
  const filteredByType = new Map<string, TabPlan["filtered"]>();
  for (const plan of tabPlans) filteredByType.set(plan.def.productType, plan.filtered);

  // Synthetic key prefix for SKU-only UPDATE rows (no ASIN). Uses the same
  // sentinel as DIFF_KEY_SEP so the rowKey can never collide with an ASIN
  // literal and never accidentally contains the rowKey/field separator.
  const SKU_KEY_PREFIX = `sku${DIFF_KEY_SEP}`;
  for (const u of updates) {
    if (!u.productId) continue;
    const key = u.asin ? u.asin : `${SKU_KEY_PREFIX}${u.sku}`;
    keyToProductId[key] = u.productId;
    sheetNow[key] = u.attrValues;
    const product = productsById.get(u.productId);
    const filtered = filteredByType.get(u.productType) ?? [];
    const catalogRec: Record<string, string> = {};
    if (product) {
      for (let a = 4; a < filtered.length; a++) {
        catalogRec[filtered[a].generalLabel] =
          getProductFieldValue(product, filtered[a].generalLabel) || "";
      }
    }
    catalogNow[key] = catalogRec;
  }

  const seeded = (record.seededSnapshot ?? {}) as Record<string, Record<string, string | null>>;
  const diff = computeDiff({ seeded, sheetNow, catalogNow });

  const writes: Array<{ productId: string; field: string; newValue: string }> = [];
  for (const [key, bucket] of Object.entries(diff.bucketsByKey)) {
    if (bucket === "unchanged" || bucket === "catalogDrifted") continue;
    // Key shape is `${rowKey}${DIFF_KEY_SEP}${field}`. The separator is an
    // ASCII Unit Separator (U+001F) guaranteed not to appear in real ASINs,
    // SKUs, or attribute generalLabels — so a simple lastIndexOf is safe even
    // when the rowKey itself encodes a SKU via SKU_KEY_PREFIX.
    const sepIdx = key.lastIndexOf(DIFF_KEY_SEP);
    if (sepIdx < 0) continue;
    const rowKey = key.slice(0, sepIdx);
    const field = key.slice(sepIdx + DIFF_KEY_SEP.length);
    const productId = keyToProductId[rowKey];
    if (!productId) continue;
    if (bucket === "conflict" && body.conflictResolutions?.[key] === "catalog") continue;
    writes.push({ productId, field, newValue: sheetNow[rowKey]?.[field] ?? "" });
  }

  // ── Phase 4: transactionally INSERT + UPDATE ──
  const inserted: InsertedRow[] = [];
  await db.transaction(async (tx) => {
    // INSERTs
    for (const ins of inserts) {
      // Build a fresh product object via setProductFieldValue.
      // Start from an empty Product-shaped stub; setProductFieldValue returns a
      // Partial<Product> patch each call which we shallow-merge.
      let acc: Record<string, unknown> = {
        clientIdCode: record.clientIdCode,
        sku: ins.sku,
        asin: ins.asin || null,
        productType: ins.productType,
      };
      // Identity cols 2 (ItemName) and 3 (ProductType) — also pull values
      // from cols 2/3 of the original row. We already excluded them from
      // attrValues (which is cols 4+), so re-extract them from the plan.
      const plan = tabPlans.find((p) => p.def.productType === ins.productType);
      if (plan) {
        const sheetRow = plan.rows[ins.rowIndex - 6] ?? [];
        const itemName = String(sheetRow[2] ?? "").trim();
        const prodTypeCell = String(sheetRow[3] ?? "").trim();
        if (itemName) {
          const patch = setProductFieldValue(acc as Product, "ItemName", itemName);
          acc = { ...acc, ...patch };
        }
        // Sheet ProductType cell is ignored: the tab title is authoritative.
        // If the operator pasted a row from another tab, the value silently
        // follows the tab placement. Acceptable trade-off; no warning emitted.
        void prodTypeCell;
      }
      // Apply each filtered (col 4+) attribute through setProductFieldValue.
      for (const [field, value] of Object.entries(ins.attrValues)) {
        const trimmed = (value ?? "").trim();
        const patch = setProductFieldValue(acc as Product, field, trimmed === "" ? null : trimmed);
        acc = { ...acc, ...patch };
      }
      // Stamp raw_column_values too so the row carries its sheet provenance
      // alongside the categorized blobs.
      acc.rawColumnValues = {
        ...((acc.rawColumnValues as Record<string, string> | undefined) ?? {}),
        SKU: ins.sku,
        ASIN: ins.asin || "",
        ProductType: ins.productType,
        ...ins.attrValues,
      };
      acc.isDirty = false;
      acc.changeLog = [];

      await tx.insert(master).values(acc as typeof master.$inferInsert);
      inserted.push({ sku: ins.sku, productType: ins.productType });
    }

    // UPDATEs (raw_column_values JSONB merge per productId)
    const byProduct = new Map<string, Record<string, string>>();
    for (const w of writes) {
      const current = byProduct.get(w.productId) ?? {};
      current[w.field] = w.newValue;
      byProduct.set(w.productId, current);
    }
    for (const [productId, patch] of byProduct) {
      await tx.execute(sql`
        UPDATE master
          SET raw_column_values = COALESCE(raw_column_values, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb
          WHERE id = ${productId}
      `);
    }
    // ASIN backfills on SKU-matched updates that brought a new ASIN.
    for (const u of updates) {
      if (u.action === "update" && u.backfillAsin && u.productId && u.asin) {
        await tx
          .update(master)
          .set({ asin: u.asin })
          .where(eq(master.id, u.productId));
      }
    }
    // Atomic status flip — commits with the INSERTs/UPDATEs so a post-txn
    // failure can't leave the row stuck in_progress.
    await tx
      .update(attributeTemplateRequests)
      .set({
        status: "finalized",
        finalizedAt: new Date(),
        finalizedBy: session.user.email ?? "unknown",
        seededSnapshot: null,
      })
      .where(eq(attributeTemplateRequests.id, record.id));
  });

  // Post-write side effects (Sheet protect + Drive archive) can't be part
  // of the DB txn. If they fail, the row is already finalized and data is
  // safe — we surface the error as a warning so the caller can re-trigger
  // protect/archive manually without re-processing the data.
  let postProcessingWarning: string | null = null;
  try {
    await protectAndArchive({ record, defs, serviceAccountEmail, session });
  } catch (err) {
    console.error("[finalize:min-necessary] post-write side effects failed", { id: record.id, err });
    postProcessingWarning = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    ok: true,
    counts: diff.counts,
    written: writes.length,
    inserted,
    rejected,
    postProcessingWarning,
  });
}

// ───────────────────────────────────────────────────────────────
// Shared finalization side-effects: protect data ranges and archive
// the Sheet. The `attribute_template_requests.status` flip happens
// INSIDE the DB transaction in each finalize mode so it commits
// atomically with the data writes — never here. If this function
// throws, callers should catch and surface as a postProcessingWarning
// (data already committed; sheet may need manual protect/archive).
// ───────────────────────────────────────────────────────────────
async function protectAndArchive(opts: {
  record: typeof attributeTemplateRequests.$inferSelect;
  defs: CategoryDefinitionRow[];
  serviceAccountEmail: string;
  session: { user: { email?: string | null } };
}): Promise<void> {
  const { record, defs, serviceAccountEmail, session } = opts;
  if (!record.googleSheetId) return;

  const protectRequests = defs.map((def) => ({
    addProtectedRange: {
      protectedRange: {
        range: { sheetId: undefined, startRowIndex: 5 },
        description: `Finalized ${new Date().toISOString().split("T")[0]} by ${session.user.email ?? "unknown"}`,
        editors: { users: [serviceAccountEmail] },
      },
    },
    _defProductType: def.productType,
  }));

  const meta = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${record.googleSheetId}?fields=sheets.properties(sheetId,title)`,
    {
      headers: {
        Authorization: `Bearer ${await getAccessToken([
          "https://www.googleapis.com/auth/spreadsheets",
        ])}`,
      },
    }
  ).then((r) => r.json() as Promise<{ sheets: Array<{ properties: { sheetId: number; title: string } }> }>);

  const titleToId: Record<string, number> = {};
  for (const s of meta.sheets ?? []) titleToId[s.properties.title] = s.properties.sheetId;

  const resolvedProtects = protectRequests
    .map((p) => {
      const sid = titleToId[p._defProductType];
      if (sid === undefined) return null;
      return {
        addProtectedRange: {
          protectedRange: {
            range: { sheetId: sid, startRowIndex: 5 },
            description: p.addProtectedRange.protectedRange.description,
            editors: p.addProtectedRange.protectedRange.editors,
          },
        },
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;

  if (resolvedProtects.length > 0) {
    await sheetsClient.batchUpdate(record.googleSheetId, resolvedProtects);
  }

  if (record.archiveFolderId && record.driveFolderId) {
    await driveClient.moveFile(record.googleSheetId, record.archiveFolderId, record.driveFolderId);
  }
}
