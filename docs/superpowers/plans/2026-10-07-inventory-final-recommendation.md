# Inventory Final Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/sales-summary/inventory` one per-SKU **Final** number (per-client method + override + note), a "Mark as sent" snapshot that the portal shows and that exports to xlsx, and a decluttered table — so the team can retire its 30-tab spreadsheet.

**Architecture:** Pure, unit-tested logic lives in `src/lib/inventory/*` (settings validation + date windows, Final maths, override/snapshot validation, access rules, xlsx rows). Thin API routes wrap it. A new `/api/sales-summary/inventory/windows` endpoint returns per-SKU units for the client's chosen recent/seasonal windows, so the existing cron-warmed `/api/sales-summary/inventory` route and its cache stay untouched. The table consumes everything through one react-query hook.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + postgres-js, Redshift (`queryRedshift`, SELECT-only), @tanstack/react-query, `xlsx` 0.18.5 (already a dependency), Vitest + jsdom, Tailwind 4 per DESIGN.md.

**Spec:** `docs/superpowers/specs/2026-10-07-inventory-final-recommendation-design.md` (approved 2026-10-07). Read it before starting.

## Global Constraints

- Work ONLY in worktree `/Users/manu/MFHub/.worktrees/thread-ag-inventory-final`, branch `thread-ag/inventory-final` (create from local `main` @ `7af2c676b` or later). Symlink `node_modules` from the main checkout. Never touch `/Users/manu/MFHub` working files.
- Local commits only. Never push, never open a PR, never ask to.
- Never apply the migration to prod. Writing the SQL + apply script is in scope; RUNNING `scripts/_apply-0119.ts` needs Manu's explicit OK.
- `git add` / `git commit` with explicit pathspecs, `-m` before `--`. Run `git rev-parse --abbrev-ref HEAD` before every commit; it must print `thread-ag/inventory-final`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Redshift is SELECT-only. Every value interpolated into Redshift SQL must have passed a strict validator in the same request.
- Dates cross module boundaries as `YYYY-MM-DD` strings, never `Date`.
- Seasonal dates: `^\d{4}-\d{2}-\d{2}$`, real calendar date, start ≤ end, span ≤ 366 days inclusive; both null or both set.
- `recent_days` integer 7–365 (default 90). `uplift_pct` integer 0–200 (default 0). Override `qty` integer, |qty| ≤ 1,000,000. Note ≤ 1,000 chars.
- Drift threshold: `|override − liveCalc| / max(|liveCalc|, 1) > 0.25` (strictly greater).
- Final maths: `shortfall = ceil(basis × 11 / 10) − stock`; `liveCalc = shortfall > 0 ? ceil(shortfall × (100 + uplift) / 100) : shortfall`; `final = override ?? liveCalc`. Uplift on the SHORTFALL, never the basis, never a negative.
- Writes (settings, overrides, snapshots) require `isEditorOrAbove(role)` → else 403. Hub reads require `isHubStaff(role)`. Portal reads: role `client`/`prospect` AND `sessionHasClient(user.clientIdCode, code)`; portal responses never contain `note` or `overrideQty`.
- Hub accent `--brand` / `text-brand` / `bg-brand`; portal accent `--portal-accent` only — no hub orange on `/portal/*`. Badges `rounded-md px-2 py-0.5 text-[9px] font-bold`; buttons/inputs `h-9 rounded-full`. Read `DESIGN.md` before any UI task.
- `localStorage` reads/writes wrapped in try/catch.
- vitest does not typecheck: after each task run `node_modules/.bin/tsc --noEmit` (background, ~2 min) and judge BY FILENAME — zero errors in files this task touched. Baseline has unrelated errors.
- Never run `next build`. Never `rm -r`/`rm -f`. Never `git checkout -- <path>`.

## Review Focus

1. **Floating-point off-by-one in ×1.1.** `Math.ceil(100 * 1.1)` is 111 in JS. Pinned in Task 3 by `basis 100, stock 0 → liveCalc 110`.
2. **SQL injection through the seasonal window.** User-typed dates reach a Redshift string. Pinned in Task 2 (validator rejects `2024-01-01' OR 1=1 --`) and Task 7 (route returns 400 and never calls `queryRedshift`).
3. **Portal leaking internal notes / other clients' snapshots.** Pinned in Task 9 (portal GET of own snapshot has no `note`/`overrideQty`; another client's code → 403).
4. **Empty or half-written snapshot.** Pinned in Task 9 (POST with 0 rows → 400) and Task 12 (Mark as sent disabled while loading, on error, or with 0 rows).
5. **Override against a live calc of 0** (division by zero / always-drifted). Pinned in Task 3 (`liveCalc 0, override 1` → not drifted; `override 2` → drifted).

---

## File map

| File | Responsibility |
|---|---|
| `drizzle/migrations/0119_inventory_final_rec.sql` | DDL (create) |
| `scripts/_apply-0119.ts` | Apply + verify DDL (create; NOT run) |
| `src/lib/db/schema.ts` | Drizzle defs: extend `inventoryRecSettings`, add 3 tables |
| `src/lib/inventory/rec-settings.ts` | `RecSettings` type, validation, date windows, method label |
| `src/lib/inventory/final-rec.ts` | Final maths, drift |
| `src/lib/inventory/access.ts` | Role/client access decisions |
| `src/lib/inventory/overrides.ts` | Override body validation, `OverrideRow` type |
| `src/lib/inventory/snapshot.ts` | Snapshot row types, totals, body validation, portal stripping |
| `src/lib/inventory/export-xlsx.ts` | xlsx rows (pure) + browser download |
| `src/app/api/inventory-rec-settings/route.ts` | Extend GET/POST |
| `src/app/api/inventory-rec-overrides/route.ts` | GET / PUT / DELETE |
| `src/app/api/sales-summary/inventory/windows/route.ts` | GET per-SKU units for windows |
| `src/app/api/inventory-rec-snapshots/route.ts` | GET list / POST create |
| `src/app/api/inventory-rec-snapshots/[id]/route.ts` | GET header + rows |
| `src/components/analytics/inventory-final/use-inventory-final.ts` | React-query hook for all of the above |
| `src/components/analytics/inventory-final/final-cell.tsx` | Final cell + inline override editor |
| `src/components/analytics/inventory-final/summary-strip.tsx` | 4 stat cards |
| `src/components/analytics/inventory-final/method-settings-modal.tsx` | Method chip + modal |
| `src/components/analytics/inventory-final/send-controls.tsx` | History menu + Mark-as-sent confirm |
| `src/components/analytics/inventory-final/column-groups.ts` | Group ids + persisted collapse state |
| `src/components/analytics/inventory-forecast-table.tsx` | Restructure; wire everything |
| `src/components/analytics/inventory-sent-snapshot.tsx` | Portal read-only snapshot view |
| `src/app/sales-summary/inventory/page.tsx`, `src/app/clients/[clientIdCode]/inventory/page.tsx` | Pass `accountIds` + `clientName` |
| `src/app/portal/sales/inventory/page.tsx` | Show latest snapshot, else current view |

---

### Task 0: Worktree

- [ ] **Step 1: Create worktree and link deps**

```bash
cd /Users/manu/MFHub && git rev-parse --abbrev-ref HEAD && git log -1 --oneline
git worktree add -b thread-ag/inventory-final .worktrees/thread-ag-inventory-final main
ln -s /Users/manu/MFHub/node_modules /Users/manu/MFHub/.worktrees/thread-ag-inventory-final/node_modules
cd /Users/manu/MFHub/.worktrees/thread-ag-inventory-final && git log -1 --oneline
```
Expected: log shows `7af2c676b` (spec commit) or a later local `main` commit.

- [ ] **Step 2: Baseline**

Run: `npx vitest run src/components/analytics/inventory-forecast-table.test.ts`
Expected: 6 passed.

- [ ] **Step 3: Pick the migration number**

Run: `ls drizzle/migrations/*.sql | tail -3` in the worktree AND `ls /Users/manu/MFHub/.worktrees/*/drizzle/migrations/*.sql 2>/dev/null | grep -o '01[0-9][0-9]_[a-z_]*' | sort -u | tail -5`
If `0119` is taken anywhere, use the next free number and substitute it for `0119` in every file name and constant in this plan.

---

### Task 1: Schema + migration

**Files:**
- Create: `drizzle/migrations/0119_inventory_final_rec.sql`
- Create: `scripts/_apply-0119.ts`
- Modify: `src/lib/db/schema.ts` (block starting `export const inventoryRecSettings = pgTable("inventory_rec_settings"`)
- Test: `src/lib/inventory/schema.test.ts`

**Interfaces:**
- Produces: drizzle tables `inventoryRecSettings` (+`method`, `recentDays`, `seasonalStart`, `seasonalEnd`, `upliftPct`), `inventoryRecOverrides`, `inventoryRecSnapshots`, `inventoryRecSnapshotRows`; types `InventoryRecOverride`, `InventoryRecSnapshot`, `InventoryRecSnapshotRow`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/inventory/schema.test.ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  inventoryRecSettings,
  inventoryRecOverrides,
  inventoryRecSnapshots,
  inventoryRecSnapshotRows,
} from "@/lib/db/schema";

