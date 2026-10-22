# Cross-midnight time entries (auto-split) — Design

**Date:** 2026-07-21
**Area:** Team hours tracker (`/components/hours`, `/api/hours`, `/lib/hours`)
**Status:** Approved design, pending spec review → writing-plans

## Problem

The hours tracker refuses any entry that reaches or crosses midnight. A late shift
(e.g. `22:30 → 02:00`) cannot be logged at all, and even a shift ending *exactly* at
midnight (`22:30 → 00:00`, or duration `22:30 + 1.5h`) is rejected because `00:00`
parses to minute 0, which the validator reads as "before the start time".

Two guards in [`src/lib/hours/validation.ts`](../../../src/lib/hours/validation.ts)
produce this:

```ts
if (end >= 24 * 60) return { ok: false, error: "Entries cannot cross midnight — log two entries" };
if (end <= start)   return { ok: false, error: "End time must be after start time" };
```

This is intentional, not a code defect — the schema anchors every entry to a single
`entryDate` with two `time` columns and no end-date, so a spanning entry has nowhere
to record "the end is on the next day".

## Goal

Let users log shifts that run into the next day, without changing the storage model
or breaking overlap detection, per-day totals, or week/month grouping.

## Chosen approach: auto-split at midnight

A cross-midnight shift is stored as **two same-day rows**, split at midnight:

```
Input:  Jul20  22:30 → 02:00
Stored: Jul20  22:30 → 00:00   (1.5h)   dayOffset 0
        Jul21  00:00 → 02:00   (2.0h)   dayOffset +1
```

Because the split happens at write time, **every stored row is same-day**. Overlap
detection, `SUM(hours)` totals, the This Week/Month/All grouping, and the DB schema
are all untouched. Two rows is also the honest representation — those hours genuinely
fell on two calendar days.

### Rejected alternative: single spanning entry

A single row where `end < start` means "next day" was rejected: it requires a schema
change (end-date column or flag) on shared production Supabase (violates the
additive-only rule) and breaks `findOverlaps` (same-day minute comparison), per-day
totals, and the range queries that key off a single `entryDate`.

## Locked decisions

- **Storage:** auto-split into two same-day rows. No schema change.
- **Input (end-time mode):** infer "next day" when `end ≤ start`. No new UI control.
- **Typo guard / max shift:** `MAX_SHIFT_MIN = 16 * 60`. A shift longer than 16h is
  rejected as a likely reversed-time typo (e.g. `09:00 → 07:00` = 22h). 16h also
  guarantees at most one midnight crossing → at most two rows.
- **Exactly-at-midnight:** a shift ending exactly at `00:00` stays **one row** whose
  `endTime` is stored as `"00:00"` meaning end-of-day (1440). No zero-length second row.
