import { NextRequest, NextResponse } from "next/server";
import { createAuthMiddlewareClient } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createAuthMiddlewareClient(request, response);

  // Refresh the session (extends expiry, syncs cookies)
  const { data: { user } } = await supabase.auth.getUser();

  // Allow public routes through
  const { pathname } = request.nextUrl;
  const isPublicRoute =
    pathname === "/login" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname === "/logo.png";

  if (!user && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If logged in and visiting /login, redirect to dashboard
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
