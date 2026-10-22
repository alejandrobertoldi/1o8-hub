import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

export interface CategorySummary {
  productType: string;
  marketplaceId: string;
  clientCount: number;
  attrCount: number;
  divergentCount: number;
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Aggregate from attribute_category_index + attribute_client_provenance.
  // attr_count = distinct attribute_uuid in the category.
  // client_count = distinct client_id_code in the provenance for that category.
  // divergent_count = distinct attribute_uuid where any provenance row has
  //   a non-NULL client_* column.
  const rows = await db.execute<{
    product_type: string;
    marketplace_id: string;
    client_count: number;
    attr_count: number;
    divergent_count: number;
  }>(sql`
    WITH cat AS (
      SELECT product_type, marketplace_id,
             COUNT(DISTINCT attribute_uuid)::int AS attr_count
      FROM attribute_category_index
      GROUP BY product_type, marketplace_id
    ),
    prov AS (
      SELECT product_type, marketplace_id,
             COUNT(DISTINCT client_id_code)::int AS client_count,
             COUNT(DISTINCT attribute_uuid)
               FILTER (
                 WHERE client_requirement IS NOT NULL
                    OR client_valid_values IS NOT NULL
                    OR client_description IS NOT NULL
               )::int AS divergent_count
      FROM attribute_client_provenance
      GROUP BY product_type, marketplace_id
    )
    SELECT cat.product_type,
           cat.marketplace_id,
           COALESCE(prov.client_count, 0) AS client_count,
           cat.attr_count,
           COALESCE(prov.divergent_count, 0) AS divergent_count
    FROM cat
    LEFT JOIN prov USING (product_type, marketplace_id)
    ORDER BY COALESCE(prov.client_count, 0) DESC, cat.product_type ASC
  `);

  const categories: CategorySummary[] = rows.map((r) => ({
    productType: r.product_type,
    marketplaceId: r.marketplace_id,
    clientCount: Number(r.client_count),
    attrCount: Number(r.attr_count),
    divergentCount: Number(r.divergent_count),
  }));

  return NextResponse.json({ categories });
}
