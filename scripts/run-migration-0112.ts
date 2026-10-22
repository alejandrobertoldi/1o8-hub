/**
 * Migration 0112: invert shared logins to user → subscription → assigned users
 * Run with: npx tsx scripts/run-migration-0112.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true, override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require", max: 1 });

type Assigned = { userId: string; enabled: boolean };
type Sub = {
  subscriptionId: string;
  plan: string | null;
  activationCode: string | null;
  userLimit: number | null;
  assignedUsers: Assigned[];
};
type Account = { username: string; subscriptions: Sub[] };

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function invert(raw: unknown, fallbackUsername: string | null, assigned: Assigned[]): Account[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (
    raw.some(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        Array.isArray((entry as { subscriptions?: unknown }).subscriptions)
    )
  ) {
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as Record<string, unknown>;
      const username = asText(row.username);
      const subscriptions = Array.isArray(row.subscriptions)
        ? row.subscriptions.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const sub = item as Record<string, unknown>;
            return [
              {
                subscriptionId: asText(sub.subscriptionId),
                plan: asText(sub.plan) || null,
                activationCode: asText(sub.activationCode) || null,
                userLimit:
                  typeof sub.userLimit === "number" ? sub.userLimit : null,
                assignedUsers: Array.isArray(sub.assignedUsers)
                  ? (sub.assignedUsers as Assigned[])
                  : assigned,
              },
            ];
          })
        : [];
      if (!username && subscriptions.length === 0) return [];
      return [{ username, subscriptions }];
    });
  }

  const accounts: Account[] = [];
  const indexByKey = new Map<string, number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const usernames = Array.isArray(row.usernames)
      ? row.usernames.map((name) => asText(name)).filter(Boolean)
      : asText(row.username)
        ? [asText(row.username)]
        : fallbackUsername
          ? [fallbackUsername]
          : [""];
    const subscription: Sub = {
      subscriptionId: asText(row.subscriptionId),
      plan: asText(row.plan) || null,
      activationCode: asText(row.activationCode) || null,
      userLimit: typeof row.userLimit === "number" ? row.userLimit : null,
      assignedUsers: assigned,
    };
    for (const username of usernames.length > 0 ? usernames : [""]) {
      const key = username.toLowerCase() || `__blank_${accounts.length}`;
      let index = indexByKey.get(key);
      if (index == null) {
        index = accounts.length;
        indexByKey.set(key, index);
        accounts.push({ username, subscriptions: [] });
      }
      accounts[index]!.subscriptions.push(subscription);
    }
  }
  return accounts;
}

async function main() {
  console.log("Running migration 0112: shared logins hierarchy...");
  const accessRows = await sql<
    { login_id: string; user_id: string; enabled: boolean }[]
  >`
    SELECT login_id, user_id, enabled FROM shared_login_users
  `;
  const assignedByLogin = new Map<string, Assigned[]>();
  for (const row of accessRows) {
    const list = assignedByLogin.get(row.login_id) ?? [];
    list.push({ userId: row.user_id, enabled: row.enabled });
    assignedByLogin.set(row.login_id, list);
  }

  const rows = await sql<
    { id: string; username: string | null; subscriptions: unknown }[]
  >`
    SELECT id, username, subscriptions FROM shared_logins
  `;

  let updated = 0;
  for (const row of rows) {
    const tree = invert(
      row.subscriptions,
      row.username,
      assignedByLogin.get(row.id) ?? []
    );
    if (tree.length === 0) continue;
    await sql`
      UPDATE shared_logins
      SET subscriptions = ${sql.json(tree)}
      WHERE id = ${row.id}
    `;
    updated += 1;
  }

  console.log(`Migration 0112 applied successfully (${updated} login(s) reshaped).`);
  await sql.end();
}

main().catch((err) => {
  console.error("Migration 0112 failed:", err);
  process.exit(1);
});
