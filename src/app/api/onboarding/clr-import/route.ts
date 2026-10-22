import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, stagedAlrLinks, stagedClrProducts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseClrRows, type ParsedClrRow } from "@/lib/clr-row-parser";
import { parseCategoryReport } from "@/lib/category-report-parser";
import { upsertCategoryDefinitions } from "@/lib/category-definitions/upsert";
import { upsertAttributesMasterFromReports } from "@/lib/attributes-master/upload";
import { planClrListingsForHub } from "@/lib/onboarding/clr-hub-upload";
import { clrRowToMasterFields } from "@/lib/clr-master-mapper";
import { loadClrAliases } from "@/lib/onboarding/clr-aliases-loader";
import { insertInheritedSeoVersions } from "@/lib/bigquery";
import {
  applyClrSeoV0ToProduct,
  extractClrSeoV0,
  hasClrSeoV0,
  importOverwriteFields,
} from "@/lib/product-excel-import";

export const maxDuration = 120;

function isAuthorizedRole(role: unknown): boolean {
  return hasAdminPowers(typeof role === "string" ? role : null) || role === "editor";
}

interface ProductTypeBucket {
  productType: string;
  count: number;
  missingRequired: number;
}

interface PreviewResponse {
  totalRows: number;
  totalMissingRequired: number;
  productTypes: ProductTypeBucket[];
  hasAlr: boolean;
  hub: {
    matched: number;
    unmatched: number;
    existing: number;
    missing: number;
  };
  listings: ReturnType<typeof planClrListingsForHub>["matched"];
  unmatchedSkus: ReturnType<typeof planClrListingsForHub>["unmatched"];
}

interface ExecuteResponse {
  staged: number;
  schemasUpserted: number;
  matchCount: number;
  created: number;
  overwritten: number;
  skippedExisting: number;
  unmatched: number;
  seoVersion0: number;
}

function parseOverwriteSkus(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (sku): sku is string => typeof sku === "string" && sku.trim() !== ""
    );
  } catch {
    return [];
  }
}

async function parseUpload(
  req: NextRequest
): Promise<
  | {
      ok: true;
      file: File;
      clientIdCode: string;
      overwriteSkus: string[];
    }
  | { ok: false; status: number; error: string }
> {
  const formData = await req.formData();
  const fileEntry = formData.get("file");
  const file = fileEntry instanceof File ? fileEntry : null;
  const clientIdCode = String(formData.get("clientIdCode") ?? "").trim();
  if (!file) return { ok: false, status: 400, error: "Missing file" };
  if (!clientIdCode) {
    return { ok: false, status: 400, error: "Missing clientIdCode" };
  }
  return {
    ok: true,
    file,
    clientIdCode,
    overwriteSkus: parseOverwriteSkus(formData.get("overwriteSkus")),
  };
}

