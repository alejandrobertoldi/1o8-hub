/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Returns the session with DB-resolved role.
 * Called by the client on initial load to get accurate role info.
 */
export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }

  // Stamp last login
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ user: session.user });
}
