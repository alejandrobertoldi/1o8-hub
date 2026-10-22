# SEO ↔ PPC Status v2 (per-ASIN live versions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the project-level Section A with per-ASIN blocks that track the PPC performance of the keywords used in each ASIN's live, exported SEO version, and add per-(project, ASIN) go-live / deprecation driven from the existing project status pill.

**Architecture:** A new Postgres table `seo_project_asin_live` holds live/deprecated per (project, ASIN) with a partial unique index guaranteeing one live project per ASIN. Pure modules decide go-live transitions (`asin-live.ts`) and which S2 keywords appear in a listing (`listing-match.ts`); I/O modules read the exported text from BigQuery `MFBibleApp.SEO` and per-ASIN search-term sums from Redshift (ad group → advertised ASIN join, before/after split in SQL, 24h `reports_cache`). The GET ppc-status route assembles one block per live ASIN; the tab renders them; the status picker's "live" option opens a go-live popover.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + postgres (Supabase), `@google-cloud/bigquery`, Redshift via `src/lib/redshift.ts`, Vitest, shadcn/ui, sonner toasts.

**Spec:** `docs/superpowers/specs/2026-09-29-seo-ppc-status-per-asin-design.md` (supersedes Section A / §3 of `docs/superpowers/specs/2026-09-28-seo-ppc-status-page-design.md`).

**Branch / worktree:** `thread-aa/seo-ppc-status-on-origin` in `/Users/manu/MFHub/.worktrees/aa-rebase-probe` (based on `origin/main`; `node_modules` is a symlink to `/Users/manu/MFHub/node_modules`). The worktree has NO env file; tasks here are unit-tested with mocks. The browser pass (Task 10) runs later from a worktree with an env file, with Manu's OK.

## Global Constraints

