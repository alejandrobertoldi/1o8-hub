import { hasAdminPowers } from "@/lib/roles";
/**
 * GET   — list all versions [{version,status,updatedAt}] + current (highest).
 *         Ensures V01 exists.
 * POST  — bump to the next version, copying content + Drive assets forward.
 */
import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth-db";
import {
  createNextStorefrontVersion,
  ensureStorefrontVersion,
  getStorefrontVersions,
} from "@/lib/storefront/drive";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientIdCode } = await params;
  try {
    const current = await ensureStorefrontVersion(clientIdCode);
    const rows = await getStorefrontVersions(clientIdCode);
    return NextResponse.json({
      current: current.versionNumber,
      versions: rows.map((r) => ({
        version: r.versionNumber,
        status: r.status,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
        driveFolderUrl: r.driveFolderGid
          ? `https://drive.google.com/drive/folders/${r.driveFolderGid}`
          : null,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Drive folder error: ${msg}` }, { status: 502 });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;
  try {
    const created = await createNextStorefrontVersion(clientIdCode);
    return NextResponse.json({ version: created.versionNumber });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Version bump failed: ${msg}` }, { status: 502 });
  }
}
