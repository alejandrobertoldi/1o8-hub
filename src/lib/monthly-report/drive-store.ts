import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { driveFolders } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { generatePrintArtifacts } from "@/lib/monthly-report/pdf-render";
import type { Report } from "@/components/monthly-report/types";

export function reportsFolderName(clientIdCode: string): string {
  return `${clientIdCode}_Reports`;
}

export function monthlyReportsFolderName(clientIdCode: string): string {
  return `${clientIdCode}_Monthly_Reports`;
}

export function reportsFolderPath(clientIdCode: string): string {
  return `${clientIdCode}/Reports`;
}

export function monthlyReportsFolderPath(clientIdCode: string): string {
  return `${clientIdCode}/Reports/Monthly_Reports`;
}

export function monthlyReportPdfFilename(clientIdCode: string, period: string): string {
  return `${clientIdCode}_${period}_monthly-report.pdf`;
}

export function monthlyReportHtmlFilename(clientIdCode: string, period: string): string {
  return `${clientIdCode}_${period}_monthly-report.html`;
}

type FolderRow = { id: string; driveFolderId: string; path: string };

async function ensureFolder(opts: {
  clientIdCode: string;
  parent: FolderRow;
  name: string;
  folderType: string;
  path: string;
}): Promise<FolderRow> {
  const [existing] = await db
    .select({
      id: driveFolders.id,
      driveFolderId: driveFolders.driveFolderId,
      path: driveFolders.path,
    })
    .from(driveFolders)
    .where(and(
      eq(driveFolders.clientIdCode, opts.clientIdCode),
      eq(driveFolders.path, opts.path),
    ))
    .limit(1);

  if (existing) {
    const alive = await driveClient.isFolderAlive(existing.driveFolderId);
    if (alive) return existing;
    await db.delete(driveFolders).where(eq(driveFolders.id, existing.id));
  }

  const found = await driveClient.findChildFolder(opts.parent.driveFolderId, opts.name);
  const createdNew = !found;
  const driveId = found?.id ?? (await driveClient.createFolder(opts.name, opts.parent.driveFolderId)).id;

  const inserted = await db
    .insert(driveFolders)
    .values({
      clientIdCode: opts.clientIdCode,
      driveFolderId: driveId,
      folderType: opts.folderType,
      path: opts.path,
      parentFolderId: opts.parent.id,
      name: opts.name,
    })
    .onConflictDoNothing()
    .returning({
      id: driveFolders.id,
      driveFolderId: driveFolders.driveFolderId,
      path: driveFolders.path,
    });
  if (inserted[0]) return inserted[0];

  const [winner] = await db
    .select({
      id: driveFolders.id,
      driveFolderId: driveFolders.driveFolderId,
      path: driveFolders.path,
    })
    .from(driveFolders)
    .where(and(
      eq(driveFolders.clientIdCode, opts.clientIdCode),
      eq(driveFolders.path, opts.path),
    ))
    .limit(1);
  if (!winner) throw new Error(`Failed to resolve Drive folder ${opts.path}`);

  if (createdNew && winner.driveFolderId !== driveId) {
    try { await driveClient.deleteFile(driveId); }
    catch { /* leftover empty duplicate — ignore */ }
  }
  return winner;
}

/** `{CODE}_Reports/{CODE}_Monthly_Reports` inside the client Drive root. */
export async function resolveMonthlyReportsFolder(clientIdCode: string): Promise<string> {
  const [root] = await db
    .select({
      id: driveFolders.id,
      driveFolderId: driveFolders.driveFolderId,
      path: driveFolders.path,
    })
    .from(driveFolders)
    .where(and(
      eq(driveFolders.clientIdCode, clientIdCode),
      eq(driveFolders.folderType, "client"),
    ))
    .limit(1);

  if (!root) {
    throw new Error(`No Drive root folder for client ${clientIdCode}. Complete onboarding (drive_folders step) first.`);
  }

  const reports = await ensureFolder({
    clientIdCode,
    parent: root,
    name: reportsFolderName(clientIdCode),
    folderType: "reports",
    path: reportsFolderPath(clientIdCode),
  });

  const monthly = await ensureFolder({
    clientIdCode,
    parent: reports,
    name: monthlyReportsFolderName(clientIdCode),
    folderType: "monthly_reports",
    path: monthlyReportsFolderPath(clientIdCode),
  });

  return monthly.driveFolderId;
}

