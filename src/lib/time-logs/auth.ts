import { getAuthSession } from "@/lib/auth-db";
import { hasHoursReportsAccess, hasPeopleAccess, isHubStaff } from "@/lib/roles";

/**
 * Internal staff only. Everyone manages their own time; only owners / super
 * admins (hasPeopleAccess) see or manage anyone else's. `isAdmin` keeps its
 * name for the callers but means exactly that.
 */
export async function timeLogSession() {
  const session = await getAuthSession();
  if (!session || !session.user.id || !isHubStaff(session.user.role)) return null;
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    role: session.user.role ?? null,
    isAdmin: hasPeopleAccess(session.user.role),
    /** Team-wide hours reports (admin and up); everyone else gets their own. */
    teamReports: hasHoursReportsAccess(session.user.role),
  };
}
