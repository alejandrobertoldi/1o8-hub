import { getAuthSession } from "@/lib/auth-db";
import { canUseNewBusiness } from ".";

/** The session when the user may use New Business (see canUseNewBusiness), else null. */
export async function newBusinessSession() {
  const session = await getAuthSession();
  return session && canUseNewBusiness(session.user.role, session.user.allowedSections) ? session : null;
}

export const NEW_BUSINESS_FORBIDDEN = { error: "New Business is limited to owners, super admins and people with the section" };
