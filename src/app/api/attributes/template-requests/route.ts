/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  attributeTemplateRequests,
  categoryDefinitions,
  driveFolders,
  master,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { driveClient } from "@/lib/drive-client";
import { sheetsClient } from "@/lib/sheets-client";
import { buildCreateRequests, type TemplateConfig } from "@/lib/template-sheet-builder";
import { getProductFieldValue } from "@/lib/product-mapper";
import { CLIENT_NAMES } from "@/lib/constants";
import { pickAttributesForLevels } from "@/lib/template-attributes";
import { categoryDefinitionColumns, type CategoryDefinitionRow } from "@/lib/category-definitions/columns";

// POST /api/attributes/template-requests
// Provisions a Google Sheet in the client's Templates/InProgress folder,
// sets anyone-with-link editor permission, snapshots catalog values,
// and inserts a new template_requests row.
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientIdCode, productType, scope, levels } = await req.json();

  if (!clientIdCode || !productType || !scope || !levels?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const serviceAccountEmail = process.env.GCP_CLIENT_EMAIL?.trim();
  if (!serviceAccountEmail) {
    return NextResponse.json({ error: "GCP_CLIENT_EMAIL not configured" }, { status: 500 });
  }

  const masterTemplateId = process.env.ATTRIBUTE_TEMPLATE_MASTER_ID?.trim();
  if (!masterTemplateId) {
    return NextResponse.json(
      { error: "ATTRIBUTE_TEMPLATE_MASTER_ID not configured — see src/lib/template-apps-script.ts for master-template setup steps" },
      { status: 500 }
    );
  }

  const generatedDate = new Date().toISOString().split("T")[0];

  // ── Resolve client root folder ──
  const [clientRoot] = await db
    .select()
    .from(driveFolders)
    .where(
      and(eq(driveFolders.clientIdCode, clientIdCode), eq(driveFolders.folderType, "client"))
    )
    .limit(1);

  if (!clientRoot) {
    return NextResponse.json(
      { error: "Client Drive root folder not found — complete onboarding first" },
      { status: 400 }
    );
  }

  // ── Ensure Templates/InProgress and Templates/Archive exist ──
  const { inProgressId, archiveId } = await ensureTemplateFolders(clientIdCode, clientRoot);

  // ── Gather attributes + products (reusing current scope logic) ──
  const sheets = await buildTemplateSheets(clientIdCode, productType, scope, levels);
  if (sheets.length === 0) {
    return NextResponse.json({ error: "No attributes match the selected filters" }, { status: 400 });
  }

  // ── Copy master template into InProgress, grant anyone-link writer ──
  // We copy (vs. create) so the master's container-bound onEdit Apps Script
  // tags along with the new file. The Apps Script API can't attach scripts
  // via service accounts (it requires a per-user API opt-in), so baking the
  // script into a master and cloning it is the supported workaround.
  const title = `${CLIENT_NAMES[clientIdCode] || clientIdCode} — Attribute Template — ${generatedDate}`;
  const copied = await driveClient.copyFile(masterTemplateId, title, inProgressId);
  const spreadsheetId = copied.id;
  await driveClient.setAnyoneLinkWriter(spreadsheetId);

  // Snapshot the master's pre-existing tabs so we can drop them after the
  // new tabs are added (a spreadsheet must always have ≥1 sheet).
  const masterTabs = await sheetsClient.getSheetIds(spreadsheetId);

  // ── Build batchUpdate requests and apply ──
  const config: TemplateConfig = {
    clientName: CLIENT_NAMES[clientIdCode] || clientIdCode,
    generatedDate,
    serviceAccountEmail,
    sheets,
  };
  const { requests } = buildCreateRequests(config);
  for (const tab of masterTabs) {
    requests.push({ deleteSheet: { sheetId: tab.sheetId } });
  }
  await sheetsClient.batchUpdate(spreadsheetId, requests);

  // ── Snapshot catalog values for three-way diff ──
  const seededSnapshot: Record<string, Record<string, string | null>> = {};
  for (const s of sheets) {
    for (const p of s.products) {
      if (!p.asin) continue;
      seededSnapshot[p.asin] = { ...p.values };
    }
  }

  // ── Insert template_requests row ──
  const productIds = sheets.flatMap((s) => s.products.map((p) => p.asin).filter(Boolean));
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  const [record] = await db
    .insert(attributeTemplateRequests)
    .values({
      clientIdCode,
      productType,
      scope,
      levels,
      productIds: productIds.length ? productIds : null,
      createdBy: session.user.email ?? "unknown",
      googleSheetId: spreadsheetId,
      sheetUrl,
      driveFolderId: inProgressId,
      archiveFolderId: archiveId,
      status: "in_progress",
      seededSnapshot,
    })
    .returning();

  return NextResponse.json({ request: record });
}

// DELETE /api/attributes/template-requests
// Bulk-deletes template_requests rows by id. Leaves the provisioned Google
// Sheets in Drive untouched — this only clears them from the list UI.
export async function DELETE(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ids } = await req.json().catch(() => ({ ids: null }));
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((v) => typeof v !== "string")) {
    return NextResponse.json({ error: "ids must be a non-empty string[]" }, { status: 400 });
  }

  const deleted = await db
    .delete(attributeTemplateRequests)
    .where(inArray(attributeTemplateRequests.id, ids))
    .returning({ id: attributeTemplateRequests.id });

  return NextResponse.json({ deleted: deleted.length });
}

