/**
 * Hub user roles and staff privilege ladder.
 *
 * Staff hierarchy (high → low):
 *   Owner > Super Admin > Admin > Editor > Viewer
 *
 * Portal / gate roles sit beside the ladder, not inside it:
 *   client · prospect · pending
 */

export const USER_ROLES = [
  "owner",
  "super_admin",
  "admin",
  "editor",
  "viewer",
  "client",
  "prospect",
  "pending",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Admin users matrix column order (hierarchy, then portal roles). */
export const ASSIGNABLE_ROLES = [
  "owner",
  "super_admin",
  "admin",
  "editor",
  "viewer",
  "client",
  "prospect",
  "pending",
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** Sort / group order on the admin users page. */
export const ROLE_SORT_ORDER = [
  "owner",
  "super_admin",
  "admin",
  "editor",
  "viewer",
  "client",
  "prospect",
  "pending",
] as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  super_admin: "Super Admin",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
  client: "Client",
  prospect: "Prospect",
  pending: "Pending",
};

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    (USER_ROLES as readonly string[]).includes(value)
  );
}

/** Admin section bypass, user management, portal preview — Owner / Super Admin / Admin. */
export function hasAdminPowers(role: string | null | undefined): boolean {
  return role === "owner" || role === "super_admin" || role === "admin";
}

/** Pay, payment, hours-admin — Owner / Super Admin. */
export function hasSuperPowers(role: string | null | undefined): boolean {
  return role === "owner" || role === "super_admin";
}

/** Internal hub staff (not client / prospect / pending). */
export function isHubStaff(role: string | null | undefined): boolean {
  return (
    role === "owner" ||
    role === "super_admin" ||
    role === "admin" ||
    role === "editor" ||
    role === "viewer"
  );
}

/**
 * Whether `actorRole` may assign `targetRole` to someone else.
 * - Owner only → Owner
 * - Owner / Super Admin → Super Admin
 * - Owner / Super Admin / Admin → Admin and below (incl. portal roles)
 */
export function canAssignRole(actorRole: string, targetRole: string): boolean {
  if (!isUserRole(targetRole)) return false;
  if (targetRole === "owner") return actorRole === "owner";
  if (targetRole === "super_admin") return hasSuperPowers(actorRole);
  return hasAdminPowers(actorRole);
}

export function roleLabel(role: string): string {
  if (isUserRole(role)) return ROLE_LABELS[role];
  return role;
}

/**
 * Content-editing tier — Owner / Super Admin / Admin / Editor.
 *
 * Replaces the `["admin", "editor"].includes(role)` idiom that predates the
 * Owner and Super Admin roles. That array literal was invisible to the
 * `role === "admin"` sweep in 679a8a4f, which is why the PPC surface still
 * 403'd Owners after that commit shipped.
 */
export function isEditorOrAbove(role: string | null | undefined): boolean {
  return hasAdminPowers(role) || role === "editor";
}
