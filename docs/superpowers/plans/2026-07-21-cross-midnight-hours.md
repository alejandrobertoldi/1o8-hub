# Cross-midnight Time Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the hours tracker log shifts that cross midnight by auto-splitting them into two same-day rows at write time.

**Architecture:** A single pure function `computeShift` turns any input into 1 or 2 same-day segments. The API inserts one row per segment (day-+1 segment gets the next date). Storage model, overlap detection, and totals are unchanged because every stored row remains same-day. `normalizeRange` becomes a strict single-segment wrapper so the edit path and all existing tests keep their exact contract.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM, Vitest.

## Global Constraints

- No database schema changes (shared production Supabase, additive-only rule).
- `MAX_SHIFT_MIN = 16 * 60` — reject any shift longer than 16h (typo guard); guarantees at most one midnight crossing / two rows.
- A shift ending exactly at `00:00` stays ONE row with `endTime` stored as `"00:00"` (means end-of-day / 1440). No zero-length second row.
- No cross-midnight editing: inline edit is single-row; PATCH rejects an input that would split.
- Times are `"HH:MM"` 24h strings. `hours` is `numeric(4,2)` (max 99.99 — a 16h segment fits).
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Stage only the explicit files listed in each commit step. Never `git add .`/`-A`.
- Do NOT push or deploy. Local commits only.

---

### Task 1: `computeShift` core + helpers in validation.ts

**Files:**
- Modify: `src/lib/hours/validation.ts`
- Test: `src/lib/hours/validation.test.ts`

**Interfaces:**
- Consumes: existing `parseTimeToMinutes`, `minutesToTime`, `RangeInput`, `NormalizedRange`.
- Produces:
  - `MAX_SHIFT_MIN: number` (= 960)
  - `type Segment = { dayOffset: 0 | 1; startTime: string; endTime: string; hours: number }`
  - `computeShift(input: RangeInput): { ok: true; segments: Segment[] } | { ok: false; error: string }`
  - `normalizeRange(input: RangeInput): { ok: true; range: NormalizedRange } | { ok: false; error: string }` (now a single-segment wrapper — same shape as before)
  - `endMinutes(startTime: string, endTime: string): number`
  - `addDays(dateStr: string, n: number): string`
  - `findOverlaps` (updated to use `endMinutes`)

- [ ] **Step 1: Write failing tests for `computeShift`**

Add to `src/lib/hours/validation.test.ts` (keep existing imports; add `computeShift`, `endMinutes`, `addDays` to the import from `./validation`):

```ts
describe("computeShift", () => {
  it("same-day range → one segment (regression)", () => {
    const r = computeShift({ startTime: "09:00", endTime: "17:00" });
    expect(r).toEqual({
      ok: true,
      segments: [{ dayOffset: 0, startTime: "09:00", endTime: "17:00", hours: 8 }],
    });
  });

  it("ends exactly at midnight → one segment ending 00:00", () => {
    const r = computeShift({ startTime: "22:30", endTime: "00:00" });
    expect(r).toEqual({
      ok: true,
      segments: [{ dayOffset: 0, startTime: "22:30", endTime: "00:00", hours: 1.5 }],
    });
  });

  it("duration ending exactly at midnight → one segment", () => {
    const r = computeShift({ startTime: "22:30", durationHours: 1.5 });
    expect(r).toEqual({
      ok: true,
      segments: [{ dayOffset: 0, startTime: "22:30", endTime: "00:00", hours: 1.5 }],
    });
  });

  it("end-time past midnight → two segments split at midnight", () => {
    const r = computeShift({ startTime: "22:30", endTime: "02:00" });
    expect(r).toEqual({
      ok: true,
      segments: [
        { dayOffset: 0, startTime: "22:30", endTime: "00:00", hours: 1.5 },
        { dayOffset: 1, startTime: "00:00", endTime: "02:00", hours: 2 },
      ],
    });
  });

  it("duration past midnight → two segments", () => {
    const r = computeShift({ startTime: "22:30", durationHours: 3.5 });
    expect(r.ok && r.segments.map((s) => s.hours)).toEqual([1.5, 2]);
  });

  it("rejects a reversed-time typo over the 16h cap", () => {
    const r = computeShift({ startTime: "09:00", endTime: "07:00" }); // 22h span
    expect(r.ok).toBe(false);
  });

  it("rejects an equal start/end (24h span)", () => {
    expect(computeShift({ startTime: "09:00", endTime: "09:00" }).ok).toBe(false);
  });

  it("allows a shift of exactly 16h", () => {
    const r = computeShift({ startTime: "22:30", durationHours: 16 });
    expect(r.ok).toBe(true);
    expect(r.ok && r.segments.length).toBe(2);
  });

  it("rejects a shift longer than 16h via duration", () => {
    expect(computeShift({ startTime: "09:00", durationHours: 16.5 }).ok).toBe(false);
  });

  it("rejects both/neither endTime and durationHours", () => {
    expect(computeShift({ startTime: "09:00", endTime: "10:00", durationHours: 1 }).ok).toBe(false);
    expect(computeShift({ startTime: "09:00" }).ok).toBe(false);
  });

  it("rejects malformed start", () => {
    expect(computeShift({ startTime: "9am", endTime: "10:00" }).ok).toBe(false);
  });
});

describe("endMinutes", () => {
  it("normal end returns raw minutes", () => {
    expect(endMinutes("09:00", "17:00")).toBe(1020);
  });
  it("end at 00:00 (<= start) reads as end-of-day 1440", () => {
    expect(endMinutes("22:30", "00:00")).toBe(1440);
  });
});

describe("addDays", () => {
  it("adds a day", () => {
    expect(addDays("2026-07-20", 1)).toBe("2026-07-21");
  });
  it("rolls over a month boundary", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
  });
  it("rolls over a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/hours/validation.test.ts`
