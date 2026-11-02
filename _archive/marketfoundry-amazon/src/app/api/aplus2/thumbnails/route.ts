/**
 * GET /api/aplus2/thumbnails?clientIdCode=XYZ
 *
 * Returns one representative A+2 image per set for the client (the latest
 * version that has images), as Hub-reachable proxy URLs. Drives the A+ card
 * thumbnail grid on the Design Hub landing page.
 *
 * Shape: { thumbs: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aplus2Sets, aplus2Versions, aplus2Assets, driveFiles } from "@/lib/db/schema";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  if (!clientIdCode) {
    return NextResponse.json({ error: "clientIdCode is required" }, { status: 400 });
  }

  const rows = await db.execute<{ gid: string | null }>(sql`
    SELECT DISTINCT ON (s.id) df.drive_file_id AS gid
    FROM ${aplus2Sets} s
    JOIN ${aplus2Versions} v ON v.set_id = s.id
    JOIN ${aplus2Assets} a ON a.version_id = v.id AND a.kind = 'image'
    JOIN ${driveFiles} df ON df.id = a.drive_file_id
    WHERE s.client_id_code = ${clientIdCode}
    ORDER BY s.id, v.version_number DESC, a.created_at ASC
  `);

  const thumbs = rows
    .map((r) => (r.gid ? `/api/aplus2/image?driveFileId=${encodeURIComponent(r.gid)}` : null))
    .filter((u): u is string => !!u);

  return NextResponse.json({ thumbs });
}