const cols = (t: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(t).columns.map((c) => c.name).sort();

describe("inventory rec schema", () => {
  it("extends inventory_rec_settings additively", () => {
    expect(cols(inventoryRecSettings)).toEqual(
      ["client_id_code", "method", "pct_90d", "pct_avg", "pct_q1", "recent_days",
       "seasonal_end", "seasonal_start", "updated_at", "updated_by", "uplift_pct"].sort(),
    );
  });
  it("defines overrides", () => {
    expect(getTableConfig(inventoryRecOverrides).name).toBe("inventory_rec_overrides");
    expect(cols(inventoryRecOverrides)).toEqual(
      ["asin", "client_id_code", "id", "note", "qty", "set_at", "set_by", "sku"].sort(),
    );
  });
  it("defines snapshots and rows", () => {
    expect(cols(inventoryRecSnapshots)).toEqual(
      ["client_id_code", "id", "method", "overstock_skus", "overstock_units", "recent_days",
       "seasonal_end", "seasonal_start", "sent_at", "sent_by", "sku_count", "units_to_send",
       "uplift_pct"].sort(),
    );
    expect(cols(inventoryRecSnapshotRows)).toEqual(
      ["asin", "available", "basis_units", "final", "id", "inbound", "live_calc",
       "main_image_url", "note", "override_qty", "product_name", "reserved", "sku",
       "snapshot_id", "stock_position"].sort(),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/inventory/schema.test.ts`
Expected: FAIL — `inventoryRecOverrides` is not exported.

- [ ] **Step 3: Edit `src/lib/db/schema.ts`**

Replace the `inventoryRecSettings` block and its type line with:

```ts
export const inventoryRecSettings = pgTable("inventory_rec_settings", {
  clientIdCode: varchar("client_id_code", { length: 50 }).primaryKey(),
  // Legacy — no longer read since 0119; kept (additive-only rule).
  pct90d: integer("pct_90d").notNull().default(0),
  pctQ1: integer("pct_q1").notNull().default(0),
  pctAvg: integer("pct_avg").notNull().default(0),
  method: text("method").notNull().default("recent"), // 'recent' | 'seasonal' | 'average'
  recentDays: integer("recent_days").notNull().default(90),
  seasonalStart: text("seasonal_start"), // YYYY-MM-DD; null ⇒ same quarter last year
  seasonalEnd: text("seasonal_end"),
  upliftPct: integer("uplift_pct").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 255 }),
});

export type InventoryRecSettings = typeof inventoryRecSettings.$inferSelect;

export const inventoryRecOverrides = pgTable(
  "inventory_rec_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientIdCode: varchar("client_id_code", { length: 50 }).notNull(),
    asin: text("asin").notNull(),
    sku: text("sku").notNull(),
    qty: integer("qty").notNull(),
    note: text("note").notNull().default(""),
    setBy: varchar("set_by", { length: 255 }).notNull(),
    setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("inventory_rec_overrides_client_sku_uq").on(t.clientIdCode, t.sku)],
);
export type InventoryRecOverride = typeof inventoryRecOverrides.$inferSelect;

export const inventoryRecSnapshots = pgTable(
  "inventory_rec_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientIdCode: varchar("client_id_code", { length: 50 }).notNull(),
    sentBy: varchar("sent_by", { length: 255 }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    method: text("method").notNull(),
    recentDays: integer("recent_days").notNull(),
    seasonalStart: text("seasonal_start"),
    seasonalEnd: text("seasonal_end"),
    upliftPct: integer("uplift_pct").notNull(),
    skuCount: integer("sku_count").notNull(),
    unitsToSend: integer("units_to_send").notNull(),
    overstockSkus: integer("overstock_skus").notNull(),
    overstockUnits: integer("overstock_units").notNull(),
  },
  (t) => [index("inventory_rec_snapshots_client_sent_idx").on(t.clientIdCode, t.sentAt)],
);
export type InventoryRecSnapshot = typeof inventoryRecSnapshots.$inferSelect;

export const inventoryRecSnapshotRows = pgTable(
  "inventory_rec_snapshot_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => inventoryRecSnapshots.id, { onDelete: "cascade" }),
    asin: text("asin").notNull(),
    sku: text("sku").notNull(),
    productName: text("product_name").notNull().default(""),
    mainImageUrl: text("main_image_url").notNull().default(""),
    available: integer("available").notNull(),
    inbound: integer("inbound").notNull(),
    reserved: integer("reserved").notNull(),
    stockPosition: integer("stock_position").notNull(),
    basisUnits: integer("basis_units").notNull(),
    liveCalc: integer("live_calc").notNull(),
    overrideQty: integer("override_qty"),
    note: text("note").notNull().default(""),
    final: integer("final").notNull(),
  },
  (t) => [index("inventory_rec_snapshot_rows_snapshot_idx").on(t.snapshotId)],
);
export type InventoryRecSnapshotRow = typeof inventoryRecSnapshotRows.$inferSelect;
```

Note `basisUnits` is stored rounded (`Math.round`) — the average method can be fractional.

- [ ] **Step 4: Write the migration**

```sql
-- drizzle/migrations/0119_inventory_final_rec.sql
--
-- Thread AG slice 1. Additive only.
--   1. inventory_rec_settings: per-client method / windows / uplift. pct_* left in place, unused.
--   2. inventory_rec_overrides: one sticky per-SKU override per client.
--   3. inventory_rec_snapshots + _rows: what was sent to the client, frozen.

ALTER TABLE "inventory_rec_settings"
  ADD COLUMN "method" text NOT NULL DEFAULT 'recent',
  ADD COLUMN "recent_days" integer NOT NULL DEFAULT 90,
  ADD COLUMN "seasonal_start" text,
  ADD COLUMN "seasonal_end" text,
  ADD COLUMN "uplift_pct" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "inventory_rec_settings"
  ADD CONSTRAINT "inventory_rec_settings_method_chk" CHECK ("method" IN ('recent', 'seasonal', 'average')),
  ADD CONSTRAINT "inventory_rec_settings_recent_days_chk" CHECK ("recent_days" BETWEEN 7 AND 365),
  ADD CONSTRAINT "inventory_rec_settings_uplift_chk" CHECK ("uplift_pct" BETWEEN 0 AND 200);
--> statement-breakpoint
CREATE TABLE "inventory_rec_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id_code" varchar(50) NOT NULL,
  "asin" text NOT NULL,
  "sku" text NOT NULL,
  "qty" integer NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "set_by" varchar(255) NOT NULL,
  "set_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_rec_overrides_client_sku_uq"
  ON "inventory_rec_overrides" ("client_id_code", "sku");
--> statement-breakpoint
CREATE TABLE "inventory_rec_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id_code" varchar(50) NOT NULL,
  "sent_by" varchar(255) NOT NULL,
  "sent_at" timestamptz NOT NULL DEFAULT now(),
  "method" text NOT NULL,
  "recent_days" integer NOT NULL,
  "seasonal_start" text,
  "seasonal_end" text,
  "uplift_pct" integer NOT NULL,
  "sku_count" integer NOT NULL,
  "units_to_send" integer NOT NULL,
  "overstock_skus" integer NOT NULL,
  "overstock_units" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "inventory_rec_snapshots_client_sent_idx"
  ON "inventory_rec_snapshots" ("client_id_code", "sent_at");
--> statement-breakpoint
CREATE TABLE "inventory_rec_snapshot_rows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "snapshot_id" uuid NOT NULL REFERENCES "inventory_rec_snapshots"("id") ON DELETE CASCADE,
  "asin" text NOT NULL,
  "sku" text NOT NULL,
  "product_name" text NOT NULL DEFAULT '',
  "main_image_url" text NOT NULL DEFAULT '',
  "available" integer NOT NULL,
  "inbound" integer NOT NULL,
  "reserved" integer NOT NULL,
  "stock_position" integer NOT NULL,
  "basis_units" integer NOT NULL,
  "live_calc" integer NOT NULL,
  "override_qty" integer,
  "note" text NOT NULL DEFAULT '',
  "final" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "inventory_rec_snapshot_rows_snapshot_idx"
  ON "inventory_rec_snapshot_rows" ("snapshot_id");
```

- [ ] **Step 5: Write the apply script**

Copy `scripts/_apply-0113.ts` to `scripts/_apply-0119.ts`. Change `const MIGRATION = "0113_order_geography_snapshot.sql";` to `const MIGRATION = "0119_inventory_final_rec.sql";`. Replace everything between the end of the retry `for` loop and `} finally {` with:

```ts
    const settingsCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'inventory_rec_settings'
    `;
    const names = settingsCols.map((c) => String(c.column_name));
    for (const col of ["method", "recent_days", "seasonal_start", "seasonal_end", "uplift_pct", "pct_90d"]) {
      if (!names.includes(col)) throw new Error(`inventory_rec_settings.${col} missing`);
    }
    for (const table of ["inventory_rec_overrides", "inventory_rec_snapshots", "inventory_rec_snapshot_rows"]) {
      const c = await sql`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = ${table}`;
      if (c[0].n === 0) throw new Error(`${table} missing`);
    }
    const uq = await sql`
      SELECT indexname FROM pg_indexes WHERE indexname = 'inventory_rec_overrides_client_sku_uq'
    `;
    if (uq.length !== 1) throw new Error("inventory_rec_overrides_client_sku_uq missing");
    console.log("0119 applied OK.");
```
Also change the message `"0113 applied OK..."` occurrences (if any remain) and nothing else. **Do NOT run this script.**

- [ ] **Step 6: Run test**

Run: `npx vitest run src/lib/inventory/schema.test.ts`
Expected: 3 passed.

- [ ] **Step 7: tsc (background), judge by filename** — zero errors in `schema.ts`, `schema.test.ts`, `_apply-0119.ts`.

- [ ] **Step 8: Commit**

```bash
git rev-parse --abbrev-ref HEAD
git add -- drizzle/migrations/0119_inventory_final_rec.sql scripts/_apply-0119.ts src/lib/db/schema.ts src/lib/inventory/schema.test.ts
git commit -m "feat(inventory): schema for Final recs, overrides and sent snapshots (0119, not applied)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- drizzle/migrations/0119_inventory_final_rec.sql scripts/_apply-0119.ts src/lib/db/schema.ts src/lib/inventory/schema.test.ts
```

---

### Task 2: Settings validation + date windows

**Files:**
- Create: `src/lib/inventory/rec-settings.ts`
- Test: `src/lib/inventory/rec-settings.test.ts`

**Interfaces:**
- Produces:
  - `type RecMethod = "recent" | "seasonal" | "average"`
  - `interface RecSettings { method: RecMethod; recentDays: number; seasonalStart: string | null; seasonalEnd: string | null; upliftPct: number }`
  - `const DEFAULT_REC_SETTINGS: RecSettings`
  - `isIsoDate(s: unknown): s is string`
  - `validateSeasonalWindow(start: unknown, end: unknown): string | null` (error message or null)
  - `validateRecSettings(body: unknown): { ok: true; value: RecSettings } | { ok: false; error: string }`
  - `sameQuarterLastYear(today: string): DateWindow` where `interface DateWindow { start: string; end: string }`
  - `recentWindow(recentDays: number, today: string): DateWindow`
  - `resolveSeasonalWindow(s: Pick<RecSettings, "seasonalStart" | "seasonalEnd">, today: string): DateWindow`
  - `describeMethod(s: RecSettings, today: string): string`
  - `todayIso(): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/inventory/rec-settings.test.ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_REC_SETTINGS, isIsoDate, validateSeasonalWindow, validateRecSettings,
  sameQuarterLastYear, recentWindow, resolveSeasonalWindow, describeMethod,
} from "./rec-settings";

describe("isIsoDate", () => {
  it("accepts real dates", () => {
    expect(isIsoDate("2024-10-01")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
  });
  it("rejects malformed, impossible and hostile input", () => {
    for (const bad of ["2024-1-01", "2025-02-29", "2025-02-30", "2024-13-01", "", null, 20241001,
      "2024-01-01' OR 1=1 --", "2024-01-01T00:00:00Z"]) {
      expect(isIsoDate(bad)).toBe(false);
    }
  });
});

describe("validateSeasonalWindow", () => {
  it("allows both null", () => expect(validateSeasonalWindow(null, null)).toBeNull());
  it("rejects only one side set", () => {
    expect(validateSeasonalWindow("2024-10-01", null)).toMatch(/both/i);
  });
  it("rejects start after end", () => {
    expect(validateSeasonalWindow("2025-01-31", "2024-10-01")).toMatch(/before/i);
  });
  it("allows exactly 366 days, rejects 367", () => {
    expect(validateSeasonalWindow("2024-01-01", "2024-12-31")).toBeNull(); // 366 (leap)
    expect(validateSeasonalWindow("2024-01-01", "2025-01-01")).toMatch(/366/);
  });
  it("rejects injection strings", () => {
    expect(validateSeasonalWindow("2024-01-01' OR 1=1 --", "2024-02-01")).not.toBeNull();
  });
});

describe("validateRecSettings", () => {
  it("accepts a full seasonal config", () => {
    const r = validateRecSettings({ method: "seasonal", recentDays: 120, seasonalStart: "2024-10-01", seasonalEnd: "2025-01-31", upliftPct: 30 });
    expect(r).toEqual({ ok: true, value: { method: "seasonal", recentDays: 120, seasonalStart: "2024-10-01", seasonalEnd: "2025-01-31", upliftPct: 30 } });
  });
  it("normalises empty strings to null", () => {
    const r = validateRecSettings({ method: "recent", recentDays: 90, seasonalStart: "", seasonalEnd: "", upliftPct: 0 });
    expect(r.ok && r.value.seasonalStart).toBeNull();
  });
  it.each([
    [{ ...DEFAULT_REC_SETTINGS, method: "magic" }, /method/],
    [{ ...DEFAULT_REC_SETTINGS, recentDays: 6 }, /recentDays/],
    [{ ...DEFAULT_REC_SETTINGS, recentDays: 90.5 }, /recentDays/],
    [{ ...DEFAULT_REC_SETTINGS, upliftPct: 201 }, /upliftPct/],
    [{ ...DEFAULT_REC_SETTINGS, upliftPct: -1 }, /upliftPct/],
    [null, /body/i],
  ])("rejects %j", (body, msg) => {
    const r = validateRecSettings(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
});

describe("windows", () => {
  it("sameQuarterLastYear matches today's route behaviour", () => {
    expect(sameQuarterLastYear("2026-10-07")).toEqual({ start: "2025-10-01", end: "2025-12-31" });
    expect(sameQuarterLastYear("2026-02-10")).toEqual({ start: "2025-01-01", end: "2025-03-31" });
    expect(sameQuarterLastYear("2025-05-01")).toEqual({ start: "2024-04-01", end: "2024-06-30" });
  });
  it("recentWindow spans recentDays back to today", () => {
    expect(recentWindow(90, "2026-10-07")).toEqual({ start: "2026-07-09", end: "2026-10-07" });
  });
  it("resolveSeasonalWindow falls back to same quarter last year", () => {
    expect(resolveSeasonalWindow({ seasonalStart: null, seasonalEnd: null }, "2026-10-07"))
      .toEqual({ start: "2025-10-01", end: "2025-12-31" });
    expect(resolveSeasonalWindow({ seasonalStart: "2024-10-01", seasonalEnd: "2025-01-31" }, "2026-10-07"))
      .toEqual({ start: "2024-10-01", end: "2025-01-31" });
  });
  it("describeMethod labels each method", () => {
    expect(describeMethod({ ...DEFAULT_REC_SETTINGS }, "2026-10-07")).toBe("Recent 90d");
    expect(describeMethod({ method: "seasonal", recentDays: 90, seasonalStart: "2024-10-01", seasonalEnd: "2025-01-31", upliftPct: 30 }, "2026-10-07"))
      .toBe("Seasonal 2024-10-01→2025-01-31 · +30%");
    expect(describeMethod({ method: "average", recentDays: 120, seasonalStart: null, seasonalEnd: null, upliftPct: 0 }, "2026-10-07"))
      .toBe("Average of 120d & 2025-10-01→2025-12-31");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/inventory/rec-settings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/inventory/rec-settings.ts
// Per-client inventory recommendation settings: validation + date windows.
// Seasonal dates end up inside Redshift SQL text, so isIsoDate is a SECURITY
// boundary, not just input hygiene — keep it strict.

export type RecMethod = "recent" | "seasonal" | "average";

export interface RecSettings {
  method: RecMethod;
  recentDays: number;
  seasonalStart: string | null;
  seasonalEnd: string | null;
  upliftPct: number;
}

export interface DateWindow {
  start: string;
  end: string;
}

export const DEFAULT_REC_SETTINGS: RecSettings = {
  method: "recent",
  recentDays: 90,
  seasonalStart: null,
  seasonalEnd: null,
  upliftPct: 0,
};

const METHODS: readonly RecMethod[] = ["recent", "seasonal", "average"];
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !ISO_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const toMs = (s: string) => Date.parse(`${s}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function validateSeasonalWindow(start: unknown, end: unknown): string | null {
  if (start == null && end == null) return null;
  if (start == null || end == null) return "Seasonal start and end must both be set or both be empty";
  if (!isIsoDate(start) || !isIsoDate(end)) return "Seasonal dates must be YYYY-MM-DD";
  if (toMs(start) > toMs(end)) return "Seasonal start must be on or before the end";
  if ((toMs(end) - toMs(start)) / DAY_MS + 1 > 366) return "Seasonal window cannot exceed 366 days";
  return null;
}

const isIntIn = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

export function validateRecSettings(
  body: unknown,
): { ok: true; value: RecSettings } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  if (!METHODS.includes(b.method as RecMethod)) return { ok: false, error: "method must be recent, seasonal or average" };
  if (!isIntIn(b.recentDays, 7, 365)) return { ok: false, error: "recentDays must be an integer 7–365" };
  if (!isIntIn(b.upliftPct, 0, 200)) return { ok: false, error: "upliftPct must be an integer 0–200" };
  const seasonalStart = blankToNull(b.seasonalStart);
  const seasonalEnd = blankToNull(b.seasonalEnd);
  const winErr = validateSeasonalWindow(seasonalStart, seasonalEnd);
  if (winErr) return { ok: false, error: winErr };
  return {
    ok: true,
    value: {
      method: b.method as RecMethod,
      recentDays: b.recentDays,
      seasonalStart: seasonalStart as string | null,
      seasonalEnd: seasonalEnd as string | null,
      upliftPct: b.upliftPct,
    },
  };
}

export function sameQuarterLastYear(today: string): DateWindow {
  const y = Number(today.slice(0, 4)) - 1;
  const q = Math.ceil(Number(today.slice(5, 7)) / 3);
  const startMonth = (q - 1) * 3; // 0-based
  return {
    start: fromMs(Date.UTC(y, startMonth, 1)),
    end: fromMs(Date.UTC(y, startMonth + 3, 0)),
  };
}

export function recentWindow(recentDays: number, today: string): DateWindow {
  return { start: fromMs(toMs(today) - recentDays * DAY_MS), end: today };
}

export function resolveSeasonalWindow(
  s: Pick<RecSettings, "seasonalStart" | "seasonalEnd">,
  today: string,
): DateWindow {
  if (s.seasonalStart && s.seasonalEnd) return { start: s.seasonalStart, end: s.seasonalEnd };
  return sameQuarterLastYear(today);
}

export function describeMethod(s: RecSettings, today: string): string {
  const w = resolveSeasonalWindow(s, today);
  const seasonal = `${w.start}→${w.end}`;
  const base =
    s.method === "recent"
      ? `Recent ${s.recentDays}d`
      : s.method === "seasonal"
        ? `Seasonal ${seasonal}`
        : `Average of ${s.recentDays}d & ${seasonal}`;
  return s.upliftPct > 0 ? `${base} · +${s.upliftPct}%` : base;
}
```

- [ ] **Step 4: Run test** — `npx vitest run src/lib/inventory/rec-settings.test.ts` → all pass.
- [ ] **Step 5: tsc by filename** — zero errors in the two files.
- [ ] **Step 6: Commit** (`git add -- src/lib/inventory/rec-settings.ts src/lib/inventory/rec-settings.test.ts`, message `feat(inventory): rec settings validation and date windows`, trailer, same pathspec after `--`).

---

### Task 3: Final maths

**Files:**
- Create: `src/lib/inventory/final-rec.ts`
- Test: `src/lib/inventory/final-rec.test.ts`

**Interfaces:**
- Consumes: `RecMethod`, `RecSettings` from Task 2.
- Produces:
  - `interface FinalRecInput { recentUnits: number; seasonalUnits: number; stock: number }`
  - `interface FinalRec { basis: number; liveCalc: number; final: number; overridden: boolean; isOverstock: boolean; drifted: boolean }`
  - `basisFor(method: RecMethod, recentUnits: number, seasonalUnits: number): number`
  - `liveCalcFor(basis: number, stock: number, upliftPct: number): number`
  - `isDrifted(overrideQty: number, liveCalc: number): boolean`
  - `finalRec(s: Pick<RecSettings, "method" | "upliftPct">, input: FinalRecInput, override: { qty: number } | null): FinalRec`
  - `const DRIFT_THRESHOLD = 0.25`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/inventory/final-rec.test.ts
import { describe, it, expect } from "vitest";
import { basisFor, liveCalcFor, isDrifted, finalRec } from "./final-rec";

describe("basisFor", () => {
  it("picks per method", () => {
    expect(basisFor("recent", 300, 900)).toBe(300);
    expect(basisFor("seasonal", 300, 900)).toBe(900);
    expect(basisFor("average", 300, 900)).toBe(600);
  });
  it("average ignores a zero side (matches today's avgBasis)", () => {
    expect(basisFor("average", 0, 900)).toBe(900);
    expect(basisFor("average", 300, 0)).toBe(300);
    expect(basisFor("average", 0, 0)).toBe(0);
  });
});

describe("liveCalcFor", () => {
  it("has no floating-point off-by-one on x1.1", () => {
    expect(liveCalcFor(100, 0, 0)).toBe(110); // Math.ceil(100*1.1) would be 111
    expect(liveCalcFor(1000, 0, 0)).toBe(1100);
  });
  it("rounds fractional bases up", () => {
    expect(liveCalcFor(50.5, 0, 0)).toBe(56); // 55.55 -> 56
  });
  it("subtracts stock and keeps negatives (overstock)", () => {
    expect(liveCalcFor(100, 30, 0)).toBe(80);
    expect(liveCalcFor(100, 124, 0)).toBe(-14);
  });
  it("applies uplift to the shortfall only, never to a negative", () => {
    expect(liveCalcFor(100, 30, 30)).toBe(104); // 80 * 1.3
    expect(liveCalcFor(100, 124, 30)).toBe(-14);
  });
});

describe("isDrifted", () => {
  it("is strictly greater than 25%", () => {
    expect(isDrifted(125, 100)).toBe(false);
    expect(isDrifted(126, 100)).toBe(true);
    expect(isDrifted(75, 100)).toBe(false);
    expect(isDrifted(74, 100)).toBe(true);
  });
  it("floors the denominator at 1 when liveCalc is 0", () => {
    expect(isDrifted(0, 0)).toBe(false);
    expect(isDrifted(1, 0)).toBe(true); // |1-0|/1 = 1 > .25
  });
  it("handles negative live calcs", () => {
    expect(isDrifted(-14, -14)).toBe(false);
    expect(isDrifted(0, -14)).toBe(true);
  });
});

describe("finalRec", () => {
  const s = { method: "recent" as const, upliftPct: 0 };
  it("uses liveCalc without an override", () => {
    expect(finalRec(s, { recentUnits: 100, seasonalUnits: 0, stock: 30 }, null)).toEqual({
      basis: 100, liveCalc: 80, final: 80, overridden: false, isOverstock: false, drifted: false,
    });
  });
  it("override wins and is flagged when drifted", () => {
    const r = finalRec(s, { recentUnits: 100, seasonalUnits: 0, stock: 30 }, { qty: 200 });
    expect(r.final).toBe(200);
    expect(r.overridden).toBe(true);
    expect(r.drifted).toBe(true);
  });
  it("negative final is overstock, incl. an override of a negative", () => {
    expect(finalRec(s, { recentUnits: 100, seasonalUnits: 0, stock: 124 }, null).isOverstock).toBe(true);
    expect(finalRec(s, { recentUnits: 100, seasonalUnits: 0, stock: 0 }, { qty: -5 }).isOverstock).toBe(true);
  });
  it("zero-sales SKU with stock is overstock by its stock", () => {
    expect(finalRec(s, { recentUnits: 0, seasonalUnits: 0, stock: 40 }, null).final).toBe(-40);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/inventory/final-rec.ts
// The ONE number per SKU the team sends. Integer maths on purpose:
// Math.ceil(100 * 1.1) === 111 in JS, so x1.1 is written as *11/10.
import type { RecMethod, RecSettings } from "./rec-settings";

export const DRIFT_THRESHOLD = 0.25;

export interface FinalRecInput {
  recentUnits: number;
  seasonalUnits: number;
  stock: number;
}

export interface FinalRec {
  basis: number;
  liveCalc: number;
  final: number;
  overridden: boolean;
  isOverstock: boolean;
  drifted: boolean;
}

export function basisFor(method: RecMethod, recentUnits: number, seasonalUnits: number): number {
  if (method === "recent") return recentUnits;
  if (method === "seasonal") return seasonalUnits;
  const sides = [recentUnits, seasonalUnits].filter((v) => v > 0);
  return sides.length === 0 ? 0 : sides.reduce((a, b) => a + b, 0) / sides.length;
}

export function liveCalcFor(basis: number, stock: number, upliftPct: number): number {
  const shortfall = Math.ceil((basis * 11) / 10) - stock;
  return shortfall > 0 ? Math.ceil((shortfall * (100 + upliftPct)) / 100) : shortfall;
}

export function isDrifted(overrideQty: number, liveCalc: number): boolean {
  return Math.abs(overrideQty - liveCalc) / Math.max(Math.abs(liveCalc), 1) > DRIFT_THRESHOLD;
}

export function finalRec(
  s: Pick<RecSettings, "method" | "upliftPct">,
  input: FinalRecInput,
  override: { qty: number } | null,
): FinalRec {
  const basis = basisFor(s.method, input.recentUnits, input.seasonalUnits);
  const liveCalc = liveCalcFor(basis, input.stock, s.upliftPct);
  const final = override ? override.qty : liveCalc;
  return {
    basis,
    liveCalc,
    final,
    overridden: override !== null,
    isOverstock: final < 0,
    drifted: override !== null && isDrifted(override.qty, liveCalc),
  };
}
```

Note: `(50.5 * 11) / 10` = `55.55` exactly enough for `ceil` → 56; integer bases are exact.

- [ ] **Step 4: Run test** — all pass.
- [ ] **Step 5: tsc by filename.**
- [ ] **Step 6: Commit** (`feat(inventory): Final recommendation maths`, pathspec the two files).

---

### Task 4: Access rules + override validation

**Files:**
- Create: `src/lib/inventory/access.ts`, `src/lib/inventory/overrides.ts`
- Test: `src/lib/inventory/access.test.ts`, `src/lib/inventory/overrides.test.ts`

**Interfaces:**
- Produces:
  - `interface AccessUser { role?: string | null; clientIdCode?: string | null }`
  - `canEditRecs(user: AccessUser | undefined): boolean`
  - `recReadScope(user: AccessUser | undefined, clientIdCode: string): "hub" | "portal" | null`
  - `interface OverrideInput { clientIdCode: string; asin: string; sku: string; qty: number; note: string }`
  - `interface OverrideRow { asin: string; sku: string; qty: number; note: string; setBy: string; setAt: string }` (setAt ISO string)
  - `validateOverrideBody(body: unknown): { ok: true; value: OverrideInput } | { ok: false; error: string }`
  - `isClientCode(v: unknown): v is string` (non-empty, ≤50, `^[A-Za-z0-9_-]+$`)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/inventory/access.test.ts
import { describe, it, expect } from "vitest";
import { canEditRecs, recReadScope } from "./access";

describe("canEditRecs", () => {
  it.each([["owner", true], ["super_admin", true], ["admin", true], ["editor", true],
    ["viewer", false], ["client", false], ["pending", false], [undefined, false]])(
    "%s -> %s", (role, ok) => expect(canEditRecs(role ? { role } : undefined)).toBe(ok));
});

describe("recReadScope", () => {
  it("hub staff read any client", () => {
    expect(recReadScope({ role: "viewer" }, "POO_SC_US")).toBe("hub");
  });
  it("clients read only their own codes (multi-code aware)", () => {
    const u = { role: "client", clientIdCode: "TRT_SC_US, TRS_SC_US" };
    expect(recReadScope(u, "TRS_SC_US")).toBe("portal");
    expect(recReadScope(u, "POO_SC_US")).toBeNull();
  });
  it("prospects behave like clients; pending gets nothing", () => {
    expect(recReadScope({ role: "prospect", clientIdCode: "A_1" }, "A_1")).toBe("portal");
    expect(recReadScope({ role: "pending", clientIdCode: "A_1" }, "A_1")).toBeNull();
    expect(recReadScope(undefined, "A_1")).toBeNull();
  });
});
```

```ts
// src/lib/inventory/overrides.test.ts
import { describe, it, expect } from "vitest";
import { validateOverrideBody } from "./overrides";

const ok = { clientIdCode: "POO_SC_US", asin: "B0TEST1234", sku: "SKU-1", qty: 200, note: "Client asked for 200" };

describe("validateOverrideBody", () => {
  it("accepts a valid body and trims note", () => {
    expect(validateOverrideBody({ ...ok, note: "  hi  " })).toEqual({ ok: true, value: { ...ok, note: "hi" } });
  });
  it("accepts negative and zero qty", () => {
    expect(validateOverrideBody({ ...ok, qty: -14 }).ok).toBe(true);
    expect(validateOverrideBody({ ...ok, qty: 0 }).ok).toBe(true);
  });
  it.each([
    [{ ...ok, qty: 1.5 }, /qty/],
    [{ ...ok, qty: 1_000_001 }, /qty/],
    [{ ...ok, qty: "200" }, /qty/],
    [{ ...ok, note: "x".repeat(1001) }, /note/],
    [{ ...ok, sku: "" }, /sku/],
    [{ ...ok, clientIdCode: "POO'; DROP" }, /client/i],
    [{ ...ok, note: undefined }, /note/],
  ])("rejects %j", (body, msg) => {
    const r = validateOverrideBody(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
});
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**

```ts
// src/lib/inventory/access.ts
import { isEditorOrAbove, isHubStaff } from "@/lib/roles";
import { sessionHasClient } from "@/lib/client-codes";

export interface AccessUser {
  role?: string | null;
  clientIdCode?: string | null;
}

export function canEditRecs(user: AccessUser | undefined): boolean {
  return isEditorOrAbove(user?.role);
}

/** "hub" = full data incl. notes; "portal" = stripped; null = forbidden. */
export function recReadScope(user: AccessUser | undefined, clientIdCode: string): "hub" | "portal" | null {
  if (!user) return null;
  if (isHubStaff(user.role)) return "hub";
  if ((user.role === "client" || user.role === "prospect") && sessionHasClient(user.clientIdCode, clientIdCode)) {
    return "portal";
  }
  return null;
}
```

```ts
// src/lib/inventory/overrides.ts
export interface OverrideInput {
  clientIdCode: string;
  asin: string;
  sku: string;
  qty: number;
  note: string;
}

export interface OverrideRow {
  asin: string;
  sku: string;
  qty: number;
  note: string;
  setBy: string;
  setAt: string;
}

const CODE_RE = /^[A-Za-z0-9_-]+$/;

export function isClientCode(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 50 && CODE_RE.test(v);
}

const isShortString = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

export function validateOverrideBody(
  body: unknown,
): { ok: true; value: OverrideInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  if (!isClientCode(b.clientIdCode)) return { ok: false, error: "Invalid clientIdCode" };
  if (!isShortString(b.asin, 20)) return { ok: false, error: "Invalid asin" };
  if (!isShortString(b.sku, 200)) return { ok: false, error: "Invalid sku" };
  if (typeof b.qty !== "number" || !Number.isInteger(b.qty) || Math.abs(b.qty) > 1_000_000) {
    return { ok: false, error: "qty must be an integer within ±1,000,000" };
  }
  if (typeof b.note !== "string" || b.note.length > 1000) {
    return { ok: false, error: "note must be a string of at most 1,000 characters" };
  }
  return { ok: true, value: { clientIdCode: b.clientIdCode, asin: b.asin, sku: b.sku, qty: b.qty, note: b.note.trim() } };
}
```

- [ ] **Step 4: Run tests** — all pass.
- [ ] **Step 5: tsc by filename.**
- [ ] **Step 6: Commit** (`feat(inventory): rec access rules and override validation`, 4 files).

---

### Task 5: Settings API

**Files:**
- Modify: `src/app/api/inventory-rec-settings/route.ts` (whole file)
- Test: `src/app/api/inventory-rec-settings/route.test.ts`

**Interfaces:**
- Consumes: `validateRecSettings`, `DEFAULT_REC_SETTINGS` (Task 2), `canEditRecs` (Task 4), `isClientCode` (Task 4).
- Produces: `GET /api/inventory-rec-settings?clientIdCode=X` → `RecSettings` JSON. `POST` body `{ clientIdCode, ...RecSettings }` → `{ ok: true }` | 400 `{ error }` | 403. Exported pure `toRecSettings(row: InventoryRecSettings | undefined): RecSettings`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/inventory-rec-settings/route.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const session = { user: { email: "a@x.com", role: "editor" as string } };
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn(async () => session) }));
const insertValues = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({ values: (v: unknown) => { insertValues(v); return { onConflictDoUpdate: async () => undefined }; } }),
  },
}));

