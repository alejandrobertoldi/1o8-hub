/**
 * Parse and plan a product-catalog Excel/CSV import.
 *
 * Required columns (aliases accepted): ASIN, SKU, Marketplace.
 * Client can come from the file or from the dialog selection.
 * Extra columns that match a known BQ name, core label, or Hub
 * generalLabel are passed through to mapBqRowToProduct.
 */
import * as XLSX from "xlsx";
import { CORE_COLUMNS } from "./column-registry";
import type { BqRow } from "./product-mapper";
import type { NewProduct } from "./db/schema";

export const PRODUCT_IMPORT_MARKETPLACES = [
  "amazon.com",
  "amazon.ca",
  "amazon.co.uk",
  "amazon.de",
  "amazon.co.jp",
] as const;

export type ProductImportMarketplace =
  (typeof PRODUCT_IMPORT_MARKETPLACES)[number];

export const PRODUCT_IMPORT_MAX_ROWS = 500;
export const PRODUCT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export const PRODUCT_IMPORT_IDENTITY_HEADERS = [
  "ASIN",
  "SKU",
  "Marketplace",
  "ProductType",
] as const;

const SKIP_SHEET_NAMES = new Set(["instructions", "valid values", "validvalues"]);

const IDENTITY_ATTR_KEYS = new Set([
  "asin",
  "sku",
  "marketplace",
  "producttype",
  "clientidcode",
  "clientcode",
  "client",
]);

const MARKETPLACE_ID_TO_DOMAIN: Record<string, ProductImportMarketplace> = {
  ATVPDKIKX0DER: "amazon.com",
  A2EUQ1WTGCTBG2: "amazon.ca",
  A1F83G8C2ARO7P: "amazon.co.uk",
  A1PA6795UKMFR9: "amazon.de",
  A1VC38T7YXB528: "amazon.co.jp",
};

export type ClrSeoV0 = {
  ItemName?: string;
  ProductDescription?: string;
  DetailedBulletPoint1?: string;
  DetailedBulletPoint2?: string;
  DetailedBulletPoint3?: string;
  DetailedBulletPoint4?: string;
  DetailedBulletPoint5?: string;
  GenericKeyword1?: string;
  GenericKeyword2?: string;
  GenericKeyword3?: string;
  GenericKeyword4?: string;
  GenericKeyword5?: string;
};

export type ImportRow = {
  rowNumber: number;
  sheet: string;
  asin: string;
  sku: string;
  clientIdCode: string;
  marketplace: ProductImportMarketplace;
  extra: BqRow;
  seoV0?: ClrSeoV0;
};

export type ImportIssue = {
  row: number;
  sheet?: string;
  message: string;
};

export type ParseProductImportResult = {
  valid: ImportRow[];
  errors: ImportIssue[];
};

export type ParseProductImportOptions = {
  defaultClientIdCode?: string;
  /** normalizeKey(header) → BQ column name */
  headerToBq?: Record<string, string>;
  /** CLR listings often have UPC/GTIN instead of ASIN. */
  requireAsin?: boolean;
  /** Shown in the missing-field error, e.g. "ASIN (column A)". */
  asinHint?: string;
};

export type ImportWorkbookSource = "clr" | "sheet";

export type ImportWorkbookParse = {
  source: ImportWorkbookSource;
  records: WorkbookRecord[];
};

export type ClrSkuDiff = {
  existing: string[];
  missing: string[];
};

export type AlrAsinMatch = {
  matched: Array<{ sku: string; asin: string }>;
  unmatched: string[];
};

export type PlannedSkip = ImportIssue & {
  reason: "duplicate" | "unknown_client" | "no_asin";
};

export type PlanProductImportResult = {
  toInsert: ImportRow[];
  toOverwrite: ImportRow[];
  skipped: PlannedSkip[];
  errors: ImportIssue[];
};

export type WorkbookRecord = {
  sheet: string;
  rowNumber: number;
  values: Record<string, string>;
};

export type TemplateAttribute = {
  generalLabel: string;
  referenceGroup: string;
  requirement: string | null;
  isKey: boolean;
  sortOrder?: number | null;
  groupName?: string | null;
};

export type TemplateCategorySheet = {
  productType: string;
  marketplace: ProductImportMarketplace;
  attributes: TemplateAttribute[];
};