Expected: FAIL — `computeShift`, `endMinutes`, `addDays` are not exported.

- [ ] **Step 3: Implement the core in `src/lib/hours/validation.ts`**

Add the constant and `Segment` type near the existing `NormalizedRange`/`RangeInput` types:

```ts
export const MAX_SHIFT_MIN = 16 * 60;

export type Segment = {
  dayOffset: 0 | 1;
  startTime: string;
  endTime: string;
  hours: number;
};
```

Add `computeShift` (this is the new source of truth). Reuse the existing exactly-one-of and duration checks:

```ts
export function computeShift(
  input: RangeInput
): { ok: true; segments: Segment[] } | { ok: false; error: string } {
  const start = parseTimeToMinutes(input.startTime ?? "");
  if (start === null) {
    return { ok: false, error: "Invalid start time — expected HH:MM" };
  }

  const hasEnd = input.endTime !== undefined;
  const hasDuration = input.durationHours !== undefined;
  if (hasEnd === hasDuration) {
    return { ok: false, error: "Provide exactly one of endTime or durationHours" };
  }

  let endAbs: number; // absolute minutes from start-of-day-0; may exceed 1440
  if (hasEnd) {
    const parsed = parseTimeToMinutes(input.endTime as string);
    if (parsed === null) {
      return { ok: false, error: "Invalid end time — expected HH:MM" };
    }
    // end <= start means the shift runs into the next day
    endAbs = parsed <= start ? parsed + 24 * 60 : parsed;
  } else {
    const dur = input.durationHours as number;
    if (!Number.isFinite(dur) || dur <= 0) {
      return { ok: false, error: "Duration must be greater than 0" };
    }
    endAbs = start + Math.round(dur * 60);
  }

  const span = endAbs - start;
  if (span <= 0) {
    return { ok: false, error: "End time must be after start time" };
  }
  if (span > MAX_SHIFT_MIN) {
    return { ok: false, error: "End time must be after start time" };
  }

  const hoursOf = (a: number, b: number) => Math.round(((b - a) / 60) * 100) / 100;
  // An end that lands exactly on a midnight is rendered "00:00" (end-of-day).
  const endLabel = (mins: number) =>
    mins % (24 * 60) === 0 ? "00:00" : minutesToTime(mins % (24 * 60));

  if (endAbs <= 24 * 60) {
    return {
      ok: true,
      segments: [
        {
          dayOffset: 0,
          startTime: minutesToTime(start),
          endTime: endLabel(endAbs),
          hours: hoursOf(start, endAbs),
        },
      ],
    };
  }

  // Crosses midnight → split
  return {
    ok: true,
    segments: [
      {
        dayOffset: 0,
        startTime: minutesToTime(start),
        endTime: "00:00",
        hours: hoursOf(start, 24 * 60),
      },
      {
        dayOffset: 1,
        startTime: "00:00",
        endTime: endLabel(endAbs),
        hours: hoursOf(24 * 60, endAbs),
      },
    ],
  };
}
```

