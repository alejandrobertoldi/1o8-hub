# Hub Status Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public `/status` page showing 1o8Hub platform features grouped into Done / In Progress / Planned columns, backed by a `hub_features` Supabase table managed via Drizzle Studio.

**Architecture:** A new `hub_features` table in Supabase stores features with status, progress %, domain tag, and display order. A Next.js RSC at `/status` queries the table directly and renders three columns — no API route, no auth. A seed script populates the initial feature list.

**Tech Stack:** Drizzle ORM, Supabase PostgreSQL, Next.js 15 RSC, Tailwind CSS 4, shadcn/ui

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/db/schema.ts` | Modify | Add `hubFeatureStatusEnum` + `hubFeatures` table + exported types |
| `drizzle/migrations/` | Generated | Migration for the new table (do not create manually) |
| `src/app/status/page.tsx` | Create | Public RSC — fetches + renders 3-column board; exports `groupByStatus` helper |
| `src/app/status/page.test.ts` | Create | Unit tests for `groupByStatus` |
| `scripts/seed-hub-features.ts` | Create | Idempotent seed script with initial feature list |
| `package.json` | Modify | Add `seed-hub-features` script |
| `src/proxy.ts` | Modify | Whitelist `/status` as a public path (no auth required) |
| `src/components/layout/layout-router.tsx` | Modify | Render `/status` without hub top nav |

---

## Task 1: Add `hub_features` to schema.ts

**Files:**
- Modify: `src/lib/db/schema.ts` (add after existing enums, ~line 70; add table at end of file)

- [ ] **Step 1: Read the bottom of schema.ts to find the correct insertion point**

```bash
tail -10 src/lib/db/schema.ts
```

Expected: last table definition + exported types.

- [ ] **Step 2: Add the enum after existing enums (~line 70 in schema.ts)**

Find the block of enum declarations (ends around `ganttTaskStatusEnum`). Add immediately after:

```typescript
export const hubFeatureStatusEnum = pgEnum("hub_feature_status", [
  "done",
  "in_progress",
  "planned",
]);
```

- [ ] **Step 3: Add the table and types at the end of schema.ts**

```typescript
// ─── Hub Status Tracker ──────────────────────────────────────────────
export const hubFeatures = pgTable(
  "hub_features",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description").notNull(),
    status: hubFeatureStatusEnum("status").notNull(),
    progress: integer("progress").notNull().default(0),
    domain: varchar("domain", { length: 50 }).notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_hub_features_status").on(t.status),
    index("idx_hub_features_domain").on(t.domain),
  ]
);

export type HubFeature = typeof hubFeatures.$inferSelect;
export type NewHubFeature = typeof hubFeatures.$inferInsert;
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: the 3 pre-existing errors only — no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat(schema): add hub_features table for platform status tracker

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Generate and run the migration

> ⚠️ **PROD WARNING:** `DATABASE_URL` in `.env.local` points to production Supabase. `db:migrate` will execute against live data. Do not proceed without explicit user confirmation.

**Files:**
- Generated: `drizzle/migrations/` (new file, auto-named by Drizzle)

- [ ] **Step 1: Generate the migration**

```bash
npm run db:generate
```

Expected: a new file in `drizzle/migrations/` containing `CREATE TYPE hub_feature_status` and `CREATE TABLE hub_features`.

- [ ] **Step 2: Inspect the generated migration**

```bash
ls -t drizzle/migrations/*.sql | head -1 | xargs cat
```

Verify it contains:
- `CREATE TYPE "public"."hub_feature_status" AS ENUM('done', 'in_progress', 'planned');`
- `CREATE TABLE "hub_features"` with all expected columns
- No unexpected DROP or ALTER statements

- [ ] **Step 3: Confirm with user before running**

Stop here and ask the user: "Migration looks correct — ready to run `npm run db:migrate` against production Supabase?"

- [ ] **Step 4: Run the migration (only after user confirmation)**

```bash
npm run db:migrate
```

Expected: `[✓] Migrations applied` or similar success output, no errors.

- [ ] **Step 5: Commit the migration file**

```bash
git add drizzle/migrations/
git commit -m "$(cat <<'EOF'
feat(db): migration for hub_features table

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Seed script

**Files:**
- Create: `scripts/seed-hub-features.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the seed script**