const MARKETPLACE_ALIASES: Record<string, ProductImportMarketplace> = {
  "amazon.com": "amazon.com",
  amazoncom: "amazon.com",
  us: "amazon.com",
  usa: "amazon.com",
  unitedstates: "amazon.com",
  "amazon.ca": "amazon.ca",
  amazonca: "amazon.ca",
  ca: "amazon.ca",
  canada: "amazon.ca",
  "amazon.co.uk": "amazon.co.uk",
  amazoncouk: "amazon.co.uk",
  uk: "amazon.co.uk",
  gb: "amazon.co.uk",
  unitedkingdom: "amazon.co.uk",
  "amazon.de": "amazon.de",
  amazonde: "amazon.de",
  de: "amazon.de",
  germany: "amazon.de",
  "amazon.co.jp": "amazon.co.jp",
  amazoncojp: "amazon.co.jp",
  jp: "amazon.co.jp",
  japan: "amazon.co.jp",
};

const COUNTRY_FOR_MARKETPLACE: Record<ProductImportMarketplace, string> = {
  "amazon.com": "US",
  "amazon.ca": "CA",
  "amazon.co.uk": "UK",
  "amazon.de": "DE",
  "amazon.co.jp": "JP",
};

const REQUIRED_FIELDS = ["asin", "sku", "clientidcode", "marketplace"] as const;

const HUB_IDENTITY_COLUMNS: Array<{
  generalLabel: (typeof PRODUCT_IMPORT_IDENTITY_HEADERS)[number];
  requirement: string | null;
}> = [
  { generalLabel: "ASIN", requirement: "Required" },
  { generalLabel: "SKU", requirement: "Required" },
  { generalLabel: "Marketplace", requirement: "Required" },
  { generalLabel: "ProductType", requirement: null },
];

const HEADER_ALIASES: Record<string, string> = {
  asin: "asin",
  sku: "sku",
  clientidcode: "clientidcode",
  clientcode: "clientidcode",
  clientid: "clientidcode",
  client: "clientidcode",
  marketplace: "marketplace",
};

const EXTRA_ALIASES: Record<string, string> = {
  brand: "BrandName",
  title: "ItemName",
};

function buildExtraHeaderMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const col of CORE_COLUMNS) {
    map.set(normalizeKey(col.bqName), col.bqName);
    map.set(normalizeKey(col.label), col.bqName);
  }
  return map;
}

const EXTRA_HEADER_TO_BQ = buildExtraHeaderMap();

