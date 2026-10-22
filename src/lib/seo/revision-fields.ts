/** Listing-field math shared by the review preview and Push to Products (spec §7: preview = push). Pure. */
import { FIELD_MAP, extractMappedFields } from "@/app/api/seo/projects/[id]/migrate-to-products/field-map";

export type RevisionFields = Record<string, string>;
export type RevisionContent = Record<string, RevisionFields>;
export interface FieldSource { itemName: string | null; itemHighlight: string | null; genericKeywords: string | null; contentSeo: unknown }

export function snapshotFields(gc: unknown): RevisionFields {
  if (!gc || typeof gc !== "object") return {};
  const out: RevisionFields = {};
  for (const [key, m] of extractMappedFields(gc as Record<string, unknown>)) out[key] = m.value;
  return out;
}

function contentSeoOf(product: FieldSource): Record<string, string> {
  return product.contentSeo && typeof product.contentSeo === "object" ? { ...(product.contentSeo as Record<string, string>) } : {};
}

export function currentValue(product: FieldSource, key: string): string | null {
  const m = FIELD_MAP[key];
  if (!m) return null;
  const v = m.target === "core" ? (product as unknown as Record<string, unknown>)[m.field] : contentSeoOf(product)[m.field];
  return typeof v === "string" && v.trim() ? v : null;
}

/** A copy of the product with the revision's text in place — what the PDP preview renders and what a push writes. */
export function overlayProduct<T extends FieldSource>(product: T, fields: RevisionFields): T {
  const out = { ...product } as unknown as Record<string, unknown>;
  const seo = contentSeoOf(product);
  for (const [key, value] of Object.entries(fields)) {
    const m = FIELD_MAP[key];
    if (!m) continue;
    if (m.target === "core") out[m.field] = value;
    else seo[m.field] = value;
  }
  out.contentSeo = seo;
  return out as T;
}

export function changedKeys(product: FieldSource, fields: RevisionFields): string[] {
  return Object.keys(fields).filter((k) => FIELD_MAP[k] && (currentValue(product, k) ?? "") !== fields[k]);
}

/** Change-log / raw-values name for a FIELD_MAP key (matches the existing migrate route). */
export function bqNameFor(key: string): string {
  if (key === "Title") return "ItemName";
  if (key === "BackendSearchTerms") return "GenericKeyword1";
  const m = FIELD_MAP[key];
  return m?.target === "contentSeo" ? m.field : key;
}

const n = (k: string) => k.replace(/^.*_(\d)$/, "$1");
export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  Object.keys(FIELD_MAP).map((k) => [
    k,
    k === "Title" ? "Title"
      : k === "ItemHighlight" ? "Item highlight"
      : k === "ProductDescription" ? "Description"
      : k === "BackendSearchTerms" ? "Backend search terms"
      : k.startsWith("DetailedBulletPoint_") ? `Bullet ${n(k)}`
      : k.startsWith("ConciseBulletPoint_") ? `Concise bullet ${n(k)}`
      : k.startsWith("ContentBulletPoint_") ? `Content bullet ${n(k)}`
      : k.startsWith("KeyFeaturesBulletPoint_") ? `Key feature ${n(k)}`
      : k,
  ]),
);

/** Fields the PDP card never shows; the review page lists them in a strip under the preview. */
export const PDP_HIDDEN_KEYS: string[] = Object.keys(FIELD_MAP).filter((k) => k === "BackendSearchTerms" || k.startsWith("ContentBulletPoint_"));
