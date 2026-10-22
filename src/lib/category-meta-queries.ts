import { db } from "@/lib/db";
import { attributes } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export interface AttributeCategoryRow {
  id: number;
  generalLabel: string;
  referenceGroup: string;
  requirement: string | null;
  validValues: string[] | null;
  description: string | null;
  example: string | null;
  isKey: boolean;
  isEssential: boolean;
  sortOrder?: number | null;
  groupName?: string | null;
}

/** Return all attributes with non-empty category_meta for (mp, productType). */
export async function getAttributesForCategory(
  marketplaceId: string,
  productType: string,
): Promise<AttributeCategoryRow[]> {
  const path = sql`${attributes.categoryMeta}->${marketplaceId}->${productType}`;
  const rows = await db
    .select({
      id: attributes.id,
      generalLabel: attributes.generalLabel,
      referenceGroup: attributes.referenceGroup,
      requirement: sql<string | null>`(${path}->>'requirement')`,
      validValues: sql<string[] | null>`(${path}->'validValues')`,
      description: sql<string | null>`(${path}->>'description')`,
      example: sql<string | null>`(${path}->>'example')`,
      isKey: sql<boolean>`COALESCE((${path}->>'isKey')::boolean, false)`,
      isEssential: attributes.isEssential,
      sortOrder: sql<number | null>`(${path}->>'sortOrder')::int`,
      groupName: sql<string | null>`(${path}->>'groupName')`,
    })
    .from(attributes)
    .where(sql`${path} IS NOT NULL`)
    .orderBy(
      sql`COALESCE((${path}->>'sortOrder')::int, 2147483647)`,
      attributes.id
    );
  return rows;
}

const IDENTITY_COLS = ["SKU", "ASIN", "ItemName", "ProductType"] as const;

function synthIdentityRow(generalLabel: string): AttributeCategoryRow {
  return {
    id: -1,
    generalLabel,
    referenceGroup: "",
    requirement: null,
    validValues: null,
    description: null,
    example: null,
    isKey: false,
    isEssential: false,
  };
}

/**
 * Filter to "Minimum + Necessary" attributes for a (marketplace, productType):
 *   Amazon-Required ∪ Amazon-Conditionally-Required ∪ Hub-isEssential
 * Identity columns are always first regardless of flags; if missing from the
 * attributes table they are synthesised so the Sheet always carries them.
 * See docs/superpowers/specs/2026-05-13-nta-listing-intake-sheet-design.md §2.
 */
export async function getMinimumNecessaryAttributes(
  marketplaceId: string,
  productType: string,
): Promise<AttributeCategoryRow[]> {
  // Resolve via the module namespace so test spies on `getAttributesForCategory`
  // (vi.spyOn on the namespace object) are honoured.
  const mod = await import("./category-meta-queries");
  const all = await mod.getAttributesForCategory(marketplaceId, productType);
  const byId = new Map<string, AttributeCategoryRow>();
  for (const r of all) byId.set(r.generalLabel, r);

  const identity: AttributeCategoryRow[] = [];
  for (const gl of IDENTITY_COLS) {
    const found = byId.get(gl);
    if (found) {
      identity.push(found);
      byId.delete(gl);
    } else {
      identity.push(synthIdentityRow(gl));
    }
  }

  const required: AttributeCategoryRow[] = [];
  const conditional: AttributeCategoryRow[] = [];
  const essentialOnly: AttributeCategoryRow[] = [];

  for (const r of byId.values()) {
    if (r.requirement === "Required") required.push(r);
    else if (r.requirement === "Conditionally Required") conditional.push(r);
    else if (r.isEssential) essentialOnly.push(r);
  }
  const cmp = (a: AttributeCategoryRow, b: AttributeCategoryRow) =>
    a.generalLabel.localeCompare(b.generalLabel);
  required.sort(cmp);
  conditional.sort(cmp);
  essentialOnly.sort(cmp);

  return [...identity, ...required, ...conditional, ...essentialOnly];
}