export function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function cellStr(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

const CLR_SEO_JSONB_FIELDS = [
  "ProductDescription",
  "DetailedBulletPoint1",
  "DetailedBulletPoint2",
  "DetailedBulletPoint3",
  "DetailedBulletPoint4",
  "DetailedBulletPoint5",
  "GenericKeyword1",
  "GenericKeyword2",
  "GenericKeyword3",
  "GenericKeyword4",
  "GenericKeyword5",
] as const;

function amazonFieldIndex(key: string, prefix: string): number | null {
  const lower = key.toLowerCase();
  if (!lower.startsWith(prefix)) return null;
  const match = key.match(/#(\d+)\.value$/i);
  if (!match) return null;
  const index = Number(match[1]);
  if (index < 1 || index > 5) return null;
  return index;
}

function labeledIndex(normalized: string, bases: string[]): number | null {
  for (const base of bases) {
    if (normalized === base) return 1;
    if (!normalized.startsWith(base)) continue;
    const rest = normalized.slice(base.length);
    if (/^\d+$/.test(rest)) {
      const index = Number(rest);
      if (index >= 1 && index <= 5) return index;
    }
  }
  return null;
}

function isAmazonFieldId(key: string): boolean {
  return (
    key.startsWith("::") ||
    key.includes("[marketplace_id=") ||
    /#\d+\.value$/i.test(key)
  );
}

export function hasClrSeoV0(seo: ClrSeoV0 | undefined): boolean {
  if (!seo) return false;
  return Object.values(seo).some((value) => Boolean(value?.trim()));
}

/**
 * Map Category Listing Report listing-copy columns onto Hub SEO version 0.
 * Version 0 is the inherited Amazon copy from client onboarding.
 *
 * Hub "Title" (Amazon Sync) is ItemName — there is no separate Title column.
 */
export function extractClrSeoV0(values: Record<string, string>): ClrSeoV0 {
  const out: ClrSeoV0 = {};
  let itemName = "";
  let titleFallback = "";
  const bullets: string[] = ["", "", "", "", ""];
  const keywords: string[] = ["", "", "", "", ""];

  const apply = (key: string, raw: string, fieldIds: boolean) => {
    const value = cellStr(raw);
    if (!value) return;
    if (isAmazonFieldId(key) !== fieldIds) return;

    const normalized = normalizeKey(key);
    const lower = key.toLowerCase();

    if (lower.startsWith("item_name[") || normalized === "itemname") {
      itemName = value;
      return;
    }
    if (key === "::title" || normalized === "title") {
      if (!titleFallback) titleFallback = value;
      return;
    }
    if (
      lower.startsWith("product_description[") ||
      normalized === "productdescription"
    ) {
      out.ProductDescription = value;
      return;
    }

    const bulletField = amazonFieldIndex(key, "bullet_point");
    if (bulletField) {
      bullets[bulletField - 1] = value;
      return;
    }
    const bulletLabel = labeledIndex(normalized, ["bulletpoint"]);
    if (bulletLabel) {
      bullets[bulletLabel - 1] = value;
      return;
    }

    const keywordField = amazonFieldIndex(key, "generic_keyword");
    if (keywordField) {
      keywords[keywordField - 1] = value;
      return;
    }
    const keywordLabel = labeledIndex(normalized, [
      "generickeywords",
      "generickeyword",
    ]);
    if (keywordLabel) {
      keywords[keywordLabel - 1] = value;
    }
  };

  for (const [key, raw] of Object.entries(values)) apply(key, raw, false);
  for (const [key, raw] of Object.entries(values)) apply(key, raw, true);

  const resolvedName = itemName || titleFallback;
  if (resolvedName) out.ItemName = resolvedName;
  bullets.forEach((value, i) => {
    if (value) out[`DetailedBulletPoint${i + 1}` as keyof ClrSeoV0] = value;
  });
  keywords.forEach((value, i) => {
    if (value) out[`GenericKeyword${i + 1}` as keyof ClrSeoV0] = value;
  });
  return out;
}

export function applyClrSeoV0ToProduct(
  product: NewProduct,
  seo: ClrSeoV0 | undefined
): NewProduct {
  if (!hasClrSeoV0(seo)) return product;
  const next: NewProduct = { ...product };
  const contentSeo = { ...(next.contentSeo ?? {}) };
  const other = { ...(next.otherAttributes ?? {}) };
  const raw = { ...(next.rawColumnValues ?? {}) };

  if (seo!.ItemName) {
    next.itemName = seo!.ItemName;
    raw.ItemName = seo!.ItemName;
  }
  for (const field of CLR_SEO_JSONB_FIELDS) {
    const value = seo![field];
    if (!value) continue;
    contentSeo[field] = value;
    raw[field] = value;
    delete other[field];
  }
  contentSeo.SEOVersionNumber = "0";
  raw.SEOVersionNumber = "0";
  next.contentSeo = contentSeo;
  next.otherAttributes = Object.keys(other).length > 0 ? other : null;
  next.rawColumnValues = raw;
  return next;
}

export function marketplaceFromId(marketplaceId: string): ProductImportMarketplace {
  return MARKETPLACE_ID_TO_DOMAIN[marketplaceId] ?? "amazon.com";
}

export function normalizeMarketplace(
  raw: string
): ProductImportMarketplace | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const compact = normalizeKey(trimmed);
  if (compact in MARKETPLACE_ALIASES) {
    return MARKETPLACE_ALIASES[compact];
  }
  const lower = trimmed.toLowerCase();
  if ((PRODUCT_IMPORT_MARKETPLACES as readonly string[]).includes(lower)) {
    return lower as ProductImportMarketplace;
  }
  return null;
}

function resolveHeader(
  header: string,
  headerToBq?: Record<string, string>
): string | null {
  const key = normalizeKey(header);
  if (!key) return null;
  if (key in HEADER_ALIASES) return HEADER_ALIASES[key];
  if (key in EXTRA_ALIASES) return EXTRA_ALIASES[key];
  const core = EXTRA_HEADER_TO_BQ.get(key);
  if (core) return core;
  if (headerToBq?.[key]) return headerToBq[key];
  return null;
}

function isSkipSheet(name: string): boolean {
  return SKIP_SHEET_NAMES.has(normalizeKey(name));
}

function sheetByName(
  wb: XLSX.WorkBook,
  name: string
): XLSX.WorkSheet | undefined {
  const found = wb.SheetNames.find(
    (n) => n.trim().toLowerCase() === name.toLowerCase()
  );
  return found ? wb.Sheets[found] : undefined;
}

function templateLooksLikeClr(ws: XLSX.WorkSheet): boolean {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  });
  const labels = (rows[3] ?? []).map((c) => normalizeKey(cellStr(c)));
  const fields = (rows[4] ?? []).map((c) => normalizeKey(cellStr(c)));
  return (
    fields.some((f) => f.startsWith("contributionsku")) || labels.includes("sku")
  );
}

