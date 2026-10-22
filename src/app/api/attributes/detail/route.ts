import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import {
  canonicalArrayForProductType,
  canonicalArrayMap,
  canonicalScalarForProductType,
  canonicalScalarMap,
} from "@/lib/attributes-master/canonical-value";
import { hasAdminPowers } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const uuid = req.nextUrl.searchParams.get("uuid");
  if (!uuid) {
    return NextResponse.json({ error: "uuid required" }, { status: 400 });
  }

  const canonicalRows = await db.execute<{
    uuid: string;
    hub_label: string | null;
    reference_group: string | null;
    reference_subgroup: string | null;
    requirement: string | null;
    description: string | null;
    valid_values: string | null;
    clr_label: string | null;
    format: string | null;
    pg_type: string | null;
    bq_type: string | null;
  }>(sql`
    SELECT "UUID" AS uuid,
           "Attributes_HubLabel" AS hub_label,
           "Attributes_ReferenceGroup" AS reference_group,
           "Attributes_ReferenceSubgroup" AS reference_subgroup,
           "Attributes_Requirement" AS requirement,
           "Attributes_Description" AS description,
           "Attributes_ValidValues" AS valid_values,
           "Attributes_CLRLabel" AS clr_label,
           "Attributes_format" AS format,
           "PG_Attributes_Type" AS pg_type,
           "BQ_Attributes_Type" AS bq_type
    FROM attributes_master
    WHERE "UUID" = ${uuid}::uuid
    LIMIT 1
  `);
  const c = canonicalRows[0];
  if (!c) {
    return NextResponse.json({ error: "Attribute not found" }, { status: 404 });
  }

  const divergenceRows = await db.execute<{
    client_id_code: string;
    client_name: string | null;
    product_type: string;
    marketplace_id: string;
    client_requirement: string | null;
    client_description: string | null;
    client_valid_values: string[] | null;
  }>(sql`
    SELECT p.client_id_code,
           a.client_name,
           p.product_type,
           p.marketplace_id,
           p.client_requirement,
           p.client_description,
           p.client_valid_values
    FROM attribute_client_provenance p
    LEFT JOIN aac a ON a.client_id_code = p.client_id_code
    WHERE p.attribute_uuid = ${uuid}::uuid
      AND (
        p.client_requirement IS NOT NULL
        OR p.client_valid_values IS NOT NULL
        OR p.client_description IS NOT NULL
      )
    ORDER BY a.client_name NULLS LAST, p.client_id_code,
             p.product_type, p.marketplace_id
  `);

  return NextResponse.json({
    canonical: {
      uuid: c.uuid,
      hubLabel: c.hub_label,
      referenceGroup: c.reference_group,
      referenceSubgroup: c.reference_subgroup,
      requirement: c.requirement,
      description: c.description,
      validValues: c.valid_values,
      requirementMap: canonicalScalarMap(c.requirement),
      descriptionMap: canonicalScalarMap(c.description),
      validValuesMap: canonicalArrayMap(c.valid_values),
      clrLabel: c.clr_label,
      format: c.format,
      pgType: c.pg_type,
      bqType: c.bq_type,
    },
    divergences: divergenceRows.map((d) => ({
      clientIdCode: d.client_id_code,
      clientName: d.client_name,
      productType: d.product_type,
      marketplaceId: d.marketplace_id,
      clientRequirement: d.client_requirement,
      clientDescription: d.client_description,
      clientValidValues: d.client_valid_values,
      canonicalRequirement: canonicalScalarForProductType(c.requirement, d.product_type),
      canonicalDescription: canonicalScalarForProductType(c.description, d.product_type),
      canonicalValidValues: canonicalArrayForProductType(c.valid_values, d.product_type),
    })),
  });
}