Create `scripts/seed-hub-features.ts`:

```typescript
/* eslint-disable react-doctor/async-parallel */
/**
 * Seeds hub_features with the initial platform feature list.
 * Idempotent: upserts on name. Safe to re-run.
 * Usage: npm run seed-hub-features
 */
import { config } from "dotenv";
config({ path: ".env.local" });

type FeatureStatus = "done" | "in_progress" | "planned";

interface FeatureSeed {
  name: string;
  description: string;
  status: FeatureStatus;
  progress: number;
  domain: string;
  displayOrder: number;
}

const features: FeatureSeed[] = [
  // ── Done ──────────────────────────────────────────────────────────
  { name: "Auth & Roles", description: "NextAuth v5, Google OAuth, 5 roles (admin/editor/viewer/client/pending)", status: "done", progress: 100, domain: "Platform", displayOrder: 10 },
  { name: "Product Catalog", description: "Full CRUD, inline editing, 972-column registry with JSONB blobs", status: "done", progress: 100, domain: "Products", displayOrder: 20 },
  { name: "Variations Builder", description: "Hierarchical grouping: exclusive groups + cross-cutting tags, auto-detect, bulk assign", status: "done", progress: 100, domain: "Products", displayOrder: 30 },
  { name: "A+ Content Editor", description: "Up to 7 modules per product, image slots, Google Drive upload, comments", status: "done", progress: 100, domain: "A+", displayOrder: 40 },
  { name: "SEO Pipeline (S1–S6)", description: "Full 6-phase pipeline: intake → keywords → reviews → Rufus Q&A → COSMO → content gen", status: "done", progress: 100, domain: "SEO", displayOrder: 50 },
  { name: "SEO Manager", description: "Content Control Center, per-client detail views, Score Now, backend keyword refine", status: "done", progress: 100, domain: "SEO", displayOrder: 60 },
  { name: "Finance Dashboard", description: "Redshift settlement data, Sankey revenue flow, hub + client portal views", status: "done", progress: 100, domain: "Finance", displayOrder: 70 },
  { name: "Client Portal", description: "Client-facing views: A+ approval, reports, sales, finance statements", status: "done", progress: 100, domain: "Portal", displayOrder: 80 },
  { name: "Amazon Sync", description: "SP-API + Rainforest comparisons, discrepancy tracking per ASIN", status: "done", progress: 100, domain: "Platform", displayOrder: 90 },
  { name: "BigQuery Publishing", description: "Dirty-row tracking, full WRITE_TRUNCATE table write-back to BQ", status: "done", progress: 100, domain: "Platform", displayOrder: 100 },
  { name: "Reports & Export", description: "PDF, XLSX, DOCX generation for client reports", status: "done", progress: 100, domain: "Platform", displayOrder: 110 },
  { name: "Admin Panel", description: "User management, event log, AI config (model/prompts)", status: "done", progress: 100, domain: "Admin", displayOrder: 120 },
  { name: "Client Management", description: "Onboarding/offboarding dates, status tracking, Asana sync", status: "done", progress: 100, domain: "Clients", displayOrder: 130 },
  { name: "Onboarding Gantt Chart", description: "AIA/NTA onboarding timeline templates with visual Gantt view", status: "done", progress: 100, domain: "Clients", displayOrder: 140 },
  { name: "Design Status Tracker", description: "Per-client design status for brand story, A+, listing images, storefront", status: "done", progress: 100, domain: "Platform", displayOrder: 150 },
  { name: "Google Drive Integration", description: "File upload and folder management for A+ assets", status: "done", progress: 100, domain: "Platform", displayOrder: 160 },
  { name: "Revenue Calculator", description: "Public Amazon FBA calculator — fees, fulfillment, net profit", status: "done", progress: 100, domain: "Platform", displayOrder: 170 },

  // ── In Progress ───────────────────────────────────────────────────
  { name: "Hub Status Tracker", description: "Public /status page with Done / In Progress / Planned feature board", status: "in_progress", progress: 20, domain: "Platform", displayOrder: 10 },
  { name: "Master Tables Rethink", description: "Supabase as live source of truth, BigQuery as backup/analytics layer", status: "in_progress", progress: 20, domain: "Platform", displayOrder: 20 },
  { name: "Sales Cache", description: "PostgreSQL cache for sales summary data with 6-hour cron refresh for instant loads", status: "in_progress", progress: 15, domain: "Finance", displayOrder: 30 },

  // ── Planned ───────────────────────────────────────────────────────
  { name: "Onboarding Merge-Master Fix", description: "Switch cascade-delete to upsert-in-place to preserve activity log on re-merge", status: "planned", progress: 0, domain: "Clients", displayOrder: 10 },
  { name: "PPC Campaign Manager", description: "Sponsored products campaign creation, bid management, and performance tracking", status: "planned", progress: 0, domain: "Products", displayOrder: 20 },
  { name: "Forecasting Dashboard", description: "Inventory and revenue forecasting with trend analysis", status: "planned", progress: 0, domain: "Finance", displayOrder: 30 },
  { name: "Competitor Analysis", description: "ASIN comparison, keyword gap analysis, and competitive intelligence", status: "planned", progress: 0, domain: "SEO", displayOrder: 40 },
  { name: "Client Onboarding Admin UI", description: "In-hub CRUD for onboarding steps without needing Drizzle Studio", status: "planned", progress: 0, domain: "Admin", displayOrder: 50 },
];

async function main() {
  const { db } = await import("../src/lib/db");
  const { hubFeatures } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  let inserted = 0;
  let updated = 0;

  for (const feature of features) {
    const existing = await db
      .select({ id: hubFeatures.id })
      .from(hubFeatures)
      .where(eq(hubFeatures.name, feature.name))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(hubFeatures)
        .set({
          description: feature.description,
          status: feature.status,
          progress: feature.progress,
          domain: feature.domain,
          displayOrder: feature.displayOrder,
          updatedAt: new Date(),
        })
        .where(eq(hubFeatures.name, feature.name));
      updated++;
    } else {
      await db.insert(hubFeatures).values(feature);
      inserted++;
    }
  }

  console.log(`Seed complete: ${inserted} inserted, ${updated} updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the script to package.json**

