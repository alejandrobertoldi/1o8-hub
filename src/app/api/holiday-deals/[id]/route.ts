import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove, isHubStaff } from "@/lib/roles";
import { logEventAsync } from "@/lib/event-logger";
import { parseHolidayDealPatch } from "@/lib/holiday-deals/parse";
import {
  HolidayDealConflictError,
  HolidayDealNotFoundError,
  deleteHolidayDeal,
  updateHolidayDeal,
} from "@/lib/holiday-deals/store";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditorOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseHolidayDealPatch(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const row = await updateHolidayDeal(id, parsed.data, session.user.id);
    after(() =>
      logEventAsync({
        userEmail: session.user.email,
        userName: session.user.name,
        section: "holiday-deals",
        action: "holiday-deal:update",
        resourceType: "holiday_deal_plan",
        resourceId: row.id,
        resourceLabel: row.asin || row.sku || row.itemName || row.id,
        detail: parsed.data as Record<string, unknown>,
      }),
    );
    return NextResponse.json({ row });
  } catch (err) {
    if (err instanceof HolidayDealNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof HolidayDealConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditorOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  try {
    await deleteHolidayDeal(id);
    after(() =>
      logEventAsync({
        userEmail: session.user.email,
        userName: session.user.name,
        section: "holiday-deals",
        action: "holiday-deal:delete",
        resourceType: "holiday_deal_plan",
        resourceId: id,
        message: `Removed holiday deal ${id}`,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof HolidayDealNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
