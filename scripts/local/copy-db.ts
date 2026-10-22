/**
 * Copies every row of the local hub database into another Postgres (e.g. the
 * Supabase project for online QA). The target must already have the schema
 * (`npx drizzle-kit push` with DATABASE_URL pointing at it).
 *
 *   SOURCE_DATABASE_URL=postgres://postgres:postgres@localhost:54330/hub \
 *   TARGET_DATABASE_URL=postgres://...supabase... \
 *   npx tsx scripts/local/copy-db.ts [--replace]
 *
 * --replace empties each target table first. Without it, a table that already
 * has rows is skipped. Only columns present on both sides are copied; values go
 * through json_populate_recordset so arrays, jsonb, dates and numerics keep
 * their types. Sequences are moved past the copied ids.
 */
import postgres from "postgres";

const SOURCE = process.env.SOURCE_DATABASE_URL ?? "postgres://postgres:postgres@localhost:54330/hub";
const TARGET = process.env.TARGET_DATABASE_URL;
const REPLACE = process.argv.includes("--replace");
const BATCH = 500;

if (!TARGET) {
  console.error("Set TARGET_DATABASE_URL");
  process.exit(1);
}
const local = (u: string) => /localhost|127\.0\.0\.1/.test(u);
const src = postgres(SOURCE, { max: 1, ssl: local(SOURCE) ? false : "require", prepare: false });
const dst = postgres(TARGET, { max: 1, ssl: local(TARGET) ? false : "require", prepare: false });

type Col = { table: string; column: string; type: string };

/** Timestamp columns, read as text so microseconds survive (JS dates keep milliseconds only). */
const timeTypes = new Set<string>();

async function columns(db: postgres.Sql): Promise<Map<string, string[]>> {
  const rows = await db<Col[]>`
    select c.relname as table, a.attname as column, format_type(a.atttypid, a.atttypmod) as type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    order by a.attnum`;
  const m = new Map<string, string[]>();
  for (const r of rows) {
    m.set(r.table, [...(m.get(r.table) ?? []), r.column]);
    if (/^(timestamp|time)/.test(r.type)) timeTypes.add(`${r.table}.${r.column}`);
  }
  return m;
}

/** Tables ordered so that referenced tables come first (FK-safe inserts). */
async function fkOrder(db: postgres.Sql, tables: string[]): Promise<string[]> {
  const deps = await db<{ child: string; parent: string }[]>`
    select c.relname as child, p.relname as parent
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_class p on p.oid = k.confrelid
    join pg_namespace n on n.oid = c.relnamespace
    where k.contype = 'f' and n.nspname = 'public'`;
  const parents = new Map<string, Set<string>>();
  for (const d of deps) if (d.child !== d.parent) parents.set(d.child, (parents.get(d.child) ?? new Set()).add(d.parent));
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (t: string, stack: Set<string>) => {
    if (seen.has(t) || stack.has(t)) return;
    stack.add(t);
    for (const p of parents.get(t) ?? []) if (tables.includes(p)) visit(p, stack);
    stack.delete(t);
    seen.add(t);
    out.push(t);
  };
  for (const t of tables) visit(t, new Set());
  return out;
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

async function main() {
  const [srcCols, dstCols] = await Promise.all([columns(src), columns(dst)]);
  const shared = [...srcCols.keys()].filter((t) => dstCols.has(t) && !t.startsWith("__drizzle"));
  const missing = [...srcCols.keys()].filter((t) => !dstCols.has(t));
  if (missing.length) console.warn(`Not in target (skipped): ${missing.join(", ")}`);
  const order = await fkOrder(dst, shared);

  if (REPLACE) {
    // Children first, so foreign keys never block the delete.
    for (const t of [...order].reverse()) await dst.unsafe(`delete from ${q(t)}`);
  }

  let total = 0;
  for (const t of order) {
    const cols = srcCols.get(t)!.filter((c) => dstCols.get(t)!.includes(c));
    const [{ n }] = await dst.unsafe(`select count(*)::int as n from ${q(t)}`);
    if (n > 0 && !REPLACE) {
      console.log(`skip ${t} (target has ${n} rows)`);
      continue;
    }
    const list = cols.map(q).join(", ");
    const select = cols.map((c) => (timeTypes.has(`${t}.${c}`) ? `${q(c)}::text as ${q(c)}` : q(c))).join(", ");
    const rows = await src.unsafe(`select ${select} from ${q(t)}`).values();
    if (!rows.length) continue;
    // FK checks run at the end of each statement, so self-references inside one batch are fine.
    const objs = rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
    for (let i = 0; i < objs.length; i += BATCH) {
      const chunk = JSON.stringify(objs.slice(i, i + BATCH));
      await dst.unsafe(
        `insert into ${q(t)} (${list}) overriding system value select ${list} from json_populate_recordset(null::${q(t)}, $1::text::json)`,
        [chunk],
      );
    }
    total += objs.length;
    console.log(`${t}: ${objs.length}`);
  }

  // Move serial/identity sequences past the copied ids.
  const seqs = await dst<{ table: string; column: string; seq: string }[]>`
    select c.relname as table, a.attname as column, pg_get_serial_sequence(format('%I', c.relname), a.attname) as seq
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and pg_get_serial_sequence(format('%I', c.relname), a.attname) is not null`;
  for (const s of seqs) {
    await dst.unsafe(`select setval('${s.seq}', coalesce((select max(${q(s.column)}) from ${q(s.table)}), 0) + 1, false)`);
  }
  console.log(`Done: ${total} rows in ${order.length} tables; ${seqs.length} sequences reset.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await src.end();
    await dst.end();
  });
