import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, variations } from "@/lib/db/schema";
import { parentThemeBqNames } from "@/lib/seo/parent-variation-fill";
import { aplus2VariationIdSql } from "@/lib/aplus2/variation-scope.server";
import { uniqueRowsByAsin } from "@/lib/aplus2/variation-scope";

const variationValue = (key: "Color" | "Size" | "Flavor" | "Style") =>
  sql<string | null>`NULLIF(COALESCE(
    ${master.variations}->>${key},
    ${master.otherAttributes}->>${key},
    ${master.rawColumnValues}->>${key}
  ), '')`;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientIdCode = searchParams.get("clientIdCode")?.trim();
  const variationId = searchParams.get("variationId")?.trim();
  if (!clientIdCode) {
    return NextResponse.json(
      { error: "clientIdCode is required" },
      { status: 400 },
    );
  }

  const rows = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      itemName: master.itemName,
      summarizedTitle: master.summarizedTitle,
      parentAsin: master.parentAsin,
      parentageLevel: master.parentageLevel,
      status: master.status,
      variationId: aplus2VariationIdSql,
      variationName: variations.name,
      themeAttributes: variations.themeAttributes,
      variationThemeName: sql<string | null>`NULLIF(COALESCE(
        ${master.variations}->>'VariationThemeName',
        ${master.otherAttributes}->>'VariationThemeName',
        ${master.rawColumnValues}->>'VariationThemeName'
      ), '')`,
      color: variationValue("Color"),
      size: variationValue("Size"),
      flavor: variationValue("Flavor"),
      style: variationValue("Style"),
    })
    .from(master)
    .leftJoin(variations, eq(variations.id, master.variationRef))
    .where(
      and(
        eq(master.clientIdCode, clientIdCode),
        variationId
          ? sql`${aplus2VariationIdSql} = ${variationId}`
          : sql`${aplus2VariationIdSql} IS NOT NULL`,
      ),
    )
    .orderBy(
      sql`CASE WHEN lower(${master.parentageLevel}) = 'parent' THEN 0 ELSE 1 END`,
      master.asin,
    );

  const members = uniqueRowsByAsin(
    rows.filter(
      (row): row is typeof row & { asin: string } => Boolean(row.asin),
    ),
  );
  const configuredAxes = members
    .flatMap((row) => row.themeAttributes ?? [])
    .map((axis) => axis.trim())
    .filter(Boolean);
  const fallbackAxes = members.flatMap((row) =>
    parentThemeBqNames(row.variationThemeName),
  );
  const supported = new Set(["Color", "Size", "Flavor", "Style"]);
  const themeAttributes = [...new Set([...configuredAxes, ...fallbackAxes])]
    .map((axis) => axis[0]?.toUpperCase() + axis.slice(1).toLowerCase())
    .filter((axis) => supported.has(axis));

  return NextResponse.json({
    variationId: variationId ?? null,
    variationName: variationId ? members[0]?.variationName ?? null : null,
    parentAsin: variationId
      ? members.find((row) => row.parentageLevel?.toLowerCase() === "parent")?.asin
        ?? members[0]?.parentAsin
        ?? null
      : null,
    themeAttributes,
    members: members.map((member) => ({
      id: member.id,
      asin: member.asin,
      sku: member.sku,
      itemName: member.itemName,
      summarizedTitle: member.summarizedTitle,
      parentAsin: member.parentAsin,
      parentageLevel: member.parentageLevel,
      status: member.status,
      variationId: member.variationId,
      variationName: member.variationName,
      color: member.color,
      size: member.size,
      flavor: member.flavor,
      style: member.style,
    })),
  });
}