In `package.json`, find the `"scripts"` block and add after `"seed-team"`:

```json
"seed-hub-features": "tsx scripts/seed-hub-features.ts",
```

- [ ] **Step 3: Run the seed**

```bash
npm run seed-hub-features
```

Expected: `Seed complete: 25 inserted, 0 updated.`

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-hub-features.ts package.json
git commit -m "$(cat <<'EOF'
feat(scripts): seed hub_features with initial platform feature list

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Whitelist `/status` as a public route

**Files:**
- Modify: `src/proxy.ts:10-22` (the public-path allowlist)
- Modify: `src/components/layout/layout-router.tsx:15-28` (the no-chrome block)

- [ ] **Step 1: Add `/status` to proxy.ts allowlist**

In `src/proxy.ts`, find:
```typescript
    pathname.startsWith("/calculator") ||
```
Add the line immediately after:
```typescript
    pathname.startsWith("/status") ||
```

- [ ] **Step 2: Add `/status` to the no-chrome block in layout-router.tsx**

In `src/components/layout/layout-router.tsx`, find:
```typescript
    pathname.startsWith("/calculator") ||
```
Add the line immediately after:
```typescript
    pathname.startsWith("/status") ||
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: the 3 pre-existing errors only — no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/proxy.ts src/components/layout/layout-router.tsx
git commit -m "$(cat <<'EOF'
feat(auth): whitelist /status as public route (no auth, no hub nav)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Build the `/status` page

**Files:**
- Create: `src/app/status/page.tsx`
- Create: `src/app/status/page.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `src/app/status/page.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { groupByStatus } from "./page";
import type { HubFeature } from "@/lib/db/schema";

const makeFeature = (overrides: Partial<HubFeature>): HubFeature => ({
  id: "00000000-0000-0000-0000-000000000001",
  name: "Test Feature",
  description: "desc",
  status: "done",
  progress: 100,
  domain: "Platform",
  displayOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("groupByStatus", () => {
  it("separates features into done, in_progress, and planned buckets", () => {
    const features = [
      makeFeature({ status: "done" }),
      makeFeature({ status: "in_progress", progress: 50 }),
      makeFeature({ status: "planned", progress: 0 }),
      makeFeature({ status: "done" }),
    ];

    const result = groupByStatus(features);

    expect(result.done).toHaveLength(2);
    expect(result.in_progress).toHaveLength(1);
    expect(result.planned).toHaveLength(1);
  });

  it("returns empty arrays when no features exist", () => {
    const result = groupByStatus([]);
    expect(result.done).toHaveLength(0);
    expect(result.in_progress).toHaveLength(0);
    expect(result.planned).toHaveLength(0);
  });

  it("preserves the original feature data in each bucket", () => {
    const feature = makeFeature({ status: "in_progress", progress: 75, name: "My Feature" });
    const result = groupByStatus([feature]);
    expect(result.in_progress[0].name).toBe("My Feature");
    expect(result.in_progress[0].progress).toBe(75);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails (groupByStatus not yet exported)**

```bash
npm test -- src/app/status/page.test.ts 2>&1 | tail -10
```

Expected: FAIL — `groupByStatus` not found / module not found.

- [ ] **Step 3: Create the page component**

Create `src/app/status/page.tsx`:

```typescript
import { db } from "@/lib/db";
import { hubFeatures, type HubFeature } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Platform Status — 1o8Hub",
  description: "Current development status of the 1o8Hub platform.",
};

