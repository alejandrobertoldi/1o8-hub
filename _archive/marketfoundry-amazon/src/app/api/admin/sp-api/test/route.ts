import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { spApiCredentials } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SPAPIClient } from "@/lib/sp-api/client";
import { hasAdminPowers } from "@/lib/roles";

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { id } = body as { id: number };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const [cred] = await db
    .select()
    .from(spApiCredentials)
    .where(eq(spApiCredentials.id, id))
    .limit(1);

  if (!cred) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  const client = new SPAPIClient({
    clientId: process.env.SP_API_CLIENT_ID!,
    clientSecret: process.env.SP_API_CLIENT_SECRET!,
    refreshToken: cred.refreshToken,
    marketplaceId: cred.marketplaceId,
    sellerId: cred.sellerId,
    region: cred.region as "na" | "eu" | "fe",
  });

  try {
    await client.getAccessToken();
    return NextResponse.json({
      success: true,
      message: "Connection successful",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      success: false,
      message: `Token exchange failed: ${msg}`,
    });
  }
}
