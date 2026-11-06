/**
 * Read-only: hours already logged that probably are Account Management (the
 * type of work added on 2026-11-06). Two signals:
 *   strong   — the person is the client's Account Manager (AAC) and logged it
 *              as meetings / project management / strategy / reporting / admin
 *   possible — the note or the Asana task reads like account work (client
 *              calls / emails, check-ins, status, recaps, QBRs, billing, SOW…)
 * Prints a summary per person and writes every candidate to
 * hours-account-management-audit-{prod,local}.csv to review; it changes nothing unless
 * --apply is passed.
 *
 *   npm run hours:audit-am            # local DB
 *   npm run hours:audit-am -- --prod  # production (SUPABASE_DATABASE_URL)
 *
 * Retype candidates to Account Management (dry run unless --apply):
 *   --retype strong|possible|all   which signal(s) to retype
 *   --types "Client Meetings,Admin Work"   only entries currently of these types
 *   --exclude <id,id>  /  --include <id,id>   fine-tune by entry id (CSV last column)
 *   --apply                        write the change
 */
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
config({ path: ".env.local" });

/** Types an Account Manager uses today for what is account work. */
const AM_LIKE_TYPES = new Set(["Client Meetings", "Project Management", "Strategy & Planning", "Reporting & Analytics", "Admin Work"]);
const ACCOUNT_WORDS =
  /account (management|mgmt|review)|\bAM\b|client (call|email|comms?|communication|check[- ]?in|update|follow[- ]?up|feedback|meeting|sync)|check[- ]?in|status (call|update|report|meeting)|weekly (call|sync|update|meeting)|recap|\bQBR\b|quarterly (business )?review|invoice|billing|renewal|\bSOW\b|scope|contract|kick[- ]?off|onboarding/i;

async function main() {
  if (process.argv.includes("--prod")) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error("SUPABASE_DATABASE_URL is missing from .env.local");
    process.env.DATABASE_URL = url;
    process.env.DB_POOLER = "transaction";
  }
  const { db } = await import("@/lib/db");
  const { aac, timeLogs, users } = await import("@/lib/db/schema");
  const { eq, inArray } = await import("drizzle-orm");

  const [logs, clients] = await Promise.all([
    db
      .select({
        id: timeLogs.id,
        date: timeLogs.entryDate,
        hours: timeLogs.hours,
        client: timeLogs.clientIdCode,
        type: timeLogs.department,
        project: timeLogs.projectNumber,
        task: timeLogs.projectName,
        note: timeLogs.note,
        person: users.name,
      })
      .from(timeLogs)
      .innerJoin(users, eq(users.id, timeLogs.userId)),
    db.select({ code: aac.clientIdCode, raw: aac.rawData }).from(aac),
  ]);

  // Client code → its Account Manager(s), by name (AAC "AccountManager" column).
  const amOf = new Map<string, Set<string>>();
  for (const c of clients) {
    const names = ((c.raw ?? {}) as Record<string, string>).AccountManager_MF ?? "";
    amOf.set(c.code.toUpperCase(), new Set(names.split(/[,;/]/).map((n) => n.trim().toLowerCase()).filter(Boolean)));
  }

  type Hit = (typeof logs)[number] & { signal: "strong" | "possible"; why: string };
  const hits: Hit[] = [];
  for (const l of logs) {
    if (l.type === "Account Management" || l.type === "Time Off") continue;
    const isAm = !!l.person && amOf.get(l.client.toUpperCase())?.has(l.person.trim().toLowerCase());
    const words = ACCOUNT_WORDS.exec(`${l.note ?? ""} ${l.task ?? ""}`)?.[0];
    if (isAm && AM_LIKE_TYPES.has(l.type)) hits.push({ ...l, signal: "strong", why: `${l.client}'s Account Manager, logged as ${l.type}${words ? ` · "${words}"` : ""}` });
    else if (words) hits.push({ ...l, signal: "possible", why: `mentions "${words}"` });
  }

  const total = logs.reduce((a, l) => a + Number(l.hours), 0);
  const sum = (list: Hit[]) => list.reduce((a, l) => a + Number(l.hours), 0);
  console.log(`${logs.length} entries · ${total.toFixed(2)} h logged in all\n`);
  for (const signal of ["strong", "possible"] as const) {
    const list = hits.filter((h) => h.signal === signal);
    console.log(`${signal.toUpperCase()}: ${list.length} entries · ${sum(list).toFixed(2)} h`);
    const byPerson = new Map<string, Hit[]>();
    for (const h of list) byPerson.set(h.person ?? "—", [...(byPerson.get(h.person ?? "—") ?? []), h]);
    for (const [person, items] of [...byPerson].sort((a, b) => sum(b[1]) - sum(a[1]))) {
      const types = new Map<string, number>();
      for (const i of items) types.set(i.type, (types.get(i.type) ?? 0) + Number(i.hours));
      console.log(`  ${person.padEnd(24)} ${sum(items).toFixed(2).padStart(7)} h · ${[...types].map(([t, h]) => `${t} ${h.toFixed(2)}`).join(" · ")}`);
    }
    console.log();
  }

  const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["signal", "why", "date", "person", "client", "current type", "hours", "project", "task", "note", "entry id"].join(","),
    ...hits
      .sort((a, b) => a.signal.localeCompare(b.signal) || b.date.localeCompare(a.date))
      .map((h) => [h.signal, h.why, h.date, h.person, h.client, h.type, h.hours, h.project, h.task, h.note, h.id].map(csv).join(",")),
  ];
  // One file per database, so a local run never overwrites the production audit.
  const file = process.argv.includes("--prod") ? "hours-account-management-audit-prod.csv" : "hours-account-management-audit-local.csv";
  writeFileSync(file, lines.join("\n"));
  console.log(`Every candidate → ${file}`);

  // Optional retype.
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > -1 ? (process.argv[i + 1] ?? "") : null;
  };
  const ids = (name: string) => new Set((arg(name) ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const retype = arg("--retype");
  const include = ids("--include");
  if (!retype && !include.size) {
    console.log("(nothing was changed)");
    process.exit(0);
  }
  if (retype && !["strong", "possible", "all"].includes(retype)) throw new Error("--retype must be strong, possible or all");
  const onlyTypes = new Set((arg("--types") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const exclude = ids("--exclude");
  const picked = hits.filter(
    (h) =>
      include.has(h.id) ||
      (!!retype && (retype === "all" || h.signal === retype) && (!onlyTypes.size || onlyTypes.has(h.type)) && !exclude.has(h.id)),
  );
  const apply = process.argv.includes("--apply");
  console.log(`\n${apply ? "RETYPING" : "WOULD RETYPE (dry run, add --apply)"}: ${picked.length} entries · ${sum(picked).toFixed(2)} h → Account Management`);
  for (const h of picked) console.log(`  ${h.date} ${String(h.person ?? "—").padEnd(20)} ${h.client.padEnd(4)} ${h.type.padEnd(22)} ${Number(h.hours).toFixed(2)} h  ${h.id}`);
  if (apply && picked.length) {
    const done = await db
      .update(timeLogs)
      .set({ department: "Account Management", updatedAt: new Date() })
      .where(inArray(timeLogs.id, picked.map((h) => h.id)))
      .returning({ id: timeLogs.id });
    console.log(`Updated ${done.length} entries.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
