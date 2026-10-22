# Design: empty-unit skip for the nightly Redshift→BigQuery archival

**Date:** 2026-08-17 (measurements taken 2026-08-16 23:0x UTC)
**Thread:** C — Redshift→BigQuery archival, Plan 2A
**Status:** design approved in chat; implementation plan not yet written
**Supersedes nothing.** Additive change to `src/lib/archive/`.

---

## 1. Problem

384 work units are enqueued every night (8 enabled tables × 48 eligible accounts).
**257 of them read zero rows** and have done so on every night observed. They consume
drain time producing nothing, and they are the binding constraint on enabling more
tables.

The naive fix — "demote an account after N consecutive zero-row nights" — has a
failure mode that is live right now: `share_of_voice`'s source has stalled, and its
10 data-bearing accounts will read zero rows from **2026-08-24**. A rule keyed on
zero rows alone cannot distinguish *"this account has no data by design"* from
*"this table's pipeline is broken"*, and would demote the most valuable table in the
archive.

## 2. Measurements this design rests on

All read-only, from `redshift_archive_runs`, 2026-08-16.

**Zero-set stability** over the three full 384-unit nights (2026-08-14/15/16):

| Bucket | Units |
|---|---|
| always zero | 257 |
| always data | 127 |
| **flipped zero → data** | **0** |

**Cost, by outcome** (the quantity is *time*, not unit count):

| | Units / 3 nights | Mean | Per night | Share |
|---|---|---|---|---|
| zero-row | 771 | 5.49s | 1,411s | 47.5% |
| has-data | 381 | 12.26s | 1,557s | 52.5% |
| total | 1,152 | — | 2,969s | 100% |

That total reconciles with session 14's independently derived 2,962s/night.

**Correction to a previously recorded figure.** The note *"257/384 units read zero
rows ⇒ ~80% of capacity wasted ⇒ skipping them ~3× capacity"* counted units, not
seconds. Empty units are 67% of the units but **47.5% of the time**. The real gain
is ~1.7×, not 3×.

**The "~5s fixed overhead" model has a long tail:** the slowest unit that read *zero
rows* took **37.9s**. Do not build budget arithmetic on a flat 5s.

**History depth:** only 2026-08-14/15/16 are full 384-unit nights. 08-12/13 ran three
tables × 48 accounts. All eight enabled tables therefore have ≥3 nightly observations.

## 3. Decisions (locked in chat, do not re-litigate)

1. **A unit that has ever produced rows is never demoted.** Only units with zero rows
   across their entire history are skippable. This removes the `share_of_voice`
   collision by construction — no judgement about *why* a source went quiet.
2. **Probe cadence = `max(1, floor(repull_window_days / 2))`**, derived per table, not
   a hardcoded 7. Identical to weekly today (all eight tables use 14), but stays
   correct if a table's repull window is ever shortened, where a hardcoded 7 would
   silently lose its margin.
3. **Skipped units get no row and no new status.** No migration. Chosen over a
   `status='skipped'` value (which would require dropping and re-adding the
   `redshift_archive_runs_status_check` CHECK constraint) on YAGNI grounds; revisit
   if the lost visibility actually bites.

**Trap, recorded so it is never re-proposed:** do *not* record skipped units as
`status='done'` with `rows_read = 0`. Those synthetic zeros feed back into the very
signal the demotion rule reads, and would also corrupt nightly grading.

**Schema note:** `redshift_archive_runs.status` is `varchar(20)` in `schema.ts` with
only a TypeScript union, but the live DB *also* carries
`redshift_archive_runs_status_check CHECK (status IN ('pending','running','done','failed'))`.
The Drizzle definition does not declare it. Reading `schema.ts` alone gives the wrong
answer about whether a new status value needs a migration.

## 4. The predicate

No new tables, no new columns, no stored counters. The `rows_read` history **is** the
state.

```
enqueue(unit) ⟺  noHistory(unit)                       // never observed → fail open
              ∨  everProducedRows(unit)                 // proven → never demoted
              ∨  observedNights(unit) < MIN_OBSERVED    // too little evidence → fail open
              ∨  isProbeNight(runDate, unit, cadence)
```

with `MIN_OBSERVED_NIGHTS = 3` and

```
cadence = max(1, floor(repull_window_days / 2))
day     = floor(Date.UTC(y, m, d) / 86_400_000)        // UTC day number
isProbeNight = (day + hashUnitKey(`${schema}.${table}:${accountId}`)) % cadence === 0
```

### Why phase, not gap

A "days since last run ≥ cadence" rule would sync all 257 units — they were all last
run on the same night — into a 257-unit herd every seventh night. Hashing the unit key
spreads them to **~37 per night** and makes the maximum interval between probes exactly
`cadence` days *by construction*, which is a unit-testable invariant rather than an
estimate.

### The history query

One grouped read, in `enqueuer.ts` (I/O layer):

```sql
SELECT schema_name, table_name, account_id,
       count(*) FILTER (WHERE run_kind = 'nightly') AS nightly_observations,
       max(coalesce(rows_read, 0))                  AS peak_rows
FROM redshift_archive_runs
WHERE status = 'done'
GROUP BY 1, 2, 3
```

`peak_rows` spans **all** run kinds deliberately — if a backfill ever proved a unit has
data, that unit is proven forever. `nightly_observations` counts nightly rows only.
The table holds 1,444 rows today and grows ~60k/year *after* this change; no index is
needed and none is added.

