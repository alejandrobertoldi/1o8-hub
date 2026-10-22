import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, aac, attributes } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { isEditorOrAbove } from "@/lib/roles";
import { mapBqRowToProduct } from "@/lib/product-mapper";
import { insertInheritedSeoVersions } from "@/lib/bigquery";
import {
  PRODUCT_IMPORT_MAX_BYTES,
  applyClrSeoV0ToProduct,
  asinSkuMarketplaceKey,
  buildHeaderToBqMap,
  clientSkuKey,
  hasClrSeoV0,
  importOverwriteFields,
  parseImportWorkbook,
  parseProductImportRecords,
  planProductImport,
  toBqRow,
} from "@/lib/product-excel-import";

export const maxDuration = 60;

const ALLOWED_EXT = [".xlsx", ".xls", ".xlsm", ".csv"];

function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
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

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditorOrAbove(session.user.role)) {
    return NextResponse.json(
      { error: "Forbidden: viewers cannot create products" },
      { status: 403 }
    );
  }

  const formData = await req.formData();
  const fileEntry = formData.get("file");
  const file = fileEntry instanceof File ? fileEntry : null;
  const clientIdCode = String(formData.get("clientIdCode") ?? "").trim();
  const overwriteSkus = parseOverwriteSkus(formData.get("overwriteSkus"));
  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > PRODUCT_IMPORT_MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 5MB." },
      { status: 400 }
    );
  }
  if (!ALLOWED_EXT.includes(fileExtension(file.name))) {
    return NextResponse.json(
      { error: "Only .xlsx, .xls, .xlsm, and .csv files are accepted" },
      { status: 400 }
    );
  }

  let parsedWorkbook;
  try {
    const buffer = await file.arrayBuffer();
    parsedWorkbook = parseImportWorkbook(new Uint8Array(buffer));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Parse error";
    return NextResponse.json(
      { error: `Failed to parse spreadsheet: ${msg}` },
      { status: 400 }
    );
  }
  const records = parsedWorkbook.records;

  const attrRows = await db
    .select({
      generalLabel: attributes.generalLabel,
      bqLabel: attributes.bqLabel,
    })
    .from(attributes);
  const headerToBq = buildHeaderToBqMap(attrRows);

  const parsed = parseProductImportRecords(records, {
    defaultClientIdCode: clientIdCode || undefined,
    headerToBq,
    requireAsin: true,
    asinHint:
      parsedWorkbook.source === "clr" ? "ASIN (column A)" : undefined,
  });
  if (parsed.valid.length === 0 && parsed.errors.length === 0) {
    return NextResponse.json(
      {
        error:
          parsedWorkbook.source === "clr"
            ? "Category Listing Report has no listing rows with a SKU."
            : "Spreadsheet is empty or has no data rows",
      },
      { status: 400 }
    );
  }
  if (
    parsedWorkbook.source === "clr" &&
    parsed.valid.length === 0 &&
    parsed.errors.some((e) => /ASIN/i.test(e.message))
  ) {
    return NextResponse.json(
      {
        error:
          "Amazon Category Listing Reports have no ASIN column. Insert a new column A, paste each listing's ASIN, delete rows you are not creating, and upload again.",
        errors: parsed.errors,
      },
      { status: 400 }
    );
  }

  const importRows = parsed.valid;

  const clientRows = await db
    .select({ code: aac.clientIdCode })
    .from(aac);
  const validClients = new Set(
    clientRows.map((r) => r.code).filter((c): c is string => !!c)
  );

  const skus = [...new Set(parsed.valid.map((r) => r.sku))];
  const existingRows =
    skus.length === 0
      ? []
      : await db
          .select({
            id: master.id,
            asin: master.asin,
            sku: master.sku,
            marketplace: master.marketplace,
            clientIdCode: master.clientIdCode,
          })
          .from(master)
          .where(inArray(master.sku, skus));

  const byAsinSkuMarketplace = new Set<string>();
  const byClientSku = new Set<string>();
  const idByClientSku = new Map<string, string>();
  for (const r of existingRows) {
    if (r.asin && r.sku && r.marketplace) {
      byAsinSkuMarketplace.add(
        asinSkuMarketplaceKey(r.asin, r.sku, r.marketplace)
      );
    }
    if (r.clientIdCode && r.sku) {
      byClientSku.add(clientSkuKey(r.clientIdCode, r.sku));
      if (r.id) idByClientSku.set(clientSkuKey(r.clientIdCode, r.sku), r.id);
    }
  }

  const plan = planProductImport(
    importRows,
    { byAsinSkuMarketplace, byClientSku },
    validClients,
    overwriteSkus
  );

  const createdIds: string[] = [];
  const overwrittenIds: string[] = [];
  const insertErrors = [...parsed.errors, ...plan.errors];
  const skippedRows = plan.skipped;

  for (const row of plan.toInsert) {
    try {
      const newProduct = applyClrSeoV0ToProduct(
        mapBqRowToProduct(toBqRow(row)),
        row.seoV0
      );
      if (!newProduct.status) newProduct.status = "Active";
      newProduct.isDirty = true;
      const [inserted] = await db
        .insert(master)
        .values(newProduct)
        .returning({ id: master.id });
      createdIds.push(inserted.id);
    } catch (err) {
      insertErrors.push({
        row: row.rowNumber,
        sheet: row.sheet,
        message: err instanceof Error ? err.message : "Failed to create product",
      });
    }
  }

  for (const row of plan.toOverwrite) {
    const existingId = idByClientSku.get(
      clientSkuKey(row.clientIdCode, row.sku)
    );
    if (!existingId) {
      insertErrors.push({
        row: row.rowNumber,
        sheet: row.sheet,
        message: "Could not find the existing Hub product to overwrite",
      });
      continue;
    }
    try {
      const mapped = applyClrSeoV0ToProduct(
        mapBqRowToProduct(toBqRow(row)),
        row.seoV0
      );
      if (!mapped.status) mapped.status = "Active";
      await db
        .update(master)
        .set(
          importOverwriteFields(mapped) as Partial<typeof master.$inferInsert>
        )
        .where(eq(master.id, existingId));
      overwrittenIds.push(existingId);
    } catch (err) {
      insertErrors.push({
        row: row.rowNumber,
        sheet: row.sheet,
        message:
          err instanceof Error ? err.message : "Failed to overwrite product",
      });
    }
  }

  let seoVersion0 = 0;
  if (parsedWorkbook.source === "clr") {
    const seoRows = parsed.valid
      .filter((row) => hasClrSeoV0(row.seoV0))
      .map((row) => ({
        ASIN: row.asin,
        SKU: row.sku,
        ClientIDCode: row.clientIdCode,
        Marketplace: row.marketplace,
        Country: toBqRow(row).Country,
        ...row.seoV0,
      }));
    try {
      seoVersion0 = await insertInheritedSeoVersions(seoRows);
    } catch (err) {
      console.error("Failed to save SEO version 0 from CLR import:", err);
    }
  }

  return NextResponse.json({
    created: createdIds.length,
    overwritten: overwrittenIds.length,
    skipped: skippedRows.length,
    failed: insertErrors.length,
    seoVersion0,
    createdIds,
    overwrittenIds,
    skippedRows,
    errors: insertErrors,
  });
}
