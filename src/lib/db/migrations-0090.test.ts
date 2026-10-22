import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SQL = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0090_team_user_detail.sql"),
  "utf8"
);

describe("0090_team_user_detail.sql", () => {
  it("touches `users` with exactly one ALTER TABLE", () => {
    // One statement means one ACCESS EXCLUSIVE lock acquisition on the table
    // every auth read holds an ACCESS SHARE lock on.
    const alters = SQL.match(/ALTER TABLE "users"/g) ?? [];
    expect(alters).toHaveLength(1);
  });

  it("takes the lock on `users` before creating any table", () => {
    // Each new table's FK to users(id) takes SHARE ROW EXCLUSIVE. Acquiring
    // ACCESS EXCLUSIVE first means those never have to UPGRADE a lock, which
    // is the path that can deadlock against a concurrent reader.
    const alterAt = SQL.indexOf('ALTER TABLE "users"');
    const firstCreateTableAt = SQL.indexOf("CREATE TABLE");
    expect(alterAt).toBeGreaterThan(-1);
    expect(firstCreateTableAt).toBeGreaterThan(-1);
    expect(alterAt).toBeLessThan(firstCreateTableAt);
  });

  it("uses an inclusive bare-effective_to daterange in the EXCLUDE (ruling F4)", () => {
    expect(SQL).toContain("daterange(effective_from, effective_to, '[]')");
    // '[)' would make effective_to exclusive AND would let
    // effective_to = effective_from be an EMPTY range, which never overlaps —
    // defeating the constraint entirely.
    expect(SQL).not.toContain("'[)'");
    // coalesce(…, 'infinity'::date) under '[]' would ask Postgres to
    // canonicalise an inclusive infinite upper bound.
    expect(SQL).not.toContain("infinity");
    expect(SQL).toContain("user_pay_periods_no_overlap");
  });

  it("creates btree_gist idempotently before using gist", () => {
    const extAt = SQL.indexOf("CREATE EXTENSION IF NOT EXISTS btree_gist");
    const gistAt = SQL.indexOf("EXCLUDE USING gist");
    expect(extAt).toBeGreaterThan(-1);
    expect(gistAt).toBeGreaterThan(extAt);
  });

  it("is additive only — no drop, no rename, no delete", () => {
    expect(SQL).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|TYPE|INDEX)/i);
    expect(SQL).not.toMatch(/RENAME\s+(TO|COLUMN)/i);
    expect(SQL).not.toMatch(/\bDELETE\s+FROM\b/i);
    // calendar_events must not appear at all (global constraint).
    expect(SQL).not.toContain("calendar_events");
  });
});
