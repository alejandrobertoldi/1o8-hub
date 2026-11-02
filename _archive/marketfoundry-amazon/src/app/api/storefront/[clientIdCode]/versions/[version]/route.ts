import { hasAdminPowers } from "@/lib/roles";
/** PATCH /api/storefront/[clientIdCode]/versions/[version] — set this version's status. */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { storefrontVersions } from "@/lib/db/schema";

const VALID = ["not_started", "in_progress", "in_review", "approved", "live"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string; version: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode, version } = await params;
  const versionNumber = parseInt(version, 10);
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    return NextResponse.json({ error: "Invalid version" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!status || !VALID.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await db
    .update(storefrontVersions)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(storefrontVersions.clientIdCode, clientIdCode),
        eq(storefrontVersions.versionNumber, versionNumber)
      )
    )
    .returning({ id: storefrontVersions.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
