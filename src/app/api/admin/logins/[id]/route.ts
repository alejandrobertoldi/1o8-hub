import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { logEventAsync } from "@/lib/event-logger";
import { parseSharedLoginWrite } from "@/lib/shared-logins";
import {
  deleteSharedLogin,
  updateSharedLogin,
} from "@/lib/shared-logins/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
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

  const login = await updateSharedLogin(id, parsed.data, session.user.id);
  if (!login) {
    return NextResponse.json({ error: "Login not found" }, { status: 404 });
  }

  after(() =>
    logEventAsync({
      userEmail: session.user.email,
      userName: session.user.name,
      section: "admin",
      action: "shared-login:update",
      resourceType: "shared_login",
      resourceId: login.id,
      resourceLabel: login.name,
      message: `Updated shared login ${login.name}`,
    })
  );
  return NextResponse.json({ login });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const existed = await deleteSharedLogin(id);
  if (!existed) {
    return NextResponse.json({ error: "Login not found" }, { status: 404 });
  }

  after(() =>
    logEventAsync({
      userEmail: session.user.email,
      userName: session.user.name,
      section: "admin",
      action: "shared-login:delete",
      resourceType: "shared_login",
      resourceId: id,
      message: "Deleted a shared login",
    })
  );
  return NextResponse.json({ ok: true });
}
