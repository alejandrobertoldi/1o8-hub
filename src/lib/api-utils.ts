import { NextResponse } from "next/server";
import { parseClientIdCodes } from "@/lib/client-codes";

// ---------------------------------------------------------------------------
// Error message extraction
// ---------------------------------------------------------------------------

/**
 * Safely extract a human-readable message from an unknown caught value.
 * Replaces the repeated `err instanceof Error ? err.message : "fallback"` pattern.
 */
export function getErrorMessage(err: unknown, fallback = "Unknown error"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

// ---------------------------------------------------------------------------
// Standard JSON error responses
// ---------------------------------------------------------------------------

/** 401 Unauthorized */
export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** 403 Forbidden */
export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

/** 400 Bad Request */
export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** 404 Not Found */
export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

/** 500 Internal Server Error — extracts message from unknown error */
export function serverError(err: unknown, fallback?: string) {
  return NextResponse.json(
    { error: getErrorMessage(err, fallback) },
    { status: 500 },
  );
}

// ---------------------------------------------------------------------------
// Portal client code resolution
// ---------------------------------------------------------------------------

type PortalSession = {
  user: {
    role: string;
    clientIdCode?: string | null;
  };
};

/**
 * Resolve the client ID code for portal API routes.
 *
 * - client/prospect: `?client=` if it is one of their assigned codes; otherwise
 *   the first assigned code. The full comma-separated session value is never
 *   used as a lookup key (that string is not an AAC row).
 * - admin/super_admin/owner: `?client=` is required
 * - other roles: Forbidden
 */
export function resolvePortalClient(
  session: PortalSession,
  searchParams: URLSearchParams,
): { clientIdCode: string; response?: never } | { clientIdCode?: never; response: NextResponse } {
  const role = session.user.role;

  if (role === "client" || role === "prospect") {
    const assigned = parseClientIdCodes(session.user.clientIdCode);
    if (assigned.length === 0) return { response: forbidden() };
    const requested = searchParams.get("client")?.trim() || null;
    if (requested) {
      if (!assigned.includes(requested)) {
        return { response: forbidden("Not assigned to this client") };
      }
      return { clientIdCode: requested };
    }
    return { clientIdCode: assigned[0] };
  }

  if (role === "admin" || role === "super_admin" || role === "owner") {
    const param = searchParams.get("client");
    if (!param) return { response: badRequest("Missing client param") };
    return { clientIdCode: param };
  }

  return { response: forbidden() };
}
