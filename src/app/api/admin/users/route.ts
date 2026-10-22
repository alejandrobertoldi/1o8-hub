import { NextRequest, NextResponse, after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { invalidateAuthIdentities } from "@/lib/auth-identity-cache";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { VALID_SECTION_IDS } from "@/lib/permissions";
import { isCountryCode, VALID_COUNTRY_CODES } from "@/lib/constants";
import { isValidTimeZone } from "@/lib/timezones";
import { logEventAsync } from "@/lib/event-logger";
import {
  canAssignRole,
  hasAdminPowers,
  hasSuperPowers,
  isUserRole,
  type UserRole,
} from "@/lib/roles";

export async function GET() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Explicit projection, not select(). Migration 0090 adds five columns to
  // `users`, and an unprojected select ships every future column to the
  // browser by default. These are exactly the 13 fields the page's `User` type
  // consumes — add nothing here (spec D10).
  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      role: users.role,
      isSuperAdmin: users.isSuperAdmin,
      allowedSections: users.allowedSections,
      clientIdCode: users.clientIdCode,
      asanaEmail: users.asanaEmail,
      countryCode: users.countryCode,
      residenceTimezone: users.residenceTimezone,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users);
  return NextResponse.json(allUsers);
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { email, name, role, allowedSections } = body as {
    email: string;
    name?: string;
    role?: UserRole;
    allowedSections?: string[];
  };

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const userRole = role ?? "viewer";
  if (!isUserRole(userRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (!canAssignRole(session.user.role, userRole)) {
    return NextResponse.json(
      { error: `You cannot assign the ${userRole} role` },
      { status: 403 }
    );
  }

  if (allowedSections) {
    const invalid = allowedSections.filter((s) => !VALID_SECTION_IDS.includes(s));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Invalid sections: ${invalid.join(", ")}` }, { status: 400 });
    }
  }

  // Check for duplicate email
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "User with this email already exists" }, { status: 409 });
  }

  const [newUser] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      name: name || null,
      role: userRole,
      // Dual-write legacy flag while callers still read is_super_admin.
      isSuperAdmin: hasSuperPowers(userRole),
      allowedSections: allowedSections ?? [],
    })
    .returning();

  return NextResponse.json(newUser, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    userId, role, allowedSections, clientIdCode, name, asanaEmail,
    countryCode, residenceTimezone,
  } = body as {
    userId: string;
    role?: UserRole;
    allowedSections?: string[];
    clientIdCode?: string | null;
    name?: string | null;
    asanaEmail?: string | null;
    countryCode?: string | null;
    residenceTimezone?: string | null;
  };

  if (!userId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Prevent anyone from changing their own role (self-lockout).
  if (userId === session.user.id && role) {
    return NextResponse.json(
      { error: "Cannot change your own role" },
      { status: 400 }
    );
  }

  const updates: Partial<{
    role: UserRole;
    allowedSections: string[];
    clientIdCode: string | null;
    name: string | null;
    asanaEmail: string | null;
    isSuperAdmin: boolean;
    countryCode: string | null;
    residenceTimezone: string | null;
  }> = {};

  if (role) {
    if (!isUserRole(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (!canAssignRole(session.user.role, role)) {
      return NextResponse.json(
        { error: `You cannot assign the ${role} role` },
        { status: 403 }
      );
    }
    updates.role = role;
    // Keep legacy boolean aligned with the real role.
    updates.isSuperAdmin = hasSuperPowers(role);
  }

  if (allowedSections !== undefined) {
    // Validate all section IDs
    const invalid = allowedSections.filter((s) => !VALID_SECTION_IDS.includes(s));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid sections: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }
    updates.allowedSections = allowedSections;
  }

  if (clientIdCode !== undefined) {
    updates.clientIdCode = clientIdCode;
  }

  if (name !== undefined) {
    updates.name = name ? name.trim() : null;
  }

  if (asanaEmail !== undefined) {
    updates.asanaEmail = asanaEmail ? asanaEmail.trim().toLowerCase() : null;
  }

  // The holiday calendar. Only a calendar that has actually been seeded is
  // acceptable, and it is a POLICY assignment, not geography (design D-G):
  // a Manila-based person working US hours is legitimately 'US'.
  if (countryCode !== undefined) {
    if (countryCode !== null && !isCountryCode(countryCode)) {
      // Derived from the constant rather than hardcoded, so growing the
      // calendar list cannot leave this message lying about what is accepted.
      return NextResponse.json(
        {
          error: `countryCode must be one of ${VALID_COUNTRY_CODES.join(", ")}, or null`,
        },
        { status: 400 }
      );
    }
    updates.countryCode = countryCode;
  }

  // The residence zone. Validated with a try/catch around a real
  // DateTimeFormat construction, NOT membership of
  // Intl.supportedValuesOf("timeZone") — that list omits UTC, Etc/UTC,
  // Europe/Kyiv and Asia/Kolkata, all of which the runtime accepts, so a
  // membership check would reject the UTC fallback itself and would reject
  // Europe/Kyiv for a Ukraine-based team member.
  if (residenceTimezone !== undefined) {
    if (residenceTimezone !== null && !isValidTimeZone(residenceTimezone)) {
      return NextResponse.json(
        { error: "residenceTimezone must be a valid IANA time zone, or null" },
        { status: 400 }
      );
    }
    updates.residenceTimezone = residenceTimezone;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning({ email: users.email });

  // A role or allowed-sections change must not keep being answered from memory.
  // Best-effort: this clears THIS instance's memo only, so the odds it is the
  // instance the edited user's next request lands on are ~1/N. The real contract
  // is auth-identity-cache's TTL. Cheap enough to be worth the 1/N.
  invalidateAuthIdentities();

  // Design D-F: audit the WHOLE handler, every field. This route wrote no
  // audit log at all before, so role and super-admin grants were untracked —
  // auditing only the calendar change would have been theatre.
  //
  // Deferred with after() rather than fired-and-forgotten: this writes to
  // Postgres, and an un-awaited write is abandoned when the platform freezes
  // the sandbox, pinning a pooler slot (the 2026-08-04 outage). after() keeps
  // the invocation alive without adding response latency, and logEventAsync
  // never rejects, so a failed audit write cannot fail the update.
  after(
    logEventAsync({
      // `session.user.email` is typed `string` (non-nullable) in
      // src/types/next-auth.d.ts, so no `?? null` here. `name` IS
      // `string | null | undefined`, so it needs one.
      userEmail: session.user.email,
      userName: session.user.name ?? null,
      section: "admin",
      action: "user:update",
      status: "success",
      resourceType: "user",
      resourceId: userId,
      resourceLabel: updated?.email,
      detail: updates,
    })
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = (await req.json()) as { userId: string };

  if (!userId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (userId === session.user.id) {
    return NextResponse.json(
      { error: "Cannot remove yourself" },
      { status: 400 }
    );
  }

  await db.delete(users).where(eq(users.id, userId));

  return NextResponse.json({ success: true });
}