Replace the existing `normalizeRange` body with a single-segment wrapper (keep the exported name and return shape):

```ts
export function normalizeRange(
  input: RangeInput
): { ok: true; range: NormalizedRange } | { ok: false; error: string } {
  const r = computeShift(input);
  if (!r.ok) return r;
  if (r.segments.length !== 1) {
    return { ok: false, error: "Entry would cross midnight — log it in the tracker to split it" };
  }
  const s = r.segments[0];
  return { ok: true, range: { startTime: s.startTime, endTime: s.endTime, hours: s.hours } };
}
```

Add the two helpers (place `endMinutes` above `findOverlaps`):

```ts
/** Minutes for an end time, treating an end <= start (i.e. "00:00") as end-of-day (1440). */
export function endMinutes(startTime: string, endTime: string): number {
  const s = parseTimeToMinutes(startTime);
  const e = parseTimeToMinutes(endTime);
  if (s === null || e === null) return 0;
  return e <= s ? e + 24 * 60 : e;
}

/** Add `n` days to a YYYY-MM-DD string using UTC math (month/year-rollover safe). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
```

Update `findOverlaps` to use `endMinutes` so a stored `22:30–00:00` row reads as ending at 1440:

```ts
export function findOverlaps(
  range: { startTime: string; endTime: string },
  others: OverlapCandidate[]
): OverlapCandidate[] {
  const s = parseTimeToMinutes(range.startTime);
  if (s === null) return [];
  const e = endMinutes(range.startTime, range.endTime);
  return others.filter((o) => {
    const os = parseTimeToMinutes(o.startTime);
    if (os === null) return false;
    const oe = endMinutes(o.startTime, o.endTime);
    return s < oe && os < e;
  });
}
```

- [ ] **Step 4: Update the existing `normalizeRange` test names to reflect new meaning (behavior unchanged)**

In `src/lib/hours/validation.test.ts`, the two existing tests still assert `ok:false`; only their intent changed. Rename for clarity (edit the `it(...)` titles only, leave the assertions):

```ts
  it("rejects a cross-midnight range on the single-segment path", () => {
    const r = normalizeRange({ startTime: "23:00", endTime: "01:00" });
    expect(r.ok).toBe(false);
  });

  it("rejects a cross-midnight duration on the single-segment path", () => {
    const r = normalizeRange({ startTime: "23:00", durationHours: 2 });
    expect(r.ok).toBe(false);
  });
```

Add one new `normalizeRange` test (the newly-allowed exact-midnight single row):

```ts
  it("accepts a same-day shift ending exactly at midnight", () => {
    const r = normalizeRange({ startTime: "22:30", endTime: "00:00" });
    expect(r).toEqual({
      ok: true,
      range: { startTime: "22:30", endTime: "00:00", hours: 1.5 },
    });
  });
```

Add one new `findOverlaps` test (overlap with a midnight-ending row):

```ts
  it("detects overlap against a row that ends at midnight", () => {
    const hits = findOverlaps(
      { startTime: "23:00", endTime: "23:30" },
      [{ id: "m", clientIdCode: "Z", startTime: "22:30:00", endTime: "00:00:00" }]
    );
    expect(hits.map((h) => h.id)).toEqual(["m"]);
  });
```

- [ ] **Step 5: Run the full hours validation suite**