async function loadAlrAndHub(clientIdCode: string) {
  const alrLinks = await db
    .select({
      sku: stagedAlrLinks.sku,
      asin: stagedAlrLinks.asin,
      status: stagedAlrLinks.status,
    })
    .from(stagedAlrLinks)
    .where(eq(stagedAlrLinks.clientIdCode, clientIdCode));
  const hubRows = await db
    .select({ id: master.id, sku: master.sku })
    .from(master)
    .where(eq(master.clientIdCode, clientIdCode));
  return { alrLinks, hubRows };
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAuthorizedRole(session.user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const phase = new URL(req.url).searchParams.get("phase");
  if (phase !== "preview" && phase !== "execute") {
    return NextResponse.json(
      { error: "Missing or invalid ?phase= (must be 'preview' or 'execute')" },
      { status: 400 }
    );
  }

  const upload = await parseUpload(req);
  if (!upload.ok) {
    return NextResponse.json({ error: upload.error }, { status: upload.status });
  }
  const { file, clientIdCode, overwriteSkus } = upload;

  let parsedRows: ParsedClrRow[];
  let parsedReports: ReturnType<typeof parseCategoryReport>["reports"] = [];
  try {
    const buffer = await file.arrayBuffer();
    parsedRows = parseClrRows(buffer);
    try {
      parsedReports = parseCategoryReport(buffer).reports;
    } catch (schemaErr) {
      console.warn(
        "CLR schema parse skipped; listing rows still imported:",
        schemaErr instanceof Error ? schemaErr.message : schemaErr
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Parse error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { alrLinks, hubRows } = await loadAlrAndHub(clientIdCode);
  const hubPlan = planClrListingsForHub(
    parsedRows,
    alrLinks,
    hubRows.map((row) => row.sku ?? "")
  );

  if (phase === "preview") {
    const buckets = new Map<string, ProductTypeBucket>();
    let totalMissingRequired = 0;
    for (const row of parsedRows) {
      const pt = row.productType || "UNKNOWN";
      if (!buckets.has(pt)) {
        buckets.set(pt, { productType: pt, count: 0, missingRequired: 0 });
      }
      const b = buckets.get(pt)!;
      b.count += 1;
      if (!row.requiredComplete) {
        b.missingRequired += 1;
        totalMissingRequired += 1;
      }
    }

    const body: PreviewResponse = {
      totalRows: parsedRows.length,
      totalMissingRequired,
      productTypes: Array.from(buckets.values()).toSorted((a, b) =>
        a.productType.localeCompare(b.productType)
      ),
      hasAlr: hubPlan.hasAlr,
      hub: {
        matched: hubPlan.matched.length,
        unmatched: hubPlan.unmatched.length,
        existing: hubPlan.matched.filter((row) => row.inHub).length,
        missing: hubPlan.matched.filter((row) => !row.inHub).length,
      },
      listings: hubPlan.matched,
      unmatchedSkus: hubPlan.unmatched,
    };
    return NextResponse.json(body);
  }

  await db
    .delete(stagedClrProducts)
    .where(eq(stagedClrProducts.clientIdCode, clientIdCode));

  if (parsedRows.length > 0) {
    const inserts = parsedRows.map((r) => ({
      clientIdCode,
      sku: r.sku,
      productType: r.productType,
      attributes: r.attributes,
      requiredComplete: r.requiredComplete,
    }));
    for (let i = 0; i < inserts.length; i += 200) {
      await db.insert(stagedClrProducts).values(inserts.slice(i, i + 200));
    }
  }

  let schemasUpserted = 0;
  let matchCount = 0;
  if (parsedReports.length > 0) {
    const result = await upsertCategoryDefinitions({
      clientIdCode,
      uploadedBy: session.user?.email ?? "unknown",
      parsedReports,
    });
    schemasUpserted = result.definitions.length;
    matchCount = result.matchCount;

    const uploadId = result.definitions[0]?.id;
    if (uploadId) {
      await upsertAttributesMasterFromReports({
        uploadId,
        clientIdCode,
        parsedReports,
      });
    }
  }

  const overwrite = new Set(
    overwriteSkus.map((sku) => sku.trim().toLowerCase()).filter(Boolean)
  );
  const idBySku = new Map<string, string>();
  for (const row of hubRows) {
    if (row.id && row.sku) {
      idBySku.set(row.sku.trim().toLowerCase(), row.id);
    }
  }
  const alrBySku = new Map(
    alrLinks.map((row) => [row.sku.trim().toLowerCase(), row])
  );
  const clrBySku = new Map(
    parsedRows.map((row) => [row.sku.trim().toLowerCase(), row])
  );

  let created = 0;
  let overwritten = 0;
  let skippedExisting = 0;
  const aliases = hubPlan.matched.length > 0 ? await loadClrAliases() : [];

  for (const listing of hubPlan.matched) {
    if (listing.inHub && !overwrite.has(listing.sku.trim().toLowerCase())) {
      skippedExisting += 1;
      continue;
    }
    const clr = clrBySku.get(listing.sku.trim().toLowerCase());
    const alr = alrBySku.get(listing.sku.trim().toLowerCase());
    if (!clr) continue;
    const product = applyClrSeoV0ToProduct(
      await clrRowToMasterFields(
        clr,
        { asin: listing.asin, status: alr?.status ?? null },
        aliases
      ),
      extractClrSeoV0(clr.attributes)
    );
    product.clientIdCode = clientIdCode;
    if (!product.status) product.status = alr?.status || "Active";

    if (listing.inHub) {
      const existingId = idBySku.get(listing.sku.trim().toLowerCase());
      if (!existingId) {
        skippedExisting += 1;
        continue;
      }
      await db
        .update(master)
        .set(
          importOverwriteFields(product) as Partial<typeof master.$inferInsert>
        )
        .where(eq(master.id, existingId));
      overwritten += 1;
    } else {
      product.isDirty = false;
      await db.insert(master).values(product);
      created += 1;
    }
  }

  let seoVersion0 = 0;
  const seoRows = hubPlan.matched
    .map((listing) => {
      const clr = clrBySku.get(listing.sku.trim().toLowerCase());
      if (!clr) return null;
      const seo = extractClrSeoV0(clr.attributes);
      if (!hasClrSeoV0(seo)) return null;
      return {
        ASIN: listing.asin,
        SKU: listing.sku,
        ClientIDCode: clientIdCode,
        Marketplace: "",
        ...seo,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  if (seoRows.length > 0) {
    try {
      seoVersion0 = await insertInheritedSeoVersions(seoRows);
    } catch (err) {
      console.error("Failed to save SEO version 0 from CLR onboarding:", err);
    }
  }

  const response: ExecuteResponse = {
    staged: parsedRows.length,
    schemasUpserted,
    matchCount,
    created,
    overwritten,
    skippedExisting,
    unmatched: hubPlan.unmatched.length,
    seoVersion0,
  };
  return NextResponse.json(response);
}
