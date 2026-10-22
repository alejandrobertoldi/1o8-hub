import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { spApiCredentials, aac } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SPAPIClient, MARKETPLACE_REGIONS } from "@/lib/sp-api/client";
import { hasAdminPowers } from "@/lib/roles";

function maskToken(token: string): string {
  if (token.length <= 8) return "****" + token;
  return "****" + token.slice(-8);
}

function formatCredential(cred: typeof spApiCredentials.$inferSelect) {
  return {
    id: cred.id,
    clientIdCode: cred.clientIdCode,
    marketplaceId: cred.marketplaceId,
    sellerId: cred.sellerId,
    refreshTokenMasked: maskToken(cred.refreshToken),
    region: cred.region,
    isActive: cred.isActive,
    lastSyncAt: cred.lastSyncAt,
    createdAt: cred.createdAt,
    updatedAt: cred.updatedAt,
  };
}

const KNOWN_MARKETPLACES = new Set(Object.keys(MARKETPLACE_REGIONS));

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const all = await db.select().from(spApiCredentials).orderBy(spApiCredentials.clientIdCode);
  return NextResponse.json({
    credentials: all.map(formatCredential),
  });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { clientIdCode, marketplaceId, sellerId, refreshToken, region } =
    body as {
      clientIdCode: string;
      marketplaceId: string;
      sellerId: string;
      refreshToken: string;
      region?: string;
    };

  if (!clientIdCode || !marketplaceId || !sellerId || !refreshToken) {
    return NextResponse.json(
      { error: "clientIdCode, marketplaceId, sellerId, and refreshToken are required" },
      { status: 400 }
    );
  }

  // Validate marketplace
  if (!KNOWN_MARKETPLACES.has(marketplaceId)) {
    return NextResponse.json(
      { error: `Unknown marketplace ID: ${marketplaceId}` },
      { status: 400 }
    );
  }

  // Validate client exists
  const [client] = await db
    .select()
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  if (!client) {
    return NextResponse.json(
      { error: `Client ${clientIdCode} not found in aac_clients` },
      { status: 400 }
    );
  }

  // Check for duplicate
  const detectedRegion = region ?? MARKETPLACE_REGIONS[marketplaceId] ?? "na";

  try {
    const [created] = await db
      .insert(spApiCredentials)
      .values({
        clientIdCode,
        marketplaceId,
        sellerId,
        refreshToken,
        region: detectedRegion,
      })
      .returning();

    return NextResponse.json(formatCredential(created), { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: `Credentials already exist for ${clientIdCode} + ${marketplaceId}` },
        { status: 409 }
      );
    }
    throw err;
  }
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { id, ...fields } = body as {
    id: number;
    sellerId?: string;
    refreshToken?: string;
    isActive?: boolean;
    region?: string;
  };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (fields.sellerId !== undefined) updates.sellerId = fields.sellerId;
  if (fields.refreshToken !== undefined) updates.refreshToken = fields.refreshToken;
  if (fields.isActive !== undefined) updates.isActive = fields.isActive;
  if (fields.region !== undefined) updates.region = fields.region;

  const [updated] = await db
    .update(spApiCredentials)
    .set(updates)
    .where(eq(spApiCredentials.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  return NextResponse.json(formatCredential(updated));
}

export async function DELETE(req: NextRequest) {
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

  const [deleted] = await db
    .delete(spApiCredentials)
    .where(eq(spApiCredentials.id, id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
