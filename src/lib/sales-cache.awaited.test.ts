import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Static source guard against the connection-leak outage of 2026-08-04.
 *
 * Root cause: `setCachedData()` and `fillPendingSnapshots()` were called
 * fire-and-forget (`fn(...).catch(...)` with no `await`) inside route handlers.
 * The handler returned its response, Vercel froze the sandbox, and the in-flight
 * `INSERT ... ON CONFLICT DO UPDATE` never received its protocol `Sync`. Postgres
 * was left holding an open transaction in `state=active` /
 * `wait_event=Client:ClientRead` — which neither `statement_timeout` nor
 * `idle_in_transaction_session_timeout` can reap. Supavisor runs in transaction
 * mode, so each of those immortal transactions pinned a pool slot, starving every
 * other request until Supavisor's own idle reaper cleared it ~10-18 min later.
 *
 * The invariant that prevents it: a DB write started inside a request handler must
 * be AWAITED, so the write completes before the sandbox can be frozen. Wrapping the
 * await in `after()` from `next/server` keeps the response latency unchanged while
 * still keeping the invocation alive (on Vercel `after` is backed by `waitUntil`).
 *
 * This is a raw-source scan, deliberately: the bug is a missing keyword, which no
 * runtime test of these routes would catch.
 */

const API_ROOT = join(process.cwd(), "src/app/api");

/**
 * Helpers that touch Postgres and must therefore never be fire-and-forget.
 * The last three are declared locally inside their own route files rather than
 * imported, which is why the scan skips declaration lines as well as import lines.
 *
 * `moveClientFolder` is here because it opens with a `db.select()` on `drive_folders`
 * before its two Drive HTTP calls. It is not a write, but a bare SELECT is still an
 * implicit transaction, so a sandbox frozen with it in flight pins a Supavisor slot
 * with the same `state=active` / `wait_event=Client:ClientRead` signature.
 */
const DB_WRITE_HELPERS = [
  "setCachedData",
  "fillPendingSnapshots",
  "autoAssignGanttTasks",
  "autoAssignAfterInit",
  "moveClientFolder",
  "createImpactSnapshot",
] as const;

/**
 * Helpers whose work is a purely EXTERNAL side effect (Asana, Drive) with no Postgres
 * traffic at all. These cannot wedge a pool slot, so they are a different failure mode
 * of the same bug: when Vercel freezes the sandbox the in-flight call is abandoned and
 * the side effect simply never happens — the Asana task stays open forever, and nothing
 * logs an error because there is no error. Silent and permanent, where the connection
 * leak was loud and self-healing. `after()` is the same fix for both classes.
 */
const EXTERNAL_EFFECT_HELPERS = ["markAsanaTaskOnDelete"] as const;

/** Every helper that must be awaited, whatever its failure mode. */
const DEFERRED_HELPERS = [...DB_WRITE_HELPERS, ...EXTERNAL_EFFECT_HELPERS] as const;

/** The consequence of leaving a given helper un-awaited, for the failure message. */
function consequenceOf(helper: string): string {
  return (DB_WRITE_HELPERS as readonly string[]).includes(helper)
    ? "A DB query started in a handler but not awaited is abandoned mid-protocol when\n" +
        "Vercel freezes the sandbox, wedging a Supavisor pool slot."
    : "An external call started in a handler but not awaited is abandoned when Vercel\n" +
        "freezes the sandbox, so the side effect silently never happens.";
}

function collectRouteFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectRouteFiles(full, acc);
    else if (entry.name === "route.ts") acc.push(full);
  }
  return acc;
}

const routeFiles = collectRouteFiles(API_ROOT);

describe("DB-writing helpers are never fire-and-forget in route handlers", () => {
  it("finds route files to scan (guards against a vacuous pass)", () => {
    expect(routeFiles.length).toBeGreaterThan(50);
  });

  for (const helper of DEFERRED_HELPERS) {
    it(`every ${helper}() call site is awaited`, () => {
      const offenders: string[] = [];

      for (const file of routeFiles) {
        const source = readFileSync(file, "utf8");
        if (!source.includes(`${helper}(`)) continue;

        const lines = source.split("\n");
        lines.forEach((line, i) => {
          // Skip the import statement and the function's own declaration.
          if (/^\s*import\b/.test(line)) return;
          if (new RegExp(`function\\s+${helper}\\b`).test(line)) return;
          if (new RegExp(`\\b(const|let|var)\\s+${helper}\\b`).test(line)) return;
          if (!new RegExp(`\\b${helper}\\s*\\(`).test(line)) return;
          if (/\bawait\s+$/.test(line.slice(0, line.indexOf(helper)))) return;

          offenders.push(
            `${file.replace(process.cwd() + "/", "")}:${i + 1}  ${line.trim()}`,
          );
        });
      }

      expect(
        offenders,
        `Un-awaited ${helper}() call(s) found. ${consequenceOf(helper)}\n` +
          `Wrap it as:\n` +
          `  after(async () => { try { await ${helper}(...) } catch (err) { console.error(...) } });\n\n` +
          `Offenders:\n${offenders.join("\n")}`,
      ).toEqual([]);
    });
  }

  it("user-facing routes that defer work import after() from next/server", () => {
    const missing: string[] = [];

    for (const file of routeFiles) {
      // Cron routes are exempt: no user is waiting on the response, so awaiting
      // the write inline is both leak-safe and simpler. after() buys nothing there.
      if (file.includes("/api/cron/")) continue;

      const source = readFileSync(file, "utf8");
      const usesHelper = DEFERRED_HELPERS.some((h) =>
        new RegExp(`\\bawait\\s+${h}\\s*\\(`).test(source),
      );
      if (!usesHelper) continue;
      if (!/\bafter\b[^\n]*from "next\/server"/.test(source)) {
        missing.push(file.replace(process.cwd() + "/", ""));
      }
    }

    expect(
      missing,
      `These routes await a deferrable helper but do not import after() from next/server.\n` +
        `Awaiting inline is leak-safe but adds the write's latency to the user's response;\n` +
        `after() keeps the response fast and the invocation alive. Files:\n${missing.join("\n")}`,
    ).toEqual([]);
  });
});
