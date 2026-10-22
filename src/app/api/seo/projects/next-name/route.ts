import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthSession } from "@/lib/auth-db";
import { unauthorized, serverError } from "@/lib/api-utils";
import { allocateVersionedProjectName } from "@/lib/seo/project-version-name";

/**
 * GET /api/seo/projects/next-name?client=REA_SC_US&name=REA_SC_US_01_SEO
 *
 * Read-only preview of the name POST /api/seo/projects would allocate right now
 * (G## and V## resolved). Writes nothing and takes no lock, so a concurrent
 * create can still claim the number first — POST stays authoritative.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorized();

    const client = req.nextUrl.searchParams.get("client")?.trim();
    const name = req.nextUrl.searchParams.get("name")?.trim();
    if (!client || !name) {
      return NextResponse.json({ error: "client and name are required" }, { status: 400 });
    }

    const next = await allocateVersionedProjectName(
      db as unknown as Parameters<typeof allocateVersionedProjectName>[0],
      client,
      name,
      { lock: false }
    );
    return NextResponse.json({ name: next });
  } catch (err) {
    return serverError(err);
  }
}
