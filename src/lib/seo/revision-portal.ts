import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aac, master } from "@/lib/db/schema";
import type { SeoRevision, SeoRevisionComment, SeoRevisionEvent } from "@/lib/db/schema";
import { parseClientIdCodes } from "@/lib/client-codes";
import { hasAdminPowers } from "@/lib/roles";
import { canAccess } from "@/lib/permissions";

export interface ClientComment { id: string; asin: string; fieldKey: string; parentCommentId: string | null; authorName: string | null; body: string; createdAt: string; resolved: boolean }
export interface ClientRevision {
  id: string; revisionNumber: number; status: string; projectName: string; submittedAt: string;
  content: Record<string, Record<string, string>>; comments: ClientComment[];
  decision: { at: string; byName: string | null; action: string } | null;
}

export function portalClientAllowed(session: { user: { role: string; clientIdCode?: string | null } }, clientIdCode: string): boolean {
  const role = session.user.role;
  if (role === "client" || role === "prospect") return parseClientIdCodes(session.user.clientIdCode).includes(clientIdCode);
  return hasAdminPowers(role);
}

export async function seoSectionEnabled(clientIdCode: string): Promise<boolean> {
  const [row] = await db.select({ allowedSections: aac.allowedSections }).from(aac).where(eq(aac.clientIdCode, clientIdCode));
  return canAccess("seo", (row?.allowedSections as string[] | null) ?? [], false);
}

const iso = (d: Date | string) => new Date(d).toISOString();

/** The ONLY shape the portal may return. Whitelist, never spread a DB row. */
export function toClientRevision(rev: SeoRevision, projectName: string, comments: SeoRevisionComment[], events: SeoRevisionEvent[]): ClientRevision {
  const clientEvent = [...events].reverse().find((e) => e.step === "client");
  return {
    id: rev.id,
    revisionNumber: rev.revisionNumber,
    status: rev.status,
    projectName,
    submittedAt: iso(rev.submittedAt),
    content: rev.content as Record<string, Record<string, string>>,
    comments: comments.filter((c) => c.audience === "client").map((c) => ({
      id: c.id, asin: c.asin, fieldKey: c.fieldKey, parentCommentId: c.parentCommentId, authorName: c.authorName,
      body: c.body, createdAt: iso(c.createdAt), resolved: !!c.resolvedAt,
    })),
    decision: clientEvent ? { at: iso(clientEvent.createdAt), byName: clientEvent.actorName, action: clientEvent.action } : null,
  };
}

/**
 * Catalog columns the read-only PDP preview renders (product-pdp.tsx + getProductFieldValue).
 * Whitelist only: changeLog, rawColumnValues, isDirty, costPrice, contentGuidelines,
 * lastPublishedAt, otherAttributes and fulfillment are internal and must never reach a client.
 */
export const CLIENT_PRODUCT_SELECT = {
  id: master.id, asin: master.asin, itemName: master.itemName, itemHighlight: master.itemHighlight,
  brandName: master.brandName, listPrice: master.listPrice, productType: master.productType,
  itemTypeKeyword: master.itemTypeKeyword, feedProductType: master.feedProductType,
  genericKeywords: master.genericKeywords, mainImageUrl: master.mainImageUrl,
  contentSeo: master.contentSeo, images: master.images, productAttributes: master.productAttributes,
  packaging: master.packaging, targetAudience: master.targetAudience,
  nutritionSupplements: master.nutritionSupplements, complianceSafety: master.complianceSafety,
  dimensionsWeight: master.dimensionsWeight,
} as const;

export type ClientProduct = { [K in keyof typeof CLIENT_PRODUCT_SELECT]: (typeof master.$inferSelect)[K] };

export function toClientProduct(row: Partial<typeof master.$inferSelect>): ClientProduct {
  return {
    id: row.id as string, asin: row.asin ?? null, itemName: row.itemName ?? null, itemHighlight: row.itemHighlight ?? null,
    brandName: row.brandName ?? null, listPrice: row.listPrice ?? null, productType: row.productType ?? null,
    itemTypeKeyword: row.itemTypeKeyword ?? null, feedProductType: row.feedProductType ?? null,
    genericKeywords: row.genericKeywords ?? null, mainImageUrl: row.mainImageUrl ?? null,
    contentSeo: row.contentSeo ?? null, images: row.images ?? null, productAttributes: row.productAttributes ?? null,
    packaging: row.packaging ?? null, targetAudience: row.targetAudience ?? null,
    nutritionSupplements: row.nutritionSupplements ?? null, complianceSafety: row.complianceSafety ?? null,
    dimensionsWeight: row.dimensionsWeight ?? null,
  };
}