Run: `npm run test -- src/lib/hours/validation.test.ts`
Expected: PASS (all existing + new tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/hours/validation.ts src/lib/hours/validation.test.ts
git commit -m "feat(hours): computeShift core for cross-midnight auto-split

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: POST /api/hours inserts one row per segment

**Files:**
- Modify: `src/app/api/hours/route.ts`
- Test: `src/app/api/hours/route.test.ts`

**Interfaces:**
- Consumes: `computeShift`, `addDays`, `findOverlaps` (Task 1); `insertEntry`, `entriesOnDate` (existing).
- Produces:
  - `validateEntryBody(body)` → `{ ok: true; entryDate: string; clientIdCode: string; note: string | null; segments: Segment[] } | { ok: false; error: string }` (shape change: now returns `segments` + base fields instead of a single `data` object). Consumed by Task 3.
  - POST response: `{ entries: SerializedEntry[]; overlaps: SerializedEntry[] }`.

- [ ] **Step 1: Write a failing test for the split insert**

Add to the `describe("POST /api/hours", ...)` block in `src/app/api/hours/route.test.ts`:

```ts
  it("splits a cross-midnight entry into two rows", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(true);
    asMock(entriesOnDate).mockResolvedValue([]);
    asMock(insertEntry)
      .mockResolvedValueOnce({
        ...DB_ROW, id: "s1", entryDate: "2026-07-20",
        startTime: "22:30:00", endTime: "00:00:00", hours: "1.50",
      })
      .mockResolvedValueOnce({
        ...DB_ROW, id: "s2", entryDate: "2026-07-21",
        startTime: "00:00:00", endTime: "02:00:00", hours: "2.00",
      });

    const res = await POST(
      postReq({
        entryDate: "2026-07-20",
        clientIdCode: "PURA",
        startTime: "22:30",
        endTime: "02:00",
        note: null,
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(insertEntry).toHaveBeenCalledTimes(2);
    expect(insertEntry).toHaveBeenNthCalledWith(1, expect.objectContaining({
      entryDate: "2026-07-20", startTime: "22:30", endTime: "00:00", hours: 1.5,
    }));
    expect(insertEntry).toHaveBeenNthCalledWith(2, expect.objectContaining({
      entryDate: "2026-07-21", startTime: "00:00", endTime: "02:00", hours: 2,
    }));
    expect(json.entries).toHaveLength(2);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/app/api/hours/route.test.ts`
Expected: FAIL — POST inserts once and returns `entry`, not `entries`.

- [ ] **Step 3: Rewrite `validateEntryBody` and `POST` in `src/app/api/hours/route.ts`**

Change the import to add `computeShift`, `addDays` and a `Segment` type; keep `findOverlaps`, `isValidDateString`:

```ts
import {
  computeShift,
  findOverlaps,
  isValidDateString,
  addDays,
  type Segment,
} from "@/lib/hours/validation";
```

Replace `validateEntryBody` (lines ~47-85) with the segment-returning version:

```ts
/** Shared body validation for POST (here) and PATCH ([id]/route.ts). */
export async function validateEntryBody(body: {
  entryDate?: unknown;
  clientIdCode?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  durationHours?: unknown;
  note?: unknown;
}): Promise<
  | { ok: true; entryDate: string; clientIdCode: string; note: string | null; segments: Segment[] }
  | { ok: false; error: string }
> {
  const entryDate = typeof body.entryDate === "string" ? body.entryDate : "";
  if (!isValidDateString(entryDate)) {
    return { ok: false, error: "Invalid entryDate — expected YYYY-MM-DD" };
  }

  const clientIdCode =
    typeof body.clientIdCode === "string" ? body.clientIdCode.trim() : "";
  if (!clientIdCode || !(await clientCodeExists(clientIdCode))) {
    return { ok: false, error: `Unknown client code: ${clientIdCode || "(empty)"}` };
  }

  const shift = computeShift({
    startTime: typeof body.startTime === "string" ? body.startTime : "",
    endTime: typeof body.endTime === "string" ? body.endTime : undefined,
    durationHours:
      typeof body.durationHours === "number" ? body.durationHours : undefined,
  });
  if (!shift.ok) return shift;

  const note =
    typeof body.note === "string" && body.note.trim() !== "" ? body.note.trim() : null;

  return { ok: true, entryDate, clientIdCode, note, segments: shift.segments };
}
```

Replace the `POST` body (lines ~124-146, from `const validated = ...` onward):

```ts
  const validated = await validateEntryBody(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const { entryDate, clientIdCode, note, segments } = validated;

  const overlaps: ReturnType<typeof serializeEntry>[] = [];
  const entries: ReturnType<typeof serializeEntry>[] = [];

  for (const seg of segments) {
    const segDate = seg.dayOffset === 1 ? addDays(entryDate, 1) : entryDate;

    const sameDay = await entriesOnDate(auth.user.id, segDate);
    const segOverlaps = findOverlaps(
      { startTime: seg.startTime, endTime: seg.endTime },
      sameDay.map((r) => ({
        id: r.id,
        clientIdCode: r.clientIdCode,
        startTime: r.startTime.slice(0, 5),
        endTime: r.endTime.slice(0, 5),
      }))
    );
    overlaps.push(...segOverlaps);

    const row = await insertEntry({
      userId: auth.user.id,
      clientIdCode,
      entryDate: segDate,
      startTime: seg.startTime,
      endTime: seg.endTime,
      hours: seg.hours,
      note,
    });
    entries.push(serializeEntry(row));
  }

  return NextResponse.json({ entries, overlaps }, { status: 201 });
```

- [ ] **Step 4: Run POST tests**

Run: `npm run test -- src/app/api/hours/route.test.ts`
Expected: PASS. (Existing same-day tests still pass: they read `json.overlaps`, and `insertEntry` is called once with the same single-segment args.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/hours/route.ts src/app/api/hours/route.test.ts
git commit -m "feat(hours): POST splits cross-midnight entries into two rows

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: PATCH stays single-row; rejects cross-midnight edits

**Files:**
- Modify: `src/app/api/hours/[id]/route.ts`
- Test: `src/app/api/hours/[id]/route.test.ts`

**Interfaces:**
- Consumes: `validateEntryBody` (now returns `segments`, Task 2); `findOverlaps`, `updateEntry`, `entriesOnDate` (existing).
- Produces: PATCH response unchanged `{ entry, overlaps }`.

- [ ] **Step 1: Write a failing test for the cross-midnight edit rejection**

Add this test inside the existing `describe("PATCH /api/hours/[id]", ...)` block in `src/app/api/hours/[id]/route.test.ts`. It reuses the file's module-level `req`, `params`, `OWNER`, `DB_ROW`, `BODY`, and the `updateEntry` mock (the `beforeEach` already sets `clientCodeExists`→true and `entriesOnDate`→[]):

```ts
  it("400 when an edit would cross midnight", async () => {
    asMock(getAuthSession).mockResolvedValue(OWNER);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    const res = await PATCH(
      req("PATCH", { ...BODY, startTime: "22:30", endTime: "02:00" }),
      params
    );
    expect(res.status).toBe(400);
    expect(updateEntry).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- "src/app/api/hours/[id]/route.test.ts"`
Expected: FAIL — after Task 2, `validateEntryBody` no longer returns `data`, so the current PATCH (`const { data } = validated;`) is a compile error; even ignoring that, it does not reject a splitting edit.

- [ ] **Step 3: Update `PATCH` in `src/app/api/hours/[id]/route.ts`**

Replace the block from `const { data } = validated;` through the `updateEntry` call (lines ~47-63) with a single-segment guard:

```ts
  if (validated.segments.length !== 1) {
    return NextResponse.json(
      { error: "Editing an entry to cross midnight isn't supported — delete and re-log it." },
      { status: 400 }
    );
  }
  const seg = validated.segments[0];
  const data = {
    entryDate: validated.entryDate,
    clientIdCode: validated.clientIdCode,
    startTime: seg.startTime,
    endTime: seg.endTime,
    hours: seg.hours,
    note: validated.note,
  };

  // Overlaps are computed against the entry OWNER's other entries that day,
  // excluding the entry being edited.
  const sameDay = await entriesOnDate(entry.userId, data.entryDate, id);
  const overlaps = findOverlaps(
    { startTime: data.startTime, endTime: data.endTime },
    sameDay.map((r) => ({
      id: r.id,
      clientIdCode: r.clientIdCode,
      startTime: r.startTime.slice(0, 5),
      endTime: r.endTime.slice(0, 5),
    }))
  );

  const updated = await updateEntry(id, data);
  return NextResponse.json({ entry: serializeEntry(updated), overlaps });
```

- [ ] **Step 4: Run PATCH tests**

Run: `npm run test -- "src/app/api/hours/[id]/route.test.ts"`
Expected: PASS (new rejection test + existing same-day PATCH tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/hours/[id]/route.ts" "src/app/api/hours/[id]/route.test.ts"
git commit -m "feat(hours): PATCH rejects edits that would cross midnight

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Client form — previews, split toast, submit gate

**Files:**
- Modify: `src/components/hours/hours-tracker.tsx`

**Interfaces:**
- Consumes: `computeShift` (Task 1); POST response `{ entries, overlaps }` (Task 2).
- Produces: no exports; UI behavior only.

> No component test exists for this file; verification is typecheck + build + manual (Step 4/5). Keep edits minimal and localized.

- [ ] **Step 1: Update imports and submit gate**

In `src/components/hours/hours-tracker.tsx`, add `computeShift` to the import from `@/lib/hours/validation` (line ~36-41):

```ts
import {
  normalizeRange,
  findOverlaps,
  minutesToTime,
  parseTimeToMinutes,
  computeShift,
} from "@/lib/hours/validation";
```

Change `canSubmit` (lines ~249-256) to use `computeShift`:

```ts
  const canSubmit = useMemo(() => {
    if (!clientIdCode || !entryDate) return false;
    const input =
      mode === "range"
        ? { startTime, endTime }
        : { startTime, durationHours: Number(duration) };
    return computeShift(input).ok;
  }, [clientIdCode, entryDate, mode, startTime, endTime, duration]);
```

- [ ] **Step 2: Replace `computedEnd` preview with a shift-aware, both-mode preview**

Replace the `computedEnd` memo (lines ~189-197) with:

```ts
  // Live end-time preview for both modes; marks a next-day end.
  const shiftPreview = useMemo(() => {
    const input =
      mode === "range"
        ? { startTime, endTime }
        : { startTime, durationHours: Number(duration) };
    const r = computeShift(input);
    if (!r.ok) return null;
    const last = r.segments[r.segments.length - 1];
    const crosses = r.segments.length > 1;
    return { end: last.endTime, crosses };
  }, [mode, startTime, endTime, duration]);
```

Update the duration-mode label (lines ~472-474) to use the preview:

```tsx
            <label className="text-[10px] font-bold text-muted-foreground" htmlFor="hours-duration">
              Hours{shiftPreview ? ` (ends ${shiftPreview.end}${shiftPreview.crosses ? " +1 day" : ""})` : ""}
            </label>
```

Update the end-mode `End` label (line ~467) to surface the crossing:

```tsx
            <label className="text-[10px] font-bold text-muted-foreground">
              End{shiftPreview?.crosses ? " (+1 day)" : ""}
            </label>
```

Change the duration `<input>` `max` from `"24"` to `"16"` (line ~480).

- [ ] **Step 3: Update the create mutation return type + success toast**

Change the mutation's return cast (line ~217) from `{ entry: ApiEntry; overlaps: ApiEntry[] }` to:

```ts
      return json as { entries: ApiEntry[]; overlaps: ApiEntry[] };
```

Replace the `onSuccess` handler (lines ~219-232) to read `entries` and announce a split:

```ts
    onSuccess: ({ entries, overlaps }) => {
      queryClient.invalidateQueries({ queryKey: ["hours"] });
      setEndTime("");
      setDuration("");
      setNote("");
      if (overlaps.length > 0) {
        const o = overlaps[0];
        toast.warning(
          `Overlaps an existing entry: ${o.clientIdCode} ${o.startTime}–${o.endTime}`
        );
      } else if (entries.length > 1) {
        const parts = entries.map((e) => `${e.hours.toFixed(2)}h`).join(" + ");
        toast.success(`Logged 2 entries — split at midnight (${parts})`);
      } else {
        toast.success("Hours logged");
      }
    },
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `npm run lint && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 5: Manual verification (PORT=3000)**

Run: `PORT=3000 npm run dev`, sign in as a team user, open the hours page, and confirm:
- End-time mode `22:30 → 00:00` logs one 1.5h row (was blocked before).
- End-time mode `22:30 → 02:00` logs two rows (`Jul20 22:30–00:00` 1.5h, `Jul21 00:00–02:00` 2.0h); toast says "split at midnight". The `End (+1 day)` marker shows while editing.
- Duration mode `22:30 + 3.5` behaves the same; label shows `(ends 02:00 +1 day)`.
- End-time `09:00 → 07:00` keeps the button disabled (16h cap typo guard).
- A normal `09:00 → 17:00` entry still logs one 8h row.

- [ ] **Step 6: Commit**

```bash
git add src/components/hours/hours-tracker.tsx
git commit -m "feat(hours): form supports cross-midnight shifts with +1 day preview

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run the whole hours suite: `npm run test -- src/lib/hours src/app/api/hours`
- [ ] Confirm no regression in same-day logging, overlaps, and totals via the manual checks in Task 4 Step 5.
- [ ] Report results to the user. Do NOT push or deploy without explicit per-action approval.
