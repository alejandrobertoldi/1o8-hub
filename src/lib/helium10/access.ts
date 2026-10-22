import { NextRequest, NextResponse } from "next/server";
import { canAccessSection, getAuthSession } from "@/lib/auth-db";
import { hubOrigin } from "./store";

export async function requireSeoOperator(req?: NextRequest) {
  const session = await getAuthSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!["owner", "super_admin", "admin", "editor"].includes(session.user.role) || !canAccessSection(session, "seo")) {
    return { error: NextResponse.json({ error: "SEO editing access is required." }, { status: 403 }) };
  }
  if (req && req.headers.get("origin") !== hubOrigin()) return { error: NextResponse.json({ error: "Invalid request origin." }, { status: 403 }) };
  return { userId: session.user.id };
}
export function integrationError() {
  // Upstream OAuth errors may contain credentials or request bodies: never echo or log them.
  return NextResponse.json({ error: "Helium 10 request failed. Check the connection, account entitlement and Hub setup, then retry. Existing keywords were preserved." }, { status: 502 });
}

export async function requireHeliumAdmin(req?: NextRequest) {
  const access = await requireSeoOperator(req);
  if (access.error) return access;
  const session = await getAuthSession();
  if (!session || !["owner", "super_admin", "admin"].includes(session.user.role)) {
    return { error: NextResponse.json({ error: "Administrator access is required." }, { status: 403 }) };
  }
  return access;
}

// Reconnection is available to every internal user with SEO access, including viewers.
export async function requireSeoReconnect(req?: NextRequest) {
  const session = await getAuthSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!["owner", "super_admin", "admin", "editor", "viewer"].includes(session.user.role) || !canAccessSection(session, "seo")) {
    return { error: NextResponse.json({ error: "SEO access is required." }, { status: 403 }) };
  }
  if (req && req.headers.get("origin") !== hubOrigin()) return { error: NextResponse.json({ error: "Invalid request origin." }, { status: 403 }) };
  return { userId: session.user.id };
}
