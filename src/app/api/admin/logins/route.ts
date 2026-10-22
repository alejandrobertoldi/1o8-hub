import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers, isHubStaff } from "@/lib/roles";
import { logEventAsync } from "@/lib/event-logger";
import { parseSharedLoginWrite } from "@/lib/shared-logins";
import { createSharedLogin, listSharedLogins } from "@/lib/shared-logins/store";

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isHubStaff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const logins = await listSharedLogins({
    userId: session.user.id,
    isAdmin: hasAdminPowers(session.user.role),
  });
  return NextResponse.json(logins);
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseSharedLoginWrite(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const login = await createSharedLogin(parsed.data, session.user.id);
  after(() =>
    logEventAsync({
      userEmail: session.user.email,
      userName: session.user.name,
      section: "admin",
      action: "shared-login:create",
      resourceType: "shared_login",
      resourceId: login.id,
      resourceLabel: login.name,
      message: `Added shared login ${login.name}`,
    })
  );
  return NextResponse.json({ login }, { status: 201 });
}
