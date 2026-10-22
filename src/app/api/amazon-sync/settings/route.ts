import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 60;

const PROVIDER_KEY = "amazon_sync_provider";
const VALID_PROVIDERS = ["rainforest", "firecrawl"] as const;
export type SyncProvider = (typeof VALID_PROVIDERS)[number];

// GET — return current provider setting
export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select()
    .from(seoSettings)
    .where(eq(seoSettings.key, PROVIDER_KEY))
    .limit(1);

  return NextResponse.json({
    provider: (row?.value as SyncProvider) || "rainforest",
  });
}

// PUT — update provider (admin only)
export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { provider } = body as { provider: string };

  if (!VALID_PROVIDERS.includes(provider as SyncProvider)) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` },
      { status: 400 }
    );
  }

  await db
    .insert(seoSettings)
    .values({
      key: PROVIDER_KEY,
      value: provider,
      updatedAt: new Date(),
      updatedBy: session.user.email ?? "",
    })
    .onConflictDoUpdate({
      target: seoSettings.key,
      set: {
        value: provider,
        updatedAt: new Date(),
        updatedBy: session.user.email ?? "",
      },
    });

  return NextResponse.json({ success: true, provider });
}