export async function upsertMonthlyReportPdf(opts: {
  folderDriveId: string;
  clientIdCode: string;
  period: string;
  pdfBuffer: Buffer;
}): Promise<{ driveId: string; filename: string; overwritten: boolean }> {
  return upsertMonthlyReportFile({
    folderDriveId: opts.folderDriveId,
    filename: monthlyReportPdfFilename(opts.clientIdCode, opts.period),
    buffer: opts.pdfBuffer,
    mimeType: "application/pdf",
  });
}

export async function upsertMonthlyReportHtml(opts: {
  folderDriveId: string;
  clientIdCode: string;
  period: string;
  htmlBuffer: Buffer;
}): Promise<{ driveId: string; filename: string; overwritten: boolean }> {
  return upsertMonthlyReportFile({
    folderDriveId: opts.folderDriveId,
    filename: monthlyReportHtmlFilename(opts.clientIdCode, opts.period),
    buffer: opts.htmlBuffer,
    mimeType: "text/html",
  });
}

async function upsertMonthlyReportFile(opts: {
  folderDriveId: string;
  filename: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ driveId: string; filename: string; overwritten: boolean }> {
  const escapedName = opts.filename.replace(/'/g, "\\'");
  const existing = await driveClient.listFiles(
    `'${opts.folderDriveId}' in parents and name = '${escapedName}' and mimeType = '${opts.mimeType}' and trashed = false`
  );

  const driveFile = existing.files.length > 0
    ? await driveClient.updateFileContent(existing.files[0].id, opts.buffer, opts.mimeType)
    : await driveClient.uploadFile(opts.filename, opts.folderDriveId, opts.buffer, opts.mimeType);

  return {
    driveId: driveFile.id,
    filename: opts.filename,
    overwritten: existing.files.length > 0,
  };
}

export function driveFileViewUrl(driveId: string): string {
  return `https://drive.google.com/file/d/${driveId}/view`;
}

export function driveFileDownloadUrl(driveId: string): string {
  return `https://drive.google.com/uc?export=download&id=${driveId}`;
}

/** Look up an already-uploaded HTML archive without creating folders. */
export async function findMonthlyReportHtml(opts: {
  clientIdCode: string;
  period: string;
}): Promise<{ driveId: string; filename: string } | null> {
  const [folder] = await db
    .select({ driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(and(
      eq(driveFolders.clientIdCode, opts.clientIdCode),
      eq(driveFolders.path, monthlyReportsFolderPath(opts.clientIdCode)),
    ))
    .limit(1);
  if (!folder) return null;

  const filename = monthlyReportHtmlFilename(opts.clientIdCode, opts.period);
  const escapedName = filename.replace(/'/g, "\\'");
  const existing = await driveClient.listFiles(
    `'${folder.driveFolderId}' in parents and name = '${escapedName}' and trashed = false`
  );
  const file = existing.files[0];
  if (!file) return null;
  return { driveId: file.id, filename };
}

/** The HTML sibling written on generate — this is the client email body. */
export async function loadArchivedReportHtml(opts: {
  clientIdCode: string;
  period: string;
}): Promise<string | null> {
  const file = await findMonthlyReportHtml(opts);
  if (!file) return null;
  const bytes = await driveClient.downloadFileContent(file.driveId);
  return Buffer.from(bytes).toString("utf8");
}

export async function saveMonthlyReportPdf(opts: {
  clientIdCode: string;
  period: string;
  report: Report;
  origin: string;
}): Promise<{
  driveUrl: string;
  driveId: string;
  filename: string;
  overwritten: boolean;
  htmlUrl: string;
  htmlFilename: string;
}> {
  const { pdf, html } = await generatePrintArtifacts(opts.origin, opts.report);
  const folderDriveId = await resolveMonthlyReportsFolder(opts.clientIdCode);
  const saved = await upsertMonthlyReportPdf({
    folderDriveId,
    clientIdCode: opts.clientIdCode,
    period: opts.period,
    pdfBuffer: pdf,
  });
  const htmlSaved = await upsertMonthlyReportHtml({
    folderDriveId,
    clientIdCode: opts.clientIdCode,
    period: opts.period,
    htmlBuffer: html,
  });
  return {
    driveUrl: driveFileViewUrl(saved.driveId),
    driveId: saved.driveId,
    filename: saved.filename,
    overwritten: saved.overwritten,
    htmlUrl: driveFileDownloadUrl(htmlSaved.driveId),
    htmlFilename: htmlSaved.filename,
  };
}
