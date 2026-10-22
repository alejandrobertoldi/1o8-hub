import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { categoryDefinitions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseCategoryReport } from "@/lib/category-report-parser";
import { upsertCategoryDefinitions } from "@/lib/category-definitions/upsert";
import { categoryDefinitionColumns } from "@/lib/category-definitions/columns";
import { upsertAttributesMasterFromReports } from "@/lib/attributes-master/upload";
import { hasAdminPowers } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");

  // Never select baseline_snapshot here — see categoryDefinitionColumns.
  const query = clientIdCode
    ? db
        .select(categoryDefinitionColumns)
        .from(categoryDefinitions)
        .where(eq(categoryDefinitions.clientIdCode, clientIdCode))
        .orderBy(categoryDefinitions.productType)
    : db
        .select(categoryDefinitionColumns)
        .from(categoryDefinitions)
        .orderBy(categoryDefinitions.clientIdCode, categoryDefinitions.productType);

  const definitions = await query;
  return NextResponse.json({ definitions });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "editor" && !hasAdminPowers(session.user.role)) {
    return NextResponse.json(
      { error: "Forbidden: editors or admins only" },
      { status: 403 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const clientIdCode = formData.get("clientIdCode") as string | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!clientIdCode) {
    return NextResponse.json({ error: "clientIdCode is required" }, { status: 400 });
  }

  let parsedReports;
  try {
    const buffer = await file.arrayBuffer();
    parsedReports = parseCategoryReport(buffer).reports;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to parse report: ${msg}` }, { status: 400 });
  }
  if (parsedReports.length === 0) {
    return NextResponse.json({ error: "No product types found in report" }, { status: 400 });
  }

  const { definitions, matchCount } = await upsertCategoryDefinitions({
    clientIdCode,
    uploadedBy: session.user.email ?? "unknown",
    parsedReports,
  });

  // New: also write into attributes_master + junction tables.
  // Uses the audit row id from the first parsed report's def (one per
  // (clientIdCode, productType, marketplace); we use the first as the
  // upload identifier for provenance.source_upload_id).
  const uploadId = definitions[0]?.id;
  let attributesMasterResult = {
    canonicalInserted: 0,
    canonicalMatched: 0,
    provenanceWritten: 0,
    divergencesDetected: 0,
  };
  if (uploadId) {
    attributesMasterResult = await upsertAttributesMasterFromReports({
      uploadId,
      clientIdCode,
      parsedReports,
    });
  }

  const firstReport = parsedReports[0];
  return NextResponse.json({
    definitions,
    productTypes: parsedReports.map((r) => r.productType),
    summary: firstReport.summary,
    marketplace: firstReport.marketplace,
    matchCount,
    attributesMaster: attributesMasterResult,
  });
}