- **Editing:** inline edit stays single-row / same-day. Editing an existing entry so it
  would cross midnight returns a clear error ("delete and re-log to split across
  midnight"). Since stored rows never cross midnight, edit never needs to split.
- **Split feedback:** success toast announces the split, e.g.
  `Logged 2 entries — split at midnight (1.5h + 2.0h)`. No confirmation dialog.
- **No multi-midnight support** (the 16h cap makes it impossible anyway).

## Components & changes

### 1. `src/lib/hours/validation.ts` — core logic

Add:

```ts
export const MAX_SHIFT_MIN = 16 * 60;

export type Segment = { dayOffset: 0 | 1; startTime: string; endTime: string; hours: number };

// The single source of truth. Returns 1 or 2 segments.
export function computeShift(input: RangeInput):
  | { ok: true; segments: Segment[] }
  | { ok: false; error: string };
```

`computeShift` behavior:
1. Parse `startTime` → `start` (minutes). Invalid → error.
2. Exactly one of `endTime` / `durationHours` must be present (existing rule).
3. Compute absolute end minutes:
   - end-mode: parse end → `endMin`; if `endMin <= start`, `endMin += 1440` (next-day inference).
   - duration-mode: `dur > 0` required; `endMin = start + Math.round(dur * 60)`.
4. Validate span: `span = endMin - start`. Reject if `span <= 0` or `span > MAX_SHIFT_MIN`
   → `"End time must be after start time"`.
5. Build segments:
   - If `endMin <= 1440`: **one** segment `{ dayOffset: 0, start→endMin }`, where an end
     of exactly 1440 is emitted as `endTime: "00:00"`.
   - If `endMin > 1440`: **two** segments —
     `{ dayOffset: 0, start→1440 (endTime "00:00") }` and
     `{ dayOffset: 1, 0→(endMin-1440) }`.
   - Each segment's `hours = Math.round((segEnd - segStart) / 60 * 100) / 100`.
   - `startTime` / `endTime` formatted `"HH:MM"`; an end at 1440 formats to `"00:00"`.

Refactor `normalizeRange` into a thin single-segment wrapper (preserves its
`{ ok: true; range: NormalizedRange } | { ok: false; error }` shape for the edit path
and client `editValid`):

```ts
export function normalizeRange(input: RangeInput) {
  const r = computeShift(input);
  if (!r.ok) return r;
  if (r.segments.length !== 1)
    return { ok: false, error: "Entry would cross midnight — delete and re-log to split" };
  const s = r.segments[0]; // dayOffset always 0 here
  return { ok: true, range: { startTime: s.startTime, endTime: s.endTime, hours: s.hours } };
}
```

Add helpers:

```ts
// Treat a stored end of "00:00" (end <= start) as end-of-day (1440), for overlap math.
export function endMinutes(startTime: string, endTime: string): number;

// Pure UTC date arithmetic for the day-+1 segment's entryDate (month/year rollover safe).
export function addDays(dateStr: string, n: number): string;
```

Update `findOverlaps` to use `endMinutes` for both the candidate range and each stored
`other`, so a `22:30 → 00:00` row is compared as ending at 1440.

### 2. `POST /api/hours` (`src/app/api/hours/route.ts`)

- `validateEntryBody` returns `segments` (built from `computeShift`) alongside the
  validated `entryDate`, `clientIdCode`, `note`.
- For each segment, compute its date (`dayOffset === 1 ? addDays(entryDate, 1) : entryDate`)
  and `insertEntry`.
- Compute overlaps per segment against `entriesOnDate(userId, <segment date>)`; return the
  union.
- Response shape: `{ entries: SerializedEntry[], overlaps: SerializedEntry[] }`
  (was `{ entry, overlaps }`).

### 3. `PATCH /api/hours/[id]` (`src/app/api/hours/[id]/route.ts`)

- Continues to use single-segment `normalizeRange` via the shared `validateEntryBody`.
  `validateEntryBody` must expose a single-segment path for PATCH; simplest is to have
  PATCH call a variant that errors when `computeShift` yields 2 segments (the wrapper's
  error message above). No row-splitting on edit.
- Response unchanged: `{ entry, overlaps }`.

> Implementation note: `validateEntryBody` is shared by POST and PATCH. Give it a mode
> (or two thin exports) so POST gets `segments` and PATCH gets a single validated row,
> both built on `computeShift`. Keep one code path for parsing.

### 4. `src/components/hours/hours-tracker.tsx`

- `canSubmit`: use `computeShift(input).ok`.
- `computedEnd` preview (duration mode) and a new end-mode preview: show the resulting
  end time with a `(+1 day)` marker when the shift crosses midnight.
- Create mutation: read `entries` from the response; success toast announces a split when
  `entries.length > 1`, e.g. `Logged 2 entries — split at midnight (1.5h + 2.0h)`; the
  overlap-warning toast still fires when `overlaps.length > 0`.
- Duration `<input>` `max` → `16`.
- Inline-edit code (`editValid`, `editRange`) unchanged — still single-segment via
  `normalizeRange`.

## Edge cases (become test cases)

| # | Input | Expected |
|---|-------|----------|
| 1 | end-mode `22:30 → 02:00` | 2 segments: `22:30–00:00` (1.5h, d0), `00:00–02:00` (2.0h, d+1) |
| 2 | end-mode `22:30 → 00:00` | 1 segment: `22:30–00:00` (1.5h, d0) |
| 3 | duration `22:30 + 1.5` | 1 segment: `22:30–00:00` (1.5h, d0) |
| 4 | duration `22:30 + 3.5` | 2 segments: 1.5h + 2.0h |
| 5 | end-mode `09:00 → 07:00` | reject (22h > 16h cap) — typo guard |
| 6 | end-mode `09:00 → 17:00` | 1 segment 8h (same-day regression) |
| 7 | end-mode `09:00 → 09:00` | reject (24h span > cap) |
| 8 | duration `22:30 + 16` from a start giving 16h | 2 segments summing 16h; 16h01m rejected |
| 9 | overlap: new `22:30–00:00` vs stored `23:00–23:30` same day | overlap detected (end read as 1440) |
| 10 | day-+1 across month/year boundary (`Jul31→Aug1`, `Dec31→Jan1`) | correct `entryDate` via `addDays` |
| 11 | PATCH edit an entry to `22:30 → 02:00` | reject with split-not-supported message |

## Testing

TDD. Unit tests in `src/lib/hours/` cover the table above (`computeShift`, `normalizeRange`,
`endMinutes`, `addDays`, `findOverlaps`). A route test extends
`src/app/api/hours/route.test.ts` to assert the create-split inserts two rows and returns
`{ entries: [2] }`. Run the existing hours suite to confirm no same-day regression.

## Out of scope

- Schema changes of any kind.
- Multi-midnight / >24h shifts.
- Cross-midnight editing (delete + re-log).
- Any change to reporting, portal finance, or summary endpoints (they `SUM` stored hours,
  which stay correct).
