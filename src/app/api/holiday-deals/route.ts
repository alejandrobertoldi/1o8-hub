import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove, isHubStaff } from "@/lib/roles";
import { logEventAsync } from "@/lib/event-logger";
import { parseHolidayDealCreate } from "@/lib/holiday-deals/parse";
import {
  HolidayDealConflictError,
  createHolidayDeals,
  listHolidayDeals,
  lookupProduct,
} from "@/lib/holiday-deals/store";
import { HOLIDAY_EVENTS } from "@/lib/holiday-deals/calendar";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isHubStaff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const { rows, summary } = await listHolidayDeals({
    client: searchParams.get("client"),
    event: searchParams.get("event"),
    q: searchParams.get("q"),
  });
  return NextResponse.json({
    events: HOLIDAY_EVENTS,
    rows,
    summary,
    canEdit: isEditorOrAbove(session.user.role),
  });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditorOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseHolidayDealCreate(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const rows = [];
  for (const data of parsed.data) {
    if (data.productId) {
      const product = await lookupProduct(data.productId);
      if (product) {
        rows.push({
          ...data,
          clientIdCode: data.clientIdCode || product.clientIdCode || data.clientIdCode,
          asin: data.asin ?? product.asin,
          sku: data.sku ?? product.sku,
          itemName: product.summarizedTitle || data.itemName || product.itemName,
        });
        continue;
      }
    }
    rows.push(data);
  }

  try {
    const created = await createHolidayDeals(rows, session.user.id);
    after(() =>
      logEventAsync({
        userEmail: session.user.email,
        userName: session.user.name,
        section: "holiday-deals",
        action: "holiday-deal:create",
        resourceType: "holiday_deal_plan",
        resourceId: created[0]?.id,
        resourceLabel: created.map((r) => r.asin || r.sku || r.itemName).join(", "),
        message: `Added ${created.length} holiday deal row${created.length === 1 ? "" : "s"}`,
      }),
    );
    return NextResponse.json({ rows: created }, { status: 201 });
  } catch (err) {
    if (err instanceof HolidayDealConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
