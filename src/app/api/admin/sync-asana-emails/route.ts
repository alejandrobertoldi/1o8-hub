import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";
import { asanaFetch } from "@/lib/onboarding/create-asana-project";

/**
 * POST /api/admin/sync-asana-emails
 * Fetches all users from the Asana workspace and auto-matches them
 * to hub users by name. Updates asana_email for matches.
 */
export async function POST() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Get all Asana workspace users
  const { data: workspaces } = await asanaFetch("/workspaces?limit=1");
  if (!workspaces?.length) {
    return NextResponse.json({ error: "No Asana workspace found" }, { status: 500 });
  }
  const workspaceGid = workspaces[0].gid;

  const { data: asanaUsers } = await asanaFetch(
    `/workspaces/${workspaceGid}/users?opt_fields=name,email&limit=100`
  );

  // 2. Get hub users without asana_email
  const hubUsers = await db.select().from(users);

  // 3. Match by name (case-insensitive) or email local part
  let updated = 0;
  const matches: { hubEmail: string; asanaEmail: string; matchedBy: string }[] = [];

  for (const hub of hubUsers) {
    if (hub.asanaEmail) continue; // already set

    const hubName = (hub.name ?? "").toLowerCase().trim();
    const hubLocal = hub.email.split("@")[0].toLowerCase();

    for (const asana of asanaUsers as { gid: string; name: string; email: string }[]) {
      if (!asana.email) continue;
      const asanaName = (asana.name ?? "").toLowerCase().trim();
      const asanaLocal = asana.email.split("@")[0].toLowerCase();

      // Match by exact name or by email local part
      const nameMatch = hubName && asanaName && hubName === asanaName;
      const localMatch = hubLocal && asanaLocal && hubLocal === asanaLocal;

      if (nameMatch || localMatch) {
        await db
          .update(users)
          .set({ asanaEmail: asana.email.toLowerCase() })
          .where(eq(users.id, hub.id));
        matches.push({
          hubEmail: hub.email,
          asanaEmail: asana.email,
          matchedBy: nameMatch ? "name" : "local-part",
        });
        updated++;
        break;
      }
    }
  }

  return NextResponse.json({
    success: true,
    asanaUsersFound: (asanaUsers as unknown[]).length,
    hubUsersChecked: hubUsers.filter((u) => !u.asanaEmail).length,
    updated,
    matches,
  });
}
