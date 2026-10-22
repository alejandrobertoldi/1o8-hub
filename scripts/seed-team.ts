/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Seed team members with correct access levels.
 * Usage: npm run seed-team
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const teamMembers = [
  { name: "Jake Kosten", email: "jake@1o8.agency", role: "admin" as const },
  { name: "Manu Lancharro", email: "manuel.lancharro@1o8.agency", role: "admin" as const },
  { name: "Amir Zeb", email: "amir@1o8.agency", role: "editor" as const },
  { name: "Muhammad Aqib", email: "muhammad@1o8.agency", role: "editor" as const },
  { name: "Sohail Asghar", email: "sohail@1o8.agency", role: "editor" as const },
  { name: "Jo Carticiano", email: "carticiano@1o8.agency", role: "editor" as const },
  { name: "Alvin Allan Lumibao", email: "alumibao@1o8.agency", role: "editor" as const },
  { name: "Babar Ahmad", email: "babar.ahmad@1o8.agency", role: "editor" as const },
  { name: "Abid Khan", email: "abid.khan@1o8.agency", role: "editor" as const },
  { name: "Ruslan Makarenko", email: "ruslan.makarenko@1o8.agency", role: "editor" as const },
  { name: "Aqib Abbasi", email: "aqib@1o8.agency", role: "editor" as const },
  { name: "Md Alam", email: "alamamzexact@gmail.com", role: "editor" as const },
  { name: "Hamid Zeb", email: "hamid.zeb@1o8.agency", role: "editor" as const },
  { name: "Jose Gonzalez", email: "jose.gonzalez@1o8.agency", role: "editor" as const },
];

async function main() {
  // Dynamic imports so dotenv loads DATABASE_URL before the db client connects
  const { db } = await import("../src/lib/db");
  const { users } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  let inserted = 0;
  let updated = 0;

  for (const member of teamMembers) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, member.email))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(users)
        .set({ name: member.name, role: member.role })
        .where(eq(users.email, member.email));
      updated++;
      console.log(`  Updated: ${member.email} → ${member.role}`);
    } else {
      await db.insert(users).values({
        email: member.email,
        name: member.name,
        role: member.role,
      });
      inserted++;
      console.log(`  Inserted: ${member.email} → ${member.role}`);
    }
  }

  console.log(`\nDone! Inserted: ${inserted}, Updated: ${updated}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
