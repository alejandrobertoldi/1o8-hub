import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { canonicalScalarForProductType } from "@/lib/attributes-master/canonical-value";
import { hasAdminPowers } from "@/lib/roles";

export interface CategoryDetailAttribute {
  uuid: string;
  hubLabel: string | null;
  referenceGroup: string | null;
  referenceSubgroup: string | null;
  requirement: string | null;
  description: string | null;
  validValues: string | null; // raw JSON-as-text from canonical
  contributingClients: string[];
  divergentClientCount: number;
}

export interface CategoryDetailClient {
  clientIdCode: string;
  clientName: string | null;
  lastUploadedAt: string;
  attrCount: number;
  divergentCount: number;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ productType: string; marketplaceId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { productType, marketplaceId } = await ctx.params;

  // Client list — join provenance to aac for client name + roll up counts.
  const clientRows = await db.execute<{
    client_id_code: string;
    client_name: string | null;
    last_uploaded_at: string;
    attr_count: number;
    divergent_count: number;
  }>(sql`
    SELECT p.client_id_code,
           a.client_name,
           MAX(p.last_uploaded_at)::text AS last_uploaded_at,
           COUNT(*)::int AS attr_count,
           COUNT(*) FILTER (
             WHERE p.client_requirement IS NOT NULL
                OR p.client_valid_values IS NOT NULL
                OR p.client_description IS NOT NULL
           )::int AS divergent_count
    FROM attribute_client_provenance p
    LEFT JOIN aac a ON a.client_id_code = p.client_id_code
    WHERE p.product_type = ${productType}
      AND p.marketplace_id = ${marketplaceId}
    GROUP BY p.client_id_code, a.client_name
    ORDER BY a.client_name NULLS LAST, p.client_id_code
  `);

  // Canonical attributes in this category, with contributing-client roll-up.
  const attrRows = await db.execute<{
    uuid: string;
    hub_label: string | null;
    reference_group: string | null;
    reference_subgroup: string | null;
    requirement: string | null;
    description: string | null;
    valid_values: string | null;
    contributing_clients: string[];
    divergent_client_count: number;
  }>(sql`
    SELECT m."UUID" AS uuid,
           m."Attributes_HubLabel" AS hub_label,
           m."Attributes_ReferenceGroup" AS reference_group,
           m."Attributes_ReferenceSubgroup" AS reference_subgroup,
           m."Attributes_Requirement" AS requirement,
           m."Attributes_Description" AS description,
           m."Attributes_ValidValues" AS valid_values,
           COALESCE(
             ARRAY_AGG(DISTINCT p.client_id_code) FILTER (WHERE p.client_id_code IS NOT NULL),
             ARRAY[]::text[]
           ) AS contributing_clients,
           COUNT(DISTINCT p.client_id_code) FILTER (
             WHERE p.client_requirement IS NOT NULL
                OR p.client_valid_values IS NOT NULL
                OR p.client_description IS NOT NULL
           )::int AS divergent_client_count
    FROM attribute_category_index i
    JOIN attributes_master m ON m."UUID" = i.attribute_uuid
    LEFT JOIN attribute_client_provenance p
      ON  p.attribute_uuid = i.attribute_uuid
      AND p.product_type = i.product_type
      AND p.marketplace_id = i.marketplace_id
    WHERE i.product_type = ${productType}
      AND i.marketplace_id = ${marketplaceId}
    GROUP BY m."UUID", m."Attributes_HubLabel", m."Attributes_ReferenceGroup",
             m."Attributes_ReferenceSubgroup", m."Attributes_Requirement",
             m."Attributes_Description", m."Attributes_ValidValues"
    ORDER BY m."Attributes_ReferenceGroup" NULLS LAST,
             m."Attributes_ReferenceSubgroup" NULLS LAST,
             m."Attributes_HubLabel"
  `);

  const clients: CategoryDetailClient[] = clientRows.map((r) => ({
    clientIdCode: r.client_id_code,
    clientName: r.client_name,
    lastUploadedAt: r.last_uploaded_at,
    attrCount: Number(r.attr_count),
    divergentCount: Number(r.divergent_count),
  }));

  const attributes: CategoryDetailAttribute[] = attrRows.map((r) => ({
    uuid: r.uuid,
    hubLabel: r.hub_label,
    referenceGroup: r.reference_group,
    referenceSubgroup: r.reference_subgroup,
    requirement: canonicalScalarForProductType(r.requirement, productType),
    description: canonicalScalarForProductType(r.description, productType),
    validValues: r.valid_values,
    contributingClients: r.contributing_clients ?? [],
    divergentClientCount: Number(r.divergent_client_count),
  }));

  return NextResponse.json({ productType, marketplaceId, clients, attributes });
}
