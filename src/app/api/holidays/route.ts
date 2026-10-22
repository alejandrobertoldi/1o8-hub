import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { publicHolidays } from "@/lib/db/schema";
import { isCountryCode, VALID_COUNTRY_CODES } from "@/lib/constants";
import { isDateString } from "@/lib/time-off/working-days";
import { hasAdminPowers } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * Postgres `unique_violation`. The `postgres` driver copies the server's
 * SQLSTATE onto `err.code` as a string (connection.js maps wire field 67 →
 * `code`; PostgresError does `Object.assign(this, x)`).
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

// GET /api/holidays?country=US&year=2026 — both filters optional. Any
// authenticated user, deliberately: holiday dates are shared reference data
// with no personal information, so there is no role gate here — only
// POST/DELETE are admin-only (D11).
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const country = req.nextUrl.searchParams.get("country");
  const yearRaw = req.nextUrl.searchParams.get("year");

  if (country !== null && !isCountryCode(country)) {
    return NextResponse.json(
      { error: `country must be one of ${VALID_COUNTRY_CODES.join(", ")}` },
      { status: 400 }
    );
  }

  const filters = [];
  if (country) filters.push(eq(publicHolidays.countryCode, country));
  if (yearRaw !== null) {
    const year = Number(yearRaw);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "year is out of range" }, { status: 400 });
    }
    filters.push(gte(publicHolidays.holidayDate, `${year}-01-01`));
    filters.push(lte(publicHolidays.holidayDate, `${year}-12-31`));
  }

  const rows = await db
    .select()
    .from(publicHolidays)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(publicHolidays.holidayDate));

  return NextResponse.json(rows);
}

// POST /api/holidays — admin only (spec D11: any admin, not Jake-only).
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { countryCode, holidayDate, name } = body as {
    countryCode?: unknown;
    holidayDate?: unknown;
    name?: unknown;
  };

  if (!isCountryCode(countryCode)) {
    return NextResponse.json(
      { error: `countryCode must be one of ${VALID_COUNTRY_CODES.join(", ")}` },
      { status: 400 }
    );
  }
  if (!isDateString(holidayDate)) {
    return NextResponse.json(
      { error: "holidayDate must be a valid YYYY-MM-DD date" },
      { status: 400 }
    );
  }
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const [inserted] = await db
      .insert(publicHolidays)
      .values({ countryCode, holidayDate, name: name.trim().slice(0, 120) })
      .returning();
    return NextResponse.json(inserted, { status: 201 });
  } catch (err) {
    // Ruling P4: 409 ONLY for a genuine duplicate — violating
    // public_holidays_unique (country_code, holiday_date). Every other error is
    // a real failure and must not be disguised as a duplicate, or a dropped
    // connection reports to the admin as "already exists".
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "That country already has a holiday on that date" },
        { status: 409 }
      );
    }
    console.error("[holidays] insert failed:", err);
    return NextResponse.json(
      { error: "Failed to create holiday" },
      { status: 500 }
    );
  }
}