import { POST, toRecSettings } from "./route";

const post = (body: unknown) =>
  POST(new NextRequest("http://x/api/inventory-rec-settings", { method: "POST", body: JSON.stringify(body) }));

const valid = { clientIdCode: "POO_SC_US", method: "seasonal", recentDays: 90, seasonalStart: "2024-10-01", seasonalEnd: "2025-01-31", upliftPct: 30 };

describe("inventory-rec-settings", () => {
  beforeEach(() => { insertValues.mockClear(); session.user.role = "editor"; });

  it("defaults when no row exists", () => {
    expect(toRecSettings(undefined)).toEqual({ method: "recent", recentDays: 90, seasonalStart: null, seasonalEnd: null, upliftPct: 0 });
  });
  it("saves a valid config", async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ method: "seasonal", seasonalStart: "2024-10-01", upliftPct: 30 }));
  });
  it("403s a viewer before touching the db", async () => {
    session.user.role = "viewer";
    expect((await post(valid)).status).toBe(403);
    expect(insertValues).not.toHaveBeenCalled();
  });
  it("400s an injection date", async () => {
    const res = await post({ ...valid, seasonalStart: "2024-10-01' OR 1=1 --" });
    expect(res.status).toBe(400);
    expect(insertValues).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `toRecSettings` not exported.

- [ ] **Step 3: Replace the route**

```ts
// src/app/api/inventory-rec-settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { inventoryRecSettings, type InventoryRecSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_REC_SETTINGS, validateRecSettings, type RecSettings, type RecMethod } from "@/lib/inventory/rec-settings";
import { canEditRecs } from "@/lib/inventory/access";
import { isClientCode } from "@/lib/inventory/overrides";

export function toRecSettings(row: InventoryRecSettings | undefined): RecSettings {
  if (!row) return { ...DEFAULT_REC_SETTINGS };
  return {
    method: row.method as RecMethod,
    recentDays: row.recentDays,
    seasonalStart: row.seasonalStart,
    seasonalEnd: row.seasonalEnd,
    upliftPct: row.upliftPct,
  };
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  if (!isClientCode(clientIdCode)) return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });

  const [row] = await db
    .select()
    .from(inventoryRecSettings)
    .where(eq(inventoryRecSettings.clientIdCode, clientIdCode))
    .limit(1);

  return NextResponse.json(toRecSettings(row));
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditRecs(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!isClientCode(body?.clientIdCode)) return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
  const parsed = validateRecSettings(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const values = { ...parsed.value, updatedAt: new Date(), updatedBy: session.user?.email ?? "" };
  await db
    .insert(inventoryRecSettings)
    .values({ clientIdCode: body.clientIdCode, ...values })
    .onConflictDoUpdate({ target: inventoryRecSettings.clientIdCode, set: values });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test** — 4 pass.
- [ ] **Step 5: tsc by filename.**
- [ ] **Step 6: Commit** (`feat(inventory): settings API stores method, windows and uplift`).

---

### Task 6: Overrides API

**Files:**
- Create: `src/app/api/inventory-rec-overrides/route.ts`
- Test: `src/app/api/inventory-rec-overrides/route.test.ts`

**Interfaces:**
- Consumes: `validateOverrideBody`, `isClientCode`, `OverrideRow` (Task 4), `canEditRecs`, `recReadScope` (Task 4).
- Produces:
  - `GET ?client=X` → `{ overrides: OverrideRow[] }` (hub scope only; else 403)
  - `PUT` body `OverrideInput` → `{ override: OverrideRow }`
  - `DELETE ?client=X&sku=Y` → `{ ok: true }`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/inventory-rec-overrides/route.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const session = { user: { email: "a@x.com", role: "editor" as string, clientIdCode: null as string | null } };
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn(async () => session) }));
const dbCalls: string[] = [];
vi.mock("@/lib/db", () => ({
  db: {
    select: () => { dbCalls.push("select"); return { from: () => ({ where: async () => [] }) }; },
    insert: () => {
      dbCalls.push("insert");
      return { values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [{ asin: "B0", sku: "S", qty: 5, note: "", setBy: "a@x.com", setAt: new Date("2026-10-07T00:00:00Z") }] }) }) };
    },
    delete: () => { dbCalls.push("delete"); return { where: async () => undefined }; },
  },
}));

import { GET, PUT, DELETE } from "./route";

const req = (url: string, init?: RequestInit) => new NextRequest(`http://x${url}`, init);
const body = { clientIdCode: "POO_SC_US", asin: "B0", sku: "S", qty: 5, note: "" };

describe("inventory-rec-overrides", () => {
  beforeEach(() => { dbCalls.length = 0; session.user.role = "editor"; session.user.clientIdCode = null; });

  it("PUT upserts and returns an ISO setAt", async () => {
    const res = await PUT(req("/api/inventory-rec-overrides", { method: "PUT", body: JSON.stringify(body) }));
    expect(res.status).toBe(200);
    expect((await res.json()).override.setAt).toBe("2026-10-07T00:00:00.000Z");
  });
  it("viewer cannot PUT or DELETE", async () => {
    session.user.role = "viewer";
    expect((await PUT(req("/api/inventory-rec-overrides", { method: "PUT", body: JSON.stringify(body) }))).status).toBe(403);
    expect((await DELETE(req("/api/inventory-rec-overrides?client=POO_SC_US&sku=S", { method: "DELETE" }))).status).toBe(403);
    expect(dbCalls).toEqual([]);
  });
  it("clients cannot read overrides (notes are internal)", async () => {
    session.user.role = "client";
    session.user.clientIdCode = "POO_SC_US";
    expect((await GET(req("/api/inventory-rec-overrides?client=POO_SC_US"))).status).toBe(403);
  });
  it("400s a bad body", async () => {
    const res = await PUT(req("/api/inventory-rec-overrides", { method: "PUT", body: JSON.stringify({ ...body, qty: 1.5 }) }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

```ts
// src/app/api/inventory-rec-overrides/route.ts
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { inventoryRecOverrides, type InventoryRecOverride } from "@/lib/db/schema";
import { canEditRecs, recReadScope } from "@/lib/inventory/access";
import { isClientCode, validateOverrideBody, type OverrideRow } from "@/lib/inventory/overrides";

const toRow = (r: Pick<InventoryRecOverride, "asin" | "sku" | "qty" | "note" | "setBy" | "setAt">): OverrideRow => ({
  asin: r.asin, sku: r.sku, qty: r.qty, note: r.note, setBy: r.setBy, setAt: new Date(r.setAt).toISOString(),
});

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = req.nextUrl.searchParams.get("client");
  if (!isClientCode(client)) return NextResponse.json({ error: "Missing client" }, { status: 400 });
  if (recReadScope(session.user, client) !== "hub") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(inventoryRecOverrides).where(eq(inventoryRecOverrides.clientIdCode, client));
  return NextResponse.json({ overrides: rows.map(toRow) });
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditRecs(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = validateOverrideBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;
  const setBy = session.user?.email ?? "";
  const now = new Date();

  const [row] = await db
    .insert(inventoryRecOverrides)
    .values({ ...v, setBy, setAt: now })
    .onConflictDoUpdate({
      target: [inventoryRecOverrides.clientIdCode, inventoryRecOverrides.sku],
      set: { asin: v.asin, qty: v.qty, note: v.note, setBy, setAt: now },
    })
    .returning();
  return NextResponse.json({ override: toRow(row) });
}

export async function DELETE(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditRecs(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const client = req.nextUrl.searchParams.get("client");
  const sku = req.nextUrl.searchParams.get("sku");
  if (!isClientCode(client) || !sku) return NextResponse.json({ error: "Missing client or sku" }, { status: 400 });

  await db
    .delete(inventoryRecOverrides)
    .where(and(eq(inventoryRecOverrides.clientIdCode, client), eq(inventoryRecOverrides.sku, sku)));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test** — 4 pass.
- [ ] **Step 5: tsc by filename.**
- [ ] **Step 6: Commit** (`feat(inventory): per-SKU override API`).

---

### Task 7: Windows API (per-SKU units for the chosen windows)

**Files:**
- Create: `src/app/api/sales-summary/inventory/windows/route.ts`
- Test: `src/app/api/sales-summary/inventory/windows/route.test.ts`

Why a new route (not a change to `/api/sales-summary/inventory`): that route's cache is warmed by the refresh-sales cron with a key of `start|end|accountIds`; per-client windows would fragment it and cold scans already time out (Thread AE). This route runs two small `product_summary` aggregates and caches under its own `cacheType`.

**Interfaces:**
- Consumes: `isIsoDate`, `validateSeasonalWindow`, `recentWindow`, `resolveSeasonalWindow`, `todayIso`, `DateWindow` (Task 2); `getCachedData`, `setCachedData` (`src/lib/sales-cache.ts`); `queryRedshift` (`src/lib/redshift.ts`); `isHubStaff` (`src/lib/roles.ts`).
- Produces: `GET ?accountIds=1,2&recentDays=90[&seasonalStart=..&seasonalEnd=..]` →
  ```ts
  interface WindowsResponse {
    recent: DateWindow;
    seasonal: DateWindow;
    units: Record<string, { recent: number; seasonal: number }>; // key `${asin}|${sku}`
  }
  ```
  Exported pure `parseWindowsParams(sp: URLSearchParams, today: string): { ok: true; ids: string[]; recent: DateWindow; seasonal: DateWindow } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/sales-summary/inventory/windows/route.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const session = { user: { role: "editor" as string } };
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn(async () => session) }));
const queryRedshift = vi.fn(async (sql: string) =>
  sql.includes("2025-10-01") ? [{ asin: "B0", sku: "S", units: "40" }] : [{ asin: "B0", sku: "S", units: "90" }]);
vi.mock("@/lib/redshift", () => ({ queryRedshift: (s: string) => queryRedshift(s) }));
vi.mock("@/lib/sales-cache", () => ({ getCachedData: vi.fn(async () => null), setCachedData: vi.fn(async () => undefined) }));

import { GET, parseWindowsParams } from "./route";

const get = (qs: string) => GET(new NextRequest(`http://x/api/sales-summary/inventory/windows?${qs}`));

describe("parseWindowsParams", () => {
  it("defaults seasonal to same quarter last year", () => {
    const r = parseWindowsParams(new URLSearchParams("accountIds=12,34&recentDays=90"), "2026-10-07");
    expect(r).toEqual({ ok: true, ids: ["12", "34"], recent: { start: "2026-07-09", end: "2026-10-07" }, seasonal: { start: "2025-10-01", end: "2025-12-31" } });
  });
  it.each([
    "accountIds=12&recentDays=90&seasonalStart=2024-10-01'--&seasonalEnd=2025-01-31",
    "accountIds=12;DROP&recentDays=90",
    "accountIds=12&recentDays=5",
    "accountIds=&recentDays=90",
  ])("rejects %s", (qs) => {
    expect(parseWindowsParams(new URLSearchParams(qs), "2026-10-07").ok).toBe(false);
  });
});

describe("GET windows", () => {
  beforeEach(() => { queryRedshift.mockClear(); session.user.role = "editor"; });

  it("returns units keyed asin|sku", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-10-07T12:00:00Z"));
    const res = await get("accountIds=12&recentDays=90");
    vi.useRealTimers();
    expect(res.status).toBe(200);
    expect((await res.json()).units).toEqual({ "B0|S": { recent: 90, seasonal: 40 } });
  });
  it("never reaches Redshift with a hostile date", async () => {
    const res = await get("accountIds=12&recentDays=90&seasonalStart=2024-10-01'%20OR%201=1%20--&seasonalEnd=2025-01-31");
    expect(res.status).toBe(400);
    expect(queryRedshift).not.toHaveBeenCalled();
  });
  it("403s clients", async () => {
    session.user.role = "client";
    expect((await get("accountIds=12&recentDays=90")).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

```ts
// src/app/api/sales-summary/inventory/windows/route.ts
// Per-SKU units for a client's chosen recent + seasonal windows. Separate from
// /api/sales-summary/inventory so that route's cron-warmed cache key stays stable.
// Every value below that reaches SQL text is validated in parseWindowsParams.
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { queryRedshift } from "@/lib/redshift";
import { getCachedData, setCachedData } from "@/lib/sales-cache";
import { isHubStaff } from "@/lib/roles";
import {
  recentWindow, resolveSeasonalWindow, todayIso, validateSeasonalWindow, type DateWindow,
} from "@/lib/inventory/rec-settings";

export const maxDuration = 120;

const PROD_TABLE = `"intentwise_ecommerce_graph"."product_summary"`;
const CACHE_TYPE = "inventory-windows";
const CACHE_VERSION = "v1";

export interface WindowsResponse {
  recent: DateWindow;
  seasonal: DateWindow;
  units: Record<string, { recent: number; seasonal: number }>;
}

export function parseWindowsParams(
  sp: URLSearchParams,
  today: string,
): { ok: true; ids: string[]; recent: DateWindow; seasonal: DateWindow } | { ok: false; error: string } {
  const ids = (sp.get("accountIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0 || ids.some((id) => !/^\d+$/.test(id))) return { ok: false, error: "Invalid accountIds" };
  const recentDays = Number(sp.get("recentDays"));
  if (!Number.isInteger(recentDays) || recentDays < 7 || recentDays > 365) {
    return { ok: false, error: "recentDays must be an integer 7–365" };
  }
  const seasonalStart = sp.get("seasonalStart") || null;
  const seasonalEnd = sp.get("seasonalEnd") || null;
  const winErr = validateSeasonalWindow(seasonalStart, seasonalEnd);
  if (winErr) return { ok: false, error: winErr };
  return {
    ok: true,
    ids,
    recent: recentWindow(recentDays, today),
    seasonal: resolveSeasonalWindow({ seasonalStart, seasonalEnd }, today),
  };
}

interface UnitsRow { asin: string; sku: string; units: string | number }

function unitsSql(idList: string, w: DateWindow): string {
  return `
    SELECT p.product AS asin, p.sku, SUM(COALESCE(p.product_quantity, 0)) AS units
    FROM ${PROD_TABLE} p
    WHERE p.account_id IN (${idList})
      AND p.report_date >= '${w.start}'::DATE
      AND p.report_date <= '${w.end}'::DATE
    GROUP BY p.product, p.sku
  `;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user?.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = parseWindowsParams(req.nextUrl.searchParams, todayIso());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { ids, recent, seasonal } = parsed;

  const cacheKey = [CACHE_VERSION, [...ids].sort().join(","), recent.start, recent.end, seasonal.start, seasonal.end].join("|");
  const cached = await getCachedData<WindowsResponse>(CACHE_TYPE, cacheKey);
  if (cached) return NextResponse.json(cached);

  const idList = ids.join(",");
  try {
    const [recentRows, seasonalRows] = await Promise.all([
      queryRedshift<UnitsRow>(unitsSql(idList, recent)),
      queryRedshift<UnitsRow>(unitsSql(idList, seasonal)),
    ]);
    const units: WindowsResponse["units"] = {};
    const slot = (r: UnitsRow) => (units[`${r.asin}|${r.sku}`] ??= { recent: 0, seasonal: 0 });
    for (const r of recentRows) slot(r).recent = Number(r.units) || 0;
    for (const r of seasonalRows) slot(r).seasonal = Number(r.units) || 0;

    const body: WindowsResponse = { recent, seasonal, units };
    await setCachedData(CACHE_TYPE, cacheKey, body);
    return NextResponse.json(body);
  } catch (e) {
    console.error("[inventory/windows] Redshift failed", e);
    return NextResponse.json({ error: "Failed to load sales windows" }, { status: 502 });
  }
}
```

Note: the test's fake mock routes by `sql.includes("2025-10-01")` — the seasonal query for today 2026-10-07 is the only one containing that date.

- [ ] **Step 4: Run test** — all pass.
- [ ] **Step 5: tsc by filename.**
- [ ] **Step 6: Commit** (`feat(inventory): sales-window units endpoint for per-client methods`).

---

### Task 8: Snapshot + export logic (pure)

**Files:**
- Create: `src/lib/inventory/snapshot.ts`, `src/lib/inventory/export-xlsx.ts`
- Test: `src/lib/inventory/snapshot.test.ts`, `src/lib/inventory/export-xlsx.test.ts`

**Interfaces:**
- Consumes: `RecSettings`, `validateRecSettings`, `describeMethod` (Task 2); `isClientCode` (Task 4).
- Produces:
  ```ts
  interface SnapshotRowInput {
    asin: string; sku: string; productName: string; mainImageUrl: string;
    available: number; inbound: number; reserved: number; stockPosition: number;
    basisUnits: number; liveCalc: number; overrideQty: number | null; note: string; final: number;
  }
  type PortalSnapshotRow = Omit<SnapshotRowInput, "overrideQty" | "note">;
  interface SnapshotTotals { skuCount: number; unitsToSend: number; overstockSkus: number; overstockUnits: number }
  interface SnapshotHeader extends SnapshotTotals, RecSettings { id: string; clientIdCode: string; sentBy: string; sentAt: string }
  summarizeRows(rows: Pick<SnapshotRowInput, "final">[]): SnapshotTotals
  validateSnapshotBody(body: unknown): { ok: true; value: { clientIdCode: string; settings: RecSettings; rows: SnapshotRowInput[] } } | { ok: false; error: string }
  toPortalRow(row: SnapshotRowInput): PortalSnapshotRow
  const MAX_SNAPSHOT_ROWS = 5000
  ```
  ```ts
  // export-xlsx.ts
  buildExportAoa(header: SnapshotHeader, clientName: string, rows: PortalSnapshotRow[], today?: string): (string | number)[][]
  exportFilename(clientIdCode: string, sentAt: string): string
  downloadSnapshotXlsx(header: SnapshotHeader, clientName: string, rows: PortalSnapshotRow[]): Promise<void>
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/inventory/snapshot.test.ts
import { describe, it, expect } from "vitest";
import { summarizeRows, validateSnapshotBody, toPortalRow, MAX_SNAPSHOT_ROWS, type SnapshotRowInput } from "./snapshot";

const row: SnapshotRowInput = {
  asin: "B0", sku: "S", productName: "Thing", mainImageUrl: "", available: 10, inbound: 5, reserved: 1,
  stockPosition: 16, basisUnits: 100, liveCalc: 94, overrideQty: 200, note: "internal", final: 200,
};
const settings = { method: "recent", recentDays: 90, seasonalStart: null, seasonalEnd: null, upliftPct: 0 };

describe("summarizeRows", () => {
  it("sums positives to send and negatives as overstock units", () => {
    expect(summarizeRows([{ final: 200 }, { final: 0 }, { final: -14 }, { final: -5 }, { final: 30 }]))
      .toEqual({ skuCount: 5, unitsToSend: 230, overstockSkus: 2, overstockUnits: 19 });
  });
});

describe("validateSnapshotBody", () => {
  it("accepts a valid body", () => {
    expect(validateSnapshotBody({ clientIdCode: "POO_SC_US", settings, rows: [row] }).ok).toBe(true);
  });
  it("rejects zero rows", () => {
    const r = validateSnapshotBody({ clientIdCode: "POO_SC_US", settings, rows: [] });
    expect(r.ok).toBe(false);
  });
  it("rejects too many rows, non-integers, bad settings", () => {
    expect(validateSnapshotBody({ clientIdCode: "POO_SC_US", settings, rows: Array(MAX_SNAPSHOT_ROWS + 1).fill(row) }).ok).toBe(false);
    expect(validateSnapshotBody({ clientIdCode: "POO_SC_US", settings, rows: [{ ...row, final: 1.5 }] }).ok).toBe(false);
    expect(validateSnapshotBody({ clientIdCode: "POO_SC_US", settings: { ...settings, upliftPct: 999 }, rows: [row] }).ok).toBe(false);
  });
});

describe("toPortalRow", () => {
  it("strips note and overrideQty", () => {
    const p = toPortalRow(row);
    expect(p).not.toHaveProperty("note");
    expect(p).not.toHaveProperty("overrideQty");
    expect(p.final).toBe(200);
  });
});
```

```ts
// src/lib/inventory/export-xlsx.test.ts
import { describe, it, expect } from "vitest";
import { buildExportAoa, exportFilename } from "./export-xlsx";

const header = {
  id: "s1", clientIdCode: "POO_SC_US", sentBy: "ana@marketfoundry.agency", sentAt: "2026-10-07T14:00:00.000Z",
  method: "seasonal" as const, recentDays: 90, seasonalStart: "2024-10-01", seasonalEnd: "2025-01-31", upliftPct: 30,
  skuCount: 2, unitsToSend: 200, overstockSkus: 1, overstockUnits: 14,
};
const rows = [
  { asin: "B1", sku: "S1", productName: "One", mainImageUrl: "", available: 1, inbound: 2, reserved: 3, stockPosition: 6, basisUnits: 100, liveCalc: 150, final: 200 },
  { asin: "B2", sku: "S2", productName: "Two", mainImageUrl: "", available: 124, inbound: 0, reserved: 0, stockPosition: 124, basisUnits: 100, liveCalc: -14, final: -14 },
];

describe("buildExportAoa", () => {
  it("title row, header row in sheet order, negatives kept, no notes", () => {
    const aoa = buildExportAoa(header, "Poochie", rows, "2026-10-07");
    expect(aoa[0][0]).toBe("Poochie — sent 2026-10-07 by ana@marketfoundry.agency · Seasonal 2024-10-01→2025-01-31 · +30%");
    expect(aoa[2]).toEqual(["Product", "ASIN", "SKU", "Available", "Inbound", "Reserved", "Stock position",
      "Units 2024-10-01→2025-01-31", "Recommendation (×1.1 +30%)", "Final"]);
    expect(aoa[3]).toEqual(["One", "B1", "S1", 1, 2, 3, 6, 100, 150, 200]);
    expect(aoa[4].at(-1)).toBe(-14);
    expect(JSON.stringify(aoa)).not.toMatch(/note|internal/i);
  });
  it("labels the recent basis by its day count", () => {
    const aoa = buildExportAoa({ ...header, method: "recent", upliftPct: 0 }, "Poochie", rows, "2026-10-07");
    expect(aoa[2][7]).toBe("Units last 90d");
    expect(aoa[2][8]).toBe("Recommendation (×1.1)");
  });
});

describe("exportFilename", () => {
  it("uses code and send date", () => {
    expect(exportFilename("POO_SC_US", "2026-10-07T14:00:00.000Z")).toBe("POO_SC_US-inventory-recommendation-2026-10-07.xlsx");
  });
});
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**

```ts
// src/lib/inventory/snapshot.ts
import { validateRecSettings, type RecSettings } from "./rec-settings";
import { isClientCode } from "./overrides";

export const MAX_SNAPSHOT_ROWS = 5000;

export interface SnapshotRowInput {
  asin: string;
  sku: string;
  productName: string;
  mainImageUrl: string;
  available: number;
  inbound: number;
  reserved: number;
  stockPosition: number;
  basisUnits: number;
  liveCalc: number;
  overrideQty: number | null;
  note: string;
  final: number;
}

export type PortalSnapshotRow = Omit<SnapshotRowInput, "overrideQty" | "note">;

export interface SnapshotTotals {
  skuCount: number;
  unitsToSend: number;
  overstockSkus: number;
  overstockUnits: number;
}

export interface SnapshotHeader extends SnapshotTotals, RecSettings {
  id: string;
  clientIdCode: string;
  sentBy: string;
  sentAt: string;
}

export function summarizeRows(rows: Pick<SnapshotRowInput, "final">[]): SnapshotTotals {
  let unitsToSend = 0, overstockSkus = 0, overstockUnits = 0;
  for (const r of rows) {
    if (r.final > 0) unitsToSend += r.final;
    if (r.final < 0) { overstockSkus += 1; overstockUnits += -r.final; }
  }
  return { skuCount: rows.length, unitsToSend, overstockSkus, overstockUnits };
}

const INT_FIELDS = ["available", "inbound", "reserved", "stockPosition", "basisUnits", "liveCalc", "final"] as const;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && Math.abs(v) <= 100_000_000;
const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

function validRow(r: unknown): r is SnapshotRowInput {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return (
    isStr(o.asin, 20) && o.asin.length > 0 &&
    isStr(o.sku, 200) && o.sku.length > 0 &&
    isStr(o.productName, 1000) && isStr(o.mainImageUrl, 2000) && isStr(o.note, 1000) &&
    INT_FIELDS.every((k) => isInt(o[k])) &&
    (o.overrideQty === null || isInt(o.overrideQty))
  );
}

export function validateSnapshotBody(
  body: unknown,
): { ok: true; value: { clientIdCode: string; settings: RecSettings; rows: SnapshotRowInput[] } } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  if (!isClientCode(b.clientIdCode)) return { ok: false, error: "Invalid clientIdCode" };
  const s = validateRecSettings(b.settings);
  if (!s.ok) return { ok: false, error: s.error };
  if (!Array.isArray(b.rows) || b.rows.length === 0) return { ok: false, error: "A snapshot needs at least one row" };
  if (b.rows.length > MAX_SNAPSHOT_ROWS) return { ok: false, error: `At most ${MAX_SNAPSHOT_ROWS} rows` };
  if (!b.rows.every(validRow)) return { ok: false, error: "Invalid snapshot row" };
  return { ok: true, value: { clientIdCode: b.clientIdCode, settings: s.value, rows: b.rows as SnapshotRowInput[] } };
}

export function toPortalRow(row: SnapshotRowInput): PortalSnapshotRow {
  const { overrideQty: _o, note: _n, ...rest } = row;
  void _o; void _n;
  return rest;
}
```

```ts
// src/lib/inventory/export-xlsx.ts
// The file the team attaches to their client email. Built from SNAPSHOT rows
// only, never live data, and never contains internal notes.
import { describeMethod } from "./rec-settings";
import type { PortalSnapshotRow, SnapshotHeader } from "./snapshot";

const sendDate = (sentAt: string) => sentAt.slice(0, 10);

function basisLabel(h: SnapshotHeader, today: string): string {
  if (h.method === "recent") return `Units last ${h.recentDays}d`;
  const label = describeMethod({ ...h, upliftPct: 0 }, today); // "Seasonal a→b" | "Average of Nd & a→b"
  return h.method === "seasonal" ? `Units ${label.replace("Seasonal ", "")}` : `Units (avg) ${label.replace("Average of ", "")}`;
}

export function buildExportAoa(
  header: SnapshotHeader,
  clientName: string,
  rows: PortalSnapshotRow[],
  today: string = sendDate(header.sentAt),
): (string | number)[][] {
  const title = `${clientName} — sent ${sendDate(header.sentAt)} by ${header.sentBy} · ${describeMethod(header, today)}`;
  const recLabel = header.upliftPct > 0 ? `Recommendation (×1.1 +${header.upliftPct}%)` : "Recommendation (×1.1)";
  return [
    [title],
    [],
    ["Product", "ASIN", "SKU", "Available", "Inbound", "Reserved", "Stock position", basisLabel(header, today), recLabel, "Final"],
    ...rows.map((r) => [r.productName, r.asin, r.sku, r.available, r.inbound, r.reserved, r.stockPosition, r.basisUnits, r.liveCalc, r.final]),
  ];
}

export function exportFilename(clientIdCode: string, sentAt: string): string {
  return `${clientIdCode}-inventory-recommendation-${sendDate(sentAt)}.xlsx`;
}

export async function downloadSnapshotXlsx(header: SnapshotHeader, clientName: string, rows: PortalSnapshotRow[]): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(buildExportAoa(header, clientName, rows));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Recommendation");
  XLSX.writeFile(wb, exportFilename(header.clientIdCode, header.sentAt));
}
```

Note on `basisLabel`: the "same quarter last year" default is resolved against the send date (`today` defaults to `sentAt`'s date) so a re-download months later labels the window that was actually used.

- [ ] **Step 4: Run tests** — all pass.
- [ ] **Step 5: tsc by filename.**
- [ ] **Step 6: Commit** (`feat(inventory): snapshot validation and xlsx export rows`).

---

### Task 9: Snapshot APIs

**Files:**
- Create: `src/app/api/inventory-rec-snapshots/route.ts`, `src/app/api/inventory-rec-snapshots/[id]/route.ts`
- Test: `src/app/api/inventory-rec-snapshots/route.test.ts`

**Interfaces:**
- Consumes: `validateSnapshotBody`, `summarizeRows`, `toPortalRow`, `SnapshotHeader`, `SnapshotRowInput`, `PortalSnapshotRow` (Task 8); `canEditRecs`, `recReadScope` (Task 4); `isClientCode` (Task 4).
- Produces:
  - `GET /api/inventory-rec-snapshots?client=X` → `{ snapshots: SnapshotHeader[] }` newest first, max 50. Hub or portal scope; portal gets the same headers but `sentBy` replaced with `""`.
  - `POST /api/inventory-rec-snapshots` body `{ clientIdCode, settings, rows }` → `{ snapshot: SnapshotHeader }`.
  - `GET /api/inventory-rec-snapshots/[id]` → `{ snapshot: SnapshotHeader; rows: SnapshotRowInput[] | PortalSnapshotRow[] }` (portal scope ⇒ `toPortalRow`).
  - Exported pure `toHeader(r: InventoryRecSnapshot): SnapshotHeader`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/inventory-rec-snapshots/route.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const session = { user: { email: "a@x.com", role: "editor" as string, clientIdCode: null as string | null } };
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn(async () => session) }));

const header = {
  id: "11111111-1111-1111-1111-111111111111", clientIdCode: "POO_SC_US", sentBy: "a@x.com",
  sentAt: new Date("2026-10-07T14:00:00Z"), method: "recent", recentDays: 90, seasonalStart: null, seasonalEnd: null,
  upliftPct: 0, skuCount: 1, unitsToSend: 200, overstockSkus: 0, overstockUnits: 0,
};
const storedRow = { id: "r1", snapshotId: header.id, asin: "B0", sku: "S", productName: "T", mainImageUrl: "",
  available: 1, inbound: 0, reserved: 0, stockPosition: 1, basisUnits: 100, liveCalc: 109, overrideQty: 200, note: "internal", final: 200 };

const txInserts: unknown[] = [];
const selectQueue: unknown[][] = [];
const chain = () => {
  const c: Record<string, unknown> = {};
  for (const k of ["from", "where", "orderBy"]) c[k] = () => c;
  c.limit = async () => selectQueue.shift() ?? [];
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(selectQueue.shift() ?? []).then(res);
  return c;
};
vi.mock("@/lib/db", () => ({
  db: {
    select: () => chain(),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        insert: () => ({
          values: (v: unknown) => {
            txInserts.push(v);
            return { returning: async () => [header] };
          },
        }),
      }),
  },
}));

import { GET, POST } from "./route";
import { GET as GET_ONE } from "./[id]/route";

const rowIn = { asin: "B0", sku: "S", productName: "T", mainImageUrl: "", available: 1, inbound: 0, reserved: 0,
  stockPosition: 1, basisUnits: 100, liveCalc: 109, overrideQty: 200, note: "internal", final: 200 };
const settings = { method: "recent", recentDays: 90, seasonalStart: null, seasonalEnd: null, upliftPct: 0 };
const post = (b: unknown) => POST(new NextRequest("http://x/api/inventory-rec-snapshots", { method: "POST", body: JSON.stringify(b) }));
const getOne = () => GET_ONE(new NextRequest(`http://x/api/inventory-rec-snapshots/${header.id}`), { params: Promise.resolve({ id: header.id }) });

describe("inventory-rec-snapshots", () => {
  beforeEach(() => { txInserts.length = 0; selectQueue.length = 0; session.user.role = "editor"; session.user.clientIdCode = null; });

  it("POST writes header with server-computed totals and rows in one transaction", async () => {
    const res = await post({ clientIdCode: "POO_SC_US", settings, rows: [rowIn] });
    expect(res.status).toBe(200);
    expect(txInserts[0]).toMatchObject({ clientIdCode: "POO_SC_US", sentBy: "a@x.com", unitsToSend: 200, skuCount: 1 });
    expect(txInserts[1]).toEqual([expect.objectContaining({ snapshotId: header.id, final: 200, note: "internal" })]);
  });
  it("POST 400s zero rows and 403s viewers", async () => {
    expect((await post({ clientIdCode: "POO_SC_US", settings, rows: [] })).status).toBe(400);
    session.user.role = "viewer";
    expect((await post({ clientIdCode: "POO_SC_US", settings, rows: [rowIn] })).status).toBe(403);
    expect(txInserts).toEqual([]);
  });
  it("portal client gets their snapshot without note/overrideQty", async () => {
    session.user.role = "client";
    session.user.clientIdCode = "POO_SC_US";
    selectQueue.push([header], [storedRow]);
    const body = await (await getOne()).json();
    expect(body.rows[0]).not.toHaveProperty("note");
    expect(body.rows[0]).not.toHaveProperty("overrideQty");
    expect(body.snapshot.sentBy).toBe("");
  });
  it("portal client cannot read another client's snapshot", async () => {
    session.user.role = "client";
    session.user.clientIdCode = "OTHER_SC_US";
    selectQueue.push([header]);
    expect((await getOne()).status).toBe(403);
  });
  it("hub list returns ISO sentAt", async () => {
    selectQueue.push([header]);
    const body = await (await GET(new NextRequest("http://x/api/inventory-rec-snapshots?client=POO_SC_US"))).json();
    expect(body.snapshots[0].sentAt).toBe("2026-10-07T14:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

```ts
// src/app/api/inventory-rec-snapshots/route.ts
import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { inventoryRecSnapshots, inventoryRecSnapshotRows, type InventoryRecSnapshot } from "@/lib/db/schema";
import { canEditRecs, recReadScope } from "@/lib/inventory/access";
import { isClientCode } from "@/lib/inventory/overrides";
import { summarizeRows, validateSnapshotBody, type SnapshotHeader } from "@/lib/inventory/snapshot";
import type { RecMethod } from "@/lib/inventory/rec-settings";

export function toHeader(r: InventoryRecSnapshot): SnapshotHeader {
  return {
    id: r.id, clientIdCode: r.clientIdCode, sentBy: r.sentBy, sentAt: new Date(r.sentAt).toISOString(),
    method: r.method as RecMethod, recentDays: r.recentDays, seasonalStart: r.seasonalStart, seasonalEnd: r.seasonalEnd,
    upliftPct: r.upliftPct, skuCount: r.skuCount, unitsToSend: r.unitsToSend,
    overstockSkus: r.overstockSkus, overstockUnits: r.overstockUnits,
  };
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = req.nextUrl.searchParams.get("client");
  if (!isClientCode(client)) return NextResponse.json({ error: "Missing client" }, { status: 400 });
  const scope = recReadScope(session.user, client);
  if (!scope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select()
    .from(inventoryRecSnapshots)
    .where(eq(inventoryRecSnapshots.clientIdCode, client))
    .orderBy(desc(inventoryRecSnapshots.sentAt))
    .limit(50);
  const snapshots = rows.map(toHeader).map((h) => (scope === "portal" ? { ...h, sentBy: "" } : h));
  return NextResponse.json({ snapshots });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditRecs(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = validateSnapshotBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { clientIdCode, settings, rows } = parsed.value;
  const totals = summarizeRows(rows); // server-computed, never trusted from the browser

  try {
    const header = await db.transaction(async (tx) => {
      const [h] = await tx
        .insert(inventoryRecSnapshots)
        .values({ clientIdCode, sentBy: session.user?.email ?? "", ...settings, ...totals })
        .returning();
      await tx.insert(inventoryRecSnapshotRows).values(rows.map((r) => ({ ...r, snapshotId: h.id })));
      return h;
    });
    return NextResponse.json({ snapshot: toHeader(header) });
  } catch (e) {
    console.error("[inventory-rec-snapshots] insert failed", e);
    return NextResponse.json({ error: "Could not save the snapshot" }, { status: 500 });
  }
}
```

Note: the mock's row insert returns an object with `returning`, but this code `await`s `tx.insert(...).values(...)` directly — awaiting a non-thenable object is fine.

```ts
// src/app/api/inventory-rec-snapshots/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { inventoryRecSnapshots, inventoryRecSnapshotRows } from "@/lib/db/schema";
import { recReadScope } from "@/lib/inventory/access";
import { toPortalRow, type SnapshotRowInput } from "@/lib/inventory/snapshot";
import { toHeader } from "../route";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [h] = await db.select().from(inventoryRecSnapshots).where(eq(inventoryRecSnapshots.id, id)).limit(1);
  if (!h) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scope = recReadScope(session.user, h.clientIdCode);
  if (!scope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stored = await db.select().from(inventoryRecSnapshotRows).where(eq(inventoryRecSnapshotRows.snapshotId, id));
  const rows: SnapshotRowInput[] = stored.map(({ id: _id, snapshotId: _s, ...r }) => { void _id; void _s; return r; });
  const header = toHeader(h);
  return NextResponse.json(
    scope === "portal"
      ? { snapshot: { ...header, sentBy: "" }, rows: rows.map(toPortalRow) }
      : { snapshot: header, rows },
  );
}
```

The test's `chain()` `select` mock: the header lookup ends in `.limit(1)`; the rows lookup ends in `.where(...)` and is awaited (thenable). Both consume `selectQueue` in order.

- [ ] **Step 4: Run test** — 5 pass.
- [ ] **Step 5: tsc by filename** (incl. `[id]/route.ts`).
- [ ] **Step 6: Commit** (`feat(inventory): sent-snapshot APIs with portal stripping`, 3 files).

---

### Task 10: Client hook

**Files:**
- Create: `src/components/analytics/inventory-final/use-inventory-final.ts`
- Test: `src/components/analytics/inventory-final/use-inventory-final.test.tsx`

**Interfaces:**
- Consumes: `RecSettings`, `DEFAULT_REC_SETTINGS` (Task 2); `OverrideRow` (Task 4); `WindowsResponse` (Task 7 — import type from the route file); `SnapshotHeader`, `SnapshotRowInput` (Task 8).
- Produces:
  ```ts
  function useInventoryFinal(args: { clientIdCode?: string; accountIds?: string; enabled: boolean }): {
    settings: RecSettings;
    settingsReady: boolean;
    saveSettings: (s: RecSettings) => Promise<string | null>;        // error message or null
    windows: WindowsResponse | undefined;
    windowsStatus: "idle" | "loading" | "error" | "ready";
    overrides: Map<string, OverrideRow>;                              // keyed by sku
    saveOverride: (o: { asin: string; sku: string; qty: number; note: string }) => Promise<string | null>;
    clearOverride: (sku: string) => Promise<string | null>;
    snapshots: SnapshotHeader[];
    createSnapshot: (rows: SnapshotRowInput[]) => Promise<{ snapshot: SnapshotHeader } | { error: string }>;
    loadSnapshotRows: (id: string) => Promise<SnapshotRowInput[]>;
    canEdit: boolean;                                                 // isEditorOrAbove(session role)
  }
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/analytics/inventory-final/use-inventory-final.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
const sessionRole = { value: "editor" };
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { role: sessionRole.value } }, status: "authenticated" }) }));

import { useInventoryFinal } from "./use-inventory-final";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

function mockFetch(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    return new Response(JSON.stringify(key ? routes[key] : {}), { status: 200 });
  });
}

afterEach(() => { vi.unstubAllGlobals(); sessionRole.value = "editor"; });

describe("useInventoryFinal", () => {
  it("loads settings then windows with the settings' params", async () => {
    const f = mockFetch({
      "/api/inventory-rec-settings": { method: "seasonal", recentDays: 120, seasonalStart: "2024-10-01", seasonalEnd: "2025-01-31", upliftPct: 30 },
      "/api/sales-summary/inventory/windows": { recent: { start: "a", end: "b" }, seasonal: { start: "c", end: "d" }, units: {} },
      "/api/inventory-rec-overrides": { overrides: [{ asin: "B0", sku: "S", qty: 5, note: "", setBy: "x", setAt: "2026-10-07T00:00:00.000Z" }] },
      "/api/inventory-rec-snapshots": { snapshots: [] },
    });
    vi.stubGlobal("fetch", f);
    const { result } = renderHook(() => useInventoryFinal({ clientIdCode: "POO_SC_US", accountIds: "12", enabled: true }), { wrapper });
    await waitFor(() => expect(result.current.windowsStatus).toBe("ready"));
    const windowsUrl = f.mock.calls.map((c) => c[0] as string).find((u) => u.includes("/windows"))!;
    expect(windowsUrl).toContain("recentDays=120");
    expect(windowsUrl).toContain("seasonalStart=2024-10-01");
    await waitFor(() => expect(result.current.overrides.get("S")?.qty).toBe(5));
  });

  it("does nothing when disabled (portal read-only)", async () => {
    const f = mockFetch({});
    vi.stubGlobal("fetch", f);
    const { result } = renderHook(() => useInventoryFinal({ clientIdCode: "POO_SC_US", accountIds: "12", enabled: false }), { wrapper });
    await act(async () => {});
    expect(f).not.toHaveBeenCalled();
    expect(result.current.windowsStatus).toBe("idle");
  });

  it("canEdit follows the session role", () => {
    vi.stubGlobal("fetch", mockFetch({}));
    sessionRole.value = "viewer";
    const { result } = renderHook(() => useInventoryFinal({ clientIdCode: "POO_SC_US", accountIds: "12", enabled: false }), { wrapper });
    expect(result.current.canEdit).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

```ts
// src/components/analytics/inventory-final/use-inventory-final.ts
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useCallback, useMemo } from "react";
import { isEditorOrAbove } from "@/lib/roles";
import { DEFAULT_REC_SETTINGS, type RecSettings } from "@/lib/inventory/rec-settings";
import type { OverrideRow } from "@/lib/inventory/overrides";
import type { SnapshotHeader, SnapshotRowInput } from "@/lib/inventory/snapshot";
import type { WindowsResponse } from "@/app/api/sales-summary/inventory/windows/route";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, json };
}

export function useInventoryFinal({ clientIdCode, accountIds, enabled }: { clientIdCode?: string; accountIds?: string; enabled: boolean }) {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const canEdit = isEditorOrAbove(session?.user?.role);
  const on = enabled && !!clientIdCode;
  const code = clientIdCode ?? "";

  const settingsQ = useQuery({
    queryKey: ["inv-rec-settings", code],
    queryFn: () => getJson<RecSettings>(`/api/inventory-rec-settings?clientIdCode=${encodeURIComponent(code)}`),
    enabled: on,
  });
  const settings = settingsQ.data ?? DEFAULT_REC_SETTINGS;

  const windowsParams = useMemo(() => {
    const p = new URLSearchParams({ accountIds: accountIds ?? "", recentDays: String(settings.recentDays) });
    if (settings.seasonalStart && settings.seasonalEnd) {
      p.set("seasonalStart", settings.seasonalStart);
      p.set("seasonalEnd", settings.seasonalEnd);
    }
    return p.toString();
  }, [accountIds, settings.recentDays, settings.seasonalStart, settings.seasonalEnd]);

  const windowsQ = useQuery({
    queryKey: ["inv-rec-windows", windowsParams],
    queryFn: () => getJson<WindowsResponse>(`/api/sales-summary/inventory/windows?${windowsParams}`),
    enabled: on && !!accountIds && settingsQ.isSuccess,
    staleTime: 5 * 60_000,
  });

  const overridesQ = useQuery({
    queryKey: ["inv-rec-overrides", code],
    queryFn: () => getJson<{ overrides: OverrideRow[] }>(`/api/inventory-rec-overrides?client=${encodeURIComponent(code)}`),
    enabled: on,
  });
  const overrides = useMemo(
    () => new Map((overridesQ.data?.overrides ?? []).map((o) => [o.sku, o])),
    [overridesQ.data],
  );

  const snapshotsQ = useQuery({
    queryKey: ["inv-rec-snapshots", code],
    queryFn: () => getJson<{ snapshots: SnapshotHeader[] }>(`/api/inventory-rec-snapshots?client=${encodeURIComponent(code)}`),
    enabled: on,
  });

  const saveSettings = useCallback(async (s: RecSettings) => {
    const r = await send("/api/inventory-rec-settings", "POST", { clientIdCode: code, ...s });
    if (!r.ok) return String(r.json.error ?? "Could not save settings");
    await qc.invalidateQueries({ queryKey: ["inv-rec-settings", code] });
    return null;
  }, [code, qc]);

  const saveOverride = useCallback(async (o: { asin: string; sku: string; qty: number; note: string }) => {
    const r = await send("/api/inventory-rec-overrides", "PUT", { clientIdCode: code, ...o });
    if (!r.ok) return String(r.json.error ?? "Could not save override");
    await qc.invalidateQueries({ queryKey: ["inv-rec-overrides", code] });
    return null;
  }, [code, qc]);

  const clearOverride = useCallback(async (sku: string) => {
    const r = await send(`/api/inventory-rec-overrides?client=${encodeURIComponent(code)}&sku=${encodeURIComponent(sku)}`, "DELETE");
    if (!r.ok) return String(r.json.error ?? "Could not clear override");
    await qc.invalidateQueries({ queryKey: ["inv-rec-overrides", code] });
    return null;
  }, [code, qc]);

  const createSnapshot = useCallback(async (rows: SnapshotRowInput[]) => {
    const r = await send("/api/inventory-rec-snapshots", "POST", { clientIdCode: code, settings, rows });
    if (!r.ok) return { error: String(r.json.error ?? "Could not save the snapshot") };
    await qc.invalidateQueries({ queryKey: ["inv-rec-snapshots", code] });
    return { snapshot: r.json.snapshot as SnapshotHeader };
  }, [code, settings, qc]);

  const loadSnapshotRows = useCallback(async (id: string) => {
    const r = await getJson<{ rows: SnapshotRowInput[] }>(`/api/inventory-rec-snapshots/${id}`);
    return r.rows;
  }, []);

  const windowsStatus: "idle" | "loading" | "error" | "ready" = !on
    ? "idle"
    : windowsQ.isError || settingsQ.isError
      ? "error"
      : windowsQ.isSuccess
        ? "ready"
        : "loading";

  return {
    settings,
    settingsReady: settingsQ.isSuccess,
    saveSettings,
    windows: windowsQ.data,
    windowsStatus,
    overrides,
    saveOverride,
    clearOverride,
    snapshots: snapshotsQ.data?.snapshots ?? [],
    createSnapshot,
    loadSnapshotRows,
    canEdit,
  };
}
```

- [ ] **Step 4: Run test** — 3 pass.
- [ ] **Step 5: tsc by filename.**
- [ ] **Step 6: Commit** (`feat(inventory): react-query hook for Final recs`).

---

### Task 11: Presentational pieces

Read `DESIGN.md` (Brand, Badges, Buttons, Inputs, Modals) before this task.

**Files:**
- Create: `src/components/analytics/inventory-final/final-cell.tsx`, `summary-strip.tsx`, `method-settings-modal.tsx`, `column-groups.ts`
- Test: `src/components/analytics/inventory-final/final-cell.test.tsx`, `column-groups.test.ts`, `method-settings-modal.test.tsx`

**Interfaces:**
- Consumes: `FinalRec` (Task 3), `OverrideRow` (Task 4), `RecSettings`, `describeMethod`, `validateRecSettings`, `todayIso` (Task 2), `fmtInt` (`@/lib/formatters`).
- Produces:
  - `FinalCell(props: { rec: FinalRec; override: OverrideRow | undefined; editable: boolean; onSave: (qty: number, note: string) => Promise<string | null>; onClear: () => Promise<string | null> })`
  - `SummaryStrip(props: { needsAction: number; unitsToSend: number; overstockSkus: number; overstockUnits: number; lastSent: string | null })`
  - `MethodSettingsButton(props: { settings: RecSettings; editable: boolean; onSave: (s: RecSettings) => Promise<string | null> })`
  - `type GroupId = "stock" | "sales" | "health" | "methods"`; `const GROUPS: { id: GroupId; label: string }[]`; `useCollapsedGroups(): { isOpen: (g: GroupId) => boolean; toggle: (g: GroupId) => void }`; pure `parseOpenGroups(raw: string | null): GroupId[]`

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/analytics/inventory-final/column-groups.test.ts
import { describe, it, expect } from "vitest";
import { parseOpenGroups } from "./column-groups";

describe("parseOpenGroups", () => {
  it("defaults to all collapsed", () => expect(parseOpenGroups(null)).toEqual([]));
  it("keeps only known ids", () => expect(parseOpenGroups('["sales","bogus","health"]')).toEqual(["sales", "health"]));
  it("survives garbage", () => expect(parseOpenGroups("{not json")).toEqual([]));
});
```

```tsx
// src/components/analytics/inventory-final/final-cell.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FinalCell } from "./final-cell";

const base = { basis: 100, liveCalc: 80, final: 80, overridden: false, isOverstock: false, drifted: false };

describe("FinalCell", () => {
  it("shows the number", () => {
    render(<FinalCell rec={base} override={undefined} editable={false} onSave={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("80")).toBeTruthy();
  });
  it("shows overstock badge instead of a dash", () => {
    render(<FinalCell rec={{ ...base, liveCalc: -14, final: -14, isOverstock: true }} override={undefined} editable={false} onSave={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("Overstock −14")).toBeTruthy();
  });
  it("shows override + drift badges with provenance", () => {
    render(<FinalCell rec={{ ...base, final: 200, overridden: true, drifted: true }}
      override={{ asin: "B0", sku: "S", qty: 200, note: "client ask", setBy: "ana@x.com", setAt: "2026-10-01T09:00:00.000Z" }}
      editable={false} onSave={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("override")).toBeTruthy();
    expect(screen.getByText("drift")).toBeTruthy();
    expect(screen.getByTitle(/Set by ana@x\.com on 2026-10-01 · live calc 80 · client ask/)).toBeTruthy();
  });
  it("editors can save a new value", async () => {
    const onSave = vi.fn(async () => null);
    render(<FinalCell rec={base} override={undefined} editable onSave={onSave} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /edit final/i }));
    fireEvent.change(screen.getByLabelText("Final quantity"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "promo" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(150, "promo"));
  });
  it("rejects a non-integer without calling onSave", () => {
    const onSave = vi.fn(async () => null);
    render(<FinalCell rec={base} override={undefined} editable onSave={onSave} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /edit final/i }));
    fireEvent.change(screen.getByLabelText("Final quantity"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Whole number required")).toBeTruthy();
  });
});
```

```tsx
// src/components/analytics/inventory-final/method-settings-modal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MethodSettingsButton } from "./method-settings-modal";
import { DEFAULT_REC_SETTINGS } from "@/lib/inventory/rec-settings";

describe("MethodSettingsButton", () => {
  it("blocks an invalid seasonal window client-side", async () => {
    const onSave = vi.fn(async () => null);
    render(<MethodSettingsButton settings={DEFAULT_REC_SETTINGS} editable onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /Recent 90d/ }));
    fireEvent.click(screen.getByLabelText("Seasonal window"));
    fireEvent.change(screen.getByLabelText("Seasonal start"), { target: { value: "2025-02-01" } });
    fireEvent.change(screen.getByLabelText("Seasonal end"), { target: { value: "2024-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/before/i);
  });
  it("saves a valid config", async () => {
    const onSave = vi.fn(async () => null);
    render(<MethodSettingsButton settings={DEFAULT_REC_SETTINGS} editable onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /Recent 90d/ }));
    fireEvent.change(screen.getByLabelText("Recent window (days)"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_REC_SETTINGS, recentDays: 120 }));
  });
  it("viewers see the chip but cannot open the editor", () => {
    render(<MethodSettingsButton settings={DEFAULT_REC_SETTINGS} editable={false} onSave={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Recent 90d/ })).toBeNull();
    expect(screen.getByText("Recent 90d")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**

```ts
// src/components/analytics/inventory-final/column-groups.ts
"use client";

import { useCallback, useEffect, useState } from "react";

export type GroupId = "stock" | "sales" | "health" | "methods";

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: "stock", label: "Stock detail" },
  { id: "sales", label: "Sales" },
  { id: "health", label: "Health" },
  { id: "methods", label: "All methods" },
];

const KEY = "mfhub.inventory.openGroups";
const IDS = new Set<string>(GROUPS.map((g) => g.id));

export function parseOpenGroups(raw: string | null): GroupId[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? (v.filter((x) => typeof x === "string" && IDS.has(x)) as GroupId[]) : [];
  } catch {
    return [];
  }
}

export function useCollapsedGroups() {
  const [open, setOpen] = useState<GroupId[]>([]);
  useEffect(() => {
    try { setOpen(parseOpenGroups(window.localStorage.getItem(KEY))); } catch { /* storage blocked */ }
  }, []);
  const toggle = useCallback((g: GroupId) => {
    setOpen((prev) => {
      const next = prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g];
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }, []);
  const isOpen = useCallback((g: GroupId) => open.includes(g), [open]);
  return { isOpen, toggle };
}
```

```tsx
// src/components/analytics/inventory-final/final-cell.tsx
"use client";

import { useState } from "react";
import { Pencil, StickyNote } from "lucide-react";
import { fmtInt } from "@/lib/formatters";
import type { FinalRec } from "@/lib/inventory/final-rec";
import type { OverrideRow } from "@/lib/inventory/overrides";

const BADGE = "rounded-md px-2 py-0.5 text-[9px] font-bold border";
const RED = "bg-red-50 text-red-600 border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30";
const AMBER = "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30";
const STONE = "bg-stone-200 text-stone-500 border-stone-300 dark:bg-zinc-800/50 dark:text-zinc-500 dark:border-zinc-800";

interface Props {
  rec: FinalRec;
  override: OverrideRow | undefined;
  editable: boolean;
  onSave: (qty: number, note: string) => Promise<string | null>;
  onClear: () => Promise<string | null>;
}

export function FinalCell({ rec, override, editable, onSave, onClear }: Props) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(rec.final));
  const [note, setNote] = useState(override?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const provenance = override
    ? `Set by ${override.setBy} on ${override.setAt.slice(0, 10)} · live calc ${rec.liveCalc}${override.note ? ` · ${override.note}` : ""}`
    : undefined;

  async function save() {
    const n = Number(qty);
    if (qty.trim() === "" || !Number.isInteger(n)) { setError("Whole number required"); return; }
    setBusy(true);
    const err = await onSave(n, note);
    setBusy(false);
    if (err) setError(err); else { setError(null); setEditing(false); }
  }

  async function clear() {
    setBusy(true);
    const err = await onClear();
    setBusy(false);
    if (err) setError(err); else setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex min-w-[180px] flex-col gap-1">
        <input aria-label="Final quantity" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)}
          className="h-7 rounded-full border border-stone-300 bg-white px-3 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
        <input aria-label="Note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Why?"
          className="h-7 rounded-full border border-stone-300 bg-white px-3 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
        {error && <span className="text-[10px] text-red-600 dark:text-red-400">{error}</span>}
        <div className="flex gap-1">
          <button type="button" disabled={busy} onClick={save} className="h-7 rounded-full bg-brand px-3 text-[11px] font-medium text-white hover:bg-brand-hover">Save</button>
          {override && <button type="button" disabled={busy} onClick={clear} className="h-7 rounded-full border border-stone-300 px-3 text-[11px] text-muted-foreground dark:border-zinc-700">Clear override</button>}
          <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(null); }} className="h-7 px-2 text-[11px] text-muted-foreground">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1" title={provenance}>
      {rec.isOverstock ? (
        <span className={`${BADGE} ${RED}`}>Overstock −{fmtInt(Math.abs(rec.final))}</span>
      ) : (
        <span className="font-bold tabular-nums">{fmtInt(rec.final)}</span>
      )}
      {rec.overridden && <span className={`${BADGE} ${STONE}`}>override</span>}
      {rec.drifted && <span className={`${BADGE} ${AMBER}`}>drift</span>}
      {override?.note && <StickyNote className="size-3 text-muted-foreground" aria-label="Has note" />}
      {editable && (
        <button type="button" aria-label="Edit final" onClick={() => { setQty(String(rec.final)); setNote(override?.note ?? ""); setEditing(true); }}
          className="text-muted-foreground hover:text-brand">
          <Pencil className="size-3" />
        </button>
      )}
    </div>
  );
}
```

Before relying on `fmtInt`, check its output for `80` is `"80"` and for `14` is `"14"` (read `src/lib/formatters.ts`). If `fmtInt` adds formatting that breaks the test strings, keep `fmtInt` and adjust the test's expected strings to match its real output (e.g. `"1,234"`); the tested values (80, 14) have no separators.

```tsx
// src/components/analytics/inventory-final/summary-strip.tsx
"use client";

import { fmtInt } from "@/lib/formatters";

interface Props {
  needsAction: number;
  unitsToSend: number;
  overstockSkus: number;
  overstockUnits: number;
  lastSent: string | null; // YYYY-MM-DD
}

const CARD = "rounded-[18px] border border-stone-200 bg-card px-4 py-3 dark:border-zinc-800";
const LABEL = "text-[10px] font-bold text-muted-foreground";

export function SummaryStrip({ needsAction, unitsToSend, overstockSkus, overstockUnits, lastSent }: Props) {
  const items: [string, string][] = [
    ["SKUs needing action", fmtInt(needsAction)],
    ["Units to send", fmtInt(unitsToSend)],
    ["Overstock", `${fmtInt(overstockSkus)} SKUs · ${fmtInt(overstockUnits)} units`],
    ["Last sent", lastSent ?? "Never"],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className={CARD}>
          <div className={LABEL}>{label}</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  );
}
```

```tsx
// src/components/analytics/inventory-final/method-settings-modal.tsx
"use client";

import { useState } from "react";
import { describeMethod, todayIso, validateRecSettings, type RecMethod, type RecSettings } from "@/lib/inventory/rec-settings";

const CHIP = "inline-flex h-9 items-center rounded-full border border-stone-300 px-3 text-[13px] font-medium text-muted-foreground dark:border-zinc-700";
const INPUT = "h-9 rounded-full border border-stone-300 bg-white px-4 text-sm text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
const METHOD_LABELS: [RecMethod, string][] = [["recent", "Recent sales"], ["seasonal", "Seasonal window"], ["average", "Average of both"]];

interface Props {
  settings: RecSettings;
  editable: boolean;
  onSave: (s: RecSettings) => Promise<string | null>;
}

export function MethodSettingsButton({ settings, editable, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = describeMethod(settings, todayIso());

  if (!editable) return <span className={CHIP}>{label}</span>;

  async function save() {
    const parsed = validateRecSettings(draft);
    if (!parsed.ok) { setError(parsed.error); return; }
    setBusy(true);
    const err = await onSave(parsed.value);
    setBusy(false);
    if (err) setError(err); else { setError(null); setOpen(false); }
  }

  return (
    <>
      <button type="button" className={`${CHIP} hover:bg-stone-50 dark:hover:bg-zinc-800`} onClick={() => { setDraft(settings); setError(null); setOpen(true); }}>
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm dark:bg-black/60" role="dialog" aria-modal="true" aria-label="Recommendation method">
          <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand">Recommendation method</h2>
            <fieldset className="mt-4 flex flex-col gap-2 text-sm">
              {METHOD_LABELS.map(([m, l]) => (
                <label key={m} className="flex items-center gap-2">
                  <input type="radio" name="method" aria-label={l} checked={draft.method === m} onChange={() => setDraft({ ...draft, method: m })} />
                  {l}
                </label>
              ))}
            </fieldset>
            <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] font-bold text-muted-foreground">
              <label className="flex flex-col gap-1">Recent window (days)
                <input aria-label="Recent window (days)" className={INPUT} inputMode="numeric" value={draft.recentDays}
                  onChange={(e) => setDraft({ ...draft, recentDays: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1">Uplift on shortfall (%)
                <input aria-label="Uplift (%)" className={INPUT} inputMode="numeric" value={draft.upliftPct}
                  onChange={(e) => setDraft({ ...draft, upliftPct: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1">Seasonal start
                <input aria-label="Seasonal start" type="date" className={INPUT} value={draft.seasonalStart ?? ""}
                  onChange={(e) => setDraft({ ...draft, seasonalStart: e.target.value || null })} />
              </label>
              <label className="flex flex-col gap-1">Seasonal end
                <input aria-label="Seasonal end" type="date" className={INPUT} value={draft.seasonalEnd ?? ""}
                  onChange={(e) => setDraft({ ...draft, seasonalEnd: e.target.value || null })} />
              </label>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">Leave both seasonal dates empty to use the same quarter last year.</p>
            {error && <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-9 items-center rounded-full border border-stone-300 px-3 text-[13px] font-medium text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Cancel</button>
              <button type="button" disabled={busy} onClick={save} className="inline-flex h-9 items-center rounded-full bg-brand px-3 text-[13px] font-medium text-white hover:bg-brand-hover">Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run tests** — all pass.
- [ ] **Step 5: tsc by filename.**
- [ ] **Step 6: Commit** (`feat(inventory): Final cell, summary strip, method settings, column groups`, all 7 files).

---

### Task 12: Table restructure + send controls + page wiring

Read `DESIGN.md` first. Read the whole of `src/components/analytics/inventory-forecast-table.tsx` before editing.

**Files:**
- Create: `src/components/analytics/inventory-final/send-controls.tsx`
- Create: `src/components/analytics/inventory-final/build-rows.ts`
- Modify: `src/components/analytics/inventory-forecast-table.tsx`
- Modify: `src/app/sales-summary/inventory/page.tsx`, `src/app/clients/[clientIdCode]/inventory/page.tsx`
- Test: `src/components/analytics/inventory-final/build-rows.test.ts`, `src/components/analytics/inventory-final/send-controls.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–11; existing `stockPosition` (unchanged) from `inventory-forecast-table.tsx`.
- Produces:
  ```ts
  // build-rows.ts
  interface BuildRowInput {
    asin: string; sku: string; product_name: string; main_image_url: string;
    units_90d: number; q1_quantity: number;
    current: { available: number; inbound_quantity: number; reserved_quantity: number } | null;
    health: { total_quantity: number } | null;
  }
  interface ComputedRow<P extends BuildRowInput = BuildRowInput> {
    p: P; key: string; stock: number; recentUnits: number; seasonalUnits: number;
    rec: FinalRec; override: OverrideRow | undefined;
    allMethods: { recent: number; seasonal: number; average: number };
    needsAction: boolean;
  }
  type RowFilter = "all" | "needs-action" | "overstock";
  buildRows<P extends BuildRowInput>(products: P[], settings: RecSettings, windows: WindowsResponse | undefined, overrides: Map<string, OverrideRow>, stockOf: (p: P) => number): ComputedRow<P>[]
  filterRows<P extends BuildRowInput>(rows: ComputedRow<P>[], f: RowFilter): ComputedRow<P>[]
  toSnapshotRows(rows: ComputedRow[]): SnapshotRowInput[]
  orphanedOverrides(rows: ComputedRow[], overrides: Map<string, OverrideRow>): OverrideRow[]
  ```
  ```ts
  // send-controls.tsx
  SendControls(props: {
    clientName: string; snapshots: SnapshotHeader[]; canSend: boolean; disabledReason: string | null;
    totals: SnapshotTotals;
    onSend: () => Promise<{ snapshot: SnapshotHeader; rows: PortalSnapshotRow[] } | { error: string }>;
    onDownload: (h: SnapshotHeader) => Promise<void>;
  })
  ```
  `InventoryForecastTable` gains props `accountIds?: string` and `clientName?: string`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/analytics/inventory-final/build-rows.test.ts
import { describe, it, expect } from "vitest";
import { buildRows, filterRows, toSnapshotRows, orphanedOverrides } from "./build-rows";
import { DEFAULT_REC_SETTINGS } from "@/lib/inventory/rec-settings";

const prod = (sku: string, over: Partial<{ units_90d: number; q1_quantity: number; available: number }> = {}) => ({
  asin: `B-${sku}`, sku, product_name: sku, main_image_url: "",
  units_90d: over.units_90d ?? 100, q1_quantity: over.q1_quantity ?? 0,
  current: { available: over.available ?? 0, inbound_quantity: 0, reserved_quantity: 0 },
  health: null,
});
const stockOf = (p: ReturnType<typeof prod>) => p.current.available;
const ov = (sku: string, qty: number) => ({ asin: `B-${sku}`, sku, qty, note: "n", setBy: "x", setAt: "2026-10-01T00:00:00.000Z" });

describe("buildRows", () => {
  it("falls back to units_90d / q1_quantity without windows", () => {
    const [r] = buildRows([prod("A", { units_90d: 100, q1_quantity: 300 })], DEFAULT_REC_SETTINGS, undefined, new Map(), stockOf);
    expect(r.recentUnits).toBe(100);
    expect(r.seasonalUnits).toBe(300);
    expect(r.rec.final).toBe(110);
    expect(r.allMethods).toEqual({ recent: 110, seasonal: 330, average: 220 });
  });
  it("uses windows when present (missing SKU ⇒ 0 units)", () => {
    const w = { recent: { start: "a", end: "b" }, seasonal: { start: "c", end: "d" }, units: { "B-A|A": { recent: 50, seasonal: 0 } } };
    const rows = buildRows([prod("A"), prod("B")], DEFAULT_REC_SETTINGS, w, new Map(), stockOf);
    expect(rows[0].recentUnits).toBe(50);
    expect(rows[1].recentUnits).toBe(0);
  });
  it("needsAction = positive final, drift, or overstock", () => {
    const rows = buildRows(
      [prod("SEND"), prod("OK", { available: 110 }), prod("OVER", { available: 200 }), prod("DRIFT", { available: 110 })],
      DEFAULT_REC_SETTINGS, undefined, new Map([["DRIFT", ov("DRIFT", 50)]]), stockOf,
    );
    expect(rows.map((r) => [r.p.sku, r.needsAction])).toEqual([["SEND", true], ["OK", false], ["OVER", true], ["DRIFT", true]]);
    expect(filterRows(rows, "overstock").map((r) => r.p.sku)).toEqual(["OVER"]);
    expect(filterRows(rows, "needs-action")).toHaveLength(3);
  });
});

describe("snapshot helpers", () => {
  it("toSnapshotRows rounds fractional basis and carries override + note", () => {
    const s = { ...DEFAULT_REC_SETTINGS, method: "average" as const };
    const rows = buildRows([prod("A", { units_90d: 100, q1_quantity: 1 })], s, undefined, new Map([["A", ov("A", 7)]]), stockOf);
    expect(toSnapshotRows(rows)[0]).toMatchObject({ sku: "A", basisUnits: 51, overrideQty: 7, note: "n", final: 7 });
  });
  it("orphanedOverrides finds overrides with no row", () => {
    const rows = buildRows([prod("A")], DEFAULT_REC_SETTINGS, undefined, new Map(), stockOf);
    expect(orphanedOverrides(rows, new Map([["A", ov("A", 1)], ["GONE", ov("GONE", 2)]])).map((o) => o.sku)).toEqual(["GONE"]);
  });
});
```

```tsx
// src/components/analytics/inventory-final/send-controls.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SendControls } from "./send-controls";

const totals = { skuCount: 42, unitsToSend: 3180, overstockSkus: 2, overstockUnits: 19 };

describe("SendControls", () => {
  it("is disabled with a reason", () => {
    render(<SendControls clientName="Poochie" snapshots={[]} canSend={false} disabledReason="Sales data failed to load" totals={totals} onSend={vi.fn()} onDownload={vi.fn()} />);
    const btn = screen.getByRole("button", { name: "Mark as sent" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe("Sales data failed to load");
  });
  it("confirms with counts, then sends", async () => {
    const onSend = vi.fn(async () => ({ error: "nope" }));
    render(<SendControls clientName="Poochie" snapshots={[]} canSend disabledReason={null} totals={totals} onSend={onSend} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as sent" }));
    expect(screen.getByText(/Send 42 SKUs, 3,180 units to Poochie\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
```

The `3,180` expectation assumes `fmtInt(3180)` returns `"3,180"` — check `src/lib/formatters.ts` and match its real output.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement `build-rows.ts`**

```ts
// src/components/analytics/inventory-final/build-rows.ts
import { finalRec, type FinalRec } from "@/lib/inventory/final-rec";
import type { RecSettings } from "@/lib/inventory/rec-settings";
import type { OverrideRow } from "@/lib/inventory/overrides";
import type { SnapshotRowInput } from "@/lib/inventory/snapshot";
import type { WindowsResponse } from "@/app/api/sales-summary/inventory/windows/route";

export interface BuildRowInput {
  asin: string;
  sku: string;
  product_name: string;
  main_image_url: string;
  units_90d: number;
  q1_quantity: number;
  current: { available: number; inbound_quantity: number; reserved_quantity: number } | null;
  health: { total_quantity: number } | null;
}

export interface ComputedRow<P extends BuildRowInput = BuildRowInput> {
  p: P;
  key: string;
  stock: number;
  recentUnits: number;
  seasonalUnits: number;
  rec: FinalRec;
  override: OverrideRow | undefined;
  allMethods: { recent: number; seasonal: number; average: number };
  needsAction: boolean;
}

export type RowFilter = "all" | "needs-action" | "overstock";

export function buildRows<P extends BuildRowInput>(
  products: P[],
  settings: RecSettings,
  windows: WindowsResponse | undefined,
  overrides: Map<string, OverrideRow>,
  stockOf: (p: P) => number,
): ComputedRow<P>[] {
  return products.map((p) => {
    const key = `${p.asin}|${p.sku}`;
    const w = windows?.units[key];
    const recentUnits = windows ? (w?.recent ?? 0) : p.units_90d;
    const seasonalUnits = windows ? (w?.seasonal ?? 0) : p.q1_quantity;
    const stock = stockOf(p);
    const override = overrides.get(p.sku);
    const input = { recentUnits, seasonalUnits, stock };
    const rec = finalRec(settings, input, override ?? null);
    const calc = (method: RecSettings["method"]) => finalRec({ method, upliftPct: settings.upliftPct }, input, null).liveCalc;
    return {
      p, key, stock, recentUnits, seasonalUnits, rec, override,
      allMethods: { recent: calc("recent"), seasonal: calc("seasonal"), average: calc("average") },
      needsAction: rec.final > 0 || rec.drifted || rec.isOverstock,
    };
  });
}

export function filterRows<P extends BuildRowInput>(rows: ComputedRow<P>[], f: RowFilter): ComputedRow<P>[] {
  if (f === "needs-action") return rows.filter((r) => r.needsAction);
  if (f === "overstock") return rows.filter((r) => r.rec.isOverstock);
  return rows;
}

export function toSnapshotRows(rows: ComputedRow[]): SnapshotRowInput[] {
  return rows.map(({ p, stock, rec, override }) => ({
    asin: p.asin,
    sku: p.sku,
    productName: p.product_name ?? "",
    mainImageUrl: p.main_image_url ?? "",
    available: p.current?.available ?? 0,
    inbound: p.current?.inbound_quantity ?? 0,
    reserved: p.current?.reserved_quantity ?? 0,
    stockPosition: stock,
    basisUnits: Math.round(rec.basis),
    liveCalc: rec.liveCalc,
    overrideQty: override?.qty ?? null,
    note: override?.note ?? "",
    final: rec.final,
  }));
}

export function orphanedOverrides(rows: ComputedRow[], overrides: Map<string, OverrideRow>): OverrideRow[] {
  const skus = new Set(rows.map((r) => r.p.sku));
  return [...overrides.values()].filter((o) => !skus.has(o.sku));
}
```

Note `basisUnits` for `average` of 100 and 1 is 50.5 → `Math.round` = 51 (test pins it).

- [ ] **Step 4: Implement `send-controls.tsx`**

```tsx
// src/components/analytics/inventory-final/send-controls.tsx
"use client";

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { fmtInt } from "@/lib/formatters";
import type { PortalSnapshotRow, SnapshotHeader, SnapshotTotals } from "@/lib/inventory/snapshot";

const PRIMARY = "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-3 text-[13px] font-medium leading-none text-white transition-colors hover:bg-brand-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50";
const GHOST = "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-stone-300 px-3 text-[13px] font-medium leading-none text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

interface Props {
  clientName: string;
  snapshots: SnapshotHeader[];
  canSend: boolean;
  disabledReason: string | null;
  totals: SnapshotTotals;
  onSend: () => Promise<{ snapshot: SnapshotHeader; rows: PortalSnapshotRow[] } | { error: string }>;
  onDownload: (h: SnapshotHeader) => Promise<void>;
}

export function SendControls({ clientName, snapshots, canSend, disabledReason, totals, onSend, onDownload }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = snapshots[0];

  async function confirm() {
    setBusy(true);
    setError(null);
    const r = await onSend();
    setBusy(false);
    if ("error" in r) setError(r.error);
    else setConfirming(false);
  }

  return (
    <div className="relative flex items-center gap-2">
      {snapshots.length > 0 && (
        <button type="button" className={GHOST} onClick={() => setHistoryOpen((o) => !o)}>
          Sent {last.sentAt.slice(0, 10)} by {last.sentBy.split("@")[0]} <ChevronDown className="size-3.5" />
        </button>
      )}
      {historyOpen && (
        <div className="absolute right-0 top-11 z-40 w-80 rounded-[18px] border border-stone-200 bg-card p-2 shadow-md dark:border-zinc-800">
          {snapshots.map((s) => (
            <button key={s.id} type="button" onClick={() => onDownload(s)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-muted">
              <span>{s.sentAt.slice(0, 10)} · {s.sentBy.split("@")[0]} · {fmtInt(s.unitsToSend)} units</span>
              <Download className="size-3.5 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
      <button type="button" className={PRIMARY} disabled={!canSend} title={disabledReason ?? undefined}
        onClick={() => { setError(null); setConfirming(true); }}>
        Mark as sent
      </button>
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm dark:bg-black/60" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <p className="text-sm">
              Send {fmtInt(totals.skuCount)} SKUs, {fmtInt(totals.unitsToSend)} units to {clientName}?
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              This replaces what the client sees in the portal and downloads the spreadsheet. Overstock: {fmtInt(totals.overstockSkus)} SKUs.
            </p>
            {error && <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={GHOST} onClick={() => setConfirming(false)}>Cancel</button>
              <button type="button" className={PRIMARY} disabled={busy} onClick={confirm}>Confirm send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the two new test files** — all pass.

- [ ] **Step 6: Restructure `inventory-forecast-table.tsx`**

Keep `stockPosition`, `calcShipIn`, `getInventoryHealth`, `calcDaysOfSupply`, the style maps, `InventoryProduct` and existing cell markup. Make these exact changes:

1. **Props:** add `accountIds?: string; clientName?: string;` to `InventoryForecastTableProps` and destructure them.
2. **Delete** the `pct90d/pctQ1/pctAvg` state, the settings `useEffect` fetch, `save`, the three `handlePct*` callbacks, the `PctInput` component, and the three amber recommendation header groups (the `<th colSpan={3} ... bg-amber-500/5 ...>` blocks) plus their sub-headers and the matching `rec90/recQ1/recAvg/addtl*` cells. Delete the unused `excess` computation.
3. **Add hooks** at the top of the component:
   ```tsx
   const final = useInventoryFinal({ clientIdCode, accountIds, enabled: !readOnly });
   const { isOpen, toggle } = useCollapsedGroups();
   const [filter, setFilter] = useState<RowFilter>("all");
   const editable = !readOnly && final.canEdit;
   const rows = useMemo(
     () => buildRows(products, final.settings, final.windows, final.overrides, stockPosition),
     [products, final.settings, final.windows, final.overrides],
   );
   const visible = useMemo(() => filterRows(rows, filter), [rows, filter]);
   const totals = useMemo(() => summarizeRows(rows.map((r) => r.rec)), [rows]);
   const orphans = useMemo(() => orphanedOverrides(rows, final.overrides), [rows, final.overrides]);
   ```
   `final.canEdit` comes from Task 10 (session role via `useSession`).
4. **Iterate `visible`** instead of `products` in the body. Inside the row map, use `r.p` where the old code used `p`, and `r.stock` for the stock position.
5. **Column layout** (header row 1 = group headers, row 2 = column headers):
   - Sticky left (`sticky left-0 z-10 bg-card` on `th`/`td`; second and third sticky columns use `left-[40px]` and `left-[200px]`, adjust to the rendered widths): image · ASIN/SKU · Status. Title, VP and variation columns stay right after Status (not sticky).
   - Always visible, in this order: **Stock position** (`r.stock`) · **Basis units** (`Math.round(r.rec.basis)`, header `Basis` with `title={describeMethod(final.settings, todayIso())}`) · **Live calc** (`r.rec.liveCalc`) · **Final** (`<FinalCell rec={r.rec} override={r.override} editable={editable} onSave={(qty, note) => final.saveOverride({ asin: r.p.asin, sku: r.p.sku, qty, note })} onClear={() => final.clearOverride(r.p.sku)} />`). In `readOnly` mode hide Live calc and Final (portal fallback has no Final until a snapshot exists).
   - Group **Stock detail** (`isOpen("stock")`): the existing Total / Available / Inbound / Unfulfillable and Total Reserved / FC Transfer / FC Processing / Customer Orders cells.
   - Group **Sales**: Units/Sales 7d/30d/90d and Qty/Sales Q1 (rename the "Q1" headers to "Same qtr LY").
   - Group **Health**: Weeks of Cover, Days of Supply, Sales Rank, Rec. Ship In, and the 0–90 … 365+ age cells.
   - Group **All methods**: three cells `r.allMethods.recent`, `.seasonal`, `.average`, headers `Recent`, `Seasonal`, `Average`.
   - Each group header is a `<th>` button: `onClick={() => toggle(id)}`, label `{label} {isOpen(id) ? "▾" : "▸"}`, `colSpan` = number of columns when open, `1` when collapsed (render a single empty `<td>` per row for a collapsed group so columns align).
6. **Above the table** (hub only, `!readOnly`), in this order:
   ```tsx
   <div className="flex flex-wrap items-center justify-between gap-2">
     <MethodSettingsButton settings={final.settings} editable={editable} onSave={final.saveSettings} />
     <SendControls
       clientName={clientName ?? clientIdCode ?? ""}
       snapshots={final.snapshots}
       canSend={editable && final.windowsStatus === "ready" && rows.length > 0}
       disabledReason={
         !editable ? "Editors only" :
         final.windowsStatus === "error" ? "Sales data failed to load" :
         final.windowsStatus !== "ready" ? "Loading sales data…" :
         rows.length === 0 ? "No SKUs to send" : null
       }
       totals={totals}
       onSend={async () => {
         const snapRows = toSnapshotRows(rows);
         const r = await final.createSnapshot(snapRows);
         if ("error" in r) return r;
         const portalRows = snapRows.map(toPortalRow);
         await downloadSnapshotXlsx(r.snapshot, clientName ?? r.snapshot.clientIdCode, portalRows);
         return { snapshot: r.snapshot, rows: portalRows };
       }}
       onDownload={async (h) => {
         const stored = await final.loadSnapshotRows(h.id);
         await downloadSnapshotXlsx(h, clientName ?? h.clientIdCode, stored.map(toPortalRow));
       }}
     />
   </div>
   <SummaryStrip
     needsAction={rows.filter((r) => r.needsAction).length}
     unitsToSend={totals.unitsToSend}
     overstockSkus={totals.overstockSkus}
     overstockUnits={totals.overstockUnits}
     lastSent={final.snapshots[0]?.sentAt.slice(0, 10) ?? null}
   />
   <div className="flex gap-1" role="tablist">
     {(["all", "needs-action", "overstock"] as const).map((f) => (
       <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
         className={`h-9 rounded-full px-3 text-[13px] font-medium ${filter === f ? "bg-brand text-white" : "border border-stone-300 text-muted-foreground dark:border-zinc-700"}`}>
         {f === "all" ? "All" : f === "needs-action" ? "Needs action" : "Overstock"}
       </button>
     ))}
   </div>
   {final.windowsStatus === "error" && (
     <p className="text-xs text-red-600 dark:text-red-400">Could not load sales for the chosen windows — Final numbers use the default 90d / last-year-quarter data.</p>
   )}
   ```
   `summarizeRows(rows.map((r) => r.rec))` works because `FinalRec` has `final`.
7. **Below the table** (hub only, when `orphans.length > 0`):
   ```tsx
   <details className="mt-3 text-xs">
     <summary className="cursor-pointer text-muted-foreground">Orphaned overrides ({orphans.length})</summary>
     <ul className="mt-2 space-y-1">
       {orphans.map((o) => (
         <li key={o.sku} className="flex items-center gap-2">
           <span>{o.sku} · {o.qty} · {o.note}</span>
           {editable && <button type="button" className="text-brand" onClick={() => final.clearOverride(o.sku)}>Clear</button>}
         </li>
       ))}
     </ul>
   </details>
   ```
8. Add imports: `useInventoryFinal`, `useCollapsedGroups`, `GROUPS`, `FinalCell`, `SummaryStrip`, `MethodSettingsButton`, `SendControls`, `buildRows`, `filterRows`, `toSnapshotRows`, `orphanedOverrides`, `type RowFilter`, `summarizeRows`, `toPortalRow`, `downloadSnapshotXlsx`, `describeMethod`, `todayIso`. Drop now-unused imports (`useRef`, `useCallback` if unused).

- [ ] **Step 7: Wire the pages**

`src/app/sales-summary/inventory/page.tsx` — pass the two new props:
```tsx
<InventoryForecastTable
  products={inventoryData?.products ?? []}
  periodLabel="Last 7 Days"
  clientIdCode={activeClient}
  accountIds={accountIds}
  clientName={clients.find((c) => c.clientIdCode === activeClient)?.clientName}
/>
```
`src/app/clients/[clientIdCode]/inventory/page.tsx` — pass `accountIds={accountIds?.join?.(",") ?? accountIds}` and `clientName={clientData?.clients?.[0]?.clientName}`. Check the actual type of `accountIds` there (line ~23: `clientData?.clients?.[0]?.accountIds`, an array in the sales-summary API) and pass a comma-joined string.

- [ ] **Step 8: Run all inventory tests**

Run: `npx vitest run src/components/analytics src/lib/inventory src/app/api/inventory-rec-settings src/app/api/inventory-rec-overrides src/app/api/inventory-rec-snapshots src/app/api/sales-summary/inventory`
Expected: all pass, including the original 6 in `inventory-forecast-table.test.ts`.

- [ ] **Step 9: tsc by filename; eslint on touched files**

Run: `npx eslint src/components/analytics src/lib/inventory` — no NEW errors (the 5 pre-existing `react-doctor` plugin errors in `inventory-forecast-table.tsx` are baseline; keep the existing `eslint-disable` header lines).

- [ ] **Step 10: Commit** (`feat(inventory): Final column, send controls and decluttered table`, pathspec every touched/created file).

---

### Task 13: Portal shows the latest sent snapshot

**Files:**
- Create: `src/components/analytics/inventory-sent-snapshot.tsx`
- Modify: `src/app/portal/sales/inventory/page.tsx` (function `InventoryForClient`)
- Test: `src/components/analytics/inventory-sent-snapshot.test.tsx`

**Interfaces:**
- Consumes: `SnapshotHeader`, `PortalSnapshotRow` (Task 8); `GET /api/inventory-rec-snapshots?client=` and `/[id]` (Task 9).
- Produces: `InventorySentSnapshot(props: { header: SnapshotHeader; rows: PortalSnapshotRow[] })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/analytics/inventory-sent-snapshot.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { InventorySentSnapshot } from "./inventory-sent-snapshot";

const header = {
  id: "s1", clientIdCode: "POO_SC_US", sentBy: "", sentAt: "2026-10-07T14:00:00.000Z",
  method: "recent" as const, recentDays: 90, seasonalStart: null, seasonalEnd: null, upliftPct: 0,
  skuCount: 2, unitsToSend: 200, overstockSkus: 1, overstockUnits: 14,
};
const rows = [
  { asin: "B1", sku: "S1", productName: "One", mainImageUrl: "", available: 1, inbound: 0, reserved: 0, stockPosition: 1, basisUnits: 100, liveCalc: 200, final: 200 },
  { asin: "B2", sku: "S2", productName: "Two", mainImageUrl: "", available: 124, inbound: 0, reserved: 0, stockPosition: 124, basisUnits: 100, liveCalc: -14, final: -14 },
];

describe("InventorySentSnapshot", () => {
  it("shows the send date, finals and overstock", () => {
    render(<InventorySentSnapshot header={header} rows={rows} />);
    expect(screen.getByText("Recommendation sent 2026-10-07")).toBeTruthy();
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("Overstock −14")).toBeTruthy();
  });
  it("contains no hub orange", () => {
    const src = readFileSync("src/components/analytics/inventory-sent-snapshot.tsx", "utf8");
    expect(src).not.toMatch(/brand|FF751F|amber|orange/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

```tsx
// src/components/analytics/inventory-sent-snapshot.tsx
"use client";

import Image from "next/image";
import { fmtInt } from "@/lib/formatters";
import type { PortalSnapshotRow, SnapshotHeader } from "@/lib/inventory/snapshot";

const TH = "px-3 py-2 text-right text-[10px] font-bold text-muted-foreground";
const RED = "rounded-md border px-2 py-0.5 text-[9px] font-bold bg-red-50 text-red-600 border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30";

export function InventorySentSnapshot({ header, rows }: { header: SnapshotHeader; rows: PortalSnapshotRow[] }) {
  return (
    <div className="rounded-[18px] border border-stone-200 bg-card dark:border-zinc-800">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-bold uppercase tracking-wider text-portal-accent">Inventory recommendation</span>
        <span className="text-[10px] font-bold text-muted-foreground">Recommendation sent {header.sentAt.slice(0, 10)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className={`${TH} text-left`}>Product</th>
              <th className={TH}>Stock at send</th>
              <th className={TH}>Recommended to send</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.asin}|${r.sku}`} className="border-b border-border">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {r.mainImageUrl ? (
                      <Image src={r.mainImageUrl} alt={r.productName} width={28} height={28} className="rounded object-cover" unoptimized />
                    ) : (
                      <div className="size-7 rounded bg-muted" />
                    )}
                    <div>
                      <div className="max-w-[320px] truncate">{r.productName}</div>
                      <div className="text-[10px] text-muted-foreground">{r.asin} · {r.sku}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.stockPosition)}</td>
                <td className="px-3 py-2 text-right">
                  {r.final < 0 ? <span className={RED}>Overstock −{fmtInt(Math.abs(r.final))}</span> : <span className="font-bold tabular-nums">{fmtInt(r.final)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the portal page**

In `src/app/portal/sales/inventory/page.tsx`, inside `InventoryForClient`, add before the loading check:

```tsx
const { data: snapList, isLoading: snapListLoading } = useQuery({
  queryKey: ["portal-inv-snapshots", clientIdCode],
  queryFn: async () => {
    const res = await fetch(`/api/inventory-rec-snapshots?client=${encodeURIComponent(clientIdCode)}`);
    if (!res.ok) return { snapshots: [] as SnapshotHeader[] };
    return (await res.json()) as { snapshots: SnapshotHeader[] };
  },
});
const latestId = snapList?.snapshots?.[0]?.id;
const { data: latest, isLoading: latestLoading } = useQuery({
  queryKey: ["portal-inv-snapshot", latestId],
  queryFn: async () => {
    const res = await fetch(`/api/inventory-rec-snapshots/${latestId}`);
    if (!res.ok) throw new Error("Failed to load snapshot");
    return (await res.json()) as { snapshot: SnapshotHeader; rows: PortalSnapshotRow[] };
  },
  enabled: !!latestId,
});
```

Extend the loading condition to `clientLoading || inventoryLoading || snapListLoading || (!!latestId && latestLoading)`, and before the existing `return (<InventoryForecastTable ... readOnly />)` add:

```tsx
if (latest) return <InventorySentSnapshot header={latest.snapshot} rows={latest.rows} />;
```

Import `InventorySentSnapshot` and the two types. A failed snapshot fetch falls through to the current read-only table (Q3: no snapshot ⇒ current view).

- [ ] **Step 5: Run tests** — new file passes; `npx vitest run src/components/reports/v2/no-hub-orange.test.ts` still at its baseline (1 pre-existing failure on `reports-controls-bar.tsx`, nothing new).
- [ ] **Step 6: tsc by filename.**
- [ ] **Step 7: Commit** (`feat(portal): show the latest sent inventory recommendation`).

---

### Task 14: Final verification

- [ ] **Step 1: Full scoped suite**

Run: `npx vitest run src/lib/inventory src/components/analytics src/app/api/inventory-rec-settings src/app/api/inventory-rec-overrides src/app/api/inventory-rec-snapshots src/app/api/sales-summary/inventory`
Expected: all pass. Record the count.

- [ ] **Step 2: tsc, unfiltered, judged by filename** — zero errors in any file under `src/lib/inventory/`, `src/components/analytics/inventory-*`, `src/app/api/inventory-rec-*`, `src/app/api/sales-summary/inventory/windows/`, the three page files, `src/lib/db/schema.ts`, `scripts/_apply-0119.ts`.

- [ ] **Step 3: Browser pass — BLOCKED until Manu copies the env file into the worktree.** Do not attempt to copy it (hook-blocked). Do not apply the migration. When Manu confirms both the env copy AND the migration apply OK, run on **PORT=3100** from the worktree and check:
  1. Method chip opens, invalid seasonal window shows the error, valid save changes the chip and the Basis numbers.
  2. Final edit with note → override + note icon; tooltip shows set-by/date/live calc.
  3. Override far from live calc shows `drift`; Needs action filter includes it.
  4. Negative Final shows `Overstock −N`.
  5. Collapsing/expanding each group keeps columns aligned; state survives reload.
  6. Mark as sent → confirm shows counts → xlsx downloads with the sheet's columns and no notes → history shows the send → re-download works.
  7. Portal as a client user of that code shows "Recommendation sent <date>", no notes, no orange.
  8. Viewer role: no edit pencils, Mark as sent disabled with "Editors only".

- [ ] **Step 4: Update `/Users/manu/.claude/handoffs/thread-AG.md`** with commits, test counts, and the two owed items (migration apply OK, env copy + browser pass).
