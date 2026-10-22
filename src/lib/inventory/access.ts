import { isEditorOrAbove, isHubStaff } from "@/lib/roles";
import { sessionHasClient } from "@/lib/client-codes";

export interface AccessUser {
  role?: string | null;
  clientIdCode?: string | null;
}

export function canEditRecs(user: AccessUser | undefined): boolean {
  return isEditorOrAbove(user?.role);
}

/** "hub" = full data incl. notes; "portal" = stripped; null = forbidden. */
export function recReadScope(user: AccessUser | undefined, clientIdCode: string): "hub" | "portal" | null {
  if (!user) return null;
  if (isHubStaff(user.role)) return "hub";
  if ((user.role === "client" || user.role === "prospect") && sessionHasClient(user.clientIdCode, clientIdCode)) {
    return "portal";
  }
  return null;
}
