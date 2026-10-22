import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { attributesMaster } from "@/lib/db/schema";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string })?.role;
  if (role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { uuid } = await params;
  const body = await req.json();
  const { field, value } = body as { field: string; value: string };

  if (typeof field !== "string" || typeof value !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(attributesMaster)
    .where(eq(attributesMaster.uuid, uuid))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }

  // Pivot/table-presence columns are intentionally omitted from main's Drizzle
  // type for attributesMaster (see src/lib/db/schema.ts ~line 2780). Only the
  // core attribute-definition columns are writable through this endpoint.
  // Pivot updates would need a raw `sql` escape hatch.
  const colMap: Record<string, keyof typeof attributesMaster.$inferInsert> = {
    "UUID": "uuid",
    "Attributes_HubLabel": "attributesHubLabel",
    "Attributes_ReferenceGroup": "attributesReferenceGroup",
    "Attributes_ReferenceSubgroup": "attributesReferenceSubgroup",
    "Attributes_ClientSummaryCardName": "attributesClientSummaryCardName",
    "Attributes_ClientSummaryCardOrder": "attributesClientSummaryCardOrder",
    "Attributes_PDPCardName": "attributesPdpCardName",
    "Attributes_PDPSubcardName": "attributesPdpSubcardName",
    "Attributes_PDPCardOrder": "attributesPdpCardOrder",
    "Attributes_PDPSubcardOrder": "attributesPdpSubcardOrder",
    "Attributes_Description": "attributesDescription",
    "Attributes_CLRLabel": "attributesClrLabel",
    "Attributes_ALRLabel": "attributesAlrLabel",
    "Attributes_Requirement": "attributesRequirement",
    "Attributes_source": "attibutesSource",
    "Attributes_format": "attributesFormat",
    "PG_Attributes_Type": "pgAttributesType",
    "BQ_Attributes_Type": "bqAttributesType",
    "Attributes_ValidValues": "attributesValidValues",
  };

  const dbCol = colMap[field];
  if (!dbCol) {
    return NextResponse.json({ error: "Unknown field" }, { status: 400 });
  }

  await db
    .update(attributesMaster)
    .set({ [dbCol]: value })
    .where(eq(attributesMaster.uuid, uuid));

  return NextResponse.json({ success: true });
}
