import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove, isHubStaff } from "@/lib/roles";
import {
  EMPTY_HOLIDAY_DEALS_LAYOUT as EMPTY,
  type HolidayDealsLayout,
} from "@/lib/holiday-deals/layout";

const SETTINGS_KEY = "holiday_deals_layout";

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function parse(value: string | undefined | null): HolidayDealsLayout {
  if (!value) return EMPTY;
  try {
    const obj = JSON.parse(value);
    return { ordered: stringList(obj?.ordered), hidden: stringList(obj?.hidden) };
  } catch {
    return EMPTY;
  }
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(seoSettings)
    .where(eq(seoSettings.key, SETTINGS_KEY))
    .limit(1);
  return NextResponse.json(parse(rows[0]?.value));
}

export async function PUT(req: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const obj = (body ?? {}) as Record<string, unknown>;
  const layout: HolidayDealsLayout = {
    ordered: stringList(obj.ordered),
    hidden: stringList(obj.hidden),
  };
  const value = JSON.stringify(layout);
  await db
    .insert(seoSettings)
    .values({ key: SETTINGS_KEY, value, updatedBy: session.user.email! })
    .onConflictDoUpdate({
      target: seoSettings.key,
      set: { value, updatedAt: new Date(), updatedBy: session.user.email! },
    });
  return NextResponse.json(layout);
}
