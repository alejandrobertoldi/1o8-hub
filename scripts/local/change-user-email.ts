/**
 * Change a hub user's login email (Google sign-in matches users.email).
 * Keeps everything tied to the same user row (hours, PTO, role, profile).
 * The old email is kept as their Asana email (when none is set) so Asana
 * tasks still match while Asana uses the old address.
 *
 * If the person already signed in with the new email, the hub created an
 * empty "pending" account for it; that account is removed first (only when
 * it is pending — anything else stops the script).
 *
 *   npm run user:email -- --from old@1o8.agency --to new@1o8.agency          # local, dry run
 *   npm run user:email -- --from old@1o8.agency --to new@1o8.agency --prod --apply
 */
async function main() {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > -1 ? (process.argv[i + 1] ?? "").trim().toLowerCase() : "";
  };
  const from = arg("--from");
  const to = arg("--to");
  if (!from.includes("@") || !to.includes("@") || from === to) throw new Error("Pass --from <old email> --to <new email>");
  const prod = process.argv.includes("--prod");
  const apply = process.argv.includes("--apply");
  if (prod) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error("SUPABASE_DATABASE_URL is missing from .env.local");
    process.env.DATABASE_URL = url;
    process.env.DB_POOLER = "transaction";
  }
  const { db } = await import("@/lib/db");
  const { users } = await import("@/lib/db/schema");
  const { eq, sql } = await import("drizzle-orm");

  const find = (email: string) =>
    db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, asanaEmail: users.asanaEmail, lastLogin: users.lastLoginAt })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email))
      .then((r) => r[0] ?? null);
  const [person, clash] = await Promise.all([find(from), find(to)]);

  console.log(`${prod ? "PRODUCTION" : "LOCAL"} · ${from} → ${to}`);
  if (!person) throw new Error(`No user with email ${from}`);
  console.log(`User: ${person.name ?? "—"} (${person.role}) · id ${person.id}`);
  if (clash) {
    console.log(`Already an account with ${to}: ${clash.name ?? "—"} (${clash.role}) · id ${clash.id} · last login ${clash.lastLogin?.toISOString() ?? "never"}`);
    if (clash.role !== "pending") throw new Error(`${to} belongs to a ${clash.role} account — sort it out by hand; nothing was changed.`);
    console.log("  → it is an empty pending sign-up and will be removed.");
  }
  const asanaEmail = person.asanaEmail ?? from;
  console.log(`Asana email: ${asanaEmail}`);

  if (!apply) {
    console.log("\nDry run — add --apply to make the change.");
    process.exit(0);
  }
  await db.transaction(async (tx) => {
    if (clash) await tx.delete(users).where(eq(users.id, clash.id));
    await tx.update(users).set({ email: to, asanaEmail, updatedAt: new Date() }).where(eq(users.id, person.id));
  });
  console.log(`\nDone. ${person.name ?? to} now signs in with ${to}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