export function workbookLooksLikeClr(wb: XLSX.WorkBook): boolean {
  const tmpl = sheetByName(wb, "Template");
  if (!tmpl) return false;
  const hasDataDefinitions = wb.SheetNames.some(
    (n) => n.trim().toLowerCase() === "data definitions"
  );
  return hasDataDefinitions || templateLooksLikeClr(tmpl);
}

function findClrColumn(
  labels: string[],
  fields: string[],
  match: (labelKey: string, fieldKey: string) => boolean
): number {
  const n = Math.max(labels.length, fields.length);
  for (let i = 0; i < n; i++) {
    if (match(normalizeKey(labels[i] ?? ""), normalizeKey(fields[i] ?? ""))) {
      return i;
    }
  }
  return -1;
}

function marketplaceFromClrFields(fields: string[]): ProductImportMarketplace {
  for (const field of fields) {
    const match = field.match(/marketplace_id=([A-Z0-9]+)/i);
    if (match) return marketplaceFromId(match[1].toUpperCase());
  }
  return "amazon.com";
}

function asinFromClrRow(
  asinCell: string,
  productId: string,
  productIdType: string
): string {
  const cell = asinCell.replace(/[\s-]/g, "").toUpperCase();
  if (cell.length === 10) return cell;
  const typeKey = normalizeKey(productIdType);
  if (typeKey === "asin" && productId.length === 10) return productId.toUpperCase();
  if (/^B0[0-9A-Z]{8}$/i.test(productId)) return productId.toUpperCase();
  return "";
}

/** Labeled ASIN column, else column A (users insert ASINs there). */
function resolveClrAsinColumn(labels: string[], fields: string[]): number {
  const labeled = findClrColumn(
    labels,
    fields,
    (label, field) => label === "asin" || field === "asin"
  );
  return labeled >= 0 ? labeled : 0;
}

const CLR_EXAMPLE_SKUS = new Set(["abc123"]);

export function parseClrListingRecords(wb: XLSX.WorkBook): WorkbookRecord[] {
  const tmpl = sheetByName(wb, "Template");
  if (!tmpl) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(tmpl, {
    header: 1,
    defval: "",
    raw: false,
  });
  const labels = (rows[3] ?? []).map((c) => cellStr(c));
  const fields = (rows[4] ?? []).map((c) => cellStr(c));
  if (labels.length === 0 && fields.length === 0) return [];

  const skuCol = findClrColumn(
    labels,
    fields,
    (label, field) => label === "sku" || field.startsWith("contributionsku")
  );
  if (skuCol < 0) return [];

  const productTypeCol = findClrColumn(
    labels,
    fields,
    (label, field) => label === "producttype" || field.startsWith("producttype")
  );
  const productIdCol = findClrColumn(
    labels,
    fields,
    (label) => label === "productid"
  );
  const productIdTypeCol = findClrColumn(
    labels,
    fields,
    (label) => label === "productidtype"
  );
  const asinCol = resolveClrAsinColumn(labels, fields);
  const marketplace = marketplaceFromClrFields(fields);

  const out: WorkbookRecord[] = [];
  for (let r = 5; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const sku = cellStr(row[skuCol]);
    if (!sku) continue;
    if (CLR_EXAMPLE_SKUS.has(sku.toLowerCase())) continue;

    const usedLabels = new Map<string, number>();
    const values: Record<string, string> = {};
    const colCount = Math.max(labels.length, fields.length, row.length);
    for (let c = 0; c < colCount; c++) {
      const field = cellStr(fields[c]);
      const label = cellStr(labels[c]) || field;
      const v = cellStr(row[c]);
      if (!v) continue;
      const keepField = Boolean(field) && (!field.startsWith("::") || field === "::title");
      if (keepField) values[field] = v;
      if (!label || (field.startsWith("::") && field !== "::title")) continue;
      const count = (usedLabels.get(label) ?? 0) + 1;
      usedLabels.set(label, count);
      const header = count === 1 ? label : `${label} ${count}`;
      values[header] = v;
    }

    const productId = productIdCol >= 0 ? cellStr(row[productIdCol]) : "";
    const productIdType =
      productIdTypeCol >= 0 ? cellStr(row[productIdTypeCol]) : "";
    const asinCell = asinCol >= 0 ? cellStr(row[asinCol]) : "";
    const asin = asinFromClrRow(asinCell, productId, productIdType);
    values.SKU = sku;
    values.Marketplace = marketplace;
    if (asin) values.ASIN = asin;
    if (productTypeCol >= 0) {
      const pt = cellStr(row[productTypeCol]);
      if (pt) values.ProductType = pt;
    }

    out.push({ sheet: "Template", rowNumber: r + 1, values });
  }
  return out;
}

