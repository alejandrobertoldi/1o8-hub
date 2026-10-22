import { cache } from "react";
import { db } from "@/lib/db";
import { users, aac } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { canAccess } from "@/lib/permissions";
import { resolveClientAllowedSections } from "@/lib/auth-helpers";
import { hasAdminPowers, hasSuperPowers } from "@/lib/roles";
import {
  getOrFillAuthIdentity,
  patchAuthIdentity,
} from "@/lib/auth-identity-cache";
import { isStoredAvatarUrl } from "@/lib/avatars/url";

/**
 * The only `users` columns getAuthSession reads. This runs on every API route
 * and every server component, so it selects explicitly rather than pulling the
 * whole row.
 */
const authUserColumns = {
  id: users.id,
  name: users.name,
  image: users.image,
  role: users.role,
  clientIdCode: users.clientIdCode,
  allowedSections: users.allowedSections,
};

/**
 * Get the current session with the user's DB role resolved.
 * Only call from Node.js runtime (API routes, server components) — NOT from middleware.
 * Deduplicated per request via React cache() — parallel route handlers share one DB lookup.
 *
 * React cache() only reaches that far: it dedupes WITHIN one request. A page that
 * fires several API calls in parallel therefore asked the identity question once
 * per call, and on 2026-08-11 three copies of it wedged in production and took an
 * instance's whole `max: 3` allowance with them. `auth-identity-cache` shares the
 * lookup ACROSS requests in the same process — see its header for the evidence.
 */
export const getAuthSession = cache(async function getAuthSession() {
  const session = await auth();
  if (!session?.user?.email) return null;

  // Hoisted so the fill closure below keeps the non-null narrowing.
  const email = session.user.email;

  // Look up or create the user in DB
  let dbUser = await getOrFillAuthIdentity(email, () =>
    db
      .select(authUserColumns)
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  );

  if (!dbUser) {
    // Auto-create user on first sign-in as pending (requires admin approval)
    const [created] = await db
      .insert(users)
      .values({
        email,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
        role: "pending",
      })
      .returning(authUserColumns);
    dbUser = created;
    // A null fill is never memoised, so seed the row we just created rather than
    // leaving the next request inside the TTL to re-query for it.
    patchAuthIdentity(email, created);
  } else {
    // Update name/image only when the provider actually sent a NEW value.
    //
    // This used to compare `dbUser.image !== session.user.image` directly. Google
    // omits `picture`/`name` from the JWT for most of our users, so those arrive
    // as `undefined` while the column holds NULL — and `null !== undefined` is
    // true in JS. The guard was therefore permanently satisfied, and the body
    // then wrote `session.user.x ?? dbUser.x`, i.e. the same value back, so it
    // could never satisfy its own condition. Measured in production: 235,900
    // no-op UPDATEs against an 81-row table, each one an extra write transaction
    // on the auth path of every single request — which is what left transactions
    // open long enough to pin Supavisor pool slots.
    //
    // A null/undefined incoming value means "provider told us nothing", which
    // must never overwrite a stored value — hence the non-null guard on each side.
    const nextName = session.user.name ?? null;
    // An avatar we captured into our own storage is authoritative: treat the
    // provider's picture as "told us nothing" so it can never overwrite it.
    const nextImage = isStoredAvatarUrl(dbUser.image)
      ? null
      : (session.user.image ?? null);
    if (
      (nextName !== null && nextName !== dbUser.name) ||
      (nextImage !== null && nextImage !== dbUser.image)
    ) {
      const written = {
        ...dbUser,
        name: nextName ?? dbUser.name,
        image: nextImage ?? dbUser.image,
      };
      await db
        .update(users)
        .set({ name: written.name, image: written.image })
        .where(eq(users.email, email));
      // MANDATORY. Leave the memo holding the pre-write row and the next request
      // inside the TTL re-detects this same "change" and writes again — a write
      // storm bounded only by the TTL, which is exactly the shape of the 235,900
      // no-op UPDATEs the guard above was added to stop.
      patchAuthIdentity(email, written);
    }
  }

  session.user.id = dbUser.id;
  session.user.role = dbUser.role;
  // Derived from role (Owner / Super Admin). Refreshed every request unlike JWT.
  session.user.isSuperAdmin = hasSuperPowers(dbUser.role);
  session.user.clientIdCode = dbUser.clientIdCode ?? null;

  // Demo/showcase: clients whose aac.client_status === "Prospect" see illustrative
  // sample data. Uses the first assigned code (matches resolvePortalClient).
  session.user.clientStatus = null;
  if ((dbUser.role === "client" || dbUser.role === "prospect") && dbUser.clientIdCode) {
    const firstCode = dbUser.clientIdCode.split(",")[0].trim();
    const [statusRow] = await db
      .select({ status: aac.clientStatus })
      .from(aac)
      .where(eq(aac.clientIdCode, firstCode))
      .limit(1);
    session.user.clientStatus = statusRow?.status ?? null;
  }

  // Mirror src/lib/auth.ts session callback: client/prospect roles get
  // their sections from aac.allowed_sections (union across assigned
  // client codes); everyone else continues reading users.allowed_sections.
  if (dbUser.role === "client" || dbUser.role === "prospect") {
    session.user.allowedSections = await resolveClientAllowedSections(
      dbUser.clientIdCode ?? null,
      async (codes) => {
        const rows = await db
          .select({ allowedSections: aac.allowedSections })
          .from(aac)
          .where(inArray(aac.clientIdCode, codes));
        return rows;
      },
    );
  } else {
    session.user.allowedSections = dbUser.allowedSections ?? [];
  }

  return session;
});

/**
 * Check if the current session user can access a given section.
 * Supports hierarchical department-based permissions.
 */
export function canAccessSection(
  session: { user: { role: string; allowedSections?: string[] } },
  section: string
): boolean {
  return canAccess(
    section,
    session.user.allowedSections ?? [],
    hasAdminPowers(session.user.role),
  );
}
