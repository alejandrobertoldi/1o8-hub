# Reports Phase 7 — Live Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the v2 reports page a live, v2-native controls strip (client picker + Week/Custom date range + Refresh) that filters the whole page, replacing the hardcoded account/date in the preview.

**Architecture:** Extract the old page's pure date math into a TDD'd shared lib. A `useReportControls` hook owns all control state (client list from `/api/clients`, mode, dates, refreshKey) and derives `{accountId, start, end, refreshKey}`. A dumb `<ReportsControlsBar>` renders the strip. The preview page hosts the hook once and feeds identical props into both hub + portal `PerformanceOverviewV2` shells. Zero new endpoints.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Tailwind v4, Vitest 4. Reuses existing `RefreshButton`, `DatePicker`, `getSurfacePalette`, `/api/clients`.

## Global Constraints

- Typecheck with `npx tsc --noEmit` — NEVER `next build` (port 3000 is the user's dev server).
- Tests: `npx vitest run <path>`.
- TDD only for pure derivations; DOM/fetch verified by tsc + user visual dogfood, NEVER fake DOM asserts.
- Emphasis color = `getSurfacePalette(surface).accent` (#FF751F hub / #2A5059 portal). NEVER orange on portal data surfaces.
- No new API endpoints. Shell keeps lifting its 3 hooks once per surface.
- `accountId` is derived as `selectedClientObj.rawData.IntentwiseID.trim()`.
- Ignore the 2 known pre-existing tsc errors (sales-summary not-connected-card.test; `.next/dev/types` clients route quirk).
- Commit only on explicit per-action user OK. One task per commit. Explicit pathspec on `git add` AND `git commit` — NEVER `git add .`. Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Shared pure date-range lib (TDD)

**Files:**
- Create: `src/lib/report-date-range.ts`
- Test: `src/lib/report-date-range.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatDate(d: Date): string` → `YYYY-MM-DD` (local).
  - `getFirstDayOfCurrentMonth(now: Date): string`.
  - `getWeekNumber(d: Date): number` (ISO-ish week, matches old page).
  - `getSundayOfWeek(year: number, week: number): Date`.
  - `type RangeMode = "week" | "custom"`.
  - `type RangeOpts = { customStart: string; customEnd: string; year: number; week: number }`.
  - `resolveRange(mode: RangeMode, opts: RangeOpts): { start: string; end: string }` — week mode returns `[sunday, sunday+6]`; custom returns `[customStart, customEnd]`.

Note: these mirror the helpers currently inlined in `src/app/reports/page.tsx:127-165`. Copy the algorithms verbatim so behavior is identical; `now`/`year`/`week` are passed in (no internal `new Date()`) so the functions are pure and testable.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { formatDate, getFirstDayOfCurrentMonth, getWeekNumber, getSundayOfWeek, resolveRange } from "./report-date-range";

describe("report-date-range", () => {
  it("formatDate pads month/day", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("getFirstDayOfCurrentMonth returns the 1st", () => {
    expect(getFirstDayOfCurrentMonth(new Date(2026, 6, 29))).toBe("2026-07-01");
  });

  it("getWeekNumber matches known dates", () => {
    // 2026-01-01 falls in ISO week 1
    expect(getWeekNumber(new Date(2026, 0, 1))).toBe(1);
    // mid-year sanity
    expect(getWeekNumber(new Date(2026, 5, 15))).toBe(25);
  });

  it("getSundayOfWeek returns a Sunday", () => {
    const d = getSundayOfWeek(2026, 25);
    expect(d.getDay()).toBe(0); // Sunday
  });

  it("resolveRange week mode returns sunday..sunday+6", () => {
    const { start, end } = resolveRange("week", { customStart: "", customEnd: "", year: 2026, week: 25 });
    const s = new Date(start + "T00:00:00");
    const e = new Date(end + "T00:00:00");
    expect(s.getDay()).toBe(0);
    expect((e.getTime() - s.getTime()) / 86400000).toBe(6);
  });

  it("resolveRange custom mode passes through", () => {
    expect(resolveRange("custom", { customStart: "2026-06-01", customEnd: "2026-06-30", year: 2026, week: 1 }))
      .toEqual({ start: "2026-06-01", end: "2026-06-30" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/report-date-range.test.ts`
Expected: FAIL — cannot find module `./report-date-range`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type RangeMode = "week" | "custom";
export type RangeOpts = { customStart: string; customEnd: string; year: number; week: number };

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getFirstDayOfCurrentMonth(now: Date): string {
  return formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

export function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getSundayOfWeek(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const mondayW1 = new Date(year, 0, 4 - jan4Day + 1);
  const monday = new Date(mondayW1);
  monday.setDate(mondayW1.getDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() - 1);
  return sunday;
}

export function resolveRange(mode: RangeMode, opts: RangeOpts): { start: string; end: string } {
  if (mode === "week") {
    const weekStart = formatDate(getSundayOfWeek(opts.year, opts.week));
    const startDate = new Date(weekStart + "T00:00:00");
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    return { start: weekStart, end: formatDate(endDate) };
  }
  return { start: opts.customStart, end: opts.customEnd };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/report-date-range.test.ts`
Expected: PASS (6 tests). If `getWeekNumber(2026-06-15)` differs, adjust the expected value to the actual computed week (the algorithm is the source of truth — it is copied verbatim from prod) rather than changing the algorithm.

- [ ] **Step 5: Commit** (on explicit user OK)

```bash
git add src/lib/report-date-range.ts src/lib/report-date-range.test.ts
git commit -m "feat(reports-v2): pure report-date-range lib (formatDate/week/resolveRange), TDD (phase 7)"
```

---

### Task 2: `useReportControls` hook

**Files:**
- Create: `src/components/reports/v2/use-report-controls.ts`

**Interfaces:**
- Consumes: `resolveRange`, `getFirstDayOfCurrentMonth`, `formatDate`, `getWeekNumber` from Task 1 (`@/lib/report-date-range`).
- Produces:
  - `interface ReportClient { clientIdCode: string; clientName: string; clientStatus: string | null; rawData?: Record<string, string> }`
  - `interface ReportControls { clients: ReportClient[]; clientsLoading: boolean; selectedClient: string; setSelectedClient(name: string): void; mode: RangeMode; setMode(m: RangeMode): void; customStart: string; setCustomStart(v: string): void; customEnd: string; setCustomEnd(v: string): void; year: number; setYear(y: number): void; week: number; setWeek(w: number): void; accountId: string; start: string; end: string; refreshKey: number; bumpRefresh(): void }`
  - `useReportControls(): ReportControls`

Behavior mirrors `src/app/reports/page.tsx:167-216`: fetch `/api/clients` on mount, default `selectedClient` to first active (preserve current if still active), derive `accountId = selectedClientObj?.rawData?.IntentwiseID?.trim() ?? ""`, derive `{start,end}` via `resolveRange`.

- [ ] **Step 1: Write the implementation** (no unit test — fetch/state hook, verified by tsc + dogfood per Global Constraints)

```ts
"use client";
/* eslint-disable react-doctor/no-fetch-in-effect */
import { useEffect, useMemo, useState } from "react";
import { formatDate, getFirstDayOfCurrentMonth, getWeekNumber, resolveRange, type RangeMode } from "@/lib/report-date-range";

export interface ReportClient {
  clientIdCode: string;
  clientName: string;
  clientStatus: string | null;
  rawData?: Record<string, string>;
}

export interface ReportControls {
  clients: ReportClient[];
  clientsLoading: boolean;
  selectedClient: string;
  setSelectedClient: (name: string) => void;
  mode: RangeMode;
  setMode: (m: RangeMode) => void;
  customStart: string;
  setCustomStart: (v: string) => void;
  customEnd: string;
  setCustomEnd: (v: string) => void;
  year: number;
  setYear: (y: number) => void;
  week: number;
  setWeek: (w: number) => void;
  accountId: string;
  start: string;
  end: string;
  refreshKey: number;
  bumpRefresh: () => void;
}

export function useReportControls(): ReportControls {
  const [clients, setClients] = useState<ReportClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [mode, setMode] = useState<RangeMode>("custom");
  const [customStart, setCustomStart] = useState(() => getFirstDayOfCurrentMonth(new Date()));
  const [customEnd, setCustomEnd] = useState(() => formatDate(new Date()));
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [week, setWeek] = useState(() => getWeekNumber(new Date()));
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setClientsLoading(true);
    fetch("/api/clients")
      .then((r) => r.json())
      .then((list: ReportClient[]) => {
        setClients(list);
        if (list.length > 0) {
          setSelectedClient((cur) => {
            const stillActive = list.some((c) => c.clientName === cur || c.clientIdCode === cur);
            return stillActive && cur ? cur : list[0].clientName;
          });
        }
        setClientsLoading(false);
      })
      .catch(() => {
        setClients([]);
        setClientsLoading(false);
      });
  }, []);

  const selectedClientObj = clients.find(
    (c) => c.clientName === selectedClient || c.clientIdCode === selectedClient,
  );
  const accountId = selectedClientObj?.rawData?.IntentwiseID?.trim() ?? "";
  const { start, end } = useMemo(
    () => resolveRange(mode, { customStart, customEnd, year, week }),
    [mode, customStart, customEnd, year, week],
  );

  return {
    clients, clientsLoading, selectedClient, setSelectedClient,
    mode, setMode, customStart, setCustomStart, customEnd, setCustomEnd,
    year, setYear, week, setWeek,
    accountId, start, end,
    refreshKey, bumpRefresh: () => setRefreshKey((k) => k + 1),
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors (only the 2 known pre-existing ones).

- [ ] **Step 3: Commit** (on explicit user OK)

```bash
git add src/components/reports/v2/use-report-controls.ts
git commit -m "feat(reports-v2): useReportControls hook — clients + date range + refreshKey (phase 7)"
```

---

### Task 3: `<ReportsControlsBar>` presentational strip

**Files:**
- Create: `src/components/reports/v2/reports-controls-bar.tsx`

**Interfaces:**
- Consumes: `ReportControls` (Task 2), `getSurfacePalette` + `Surface` (`./primitives/palette`), `DatePicker` (`@/components/ui/date-picker`), `RefreshButton` (`@/components/reports/refresh-button`).
- Produces: `ReportsControlsBar(props: { surface: Surface; controls: ReportControls }): JSX.Element`.

Reproduces the current header controls' behavior (`src/app/reports/page.tsx:238-345`) as a v2-styled strip: client `<select>`, Week/Custom toggle, week+year selectors OR two `DatePicker`s, then `<RefreshButton section="overview" accountId start end onRefreshed={controls.bumpRefresh} />`. Accent (active toggle bg, focus ring) uses `getSurfacePalette(surface).accent`. 3-state client select: loading → disabled placeholder; empty → disabled "No clients available"; populated → options.

- [ ] **Step 1: Write the implementation** (DOM component — tsc + dogfood, no fake asserts)

```tsx
"use client";
import { getSurfacePalette, type Surface } from "./primitives/palette";
import { DatePicker } from "@/components/ui/date-picker";
import { RefreshButton } from "@/components/reports/refresh-button";
import type { ReportControls } from "./use-report-controls";

export function ReportsControlsBar({ surface, controls }: { surface: Surface; controls: ReportControls }) {
  const palette = getSurfacePalette(surface);
  const {
    clients, clientsLoading, selectedClient, setSelectedClient,
    mode, setMode, customStart, setCustomStart, customEnd, setCustomEnd,
    year, setYear, week, setWeek, accountId, start, end, bumpRefresh,
  } = controls;
  const hub = surface === "hub";
  const chrome = hub ? "text-white/80" : "text-mf-ink";
  const fieldCls = "bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs font-bold focus:outline-none";
  const toggleBase = "px-2.5 py-1 rounded-md text-xs font-bold transition-all";

  return (
    <div className={`flex flex-wrap items-center gap-2.5 ${chrome}`}>
      <span className="text-[15px] font-bold tracking-tight">
        Client<span style={{ color: palette.accent }}>Reports</span>
      </span>
      <span className="opacity-40">·</span>

      {/* Client select — 3 states */}
      <select
        value={selectedClient}
        onChange={(e) => setSelectedClient(e.target.value)}
        disabled={clientsLoading || clients.length === 0}
        className={fieldCls}
        style={{ color: hub ? "#fff" : undefined }}
      >
        {clientsLoading && <option>Loading clients…</option>}
        {!clientsLoading && clients.length === 0 && <option>No clients available</option>}
        {!clientsLoading &&
          clients.map((c) => (
            <option key={c.clientIdCode} value={c.clientName} style={{ color: "#111" }}>
              {c.clientName}
            </option>
          ))}
      </select>

      <span className="opacity-30">|</span>

      {/* Week / Custom toggle */}
      <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/10 border border-white/15">
        {(["week", "custom"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={toggleBase}
            style={mode === m ? { background: palette.accent, color: "#fff" } : { opacity: 0.7 }}
          >
            {m === "week" ? "Week" : "Custom"}
          </button>
        ))}
      </div>

      {mode === "week" ? (
        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${fieldCls} tabular-nums`}>
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
              <option key={y} value={y} style={{ color: "#111" }}>{y}</option>
            ))}
          </select>
          <select value={week} onChange={(e) => setWeek(Number(e.target.value))} className={`${fieldCls} tabular-nums`}>
            {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w} style={{ color: "#111" }}>W{w}</option>
            ))}
          </select>
          <span className="text-xs tabular-nums opacity-70">{start} – {end}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <DatePicker value={customStart} onChange={setCustomStart} className="h-7 text-xs font-bold" />
          <span className="opacity-40">–</span>
          <DatePicker value={customEnd} onChange={setCustomEnd} className="h-7 text-xs font-bold" />
        </div>
      )}

      <span className="opacity-30">|</span>

      <RefreshButton section="overview" accountId={accountId} start={start} end={end} onRefreshed={bumpRefresh} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 3: Commit** (on explicit user OK)

```bash
git add src/components/reports/v2/reports-controls-bar.tsx
git commit -m "feat(reports-v2): ReportsControlsBar — v2-styled client + date + refresh strip (phase 7)"
```

---

### Task 4: Wire controls into the v2 preview page

**Files:**
- Modify: `src/app/reports/v2-preview/page.tsx` (replace whole file)

**Interfaces:**
- Consumes: `useReportControls` (Task 2), `ReportsControlsBar` (Task 3), `PerformanceOverviewV2` (existing).

One shared `useReportControls()` drives ONE `<ReportsControlsBar surface="hub">` and feeds identical `{accountId,start,end,refreshKey}` into both hub + portal shells. Removes hardcoded `1707700` + month-to-date.

- [ ] **Step 1: Replace the file**

```tsx
"use client";
import { useReportControls } from "@/components/reports/v2/use-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { PerformanceOverviewV2 } from "@/components/reports/v2/performance-overview-v2";

// DEV-ONLY preview of the v2 redesign. Not linked in nav. Removed at phase-8 swap.
// Phase 7: live controls — one shared ReportsControlsBar drives both surfaces.
export default function ReportsV2PreviewPage() {
  const controls = useReportControls();
  const { accountId, start, end, refreshKey } = controls;
  return (
    <div>
      <div className="sticky top-0 z-20 border-b border-white/10 bg-[var(--mf-charcoal)] px-4 py-2.5">
        <ReportsControlsBar surface="hub" controls={controls} />
      </div>
      <PerformanceOverviewV2 surface="hub" accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
      <PerformanceOverviewV2 surface="portal" accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors (only the 2 known).

- [ ] **Step 3: Run the v2 test suite**

Run: `npx vitest run src/components/reports/v2/`
Expected: PASS (unchanged — no v2 test depends on the preview page).

- [ ] **Step 4: User visual dogfood**

Ask the user to open `/reports/v2-preview` in their real browser (auth-gated). Verify: client dropdown populates from `/api/clients`; changing client re-fetches both surfaces; Week/Custom toggle + date pickers change the range; Refresh re-queries and both surfaces update; portal surface shows NO orange inside its data panels. Good account: **Dr. Cuddles (1899670)**, June 2026.

- [ ] **Step 5: Commit** (on explicit user OK, after dogfood passes)

```bash
git add src/app/reports/v2-preview/page.tsx
git commit -m "feat(reports-v2): wire live controls bar into v2 preview (phase 7)"
```

---

## Self-Review

**Spec coverage:**
- Module layout (4 files + wiring) → Tasks 1-4. ✔
- Pure date lib TDD → Task 1. ✔
- `useReportControls` (client fetch, accountId derivation, resolveRange) → Task 2. ✔
- v2-styled bar, surface accent, 3-state client select → Task 3. ✔
- One shared bar drives both surfaces, remove hardcoded account → Task 4. ✔
- Refresh via existing `RefreshButton section="overview"` + `bumpRefresh` → Tasks 3-4. ✔
- Zero new endpoints; shell unchanged → honored (no shell edits). ✔
- NEVER-orange-on-portal → bar is chrome with `surface` prop; portal data panels untouched. ✔
- Testing: TDD pure lib; DOM by tsc + dogfood → Tasks 1-4. ✔
- Non-goals (no old-page refactor, no phase-8 swap) → respected. ✔

**Placeholder scan:** No TBD/TODO; all steps have real code. ✔

**Type consistency:** `ReportControls` / `ReportClient` defined in Task 2, consumed by name in Tasks 3-4. `resolveRange`/`RangeMode` defined Task 1, consumed Task 2. `RefreshButton` prop names (`section, accountId, start, end, onRefreshed`) match `refresh-button.tsx`. `DatePicker` props (`value, onChange, className`) match `date-picker.tsx`. ✔