export function classifyClrSkus(
  clrSkus: string[],
  hubSkus: Iterable<string>
): ClrSkuDiff {
  const hub = new Set(
    [...hubSkus].map((s) => s.trim().toLowerCase()).filter(Boolean)
  );
  const seen = new Set<string>();
  const existing: string[] = [];
  const missing: string[] = [];
  for (const raw of clrSkus) {
    const sku = raw.trim();
    const key = sku.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (hub.has(key)) existing.push(sku);
    else missing.push(sku);
  }
  return { existing, missing };
}

/**
 * First valid 10-character asin1 wins per seller-sku (case-insensitive).
 * Same join as onboarding: CLR has no ASIN column, ALR supplies asin1.
 */
export function asinBySkuFromAlrRows(
  alrRows: Array<{ sellerSku: string; asin1: string }>
): Map<string, string> {
  const bySku = new Map<string, string>();
  for (const row of alrRows) {
    const sku = row.sellerSku.trim();
    const asin = row.asin1.trim().toUpperCase();
    if (!sku || asin.length !== 10) continue;
    const key = sku.toLowerCase();
    if (!bySku.has(key)) bySku.set(key, asin);
  }
  return bySku;
}

export function matchSkusToAlrAsins(
  skus: string[],
  alrRows: Array<{ sellerSku: string; asin1: string }>
): AlrAsinMatch {
  const bySku = asinBySkuFromAlrRows(alrRows);
  const seen = new Set<string>();
  const matched: Array<{ sku: string; asin: string }> = [];
  const unmatched: string[] = [];
  for (const raw of skus) {
    const sku = raw.trim();
    const key = sku.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const asin = bySku.get(key);
    if (asin) matched.push({ sku, asin });
    else unmatched.push(sku);
  }
  return { matched, unmatched };
}

export function applyAlrAsinsToImportRows(
  rows: ImportRow[],
  asinBySku: Map<string, string>
): { withAsin: ImportRow[]; unmatched: ImportRow[] } {
  const withAsin: ImportRow[] = [];
  const unmatched: ImportRow[] = [];
  for (const row of rows) {
    const existing = row.asin.trim().toUpperCase();
    if (existing.length === 10) {
      withAsin.push({ ...row, asin: existing });
      continue;
    }
    const fromAlr = asinBySku.get(row.sku.trim().toLowerCase()) ?? "";
    if (fromAlr.length === 10) {
      withAsin.push({ ...row, asin: fromAlr });
    } else {
      unmatched.push(row);
    }
  }
  return { withAsin, unmatched };
}

export function attachAlrAsins(
  rows: ImportRow[],
  alrRows: Array<{ sellerSku: string; asin1: string }>
): { rows: ImportRow[]; skipped: PlannedSkip[] } {
  const { withAsin, unmatched } = applyAlrAsinsToImportRows(
    rows,
    asinBySkuFromAlrRows(alrRows)
  );
  return {
    rows: withAsin,
    skipped: unmatched.map((row) => ({
      row: row.rowNumber,
      sheet: row.sheet,
      message: "No ASIN in All Listings Report for this SKU",
      reason: "no_asin" as const,
    })),
  };
}

function findHeaderRowIndex(aoa: unknown[][]): number {
  return aoa.findIndex((row) => {
    const keys = (row ?? []).map((c) => normalizeKey(cellStr(c)));
    return keys.includes("asin") && keys.includes("sku");
  });
}

