// S1.3 baseline sources: the SEO versions that exist for a listing in
// BigQuery MFBibleApp.SEO — V00 is the inherited CLR copy (AIA clients only;
// it's exported with their CLR, so it isn't ours), V01+ are 1o8's.
// NTA clients start at V01. When a listing has no version yet, the baseline is
// the Hub product record copied at project creation.

export interface BaselineFields {
  ItemName: string | null;
  DetailedBulletPoint1: string | null;
  DetailedBulletPoint2: string | null;
  DetailedBulletPoint3: string | null;
  DetailedBulletPoint4: string | null;
  DetailedBulletPoint5: string | null;
  ProductDescription: string | null;
  GenericKeyword1: string | null;
  GenericKeyword2: string | null;
  GenericKeyword3: string | null;
  GenericKeyword4: string | null;
  GenericKeyword5: string | null;
}

export const BASELINE_FIELD_KEYS: (keyof BaselineFields)[] = [
  "ItemName",
  "DetailedBulletPoint1",
  "DetailedBulletPoint2",
  "DetailedBulletPoint3",
  "DetailedBulletPoint4",
  "DetailedBulletPoint5",
  "ProductDescription",
  "GenericKeyword1",
  "GenericKeyword2",
  "GenericKeyword3",
  "GenericKeyword4",
  "GenericKeyword5",
];

export interface BaselineVersion {
  /** "0", "1", … as stored in SEOVersionNumber */
  version: string;
  category: string;
  status: string;
  /** Set when the version was created by an SEO Manager project */
  projectName?: string | null;
  fields: BaselineFields;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** A BigQuery SEO row → baseline fields (the column names already match). */
export function seoRowToBaseline(row: Record<string, unknown>): BaselineFields {
  const out = {} as BaselineFields;
  for (const k of BASELINE_FIELD_KEYS) out[k] = str(row[k]);
  return out;
}

/** "V00 · Inherited (CLR)", "V01 · REA_SC_US_01_ReadyRESCUE_v01 · Approved", "V02 · Optimization · Live" */
export function baselineVersionLabel(
  v: Pick<BaselineVersion, "version" | "category" | "status"> & { projectName?: string | null }
): string {
  const n = Number(v.version);
  const tag = Number.isFinite(n) ? `V${String(n).padStart(2, "0")}` : `V${v.version}`;
  if (n === 0) return `${tag} · Inherited (CLR)`;
  if (v.projectName) return [tag, v.projectName, v.status].filter(Boolean).join(" · ");
  return [tag, v.category, v.status].filter(Boolean).join(" · ");
}

/**
 * Versions for one listing, oldest first. Rows are matched on ASIN+SKU; if no
 * row carries this SKU, fall back to the ASIN's rows (SKU spellings drift).
 */
export function versionsForListing(
  rows: Record<string, unknown>[],
  asin: string,
  sku: string | null
): BaselineVersion[] {
  const forAsin = rows.filter((r) => String(r.ASIN ?? "").toUpperCase() === asin.toUpperCase());
  const bySku = sku ? forAsin.filter((r) => String(r.SKU ?? "") === sku) : [];
  const picked = bySku.length ? bySku : forAsin;
  const seen = new Set<string>();
  const out: BaselineVersion[] = [];
  for (const r of picked) {
    const version = String(r.SEOVersionNumber ?? "").trim();
    if (!version || seen.has(version)) continue;
    seen.add(version);
    out.push({
      version,
      category: String(r.SEOCategory ?? "").trim(),
      status: String(r.SEOStatus ?? "").trim(),
      fields: seoRowToBaseline(r),
    });
  }
  return out.sort((a, b) => Number(a.version) - Number(b.version));
}

// ── SEO Manager projects as versions ─────────────────────────────────
// Versions created in the Hub live on the project (seo_asins.generated_content,
// PascalCase keys) until/unless they're published to BigQuery.

/** Version number of a Hub project: its `_vNN`/`_VNN` name suffix, else the version column. */
export function projectVersionNumber(name: string, versionColumn: number | null | undefined): string {
  const m = /_[vV](\d+)$/.exec(name.trim());
  if (m) return String(Number(m[1]));
  return String(versionColumn ?? 1);
}

/** S6 generated_content → baseline fields. BackendSearchTerms is one string, like the Hub keyword field. */
export function generatedToBaseline(gc: unknown): BaselineFields {
  const g = gc && typeof gc === "object" ? (gc as Record<string, unknown>) : {};
  return {
    ItemName: str(g.Title),
    DetailedBulletPoint1: str(g.DetailedBulletPoint_1),
    DetailedBulletPoint2: str(g.DetailedBulletPoint_2),
    DetailedBulletPoint3: str(g.DetailedBulletPoint_3),
    DetailedBulletPoint4: str(g.DetailedBulletPoint_4),
    DetailedBulletPoint5: str(g.DetailedBulletPoint_5),
    ProductDescription: str(g.ProductDescription),
    GenericKeyword1: str(g.BackendSearchTerms),
    GenericKeyword2: null,
    GenericKeyword3: null,
    GenericKeyword4: null,
    GenericKeyword5: null,
  };
}

export function hasGeneratedCopy(gc: unknown): boolean {
  return !!(gc && typeof gc === "object" && str((gc as Record<string, unknown>).Title));
}

export interface ProjectVersionRow {
  projectName: string;
  version: string;
  approved: boolean;
  fields: BaselineFields;
}

/**
 * Merge BigQuery versions with Hub project versions for one listing, oldest
 * first. A number published to BigQuery keeps its BigQuery copy (the record of
 * what went live) but takes the project's name as its label.
 */
export function mergeListingVersions(bq: BaselineVersion[], projects: ProjectVersionRow[]): BaselineVersion[] {
  const byNumber = new Map<string, BaselineVersion>();
  for (const v of bq) byNumber.set(v.version, v);
  for (const p of projects) {
    const existing = byNumber.get(p.version);
    if (existing) {
      existing.projectName = existing.projectName ?? p.projectName;
      continue;
    }
    byNumber.set(p.version, {
      version: p.version,
      category: "SEO Manager",
      status: p.approved ? "Approved" : "Draft",
      projectName: p.projectName,
      fields: p.fields,
    });
  }
  return [...byNumber.values()].sort((a, b) => Number(a.version) - Number(b.version));
}
