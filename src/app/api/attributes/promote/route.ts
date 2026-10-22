import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { attributeClientProvenance } from "@/lib/db/schema";
import { sql, eq, and } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

const PROMOTABLE_FIELDS = ["requirement", "description", "validValues"] as const;
type PromotableField = (typeof PROMOTABLE_FIELDS)[number];

interface PromoteBody {
  attributeUuid: string;
  clientIdCode: string;
  productType: string;
  marketplaceId: string;
  field: PromotableField;
}

function isPromotableField(v: unknown): v is PromotableField {
  return typeof v === "string" && (PROMOTABLE_FIELDS as readonly string[]).includes(v);
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  let body: PromoteBody;
  try {
    body = (await req.json()) as PromoteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { attributeUuid, clientIdCode, productType, marketplaceId, field } = body;
  if (
    typeof attributeUuid !== "string" ||
    typeof clientIdCode !== "string" ||
    typeof productType !== "string" ||
    typeof marketplaceId !== "string" ||
    !isPromotableField(field)
  ) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }

  // Load the provenance row to read the client value for the target field.
  const provRow = await db
    .select()
    .from(attributeClientProvenance)
    .where(
      and(
        eq(attributeClientProvenance.attributeUuid, attributeUuid),
        eq(attributeClientProvenance.clientIdCode, clientIdCode),
        eq(attributeClientProvenance.productType, productType),
        eq(attributeClientProvenance.marketplaceId, marketplaceId),
      )
    )
    .limit(1);
  if (provRow.length === 0) {
    return NextResponse.json({ error: "Provenance row not found" }, { status: 404 });
  }
  const prov = provRow[0];

  // For each promotable field: copy client_* into the canonical column,
  // null out the client_* column. Other fields untouched.
  // Done in a single SQL UPDATE for atomicity (no transaction needed).
  if (field === "requirement") {
    if (prov.clientRequirement === null) {
      return NextResponse.json(
        { error: "No divergence to promote for requirement" },
        { status: 400 }
      );
    }
    await db.execute(sql`
      UPDATE attributes_master
      SET "Attributes_Requirement" = ${prov.clientRequirement}
      WHERE "UUID" = ${attributeUuid}::uuid
    `);
    await db
      .update(attributeClientProvenance)
      .set({ clientRequirement: null })
      .where(
        and(
          eq(attributeClientProvenance.attributeUuid, attributeUuid),
          eq(attributeClientProvenance.clientIdCode, clientIdCode),
          eq(attributeClientProvenance.productType, productType),
          eq(attributeClientProvenance.marketplaceId, marketplaceId),
        )
      );
  } else if (field === "description") {
    if (prov.clientDescription === null) {
      return NextResponse.json(
        { error: "No divergence to promote for description" },
        { status: 400 }
      );
    }
    await db.execute(sql`
      UPDATE attributes_master
      SET "Attributes_Description" = ${prov.clientDescription}
      WHERE "UUID" = ${attributeUuid}::uuid
    `);
    await db
      .update(attributeClientProvenance)
      .set({ clientDescription: null })
      .where(
        and(
          eq(attributeClientProvenance.attributeUuid, attributeUuid),
          eq(attributeClientProvenance.clientIdCode, clientIdCode),
          eq(attributeClientProvenance.productType, productType),
          eq(attributeClientProvenance.marketplaceId, marketplaceId),
        )
      );
  } else {
    // validValues — write a JSON object keyed by productType, merge into
    // existing Attributes_ValidValues if present.
    if (prov.clientValidValues === null) {
      return NextResponse.json(
        { error: "No divergence to promote for validValues" },
        { status: 400 }
      );
    }
    const newPayload = JSON.stringify({ [productType]: prov.clientValidValues });
    await db.execute(sql`
      UPDATE attributes_master
      SET "Attributes_ValidValues" = COALESCE(
        (
          SELECT (
            COALESCE("Attributes_ValidValues"::jsonb, '{}'::jsonb)
            || ${newPayload}::jsonb
          )::text
          FROM attributes_master WHERE "UUID" = ${attributeUuid}::uuid
        ),
        ${newPayload}
      )
      WHERE "UUID" = ${attributeUuid}::uuid
    `);
    await db
      .update(attributeClientProvenance)
      .set({ clientValidValues: null })
      .where(
        and(
          eq(attributeClientProvenance.attributeUuid, attributeUuid),
          eq(attributeClientProvenance.clientIdCode, clientIdCode),
          eq(attributeClientProvenance.productType, productType),
          eq(attributeClientProvenance.marketplaceId, marketplaceId),
        )
      );
  }

  return NextResponse.json({ ok: true, promotedField: field });
}
