/**
 * Bootstrap the first admin user by email.
 * Usage: npx tsx scripts/create-admin.ts admin@example.com
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/lib/db";
import { users } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/create-admin.ts <email>");
    process.exit(1);
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.email, email));
    console.log(`Updated existing user ${email} to admin role.`);
  } else {
    await db.insert(users).values({
      email,
      name: email.split("@")[0],
      role: "admin",
    });
    console.log(`Created new admin user: ${email}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
