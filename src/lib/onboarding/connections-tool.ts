/**
 * TEMPORARY (2026-11): bulk "connect what's missing" table at
 * /onboarding/connections, for Alejandro only while client connections are
 * caught up. Delete this file, the page, its API route and the link once done.
 */
export const CONNECTIONS_TOOL_EMAILS: ReadonlySet<string> = new Set(["alejandro.bertoldi@1o8.agency"]);

export function canUseConnectionsTool(user: { role?: string | null; email?: string | null } | null | undefined): boolean {
  return user?.role === "owner" && CONNECTIONS_TOOL_EMAILS.has((user.email ?? "").toLowerCase());
}
