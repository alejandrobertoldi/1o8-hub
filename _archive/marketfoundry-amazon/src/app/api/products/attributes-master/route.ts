import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { asc } from "drizzle-orm";
import { attributesMaster } from "@/lib/db/schema";

// Pivot/table-presence columns (BQ_AAC, aac, BQ_Master, master, …) are
// intentionally omitted from main's Drizzle type for attributesMaster
// (see src/lib/db/schema.ts ~line 2780). They are not exposed by this
// endpoint until pivot support is restored via raw SQL or schema extension.
const ATTR_COLUMNS = [
  "UUID", "Attributes_HubLabel", "Attributes_ReferenceGroup", "Attributes_ReferenceSubgroup",
  "Attributes_ClientSummaryCardName", "Attributes_ClientSummaryCardOrder",
  "Attributes_PDPCardName", "Attributes_PDPSubcardName",
  "Attributes_PDPCardOrder", "Attributes_PDPSubcardOrder",
  "Attributes_Description", "Attributes_CLRLabel", "Attributes_ALRLabel",
  "Attributes_Requirement", "Attributes_source", "Attributes_format",
  "PG_Attributes_Type", "BQ_Attributes_Type", "Attributes_ValidValues",
];

const FIELD_TO_COLUMN: Record<string, string> = {
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

type AttrRow = Record<string, unknown>;

function rowToEntry(row: AttrRow): Record<string, string> {
  const entry: Record<string, string> = {};
  for (const field of ATTR_COLUMNS) {
    const col = FIELD_TO_COLUMN[field];
    const val = col ? row[col] : undefined;
    entry[field] = val === null || val === undefined ? "" : String(val);
  }
  return entry;
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(attributesMaster)
    .orderBy(asc(attributesMaster.attributesPdpCardOrder));

  const result = rows.map(rowToEntry);

  return NextResponse.json({ columns: ATTR_COLUMNS, rows: result });
}