function aoaToRecords(
  sheet: string,
  aoa: unknown[][]
): WorkbookRecord[] {
  const headerIdx = findHeaderRowIndex(aoa);
  if (headerIdx < 0) return [];
  const headers = (aoa[headerIdx] ?? []).map((c) => cellStr(c));
  const out: WorkbookRecord[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    const values: Record<string, string> = {};
    let any = false;
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j];
      if (!h) continue;
      const v = cellStr(row[j]);
      values[h] = v;
      if (v) any = true;
    }
    if (!any) continue;
    out.push({ sheet, rowNumber: i + 1, values });
  }
  return out;
}

export function parseImportWorkbook(
  data: ArrayBuffer | Uint8Array
): ImportWorkbookParse {
  const wb = XLSX.read(data, { type: "array", cellDates: false });
  if (workbookLooksLikeClr(wb)) {
    return { source: "clr", records: parseClrListingRecords(wb) };
  }
  const records: WorkbookRecord[] = [];
  for (const sheetName of wb.SheetNames) {
    if (isSkipSheet(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
    });
    records.push(...aoaToRecords(sheetName, aoa));
  }
  return { source: "sheet", records };
}

export function recordsFromWorkbook(
  data: ArrayBuffer | Uint8Array
): WorkbookRecord[] {
  return parseImportWorkbook(data).records;
}

function asWorkbookRecords(
  records: Array<WorkbookRecord | Record<string, string>>
): WorkbookRecord[] {
  return records.map((r, i) => {
    if ("values" in r && "rowNumber" in r && "sheet" in r) {
      return r as WorkbookRecord;
    }
    return {
      sheet: "Products",
      rowNumber: i + 2,
      values: r as Record<string, string>,
    };
  });
}

export function parseProductImportRecords(
  records: Array<WorkbookRecord | Record<string, string>>,
  options: ParseProductImportOptions = {}
): ParseProductImportResult {
  const valid: ImportRow[] = [];
  const errors: ImportIssue[] = [];
  const rows = asWorkbookRecords(records);
  const defaultClient = options.defaultClientIdCode?.trim() ?? "";

  if (rows.length > PRODUCT_IMPORT_MAX_ROWS) {
    errors.push({
      row: 0,
      message: `File has ${rows.length} rows; maximum is ${PRODUCT_IMPORT_MAX_ROWS}`,
    });
    return { valid, errors };
  }

  for (const record of rows) {
    const mapped: Record<string, string> = {};
    const extra: BqRow = {};

    for (const [header, value] of Object.entries(record.values)) {
      const resolved = resolveHeader(header, options.headerToBq);
      if (!resolved) {
        if (
          cellStr(value) &&
          !header.includes("[marketplace_id=") &&
          !header.startsWith("::") &&
          !/#\d+\.value$/i.test(header)
        ) {
          extra[header] = cellStr(value);
        }
        continue;
      }
      if (REQUIRED_FIELDS.includes(resolved as (typeof REQUIRED_FIELDS)[number])) {
        mapped[resolved] = cellStr(value);
      } else {
        extra[resolved] = cellStr(value);
      }
    }

    const asin = (mapped.asin ?? "").toUpperCase();
    const sku = mapped.sku ?? "";
    const clientIdCode = mapped.clientidcode || defaultClient;
    const marketplaceRaw = mapped.marketplace ?? "";

    const extraContent = Object.keys(extra).filter(
      (k) => normalizeKey(k) !== "producttype"
    );
    const blank = !asin && !sku && extraContent.length === 0;
    if (blank) continue;

    const requireAsin = options.requireAsin !== false;
    const missing: string[] = [];
    if (requireAsin && !asin) missing.push(options.asinHint ?? "ASIN");
    if (!sku) missing.push("SKU");
    if (!clientIdCode) missing.push("Client");
    if (!marketplaceRaw) missing.push("Marketplace");
    if (missing.length > 0) {
      errors.push({
        row: record.rowNumber,
        sheet: record.sheet,
        message: `Missing ${missing.join(", ")}`,
      });
      continue;
    }

    if (asin && asin.length !== 10) {
      errors.push({
        row: record.rowNumber,
        sheet: record.sheet,
        message: `ASIN must be exactly 10 characters (${asin.length}/10)`,
      });
      continue;
    }

    const marketplace = normalizeMarketplace(marketplaceRaw);
    if (!marketplace) {
      errors.push({
        row: record.rowNumber,
        sheet: record.sheet,
        message: `Unknown marketplace "${marketplaceRaw}"`,
      });
      continue;
    }

    const seoV0 = extractClrSeoV0(record.values);
    if (hasClrSeoV0(seoV0)) {
      for (const [key, value] of Object.entries(seoV0)) {
        if (value) extra[key] = value;
      }
      extra.SEOVersionNumber = "0";
    }

    valid.push({
      rowNumber: record.rowNumber,
      sheet: record.sheet,
      asin,
      sku,
      clientIdCode,
      marketplace,
      extra,
      seoV0: hasClrSeoV0(seoV0) ? seoV0 : undefined,
    });
  }

  return { valid, errors };
}

