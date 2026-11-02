import { getAuthSession } from "@/lib/auth-db";
import { hasPeopleAccess, isHubStaff } from "@/lib/roles";

/**
 * Internal staff only. Everyone manages their own time; only owners / super
 * admins (hasPeopleAccess) see or manage anyone else's. `isAdmin` keeps its
 * name for the callers but means exactly that.
 */
export async function timeLogSession() {
  const session = await getAuthSession();
  if (!session || !session.user.id || !isHubStaff(session.user.role)) return null;
  return { userId: session.user.id, isAdmin: hasPeopleAccess(session.user.role) };
}
