import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/** Constant-time check of "Bearer <CRON_SECRET>" (the proxy runs on the edge: no node:crypto). */
function hasCronSecret(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorization) return false;
  const expected = `Bearer ${secret}`;
  if (authorization.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= authorization.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow auth routes and static assets
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/calculator") ||
    pathname.startsWith("/status") ||
    pathname.startsWith("/reports/monthly/print") || // token-authenticated; no session needed
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|woff2?)$/)
  ) {
    return NextResponse.next();
  }

  // Cron-to-API internal calls skip the session check, but only with the CRON_SECRET bearer:
  // the header alone used to open every /api route that relied on this proxy for auth.
  if (req.headers.get("x-cron-refresh") === "true" && pathname.startsWith("/api/") && hasCronSecret(req.headers.get("authorization"))) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to sign-in
  if (!req.auth) {
    // API routes: return 401 JSON instead of redirect (fetch can't follow HTML redirects)
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(signInUrl);
  }

  const role = (req.auth as { user?: { role?: string } })?.user?.role;

  // Pending users: only allow register page and auth API
  if (role === "pending") {
    if (pathname.startsWith("/auth/register") || pathname.startsWith("/api/auth")) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Account pending approval" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/auth/register", req.url));
  }

  // Client users: only allow portal pages and whitelisted APIs
  if (role === "client") {
    if (
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/api/portal") ||
      pathname.startsWith("/api/sales-summary") ||
      pathname.startsWith("/api/impact") ||
      pathname.startsWith("/api/aplus") ||
      pathname.startsWith("/api/drive/file") ||
      (pathname.startsWith("/api/reports/") && req.method === "GET") ||
      pathname === "/api/ppc/sales-monitor" ||
      pathname === "/api/ppc/forecast"
    ) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (
      !pathname.startsWith("/portal") &&
      !pathname.startsWith("/aplus2") &&
      !pathname.startsWith("/design/aplus2")
    ) {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  }

  // Prospect users: portal-confined, read-only (same APIs as client, minus write endpoints)
  if (role === "prospect") {
    if (
      pathname.startsWith("/api/auth") ||
      (pathname.startsWith("/api/portal") && req.method === "GET") ||
      pathname.startsWith("/api/sales-summary") ||
      pathname.startsWith("/api/impact") ||
      pathname.startsWith("/api/aplus") ||
      pathname.startsWith("/api/drive/file") ||
      (pathname.startsWith("/api/reports/") && req.method === "GET") ||
      (pathname === "/api/ppc/sales-monitor" && req.method === "GET") ||
      (pathname === "/api/ppc/forecast" && req.method === "GET")
    ) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!pathname.startsWith("/portal")) {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  }

  // Non-client/prospect users: block /portal (Owner / Super Admin / Admin may preview)
  const canPreviewPortal =
    role === "admin" || role === "super_admin" || role === "owner";
  if (
    role &&
    role !== "client" &&
    role !== "prospect" &&
    !canPreviewPortal &&
    pathname.startsWith("/portal")
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
