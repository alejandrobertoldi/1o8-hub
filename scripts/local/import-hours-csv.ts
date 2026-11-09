/**
 * Load one person's hours from a CSV into the hub (e.g. a week moved over from
 * the old time-tracking sheet). Every row goes through the same checks as the
 * Hours form (client, project, type of work, 15-min steps). Rows already in
 * the hub (same person, date, client, project, type, hours and note) are
 * skipped, so running it twice never doubles hours. Dry run unless --apply.
 *
 * CSV columns used (header names): date, hours, client, type of work,
 * project number, note. Other columns are ignored.
 *
 *   npm run hours:import -- --file rye.csv --user ryshel.hipolito@1o8.agency
 *   npm run hours:import -- --file rye.csv --user ryshel.hipolito@1o8.agency --prod --apply
 */
import { readFileSync } from "node:fs";

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

async function main() {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > -1 ? (process.argv[i + 1] ?? "").trim() : "";
  };
  const file = arg("--file");
  const email = arg("--user").toLowerCase();
  if (!file || !email) throw new Error("Pass --file <csv> --user <email>");
  const prod = process.argv.includes("--prod");
  const apply = process.argv.includes("--apply");
  if (prod) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error("SUPABASE_DATABASE_URL is missing from .env.local");
    process.env.DATABASE_URL = url;
    process.env.DB_POOLER = "transaction";
  }
  const { db } = await import("@/lib/db");
  const { timeLogs, users } = await import("@/lib/db/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  const { resolveTimeLog, timeLogInputSchema } = await import("@/lib/time-logs/server");

  const [person] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(sql`lower(${users.email})`, email));
  if (!person) throw new Error(`No user with email ${email}`);
  console.log(`${prod ? "PRODUCTION" : "LOCAL"} · ${person.name} <${email}> · ${file}\n`);

  const rows = parseCsv(readFileSync(file, "utf8"));
  type Ready = NonNullable<Extract<Awaited<ReturnType<typeof resolveTimeLog>>, { ok: true }>["values"]>;
  const ready: Ready[] = [];
  const errors: string[] = [];
  let skipped = 0;
  for (const [i, r] of rows.entries()) {
    const label = `row ${i + 2}${r["sheet row"] ? ` (sheet ${r["sheet row"]})` : ""}`;
    const parsed = timeLogInputSchema.safeParse({
      entryDate: r.date,
      hours: r.hours,
      clientIdCode: r.client,
      department: r["type of work"],
      projectNumber: r["project number"],
      note: r.note,
    });
    if (!parsed.success) {
      errors.push(`${label}: ${parsed.error.issues.map((x) => x.message).join("; ")}`);
      continue;
    }
    const resolved = await resolveTimeLog(parsed.data);
    if (!resolved.ok) {
      errors.push(`${label}: ${resolved.error}`);
      continue;
    }
    const v = resolved.values;
    const [dupe] = await db
      .select({ id: timeLogs.id })
      .from(timeLogs)
      .where(
        and(
          eq(timeLogs.userId, person.id),
          eq(timeLogs.entryDate, v.entryDate),
          eq(timeLogs.clientIdCode, v.clientIdCode),
          eq(timeLogs.projectNumber, v.projectNumber),
          eq(timeLogs.department, v.department),
          eq(timeLogs.hours, v.hours.toFixed(2)),
          sql`coalesce(${timeLogs.note}, '') = ${v.note ?? ""}`,
        ),
      )
      .limit(1);
    const line = `${v.entryDate}  ${v.hours.toFixed(2).padStart(5)} h  ${v.clientIdCode.padEnd(4)} ${v.projectNumber}  ${v.department.padEnd(19)} ${v.projectName.slice(0, 40).padEnd(40)}  "${v.note ?? ""}"`;
    if (dupe) {
      skipped++;
      console.log(`  already in hub  ${line}`);
      continue;
    }
    console.log(`  ${apply ? "adding" : "would add"}      ${line}`);
    ready.push(v);
  }

  const total = ready.reduce((a, v) => a + v.hours, 0);
  console.log(`\n${ready.length} to add (${total.toFixed(2)} h) · ${skipped} already in the hub · ${errors.length} with errors`);
  if (errors.length) {
    console.log(errors.map((e) => `  ✗ ${e}`).join("\n"));
    console.log("\nFix the errors first; nothing was added.");
    process.exit(1);
  }
  if (!apply) {
    console.log("\nDry run — add --apply to add them.");
    process.exit(0);
  }
  if (ready.length) {
    const now = new Date();
    await db.insert(timeLogs).values(ready.map(({ hours, ...rest }) => ({ ...rest, hours: hours.toFixed(2), userId: person.id, createdAt: now, updatedAt: now })));
  }
  console.log(`\nAdded ${ready.length} entries for ${person.name}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
