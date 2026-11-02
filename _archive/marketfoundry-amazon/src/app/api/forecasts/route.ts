import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { sessionHasClient } from "@/lib/client-codes";
import { db } from "@/lib/db";
import { clientForecasts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  if (!clientIdCode) {
    return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
  }

  // Portal clients can only see their assigned clients. clientIdCode may hold
  // several comma-separated codes (multi-brand owners), so membership check.
  if (
    session.user.role === "client" &&
    !sessionHasClient(session.user.clientIdCode ?? null, clientIdCode)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      month: clientForecasts.month,
      metric: clientForecasts.metric,
      forecastValue: clientForecasts.forecastValue,
      updatedAt: clientForecasts.updatedAt,
    })
    .from(clientForecasts)
    .where(eq(clientForecasts.clientIdCode, clientIdCode))
    .orderBy(clientForecasts.month, clientForecasts.metric);

  return NextResponse.json({ forecasts: rows });
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admin or editor can write forecasts
  if (!isEditorOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { clientIdCode, month, metric, forecastValue } = body;

  if (!clientIdCode || !month || !metric || forecastValue == null) {
    return NextResponse.json(
      { error: "Missing clientIdCode, month, metric, or forecastValue" },
      { status: 400 },
    );
  }

  const [forecast] = await db
    .insert(clientForecasts)
    .values({
      clientIdCode,
      month,
      metric,
      forecastValue: String(forecastValue),
      updatedBy: session.user.id,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        clientForecasts.clientIdCode,
        clientForecasts.month,
        clientForecasts.metric,
      ],
      set: {
        forecastValue: String(forecastValue),
        updatedBy: session.user.id,
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ success: true, forecast });
}
