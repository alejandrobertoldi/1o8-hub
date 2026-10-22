import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { ilike, eq, and, asc, sql } from "drizzle-orm";
import type { AACClient } from "@/lib/bigquery";
import { getAuthSession } from "@/lib/auth-db";
import { serverError } from "@/lib/api-utils";

export const maxDuration = 60;

/**
 * GET /api/seo/bq/clients
 * Fetch client list from PostgreSQL aac_clients table.
 * Returns data shaped like the BQ AAC table (PascalCase keys) for
 * backward compatibility with intake page.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);

    const conditions = [];

    const clientName = searchParams.get("clientName");
    if (clientName) {
      conditions.push(ilike(aac.clientName, `%${clientName}%`));
    }

    const brandName = searchParams.get("brandName");
    if (brandName) {
      conditions.push(
        sql`${aac.rawData}->>'BrandName' ILIKE ${`%${brandName}%`}`
      );
    }

    const marketplace = searchParams.get("marketplace");
    if (marketplace) {
      conditions.push(
        sql`${aac.rawData}->>'Marketplace' = ${marketplace}`
      );
    }

    const country = searchParams.get("country");
    if (country) {
      conditions.push(
        sql`${aac.rawData}->>'Country' = ${country}`
      );
    }

    const clientStatus = searchParams.get("clientStatus");
    if (clientStatus) {
      conditions.push(ilike(aac.clientStatus, clientStatus));
    } else {
      // Default: only Active clients
      conditions.push(ilike(aac.clientStatus, "active"));
    }

    const clientIDCode = searchParams.get("clientIDCode");
    if (clientIDCode) {
      conditions.push(eq(aac.clientIdCode, clientIDCode));
    }

    const rows = await db
      .select({
        clientIdCode: aac.clientIdCode,
        clientStatus: aac.clientStatus,
        clientName: aac.clientName,
        rawData: aac.rawData,
      })
      .from(aac)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        sql`CAST(${aac.rawData}->>'Tier' AS INTEGER) ASC NULLS LAST`,
        asc(aac.clientName)
      )
      .limit(200);

    // Map to BQ-compatible PascalCase shape
    const clients: AACClient[] = rows.map((row) => {
      const raw = typeof row.rawData === "string"
        ? JSON.parse(row.rawData)
        : (row.rawData || {}) as Record<string, string>;

      return {
        ClientStatus: row.clientStatus || raw.ClientStatus || null,
        ClientName: row.clientName || raw.ClientName || null,
        ClientIDCode: row.clientIdCode || raw.ClientIDCode || null,
        BrandName: raw.BrandName || row.clientName || null,
        Marketplace: raw.Marketplace || null,
        Country: raw.Country || null,
        Tier: raw.Tier ? Number(raw.Tier) : null,
        BrandURL: raw.BrandURL || null,
        Competitor1Name: raw.Competitor1Name || null,
        Competitor1URL: raw.Competitor1URL || null,
        Competitor2Name: raw.Competitor2Name || null,
        Competitor2URL: raw.Competitor2URL || null,
        Competitor3Name: raw.Competitor3Name || null,
        Competitor3URL: raw.Competitor3URL || null,
        Competitor4Name: raw.Competitor4Name || null,
        Competitor4URL: raw.Competitor4URL || null,
        Competitor5Name: raw.Competitor5Name || null,
        Competitor5URL: raw.Competitor5URL || null,
      };
    });

    return NextResponse.json({ clients });
  } catch (error: unknown) {
    console.error("Clients error:", error);
    return serverError(error, "Failed to fetch clients");
  }
}
