/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse, after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, activityLog } from "@/lib/db/schema";
import { createImpactSnapshot } from "@/lib/impact-snapshots";
import { inArray, eq } from "drizzle-orm";
import { z } from "zod";
import { getCoreFieldByBqName } from "@/lib/column-registry";
import { applyParentThemeFillToProductUpdates } from "@/lib/seo/parent-variation-fill";

const bulkEditSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(200),
  /**
   * Accepted for backwards compatibility and DELIBERATELY IGNORED. The target
   * column is resolved server-side from `bqName`, because the client used to send
   * the PascalCase general_label here where a camelCase drizzle key was required.
   */
  field: z.string().nullish(),
  /** The PascalCase BQ Master column name — NOT attributes.bq_label. */
  bqName: z.string().min(1),
  value: z.string(),
});

const JSONB_FIELDS = [
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

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "viewer") {
    return NextResponse.json(
      { error: "Forbidden: viewers cannot edit" },
      { status: 403 }
    );
  }

  let body: z.infer<typeof bulkEditSchema>;
  try {
    const raw = await req.json();
    body = bulkEditSchema.parse(raw);
  } catch (e) {
    const message =
      e instanceof z.ZodError
        ? e.issues.map((i) => i.message).join(", ")
        : "Invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { productIds, bqName, value } = body;

  // Fetch all target products
  const targetProducts = await db
    .select()
    .from(master)
    .where(inArray(master.id, productIds));

  if (targetProducts.length === 0) {
    return NextResponse.json(
      { error: "No products found for the given IDs" },
      { status: 404 }
    );
  }

  let updated = 0;
  let failed = 0;
  const errors: string[] = [];
  const now = new Date();
  const changedAt = now.toISOString();
  const activityRows: Array<{
    productId: string;
    asin: string | null;
    sku: string | null;
    clientIdCode: string | null;
    itemName: string | null;
    fieldLabel: string;
    bqName: string;
    oldValue: string | null;
    newValue: string;
    changedBy: string;
    editType: string;
  }> = [];

  try {
    await db.transaction(async (tx) => {
      for (const product of targetProducts) {
        try {
          let oldValue: string | null = null;
          const updates: Record<string, unknown> = {};

          // Resolve the target column from `bqName` alone. The client's `field` is
          // ignored on purpose: the dialog used to send the PascalCase
          // general_label ("ParentageLevel") where the old `field in product`
          // check needed the camelCase drizzle key ("parentageLevel"), so every
          // core edit missed and fell through to the JSONB branch below.
          const coreField = getCoreFieldByBqName(bqName);

          if (coreField) {
            oldValue = (product as Record<string, unknown>)[
              coreField
            ] as string | null;
            updates[coreField] = value;
          } else {
            // JSONB field — find which blob has it, dedup across all blobs
            let primaryBlob: string | null = null;

            for (const blobField of JSONB_FIELDS) {
              const blob = (product as Record<string, unknown>)[
                blobField
              ] as Record<string, string> | null;
              if (blob && bqName in blob) {
                if (!primaryBlob) {
                  primaryBlob = blobField;
                  oldValue = blob[bqName] ?? null;
                  updates[blobField] = { ...blob, [bqName]: value };
                } else {
                  // Duplicate key in another blob — remove the stale copy
                  const newBlob = { ...blob };
                  delete newBlob[bqName];
                  updates[blobField] = newBlob;
                }
              }
            }

            // If not found in any blob, add to otherAttributes
            if (!primaryBlob) {
              const current =
                (product.otherAttributes as Record<string, string>) ?? {};
              oldValue = current[bqName] ?? null;
              updates.otherAttributes = { ...current, [bqName]: value };
            }
          }

          // Update rawColumnValues
          const rawValues = { ...(product.rawColumnValues ?? {}) };
          rawValues[bqName] = value;
          updates.rawColumnValues = rawValues;

          // Append to changeLog
          const changeLog = [...(product.changeLog ?? [])];
          changeLog.push({
            field: bqName,
            oldValue,
            newValue: value,
            changedBy: session.user.email!,
            changedAt,
          });

          updates.changeLog = changeLog;
          updates.isDirty = true;
          updates.updatedAt = now;

          applyParentThemeFillToProductUpdates({
            product: {
              parentageLevel: product.parentageLevel,
              variations: (product.variations as Record<string, string> | null) ?? null,
              rawColumnValues: product.rawColumnValues ?? null,
            },
            bqName,
            value,
            updates,
            rawValues,
            changeLog,
            changedBy: session.user.email!,
            changedAt,
          });
          updates.rawColumnValues = rawValues;
          updates.changeLog = changeLog;

          await tx
            .update(master)
            .set(updates)
            .where(eq(master.id, product.id));

          activityRows.push({
            productId: product.id,
            asin: product.asin,
            sku: product.sku,
            clientIdCode: product.clientIdCode,
            itemName: product.itemName,
            fieldLabel: coreField ?? bqName,
            bqName,
            oldValue,
            newValue: value,
            changedBy: session.user.email!,
            editType: "bulk",
          });
          updated++;
        } catch (err) {
          failed++;
          const msg =
            err instanceof Error ? err.message : "Unknown error";
          errors.push(
            `Product ${product.asin || product.id}: ${msg}`
          );
        }
      }
      // Batch insert activity log entries inside the transaction
      if (activityRows.length > 0) {
        await tx.insert(activityLog).values(activityRows);
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Transaction failed";
    return NextResponse.json(
      { error: `Bulk edit failed: ${msg}` },
      { status: 500 }
    );
  }

  // Revenue attribution: one snapshot per client affected. Deferred with after(),
  // not fired-and-forgotten: each call INSERTs into content_impact_snapshots, and
  // an un-awaited write is abandoned mid-protocol when Vercel freezes the sandbox,
  // pinning a Supavisor pool slot. This loop made it the worst instance in the
  // codebase — one bulk edit fanned out a wedged connection per client, against a
  // pool of max:1. See src/lib/sales-cache.awaited.test.ts.
  //
  // The whole loop sits inside a single after() so the INSERTs run sequentially
  // rather than N-at-once, and the try/catch is per-iteration because
  // createImpactSnapshot does NOT swallow its own errors — one client throwing
  // must not skip the clients after it.
  const clientCodes = [...new Set(
    targetProducts.map((p) => p.clientIdCode).filter(Boolean) as string[]
  )];
  const changedBy = session.user.email!;
  after(async () => {
    for (const code of clientCodes) {
      const count = targetProducts.filter((p) => p.clientIdCode === code).length;
      try {
        await createImpactSnapshot({
          clientIdCode: code,
          changeType: "bulk_edit",
          changeSummary: `Bulk edit: ${bqName} on ${count} product(s)`,
          changeCount: count,
          changedBy,
        });
      } catch (err) {
        console.error(`[ImpactSnapshot] bulk_edit failed for ${code}:`, err);
      }
    }
  });

  return NextResponse.json({ updated, failed, errors });
}
