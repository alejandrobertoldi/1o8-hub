import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers, isHubStaff } from "@/lib/roles";

/** Internal staff only. Everyone manages their own time; admins can manage anyone's. */
export async function timeLogSession() {
  const session = await getAuthSession();
  if (!session || !session.user.id || !isHubStaff(session.user.role)) return null;
  return { userId: session.user.id, isAdmin: hasAdminPowers(session.user.role) };
}
