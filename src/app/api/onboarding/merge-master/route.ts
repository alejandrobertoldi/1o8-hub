import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  master,
  stagedAlrLinks,
  stagedClrProducts,
  type NewProduct,
} from "@/lib/db/schema";
import {
  and,
  eq,
  getTableColumns,
  isNotNull,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { clrRowToMasterFields } from "@/lib/clr-master-mapper";
import type { ParsedClrRow } from "@/lib/clr-row-parser";
import { loadClrAliases } from "@/lib/onboarding/clr-aliases-loader";

export const maxDuration = 300;

type StatusBucket = "Active" | "Inactive" | "Incomplete";
const VALID_STATUSES: StatusBucket[] = ["Active", "Inactive", "Incomplete"];

interface RequestBody {
  clientIdCode: string;
  selectedStatuses: StatusBucket[];
}

interface PreflightResponse {
  matchedTotal: number;
  matchedSelected: number;
  byStatus: { active: number; inactive: number; incomplete: number };
  dirtyCount: number;
}

interface ExecuteResponse {
  merged: number;
}

function isAuthorizedRole(role: unknown): boolean {
  return hasAdminPowers(typeof role === "string" ? role : null) || role === "editor";
}

function bucketOf(status: string | null | undefined): StatusBucket | null {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "active") return "Active";
  if (s === "inactive") return "Inactive";
  if (s === "incomplete") return "Incomplete";
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAuthorizedRole(session.user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const phase = new URL(req.url).searchParams.get("phase");
  if (phase !== "preflight" && phase !== "execute") {
    return NextResponse.json(
      { error: "Missing or invalid ?phase= (must be 'preflight' or 'execute')" },
      { status: 400 }
    );
  }

  const body = (await req.json()) as RequestBody;
  if (!body.clientIdCode) {
    return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
  }
  if (!Array.isArray(body.selectedStatuses) || body.selectedStatuses.length === 0) {
    return NextResponse.json(
      { error: "selectedStatuses must be a non-empty array" },
      { status: 400 }
    );
  }
  for (const s of body.selectedStatuses) {
    if (!VALID_STATUSES.includes(s)) {
      return NextResponse.json(
        { error: `Invalid status '${s}'. Must be one of ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
  }
  const selected = new Set(body.selectedStatuses);

  if (phase === "preflight") {
    const clrRows = await db
      .select({ sku: stagedClrProducts.sku })
      .from(stagedClrProducts)
      .where(eq(stagedClrProducts.clientIdCode, body.clientIdCode));
    const alrRows = await db
      .select({ sku: stagedAlrLinks.sku, status: stagedAlrLinks.status })
      .from(stagedAlrLinks)
      .where(eq(stagedAlrLinks.clientIdCode, body.clientIdCode));

    const clrSkus = new Set(clrRows.map((r) => r.sku));
    let matchedTotal = 0;
    let matchedSelected = 0;
    const byStatus = { active: 0, inactive: 0, incomplete: 0 };
    for (const r of alrRows) {
      if (!clrSkus.has(r.sku)) continue;
      const b = bucketOf(r.status);
      if (!b) continue;
      matchedTotal += 1;
      if (b === "Active") byStatus.active += 1;
      if (b === "Inactive") byStatus.inactive += 1;
      if (b === "Incomplete") byStatus.incomplete += 1;
      if (selected.has(b)) matchedSelected += 1;
    }

    // Dirty count: master rows for this client that have edits we'd wipe.
    // Drizzle doesn't have a clean .count(), so use a select + length.
    const dirtyRows = await db
      .select({ id: master.id })
      .from(master)
      .where(
        and(
          eq(master.clientIdCode, body.clientIdCode),
          or(
            eq(master.isDirty, true),
            and(
              isNotNull(master.changeLog),
              ne(sql`jsonb_array_length(${master.changeLog})`, 0)
            )
          )
        )
      );
    const dirtyCount = dirtyRows.length;

    const response: PreflightResponse = {
      matchedTotal,
      matchedSelected,
      byStatus,
      dirtyCount,
    };
    return NextResponse.json(response);
  }

  // phase === execute
  const clrRows = await db
    .select()
    .from(stagedClrProducts)
    .where(eq(stagedClrProducts.clientIdCode, body.clientIdCode));
  const alrRows = await db
    .select()
    .from(stagedAlrLinks)
    .where(eq(stagedAlrLinks.clientIdCode, body.clientIdCode));

  const clrBySku = new Map<string, (typeof clrRows)[number]>();
  for (const r of clrRows) clrBySku.set(r.sku, r);
  const inserts: NewProduct[] = [];

  // Load alias set once: it's small (~70 rows) and immutable for the duration
  // of this request, so hammering the DB per-row would be pointless.
  const aliases = await loadClrAliases();

  for (const link of alrRows) {
    const clr = clrBySku.get(link.sku);
    if (!clr) continue;
    const b = bucketOf(link.status);
    if (!b || !selected.has(b)) continue;
    const parsed: ParsedClrRow = {
      sku: clr.sku,
      productType: clr.productType ?? "UNKNOWN",
      attributes: clr.attributes,
      requiredComplete: clr.requiredComplete,
    };
    const product = await clrRowToMasterFields(parsed, {
      asin: link.asin,
      status: link.status,
    }, aliases);
    // Caller-set fields not derivable from CLR/ALR.
    product.clientIdCode = body.clientIdCode;
    product.isDirty = false;
    inserts.push(product);
  }

  // Upsert by (client_id_code, sku) so existing master.id values stay stable
  // across re-merges. Stable IDs mean every FK-bound child row (activity_log,
  // field_comments, aplus_sets, aplus_modules, aplus_comments, brand_story,
  // amazon_snapshots, amazon_sync_*, product_key_overrides, variation_*,
  // content_impact_snapshots, seo_projects.linked_product_id) survives a
  // re-merge instead of being silently cascade-deleted by the old wipe-and-
  // rebuild pattern.
  //
  // Wrapped in a transaction: stale-row delete + bulk upsert atomic.
  const newSkus = inserts
    .map((i) => i.sku)
    .filter((s): s is string => typeof s === "string" && s.length > 0);

  // Build the ON CONFLICT update set from every master column except identity
  // and audit-only fields. Using getTableColumns + EXCLUDED is exhaustive by
  // construction: any column added to master in the future is auto-included.
  const upsertSet = (() => {
    const cols = getTableColumns(master);
    const skip = new Set(["id", "clientIdCode", "sku", "createdAt"]);
    const out: Record<string, unknown> = {};
    for (const [key, col] of Object.entries(cols)) {
      if (skip.has(key)) continue;
      const dbName = (col as { name: string }).name;
      out[key] = sql.raw(`excluded."${dbName}"`);
    }
    out.updatedAt = sql`now()`;
    return out;
  })();

  await db.transaction(async (tx) => {
    // Step 1: delete master rows whose SKU is no longer present in the new
    // merge set (or whose sku is NULL — those can't participate in upsert).
    // Rows still in the merge set are left in place; their content is updated
    // by the upsert below.
    if (newSkus.length === 0) {
      await tx
        .delete(master)
        .where(eq(master.clientIdCode, body.clientIdCode));
    } else {
      await tx
        .delete(master)
        .where(
          and(
            eq(master.clientIdCode, body.clientIdCode),
            or(
              sql`${master.sku} IS NULL`,
              notInArray(master.sku, newSkus)
            )
          )
        );
    }

    // Step 2: bulk upsert. ON CONFLICT (client_id_code, sku) DO UPDATE keeps
    // master.id stable for existing rows and inserts new SKUs.
    if (inserts.length > 0) {
      for (let i = 0; i < inserts.length; i += 200) {
        await tx
          .insert(master)
          .values(inserts.slice(i, i + 200))
          .onConflictDoUpdate({
            target: [master.clientIdCode, master.sku],
            set: upsertSet,
          });
      }
    }
  });

  // Cleanup staging on success (outside the tx — they're append-only inputs
  // and a partial cleanup is recoverable on retry).
  await db
    .delete(stagedClrProducts)
    .where(eq(stagedClrProducts.clientIdCode, body.clientIdCode));
  await db
    .delete(stagedAlrLinks)
    .where(eq(stagedAlrLinks.clientIdCode, body.clientIdCode));

  const response: ExecuteResponse = { merged: inserts.length };
  return NextResponse.json(response);
}