export function groupByStatus(features: HubFeature[]) {
  return {
    done: features.filter((f) => f.status === "done"),
    in_progress: features.filter((f) => f.status === "in_progress"),
    planned: features.filter((f) => f.status === "planned"),
  };
}

const domainColors: Record<string, string> = {
  SEO: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30",
  "A+": "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30",
  Finance: "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30",
  Products: "bg-stone-100 text-stone-600 border-stone-300 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700",
  Clients: "bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/30",
  Portal: "bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/30",
  Admin: "bg-red-50 text-red-600 border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30",
  Platform: "bg-stone-100 text-stone-600 border-stone-300 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700",
};

function DomainPill({ domain }: { domain: string }) {
  const cls = domainColors[domain] ?? domainColors.Platform;
  return (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-wide border rounded px-1.5 py-0.5 ${cls}`}>
      {domain}
    </span>
  );
}

function FeatureCard({ feature }: { feature: HubFeature }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <DomainPill domain={feature.domain} />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground leading-snug">{feature.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{feature.description}</p>
      </div>
      {feature.status === "in_progress" && (
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${feature.progress}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
            {feature.progress}%
          </span>
        </div>
      )}
    </div>
  );
}

function StatusColumn({
  title,
  icon,
  features,
}: {
  title: string;
  icon: string;
  features: HubFeature[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <span className="text-base">{icon}</span>
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground font-medium">
          {features.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {features.map((f) => (
          <FeatureCard key={f.id} feature={f} />
        ))}
        {features.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Nothing here yet.</p>
        )}
      </div>
    </div>
  );
}

export default async function StatusPage() {
  const features = await db
    .select()
    .from(hubFeatures)
    .orderBy(asc(hubFeatures.displayOrder));

  const { done, in_progress, planned } = groupByStatus(features);

  const latestUpdate = features.reduce<Date | null>((latest, f) => {
    return !latest || f.updatedAt > latest ? f.updatedAt : latest;
  }, null);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tighter">
            <span className="text-foreground">1o8</span>
            <span className="text-brand">Hub</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Platform Status
            {latestUpdate && (
              <>
                {" · Last updated "}
                {latestUpdate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatusColumn title="Done" icon="✅" features={done} />
          <StatusColumn title="In Progress" icon="🔄" features={in_progress} />
          <StatusColumn title="Planned" icon="🗓" features={planned} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npm test -- src/app/status/page.test.ts 2>&1 | tail -15
```

Expected: 3 passing tests (`groupByStatus` suite).

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 3 pre-existing errors only.

- [ ] **Step 6: Start dev server and verify the page**

```bash
PORT=3000 npm run dev
```

Open `http://localhost:3000/status` — verify:
- Page loads without login
- Three columns visible: Done (17 items), In Progress (3 items), Planned (5 items)
- Progress bars visible on In Progress cards
- Domain pills render with correct colors
- Page title shows "1o8Hub — Platform Status" and last-updated date
- No top nav or sidebar rendered

- [ ] **Step 7: Commit**

```bash
git add src/app/status/page.tsx src/app/status/page.test.ts
git commit -m "$(cat <<'EOF'
feat(status): public /status page — 3-column platform status board

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
