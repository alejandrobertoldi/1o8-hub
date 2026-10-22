/**
 * Read-only introspection of the `attributes_master` table.
 *
 * Prints column list, indexes, constraints, row count, and one sample row
 * (with long values truncated). No writes, no side effects.
 *
 * Usage: npx tsx scripts/introspect-attributes-master.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require", max: 1, prepare: false });

function truncate(value: unknown, max = 200): string {
  if (value === null || value === undefined) return String(value);
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…(${s.length} chars)` : s;
}

async function main() {
  const TABLE = "attributes_master";

  // 1) Existence
  const existsRows = await sql<Array<{ oid: string | null }>>`
    SELECT to_regclass('public.' || ${TABLE}) AS oid
  `;
  if (!existsRows[0]?.oid) {
    console.log(`Table public.${TABLE} does not exist.`);
    return;
  }
  console.log(`=== ${TABLE} exists ===\n`);

  // 2) Row count
  const countRows = await sql<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM public.attributes_master
  `;
  console.log(`Row count: ${countRows[0]?.n ?? 0}\n`);

  // 3) Columns
  const columns = await sql<
    Array<{
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
      character_maximum_length: number | null;
    }>
  >`
    SELECT column_name, data_type, udt_name, is_nullable, column_default,
           character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${TABLE}
    ORDER BY ordinal_position
  `;
  console.log(`=== Columns (${columns.length}) ===`);
  for (const c of columns) {
    const len = c.character_maximum_length ? `(${c.character_maximum_length})` : "";
    const nul = c.is_nullable === "NO" ? "NOT NULL" : "NULL";
    const def = c.column_default ? ` DEFAULT ${c.column_default}` : "";
    console.log(`  ${c.column_name}: ${c.data_type}${len} (${c.udt_name}) ${nul}${def}`);
  }
  console.log("");

  // 4) Indexes
  const indexes = await sql<Array<{ indexname: string; indexdef: string }>>`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = ${TABLE}
    ORDER BY indexname
  `;
  console.log(`=== Indexes (${indexes.length}) ===`);
  for (const i of indexes) console.log(`  ${i.indexname}\n    ${i.indexdef}`);
  console.log("");

  // 5) Constraints
  const constraints = await sql<
    Array<{ conname: string; contype: string; def: string }>
  >`
    SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = ${TABLE}
    ORDER BY contype, conname
  `;
  console.log(`=== Constraints (${constraints.length}) ===`);
  for (const c of constraints) {
    const kind: Record<string, string> = { p: "PK", u: "UNIQUE", f: "FK", c: "CHECK" };
    console.log(`  [${kind[c.contype] ?? c.contype}] ${c.conname}\n    ${c.def}`);
  }
  console.log("");

  // 6) Incoming FKs
  const incoming = await sql<
    Array<{ referencing_table: string; def: string }>
  >`
    SELECT n2.nspname || '.' || t2.relname AS referencing_table,
           pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t1 ON t1.oid = c.confrelid
    JOIN pg_namespace n1 ON n1.oid = t1.relnamespace
    JOIN pg_class t2 ON t2.oid = c.conrelid
    JOIN pg_namespace n2 ON n2.oid = t2.relnamespace
    WHERE n1.nspname = 'public' AND t1.relname = ${TABLE} AND c.contype = 'f'
  `;
  console.log(`=== Incoming FKs (${incoming.length}) ===`);
  for (const i of incoming) console.log(`  ${i.referencing_table}: ${i.def}`);
  console.log("");

  // 7) Sample row
  const sample = await sql<Array<Record<string, unknown>>>`
    SELECT * FROM public.attributes_master LIMIT 1
  `;
  if (sample[0]) {
    console.log(`=== Sample row (1) ===`);
    for (const [k, v] of Object.entries(sample[0])) {
      console.log(`  ${k}: ${truncate(v)}`);
    }
    console.log("");
  } else {
    console.log("(table is empty — no sample row)\n");
  }

  // 8) Distinct counts for likely-key columns
  const likelyKeys = columns
    .map((c) => c.column_name)
    .filter((n) =>
      /^(product_type|marketplace_id|marketplace|client_id_code|general_label|reference_group|subgroup|attribute_name|field_name)$/i.test(
        n
      )
    );
  if (likelyKeys.length > 0) {
    console.log(`=== Distinct counts for likely-key columns ===`);
    for (const col of likelyKeys) {
      const r = await sql.unsafe<Array<{ n: number }>>(
        `SELECT COUNT(DISTINCT "${col}")::int AS n FROM public.attributes_master`
      );
      console.log(`  ${col}: ${r[0]?.n ?? 0} distinct`);
    }
    console.log("");
  }
}

main()
  .then(() => sql.end())
  .catch(async (err) => {
    console.error("ERROR:", err);
    await sql.end();
    process.exit(1);
  });
