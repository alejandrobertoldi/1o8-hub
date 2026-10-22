/**
 * Field-level authorization for the team detail page (spec §4).
 *
 * PURE: no database, no session import, no `next/*`. Routes resolve an Access
 * and pass it in. That is what makes the whole matrix unit-testable and stops
 * each route re-implementing the rules slightly differently.
 */

import { hasAdminPowers } from "@/lib/roles";

export type Access = {
  isSelf: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

export type FieldTier = "self" | "admin" | "superadmin";

/**
 * The single source of truth for who may write what.
 *
 * Null-prototype on purpose: it removes `toString`, `constructor` and
 * `__proto__` from the object entirely, so even a lookup that bypassed
 * isKnownField cannot resolve an inherited key to a tier.
 *
 * Only fields reachable through PATCH /api/team/[userId] appear here. Pay
 * history is read via allowsTier("self") (owner + super-admin); payment and
 * all pay/payment writers stay on the superadmin tier.
 */
export const FIELD_TIERS: Record<string, FieldTier> = Object.assign(
  Object.create(null) as Record<string, FieldTier>,
  {
    // ── tier 0, columns on `users` ──
    phone: "self",
    slackHandle: "self",
    jobTitle: "admin",
    jobTitles: "admin",
    departments: "admin",
    leadsDepartments: "admin",
    startDate: "admin",
    employmentStatus: "admin",
    // Holiday calendar + residence TZ — edited on /team/[id], not /admin/users
    countryCode: "admin",
    residenceTimezone: "admin",
    // ── tier 1, columns on `user_profiles` ──
    personalEmail: "self",
    addressLine1: "self",
    addressLine2: "self",
    city: "self",
    postcode: "self",
    addressCountry: "self",
    dateOfBirth: "self",
    emergencyContactName: "self",
    emergencyContactPhone: "self",
    emergencyContactRelation: "self",
  } satisfies Record<string, FieldTier>
);

/**
 * Which table each writable field lands in. Used by PATCH to split the body.
 *
 * `leadsDepartments` is deliberately ABSENT from both this set and
 * PROFILE_PATCH_FIELDS: it is not a `users` or `user_profiles` column at all,
 * but a projection of the `user_department_leads` junction (composite PK +
 * UNIQUE(department)). It is still admin-tier per FIELD_TIERS above, but the
 * route special-cases it before the USERS/PROFILE routing and reconciles the
 * junction (steal-on-conflict) inside the same transaction.
 */
export const USERS_PATCH_FIELDS: ReadonlySet<string> = new Set([
  "phone",
  "slackHandle",
  "jobTitle",
  "jobTitles",
  "departments",
  "startDate",
  "employmentStatus",
  "countryCode",
  "residenceTimezone",
]);

export const PROFILE_PATCH_FIELDS: ReadonlySet<string> = new Set([
  "personalEmail",
  "addressLine1",
  "addressLine2",
  "city",
  "postcode",
  "addressCountry",
  "dateOfBirth",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelation",
]);

/**
 * Three INDEPENDENT capabilities, not an ordered tier (spec D2).
 *
 * `isSuperAdmin` is an explicit argument rather than something read off the
 * session here, because the two callers want different sources: tier-0/tier-1
 * reads can trust the JWT, while every tier-2/tier-3 route re-reads it from the
 * database (ruling F3 — the JWT copy is written at sign-in by auth.ts:37 and is
 * never refreshed, so a revoked super-admin would otherwise keep pay access
 * until they signed out).
 */
export function resolveAccess(
  viewer: { id: string; role: string },
  targetUserId: string,
  isSuperAdmin: boolean
): Access {
  return {
    isSelf: viewer.id === targetUserId,
    // Owner and Super Admin inherit every admin-tier field write.
    isAdmin: hasAdminPowers(viewer.role),
    isSuperAdmin,
  };
}

/**
 * True only for an OWN property of FIELD_TIERS.
 *
 * `Object.hasOwn`, never a bare `in`: `"toString" in FIELD_TIERS` is true for a
 * normal object literal, so a PATCH body of {"toString":"x"} would be accepted
 * as a known field and then resolve to an undefined tier. tsconfig has
 * lib:[…,"esnext"], so Object.hasOwn typechecks.
 */
export function isKnownField(field: string): boolean {
  return Object.hasOwn(FIELD_TIERS, field);
}

/**
 * The one place a tier is turned into a yes/no. Reads use it too:
 * `user_profiles` + pay history → allowsTier("self"); payment →
 * allowsTier("superadmin"). Write routes for pay/payment stay superadmin.
 */
export function allowsTier(tier: FieldTier, access: Access): boolean {
  switch (tier) {
    case "self":
      return access.isSelf || access.isSuperAdmin;
    case "admin":
      return access.isAdmin || access.isSuperAdmin;
    case "superadmin":
      return access.isSuperAdmin;
  }
}

/**
 * False for an unknown field as well as a forbidden one. Callers MUST test
 * isKnownField first so they can return 400 (unknown) rather than 403
 * (forbidden) — the two answers leak different things and the spec requires
 * both. Nothing is ever silently dropped: a silent drop looks exactly like a
 * successful save.
 */
export function canWriteField(field: string, access: Access): boolean {
  if (!isKnownField(field)) return false;
  return allowsTier(FIELD_TIERS[field], access);
}