// ── Helpers ──────────────────────────────────────────────────

async function ensureTemplateFolders(
  clientIdCode: string,
  clientRoot: typeof driveFolders.$inferSelect
): Promise<{ inProgressId: string; archiveId: string }> {
  const templatesPath = `${clientRoot.path}/Templates`;
  const inProgressPath = `${templatesPath}/InProgress`;
  const archivePath = `${templatesPath}/Archive`;

  // 1. Templates root
  const templatesRoot = await findOrCreateFolder({
    clientIdCode,
    parentDriveId: clientRoot.driveFolderId,
    parentDbId: clientRoot.id,
    path: templatesPath,
    name: `${clientIdCode}_Templates`,
    folderType: "templates",
  });

  // 2. InProgress + Archive
  const inProgress = await findOrCreateFolder({
    clientIdCode,
    parentDriveId: templatesRoot.driveFolderId,
    parentDbId: templatesRoot.id,
    path: inProgressPath,
    name: `${clientIdCode}_Templates_InProgress`,
    folderType: "templates_in_progress",
  });
  const archive = await findOrCreateFolder({
    clientIdCode,
    parentDriveId: templatesRoot.driveFolderId,
    parentDbId: templatesRoot.id,
    path: archivePath,
    name: `${clientIdCode}_Templates_Archive`,
    folderType: "templates_archive",
  });

  return { inProgressId: inProgress.driveFolderId, archiveId: archive.driveFolderId };
}

async function findOrCreateFolder(opts: {
  clientIdCode: string;
  parentDriveId: string;
  parentDbId: string;
  path: string;
  name: string;
  folderType: string;
}): Promise<{ id: string; driveFolderId: string }> {
  const existing = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(and(eq(driveFolders.clientIdCode, opts.clientIdCode), eq(driveFolders.path, opts.path)))
    .limit(1);
  if (existing[0]) return existing[0];

  const folder = await driveClient.createFolder(opts.name, opts.parentDriveId);
  const inserted = await db
    .insert(driveFolders)
    .values({
      clientIdCode: opts.clientIdCode,
      driveFolderId: folder.id,
      folderType: opts.folderType,
      path: opts.path,
      parentFolderId: opts.parentDbId,
      name: opts.name,
    })
    .onConflictDoNothing({ target: [driveFolders.clientIdCode, driveFolders.path] })
    .returning({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId });

  if (inserted[0]) return inserted[0];
  // Race fallback
  const refetch = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(and(eq(driveFolders.clientIdCode, opts.clientIdCode), eq(driveFolders.path, opts.path)))
    .limit(1);
  if (!refetch[0]) throw new Error(`Folder creation race failed for ${opts.path}`);
  return refetch[0];
}

async function buildTemplateSheets(
  clientIdCode: string,
  productType: string,
  scope: string,
  levels: string[]
): Promise<TemplateConfig["sheets"]> {
  // Never select baseline_snapshot here — see categoryDefinitionColumns.
  let defs: CategoryDefinitionRow[];
  if (productType === "all") {
    defs = await db.select(categoryDefinitionColumns).from(categoryDefinitions).where(eq(categoryDefinitions.clientIdCode, clientIdCode));
  } else {
    defs = await db
      .select(categoryDefinitionColumns)
      .from(categoryDefinitions)
      .where(
        and(eq(categoryDefinitions.clientIdCode, clientIdCode), eq(categoryDefinitions.productType, productType))
      );
  }

  const result: TemplateConfig["sheets"] = [];
  for (const def of defs) {
    const { attrs: filtered, useIdentityHeaders } = await pickAttributesForLevels(
      def.marketplaceId,
      def.productType,
      levels,
    );
    if (filtered.length === 0) continue;

    let products: TemplateConfig["sheets"][number]["products"] = [];
    if (scope === "new") {
      products = Array.from({ length: 10 }, () => ({ name: "", asin: "", values: {} }));
    } else {
      let dbProducts = await db
        .select()
        .from(master)
        .where(and(eq(master.clientIdCode, clientIdCode), eq(master.productType, def.productType)));
      if (scope === "gaps") {
        dbProducts = dbProducts.filter((p) =>
          filtered.some((attr) => {
            const val = getProductFieldValue(p, attr.generalLabel);
            return !val || val.trim() === "";
          })
        );
      }
      products = dbProducts.map((p) => {
        const values: Record<string, string> = {};
        for (const attr of filtered) {
          values[attr.generalLabel] = getProductFieldValue(p, attr.generalLabel) || "";
        }
        return {
          name: getProductFieldValue(p, "ItemName") || "",
          asin: getProductFieldValue(p, "ASIN") || "",
          values,
        };
      });
    }
    result.push({
      productType: def.productType,
      attributes: filtered,
      products,
      useIdentityHeaders,
    });
  }
  return result;
}

