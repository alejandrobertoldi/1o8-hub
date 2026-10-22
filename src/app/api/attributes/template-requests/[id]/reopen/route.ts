/* eslint-disable react-doctor/server-fetch-without-revalidate */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { attributeTemplateRequests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { driveClient } from "@/lib/drive-client";
import { sheetsClient } from "@/lib/sheets-client";
import { getAccessToken } from "@/lib/gcp-auth";

// PATCH /api/attributes/template-requests/[id]/reopen
// Moves the Sheet back to InProgress, clears all protected ranges, and flips status.
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [record] = await db
    .select()
    .from(attributeTemplateRequests)
    .where(eq(attributeTemplateRequests.id, id))
    .limit(1);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.status !== "finalized") {
    return NextResponse.json({ error: "Only finalized requests can be reopened" }, { status: 400 });
  }
  if (!record.googleSheetId) {
    return NextResponse.json({ error: "No sheet to reopen" }, { status: 400 });
  }

  // Fetch all existing protected ranges and delete them in one batchUpdate
  const token = await getAccessToken(["https://www.googleapis.com/auth/spreadsheets"]);
  const meta = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${record.googleSheetId}?fields=sheets.protectedRanges.protectedRangeId`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then(
    (r) =>
      r.json() as Promise<{
        sheets: Array<{ protectedRanges?: Array<{ protectedRangeId: number }> }>;
      }>
  );
  const allProtectedIds = (meta.sheets ?? []).flatMap((s) =>
    (s.protectedRanges ?? []).map((p) => p.protectedRangeId)
  );
  if (allProtectedIds.length > 0) {
    await sheetsClient.batchUpdate(
      record.googleSheetId,
      allProtectedIds.map((pid) => ({ deleteProtectedRange: { protectedRangeId: pid } }))
    );
  }

  // Move back to InProgress
  if (record.driveFolderId && record.archiveFolderId) {
    await driveClient.moveFile(record.googleSheetId, record.driveFolderId, record.archiveFolderId);
  }

  await db
    .update(attributeTemplateRequests)
    .set({ status: "reopened", finalizedAt: null, finalizedBy: null })
    .where(eq(attributeTemplateRequests.id, id));

  return NextResponse.json({ ok: true });
}
