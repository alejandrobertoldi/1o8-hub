# Empty-Unit Skip for the Nightly Redshift→BigQuery Archival — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop enqueuing the 257 nightly work units that have never read a single row, while probing each of them at least once every `floor(repull_window_days / 2)` days so a unit that starts producing data is archived late but never lost.

**Architecture:** The decision is a pure function over each unit's `rows_read` history — no new tables, no new columns, no stored counters, no migration. `work-units.ts` (already unit-tested, no I/O) gains the predicate and filters the Cartesian product it already builds. `enqueuer.ts` (I/O layer, no tests) gains one grouped `SELECT` over `redshift_archive_runs` and passes the resulting map in. Skipped units are simply never inserted as rows, so the drainer needs no skip logic at all — it claims `pending` rows and there is nothing to claim. A third, independent task tightens the drain time budget, which the freed capacity pays for.

**Tech Stack:** TypeScript, Next.js 16 App Router (Vercel cron), Drizzle ORM over PostgreSQL (Supabase), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-archive-empty-unit-skip-design.md` — read it before Task 1. ⚠️ That file is **untracked** in git; confirm it exists before starting and do not reconstruct it from this plan.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Additive only.** No migration, no schema change, no new column, no new `status` value. If a task appears to need one, stop and escalate.
- **The dev DB *is* prod Supabase.** Every DB write, every live BigQuery write, every commit, every push, every merge needs its own separate explicit OK from Manu. Nothing in this plan writes to the DB; `npx tsx scripts/...` probes are always allowed, but `npx tsx scripts/archive-enqueue.ts` needs an ask **every time** because it inserts rows.
- **NEVER run `next build`.** Typecheck with `node_modules/.bin/tsc --noEmit`, run in the background (~2 min), read the output **unfiltered**, and judge **by filename**. The bar is **zero errors in `src/lib/archive/`**. The set of pre-existing errors in *other* files changes between sessions as sibling Claude sessions edit this shared checkout — never carry a count forward from an earlier session, and never "fix" a foreign error.
- **Vitest does not typecheck.** Always follow a test run with `tsc --noEmit`.
- **Predict the test count before running.** Stated per task below. A count that does not match means something was deleted or double-registered.
- **Branch off `origin/main` (`882a5641`), not the current checkout.** This working tree is on `rename/drc-to-rea`, which is 2 commits ahead of `origin/main` with unrelated client-rename work. Committing archive changes on top of it would drag those two commits along. `src/lib/archive/` itself is byte-identical to `origin/main` and clean.
- **Never `git add .`.** Explicit pathspec on **both** `add` and `commit`. `-m` **before** `--`. One commit per task. Keep `graphify-out/*`, `.claude/*`, `.superpowers/*`, `redshift-client-exports/*`, and every `scripts/_tmp-*` out of every commit.
- **Commit trailer, every commit:** `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Dates are `YYYY-MM-DD` strings across module boundaries, never `Date` objects.** `Date` is used only *inside* `work-units.ts` for the run date it was handed, and `formatUtcDate` is the only thing that converts.
- **Never record a skipped unit as `status='done', rows_read=0`.** Those synthetic zeros feed straight back into the signal the predicate reads and would also corrupt nightly grading. Skipped units get **no row at all**.
- **`schema.ts` does not describe the live DB.** `redshift_archive_runs.status` is `varchar(20)` with only a TypeScript union in Drizzle, but the live DB *also* carries `redshift_archive_runs_status_check CHECK (status IN ('pending','running','done','failed'))`. This plan adds no new status value precisely so that constraint never has to be dropped and re-added. If a future change wants one, query `pg_constraint` — never trust `schema.ts`.
- `MIN_OBSERVED_NIGHTS = 3`. Probe cadence = `max(1, floor(repull_window_days / 2))` — derived per table, never hardcoded to 7.

---

## File Structure

| File | Role after this plan |
|---|---|
| `src/lib/archive/work-units.ts` | **Modify.** Owns the whole decision: `UnitHistory`, `unitHistoryKey`, `hashUnitKey`, `probeCadence`, `utcDayNumber`, `isProbeNight`, `decideUnit`, and a filtering `buildNightlyWorkUnits`. Stays pure — no I/O, no DB, no clock reads. |
| `src/lib/archive/work-units.test.ts` | **Modify.** 14 tests → 25. Pure, no DB. |
| `src/lib/archive/enqueuer.ts` | **Modify.** Adds one grouped `SELECT`, builds the history map, passes it through, reports `unitsSkipped` / `unitsProbed`. Still the only file in the module that talks to the DB for enqueuing. |
| `src/lib/archive/drainer.ts` | **Modify.** Exports a new `DRAIN_BUDGET_MS` constant. No skip logic — by design. |
| `src/lib/archive/drainer.test.ts` | **Modify.** 6 tests → 8. |
| `src/app/api/cron/redshift-archive-drain/route.ts` | **Modify.** Uses `DRAIN_BUDGET_MS` instead of an inline `250_000`. |
| `scripts/archive-drain.ts` | **Modify.** Same, via the existing dynamic import. |
| schema / migrations | **Untouched.** |

The decision logic lives in the pure layer because `work-units.ts` has tests and `enqueuer.ts` has none, and because the module already separates "enqueuer does I/O, work-units decides". Task 3 is independent of Tasks 1–2 and could land in either order; it is sequenced last because the spec justifies its margin *with* the capacity the skip frees.

---

## Deviations from the spec, and why

Read these before Task 1. Each is a place where the spec, taken literally, would send an executor to the wrong file or produce a weaker test than is actually provable.

1. **🔴 `budgetMs` is not a constant in `drainer.ts`.** Spec §5's table says the drainer change is "One constant — `budgetMs` 250_000 → 200_000". It is not: `budgetMs` is a **required option** on `runDrain(opts)`, and the literal `250_000` lives in two files that the spec does not name — `src/app/api/cron/redshift-archive-drain/route.ts:20` and `scripts/archive-drain.ts:18`. Task 3 therefore introduces the constant the spec assumed already existed (`DRAIN_BUDGET_MS`, exported from `drainer.ts`) and points both call sites at it. This is one extra line versus editing two literals, and it removes the two-site drift where the cron and the CLI could silently disagree about the budget.

2. **`shouldEnqueueUnit()` → `decideUnit()`, returning a decision string, not a boolean.** Spec §4 names a boolean predicate, but spec §5 also requires `unitsProbed` in `EnqueueResult` — and a boolean cannot distinguish "enqueued because it is proven" from "enqueued because tonight is its probe night". One function returning a discriminated string satisfies both without a second traversal.

3. **Spec §9 test 6 says "probes at least once" — this plan asserts "exactly once".** `(day + hash) % cadence === 0` hits exactly once across any run of `cadence` consecutive integers. "At least once" understates what the construction guarantees, and the stronger assertion is what actually pins the maximum probe interval to `cadence` days.

4. **No hardcoded hash values in tests.** Tests 4 and 5 need "a probe night" and "a non-probe night" for a given key. Rather than embedding a hash output this plan cannot verify without running the code, the tests sweep `cadence` consecutive dates and assert the *shape* of the result (exactly one probe, the rest skipped). Non-circular, deterministic, and robust if the hash is ever replaced.

5. **`buildNightlyWorkUnits`'s history parameter is optional, defaulting to an empty map.** Two reasons. (a) It makes Task 1 commit green on its own: the enqueuer keeps working, and prod behaviour after Task 1 is byte-identical to today because an empty map means every unit reads as "no history" and is enqueued. (b) It *is* the mechanism for spec §8's two fail-open rows — the degraded path after a failed history read, and any future non-nightly (`backfill`, `verify`) caller. Note there is no backfill or verify enqueue path in the codebase today; `run_kind` values other than `'nightly'` exist only in the type union at `schema.ts:1836`.

6. **`unitsComputed` changes meaning, and that is how a degraded night is detected.** It currently equals the full Cartesian product (384). After Task 2 it equals the number of units actually enqueued (~164), and `unitsComputed + unitsSkipped` recovers the Cartesian size. This is deliberate: if the history read ever fails, the cron's JSON shows `unitsComputed: 384, unitsSkipped: 0`, which is distinguishable from a healthy night without adding a new field. No `historyDegraded` flag is added — the existing numbers already carry the signal, plus a `console.error`.

7. **A scoped manual enqueue of a skipped unit enqueues nothing. ✅ RULED 2026-08-17: keep the skip — do not add a bypass.** `npm run archive-enqueue -- --only-table=x --only-account=y` applies the skip like any other run, so smoke-testing a specific always-empty unit on a non-probe night returns `unitsComputed: 0, unitsSkipped: 1`. The `unitsSkipped: 1` is the explanation, so this is self-diagnosing rather than silent. The spec did not address it; Manu ruled at plan review that a scoped run must behave exactly like the nightly one, so no bypass is added. **Do not implement `opts.onlyTable || opts.onlyAccount ? new Map() : history` — it was considered and rejected.** A scoped run of an always-empty unit on a non-probe night is *expected* to return `unitsComputed: 0, unitsSkipped: 1`; that is not a bug to be fixed during execution.

---

### Task 1: The pure skip predicate in `work-units.ts`

**Files:**
- Modify: `src/lib/archive/work-units.ts` (append after `buildNightlyWorkUnits`, currently ending at line 125; and modify `buildNightlyWorkUnits` itself at lines 105–125)
- Modify: `src/lib/archive/work-units.test.ts` (14 tests today; the two `buildNightlyWorkUnits` tests at lines 111–135 must be updated for the new return shape)
- Modify: `src/lib/archive/enqueuer.ts:57` — one line, to destructure the new return shape and keep the tree compiling

**Interfaces:**
- Consumes: nothing from earlier tasks. Uses the existing `AccountLifecycleInput`, `CatalogRowForUnits`, `WorkUnit`, `computeWindow` in the same file.
- Produces, all exported from `@/lib/archive/work-units`, for Task 2 to import:
  - `interface UnitHistory { nightlyObservations: number; peakRows: number }`
  - `const MIN_OBSERVED_NIGHTS: number` (= 3)
  - `function unitHistoryKey(schemaName: string, tableName: string, accountId: string): string`
  - `function hashUnitKey(key: string): number`
  - `function probeCadence(repullWindowDays: number): number`
  - `function utcDayNumber(d: Date): number`
  - `function isProbeNight(runDate: Date, unitKey: string, cadence: number): boolean`
  - `type UnitDecision = "enqueue-no-history" | "enqueue-proven" | "enqueue-insufficient-evidence" | "enqueue-probe" | "skip"`
  - `function decideUnit(history: UnitHistory | undefined, runDate: Date, unitKey: string, repullWindowDays: number): UnitDecision`
  - `interface NightlyWorkUnitPlan { units: WorkUnit[]; unitsSkipped: number; unitsProbed: number }`
  - `function buildNightlyWorkUnits(catalogRows: CatalogRowForUnits[], eligibleAccounts: AccountLifecycleInput[], runDate: Date, history?: Map<string, UnitHistory>): NightlyWorkUnitPlan`

**Predicted test count after this task:** `work-units.test.ts` **25** (14 existing, 2 of them modified, + 11 new). Whole `src/lib/archive/` suite: **131** (120 today + 11).

---

- [ ] **Step 1: Write the failing tests**

Add these imports to the existing import block at the top of `src/lib/archive/work-units.test.ts` (keep the existing named imports; add to them):

```typescript
import {
  selectEligibleAccounts,
  computeWindow,
  buildNightlyWorkUnits,
  formatUtcDate,
  hashUnitKey,
  probeCadence,
  utcDayNumber,
  isProbeNight,
  decideUnit,
  unitHistoryKey,
  MIN_OBSERVED_NIGHTS,
  type AccountLifecycleInput,
  type ClientLifecycleInput,
  type CatalogRowForUnits,
  type UnitHistory,
} from "@/lib/archive/work-units";
```

Append these four new `describe` blocks to the end of the file:

```typescript
// ─── empty-unit skip (design 2026-08-17) ─────────────────────────────

/** N consecutive UTC dates starting at `start`, as Date objects. */
function utcDates(start: string, n: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(`${start}T20:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d);
  }
  return out;
}

describe("probeCadence", () => {
  it("halves the repull window: all eight enabled tables use 14 days, giving a 7-day cadence", () => {
    expect(probeCadence(14)).toBe(7);
    expect(probeCadence(30)).toBe(15);
    expect(probeCadence(7)).toBe(3);
  });

  it("clamps to 1 for repull windows of 2 or less, which makes such a table un-skippable rather than skipped every night", () => {
    expect(probeCadence(2)).toBe(1);
    expect(probeCadence(1)).toBe(1);
    expect(probeCadence(0)).toBe(1);
  });
});

describe("isProbeNight", () => {
  it("fires exactly once for a given unit across any run of `cadence` consecutive UTC dates — this is what pins the maximum probe interval to `cadence` days", () => {
    const cadence = 7;
    const keys = [
      unitHistoryKey("amazon_source_data", "share_of_voice", "154290"),
      unitHistoryKey("amazon_source_data", "refdata_label", "4470600"),
      unitHistoryKey("intentwise_ecommerce_graph", "account_summary", "3775570"),
    ];
    // Three different 7-day runs, so the invariant is not an artefact of one
    // alignment of the UTC day number.
    for (const start of ["2026-08-18", "2026-09-01", "2027-02-25"]) {
      for (const key of keys) {
        const hits = utcDates(start, cadence).filter((d) => isProbeNight(d, key, cadence)).length;
        expect(hits).toBe(1);
      }
    }
  });

  it("is a phase, not a gap: 257 keys spread across the 7 nights of a cadence, with no night carrying more than twice the mean", () => {
    // The only assertion in this file whose outcome depends on FNV-1a's actual
    // spread rather than on arithmetic. It is deterministic, so it either
    // always passes or always fails. If it fails, the hash is broken — replace
    // the hash, do NOT widen the 2x bound.
    const cadence = 7;
    const keys: string[] = [];
    for (let i = 0; i < 257; i++) {
      keys.push(unitHistoryKey("amazon_source_data", "share_of_voice", String(100000 + i * 37)));
    }
    const perNight = utcDates("2026-08-18", cadence).map(
      (d) => keys.filter((k) => isProbeNight(d, k, cadence)).length
    );
    expect(perNight.reduce((a, b) => a + b, 0)).toBe(keys.length); // every key probes exactly once
    const mean = keys.length / cadence;
    for (const n of perNight) {
      expect(n).toBeLessThanOrEqual(2 * mean);
      expect(n).toBeGreaterThan(0);
    }
  });

  it("hashUnitKey and utcDayNumber are deterministic and non-negative, so the modulo can never go negative", () => {
    expect(hashUnitKey("a.b:1")).toBe(hashUnitKey("a.b:1"));
    expect(hashUnitKey("a.b:1")).not.toBe(hashUnitKey("a.b:2"));
    expect(hashUnitKey("a.b:1")).toBeGreaterThanOrEqual(0);
    expect(utcDayNumber(new Date("2026-08-17T23:59:59Z"))).toBe(utcDayNumber(new Date("2026-08-17T00:00:00Z")));
    expect(utcDayNumber(new Date("2026-08-18T00:00:00Z")) - utcDayNumber(new Date("2026-08-17T00:00:00Z"))).toBe(1);
  });
});

describe("decideUnit", () => {
  const KEY = unitHistoryKey("amazon_source_data", "share_of_voice", "154290");
  const RUN_DATE = new Date("2026-08-18T20:00:00Z");

  it("fails OPEN for a unit with no history at all — a never-observed unit is always enqueued", () => {
    expect(decideUnit(undefined, RUN_DATE, KEY, 14)).toBe("enqueue-no-history");
  });

  it("never demotes a unit that has EVER produced rows, even after 100 consecutive zero nights — this is what makes the dead share_of_voice feed safe", () => {
    const proven: UnitHistory = { nightlyObservations: 100, peakRows: 3_574_335 };
    expect(decideUnit(proven, RUN_DATE, KEY, 14)).toBe("enqueue-proven");
  });

  it("fails OPEN while the evidence is thin: fewer than MIN_OBSERVED_NIGHTS nightly observations is always enqueued", () => {
    const thin: UnitHistory = { nightlyObservations: MIN_OBSERVED_NIGHTS - 1, peakRows: 0 };
    expect(decideUnit(thin, RUN_DATE, KEY, 14)).toBe("enqueue-insufficient-evidence");
    // The boundary itself is skippable, not thin.
    const atFloor: UnitHistory = { nightlyObservations: MIN_OBSERVED_NIGHTS, peakRows: 0 };
    expect(["enqueue-probe", "skip"]).toContain(decideUnit(atFloor, RUN_DATE, KEY, 14));
  });

  it("an always-zero unit with enough observations is enqueued as a probe on exactly one night per cadence", () => {
    const empty: UnitHistory = { nightlyObservations: 3, peakRows: 0 };
    const decisions = utcDates("2026-08-18", 7).map((d) => decideUnit(empty, d, KEY, 14));
    expect(decisions.filter((x) => x === "enqueue-probe")).toHaveLength(1);
  });

  it("...and is skipped on the other six nights of that cadence", () => {
    const empty: UnitHistory = { nightlyObservations: 3, peakRows: 0 };
    const decisions = utcDates("2026-08-18", 7).map((d) => decideUnit(empty, d, KEY, 14));
    expect(decisions.filter((x) => x === "skip")).toHaveLength(6);
  });

  it("takes its cadence from the table's own repull_window_days, so a 2-day window is never skipped no matter how empty", () => {
    const empty: UnitHistory = { nightlyObservations: 500, peakRows: 0 };
    for (const d of utcDates("2026-08-18", 14)) {
      expect(decideUnit(empty, d, KEY, 2)).toBe("enqueue-probe");
      expect(decideUnit(empty, d, KEY, 1)).toBe("enqueue-probe");
    }
  });

  it("a snapshot table's cadence comes from its own repull_window_days too — the predicate never inspects table kind", () => {
    const empty: UnitHistory = { nightlyObservations: 10, peakRows: 0 };
    const snapshotKey = unitHistoryKey("amazon_source_data", "refdata_label", "4470600");
    const over30 = utcDates("2026-08-18", 30).map((d) => decideUnit(empty, d, snapshotKey, 30));
    expect(over30.filter((x) => x === "enqueue-probe")).toHaveLength(2); // cadence 15, 30 days
  });
});

describe("buildNightlyWorkUnits — skip filtering", () => {
  const catalogRows: CatalogRowForUnits[] = [
    { schemaName: "intentwise_ecommerce_graph", tableName: "account_summary", tableKind: "timeseries", repullWindowDays: 14 },
  ];
  const accounts: AccountLifecycleInput[] = [
    { accountId: "PROVEN", clientIdCode: "A", isActive: true },
    { accountId: "EMPTY", clientIdCode: "B", isActive: true },
    { accountId: "UNSEEN", clientIdCode: "C", isActive: true },
  ];

  /** History is date-independent — the phase comes from the key, not the map. */
  function history() {
    const key = (acct: string) => unitHistoryKey("intentwise_ecommerce_graph", "account_summary", acct);
    return new Map<string, UnitHistory>([
      [key("PROVEN"), { nightlyObservations: 5, peakRows: 12_345 }],
      [key("EMPTY"), { nightlyObservations: 5, peakRows: 0 }],
      // UNSEEN deliberately absent
    ]);
  }

  it("drops skipped units from the returned list and counts them, keeping proven and unseen units", () => {
    // Sweep the cadence so we land on a night where EMPTY is skipped, without
    // hardcoding a hash value.
    const dates = utcDates("2026-08-18", 7);
    const plans = dates.map((d) => buildNightlyWorkUnits(catalogRows, accounts, d, history()));

    const skipNights = plans.filter((p) => p.unitsSkipped === 1);
    const probeNights = plans.filter((p) => p.unitsProbed === 1);
    expect(skipNights).toHaveLength(6);
    expect(probeNights).toHaveLength(1);

    // On a skip night: PROVEN and UNSEEN survive, EMPTY does not.
    const skipped = skipNights[0];
    expect(skipped.units.map((u) => u.accountId).sort()).toEqual(["PROVEN", "UNSEEN"]);
    expect(skipped.unitsProbed).toBe(0);

    // On the probe night: all three are enqueued.
    const probed = probeNights[0];
    expect(probed.units).toHaveLength(3);
    expect(probed.unitsSkipped).toBe(0);
  });

  it("omitting the history map yields the full Cartesian fanout — this is the fail-open path for a failed history read and for any future non-nightly caller", () => {
    for (const d of utcDates("2026-08-18", 7)) {
      const plan = buildNightlyWorkUnits(catalogRows, accounts, d);
      expect(plan.units).toHaveLength(3);
      expect(plan.unitsSkipped).toBe(0);
      expect(plan.unitsProbed).toBe(0);
    }
  });
});
```

Now update the two **existing** `buildNightlyWorkUnits` tests for the new return shape. In the existing `describe("buildNightlyWorkUnits", ...)` block, replace the body of the first test (currently lines 111–130) with:

```typescript
  it("produces one work unit per (table x account), windowed by table kind", () => {
    const { units, unitsSkipped, unitsProbed } = buildNightlyWorkUnits(catalogRows, accounts, runDate);
    expect(units).toHaveLength(4);
    expect(unitsSkipped).toBe(0);
    expect(unitsProbed).toBe(0);
    const ts = units.find((u) => u.tableName === "account_summary" && u.accountId === "154290");
    expect(ts).toEqual({
      schemaName: "intentwise_ecommerce_graph",
      tableName: "account_summary",
      accountId: "154290",
      windowFrom: "2026-07-27",
      windowTo: "2026-08-10",
    });
    const snap = units.find((u) => u.tableName === "sellercentral_alllistings_report" && u.accountId === "4470600");
    expect(snap).toEqual({
      schemaName: "amazon_source_data",
      tableName: "sellercentral_alllistings_report",
      accountId: "4470600",
      windowFrom: null,
      windowTo: null,
    });
  });
```

and replace the second test (currently lines 132–135) with:

```typescript
  it("produces zero work units when there are no enabled catalog rows or no eligible accounts", () => {
    expect(buildNightlyWorkUnits([], accounts, runDate).units).toEqual([]);
    expect(buildNightlyWorkUnits(catalogRows, [], runDate).units).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/archive/work-units.test.ts`

Expected: FAIL. The new imports (`hashUnitKey`, `probeCadence`, `utcDayNumber`, `isProbeNight`, `decideUnit`, `unitHistoryKey`, `MIN_OBSERVED_NIGHTS`, `UnitHistory`) do not exist yet, so the whole file fails to load with something like `SyntaxError: The requested module ... does not provide an export named 'decideUnit'`. That is the expected failure — a load-time error, not 11 individual assertion failures.

- [ ] **Step 3: Write the implementation**

In `src/lib/archive/work-units.ts`, append after the closing brace of `buildNightlyWorkUnits` (currently line 125):

```typescript
// ─── Empty-unit skip (design docs/superpowers/specs/2026-08-17-archive-empty-unit-skip-design.md) ───
//
// 257 of the 384 nightly units read zero rows and have done so on every night
// observed, costing 1,411s/night (47.5% of total drain time) to produce
// nothing. They are the binding constraint on enabling more tables.
//
// The naive rule — "demote after N consecutive zero nights" — is unsafe and
// would fire right now: share_of_voice's SOURCE has stalled (MAX(time_stamp)
// identical on all ten data-bearing accounts), so its ten proven accounts
// start reading zero from 2026-08-24. A zero-row rule cannot tell "no data by
// design" from "the pipeline broke", and would demote the most valuable table
// in the archive. Hence rule 1 below: EVER produced rows => never demoted.
//
// The rows_read history IS the state. No new table, no new column, no counter.

/** One (schema, table, account) unit's archival history, as read by the enqueuer. */
export interface UnitHistory {
  /** Rows with status='done' AND run_kind='nightly' for this unit. */
  nightlyObservations: number;
  /** max(coalesce(rows_read, 0)) across ALL run kinds with status='done'. */
  peakRows: number;
}

/**
 * Nightly observations required before a unit may be skipped at all.
 *
 * Deliberately aggressive, and safe to be: three consecutive zero nights are
 * NOT three independent observations — consecutive 14-day repull windows
 * overlap by 13/14, so three nights is roughly one look at a 16-day span, and
 * waiting ten nights would buy only a 24-day span. The evidence barely
 * improves with patience. It is the PROBE, not the waiting, that makes the
 * skip safe (see isProbeNight).
 */
export const MIN_OBSERVED_NIGHTS = 3;

/**
 * Canonical map key for a work unit. The enqueuer builds the history map with
 * this same function, so the two sides can never drift.
 */
export function unitHistoryKey(schemaName: string, tableName: string, accountId: string): string {
  return `${schemaName}.${tableName}:${accountId}`;
}

/**
 * FNV-1a, 32-bit. Non-cryptographic on purpose; all that is required is that
 * it be deterministic across processes and deploys (so a unit keeps its probe
 * phase forever) and well spread (so probes do not clump). Math.imul keeps the
 * multiply in 32-bit space, and the >>> 0 keeps the result unsigned so the
 * modulo in isProbeNight can never go negative.
 */
export function hashUnitKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * How often an always-empty unit is probed, in days: half the table's own
 * repull window, floored, minimum 1.
 *
 * Derived per table rather than hardcoded to 7 (which is what all eight
 * enabled tables resolve to today, since they all use 14) so that shortening
 * a table's repull window cannot silently erase the safety margin the
 * correctness invariant depends on. A cadence of 1 means "probe every night",
 * i.e. that table is effectively never skipped.
 */
export function probeCadence(repullWindowDays: number): number {
  return Math.max(1, Math.floor(repullWindowDays / 2));
}

/** Whole days since the Unix epoch, by UTC calendar date. */
export function utcDayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

/**
 * Is tonight this unit's probe night?
 *
 * A PHASE rule, not a gap rule. "Days since last run >= cadence" would sync
 * all 257 always-empty units — they were all last run on the same night —
 * into a single 257-unit herd every seventh night. Offsetting the UTC day
 * number by a hash of the unit key spreads them to ~37 per night, and makes
 * "every unit probes exactly once per `cadence` consecutive days" a provable
 * invariant rather than an estimate.
 */
export function isProbeNight(runDate: Date, unitKey: string, cadence: number): boolean {
  return (utcDayNumber(runDate) + hashUnitKey(unitKey)) % cadence === 0;
}

/**
 * Why a unit is being enqueued, or that it is being skipped. A plain boolean
 * would do for the filter, but the enqueuer also reports how many units were
 * probed tonight, which needs the reason.
 */
export type UnitDecision =
  | "enqueue-no-history"
  | "enqueue-proven"
  | "enqueue-insufficient-evidence"
  | "enqueue-probe"
  | "skip";

/**
 * The skip predicate. Every branch except the last two fails OPEN.
 *
 *   no history            -> enqueue (never observed)
 *   peakRows > 0          -> enqueue (proven; NEVER demoted, at any age)
 *   observations < floor  -> enqueue (too little evidence)
 *   probe night           -> enqueue (the periodic look)
 *   otherwise             -> skip
 */
export function decideUnit(
  history: UnitHistory | undefined,
  runDate: Date,
  unitKey: string,
  repullWindowDays: number
): UnitDecision {
  if (!history) return "enqueue-no-history";
  if (history.peakRows > 0) return "enqueue-proven";
  if (history.nightlyObservations < MIN_OBSERVED_NIGHTS) return "enqueue-insufficient-evidence";
  return isProbeNight(runDate, unitKey, probeCadence(repullWindowDays)) ? "enqueue-probe" : "skip";
}

/** What tonight's enqueue should insert, plus what it chose not to. */
export interface NightlyWorkUnitPlan {
  units: WorkUnit[];
  unitsSkipped: number;
  unitsProbed: number;
}
```

Then replace `buildNightlyWorkUnits` (currently lines 105–125) with:

```typescript
/**
 * Cartesian product of enabled catalog rows x eligible accounts, windowed,
 * minus the units the skip predicate declines tonight.
 *
 * `history` is optional and defaults to empty, which means "enqueue
 * everything" — the pre-skip behaviour. That default is load-bearing in two
 * places: the enqueuer passes an empty map when its history read fails (the
 * skip is an optimisation, never a correctness dependency), and any future
 * non-nightly caller (backfill, verify) gets full fanout by simply not
 * passing history.
 *
 * CORRECTNESS INVARIANT (timeseries and period tables): every run re-reads
 * [run_date - repull_window_days, run_date], and a probe fires at most
 * floor(repull_window_days / 2) days apart. Since cadence < repull window, a
 * probe's own window covers the entire skipped gap, so an account that starts
 * producing data is archived LATE, never LOST — a wrong skip costs <= cadence
 * days of latency and zero rows.
 *
 * The invariant is WEAKER for snapshot tables (refdata_label): a snapshot has
 * no window to re-read, so a probe yields the source's current state but the
 * per-day snapshots in between are gone. For the accounts that have never had
 * a single label row this costs nothing real. Accepted deliberately, not by
 * oversight.
 */
export function buildNightlyWorkUnits(
  catalogRows: CatalogRowForUnits[],
  eligibleAccounts: AccountLifecycleInput[],
  runDate: Date,
  history: Map<string, UnitHistory> = new Map()
): NightlyWorkUnitPlan {
  const units: WorkUnit[] = [];
  let unitsSkipped = 0;
  let unitsProbed = 0;

  for (const row of catalogRows) {
    const { windowFrom, windowTo } = computeWindow(row.tableKind, row.repullWindowDays, runDate);
    for (const account of eligibleAccounts) {
      const key = unitHistoryKey(row.schemaName, row.tableName, account.accountId);
      const decision = decideUnit(history.get(key), runDate, key, row.repullWindowDays);
      if (decision === "skip") {
        unitsSkipped++;
        continue;
      }
      if (decision === "enqueue-probe") unitsProbed++;
      units.push({
        schemaName: row.schemaName,
        tableName: row.tableName,
        accountId: account.accountId,
        windowFrom,
        windowTo,
      });
    }
  }
  return { units, unitsSkipped, unitsProbed };
}
```

- [ ] **Step 4: Keep the tree compiling — one line in `enqueuer.ts`**

`enqueuer.ts:57` currently does `const units = buildNightlyWorkUnits(...)` and then reads `units.length` and `units.map(...)`. Change only the assignment on line 57 from:

```typescript
  const units = buildNightlyWorkUnits(
```

to:

```typescript
  const { units } = buildNightlyWorkUnits(
```

Nothing else in `enqueuer.ts` changes in this task. Prod behaviour is now byte-identical to before: no history is passed, so every unit reads as `enqueue-no-history` and all 384 are enqueued. Task 2 wires the actual history.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/archive/work-units.test.ts`
Expected: PASS, **25 tests**.

Then the whole module: `npx vitest run src/lib/archive/`
Expected: PASS, **131 tests**.

If `decideUnit`'s "boundary is skippable" assertion or the snapshot `toHaveLength(2)` assertion fails, do **not** loosen the test — the phase arithmetic is deterministic, so a failure there means `utcDayNumber`, `probeCadence`, or the modulo is wrong.

- [ ] **Step 6: Typecheck**

Run in the background (~2 min): `node_modules/.bin/tsc --noEmit`

Read the output **unfiltered** and judge **by filename**. Required: **zero errors in `src/lib/archive/`**. Pre-existing errors in other files are foreign — do not touch them, and do not record a count for comparison with a later session.

- [ ] **Step 7: Commit** (needs Manu's explicit OK first)

```bash
git add src/lib/archive/work-units.ts src/lib/archive/work-units.test.ts src/lib/archive/enqueuer.ts
git commit -m "feat(archive): pure empty-unit skip predicate for the nightly enqueuer

257 of 384 nightly units read zero rows every night, costing 47.5% of drain
time to produce nothing. Adds the pure decision — history-backed, phase-
staggered probe — in work-units.ts, where the tests live.

A unit that has EVER produced rows is never demoted, which is what keeps the
stalled share_of_voice feed from being skipped when its ten proven accounts
start reading zero on 2026-08-24. Everything else fails open: no history,
thin evidence, or a probe night all enqueue.

Inert until the enqueuer passes a history map (next commit): the parameter
defaults to empty, so all 384 units are still enqueued tonight.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" --
```

---

### Task 2: Wire the history query into `enqueuer.ts`

**Files:**
- Modify: `src/lib/archive/enqueuer.ts` — imports (lines 7, 10), `EnqueueResult` (lines 12–18), a new `loadUnitHistory()` helper, the call in `runNightlyEnqueue` (line 57), and the return (lines 98–104)
- Test: none. `enqueuer.ts` does I/O and has no test harness in this module; that is exactly why all the decision logic lives in Task 1. Verification is by scoped manual run (Step 5).

**Interfaces:**
- Consumes, from Task 1: `unitHistoryKey`, `type UnitHistory`, and `buildNightlyWorkUnits`'s 4th parameter + `NightlyWorkUnitPlan` return shape.
- Produces: `EnqueueResult` gains `unitsSkipped: number` and `unitsProbed: number`. Consumed by `src/app/api/cron/redshift-archive-enqueue/route.ts:19` (which JSON-serialises the whole object — no change needed there) and `scripts/archive-enqueue.ts:19` (same).

**Predicted test count after this task:** unchanged — `src/lib/archive/` stays at **131**. This task adds no tests; it is verified by a scoped run against the real DB.

---

- [ ] **Step 1: Add the imports**

In `src/lib/archive/enqueuer.ts`, change line 7 from:

```typescript
import { eq } from "drizzle-orm";
```

to:

```typescript
import { eq, sql } from "drizzle-orm";
```

and change line 10 from:

```typescript
import { selectEligibleAccounts, buildNightlyWorkUnits, formatUtcDate } from "@/lib/archive/work-units";
```

to:

```typescript
import {
  selectEligibleAccounts,
  buildNightlyWorkUnits,
  formatUtcDate,
  unitHistoryKey,
  type UnitHistory,
} from "@/lib/archive/work-units";
```

- [ ] **Step 2: Extend `EnqueueResult` and add the history reader**

Replace `EnqueueResult` (lines 12–18) with:

```typescript
export interface EnqueueResult {
  runDate: string;
  enabledTables: number;
  eligibleAccounts: number;
  /**
   * Units actually enqueued. Before the empty-unit skip this was always the
   * full (tables x accounts) product; it is now that product MINUS
   * unitsSkipped. unitsComputed + unitsSkipped recovers the Cartesian size,
   * which is also how a degraded night is spotted: if the history read fails,
   * this reads 384 with unitsSkipped 0.
   */
  unitsComputed: number;
  unitsInserted: number;
  /** Always-empty units the skip predicate declined tonight. */
  unitsSkipped: number;
  /** Always-empty units enqueued anyway because tonight is their probe night. */
  unitsProbed: number;
}

/**
 * Per-unit archival history for the skip predicate. One grouped read.
 *
 * peakRows spans ALL run kinds deliberately: if a backfill ever proved this
 * unit has data, the unit is proven forever. nightlyObservations counts
 * nightly rows only, because MIN_OBSERVED_NIGHTS is a statement about nightly
 * evidence — a unit whose only 'done' rows came from a backfill has zero
 * nightly observations and therefore fails open.
 *
 * status='done' is the filter, so a unit that has only ever FAILED has no
 * history row at all and fails open too.
 *
 * count() and max() over a bigint column come back from the postgres driver
 * as strings, so both are coerced explicitly — the sql<string> + Number()
 * convention used in src/lib/hours/queries.ts. Drizzle's count() helper does
 * its own .mapWith(Number), but a raw sql`` template does not.
 *
 * The table holds ~1,444 rows today and grows ~60k/year after this change. No
 * index is needed and none is added.
 */
async function loadUnitHistory(): Promise<Map<string, UnitHistory>> {
  const rows = await db
    .select({
      schemaName: redshiftArchiveRuns.schemaName,
      tableName: redshiftArchiveRuns.tableName,
      accountId: redshiftArchiveRuns.accountId,
      nightlyObservations: sql<string>`count(*) filter (where ${redshiftArchiveRuns.runKind} = 'nightly')`,
      peakRows: sql<string>`max(coalesce(${redshiftArchiveRuns.rowsRead}, 0))`,
    })
    .from(redshiftArchiveRuns)
    .where(eq(redshiftArchiveRuns.status, "done"))
    .groupBy(
      redshiftArchiveRuns.schemaName,
      redshiftArchiveRuns.tableName,
      redshiftArchiveRuns.accountId
    );

  const history = new Map<string, UnitHistory>();
  for (const r of rows) {
    history.set(unitHistoryKey(r.schemaName, r.tableName, r.accountId), {
      nightlyObservations: Number(r.nightlyObservations),
      peakRows: Number(r.peakRows),
    });
  }
  return history;
}
```

- [ ] **Step 3: Read the history and pass it through**

In `runNightlyEnqueue`, insert this immediately before the `buildNightlyWorkUnits` call (after the `scopedAccounts` line, currently line 55):

```typescript
  // The skip is an optimisation, never a correctness dependency. If the
  // history read fails we log loudly and fall back to the full Cartesian
  // fanout — today's behaviour — never to silence. An empty map means every
  // unit reads as "no history", which fails open by construction.
  let history = new Map<string, UnitHistory>();
  try {
    history = await loadUnitHistory();
  } catch (e) {
    console.error(
      "[archive-enqueue] unit-history read failed; falling back to full fanout with no skip:",
      e
    );
  }
```

Then change the `buildNightlyWorkUnits` call. Line 57 currently reads `const { units } = buildNightlyWorkUnits(` after Task 1; change it to destructure all three, and add `history` as the 4th argument:

```typescript
  const { units, unitsSkipped, unitsProbed } = buildNightlyWorkUnits(
    scopedCatalogRows.map((r) => ({
      schemaName: r.schemaName,
      tableName: r.tableName,
      tableKind: r.tableKind as "timeseries" | "snapshot" | "period",
      repullWindowDays: r.repullWindowDays,
    })),
    scopedAccounts,
    runDate,
    history
  );
```

- [ ] **Step 4: Report the two new counts**

Replace the `return` block (currently lines 98–104) with:

```typescript
  return {
    runDate: runDateStr,
    enabledTables: scopedCatalogRows.length,
    eligibleAccounts: scopedAccounts.length,
    unitsComputed: units.length,
    unitsInserted: inserted,
    unitsSkipped,
    unitsProbed,
  };
```

- [ ] **Step 5: Verify — tests, typecheck, then a read-only probe**

Run: `npx vitest run src/lib/archive/`
Expected: PASS, **131 tests** (unchanged — no tests were added or removed).

Run in the background (~2 min): `node_modules/.bin/tsc --noEmit`, unfiltered, judged by filename. Required: **zero errors in `src/lib/archive/`**.

Then verify the query itself without writing anything. Write a throwaway probe at `scripts/_tmp-probe-unit-history.ts` (it is `_tmp-*`, so it must stay out of every commit):

```typescript
/**
 * Read-only probe for the empty-unit skip's history query. Writes nothing.
 * Run: npx tsx scripts/_tmp-probe-unit-history.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

async function main() {
  // Dynamic import AFTER config(): a static import would be hoisted above it
  // by ESM, so db/index.ts would read an unset DATABASE_URL, and postgres.js
  // connects lazily so nothing would throw until the first query.
  const { db } = await import("../src/lib/db");
  const { redshiftArchiveRuns } = await import("../src/lib/db/schema");
  const { sql, eq } = await import("drizzle-orm");
  const { decideUnit, unitHistoryKey } = await import("../src/lib/archive/work-units");

  const rows = await db
    .select({
      schemaName: redshiftArchiveRuns.schemaName,
      tableName: redshiftArchiveRuns.tableName,
      accountId: redshiftArchiveRuns.accountId,
      nightlyObservations: sql<string>`count(*) filter (where ${redshiftArchiveRuns.runKind} = 'nightly')`,
      peakRows: sql<string>`max(coalesce(${redshiftArchiveRuns.rowsRead}, 0))`,
    })
    .from(redshiftArchiveRuns)
    .where(eq(redshiftArchiveRuns.status, "done"))
    .groupBy(redshiftArchiveRuns.schemaName, redshiftArchiveRuns.tableName, redshiftArchiveRuns.accountId);

  const tally: Record<string, number> = {};
  const runDate = new Date();
  for (const r of rows) {
    const key = unitHistoryKey(r.schemaName, r.tableName, r.accountId);
    const d = decideUnit(
      { nightlyObservations: Number(r.nightlyObservations), peakRows: Number(r.peakRows) },
      runDate,
      key,
      14
    );
    tally[d] = (tally[d] ?? 0) + 1;
  }
  console.log("history rows:", rows.length);
  console.log("decisions tonight:", tally);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `npx tsx scripts/_tmp-probe-unit-history.ts`

**Expected, from the measurements the design rests on:** `history rows` ≈ 384 (one per unit that has ever completed). `enqueue-proven` ≈ 127. `skip` + `enqueue-probe` ≈ 257, with `enqueue-probe` ≈ 37 (257 / 7) and `skip` ≈ 220. Total enqueued ≈ 164.

🔴 **If `skip` is 0, stop.** A zero-match predicate fails silently and looks exactly like success. The likely causes, in order: `peakRows` coerced from a string that is `"0"` but compared as truthy somewhere; `nightlyObservations` reading 0 for every unit because the `filter (where ...)` clause did not interpolate the column correctly; or the group-by key not matching `unitHistoryKey`'s format. Diagnose before proceeding — do not "fix" it by loosening the predicate.

🔴 **If `enqueue-proven` is materially below 127, stop.** Under-counting proven units is the one failure mode that loses data.

Delete the probe file after reading it (via the harness, not `rm -f`, which is blocked).

- [ ] **Step 6: Commit** (needs Manu's explicit OK first — and note the probe file must NOT be added)

```bash
git add src/lib/archive/enqueuer.ts
git commit -m "feat(archive): skip always-empty work units in the nightly enqueuer

Reads each unit's rows_read history in one grouped SELECT and passes it to
the predicate added in the previous commit. Always-empty units are no longer
enqueued nightly; each is probed once per floor(repull_window_days / 2) days,
phase-staggered by a hash of its unit key so the 257 do not arrive as a herd.

Expected effect: ~384 units/night -> ~164, drain ~2,969s -> ~1,759s (-41%),
table ceiling 64 -> ~109. Skipped units get NO row and NO new status, so
there is no migration and the drainer needs no skip logic.

If the history read throws, it logs and falls back to the full 384-unit
fanout. unitsComputed + unitsSkipped always recovers the Cartesian size, so a
degraded night is visible in the cron's JSON.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" --
```

---

### Task 3: Widen the drain's safety tail (`budgetMs` 250_000 → 200_000)

**Files:**
- Modify: `src/lib/archive/drainer.ts` — add an exported `DRAIN_BUDGET_MS` after `MAX_ATTEMPTS` (line 27)
- Modify: `src/lib/archive/drainer.test.ts` — 6 tests → 8
- Modify: `src/app/api/cron/redshift-archive-drain/route.ts:20` (and its docstring at line 9)
- Modify: `scripts/archive-drain.ts:18`

**Interfaces:**
- Consumes: nothing from Tasks 1–2. This task is independent and could land first.
- Produces: `export const DRAIN_BUDGET_MS: number` (= 200_000) from `@/lib/archive/drainer`. `runDrain`'s signature is unchanged — it still takes `budgetMs` as an option, so tests and future callers can pass a small budget.

**⚠️ Read before Step 3:** the spec says this is "one constant in `drainer.ts`". It is not — `budgetMs` is a caller-supplied option and the `250_000` literal lives in the two *caller* files. This task creates the constant the spec assumed existed.

**Predicted test count after this task:** `drainer.test.ts` **8** (6 existing + 2 new). Whole `src/lib/archive/` suite: **133**.

---

- [ ] **Step 1: Write the failing tests**

In `src/lib/archive/drainer.test.ts`, change the import on line 2 from:

```typescript
import { computeFailurePatch } from "@/lib/archive/drainer";
```

to:

```typescript
import { computeFailurePatch, DRAIN_BUDGET_MS } from "@/lib/archive/drainer";
```

and append this `describe` block to the end of the file:

```typescript
describe("DRAIN_BUDGET_MS", () => {
  /**
   * The cron route's Vercel ceiling — src/app/api/cron/redshift-archive-drain/route.ts.
   * A unit claimed just before the budget expires still runs to completion, so
   * the gap between the budget and this ceiling is the real safety tail.
   */
  const ROUTE_MAX_DURATION_MS = 300_000;

  /**
   * Slowest single unit ever observed: 58.6s, 2026-08-14. This is a FLOOR, not
   * a ceiling — it was measured while share_of_voice's window was already two
   * days depleted, so a full 14-day window or a post-repair backfill will be
   * materially larger.
   */
  const WORST_OBSERVED_UNIT_MS = 58_600;

  it("leaves a tail longer than the worst unit ever observed, so a late claim cannot overrun the route's maxDuration", () => {
    expect(ROUTE_MAX_DURATION_MS - DRAIN_BUDGET_MS).toBeGreaterThan(WORST_OBSERVED_UNIT_MS);
  });

  it("keeps at least 1.5x margin over that worst unit — the previous 250_000 left a 50s tail, SMALLER than one unit, which is why it moved", () => {
    expect(ROUTE_MAX_DURATION_MS - DRAIN_BUDGET_MS).toBeGreaterThanOrEqual(1.5 * WORST_OBSERVED_UNIT_MS);
    // The old value, kept as documentation of the defect being fixed: a unit
    // claimed at 249s elapsed was killed mid-flight by the 300s hard stop,
    // leaving a 'running' row that reclaimStaleRuns only swept an hour later.
    expect(ROUTE_MAX_DURATION_MS - 250_000).toBeLessThan(WORST_OBSERVED_UNIT_MS);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/archive/drainer.test.ts`
Expected: FAIL at load with `does not provide an export named 'DRAIN_BUDGET_MS'`.

- [ ] **Step 3: Add the constant**

In `src/lib/archive/drainer.ts`, insert immediately after `const MAX_ATTEMPTS = 3;` (line 27):

```typescript
/**
 * Time budget for one drain, in ms. runDrain still takes budgetMs as an
 * option (tests and scoped runs pass their own); this is the value both real
 * callers use — the cron route and scripts/archive-drain.ts — so the two can
 * never drift.
 *
 * Was 250_000, which left a 50s tail below the cron route's maxDuration=300
 * ceiling — SMALLER than the worst single unit ever observed (58.6s,
 * 2026-08-14). drainLoop's `while (Date.now() < deadline)` admits a unit at
 * 249s elapsed, which then overruns the 300s hard stop and is killed
 * mid-flight, leaving a 'running' row that claimOne() never looks at and
 * reclaimStaleRuns() only sweeps after STALE_RUNNING_MS = 1h. That costs an
 * hour and an attempt; it does not lose data.
 *
 * 200_000 leaves a 100s tail, ~1.7x that worst unit. Affordable because the
 * empty-unit skip removed ~41% of the nightly work, so a shorter window costs
 * nothing. 58.6s is a floor, not a ceiling: it was measured while
 * share_of_voice's window was already two days depleted.
 */
export const DRAIN_BUDGET_MS = 200_000;
```

- [ ] **Step 4: Point both callers at it**

In `src/app/api/cron/redshift-archive-drain/route.ts`, change line 2 from:

```typescript
import { runDrain } from "@/lib/archive/drainer";
```

to:

```typescript
import { runDrain, DRAIN_BUDGET_MS } from "@/lib/archive/drainer";
```

change line 20 from:

```typescript
  const result = await runDrain({ budgetMs: 250_000 });
```

to:

```typescript
  const result = await runDrain({ budgetMs: DRAIN_BUDGET_MS });
```

and fix the now-stale docstring on line 9, changing:

```
 * work units and works them until a ~250s budget expires (Vercel's ceiling
```

to:

```
 * work units and works them until a ~200s budget expires (Vercel's ceiling
```

In `scripts/archive-drain.ts`, change line 12 from:

```typescript
  const { runDrain } = await import("../src/lib/archive/drainer");
```

to:

```typescript
  const { runDrain, DRAIN_BUDGET_MS } = await import("../src/lib/archive/drainer");
```

and line 18 from:

```typescript
  const result = await runDrain({ budgetMs: 250_000, limit });
```

to:

```typescript
  const result = await runDrain({ budgetMs: DRAIN_BUDGET_MS, limit });
```

🔴 **`DRAIN_BUDGET_MS` must come from that existing `await import(...)`, not a static top-of-file import.** ESM hoists static imports above every module-level statement, so a static import of `drainer.ts` would pull in `@/lib/db` *before* `config({ path: ... })` runs. `db/index.ts` would then read an unset `DATABASE_URL`, and because postgres.js connects lazily nothing throws at import time — the script just silently points at `localhost:5432` and dies with `ECONNREFUSED` on its first query. This is the house pattern for every script in `scripts/`; do not "tidy" it into a static import.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/archive/drainer.test.ts`
Expected: PASS, **8 tests**.

Then: `npx vitest run src/lib/archive/`
Expected: PASS, **133 tests**.

- [ ] **Step 6: Typecheck**

Run in the background (~2 min): `node_modules/.bin/tsc --noEmit`, unfiltered, judged by filename. Required: **zero errors in `src/lib/archive/`**, and no new error in `src/app/api/cron/redshift-archive-drain/route.ts` or `scripts/archive-drain.ts`.

- [ ] **Step 7: Commit** (needs Manu's explicit OK first)

```bash
git add src/lib/archive/drainer.ts src/lib/archive/drainer.test.ts src/app/api/cron/redshift-archive-drain/route.ts scripts/archive-drain.ts
git commit -m "fix(archive): widen the drain's safety tail to 100s (budgetMs 250s -> 200s)

The drain budget left a 50s tail below the route's maxDuration=300 ceiling —
smaller than the worst single unit ever observed (58.6s). A unit admitted at
249s elapsed overran the hard stop and was killed mid-flight, stranding a
'running' row that reclaimStaleRuns only swept an hour later. Cost an hour
and an attempt; never lost data.

Also replaces the duplicated 250_000 literal (the cron route and the CLI
runner each had their own) with one exported DRAIN_BUDGET_MS, so they cannot
drift. runDrain's budgetMs option is unchanged.

Affordable because the empty-unit skip removed ~41% of the nightly work.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" --
```

---

## After all three tasks: what has NOT been verified

State this plainly rather than implying the change is proven.

- **Nothing has run against a real nightly cycle.** The first real evidence arrives on the first night after deploy: the enqueue cron's JSON should show `unitsComputed` ≈ 164, `unitsSkipped` ≈ 220, `unitsProbed` ≈ 37, and the night should still finish with `rows_read == rows_written` on every unit and zero failures — the standard this archive has met for four consecutive nights.
- **Deploy is a separate decision needing its own OK.** So is the push, and so is the merge to main.
- **The `share_of_voice` collision is handled by construction, not observed.** Its ten proven accounts start reading zero on 2026-08-24. Rule 1 (ever produced rows ⇒ never demoted) means they keep full nightly fanout, but the first *evidence* of that is the 08-24 night.
- **`refdata_label`'s weaker invariant is accepted, not solved.** A skipped snapshot unit loses the per-day snapshots inside its skipped gap. For accounts that have never had a single label row this costs nothing real; it is a difference in kind, recorded deliberately.
- **Out of scope, unchanged:** refreshing `redshift_archive_account_stats` (`--stats` ≈ 11,400 Redshift queries / ~9.5h); enabling additional tables (this change creates headroom — spending it is a separate decision); anything about the `share_of_voice` source stall beyond not breaking on it.

---

## Self-review against the spec

| Spec section | Covered by |
|---|---|
| §3 decision 1 — ever produced rows ⇒ never demoted | Task 1 `decideUnit` `peakRows > 0` branch; test "never demotes a unit that has EVER produced rows" |
| §3 decision 2 — cadence `max(1, floor(w/2))`, phase-staggered by unit-key hash | Task 1 `probeCadence` + `isProbeNight`; tests "halves the repull window", "clamps to 1", "fires exactly once", "is a phase, not a gap" |
| §3 decision 3 — no row, no new status, no migration | Task 1/2 by construction (skipped units are never pushed into `units`); Global Constraints; no migration file in any task |
| §3 trap — never `status='done', rows_read=0` | Global Constraints; nothing in any task writes a row for a skipped unit |
| §4 predicate, all four fail-open branches | Task 1 `decideUnit`; tests for no-history, proven, thin evidence, probe night |
| §4 `MIN_OBSERVED_NIGHTS = 3` | Task 1 exported constant; test asserts the boundary is skippable and `floor − 1` is not |
| §4 history query, `peakRows` all kinds / `nightlyObservations` nightly only | Task 2 `loadUnitHistory`, with the reasoning in its docstring |
| §5 files touched | Task 1 (`work-units.ts`, `.test.ts`), Task 2 (`enqueuer.ts`), Task 3 (`drainer.ts` + both callers — see Deviation 1) |
| §5 `EnqueueResult` gains `unitsSkipped`, `unitsProbed` | Task 2 Steps 2 and 4 |
| §5a `budgetMs` 250_000 → 200_000 | Task 3, corrected to the two real call sites plus a new shared constant |
| §6 expected effect | Task 2 Step 5's probe expectations (~164 / ~127 / ~37 / ~220) and the post-deploy checks above |
| §7 correctness invariant, and its weaker snapshot form | `buildNightlyWorkUnits` docstring in Task 1 Step 3; restated in "what has NOT been verified" |
| §8 history query throws ⇒ full fanout | Task 2 Step 3 try/catch; Task 1's optional-history default is the mechanism; test "omitting the history map yields the full Cartesian fanout" |
| §8 unit absent from map ⇒ enqueued | Task 1 `decideUnit(undefined, ...)`; the `UNSEEN` account in the filtering test |
| §8 `repull_window_days ≤ 2` ⇒ cadence 1 ⇒ never skipped | Task 1 `probeCadence` clamp; tests "clamps to 1" and "a 2-day window is never skipped" |
| §8 `run_kind ≠ nightly` ⇒ skip does not apply | Task 1's optional history parameter; test "omitting the history map...". No backfill/verify enqueue path exists today — `run_kind` values other than `'nightly'` appear only in the type union at `schema.ts:1836` |
| §9 all 11 tests | 11 new tests in Task 1, mapped one-to-one (§9.6 strengthened to "exactly once", §9.4/5 rewritten as a cadence sweep — Deviations 3 and 4) |
| §9 follow vitest with unfiltered `tsc`, zero errors in `src/lib/archive/` | Global Constraints; Task 1 Step 6, Task 2 Step 5, Task 3 Step 6 |
| §10 out of scope | "What has NOT been verified", final bullet |

**Gaps found and closed during review:** §5's drainer claim was wrong about where `budgetMs` lives (Deviation 1). §4's `shouldEnqueueUnit` boolean cannot produce §5's `unitsProbed` (Deviation 2). Neither the spec nor the old code says what a *scoped* manual enqueue should do with a skipped unit — surfaced as Deviation 7 for Manu to rule on at plan review rather than invented during execution.
