import { NextRequest, NextResponse, after } from "next/server";
import { desc, eq, and, notInArray } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { invalidateAuthIdentities } from "@/lib/auth-identity-cache";
import { db } from "@/lib/db";
import {
  users,
  userProfiles,
  userPayPeriods,
  userPaymentDetails,
  userDepartmentLeads,
  teamDirectoryProfiles,
} from "@/lib/db/schema";
import { readIsSuperAdmin } from "@/lib/team/access-db";
import { hasAdminPowers, isHubStaff } from "@/lib/roles";
import {
  allowsTier,
  canWriteField,
  isKnownField,
  resolveAccess,
  PROFILE_PATCH_FIELDS,
  USERS_PATCH_FIELDS,
  FIELD_TIERS,
} from "@/lib/team/access";
import { isCountryCode, VALID_COUNTRY_CODES } from "@/lib/constants";
import { isValidTimeZone } from "@/lib/timezones";
import { isDateString } from "@/lib/time-off/working-days";
import { logEventAsync } from "@/lib/event-logger";
import { maskPayment } from "@/lib/team/payment-mask";
import {
  displayJobTitles,
  normalizeDepartments,
  normalizeJobTitles,
  type TeamDepartment,
} from "@/lib/team/departments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tier-0 columns. Everything sensitive lives in the other three tables. */
const tier0 = {
  id: users.id,
  name: users.name,
  email: users.email,
  image: users.image,
  role: users.role,
  clientIdCode: users.clientIdCode,
  jobTitle: users.jobTitle,
  jobTitles: users.jobTitles,
  departments: users.departments,
  startDate: users.startDate,
  employmentStatus: users.employmentStatus,
  phone: users.phone,
  slackHandle: users.slackHandle,
  countryCode: users.countryCode,
  residenceTimezone: users.residenceTimezone,
  timeOffVia: users.timeOffVia,
  timeOffApproverId: users.timeOffApproverId,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = await params;

  // 1o8: every internal user may open anyone's card, but only an Owner (or the
  // person themselves) gets the full card. Everyone else receives the tier-0
  // directory view: no user_profiles, pay or payment, and no MF field writes
  // (PATCH below keeps the owner-or-self gate). Directory fields are edited by
  // admins through /api/team/directory/[userId].
  const isOwner = session.user.role === "owner";
  const fullCard = isOwner || session.user.id === userId;
  if (!fullCard && !isHubStaff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [target] = await db
    .select(tier0)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Who this person LEADS (0118 junction), unconditional — every viewer who
  // can load this page sees the org-chart leadership the same way GET
  // /api/team already does. Decoupled from `departments` membership above.
  const leadRows = await db
    .select({ department: userDepartmentLeads.department })
    .from(userDepartmentLeads)
    .where(eq(userDepartmentLeads.userId, userId));

  // Ruling F3: the database, not the JWT. This route returns the pay and
  // payment blocks, so it is a tier-2/tier-3 read and gets the same treatment
  // as the write routes.
  const isSuperAdmin = await readIsSuperAdmin(session.user.id);
  // Restricted viewers who are admins keep isAdmin so admin-tier fields (title,
  // departments, leads, start date, status, calendar) stay editable; self-tier
  // and superadmin-tier fields stay read-only/hidden for them.
  const access = fullCard
    ? resolveAccess({ id: session.user.id, role: session.user.role }, userId, isSuperAdmin)
    : { isSelf: false, isAdmin: hasAdminPowers(session.user.role), isSuperAdmin: false };

  // Queried last (after profile/pay/payment) so the established read order is unchanged.
  const loadDirectory = async () => {
    const [row] = await db
      .select()
      .from(teamDirectoryProfiles)
      .where(eq(teamDirectoryProfiles.userId, userId))
      .limit(1);
    return row ?? null;
  };

  const payload: Record<string, unknown> = {
    user: {
      ...target,
      jobTitles: displayJobTitles(target.jobTitle, target.jobTitles),
      leadsDepartments: leadRows.map((r) => r.department),
    },
    access,
    directory: null,
    // Directory (tier 0) edits are an admin action, independent of the owner gate.
    canEditDirectory: hasAdminPowers(session.user.role),
    restricted: !fullCard,
  };

  if (!fullCard) {
    payload.directory = await loadDirectory();
    return NextResponse.json(payload);
  }

  if (allowsTier("self", access)) {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    payload.profile = profile ?? null;
  }

  // Financial (pay periods): owner + super-admin may READ. Writes stay on the
  // pay-periods routes, which still require superadmin. Payment (bank/Wise)
  // remains super-admin only — owners never see their own payment identifiers.
  if (allowsTier("self", access)) {
    payload.pay = await db
      .select()
      .from(userPayPeriods)
      .where(eq(userPayPeriods.userId, userId))
      .orderBy(desc(userPayPeriods.effectiveFrom));
  }
  if (allowsTier("superadmin", access)) {
    const [payment] = await db
      .select()
      .from(userPaymentDetails)
      .where(eq(userPaymentDetails.userId, userId))
      .limit(1);
    payload.payment = payment ? maskPayment(payment) : null;
  }

  payload.directory = await loadDirectory();
  return NextResponse.json(payload);
}

const EMPLOYMENT_STATUSES = new Set(["active", "inactive", "alumni"]);

/**
 * varchar(N) limits for every FIELD_TIERS field that falls through to the
 * generic string branch below. Mirrors the column definitions in
 * src/lib/db/schema.ts exactly (users.phone/slackHandle/jobTitle,
 * user_profiles.*) — without this an over-long string reaches Postgres and
 * surfaces as a generic 500 ("value too long for type character varying(N)")
 * instead of a 400 naming the actual field.
 */
const MAX_LENGTHS: Record<string, number> = {
  phone: 40,
  slackHandle: 80,
  jobTitle: 120,
  personalEmail: 255,
  addressLine1: 200,
  addressLine2: 200,
  city: 120,
  postcode: 20,
  emergencyContactName: 120,
  emergencyContactPhone: 40,
  emergencyContactRelation: 60,
};

/**
 * Returns an error message, or null when the value is acceptable.
 *
 * Without this a bad enum value reaches Postgres and surfaces as a 500, which
 * reads to the user as "the app is broken" rather than "that is not a status".
 */
function validateValue(field: string, value: unknown): string | null {
  if (field === "employmentStatus") {
    return typeof value === "string" && EMPLOYMENT_STATUSES.has(value)
      ? null
      : "employmentStatus must be one of active, inactive, alumni";
  }
  if (field === "departments" || field === "leadsDepartments") {
    const result = normalizeDepartments(value);
    return "error" in result ? result.error : null;
  }
  if (field === "jobTitles") {
    const result = normalizeJobTitles(value);
    return "error" in result ? result.error : null;
  }
  if (field === "timeOffVia") {
    return value === "hub" || value === "gusto" ? null : "timeOffVia must be hub or gusto";
  }
  if (value === null) return null; // every other field is nullable
  if (field === "timeOffApproverId") {
    return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? null : "timeOffApproverId must be a user id or null";
  }
  if (field === "startDate" || field === "dateOfBirth") {
    return isDateString(value)
      ? null
      : `${field} must be a valid date in YYYY-MM-DD format`;
  }
  if (field === "addressCountry" || field === "countryCode") {
    // Same six-country allowlist — holiday calendar (countryCode) and
    // residence country (addressCountry) both use the constrained select.
    return typeof value === "string" && isCountryCode(value.toUpperCase())
      ? null
      : `${field} must be one of ${VALID_COUNTRY_CODES.join(", ")}`;
  }
  if (field === "residenceTimezone") {
    return typeof value === "string" && isValidTimeZone(value)
      ? null
      : "residenceTimezone must be a valid IANA time zone";
  }
  if (typeof value !== "string") return `${field} must be a string or null`;
  const max = MAX_LENGTHS[field];
  if (max !== undefined && value.length > max) {
    return `${field} must be at most ${max} characters`;
  }
  return null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = await params;

  // An Owner may edit ANOTHER member's detail. 1o8: admins may too, but only
  // admin-tier fields (title, departments, leads, start date, status,
  // calendar) — never someone else's self-tier personal data. Everyone else
  // may only edit their own. Checked before any DB lookup so this can't be
  // used to enumerate user ids.
  const isOwner = session.user.role === "owner";
  const isOther = session.user.id !== userId;
  const adminOnOther = isOther && !isOwner && hasAdminPowers(session.user.role);
  if (isOther && !isOwner && !adminOnOther) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const patch = body as Record<string, unknown>;
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  if (adminOnOther) {
    const notAdminTier = keys.filter((k) => !isKnownField(k) || FIELD_TIERS[k] !== "admin");
    if (notAdminTier.length > 0) {
      return NextResponse.json(
        { error: `Admins can only edit admin fields on another person: ${notAdminTier.join(", ")}` },
        { status: 403 }
      );
    }
  }

  const [target] = await db
    .select({
      id: users.id,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isSuperAdmin = await readIsSuperAdmin(session.user.id);
  const access = resolveAccess(
    { id: session.user.id, role: session.user.role },
    userId,
    isSuperAdmin
  );

  // 400 before 403, and both before any write. An unknown key is a client bug;
  // a known key the caller may not write is an authorization answer. Nothing is
  // silently dropped — a silent drop looks exactly like a successful save.
  const unknown = keys.filter((k) => !isKnownField(k));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Unknown field(s): ${unknown.join(", ")}` },
      { status: 400 }
    );
  }

  const forbidden = keys.filter((k) => !canWriteField(k, access));
  if (forbidden.length > 0) {
    return NextResponse.json(
      { error: `Not permitted to edit: ${forbidden.join(", ")}` },
      { status: 403 }
    );
  }

  for (const k of keys) {
    const problem = validateValue(k, patch[k]);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
  // A time off approver must be someone else with admin powers.
  if (typeof patch.timeOffApproverId === "string") {
    const [approver] = await db.select({ role: users.role }).from(users).where(eq(users.id, patch.timeOffApproverId)).limit(1);
    if (!approver || !hasAdminPowers(approver.role) || patch.timeOffApproverId === userId) {
      return NextResponse.json({ error: "The approver must be another admin, super admin or owner" }, { status: 400 });
    }
  }

  const userUpdates: Record<string, unknown> = {};
  const profileUpdates: Record<string, unknown> = {};
  // `leadsDepartments` is NOT a `users` or `user_profiles` column — it is a
  // projection of the user_department_leads junction, so it is special-cased
  // here (collected, never written to userUpdates) and reconciled inside the
  // transaction below instead of going through the USERS/PROFILE routing.
  let leadsSet: TeamDepartment[] | undefined;
  for (const k of keys) {
    const raw = patch[k];
    // Persist residence country as uppercase alpha-2 (dropdown values are
    // already upper; free-typed casing was accepted by the old regex).
    const next =
      (k === "addressCountry" || k === "countryCode") && typeof raw === "string"
        ? raw.toUpperCase()
        : raw;
    if (k === "leadsDepartments") {
      // Already 400'd above by validateValue if invalid; normalize again here
      // to get the typed, deduped array to reconcile against.
      const normalized = normalizeDepartments(next);
      if ("error" in normalized) {
        throw new Error(normalized.error);
      }
      leadsSet = normalized.ok;
      continue;
    }
    if (USERS_PATCH_FIELDS.has(k)) {
      if (k === "jobTitles") {
        const normalized = normalizeJobTitles(next);
        if ("error" in normalized) {
          throw new Error(normalized.error);
        }
        userUpdates.jobTitles = normalized.ok;
        userUpdates.jobTitle = normalized.ok[0] ?? null;
      } else if (k === "jobTitle") {
        // jobTitles in the same body is the canonical list; skip so the two
        // cannot fight. A jobTitle-only patch still syncs the array so the
        // columns cannot drift.
        if (keys.includes("jobTitles")) continue;
        userUpdates.jobTitle = next;
        userUpdates.jobTitles =
          typeof next === "string" && next.length > 0 ? [next] : [];
      } else if (k === "departments") {
        const normalized = normalizeDepartments(next);
        if ("error" in normalized) {
          throw new Error(normalized.error);
        }
        userUpdates.departments = normalized.ok;
      } else {
        userUpdates[k] = next;
      }
    }
    else if (PROFILE_PATCH_FIELDS.has(k)) profileUpdates[k] = next;
    else {
      // FIELD_TIERS, USERS_PATCH_FIELDS and PROFILE_PATCH_FIELDS (all in
      // src/lib/team/access.ts) must agree by hand. A field that passed the
      // known/writable gates above but is unrouted here would otherwise land
      // in neither update object, still get audited below as "changed," and
      // return {success:true} for a write that never happened — fail loudly
      // the moment the three lists drift instead of silently no-opping.
      throw new Error(
        `Field "${k}" is writable per FIELD_TIERS but missing from both ` +
          "USERS_PATCH_FIELDS and PROFILE_PATCH_FIELDS"
      );
    }
  }

  // Both writes (plus the leadsDepartments reconcile) in ONE transaction:
  // without this, a patch touching both a tier-0 and a tier-1 field could
  // commit the first write, throw on the second, and skip the audit log
  // below entirely — a mutation that half-applied and was never audited.
  await db.transaction(async (tx) => {
    if (Object.keys(userUpdates).length > 0) {
      await tx
        .update(users)
        .set({ ...userUpdates, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }

    if (Object.keys(profileUpdates).length > 0) {
      // Upsert: the row may not exist yet — user_profiles is populated lazily on
      // the first edit rather than backfilled for all 67 users by the migration.
      await tx
        .insert(userProfiles)
        .values({ userId, ...profileUpdates })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: { ...profileUpdates, updatedAt: new Date() },
        });
    }

    if (leadsSet !== undefined) {
      // Reconcile the junction to EXACTLY leadsSet. UNIQUE(department) forces
      // at most one lead per department, so claiming a department this patch
      // wants steals it from whoever currently holds it — mirrors PUT
      // /api/team/department-leads' delete-by-department semantic.
      if (leadsSet.length === 0) {
        await tx
          .delete(userDepartmentLeads)
          .where(eq(userDepartmentLeads.userId, userId));
      } else {
        // 1) Steal each target department from its current holder (if any),
        //    including this user's own existing row — re-inserted in step 3.
        for (const d of leadsSet) {
          await tx
            .delete(userDepartmentLeads)
            .where(eq(userDepartmentLeads.department, d));
        }
        // 2) Drop departments this user used to lead but no longer does.
        await tx
          .delete(userDepartmentLeads)
          .where(
            and(
              eq(userDepartmentLeads.userId, userId),
              notInArray(userDepartmentLeads.department, leadsSet)
            )
          );
        // 3) Insert the new set for this user. MUST follow the steal above.
        for (const d of leadsSet) {
          await tx.insert(userDepartmentLeads).values({ userId, department: d });
        }
      }
    }
  });

  // Best-effort: this clears THIS instance's memo only, so the odds it is the
  // instance the edited user's next request lands on are ~1/N. The real contract
  // is auth-identity-cache's TTL. Cheap enough to be worth the 1/N.
  invalidateAuthIdentities();

  // Logged only once the transaction above has committed successfully — an
  // audit entry for a write that never happened is worse than no entry.
  after(
    logEventAsync({
      userEmail: session.user.email,
      userName: session.user.name ?? null,
      section: "admin",
      action: "user:profile:update",
      status: "success",
      resourceType: "user",
      resourceId: userId,
      resourceLabel: target.email,
      // Field NAMES only. Tier-1 values (home address, date of birth) must
      // never be copied into admin_event_log, which ordinary admins can read.
      detail: { fields: keys },
    })
  );

  return NextResponse.json({ success: true });
}