- Dates are `YYYY-MM-DD` strings across every module boundary, never `Date`.
- Go-live date validation: existing `parseLiveDate` in `src/lib/seo/ppc-status.ts` (years 2000–2100).
- Project name → version: `/_v(\d+)$/i` on the project name; `_v01` ↔ BigQuery `SEOVersionNumber` `1` (compare as `String(Number(nn))`).
- Export before live: POST go-live returns **409** `{ error, missing: string[] }` when any ASIN lacks its `V{NN}` row in BigQuery; nothing is written (all-or-nothing).
- At most one live project per (client_id_code, asin) — enforced by partial unique index `WHERE status = 'live'`; a 23505 on write → 409 "Another project just went live on this ASIN — reload".
- Tracked keywords: the project's S2 `seo_keywords` (ALL tiers, `is_negative = false`) whose `normalizePhrase` form appears on word boundaries in Title / Bullets (1–5 concatenated) / Description / Backend (`GenericKeyword1–5` concatenated). Field pills `T` `B` `D` `K`.
- PPC per ASIN only from ad groups advertising that ASIN (`amazon_source_data.ad_sponsoredproducts_productads`, columns `account_id, adgroupid, asin`), search terms from `intentwise_ecommerce_graph.searchterm_summary` (`adgroup_id`), `NOT is_asin AND search_term IS NOT NULL`.
- Redshift: `queryRedshiftOrThrow(sql, params, { retry: false })`, SELECT-only. Failures → 502, never cached. Raw Redshift/BigQuery error text is never returned to the browser.
- Cache: `reports_cache` type `seo-ppc-status-asin`, key `accountId|<asin:beforeStart:afterEnd sorted, joined ",">`, TTL 24h (reuse `CACHE_TTL_MS` / `isFresh` from `ppc-status-data.ts`).
- Windows: `computeWindows(liveDate, n, today)` (existing), `n ∈ {30,60,90}`, default 30; per-day averages; Orders/Clicks shown with `fmtAvg`.
- Migration number **0121** (0119 = this thread, 0120 = Thread AB). Schema change is applied ONLY with Manu's explicit OK (Task 1 writes it, does not run it).
- `seo_projects.live_date` is no longer read or written (column stays; nothing is dropped).
- Permissions: editor+ (`isEditorOrAbove(session.user.role)`), as the existing ppc-status route.
- UI follows `DESIGN.md` (pills `rounded-full`; `--color-white` is `#FEFEFE`).
- Commits: explicit pathspecs on `git add` AND `git commit`, `-m` before `--`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git add .`, never `git stash`.
- Gates per task: `node_modules/.bin/vitest run <files>`; `node_modules/.bin/tsc --noEmit` judged BY FILENAME (baseline: 100 error lines across 9 pre-existing files — `scripts/backfill-parent-theme-attrs.ts`, `scripts/strip-monthly-report-appendix.ts`, `src/app/api/products/import/route.test.ts`, 4 files under `src/app/design/aplus2/[clientIdCode]/_components/`, `src/components/amazon-pdp-link.test.tsx`, `src/lib/api-utils.test.ts`); zero errors in touched files; `node_modules/.bin/eslint <touched files>`.
- In `vi.mock` factories, shared mocks come from `vi.hoisted`.

## Review Focus

1. **Undo after a chain of go-lives** (P live on A deprecated Q; later R went live on A deprecating P; then "mark P not live" on A) — must NOT resurrect Q while R is live. Pinned in Task 2.
2. **Keyword that is a prefix of a longer word** ("dog" vs "dogs", "kit" inside "kitten") — must not match; only whole-word phrase matches count. Pinned in Task 3.
3. **ASIN with several SKUs in BigQuery, or `SEOVersionNumber` stored as `"01"` vs `1`** — lookup must still find the version. Pinned in Task 5.
4. **Go-live dated today or in the future** — block renders "Live today — no after-window yet" / "Goes live on …" and the SQL must not throw on an empty after window. Pinned in Tasks 4 and 7.
5. **Two users marking different projects live on the same ASIN at once** — second write hits the partial unique index → 409, no half-applied state. Pinned in Task 6.

---

### Task 1: Migration 0121 + Drizzle schema

**Files:**
- Create: `drizzle/migrations/0121_seo_project_asin_live.sql`
- Create: `scripts/_apply-0121.ts`
- Modify: `src/lib/db/schema.ts` (add table right after the `seoProjects` table definition, anchor `export const seoProjects = pgTable(`)

**Interfaces:**
- Produces: Drizzle table `seoProjectAsinLive` with camelCase columns `id, projectId, asin, clientIdCode, status, liveDate, deprecatedDate, deprecatedByProjectId, versionNumber, createdAt, updatedAt` (dates in `mode: "string"`).

- [ ] **Step 1: Write the migration**

`drizzle/migrations/0121_seo_project_asin_live.sql`:

```sql
CREATE TABLE IF NOT EXISTS seo_project_asin_live (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  asin varchar(20) NOT NULL,
  client_id_code varchar(100) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('live', 'deprecated')),
  live_date date NOT NULL,
  deprecated_date date,
  deprecated_by_project_id uuid REFERENCES seo_projects(id) ON DELETE SET NULL,
  version_number integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_seo_project_asin_live_project_asin UNIQUE (project_id, asin)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_seo_project_asin_live_one_live
  ON seo_project_asin_live (client_id_code, asin) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS idx_seo_project_asin_live_client
  ON seo_project_asin_live (client_id_code);
```

- [ ] **Step 2: Write the apply script (do NOT run it)**

Copy `scripts/_apply-0119.ts` to `scripts/_apply-0121.ts` and change exactly: `const MIGRATION = "0121_seo_project_asin_live.sql";` and the verification query/message to:

```ts
    const rows = await sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'seo_project_asin_live' AND indexname = 'uq_seo_project_asin_live_one_live'`;
    console.log(rows.length === 1 ? "OK: seo_project_asin_live + one-live index" : "FAIL: index missing");
```

- [ ] **Step 3: Add the Drizzle table**

In `src/lib/db/schema.ts`, directly after the closing of the `seoProjects` table, add (make sure `integer`, `index`, `uniqueIndex`, `date`, `timestamp` are in the `drizzle-orm/pg-core` import and `sql` in the `drizzle-orm` import — add only the ones missing; verify with grep):

```ts
// Per-(project, ASIN) go-live state for the SEO ↔ PPC status page (migration 0121).
// At most one `live` row per (client_id_code, asin) — partial unique index.
export const seoProjectAsinLive = pgTable(
  "seo_project_asin_live",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => seoProjects.id, { onDelete: "cascade" }),
    asin: varchar("asin", { length: 20 }).notNull(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    liveDate: date("live_date", { mode: "string" }).notNull(),
    deprecatedDate: date("deprecated_date", { mode: "string" }),
    deprecatedByProjectId: uuid("deprecated_by_project_id").references(() => seoProjects.id, { onDelete: "set null" }),
    versionNumber: integer("version_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_seo_project_asin_live_project_asin").on(t.projectId, t.asin),
    uniqueIndex("uq_seo_project_asin_live_one_live").on(t.clientIdCode, t.asin).where(sql`status = 'live'`),
    index("idx_seo_project_asin_live_client").on(t.clientIdCode),
  ],
);
```

(If `seoProjects`'s third argument uses the object form `(t) => ({ … })` instead of the array form, match whatever form the neighbouring tables use.)

- [ ] **Step 4: Typecheck**

Run: `node_modules/.bin/tsc --noEmit > /tmp/t1-tsc.txt 2>&1; grep -c "schema.ts\|_apply-0121" /tmp/t1-tsc.txt`
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add -- drizzle/migrations/0121_seo_project_asin_live.sql scripts/_apply-0121.ts src/lib/db/schema.ts
git commit -m "feat(seo): seo_project_asin_live table (migration 0121, not applied)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- drizzle/migrations/0121_seo_project_asin_live.sql scripts/_apply-0121.ts src/lib/db/schema.ts
```

---

### Task 2: Go-live transition logic (pure)

**Files:**
- Create: `src/lib/seo/asin-live.ts`
- Test: `src/lib/seo/asin-live.test.ts`

**Interfaces:**
- Produces:
  - `type AsinLiveStatus = "live" | "deprecated"`
  - `interface AsinLiveRow { projectId: string; asin: string; status: AsinLiveStatus; liveDate: string; deprecatedDate: string | null; deprecatedByProjectId: string | null; versionNumber: number }`
  - `parseVersionFromName(name: string): number | null`
  - `interface GoLivePlan { upserts: AsinLiveRow[]; deprecations: Array<{ projectId: string; asin: string; deprecatedDate: string; deprecatedByProjectId: string }> }`
  - `planGoLive(existing: AsinLiveRow[], projectId: string, asins: string[], liveDate: string, versionNumber: number): GoLivePlan`
  - `interface NotLivePlan { deletes: Array<{ projectId: string; asin: string }>; restores: Array<{ projectId: string; asin: string }> }`
  - `planNotLive(existing: AsinLiveRow[], projectId: string, asins: string[]): NotLivePlan`
  - `deriveProjectStatus(rows: Array<{ status: AsinLiveStatus }>): "live" | "deprecated" | "completed"`
  - `affectedProjectIds(plan: GoLivePlan | NotLivePlan, projectId: string): string[]`

`existing` = all rows for the client on the given ASINs (any project).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { parseVersionFromName, planGoLive, planNotLive, deriveProjectStatus, affectedProjectIds, type AsinLiveRow } from "./asin-live";

const row = (p: Partial<AsinLiveRow>): AsinLiveRow => ({
  projectId: "P", asin: "A", status: "live", liveDate: "2026-06-02", deprecatedDate: null, deprecatedByProjectId: null, versionNumber: 1, ...p,
});

describe("parseVersionFromName", () => {
  it("reads the trailing _vNN", () => {
    expect(parseVersionFromName("REA_SC_US_01_ReadyRESCUE_v01")).toBe(1);
    expect(parseVersionFromName("TRT_SC_US_Mug_V12")).toBe(12);
  });
  it("null when there is no trailing version", () => {
    expect(parseVersionFromName("Coffee SEO")).toBeNull();
    expect(parseVersionFromName("x_v01_draft")).toBeNull();
  });
});

describe("planGoLive", () => {
  it("fresh ASIN → one live upsert, no deprecations", () => {
    const plan = planGoLive([], "P", ["A"], "2026-06-02", 1);
    expect(plan.upserts).toEqual([row({})]);
    expect(plan.deprecations).toEqual([]);
  });
  it("deprecates the other project's live row on the same ASIN only", () => {
    const existing = [row({ projectId: "Q", asin: "A" }), row({ projectId: "Q", asin: "B" })];
    const plan = planGoLive(existing, "P", ["A"], "2026-07-01", 2);
    expect(plan.deprecations).toEqual([{ projectId: "Q", asin: "A", deprecatedDate: "2026-07-01", deprecatedByProjectId: "P" }]);
    expect(plan.upserts).toEqual([row({ projectId: "P", asin: "A", liveDate: "2026-07-01", versionNumber: 2 })]);
  });
  it("re-marking an already-live pair only updates its date", () => {
    const plan = planGoLive([row({})], "P", ["A"], "2026-06-10", 1);
    expect(plan.deprecations).toEqual([]);
    expect(plan.upserts).toEqual([row({ liveDate: "2026-06-10" })]);
  });
  it("ignores already-deprecated rows of other projects", () => {
    const plan = planGoLive([row({ projectId: "Q", status: "deprecated", deprecatedDate: "2026-05-01", deprecatedByProjectId: "Z" })], "P", ["A"], "2026-06-02", 1);
    expect(plan.deprecations).toEqual([]);
  });
});

describe("planNotLive", () => {
  it("deletes own row and restores the row it deprecated", () => {
    const existing = [row({ projectId: "P" }), row({ projectId: "Q", status: "deprecated", deprecatedDate: "2026-06-02", deprecatedByProjectId: "P" })];
    expect(planNotLive(existing, "P", ["A"])).toEqual({ deletes: [{ projectId: "P", asin: "A" }], restores: [{ projectId: "Q", asin: "A" }] });
  });
  it("does NOT restore when P itself is already deprecated by a newer project (Review Focus 1)", () => {
    const existing = [
      row({ projectId: "P", status: "deprecated", deprecatedDate: "2026-08-01", deprecatedByProjectId: "R" }),
      row({ projectId: "Q", status: "deprecated", deprecatedDate: "2026-06-02", deprecatedByProjectId: "P" }),
      row({ projectId: "R", liveDate: "2026-08-01" }),
    ];
    expect(planNotLive(existing, "P", ["A"])).toEqual({ deletes: [{ projectId: "P", asin: "A" }], restores: [] });
  });
  it("no own row → nothing to do", () => {
    expect(planNotLive([row({ projectId: "Q" })], "P", ["A"])).toEqual({ deletes: [], restores: [] });
  });
});

describe("deriveProjectStatus", () => {
  it("any live → live", () => expect(deriveProjectStatus([{ status: "deprecated" }, { status: "live" }])).toBe("live"));
  it("only deprecated → deprecated", () => expect(deriveProjectStatus([{ status: "deprecated" }])).toBe("deprecated"));
  it("no rows → completed", () => expect(deriveProjectStatus([])).toBe("completed"));
});

describe("affectedProjectIds", () => {
  it("includes the acting project and every deprecated/restored one, deduped", () => {
    const plan = planGoLive([row({ projectId: "Q" }), row({ projectId: "Q", asin: "B" })], "P", ["A", "B"], "2026-07-01", 2);
    expect(affectedProjectIds(plan, "P").sort()).toEqual(["P", "Q"]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node_modules/.bin/vitest run src/lib/seo/asin-live.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/**
 * Pure go-live / deprecation rules for the SEO ↔ PPC status page (spec §4).
 * Live state is per (project, ASIN); one live project per ASIN.
 */
export type AsinLiveStatus = "live" | "deprecated";

export interface AsinLiveRow {
  projectId: string;
  asin: string;
  status: AsinLiveStatus;
  liveDate: string;
  deprecatedDate: string | null;
  deprecatedByProjectId: string | null;
  versionNumber: number;
}

export function parseVersionFromName(name: string): number | null {
  const m = /_v(\d+)$/i.exec(name.trim());
  return m ? Number(m[1]) : null;
}

export interface GoLivePlan {
  upserts: AsinLiveRow[];
  deprecations: Array<{ projectId: string; asin: string; deprecatedDate: string; deprecatedByProjectId: string }>;
}

export function planGoLive(existing: AsinLiveRow[], projectId: string, asins: string[], liveDate: string, versionNumber: number): GoLivePlan {
  const plan: GoLivePlan = { upserts: [], deprecations: [] };
  for (const asin of new Set(asins)) {
    for (const r of existing) {
      if (r.asin === asin && r.projectId !== projectId && r.status === "live") {
        plan.deprecations.push({ projectId: r.projectId, asin, deprecatedDate: liveDate, deprecatedByProjectId: projectId });
      }
    }
    plan.upserts.push({ projectId, asin, status: "live", liveDate, deprecatedDate: null, deprecatedByProjectId: null, versionNumber });
  }
  return plan;
}

export interface NotLivePlan {
  deletes: Array<{ projectId: string; asin: string }>;
  restores: Array<{ projectId: string; asin: string }>;
}

export function planNotLive(existing: AsinLiveRow[], projectId: string, asins: string[]): NotLivePlan {
  const plan: NotLivePlan = { deletes: [], restores: [] };
  for (const asin of new Set(asins)) {
    const own = existing.find((r) => r.asin === asin && r.projectId === projectId);
    if (!own) continue;
    plan.deletes.push({ projectId, asin });
    // Only a project that is live right now can hand the ASIN back; if it was
    // itself deprecated by a newer project, that newer project stays live.
    if (own.status !== "live") continue;
    for (const r of existing) {
      if (r.asin === asin && r.status === "deprecated" && r.deprecatedByProjectId === projectId) {
        plan.restores.push({ projectId: r.projectId, asin });
      }
    }
  }
  return plan;
}

export function deriveProjectStatus(rows: Array<{ status: AsinLiveStatus }>): "live" | "deprecated" | "completed" {
  if (rows.some((r) => r.status === "live")) return "live";
  if (rows.length > 0) return "deprecated";
  return "completed";
}

export function affectedProjectIds(plan: GoLivePlan | NotLivePlan, projectId: string): string[] {
  const ids = new Set<string>([projectId]);
  if ("deprecations" in plan) for (const d of plan.deprecations) ids.add(d.projectId);
  if ("restores" in plan) for (const r of plan.restores) ids.add(r.projectId);
  return [...ids];
}
```

- [ ] **Step 4: Run tests**

Run: `node_modules/.bin/vitest run src/lib/seo/asin-live.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add -- src/lib/seo/asin-live.ts src/lib/seo/asin-live.test.ts
git commit -m "feat(seo): per-ASIN go-live/deprecation rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/seo/asin-live.ts src/lib/seo/asin-live.test.ts
```

---

### Task 3: Listing keyword matcher (pure)

**Files:**
- Create: `src/lib/seo/listing-match.ts`
- Test: `src/lib/seo/listing-match.test.ts`

**Interfaces:**
- Consumes: `normalizeTerm` from `src/lib/seo/ppc-status.ts` (join key with Redshift search terms).
- Produces:
  - `type ListingField = "T" | "B" | "D" | "K"`
  - `interface ListingText { title: string; bullets: string; description: string; backend: string }`
  - `normalizePhrase(s: string): string`
  - `listingTextFromBqRow(row: Record<string, unknown>): ListingText`
  - `interface TrackedKeyword { keyword: string; tier: string | null; fields: ListingField[] }` — `keyword` is `normalizeTerm(text)`
  - `matchListingKeywords(s2: Array<{ text: string; tier: string | null }>, text: ListingText): TrackedKeyword[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { normalizePhrase, listingTextFromBqRow, matchListingKeywords, type ListingText } from "./listing-match";

const text: ListingText = {
  title: "ReadyRESCUE Dog First-Aid Kit, 100 pcs",
  bullets: "Activated charcoal for dogs included. Great for camping.",
  description: "A travel first aid kit for your pet.",
  backend: "pet emergency kit kittens",
};

describe("normalizePhrase", () => {
  it("lowercases, turns punctuation into spaces, collapses", () => {
    expect(normalizePhrase("  Dog First-Aid Kit, 100 pcs ")).toBe("dog first aid kit 100 pcs");
  });
});

describe("listingTextFromBqRow", () => {
  it("concatenates bullets 1-5 and GenericKeyword1-5, tolerating nulls", () => {
    const t = listingTextFromBqRow({
      ItemName: "T", DetailedBulletPoint1: "b1", DetailedBulletPoint2: null, DetailedBulletPoint5: "b5",
      ProductDescription: "D", GenericKeyword1: "k1", GenericKeyword3: "k3",
    });
    expect(t).toEqual({ title: "T", bullets: "b1 b5", description: "D", backend: "k1 k3" });
  });
});

describe("matchListingKeywords", () => {
  it("matches whole phrases across fields with field pills", () => {
    const out = matchListingKeywords(
      [{ text: "dog first aid kit", tier: "T1" }, { text: "Activated Charcoal", tier: "T2" }, { text: "first aid kit", tier: "T2" }],
      text,
    );
    expect(out).toEqual([
      { keyword: "dog first aid kit", tier: "T1", fields: ["T"] },
      { keyword: "activated charcoal", tier: "T2", fields: ["B"] },
      { keyword: "first aid kit", tier: "T2", fields: ["T", "D"] },
    ]);
  });
  it("does not match inside a longer word (Review Focus 2)", () => {
    expect(matchListingKeywords([{ text: "kitten", tier: null }, { text: "dog", tier: null }, { text: "kit", tier: null }], {
      title: "dogs", bullets: "", description: "", backend: "kittens",
    })).toEqual([]);
  });
  it("skips empty and ASIN-shaped keywords, dedupes", () => {
    expect(matchListingKeywords([{ text: "  ", tier: null }, { text: "B0CLMBGMS6", tier: null }, { text: "pet", tier: "T3" }, { text: "PET", tier: "T1" }], {
      title: "b0clmbgms6 pet", bullets: "", description: "", backend: "",
    })).toEqual([{ keyword: "pet", tier: "T3", fields: ["T"] }]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node_modules/.bin/vitest run src/lib/seo/listing-match.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/**
 * Which S2 keywords a listing version actually uses (spec §6). Pure.
 * A keyword counts when its phrase appears on word boundaries in a field.
 */
import { normalizeTerm } from "./ppc-status";

export type ListingField = "T" | "B" | "D" | "K";
export interface ListingText { title: string; bullets: string; description: string; backend: string }
export interface TrackedKeyword { keyword: string; tier: string | null; fields: ListingField[] }

const ASIN_RE = /^b0[0-9a-z]{8}$/i;

export function normalizePhrase(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function join(row: Record<string, unknown>, prefix: string): string {
  return [1, 2, 3, 4, 5].map((i) => str(row[`${prefix}${i}`])).filter(Boolean).join(" ");
}

export function listingTextFromBqRow(row: Record<string, unknown>): ListingText {
  return {
    title: str(row.ItemName),
    bullets: join(row, "DetailedBulletPoint"),
    description: str(row.ProductDescription),
    backend: join(row, "GenericKeyword"),
  };
}

export function matchListingKeywords(s2: Array<{ text: string; tier: string | null }>, text: ListingText): TrackedKeyword[] {
  const padded: Array<[ListingField, string]> = [
    ["T", ` ${normalizePhrase(text.title)} `],
    ["B", ` ${normalizePhrase(text.bullets)} `],
    ["D", ` ${normalizePhrase(text.description)} `],
    ["K", ` ${normalizePhrase(text.backend)} `],
  ];
  const seen = new Set<string>();
  const out: TrackedKeyword[] = [];
  for (const k of s2) {
    const phrase = normalizePhrase(k.text);
    if (!phrase || ASIN_RE.test(phrase.replace(/ /g, ""))) continue;
    const key = normalizeTerm(k.text);
    if (seen.has(key)) continue;
    const fields = padded.filter(([, t]) => t.includes(` ${phrase} `)).map(([f]) => f);
    if (fields.length === 0) continue;
    seen.add(key);
    out.push({ keyword: key, tier: k.tier, fields });
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `node_modules/.bin/vitest run src/lib/seo/listing-match.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -- src/lib/seo/listing-match.ts src/lib/seo/listing-match.test.ts
git commit -m "feat(seo): match S2 keywords against an exported listing version" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/seo/listing-match.ts src/lib/seo/listing-match.test.ts
```

---

### Task 4: Per-ASIN Redshift queries + block aggregation

**Files:**
- Modify: `src/lib/ppc-queries.ts` (add after `fetchSearchTermTotals`)
- Modify: `src/lib/seo/ppc-status.ts` (add `buildAsinBlockRows`; widen `sectionATotals` param type)
- Test: `src/lib/ppc-queries.test.ts` (extend), `src/lib/seo/ppc-status.test.ts` (extend)

**Interfaces:**
- Consumes: `TrackedKeyword` (Task 3), existing `DateWindow`, `Metrics`, `PerDay`, `perDay`, `toMetrics`, `normalizeTerm`.
- Produces:
  - `interface AsinWindowSpec { asin: string; before: { start: string; end: string }; after: { start: string; end: string } }`
  - `interface AsinTermWindowRow { asin: string; search_term: string; win: "before" | "after"; ad_impressions: number; ad_clicks: number; ad_spend: number; ad_revenue: number; ad_orders: number }`
  - `fetchAsinTermWindows(accountId: number, specs: AsinWindowSpec[]): Promise<AsinTermWindowRow[]>`
  - `interface AdGroupShareRow { asin: string; shared_with: number }`
  - `fetchAdGroupShares(accountId: number, asins: string[]): Promise<AdGroupShareRow[]>`
  - `interface AsinBlockRow { keyword: string; tier: string | null; fields: ListingField[]; before: PerDay | null; after: PerDay | null; beforeTotals: Metrics; afterTotals: Metrics }`
  - `buildAsinBlockRows(tracked: TrackedKeyword[], rows: AsinTermWindowRow[], before: DateWindow, after: DateWindow): AsinBlockRow[]` — `rows` already filtered to one ASIN
  - `sectionATotals(rows: Array<{ beforeTotals: Metrics; afterTotals: Metrics }>, before, after)` (same body, wider type)

- [ ] **Step 1: Write the failing query tests** (append to `src/lib/ppc-queries.test.ts`, reusing its hoisted `queryRedshiftOrThrow` mock; import the two new functions at the top)

```ts
describe("fetchAsinTermWindows", () => {
  it("passes one VALUES tuple per ASIN and no retry", async () => {
    queryRedshiftOrThrow.mockResolvedValueOnce([]);
    await fetchAsinTermWindows(1899670, [
      { asin: "A1", before: { start: "2026-05-03", end: "2026-06-01" }, after: { start: "2026-06-02", end: "2026-07-01" } },
      { asin: "A2", before: { start: "2026-08-30", end: "2026-09-28" }, after: { start: "2026-09-29", end: "2026-09-28" } },
    ]);
    const [sqlText, params, opts] = queryRedshiftOrThrow.mock.calls.at(-1)!;
    expect(sqlText).toContain("($2, $3::date, $4::date, $5::date, $6::date), ($7, $8::date, $9::date, $10::date, $11::date)");
    expect(sqlText).toContain("ad_sponsoredproducts_productads");
    expect(sqlText).toContain("NOT st.is_asin");
    expect(sqlText).toContain("st.search_term IS NOT NULL");
    expect(params).toEqual([1899670, "A1", "2026-05-03", "2026-06-01", "2026-06-02", "2026-07-01", "A2", "2026-08-30", "2026-09-28", "2026-09-29", "2026-09-28"]);
    expect(opts).toEqual({ retry: false });
  });
  it("no specs → no query", async () => {
    queryRedshiftOrThrow.mockClear();
    expect(await fetchAsinTermWindows(1, [])).toEqual([]);
    expect(queryRedshiftOrThrow).not.toHaveBeenCalled();
  });
});

describe("fetchAdGroupShares", () => {
  it("self-joins productads by ad group and filters to the given ASINs", async () => {
    queryRedshiftOrThrow.mockResolvedValueOnce([{ asin: "A1", shared_with: 2 }]);
    const out = await fetchAdGroupShares(7, ["A1", "A2"]);
    const [sqlText, params] = queryRedshiftOrThrow.mock.calls.at(-1)!;
    expect(sqlText).toContain("b.asin <> a.asin");
    expect(sqlText).toContain("a.asin IN ($2, $3)");
    expect(params).toEqual([7, "A1", "A2"]);
    expect(out).toEqual([{ asin: "A1", shared_with: 2 }]);
  });
});
```

- [ ] **Step 2: Write the failing aggregation tests** (append to `src/lib/seo/ppc-status.test.ts`; import `buildAsinBlockRows`)

```ts
describe("buildAsinBlockRows", () => {
  const before = { start: "2026-05-03", end: "2026-06-01", days: 30 };
  const after = { start: "2026-06-02", end: "2026-07-01", days: 30 };
  const r = (search_term: string, win: "before" | "after", ad_revenue: number, ad_orders = 1) =>
    ({ asin: "A1", search_term, win, ad_impressions: 30, ad_clicks: 3, ad_spend: 6, ad_revenue, ad_orders });

  it("splits before/after per tracked keyword, per day, sorted by after sales desc", () => {
    const out = buildAsinBlockRows(
      [{ keyword: "dog kit", tier: "T1", fields: ["T"] }, { keyword: "charcoal", tier: "T2", fields: ["B", "K"] }],
      [r("Dog Kit", "before", 30), r("dog kit", "after", 60), r("charcoal", "after", 90), r("unrelated", "after", 999)],
      before, after,
    );
    expect(out.map((x) => x.keyword)).toEqual(["charcoal", "dog kit"]);
    expect(out[1].beforeTotals.sales).toBe(30);
    expect(out[1].after).toEqual({ impressions: 1, clicks: 0.1, spend: 0.2, sales: 2, orders: 1 / 30 });
    expect(out[0].fields).toEqual(["B", "K"]);
    expect(out[0].before).toEqual({ impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 });
  });
  it("empty after window (live today) → after null (Review Focus 4)", () => {
    const out = buildAsinBlockRows([{ keyword: "x", tier: null, fields: ["T"] }], [], before, { start: "2026-09-29", end: "2026-09-28", days: 0 });
    expect(out[0].after).toBeNull();
    expect(out[0].afterTotals.sales).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `node_modules/.bin/vitest run src/lib/ppc-queries.test.ts src/lib/seo/ppc-status.test.ts`
Expected: FAIL (functions not exported).

- [ ] **Step 4: Implement the queries** (in `src/lib/ppc-queries.ts`, after `fetchSearchTermTotals`)

```ts
export interface AsinWindowSpec {
  asin: string;
  before: { start: string; end: string };
  after: { start: string; end: string };
}

/** One row per (advertised ASIN, search term, window) — see fetchAsinTermWindows. */
export interface AsinTermWindowRow {
  asin: string;
  search_term: string;
  win: "before" | "after";
  ad_impressions: number;
  ad_clicks: number;
  ad_spend: number;
  ad_revenue: number;
  ad_orders: number;
}

/**
 * Per-ASIN search-term sums for each ASIN's own before/after windows (SEO ↔ PPC
 * status v2, spec §7). Search terms are attributed to an ASIN through the ad
 * groups that advertise it; an ad group advertising several ASINs counts
 * under each of them (flagged in the UI via fetchAdGroupShares).
 * An after window whose end < start (go-live today) simply matches no rows.
 */
export async function fetchAsinTermWindows(accountId: number, specs: AsinWindowSpec[]): Promise<AsinTermWindowRow[]> {
  if (specs.length === 0) return [];
  const params: Array<string | number> = [accountId];
  const tuples = specs.map((s) => {
    const i = params.length + 1;
    params.push(s.asin, s.before.start, s.before.end, s.after.start, s.after.end);
    return `($${i}, $${i + 1}::date, $${i + 2}::date, $${i + 3}::date, $${i + 4}::date)`;
  });
  return queryRedshiftOrThrow<AsinTermWindowRow>(
    `WITH w(asin, before_start, before_end, after_start, after_end) AS (VALUES ${tuples.join(", ")}),
    pa AS (
      SELECT DISTINCT adgroupid::varchar AS ag, asin
      FROM "${ASD}"."ad_sponsoredproducts_productads"
      WHERE account_id = $1
    )
    SELECT w.asin, st.search_term,
      CASE WHEN st.report_date BETWEEN w.before_start AND w.before_end THEN 'before' ELSE 'after' END AS win,
      SUM(st.ad_impressions) AS ad_impressions,
      SUM(st.ad_clicks) AS ad_clicks,
      SUM(st.ad_spend) AS ad_spend,
      SUM(st.ad_revenue) AS ad_revenue,
      SUM(st.ad_orders) AS ad_orders
    FROM "${EG}"."searchterm_summary" st
    JOIN pa ON pa.ag = st.adgroup_id::varchar
    JOIN w ON w.asin = pa.asin
    WHERE st.account_id = $1
      AND NOT st.is_asin
      AND st.search_term IS NOT NULL
      AND (st.report_date BETWEEN w.before_start AND w.before_end
        OR st.report_date BETWEEN w.after_start AND w.after_end)
    GROUP BY 1, 2, 3`,
    params,
    { retry: false }
  );
}

export interface AdGroupShareRow {
  asin: string;
  shared_with: number;
}

/** For each given ASIN: how many OTHER ASINs share at least one of its ad groups. */
export async function fetchAdGroupShares(accountId: number, asins: string[]): Promise<AdGroupShareRow[]> {
  if (asins.length === 0) return [];
  const placeholders = asins.map((_, i) => `$${i + 2}`).join(", ");
  return queryRedshiftOrThrow<AdGroupShareRow>(
    `WITH pa AS (
      SELECT DISTINCT adgroupid::varchar AS ag, asin
      FROM "${ASD}"."ad_sponsoredproducts_productads"
      WHERE account_id = $1
    )
    SELECT a.asin, COUNT(DISTINCT b.asin) AS shared_with
    FROM pa a
    JOIN pa b ON b.ag = a.ag AND b.asin <> a.asin
    WHERE a.asin IN (${placeholders})
    GROUP BY 1`,
    [accountId, ...asins],
    { retry: false }
  );
}
```

- [ ] **Step 5: Implement the aggregation** (in `src/lib/seo/ppc-status.ts`)

Add the imports at the top:

```ts
import type { AsinTermWindowRow } from "@/lib/ppc-queries";
import type { ListingField, TrackedKeyword } from "./listing-match";
```

Change the `sectionATotals` signature's first parameter to `rows: Array<{ beforeTotals: Metrics; afterTotals: Metrics }>` (body unchanged). Then add:

```ts
export interface AsinBlockRow {
  keyword: string;
  tier: string | null;
  fields: ListingField[];
  before: PerDay | null;
  after: PerDay | null;
  beforeTotals: Metrics;
  afterTotals: Metrics;
}

function aggregateWindow(rows: AsinTermWindowRow[], win: "before" | "after"): Map<string, Metrics> {
  const grouped = new Map<string, SearchTermTotalRow[]>();
  for (const r of rows) {
    if (r.win !== win) continue;
    const k = normalizeTerm(r.search_term);
    const t: SearchTermTotalRow = { search_term: r.search_term, is_asin: false, ad_impressions: r.ad_impressions, ad_clicks: r.ad_clicks, ad_spend: r.ad_spend, ad_revenue: r.ad_revenue, ad_orders: r.ad_orders };
    const arr = grouped.get(k);
    if (arr) arr.push(t);
    else grouped.set(k, [t]);
  }
  const out = new Map<string, Metrics>();
  for (const [k, rs] of grouped) out.set(k, toMetrics(rs));
  return out;
}

/** One ASIN block's keyword rows (spec §8): rows must already be filtered to that ASIN. */
export function buildAsinBlockRows(tracked: TrackedKeyword[], rows: AsinTermWindowRow[], before: DateWindow, after: DateWindow): AsinBlockRow[] {
  const b = aggregateWindow(rows, "before");
  const a = aggregateWindow(rows, "after");
  return tracked
    .map((t) => {
      const beforeTotals = b.get(t.keyword) ?? EMPTY;
      const afterTotals = a.get(t.keyword) ?? EMPTY;
      return { keyword: t.keyword, tier: t.tier, fields: t.fields, before: perDay(beforeTotals, before.days), after: perDay(afterTotals, after.days), beforeTotals, afterTotals };
    })
    .sort((x, y) => y.afterTotals.sales - x.afterTotals.sales);
}
```

(`EMPTY` is declared further down the file than you may insert — place `buildAsinBlockRows` after the `EMPTY` constant.)

- [ ] **Step 6: Run tests**

Run: `node_modules/.bin/vitest run src/lib/ppc-queries.test.ts src/lib/seo/ppc-status.test.ts`
Expected: PASS (all previous tests plus 5 new).

- [ ] **Step 7: Commit**

```bash
git add -- src/lib/ppc-queries.ts src/lib/ppc-queries.test.ts src/lib/seo/ppc-status.ts src/lib/seo/ppc-status.test.ts
git commit -m "feat(seo): per-ASIN search-term windows via advertised-product ad groups" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/ppc-queries.ts src/lib/ppc-queries.test.ts src/lib/seo/ppc-status.ts src/lib/seo/ppc-status.test.ts
```

---

### Task 5: Data loaders (Postgres live rows, BigQuery versions, cached Redshift)

**Files:**
- Modify: `src/lib/bigquery.ts` — export the existing const: change `const SEO_VERSIONS_READ_TABLE =` to `export const SEO_VERSIONS_READ_TABLE =`
- Create: `src/lib/seo/asin-live-data.ts`
- Test: `src/lib/seo/asin-live-data.test.ts`

**Interfaces:**
- Consumes: `seoProjectAsinLive` (Task 1), `AsinLiveRow` (Task 2), `listingTextFromBqRow`, `ListingText` (Task 3), `fetchAsinTermWindows`, `AsinWindowSpec`, `AsinTermWindowRow` (Task 4), `CACHE_TTL_MS`, `isFresh` from `./ppc-status-data`.
- Produces:
  - `versionKey(asin: string, version: number): string` → `` `${asin}|${version}` ``
  - `loadVersionTexts(keys: Array<{ asin: string; version: number }>): Promise<Map<string, ListingText>>`
  - `loadClientLiveRows(clientId: string): Promise<Array<AsinLiveRow & { projectName: string }>>`
  - `loadRowsForAsins(clientId: string, asins: string[]): Promise<AsinLiveRow[]>`
  - `loadS2Keywords(projectIds: string[]): Promise<Map<string, Array<{ text: string; tier: string | null }>>>`
  - `ASIN_CACHE_TYPE = "seo-ppc-status-asin"`
  - `asinCacheKey(accountId: number, specs: AsinWindowSpec[]): string`
  - `loadAsinTermWindows(accountId: number, specs: AsinWindowSpec[]): Promise<{ rows: AsinTermWindowRow[]; fetchedAt: Date }>`

- [ ] **Step 1: Write the failing tests** (pure helpers + BigQuery mapping; DB-backed loaders are covered through the route tests)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { createQueryJob } = vi.hoisted(() => ({ createQueryJob: vi.fn() }));
vi.mock("@/lib/bigquery", () => ({
  SEO_VERSIONS_READ_TABLE: "proj.MFBibleApp.SEO",
  getBigQueryClient: () => ({ createQueryJob }),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/ppc-queries", () => ({ fetchAsinTermWindows: vi.fn() }));

import { versionKey, loadVersionTexts, asinCacheKey } from "./asin-live-data";

beforeEach(() => createQueryJob.mockReset());

describe("versionKey / asinCacheKey", () => {
  it("builds stable keys", () => {
    expect(versionKey("B0X", 1)).toBe("B0X|1");
    expect(asinCacheKey(5, [
      { asin: "B", before: { start: "2026-01-01", end: "x" }, after: { start: "y", end: "2026-02-01" } },
      { asin: "A", before: { start: "2026-03-01", end: "x" }, after: { start: "y", end: "2026-04-01" } },
    ])).toBe("5|A:2026-03-01:2026-04-01,B:2026-01-01:2026-02-01");
  });
});

describe("loadVersionTexts (Review Focus 3)", () => {
  it("queries by ASIN|version with the version normalised, first SKU row wins", async () => {
    createQueryJob.mockResolvedValue([{ getQueryResults: async () => [[
      { ASIN: "B0X", SEOVersionNumber: "01", SKU: "a", ItemName: "first" },
      { ASIN: "B0X", SEOVersionNumber: 1, SKU: "b", ItemName: "second" },
    ]] }]);
    const out = await loadVersionTexts([{ asin: "B0X", version: 1 }]);
    const call = createQueryJob.mock.calls[0][0];
    expect(call.query).toContain("proj.MFBibleApp.SEO");
    expect(call.query).toContain("CAST(SAFE_CAST(SEOVersionNumber AS INT64) AS STRING)");
    expect(call.params).toEqual({ keys: ["B0X|1"] });
    expect(out.get("B0X|1")?.title).toBe("first");
  });
  it("empty keys → no query", async () => {
    expect((await loadVersionTexts([])).size).toBe(0);
    expect(createQueryJob).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node_modules/.bin/vitest run src/lib/seo/asin-live-data.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/**
 * I/O for SEO ↔ PPC status v2: per-(project, ASIN) live rows (Postgres),
 * exported listing versions (BigQuery MFBibleApp.SEO), and per-ASIN search-term
 * windows (Redshift, 24h reports_cache). Rules live in asin-live.ts.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { reportsCache, seoKeywords, seoProjectAsinLive, seoProjects } from "@/lib/db/schema";
import { getBigQueryClient, SEO_VERSIONS_READ_TABLE } from "@/lib/bigquery";
import { fetchAsinTermWindows, type AsinTermWindowRow, type AsinWindowSpec } from "@/lib/ppc-queries";
import { listingTextFromBqRow, type ListingText } from "./listing-match";
import type { AsinLiveRow, AsinLiveStatus } from "./asin-live";
import { isFresh } from "./ppc-status-data";

export const ASIN_CACHE_TYPE = "seo-ppc-status-asin";

export function versionKey(asin: string, version: number): string {
  return `${asin}|${version}`;
}

export async function loadVersionTexts(keys: Array<{ asin: string; version: number }>): Promise<Map<string, ListingText>> {
  const out = new Map<string, ListingText>();
  if (keys.length === 0) return out;
  const [job] = await getBigQueryClient().createQueryJob({
    query: `SELECT * FROM \`${SEO_VERSIONS_READ_TABLE}\`
      WHERE CONCAT(ASIN, '|', CAST(SAFE_CAST(SEOVersionNumber AS INT64) AS STRING)) IN UNNEST(@keys)
      ORDER BY ASIN, SKU`,
    params: { keys: keys.map((k) => versionKey(k.asin, k.version)) },
  });
  const [rows] = await job.getQueryResults();
  for (const r of rows as Array<Record<string, unknown>>) {
    const k = versionKey(String(r.ASIN), Number(r.SEOVersionNumber));
    if (!out.has(k)) out.set(k, listingTextFromBqRow(r));
  }
  return out;
}

const liveCols = {
  projectId: seoProjectAsinLive.projectId,
  asin: seoProjectAsinLive.asin,
  status: seoProjectAsinLive.status,
  liveDate: seoProjectAsinLive.liveDate,
  deprecatedDate: seoProjectAsinLive.deprecatedDate,
  deprecatedByProjectId: seoProjectAsinLive.deprecatedByProjectId,
  versionNumber: seoProjectAsinLive.versionNumber,
};

function asRow(r: { status: string } & Omit<AsinLiveRow, "status">): AsinLiveRow {
  return { ...r, status: r.status as AsinLiveStatus };
}

export async function loadClientLiveRows(clientId: string): Promise<Array<AsinLiveRow & { projectName: string }>> {
  const rows = await db
    .select({ ...liveCols, projectName: seoProjects.name })
    .from(seoProjectAsinLive)
    .innerJoin(seoProjects, eq(seoProjects.id, seoProjectAsinLive.projectId))
    .where(and(eq(seoProjectAsinLive.clientIdCode, clientId), eq(seoProjectAsinLive.status, "live")))
    .orderBy(asc(seoProjectAsinLive.asin));
  return rows.map((r) => ({ ...asRow(r), projectName: r.projectName }));
}

export async function loadRowsForAsins(clientId: string, asins: string[]): Promise<AsinLiveRow[]> {
  if (asins.length === 0) return [];
  const rows = await db
    .select(liveCols)
    .from(seoProjectAsinLive)
    .where(and(eq(seoProjectAsinLive.clientIdCode, clientId), inArray(seoProjectAsinLive.asin, asins)));
  return rows.map(asRow);
}

export async function loadS2Keywords(projectIds: string[]): Promise<Map<string, Array<{ text: string; tier: string | null }>>> {
  const out = new Map<string, Array<{ text: string; tier: string | null }>>();
  if (projectIds.length === 0) return out;
  const rows = await db
    .select({ projectId: seoKeywords.projectId, text: seoKeywords.text, tier: seoKeywords.priorityTier })
    .from(seoKeywords)
    .where(and(inArray(seoKeywords.projectId, projectIds), eq(seoKeywords.isNegative, false)));
  for (const r of rows) {
    const arr = out.get(r.projectId) ?? [];
    arr.push({ text: r.text, tier: r.tier });
    out.set(r.projectId, arr);
  }
  return out;
}

export function asinCacheKey(accountId: number, specs: AsinWindowSpec[]): string {
  const parts = specs.map((s) => `${s.asin}:${s.before.start}:${s.after.end}`).sort();
  return `${accountId}|${parts.join(",")}`;
}

export async function loadAsinTermWindows(accountId: number, specs: AsinWindowSpec[]): Promise<{ rows: AsinTermWindowRow[]; fetchedAt: Date }> {
  if (specs.length === 0) return { rows: [], fetchedAt: new Date() };
  const cacheKey = asinCacheKey(accountId, specs);
  const [hit] = await db
    .select({ data: reportsCache.data, updatedAt: reportsCache.updatedAt })
    .from(reportsCache)
    .where(and(eq(reportsCache.cacheType, ASIN_CACHE_TYPE), eq(reportsCache.cacheKey, cacheKey)))
    .limit(1);
  if (hit && isFresh(hit.updatedAt, Date.now())) return { rows: hit.data as AsinTermWindowRow[], fetchedAt: hit.updatedAt };
  const rows = await fetchAsinTermWindows(accountId, specs);
  const now = new Date();
  await db
    .insert(reportsCache)
    .values({ cacheType: ASIN_CACHE_TYPE, cacheKey, data: rows, updatedAt: now })
    .onConflictDoUpdate({ target: [reportsCache.cacheType, reportsCache.cacheKey], set: { data: rows, updatedAt: now } });
  return { rows, fetchedAt: now };
}
```

(If `seoKeywords.projectId` is nullable in the schema, add `if (!r.projectId) continue;` in the loop.)

- [ ] **Step 4: Run tests + typecheck**

Run: `node_modules/.bin/vitest run src/lib/seo/asin-live-data.test.ts`
Expected: PASS (4 tests).
Run: `node_modules/.bin/tsc --noEmit > /tmp/t5-tsc.txt 2>&1; grep -c "asin-live-data\|bigquery.ts" /tmp/t5-tsc.txt`
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add -- src/lib/bigquery.ts src/lib/seo/asin-live-data.ts src/lib/seo/asin-live-data.test.ts
git commit -m "feat(seo): loaders for per-ASIN live rows, BigQuery versions and cached PPC windows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/bigquery.ts src/lib/seo/asin-live-data.ts src/lib/seo/asin-live-data.test.ts
```

---

### Task 6: Go-live API (`/api/seo/projects/[id]/live`) + PATCH changes

**Files:**
- Create: `src/app/api/seo/projects/[id]/live/route.ts`
- Test: `src/app/api/seo/projects/[id]/live/route.test.ts`
- Modify: `src/app/api/seo/projects/[id]/route.ts` (PATCH: reject `live`/`deprecated`; remove `live_date` handling and the `live_date` field from `toSnakeCase`; remove the `parseLiveDate` import)
- Modify: `src/app/api/seo/projects/[id]/route.test.ts` (replace the live_date PATCH tests with the new status tests)

**Interfaces:**
- Consumes: Task 2 (`parseVersionFromName`, `planGoLive`, `planNotLive`, `deriveProjectStatus`, `affectedProjectIds`), Task 5 (`loadVersionTexts`, `versionKey`, `loadRowsForAsins`), `parseLiveDate`, `invalidateSeoProjectsCache`.
- Produces (HTTP):
  - `GET` → `200 { projectId, version: number | null, asins: Array<{ asin: string; status: "live" | "deprecated" | null; liveDate: string | null; deprecatedDate: string | null; deprecatedByProjectName: string | null }>, liveCount: number, total: number }`
  - `POST { asins: string[], liveDate: "YYYY-MM-DD" }` → `200 { ok: true, status }` | `400 { error }` | `409 { error, missing?: string[] }` | `502 { error: "Listing versions unavailable" }`
  - `DELETE { asins: string[] }` → `200 { ok: true, status }` | `400`
  - All: 401 no session, 403 below editor.

- [ ] **Step 1: Write the failing route tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  loadVersionTexts: vi.fn(),
  loadRowsForAsins: vi.fn(),
  project: { id: "P", name: "REA_SC_US_01_ReadyRESCUE_v01", clientIdCode: "REA_SC_US" } as Record<string, unknown> | null,
  projectAsins: ["A1", "A2"],
  tx: { ops: [] as string[], fail: null as null | { code: string } },
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: h.getAuthSession }));
vi.mock("@/lib/seo-projects-cache", () => ({ invalidateSeoProjectsCache: vi.fn() }));
vi.mock("@/lib/seo/asin-live-data", () => ({
  loadVersionTexts: h.loadVersionTexts,
  loadRowsForAsins: h.loadRowsForAsins,
  versionKey: (a: string, v: number) => `${a}|${v}`,
}));
vi.mock("./live-db", () => ({
  getProject: async () => h.project,
  getProjectAsins: async () => h.projectAsins,
  applyPlan: async (_p: unknown, _statuses: unknown) => {
    if (h.tx.fail) throw Object.assign(new Error("dup"), h.tx.fail);
    h.tx.ops.push("applied");
    return "live";
  },
  describeProjectAsins: async () => ({ asins: [], liveCount: 0, total: 2 }),
}));

import { GET, POST, DELETE } from "./route";

const ctx = { params: Promise.resolve({ id: "P" }) };
const req = (method: string, body?: unknown) =>
  new NextRequest("http://x/api/seo/projects/P/live", { method, body: body ? JSON.stringify(body) : undefined });

beforeEach(() => {
  vi.clearAllMocks();
  h.project = { id: "P", name: "REA_SC_US_01_ReadyRESCUE_v01", clientIdCode: "REA_SC_US" };
  h.projectAsins = ["A1", "A2"];
  h.tx.ops = [];
  h.tx.fail = null;
  h.getAuthSession.mockResolvedValue({ user: { role: "editor" } });
  h.loadRowsForAsins.mockResolvedValue([]);
  h.loadVersionTexts.mockResolvedValue(new Map([["A1|1", {}], ["A2|1", {}]]));
});

describe("POST live", () => {
  it("viewer → 403", async () => {
    h.getAuthSession.mockResolvedValue({ user: { role: "viewer" } });
    expect((await POST(req("POST", { asins: ["A1"], liveDate: "2026-06-02" }), ctx)).status).toBe(403);
  });
  it("bad date → 400", async () => {
    expect((await POST(req("POST", { asins: ["A1"], liveDate: "1999-01-01" }), ctx)).status).toBe(400);
  });
  it("project name without _vNN → 400", async () => {
    h.project = { id: "P", name: "Coffee SEO", clientIdCode: "TRT_SC_US" };
    expect((await POST(req("POST", { asins: ["A1"], liveDate: "2026-06-02" }), ctx)).status).toBe(400);
  });
  it("ASIN not in project → 400", async () => {
    expect((await POST(req("POST", { asins: ["ZZ"], liveDate: "2026-06-02" }), ctx)).status).toBe(400);
  });
  it("missing export → 409 with the ASIN list, nothing written", async () => {
    h.loadVersionTexts.mockResolvedValue(new Map([["A1|1", {}]]));
    const res = await POST(req("POST", { asins: ["A1", "A2"], liveDate: "2026-06-02" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).missing).toEqual(["A2"]);
    expect(h.tx.ops).toEqual([]);
  });
  it("BigQuery failure → 502 without raw error text", async () => {
    h.loadVersionTexts.mockRejectedValue(new Error("secret BQ detail"));
    const res = await POST(req("POST", { asins: ["A1"], liveDate: "2026-06-02" }), ctx);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
  it("unique-live race → 409 (Review Focus 5)", async () => {
    h.tx.fail = { code: "23505" };
    const res = await POST(req("POST", { asins: ["A1"], liveDate: "2026-06-02" }), ctx);
    expect(res.status).toBe(409);
  });
  it("happy path → 200", async () => {
    const res = await POST(req("POST", { asins: ["A1", "A2"], liveDate: "2026-06-02" }), ctx);
    expect(res.status).toBe(200);
    expect(h.tx.ops).toEqual(["applied"]);
  });
});

describe("DELETE live", () => {
  it("empty asins → 400", async () => {
    expect((await DELETE(req("DELETE", { asins: [] }), ctx)).status).toBe(400);
  });
  it("happy path → 200", async () => {
    expect((await DELETE(req("DELETE", { asins: ["A1"] }), ctx)).status).toBe(200);
  });
});

describe("GET live", () => {
  it("unknown project → 404", async () => {
    h.project = null;
    expect((await GET(req("GET"), ctx)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node_modules/.bin/vitest run "src/app/api/seo/projects/[id]/live/route.test.ts"`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the DB helper** — `src/app/api/seo/projects/[id]/live/live-db.ts`

```ts
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoAsins, seoProjectAsinLive, seoProjects } from "@/lib/db/schema";
import { deriveProjectStatus, type AsinLiveStatus, type GoLivePlan, type NotLivePlan } from "@/lib/seo/asin-live";

export async function getProject(id: string) {
  const [p] = await db.select({ id: seoProjects.id, name: seoProjects.name, clientIdCode: seoProjects.clientIdCode }).from(seoProjects).where(eq(seoProjects.id, id)).limit(1);
  return p ?? null;
}

export async function getProjectAsins(id: string): Promise<string[]> {
  const rows = await db.select({ asin: seoAsins.asin }).from(seoAsins).where(eq(seoAsins.projectId, id));
  return [...new Set(rows.map((r) => r.asin))];
}

/** Applies a go-live or not-live plan and re-derives seo_projects.status for every affected project, in one transaction. Returns the acting project's new status. */
export async function applyPlan(
  input: { clientIdCode: string; projectId: string; plan: GoLivePlan | NotLivePlan },
  affected: string[],
): Promise<string> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const { plan, clientIdCode } = input;
    if ("deprecations" in plan) {
      for (const d of plan.deprecations) {
        await tx.update(seoProjectAsinLive)
          .set({ status: "deprecated", deprecatedDate: d.deprecatedDate, deprecatedByProjectId: d.deprecatedByProjectId, updatedAt: now })
          .where(and(eq(seoProjectAsinLive.projectId, d.projectId), eq(seoProjectAsinLive.asin, d.asin)));
      }
      for (const u of plan.upserts) {
        await tx.insert(seoProjectAsinLive)
          .values({ ...u, clientIdCode, updatedAt: now })
          .onConflictDoUpdate({
            target: [seoProjectAsinLive.projectId, seoProjectAsinLive.asin],
            set: { status: "live", liveDate: u.liveDate, deprecatedDate: null, deprecatedByProjectId: null, versionNumber: u.versionNumber, updatedAt: now },
          });
      }
    } else {
      for (const d of plan.deletes) {
        await tx.delete(seoProjectAsinLive).where(and(eq(seoProjectAsinLive.projectId, d.projectId), eq(seoProjectAsinLive.asin, d.asin)));
      }
      for (const r of plan.restores) {
        await tx.update(seoProjectAsinLive)
          .set({ status: "live", deprecatedDate: null, deprecatedByProjectId: null, updatedAt: now })
          .where(and(eq(seoProjectAsinLive.projectId, r.projectId), eq(seoProjectAsinLive.asin, r.asin)));
      }
    }
    let actingStatus = "completed";
    for (const pid of affected) {
      const rows = await tx.select({ status: seoProjectAsinLive.status }).from(seoProjectAsinLive).where(eq(seoProjectAsinLive.projectId, pid));
      const status = deriveProjectStatus(rows.map((r) => ({ status: r.status as AsinLiveStatus })));
      await tx.update(seoProjects).set({ status, updatedAt: now }).where(eq(seoProjects.id, pid));
      if (pid === input.projectId) actingStatus = status;
    }
    return actingStatus;
  });
}

export async function describeProjectAsins(projectId: string, asins: string[]) {
  const own = asins.length
    ? await db.select().from(seoProjectAsinLive).where(and(eq(seoProjectAsinLive.projectId, projectId), inArray(seoProjectAsinLive.asin, asins)))
    : [];
  const byIds = [...new Set(own.map((r) => r.deprecatedByProjectId).filter((x): x is string => !!x))];
  const names = byIds.length ? await db.select({ id: seoProjects.id, name: seoProjects.name }).from(seoProjects).where(inArray(seoProjects.id, byIds)) : [];
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const list = asins.map((asin) => {
    const r = own.find((x) => x.asin === asin);
    return {
      asin,
      status: (r?.status ?? null) as AsinLiveStatus | null,
      liveDate: r?.liveDate ?? null,
      deprecatedDate: r?.deprecatedDate ?? null,
      deprecatedByProjectName: r?.deprecatedByProjectId ? nameOf.get(r.deprecatedByProjectId) ?? null : null,
    };
  });
  return { asins: list, liveCount: list.filter((a) => a.status === "live").length, total: list.length };
}
```

- [ ] **Step 4: Implement the route** — `src/app/api/seo/projects/[id]/live/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { parseLiveDate } from "@/lib/seo/ppc-status";
import { affectedProjectIds, parseVersionFromName, planGoLive, planNotLive } from "@/lib/seo/asin-live";
import { loadRowsForAsins, loadVersionTexts, versionKey } from "@/lib/seo/asin-live-data";
import { invalidateSeoProjectsCache } from "@/lib/seo-projects-cache";
import { applyPlan, describeProjectAsins, getProject, getProjectAsins } from "./live-db";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

async function guard() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

function asinList(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || !v.every((a) => typeof a === "string" && a.trim())) return null;
  return [...new Set(v.map((a: string) => a.trim()))];
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const asins = await getProjectAsins(id);
  const summary = await describeProjectAsins(id, asins);
  return NextResponse.json({ projectId: id, version: parseVersionFromName(project.name), ...summary });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const date = parseLiveDate(body.liveDate);
  if (!date.ok || !date.value) return NextResponse.json({ error: "liveDate must be YYYY-MM-DD" }, { status: 400 });
  const asins = asinList(body.asins);
  if (!asins) return NextResponse.json({ error: "asins must be a non-empty list" }, { status: 400 });

  const project = await getProject(id);
  if (!project || !project.clientIdCode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const version = parseVersionFromName(project.name);
  if (version == null) return NextResponse.json({ error: "Project name has no version (_vNN)" }, { status: 400 });
  const own = new Set(await getProjectAsins(id));
  if (asins.some((a) => !own.has(a))) return NextResponse.json({ error: "Every ASIN must belong to this project" }, { status: 400 });

  let texts: Map<string, unknown>;
  try {
    texts = await loadVersionTexts(asins.map((asin) => ({ asin, version })));
  } catch {
    return NextResponse.json({ error: "Listing versions unavailable" }, { status: 502 });
  }
  const missing = asins.filter((a) => !texts.has(versionKey(a, version)));
  const tag = `V${String(version).padStart(2, "0")}`;
  if (missing.length) return NextResponse.json({ error: `Export ${tag} for these ASINs first`, missing }, { status: 409 });

  const existing = await loadRowsForAsins(project.clientIdCode, asins);
  const plan = planGoLive(existing, id, asins, date.value, version);
  try {
    const status = await applyPlan({ clientIdCode: project.clientIdCode, projectId: id, plan }, affectedProjectIds(plan, id));
    invalidateSeoProjectsCache();
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") {
      return NextResponse.json({ error: "Another project just went live on this ASIN — reload" }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not save go-live" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const asins = asinList(body.asins);
  if (!asins) return NextResponse.json({ error: "asins must be a non-empty list" }, { status: 400 });
  const project = await getProject(id);
  if (!project || !project.clientIdCode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const existing = await loadRowsForAsins(project.clientIdCode, asins);
  const plan = planNotLive(existing, id, asins);
  try {
    const status = await applyPlan({ clientIdCode: project.clientIdCode, projectId: id, plan }, affectedProjectIds(plan, id));
    invalidateSeoProjectsCache();
    return NextResponse.json({ ok: true, status });
  } catch {
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Update PATCH** in `src/app/api/seo/projects/[id]/route.ts`

Delete the `import { parseLiveDate } from "@/lib/seo/ppc-status";` line, delete `live_date: p.liveDate,` from `toSnakeCase`, delete the whole `if (body.live_date !== undefined) { … }` block, and inside the `if (body.status !== undefined)` block, after the `isProjectStatus` check, add:

```ts
      if (body.status === "live" || body.status === "deprecated") {
        return NextResponse.json({ error: "Use Go live to set live/deprecated" }, { status: 400 });
      }
```

In `src/app/api/seo/projects/[id]/route.test.ts`, remove the `live_date` test cases and add:

```ts
  it("PATCH status live → 400 (derived now)", async () => {
    const res = await PATCH(patchReq({ status: "live" }), ctx);
    expect(res.status).toBe(400);
  });
  it("PATCH status deprecated → 400", async () => {
    const res = await PATCH(patchReq({ status: "deprecated" }), ctx);
    expect(res.status).toBe(400);
  });
```

(Use the request/context helper names that file already defines; if it names them differently, adapt the two calls — the assertions stay the same.)

- [ ] **Step 6: Run tests**

Run: `node_modules/.bin/vitest run "src/app/api/seo/projects/[id]/live/route.test.ts" "src/app/api/seo/projects/[id]/route.test.ts"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -- "src/app/api/seo/projects/[id]/live/route.ts" "src/app/api/seo/projects/[id]/live/live-db.ts" "src/app/api/seo/projects/[id]/live/route.test.ts" "src/app/api/seo/projects/[id]/route.ts" "src/app/api/seo/projects/[id]/route.test.ts"
git commit -m "feat(seo): go-live / not-live per project+ASIN with export gate" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "src/app/api/seo/projects/[id]/live/route.ts" "src/app/api/seo/projects/[id]/live/live-db.ts" "src/app/api/seo/projects/[id]/live/route.test.ts" "src/app/api/seo/projects/[id]/route.ts" "src/app/api/seo/projects/[id]/route.test.ts"
```

---

### Task 7: GET ppc-status v2 (per-ASIN blocks)

**Files:**
- Modify (rewrite): `src/app/api/seo/clients/[clientId]/ppc-status/route.ts`
- Modify (rewrite): `src/app/api/seo/clients/[clientId]/ppc-status/route.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5 (`matchListingKeywords`, `buildAsinBlockRows`, `sectionATotals`, `computeWindows`, `loadClientLiveRows`, `loadVersionTexts`, `versionKey`, `loadS2Keywords`, `loadAsinTermWindows`, `fetchAdGroupShares`), existing `loadSearchTerms`, `loadKeywordInputs`, `buildKeywordSet`, `buildSectionB`.
- Produces (response, consumed by Task 8):

```ts
interface AsinBlock {
  asin: string;
  title: string;               // first 60 chars of ItemName
  projectId: string;
  projectName: string;
  version: number;
  liveDate: string;
  status: "live" | "future";
  windows: { before: DateWindow | null; after: DateWindow | null };
  sharedWith: number;
  rows: AsinBlockRow[];
  totals: { before: PerDay | null; after: PerDay | null; beforeTotals: Metrics; afterTotals: Metrics } | null;
}
interface PpcStatusV2Response {
  accountId: number | null;
  windowDays: WindowDays;
  cachedAt: string;
  gapWindow: DateWindow;
  blocks: AsinBlock[];
  notTracked: string[];        // client ASINs (from seo_asins of its projects) with no live row
  sectionB: SectionB | null;
}
```

Query params: `window` (30|60|90, default 30), `asin` (optional; filters `blocks`).

- [ ] **Step 1: Write the failing route tests** (replace the file)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  getIntentwiseAccountId: vi.fn(),
  loadClientLiveRows: vi.fn(),
  loadVersionTexts: vi.fn(),
  loadS2Keywords: vi.fn(),
  loadAsinTermWindows: vi.fn(),
  fetchAdGroupShares: vi.fn(),
  loadSearchTerms: vi.fn(),
  loadKeywordInputs: vi.fn(),
  clientAsins: [] as string[],
  projectIds: [] as string[],
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: h.getAuthSession }));
vi.mock("@/lib/forecast-redshift", () => ({ getIntentwiseAccountId: h.getIntentwiseAccountId }));
vi.mock("@/lib/seo/asin-live-data", () => ({
  loadClientLiveRows: h.loadClientLiveRows,
  loadVersionTexts: h.loadVersionTexts,
  loadS2Keywords: h.loadS2Keywords,
  loadAsinTermWindows: h.loadAsinTermWindows,
  versionKey: (a: string, v: number) => `${a}|${v}`,
}));
vi.mock("@/lib/ppc-queries", () => ({ fetchAdGroupShares: h.fetchAdGroupShares }));
vi.mock("@/lib/seo/ppc-status-data", () => ({ loadSearchTerms: h.loadSearchTerms, loadKeywordInputs: h.loadKeywordInputs }));
vi.mock("./client-scope", () => ({ loadClientScope: async () => ({ projectIds: h.projectIds, asins: h.clientAsins }) }));

import { GET } from "./route";

const call = (qs = "") => GET(new NextRequest(`http://x/api/seo/clients/REA_SC_US/ppc-status${qs}`), { params: Promise.resolve({ clientId: "REA_SC_US" }) });
const live = (asin: string, liveDate: string) => ({ projectId: "P", projectName: "REA_v01", asin, status: "live", liveDate, deprecatedDate: null, deprecatedByProjectId: null, versionNumber: 1 });
const text = { title: "Dog First Aid Kit for travel", bullets: "activated charcoal", description: "", backend: "" };

beforeEach(() => {
  vi.clearAllMocks();
  h.clientAsins = ["A1", "A2", "A3"];
  h.projectIds = ["P"];
  h.getAuthSession.mockResolvedValue({ user: { role: "editor" } });
  h.getIntentwiseAccountId.mockResolvedValue(1899670);
  h.loadClientLiveRows.mockResolvedValue([live("A1", "2026-06-02"), live("A2", "2099-01-01")]);
  h.loadVersionTexts.mockResolvedValue(new Map([["A1|1", text], ["A2|1", text]]));
  h.loadS2Keywords.mockResolvedValue(new Map([["P", [{ text: "dog first aid kit", tier: "T1" }, { text: "activated charcoal", tier: "T2" }, { text: "cat toy", tier: "T3" }]]]));
  h.loadAsinTermWindows.mockResolvedValue({ rows: [{ asin: "A1", search_term: "dog first aid kit", win: "after", ad_impressions: 30, ad_clicks: 3, ad_spend: 3, ad_revenue: 30, ad_orders: 1 }], fetchedAt: new Date("2026-09-28T23:03:00Z") });
  h.fetchAdGroupShares.mockResolvedValue([{ asin: "A1", shared_with: 2 }]);
  h.loadSearchTerms.mockResolvedValue({ rows: [], fetchedAt: new Date("2026-09-28T22:00:00Z") });
  h.loadKeywordInputs.mockResolvedValue({ s6: [], s2: [] });
});

describe("GET ppc-status v2", () => {
  it("viewer → 403", async () => {
    h.getAuthSession.mockResolvedValue({ user: { role: "viewer" } });
    expect((await call()).status).toBe(403);
  });
  it("one block per live ASIN, tracked keywords only, not-tracked list, shared note, oldest cachedAt", async () => {
    const body = await (await call("?window=30")).json();
    expect(body.blocks.map((b: { asin: string }) => b.asin)).toEqual(["A1", "A2"]);
    const a1 = body.blocks[0];
    expect(a1.rows.map((r: { keyword: string }) => r.keyword).sort()).toEqual(["activated charcoal", "dog first aid kit"]);
    expect(a1.sharedWith).toBe(2);
    expect(a1.totals.afterTotals.sales).toBe(30);
    expect(body.notTracked).toEqual(["A3"]);
    expect(body.cachedAt).toBe("2026-09-28T22:00:00.000Z");
  });
  it("future go-live → status future, no windows, no rows fetched for it (Review Focus 4)", async () => {
    const body = await (await call()).json();
    const a2 = body.blocks.find((b: { asin: string }) => b.asin === "A2");
    expect(a2.status).toBe("future");
    expect(a2.totals).toBeNull();
    const specs = h.loadAsinTermWindows.mock.calls[0][1];
    expect(specs.map((s: { asin: string }) => s.asin)).toEqual(["A1"]);
  });
  it("asin filter narrows blocks", async () => {
    const body = await (await call("?asin=A1")).json();
    expect(body.blocks.map((b: { asin: string }) => b.asin)).toEqual(["A1"]);
  });
  it("no PPC account → 200 accountId null, no Redshift", async () => {
    h.getIntentwiseAccountId.mockResolvedValue(null);
    const body = await (await call()).json();
    expect(body.accountId).toBeNull();
    expect(h.loadAsinTermWindows).not.toHaveBeenCalled();
  });
  it("BigQuery failure → 502 without raw text", async () => {
    h.loadVersionTexts.mockRejectedValue(new Error("secret"));
    const res = await call();
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
  it("Redshift failure → 502 without raw text", async () => {
    h.loadAsinTermWindows.mockRejectedValue(new Error("secret rs"));
    const res = await call();
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node_modules/.bin/vitest run "src/app/api/seo/clients/[clientId]/ppc-status/route.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Implement the client-scope helper** — `src/app/api/seo/clients/[clientId]/ppc-status/client-scope.ts`

```ts
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoAsins, seoProjects } from "@/lib/db/schema";

/** The client's SEO project ids and the distinct ASINs across them. */
export async function loadClientScope(clientId: string): Promise<{ projectIds: string[]; asins: string[] }> {
  const projects = await db.select({ id: seoProjects.id }).from(seoProjects).where(eq(seoProjects.clientIdCode, clientId));
  const projectIds = projects.map((p) => p.id);
  if (projectIds.length === 0) return { projectIds, asins: [] };
  const rows = await db.select({ asin: seoAsins.asin }).from(seoAsins).where(inArray(seoAsins.projectId, projectIds));
  return { projectIds, asins: [...new Set(rows.map((r) => r.asin))].sort() };
}
```

- [ ] **Step 4: Implement the route** (replace the whole file)

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { getIntentwiseAccountId } from "@/lib/forecast-redshift";
import { fetchAdGroupShares, type AsinWindowSpec } from "@/lib/ppc-queries";
import { loadSearchTerms, loadKeywordInputs } from "@/lib/seo/ppc-status-data";
import { loadAsinTermWindows, loadClientLiveRows, loadS2Keywords, loadVersionTexts, versionKey } from "@/lib/seo/asin-live-data";
import { matchListingKeywords, type ListingText } from "@/lib/seo/listing-match";
import { buildAsinBlockRows, buildKeywordSet, buildSectionB, computeWindows, sectionATotals, type WindowDays } from "@/lib/seo/ppc-status";
import { loadClientScope } from "./client-scope";

export const maxDuration = 120;

const WINDOWS: WindowDays[] = [30, 60, 90];

export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { clientId } = await params;
  const sp = req.nextUrl.searchParams;
  const n = (WINDOWS.find((w) => String(w) === sp.get("window")) ?? 30) as WindowDays;
  const asinFilter = sp.get("asin");
  const today = new Date().toISOString().slice(0, 10);

  const [scope, liveRows] = await Promise.all([loadClientScope(clientId), loadClientLiveRows(clientId)]);
  const liveAsins = new Set(liveRows.map((r) => r.asin));
  const notTracked = scope.asins.filter((a) => !liveAsins.has(a));
  const shown = asinFilter ? liveRows.filter((r) => r.asin === asinFilter) : liveRows;
  const gapWindow = computeWindows(null, n, today).gapWindow;

  let texts: Map<string, ListingText>;
  try {
    texts = await loadVersionTexts(shown.map((r) => ({ asin: r.asin, version: r.versionNumber })));
  } catch {
    return NextResponse.json({ error: "Listing versions unavailable" }, { status: 502 });
  }
  const s2 = await loadS2Keywords([...new Set(shown.map((r) => r.projectId))]);

  const planned = shown.map((r) => {
    const w = computeWindows(r.liveDate, n, today);
    const text = texts.get(versionKey(r.asin, r.versionNumber));
    return {
      r,
      w,
      title: (text?.title ?? "").slice(0, 60),
      tracked: text ? matchListingKeywords(s2.get(r.projectId) ?? [], text) : [],
    };
  });

  const accountId = await getIntentwiseAccountId(clientId);
  const base = { windowDays: n, gapWindow, notTracked };
  if (accountId == null) {
    return NextResponse.json({ ...base, accountId: null, cachedAt: new Date().toISOString(), blocks: [], sectionB: null });
  }

  try {
    const specs: AsinWindowSpec[] = planned
      .filter((p) => p.w.status === "live" && p.w.before && p.w.after)
      .map((p) => ({ asin: p.r.asin, before: p.w.before!, after: p.w.after! }));
    const [win, shares, gap, kwInputs] = await Promise.all([
      loadAsinTermWindows(accountId, specs),
      fetchAdGroupShares(accountId, shown.map((r) => r.asin)),
      loadSearchTerms(accountId, gapWindow),
      loadKeywordInputs(scope.projectIds),
    ]);
    const shareOf = new Map(shares.map((s) => [s.asin, Number(s.shared_with) || 0]));
    const blocks = planned
      .map(({ r, w, title, tracked }) => {
        const isLive = w.status === "live" && w.before && w.after;
        const rows = isLive ? buildAsinBlockRows(tracked, win.rows.filter((x) => x.asin === r.asin), w.before!, w.after!) : [];
        return {
          asin: r.asin,
          title,
          projectId: r.projectId,
          projectName: r.projectName,
          version: r.versionNumber,
          liveDate: r.liveDate,
          status: isLive ? ("live" as const) : ("future" as const),
          windows: { before: w.before, after: w.after },
          sharedWith: shareOf.get(r.asin) ?? 0,
          rows,
          totals: isLive ? sectionATotals(rows, w.before!, w.after!) : null,
        };
      })
      .sort((a, b) => (b.totals?.afterTotals.sales ?? -1) - (a.totals?.afterTotals.sales ?? -1));
    const cachedAt = new Date(Math.min(win.fetchedAt.getTime(), gap.fetchedAt.getTime())).toISOString();
    const { entries } = buildKeywordSet(kwInputs);
    return NextResponse.json({ ...base, accountId, cachedAt, blocks, sectionB: buildSectionB(entries, gap.rows) });
  } catch {
    return NextResponse.json({ error: "PPC data unavailable" }, { status: 502 });
  }
}
```

- [ ] **Step 5: Run tests**

Run: `node_modules/.bin/vitest run "src/app/api/seo/clients/[clientId]/ppc-status/route.test.ts"`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add -- "src/app/api/seo/clients/[clientId]/ppc-status/route.ts" "src/app/api/seo/clients/[clientId]/ppc-status/route.test.ts" "src/app/api/seo/clients/[clientId]/ppc-status/client-scope.ts"
git commit -m "feat(seo): ppc-status returns one block per live ASIN" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "src/app/api/seo/clients/[clientId]/ppc-status/route.ts" "src/app/api/seo/clients/[clientId]/ppc-status/route.test.ts" "src/app/api/seo/clients/[clientId]/ppc-status/client-scope.ts"
```

---

### Task 8: PPC Status tab v2 (stacked by ASIN)

**Files:**
- Create: `src/components/seo/ppc-status/asin-block-card.tsx`
- Modify: `src/components/seo/ppc-status/ppc-status-tab.tsx` — replace types, controls and Section A; keep `SectionBCard`, `PpcStatusSkeleton`, `fmtNum`, `fmtRoas`, `fmtCachedAt`, `shortDate` unchanged.
- Test: `src/components/seo/ppc-status/format.test.ts` (extend with `blockWindowLabel`)
- Modify: `src/components/seo/ppc-status/format.ts` (add `blockWindowLabel`)

**Interfaces:**
- Consumes: `PpcStatusV2Response` / `AsinBlock` shapes from Task 7 (redeclare them as local TS interfaces in the tab file — route files are not imported by client components), `AsinBlockRow` type from `@/lib/seo/ppc-status`.
- Produces: `blockWindowLabel(windows: { before: DateWindow | null; after: DateWindow | null }, n: WindowDays, liveDate: string, status: "live" | "future"): string`

- [ ] **Step 1: Write the failing format test** (append to `format.test.ts`)

```ts
import { blockWindowLabel } from "./format";

describe("blockWindowLabel", () => {
  it("live with a full after window", () => {
    expect(blockWindowLabel({ before: { start: "2026-05-03", end: "2026-06-01", days: 30 }, after: { start: "2026-06-02", end: "2026-07-01", days: 30 } }, 30, "2026-06-02", "live"))
      .toBe("Before 2026-05-03 → 06-01 · After 06-02 → 07-01 (30 days)");
  });
  it("live today", () => {
    expect(blockWindowLabel({ before: { start: "2026-08-30", end: "2026-09-28", days: 30 }, after: { start: "2026-09-29", end: "2026-09-28", days: 0 } }, 30, "2026-09-29", "live"))
      .toBe("Live today — no after-window yet");
  });
  it("future", () => {
    expect(blockWindowLabel({ before: null, after: null }, 30, "2099-01-01", "future")).toBe("Goes live on 2099-01-01");
  });
});
```

- [ ] **Step 2: Run to verify it fails**, then **implement** in `format.ts`:

```ts
import type { DateWindow, WindowDays } from "@/lib/seo/ppc-status";

export function blockWindowLabel(
  windows: { before: DateWindow | null; after: DateWindow | null },
  n: WindowDays,
  liveDate: string,
  status: "live" | "future",
): string {
  if (status === "future" || !windows.before || !windows.after) return `Goes live on ${liveDate}`;
  if (windows.after.days === 0) return "Live today — no after-window yet";
  const { before, after } = windows;
  return `Before ${before.start} → ${before.end.slice(5)} · After ${after.start.slice(5)} → ${after.end.slice(5)} (${n} days)`;
}
```

Run: `node_modules/.bin/vitest run src/components/seo/ppc-status/format.test.ts` → PASS.

- [ ] **Step 3: Create `asin-block-card.tsx`**

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AsinBlockRow, DateWindow, Metrics, PerDay, WindowDays } from "@/lib/seo/ppc-status";
import { blockWindowLabel, fmtAvg, fmtDelta, fmtMoney } from "./format";

export interface AsinBlock {
  asin: string;
  title: string;
  projectId: string;
  projectName: string;
  version: number;
  liveDate: string;
  status: "live" | "future";
  windows: { before: DateWindow | null; after: DateWindow | null };
  sharedWith: number;
  rows: AsinBlockRow[];
  totals: { before: PerDay | null; after: PerDay | null; beforeTotals: Metrics; afterTotals: Metrics } | null;
}

const FIELD_LABEL: Record<string, string> = { T: "Title", B: "Bullets", D: "Description", K: "Backend" };

function fmtImpr(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
function roas(m: Metrics): string {
  return m.roas == null ? "—" : `${m.roas.toFixed(2)}x`;
}

function MetricCells({ before, after }: { before: PerDay | null; after: PerDay | null }) {
  const cell = (fmt: (n: number) => string, k: keyof PerDay) => (
    <>
      <TableCell className="text-right tabular-nums">{before ? fmt(before[k]) : "—"}</TableCell>
      <TableCell className="text-right tabular-nums">{after ? fmt(after[k]) : "—"}</TableCell>
      <TableCell className="text-right tabular-nums">{fmtDelta(before?.[k] ?? null, after?.[k] ?? null)}</TableCell>
    </>
  );
  return (
    <>
      {cell(fmtImpr, "impressions")}
      {cell(fmtAvg, "clicks")}
      {cell(fmtMoney, "spend")}
      {cell(fmtAvg, "orders")}
      {cell(fmtMoney, "sales")}
    </>
  );
}

export function AsinBlockCard({ block, windowDays }: { block: AsinBlock; windowDays: WindowDays }) {
  const tag = `V${String(block.version).padStart(2, "0")}`;
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="font-mono">{block.asin}</span>
          <span className="truncate font-normal text-muted-foreground" title={block.title}>{block.title}</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {block.projectName} · {tag} · live {block.liveDate} · {blockWindowLabel(block.windows, windowDays, block.liveDate, block.status)}
          {block.sharedWith > 0 && ` · ad group also advertises ${block.sharedWith} other ASIN${block.sharedWith === 1 ? "" : "s"}`}
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {block.status === "future" ? null : block.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No tracked keywords found in {tag}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Tier</TableHead>
                {["Impr", "Clicks", "Spend", "Orders", "Sales"].flatMap((m) => [
                  <TableHead key={`${m}b`} className="text-right">{m} before</TableHead>,
                  <TableHead key={`${m}a`} className="text-right">{m} after</TableHead>,
                  <TableHead key={`${m}d`} className="text-right">{m} Δ</TableHead>,
                ])}
                <TableHead className="text-right">ROAS before → after</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((r) => (
                <TableRow key={r.keyword}>
                  <TableCell>{r.keyword}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.fields.map((f) => (
                        <span key={f} title={FIELD_LABEL[f]} className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold text-stone-600 dark:bg-zinc-800 dark:text-zinc-300">{f}</span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{r.tier ?? "—"}</TableCell>
                  <MetricCells before={r.before} after={r.after} />
                  <TableCell className="text-right tabular-nums">{roas(r.beforeTotals)} → {roas(r.afterTotals)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {block.totals && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell />
                  <TableCell />
                  <MetricCells before={block.totals.before} after={block.totals.after} />
                  <TableCell className="text-right tabular-nums">{roas(block.totals.beforeTotals)} → {roas(block.totals.afterTotals)}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Rewrite the tab's state, controls and Section A** in `ppc-status-tab.tsx`

Replace the `ProjectOption`, `SectionATotalsResponse`, `PpcStatusResponse` interfaces with:

```ts
import { AsinBlockCard, type AsinBlock } from "./asin-block-card";

interface PpcStatusResponse {
  accountId: number | null;
  windowDays: WindowDays;
  cachedAt: string;
  gapWindow: DateWindow;
  blocks: AsinBlock[];
  notTracked: string[];
  sectionB: SectionB | null;
}
```

Delete `windowLabel`, the whole `SectionACard` function, and the project `Select`, go-live date `Input`, `saveLiveDate`/date state and handlers from `PpcStatusTab`. The component keeps: `windowDays` state, `asin` filter state (`"all"` default), the `AbortController` fetch effect, error + Retry, loading skeleton, `fmtCachedAt`. The fetch URL becomes:

```ts
`/api/seo/clients/${clientId}/ppc-status?window=${windowDays}${asin === "all" ? "" : `&asin=${encodeURIComponent(asin)}`}`
```

The header controls become: an ASIN `Select` (items: "All ASINs" + one item per ASIN in `data.blocks` — keep the list from the last unfiltered response in a `useState<string[]>` so filtering does not shrink the dropdown), the existing 30/60/90 pills, the "Data as of" note. The body (replacing `<SectionACard … />`) becomes:

```tsx
        <>
          {data.blocks.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No live SEO versions for this client yet — mark a project live from its status pill.
              </CardContent>
            </Card>
          ) : (
            data.blocks.map((b) => <AsinBlockCard key={b.asin} block={b} windowDays={windowDays} />)
          )}
          <p className="text-[11px] text-muted-foreground">
            PPC numbers per ASIN come from the ad groups that advertise it today (current ad-group membership, not history).
          </p>
          {data.notTracked.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Not tracked — no live version</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {data.notTracked.map((a) => (
                  <span key={a} className="rounded-full bg-stone-100 px-2 py-0.5 font-mono text-[11px] text-stone-600 dark:bg-zinc-800 dark:text-zinc-300">{a}</span>
                ))}
              </CardContent>
            </Card>
          )}
          <SectionBCard sectionB={data.sectionB} />
        </>
```

Remove imports that become unused (`Input`, `toast` if no longer used, `SectionARow`, `PerDay`, `Metrics`, `TableFooter` if unused).

- [ ] **Step 5: Gates**

Run: `node_modules/.bin/vitest run src/components/seo/ppc-status/format.test.ts`
Expected: PASS.
Run: `node_modules/.bin/tsc --noEmit > /tmp/t8-tsc.txt 2>&1; grep -c "components/seo/ppc-status" /tmp/t8-tsc.txt` → `0`.
Run: `node_modules/.bin/eslint src/components/seo/ppc-status/` → no errors.

- [ ] **Step 6: Commit**

```bash
git add -- src/components/seo/ppc-status/asin-block-card.tsx src/components/seo/ppc-status/ppc-status-tab.tsx src/components/seo/ppc-status/format.ts src/components/seo/ppc-status/format.test.ts
git commit -m "feat(seo): PPC Status tab stacked by live ASIN" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/seo/ppc-status/asin-block-card.tsx src/components/seo/ppc-status/ppc-status-tab.tsx src/components/seo/ppc-status/format.ts src/components/seo/ppc-status/format.test.ts
```

---

### Task 9: Go-live popover from the project status pill

**Files:**
- Create: `src/components/seo/go-live-popover.tsx`
- Modify: `src/components/seo/project-status-picker.tsx`
- Test: `src/lib/seo/project-status.test.ts` (extend) and `src/lib/seo/project-status.ts` (add `MANUAL_PROJECT_STATUSES`)

**Interfaces:**
- Consumes: Task 6 HTTP (`GET/POST/DELETE /api/seo/projects/[id]/live`).
- Produces: `MANUAL_PROJECT_STATUSES` = `["draft", "in_progress", "completed", "archived"]`; `<GoLivePopover projectId onClose onUpdated(status) />`.

- [ ] **Step 1: Failing test** (append to `project-status.test.ts`)

```ts
import { MANUAL_PROJECT_STATUSES } from "./project-status";

describe("MANUAL_PROJECT_STATUSES", () => {
  it("excludes the derived live/deprecated statuses", () => {
    expect(MANUAL_PROJECT_STATUSES).toEqual(["draft", "in_progress", "completed", "archived"]);
  });
});
```

- [ ] **Step 2: Implement** in `project-status.ts`:

```ts
/** Statuses a person picks by hand; live/deprecated are derived from per-ASIN go-live (spec §5). */
export const MANUAL_PROJECT_STATUSES = PROJECT_STATUSES.filter(
  (s) => s !== "live" && s !== "deprecated",
) as ProjectStatus[];
```

Run: `node_modules/.bin/vitest run src/lib/seo/project-status.test.ts` → PASS.

- [ ] **Step 3: Create `go-live-popover.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ProjectStatus } from "@/lib/seo-pipeline-types";

interface AsinState {
  asin: string;
  status: "live" | "deprecated" | null;
  liveDate: string | null;
  deprecatedDate: string | null;
  deprecatedByProjectName: string | null;
}
interface LiveInfo { version: number | null; asins: AsinState[]; liveCount: number; total: number }

export function GoLivePopover({ projectId, onUpdated }: { projectId: string; onUpdated: (s: ProjectStatus) => void }) {
  const [info, setInfo] = useState<LiveInfo | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch(`/api/seo/projects/${projectId}/live`);
    if (!res.ok) { toast.error("Could not load go-live state"); return; }
    setInfo(await res.json());
  }
  useEffect(() => { void load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(method: "POST" | "DELETE") {
    if (picked.size === 0 || saving) return;
    if (method === "POST" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast.error("Pick a go-live date"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/seo/projects/${projectId}/live`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "POST" ? { asins: [...picked], liveDate: date } : { asins: [...picked] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const extra = Array.isArray(body.missing) && body.missing.length ? `: ${body.missing.join(", ")}` : "";
        throw new Error(`${body.error || "Save failed"}${extra}`);
      }
      onUpdated(body.status as ProjectStatus);
      setPicked(new Set());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!info) return <div className="p-3"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>;
  const tag = info.version == null ? "no version" : `V${String(info.version).padStart(2, "0")}`;
  return (
    <div className="w-72 space-y-2 p-3 text-xs">
      <p className="font-semibold">Go live · {tag} · {info.liveCount}/{info.total} ASINs live</p>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {info.asins.map((a) => (
          <li key={a.asin} className="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label={`Select ${a.asin}`}
              checked={picked.has(a.asin)}
              onChange={(e) => setPicked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(a.asin); else n.delete(a.asin); return n; })}
            />
            <span className="font-mono">{a.asin}</span>
            <span className="text-muted-foreground">
              {a.status === "live" ? `live ${a.liveDate}` : a.status === "deprecated" ? `deprecated ${a.deprecatedDate}${a.deprecatedByProjectName ? ` by ${a.deprecatedByProjectName}` : ""}` : "not live"}
            </span>
          </li>
        ))}
      </ul>
      <input
        type="date"
        aria-label="Go-live date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void send("POST"); }}
        className="w-full rounded-full border border-stone-300 px-3 py-1 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div className="flex gap-2">
        <button type="button" disabled={saving || picked.size === 0} onClick={() => void send("POST")} className="rounded-full bg-brand px-3 py-1 font-semibold text-brand-foreground disabled:opacity-50">
          Mark live
        </button>
        <button type="button" disabled={saving || picked.size === 0} onClick={() => void send("DELETE")} className="rounded-full border border-stone-300 px-3 py-1 disabled:opacity-50 dark:border-zinc-700">
          Mark not live
        </button>
        {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Saving" />}
      </div>
    </div>
  );
}
```

(Save is explicit — the Mark live button or Enter in the date field — so the date is never saved mid-typing.)

- [ ] **Step 4: Wire it into `ProjectStatusPicker`**

In `project-status-picker.tsx`: import `MANUAL_PROJECT_STATUSES` instead of `PROJECT_STATUSES` for the option list, add `const [goLiveOpen, setGoLiveOpen] = useState(false);`, render the options from `MANUAL_PROJECT_STATUSES`, and add one extra option at the end of the listbox:

```tsx
          <button
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => { setOpen(false); setGoLiveOpen(true); }}
            className="w-full px-3 py-1.5 text-left hover:bg-stone-50 dark:hover:bg-zinc-800"
          >
            <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-bold ${projectStatusClass("live")}`}>go live…</span>
          </button>
```

and, next to the existing `{open && (…)}` block:

```tsx
      {goLiveOpen && (
        <div
          className="absolute right-0 top-full mt-1 z-30 rounded-lg border border-stone-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <GoLivePopover projectId={projectId} onUpdated={(s) => onUpdated?.(s)} />
        </div>
      )}
```

Change the outside-click hook to close both: `useOutsideClick<HTMLDivElement>(() => { setOpen(false); setGoLiveOpen(false); }, open || goLiveOpen)`.

- [ ] **Step 5: Gates**

Run: `node_modules/.bin/vitest run src/lib/seo/project-status.test.ts` → PASS.
Run: `node_modules/.bin/tsc --noEmit > /tmp/t9-tsc.txt 2>&1; grep -c "go-live-popover\|project-status" /tmp/t9-tsc.txt` → `0`.
Run: `node_modules/.bin/eslint src/components/seo/go-live-popover.tsx src/components/seo/project-status-picker.tsx src/lib/seo/project-status.ts` → clean.

- [ ] **Step 6: Commit**

```bash
git add -- src/components/seo/go-live-popover.tsx src/components/seo/project-status-picker.tsx src/lib/seo/project-status.ts src/lib/seo/project-status.test.ts
git commit -m "feat(seo): go-live popover on the project status pill" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/seo/go-live-popover.tsx src/components/seo/project-status-picker.tsx src/lib/seo/project-status.ts src/lib/seo/project-status.test.ts
```

---

### Task 10: Whole-branch gates + browser pass (Manu-gated)

**Files:** none (verification only; any fix goes through the review loop).

- [ ] **Step 1: Covering test files**

Run: `node_modules/.bin/vitest run src/lib/seo/asin-live.test.ts src/lib/seo/listing-match.test.ts src/lib/seo/asin-live-data.test.ts src/lib/seo/ppc-status.test.ts src/lib/seo/ppc-status-data.test.ts src/lib/ppc-queries.test.ts src/lib/seo/project-status.test.ts "src/app/api/seo/projects/[id]/live/route.test.ts" "src/app/api/seo/projects/[id]/route.test.ts" "src/app/api/seo/clients/[clientId]/ppc-status/route.test.ts" src/components/seo/ppc-status/format.test.ts`
Expected: all PASS.

- [ ] **Step 2: tsc + eslint** — tsc by filename against the Global Constraints baseline (0 errors in branch files); eslint on every file touched by Tasks 1–9.

- [ ] **Step 3: STOP — ask Manu for three separate OKs**, in this order: (a) apply migration 0121 to prod (`node_modules/.bin/tsx scripts/_apply-0121.ts`, from a worktree with an env file); (b) confirm ReadyRESCUE v01 has been exported to BigQuery (V01 rows for its ASINs); (c) mark v01 live on its ASINs with 2026-06-02 (prod write).

- [ ] **Step 4: Headless browser pass on PORT 3100** (minted-JWT recipe, `scripts/_tmp-aa-sectiona.ts` adapted): `/seo/clients/REA_SC_US` → PPC Status shows one block per live ASIN with field pills, totals row, shared-ad-group note on the three new ASINs, "Not tracked" list, Gaps section, 0 JS errors; status pill on the ReadyRESCUE v01 card reads `live` and the popover shows k/n.
