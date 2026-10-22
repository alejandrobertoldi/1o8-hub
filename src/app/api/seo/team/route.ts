import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { and, notInArray } from "drizzle-orm";

export const maxDuration = 60;

/**
 * GET /api/seo/team
 * Returns team members (id, name, email, image) for any authenticated user.
 * Excludes client and pending users — they are not assignable.
 */
export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(users)
    .where(notInArray(users.role, ["client", "pending"]));

  return NextResponse.json(allUsers);
}