export function asinSkuMarketplaceKey(
  asin: string,
  sku: string,
  marketplace: string
): string {
  return `${asin.toUpperCase()}\0${sku}\0${marketplace.toLowerCase()}`;
}

export function clientSkuKey(clientIdCode: string, sku: string): string {
  return `${clientIdCode}\0${sku}`;
}

export function planProductImport(
  rows: ImportRow[],
  existing: {
    byAsinSkuMarketplace: Set<string>;
    byClientSku: Set<string>;
  },
  validClients: Set<string>,
  overwriteSkus: Iterable<string> = []
): PlanProductImportResult {
  const toInsert: ImportRow[] = [];
  const toOverwrite: ImportRow[] = [];
  const skipped: PlannedSkip[] = [];
  const errors: ImportIssue[] = [];
  const seenAsm = new Set<string>();
  const seenClientSku = new Set<string>();
  const overwrite = new Set(
    [...overwriteSkus].map((sku) => sku.trim().toLowerCase()).filter(Boolean)
  );
  const clientsByLower = new Map<string, string>();
  for (const code of validClients) {
    clientsByLower.set(code.toLowerCase(), code);
  }

  for (const row of rows) {
    const canonicalClient = clientsByLower.get(row.clientIdCode.toLowerCase());
    if (!canonicalClient) {
      errors.push({
        row: row.rowNumber,
        sheet: row.sheet,
        message: `Unknown client "${row.clientIdCode}"`,
      });
      continue;
    }

    const normalized: ImportRow = { ...row, clientIdCode: canonicalClient };

    const asm = asinSkuMarketplaceKey(
      normalized.asin,
      normalized.sku,
      normalized.marketplace
    );
    const cs = clientSkuKey(normalized.clientIdCode, normalized.sku);

    if (seenAsm.has(asm) || seenClientSku.has(cs)) {
      errors.push({
        row: normalized.rowNumber,
        sheet: normalized.sheet,
        message: "Duplicate of another row in this file",
      });
      continue;
    }

    const exists =
      existing.byAsinSkuMarketplace.has(asm) || existing.byClientSku.has(cs);
    if (exists) {
      if (overwrite.has(normalized.sku.trim().toLowerCase())) {
        seenAsm.add(asm);
        seenClientSku.add(cs);
        toOverwrite.push(normalized);
        continue;
      }
      skipped.push({
        row: normalized.rowNumber,
        sheet: normalized.sheet,
        message: existing.byAsinSkuMarketplace.has(asm)
          ? "Product with this ASIN, SKU, and Marketplace already exists"
          : "A product with this SKU already exists for this client",
        reason: "duplicate",
      });
      continue;
    }

    seenAsm.add(asm);
    seenClientSku.add(cs);
    toInsert.push(normalized);
  }

  return { toInsert, toOverwrite, skipped, errors };
}

const IMPORT_OVERWRITE_OMIT = new Set([
  "id",
  "variationGroup",
  "isVp",
  "variationRef",
  "groupRef",
  "contentGuidelines",
  "createdAt",
  "changeLog",
  "lastPublishedAt",
]);

/** Catalog fields from a CLR/Excel row, keeping Hub variation links intact. */
export function importOverwriteFields(
  product: NewProduct
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(product)) {
    if (IMPORT_OVERWRITE_OMIT.has(key) || value === undefined) continue;
    out[key] = value;
  }
  out.isDirty = true;
  out.updatedAt = new Date();
  return out;
}

export function toBqRow(row: ImportRow): BqRow {
  return {
    ASIN: row.asin,
    SKU: row.sku,
    ClientIDCode: row.clientIdCode,
    Marketplace: row.marketplace,
    Country: COUNTRY_FOR_MARKETPLACE[row.marketplace],
    ...row.extra,
  };
}

