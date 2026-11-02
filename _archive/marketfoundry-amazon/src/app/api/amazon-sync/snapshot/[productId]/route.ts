import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { amazonSyncSnapshots } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";

export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { productId } = await params;

  // Get latest snapshot
  const [latest] = await db
    .select()
    .from(amazonSyncSnapshots)
    .where(eq(amazonSyncSnapshots.productId, productId))
    .orderBy(desc(amazonSyncSnapshots.fetchedAt))
    .limit(1);

  if (!latest) {
    return NextResponse.json(
      { error: "No snapshot found" },
      { status: 404 }
    );
  }

  // Get all snapshots for history
  const history = await db
    .select({
      id: amazonSyncSnapshots.id,
      fetchedAt: amazonSyncSnapshots.fetchedAt,
      creditsUsed: amazonSyncSnapshots.creditsUsed,
    })
    .from(amazonSyncSnapshots)
    .where(eq(amazonSyncSnapshots.productId, productId))
    .orderBy(desc(amazonSyncSnapshots.fetchedAt))
    .limit(30);

  return NextResponse.json({
    snapshot: latest,
    history,
  });
}