## 5. Files touched

| File | Change |
|---|---|
| `src/lib/archive/work-units.ts` | New `UnitHistory` input type; new pure `hashUnitKey()`, `isProbeNight()`, `shouldEnqueueUnit()`; `buildNightlyWorkUnits()` accepts a history map and filters. |
| `src/lib/archive/enqueuer.ts` | One extra `SELECT`; passes the history map through; adds `unitsSkipped` and `unitsProbed` to `EnqueueResult`. |
| `src/lib/archive/work-units.test.ts` | ~11 new pure tests. |
| `src/lib/archive/drainer.ts` | One constant — `budgetMs` 250_000 → 200_000. See §5a. Skip logic itself does not touch the drainer: skipped units are never rows, so there is nothing to claim. |
| schema / migrations | **None.** |

Decision logic lives in the pure layer because `work-units.ts` has tests and
`enqueuer.ts` has none, and because the existing architecture already separates
"enqueuer does I/O, work-units decides".

### 5a. Drain margin (approved 2026-08-17, folded into this plan)

`drainLoop` uses `budgetMs = 250_000` inside a `maxDuration` of 300s, leaving a **50s
tail — smaller than the 58.6s worst unit ever observed**. A unit that starts at 249s
elapsed and runs 58.6s overruns the 300s ceiling and is killed mid-flight, leaving a
`running` row that `reclaimStaleRuns` only picks up after `STALE_RUNNING_MS` = 1h.
That costs an hour and an attempt; it does not lose data.

Change `budgetMs` to `200_000`, giving a 100s tail ≈ 1.7× the worst unit seen. This is
affordable *because* of the skip: removing 41% of the nightly work means shorter
windows cost nothing.

58.6s is a floor, not a ceiling, on the worst case: it was measured on 2026-08-14, when
`share_of_voice`'s window was already two days depleted. A full 14-day window — or a
backfill after the source is repaired — would be materially larger.

## 6. Expected effect

| | Today | After |
|---|---|---|
| Units enqueued / night | 384 | ~164 (127 data + ~37 probes) |
| Drain time / night | 2,969s | ~1,759s (−41%) |
| Cost per enabled table | 370s | ~220s |
| Table ceiling at 24,000s/day | 64 | ~109 |

≈1.7×. Expansion should do better than 1.7×: the eight enabled tables were selected
for density, so an arbitrary new table will have a higher empty fraction.

Bootstrap needs no warm-up — all eight tables already have ≥3 nightly observations and
the hash phases are pre-spread, so the full effect lands on the first night.

## 7. Correctness invariant

**Timeseries and period tables:** every run re-reads `[run_date − repull_window_days,
run_date]`, and a probe fires at most `floor(repull_window_days / 2)` days apart. Since
`cadence < repull_window_days`, an account that starts producing is archived **late,
never lost** — the probe's own window covers the entire skipped gap. A wrong demotion
costs ≤ `cadence` days of latency and zero rows. This is what makes
`MIN_OBSERVED_NIGHTS = 3` safe to be aggressive with.

**Snapshot tables (`refdata_label` only) — the invariant does NOT hold in the same
form.** A snapshot has no window to re-read. A skipped snapshot unit yields the
source's *current* state within `cadence` days, but the per-day snapshots in between
are lost. For the 43 accounts that have never had a single label row this costs
nothing real, but it is a difference in kind and is accepted deliberately, not by
oversight.

**On evidence:** three consecutive zero nights are **not** three independent
observations. Consecutive 14-day windows overlap by 13/14, so three zero nights ≈ one
look at a 16-day span. Waiting ten nights would buy a 24-day span. The evidence barely
improves with patience — the probe, not the waiting, is what makes the skip safe.

## 8. Failure modes

| Condition | Behaviour |
|---|---|
| History query throws | Catch, log loudly, **full 384-unit fanout**. Degrades to today's behaviour, never to silence. |
| Unit absent from history map | Enqueued. |
| `repull_window_days` ≤ 2 | `cadence` clamps to 1 ⇒ that table is never skipped. |
| `run_kind` ≠ `nightly` | Skip logic does not apply. Backfill and verify keep full fanout. |

## 9. Test plan

~11 pure tests in `work-units.test.ts`, no DB:

1. no history → enqueued
2. proven unit, zero for 100 consecutive nights → still enqueued
3. `observedNights < 3` → enqueued
4. all-zero, ≥3 observations, probe night → enqueued
5. all-zero, ≥3 observations, non-probe night → skipped
6. **interval invariant** — over any 7 consecutive dates, every sampled key probes at least once
7. `repull_window_days = 1` → cadence 1 → never skipped
8. `repull_window_days = 2` → cadence 1 → never skipped
9. snapshot table takes cadence from its own `repull_window_days`
10. hash distribution over 257 keys — no probe night exceeds ~2× the mean
11. non-nightly run kinds bypass the skip

Vitest does not typecheck: follow the test run with `node_modules/.bin/tsc --noEmit`,
unfiltered, judged by filename. The bar is **zero errors in `src/lib/archive/`**.

## 10. Out of scope

- Refreshing `redshift_archive_account_stats` (`--stats` = ~11,400 Redshift queries / ~9.5h).
- Enabling additional tables. This change creates headroom; spending it is a separate decision.
- Anything about the `share_of_voice` source stall beyond not breaking on it.
