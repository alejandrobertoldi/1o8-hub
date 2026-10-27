import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { isValidDateString } from "@/lib/hours/validation";
import { adminExportEntries } from "@/lib/hours/analytics-queries";
import {
  adminHoursExportFilename,
  generateAdminHoursXlsx,
  toAdminHoursExportEntry,
} from "@/lib/hours/export";
import { driveClient, sharedDriveId } from "@/lib/drive-client";

export const runtime = "nodejs";
export const maxDuration = 60;

// Team-wide sheets aren't tied to one client, so they live in one shared-drive folder.
const SHEETS_FOLDER_NAME = "1o8_Hours_Exports";

type Filters = {
  from: string;
  to: string;
  userIds: string[];
  clientIdCodes: string[];
  categories: string[];
};

/** Admin gate + filter parsing shared by the download and the Sheets save. */
async function authorizeAndParse(req: NextRequest): Promise<Filters | NextResponse> {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to || !isValidDateString(from) || !isValidDateString(to)) {
    return NextResponse.json(
      { error: "from and to are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }
  if (from > to) {
    return NextResponse.json(
      { error: "from must be on or before to" },
      { status: 400 }
    );
  }

  return {
    from,
    to,
    userIds: sp.getAll("userId"),
    clientIdCodes: sp.getAll("client"),
    categories: sp.getAll("category"),
  };
}

async function loadEntries(f: Filters) {
  const rows = await adminExportEntries(f);
  return rows.map(toAdminHoursExportEntry);
}

async function resolveSheetsFolder(): Promise<string> {
  const root = sharedDriveId();
  const existing = await driveClient.findChildFolder(root, SHEETS_FOLDER_NAME);
  if (existing) return existing.id;
  const created = await driveClient.createFolder(SHEETS_FOLDER_NAME, root);
  return created.id;
}

/** Download the filtered team hours as .xlsx. */
export async function GET(req: NextRequest) {
  const parsed = await authorizeAndParse(req);
  if (parsed instanceof NextResponse) return parsed;

  const entries = await loadEntries(parsed);
  const buffer = generateAdminHoursXlsx(entries);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${adminHoursExportFilename(parsed.from, parsed.to)}"`,
    },
  });
}

/** Save the filtered team hours as a Google Sheet in the shared drive. */
export async function POST(req: NextRequest) {
  const parsed = await authorizeAndParse(req);
  if (parsed instanceof NextResponse) return parsed;

  const entries = await loadEntries(parsed);
  if (entries.length === 0) {
    return NextResponse.json({ error: "No hours match the current filters" }, { status: 400 });
  }

  let folderId: string;
  try {
    folderId = await resolveSheetsFolder();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to locate the 1o8_Hours_Exports Drive folder" },
      { status: 500 }
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const sheetName = `${adminHoursExportFilename(parsed.from, parsed.to).replace(/\.xlsx$/, "")}_${stamp}`;
  const driveFile = await driveClient.uploadAsSheet(sheetName, folderId, generateAdminHoursXlsx(entries));

  return NextResponse.json({
    fileId: driveFile.id,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${driveFile.id}/edit`,
    folderId,
    count: entries.length,
    name: driveFile.name,
  });
}