export function sortTemplateAttributes(
  attrs: TemplateAttribute[]
): TemplateAttribute[] {
  return attrs
    .map((attr, index) => ({ attr, index }))
    .toSorted((a, b) => {
      const orderA = a.attr.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.attr.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.index - b.index;
    })
    .map(({ attr }) => attr);
}

function templateGroupName(attr: TemplateAttribute): string {
  return (attr.groupName || attr.referenceGroup || "").trim();
}

function layoutImportAttributes(attrs: TemplateAttribute[]): TemplateAttribute[] {
  const sorted = sortTemplateAttributes(attrs);
  const seen = new Set<string>();
  const ordered: TemplateAttribute[] = [];
  for (const attr of sorted) {
    const key = normalizeKey(attr.generalLabel);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ordered.push(attr);
  }

  const injected: TemplateAttribute[] = [];
  for (const col of HUB_IDENTITY_COLUMNS) {
    const key = normalizeKey(col.generalLabel);
    if (seen.has(key)) continue;
    seen.add(key);
    injected.push({
      generalLabel: col.generalLabel,
      referenceGroup: "Listing Identity",
      groupName: "Listing Identity",
      requirement: col.requirement,
      isKey: false,
      sortOrder: injected.length - HUB_IDENTITY_COLUMNS.length,
    });
  }
  return [...injected, ...ordered];
}

export function sanitizeSheetName(name: string, used: Set<string>): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim();
  const base = (cleaned || "Category").slice(0, 31);
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${n}`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

const TEMPLATE_BLANK_ROWS = 25;

export function buildClientProductImportWorkbook(args: {
  clientIdCode: string;
  sheets: TemplateCategorySheet[];
}): Uint8Array {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>([...SKIP_SHEET_NAMES]);

  const instructions = [
    [`Product import — ${args.clientIdCode}`],
    [""],
    ["1. Pick the tab that matches the product category."],
    ["2. Fill one row per new product. ASIN must be exactly 10 characters."],
    ["3. SKU and Marketplace are required. Marketplace and ProductType are pre-filled."],
    [`4. These products will be created for client ${args.clientIdCode}.`],
    ["5. Row 1 is the Category Listing Report group, row 2 is the Amazon requirement, row 3 is the column name."],
    ["6. Columns follow the CLR Template tab order and grouping."],
    [""],
    ["Categories in this file:"],
    ...args.sheets.map((s) => [
      `  ${s.productType} (${s.marketplace}) — ${s.attributes.length} attributes`,
    ]),
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(instructions),
    "Instructions"
  );

  for (const sheet of args.sheets) {
    const attrs = layoutImportAttributes(sheet.attributes);
    const headers = attrs.map((a) => a.generalLabel);
    const groups = attrs.map((a) => templateGroupName(a));
    const requirements = attrs.map((a) =>
      IDENTITY_ATTR_KEYS.has(normalizeKey(a.generalLabel))
        ? a.requirement || (normalizeKey(a.generalLabel) === "producttype" ? "" : "Required")
        : a.isKey
          ? "Key"
          : a.requirement || "Optional"
    );
    const blank = headers.map((_, i) => {
      if (headers[i] === "Marketplace") return sheet.marketplace;
      if (headers[i] === "ProductType") return sheet.productType;
      return "";
    });
    const aoa = [
      groups,
      requirements,
      headers,
      ...Array.from({ length: TEMPLATE_BLANK_ROWS }, () => [...blank]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = headers.map((h) => ({
      wch: Math.min(40, Math.max(14, h.length + 2)),
    }));
    ws["!freeze"] = { xSplit: 0, ySplit: 3, topLeftCell: "A4", activePane: "bottomLeft", state: "frozen" };
    XLSX.utils.book_append_sheet(
      wb,
      ws,
      sanitizeSheetName(sheet.productType, usedNames)
    );
  }

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

export function buildHeaderToBqMap(
  rows: Array<{ generalLabel: string | null; bqLabel: string | null }>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    const bq = (row.bqLabel || row.generalLabel || "").trim();
    if (!bq) continue;
    if (row.generalLabel) map[normalizeKey(row.generalLabel)] = bq;
    if (row.bqLabel) map[normalizeKey(row.bqLabel)] = bq;
  }
  return map;
}
