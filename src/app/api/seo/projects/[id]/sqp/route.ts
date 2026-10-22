import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { getProjectSqp } from "@/lib/seo/sqp";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const sqp = await getProjectSqp(id);
    return NextResponse.json(sqp);
  } catch (err) {
    console.warn(`[seo/sqp] GET /api/seo/projects/${id}/sqp failed unexpectedly; returning redshift-error.`, err);
    return NextResponse.json({ available: false, reason: "redshift-error" }, { status: 200 });
  }
}
