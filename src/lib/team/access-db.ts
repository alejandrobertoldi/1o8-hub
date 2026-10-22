import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hasSuperPowers } from "@/lib/roles";

/**
 * Reads whether the user has Super Admin / Owner powers from the database.
 *
 * Super Admin is a real `users.role` (`super_admin` or `owner`). The legacy
 * `is_super_admin` boolean is dual-read during the transition after 0092.
 *
 * Ruling F3: session.user.isSuperAdmin is JWT-sourced and not refreshed by
 * getAuthSession — every tier-2/tier-3 route calls this instead.
 */
export async function readIsSuperAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: users.role, isSuperAdmin: users.isSuperAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return false;
  return hasSuperPowers(row.role) || row.isSuperAdmin;
}
