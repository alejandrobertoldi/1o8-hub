# SEO Content Review (revisions, PM → AM → client, push approved text) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "export a Word doc and edit it by hand" review loop with frozen SEO revisions that the assigned PM, then the assigned AM, and optionally the client approve on an Amazon PDP preview, and make Push to Products ship only the approved revision.

**Architecture:** Four new additive tables (`seo_revisions`, `seo_revision_events`, `seo_revision_comments`, `seo_revision_pushes`). Pure modules hold the rules (`revision-rules.ts`), approver matching (`sales-summary-header.ts` + `revision-approvers.ts`) and field math (`revision-fields.ts`, `revision-push.ts`); a thin DB layer (`revision-db.ts`) does conditional, race-safe writes; staff and portal API routes sit on top; the UI reuses the orphaned `ProductPdp` card read-only as the review preview.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM (postgres), Vitest + Testing Library, Tailwind 4, NextAuth v5 session.

**Spec:** `docs/superpowers/specs/2026-10-01-seo-revision-review-design.md` (approved 2026-10-01). Read it before any task.

## Global Constraints

- **Prerequisite:** PR #53 (`seo/save-scope-project`, project-scoped S6 save) must be merged before Task 5 ships. Submit snapshots `seo_asins.generated_content` per project and is meaningless while saves overwrite across projects.
- Additive only. No column added to `master` or `seo_projects`. No `ALTER` of existing tables.
- Migration number = next free at build time. Run `ls drizzle/migrations` and `git ls-remote --heads origin` first. At writing time `0122` is the newest on main and Thread AB has claimed `0123`, so expect **`0124`**. The plan writes `NNNN`; substitute the real number everywhere, in both file names and script constants.
- Migrations are applied only with the bespoke `scripts/_apply-NNNN.ts` pattern, and **only after Manu's explicit OK**. Never `drizzle-kit migrate` / `db:push` / `db:generate`.
- Listing fields are exactly the keys of `FIELD_MAP` (`src/app/api/seo/projects/[id]/migrate-to-products/field-map.ts`), e.g. `Title`, `ProductDescription`, `DetailedBulletPoint_1`, `ContentBulletPoint_1`, `KeyFeaturesBulletPoint_1`, `BackendSearchTerms`. Never invent other names.
- Statuses: `pm_review`, `am_review`, `client_review`, `approved`, `changes_requested`. Open = the first three.
- Override = `hasSuperPowers(role)` (owner / super_admin), from `src/lib/roles.ts`. Staff route guard = `isEditorOrAbove(role)`.
- The author (the `submitted_by_email` of the revision) can never act on the PM or AM step, not even as an override.
- Portal responses never contain internal comments, staff notes, or override reasons.
- UI follows DESIGN.md: hub pages use hub tokens; portal pages use `text-portal-accent` / `bg-portal-accent` and **never hub orange** (`no-hub-orange.test.ts`).
- Emails are compared lower-cased and trimmed.
- Dates across module boundaries are `YYYY-MM-DD` strings or ISO timestamps, never `Date` objects in JSON.
- Commits: explicit pathspec on add AND commit, `-m` before `--`, one task per commit, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage `.claude/*`, `.superpowers/*`, `src/generated/data-map.json`, `scripts/_tmp-*`.
- After vitest, always run `node_modules/.bin/tsc --noEmit` and judge by filename. The baseline is 9 pre-existing files (`scripts/backfill-parent-theme-attrs.ts`, `scripts/strip-monthly-report-appendix.ts`, `src/app/api/products/import/route.test.ts`, 4 × `src/app/design/aplus2/.../*.test.tsx`, `src/components/amazon-pdp-link.test.tsx`, `src/lib/api-utils.test.ts`), plus any `.next/dev/types` dev artifact.
- **Thread W risk:** Thread W has an unpushed S6 rework (`seo-phase.tsx`, commit `7b81a3e1c`). This plan targets `src/app/seo/[id]/seo/page.tsx` as it is on main. Before Task 11, run `git log origin/main --oneline -- src/app/seo/[id]/seo/page.tsx src/components/seo/phases`. If Thread W has landed, stop and ask Manu how to re-target.

## Review Focus

1. **Two approvers clicking at the same moment** (e.g. the PM and an Owner override both approve r2): exactly one decision is recorded; the second gets 409 "Already decided — reload". Pinned in Task 5 (the conditional-update WHERE includes the expected status; an empty result throws `RevisionConflictError`) and Task 7 (the route maps it to 409).
2. **The client's name in AAC doesn't match any user** (typo, or a rebrand duplicate with 2–3 `users` rows per person): the PM step shows "No assigned PM matched" and only an override can act. It must never silently pick a wrong person or let anyone act. Pinned in Task 3 (`email: null` for an unmatched name; the MF domain wins among duplicates) and Task 2 (`staffActedAs` returns null for a non-super user when the approver email is null).
3. **A PM or AM note leaking to the client portal:** pinned in Task 9 (`toClientRevision` drops internal comments, notes and override reasons; the test asserts the serialized JSON lacks the secret strings).
4. **A multi-account client user** (Trejo's Tacos + Spirits) opening a revision for their second client, and a user of another client guessing a revision id: the first succeeds, the second gets 403. Pinned in Task 9 (`portalClientAllowed` uses the parsed code list, not raw equality).
5. **Pushing after someone edited the product in the catalog** post-approval: the push must stop and name the drifted fields until confirmed. Pinned in Task 8 (`findDrift` reads `changeLog` entries after `approved_at`; the route returns 409 with `drift` unless `confirmDrift`).

---

## File Structure

| File | Responsibility |
|---|---|
| `drizzle/migrations/NNNN_seo_revisions.sql` | DDL for the 4 tables + indexes |
| `scripts/_apply-NNNN.ts` | Applies + verifies the migration (run only with OK) |
| `src/lib/db/schema.ts` (modify, after `seoProjectAsinLive`) | Drizzle definitions + types |
| `src/lib/seo/revision-rules.ts` | Pure: statuses, transitions, who may act |
| `src/lib/sales-summary-header.ts` (modify) | + `resolveClientApprovers` (pure) |
| `src/lib/seo/revision-approvers.ts` | Loads a client's PM/AM from `aac` + `users` |
| `src/lib/seo/revision-fields.ts` | Pure: snapshot, overlay, changed keys, labels |
| `src/lib/seo/revision-push.ts` | Pure: push update + change-log math, drift |
| `src/lib/seo/revision-db.ts` | DB: submit, decide, list, comments, pushes |
| `src/app/api/seo/projects/[id]/revisions/route.ts` | Staff: list + submit |
| `src/app/api/seo/revisions/route.ts` | Staff: "awaiting me" list |
| `src/app/api/seo/revisions/[revisionId]/route.ts` | Staff: detail |
| `src/app/api/seo/revisions/[revisionId]/decision/route.ts` | Staff: PM/AM decisions |
| `src/app/api/seo/revisions/[revisionId]/comments/route.ts` | Staff: add + resolve comments |
| `src/app/api/seo/projects/[id]/migrate-to-products/route.ts` (modify) | Push the approved revision |
| `src/app/api/products/[id]/seo-revision/route.ts` | Latest pushed revision for a product |
| `src/lib/seo/revision-portal.ts` | Portal access + client-safe shape |
| `src/app/api/portal/seo/revisions/route.ts` | Portal: list awaiting review |
| `src/app/api/portal/seo/revisions/[revisionId]/route.ts` | Portal: detail + decision |
| `src/app/api/portal/seo/revisions/[revisionId]/comments/route.ts` | Portal: add comment |
| `src/components/products/product-pdp.tsx` (modify) | + `familyEnabled` prop |
| `src/components/seo/revision/revision-preview.tsx` | PDP preview + toggle + hidden-fields strip + field list |
| `src/components/seo/revision/comment-thread.tsx` | Comments for one ASIN + field |
| `src/components/seo/revision/decision-bar.tsx` | Action buttons + note |
| `src/components/seo/revision/revision-strip.tsx` | S6 strip: state, history, submit, open comments |
| `src/app/seo/[id]/review/[revisionId]/page.tsx` | Staff review page |
| `src/app/seo/[id]/seo/page.tsx` (modify) | Strip, submit, lock while open, push gating |
| `src/app/api/seo/projects/route.ts` (modify) | `review_stage` per project |
| `src/app/seo/manager/page.tsx` + `src/app/seo/clients/[clientId]/seo-client-view.tsx` (modify) | Stage badge + "Needs my review" |
| `src/components/products/seo-revision-line.tsx` + `product-detail-form.tsx` (modify) | "SEO: v01 r3 · approved …" line |
| `src/app/portal/seo/page.tsx` (modify) + `src/app/portal/seo/review/[revisionId]/page.tsx` | Portal list + review page |

---

### Task 1: Tables (migration SQL, Drizzle schema, apply script)

**Files:**
- Create: `drizzle/migrations/NNNN_seo_revisions.sql`, `scripts/_apply-NNNN.ts`
- Modify: `src/lib/db/schema.ts` (insert directly after the `seoProjectAsinLive` table, before `// ─── SEO ASINs`)
- Test: `src/lib/db/seo-revisions-schema.test.ts`

**Interfaces:**
- Produces: `seoRevisions`, `seoRevisionEvents`, `seoRevisionComments`, `seoRevisionPushes` (Drizzle tables) and types `SeoRevision = typeof seoRevisions.$inferSelect`, `SeoRevisionComment = typeof seoRevisionComments.$inferSelect`, `SeoRevisionEvent = typeof seoRevisionEvents.$inferSelect`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/db/seo-revisions-schema.test.ts
import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { seoRevisions, seoRevisionEvents, seoRevisionComments, seoRevisionPushes } from "./schema";

const cols = (t: Parameters<typeof getTableConfig>[0]) => getTableConfig(t).columns.map((c) => c.name).sort();

describe("seo revision tables", () => {
  it("seo_revisions has the frozen-content and approval columns", () => {
    expect(getTableConfig(seoRevisions).name).toBe("seo_revisions");
    expect(cols(seoRevisions)).toEqual([
      "approved_at", "content", "created_at", "final_reason", "final_via", "id", "is_current",
      "project_id", "revision_number", "status", "submitted_at", "submitted_by_email",
      "submitted_by_name", "updated_at",
    ]);
  });
  it("one open revision and one current revision per project are unique indexes", () => {
    const idx = getTableConfig(seoRevisions).indexes.map((i) => i.config.name).sort();
    expect(idx).toEqual(["uq_seo_revisions_one_current", "uq_seo_revisions_one_open", "uq_seo_revisions_project_number"]);
  });
  it("events, comments, pushes have their columns", () => {
    expect(cols(seoRevisionEvents)).toEqual(["acted_as", "action", "actor_email", "actor_name", "created_at", "id", "note", "revision_id", "step"]);
    expect(cols(seoRevisionComments)).toEqual([
      "asin", "audience", "author_email", "author_name", "body", "created_at", "field_key", "id",
      "parent_comment_id", "resolved_at", "resolved_by", "revision_id", "updated_at",
    ]);
    expect(cols(seoRevisionPushes)).toEqual(["created_at", "id", "override_reason", "product_id", "project_id", "pushed_by", "revision_id"]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/db/seo-revisions-schema.test.ts`
Expected: FAIL. The import of `seoRevisions` is undefined, or it errors with "does not provide an export".

- [ ] **Step 3: Add the Drizzle tables to `schema.ts`** (directly after `seoProjectAsinLive`; `uniqueIndex`, `index`, `check`, `sql`, `boolean`, `jsonb`, `AnyPgColumn` are already imported in this file)

```ts
// ─── SEO revisions (client review rounds) ─────────────────────────────
// One frozen snapshot per review round; see docs/superpowers/specs/2026-10-01-seo-revision-review-design.md.

export const seoRevisions = pgTable(
  "seo_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => seoProjects.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    /** { [asin]: { [FIELD_MAP key]: string } } — frozen at submit, never updated. */
    content: jsonb("content").$type<Record<string, Record<string, string>>>().notNull(),
    submittedByEmail: varchar("submitted_by_email", { length: 255 }).notNull(),
    submittedByName: varchar("submitted_by_name", { length: 255 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    finalVia: varchar("final_via", { length: 10 }),
    finalReason: text("final_reason"),
    isCurrent: boolean("is_current").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_seo_revisions_project_number").on(t.projectId, t.revisionNumber),
    uniqueIndex("uq_seo_revisions_one_open").on(t.projectId).where(sql`status IN ('pm_review', 'am_review', 'client_review')`),
    uniqueIndex("uq_seo_revisions_one_current").on(t.projectId).where(sql`is_current`),
    check("seo_revisions_status_check", sql`${t.status} IN ('pm_review', 'am_review', 'client_review', 'approved', 'changes_requested')`),
    check("seo_revisions_final_via_check", sql`${t.finalVia} IS NULL OR ${t.finalVia} IN ('client', 'am_final')`),
  ],
);

export const seoRevisionEvents = pgTable(
  "seo_revision_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    revisionId: uuid("revision_id").notNull().references(() => seoRevisions.id, { onDelete: "cascade" }),
    step: varchar("step", { length: 10 }).notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    actorEmail: varchar("actor_email", { length: 255 }).notNull(),
    actorName: varchar("actor_name", { length: 255 }),
    actedAs: varchar("acted_as", { length: 10 }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_seo_revision_events_revision").on(t.revisionId),
    check("seo_revision_events_step_check", sql`${t.step} IN ('submit', 'pm', 'am', 'client')`),
    check("seo_revision_events_action_check", sql`${t.action} IN ('submit', 'approve', 'request_changes', 'send_to_client', 'approve_final')`),
    check("seo_revision_events_acted_as_check", sql`${t.actedAs} IN ('assigned', 'override', 'client', 'author')`),
  ],
);

export const seoRevisionComments = pgTable(
  "seo_revision_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    revisionId: uuid("revision_id").notNull().references(() => seoRevisions.id, { onDelete: "cascade" }),
    asin: varchar("asin", { length: 20 }).notNull(),
    fieldKey: varchar("field_key", { length: 64 }).notNull(),
    parentCommentId: uuid("parent_comment_id").references((): AnyPgColumn => seoRevisionComments.id, { onDelete: "cascade" }),
    audience: varchar("audience", { length: 10 }).notNull(),
    authorEmail: varchar("author_email", { length: 255 }).notNull(),
    authorName: varchar("author_name", { length: 255 }),
    body: text("body").notNull(),
    resolvedBy: varchar("resolved_by", { length: 255 }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_seo_revision_comments_revision").on(t.revisionId),
    check("seo_revision_comments_audience_check", sql`${t.audience} IN ('internal', 'client')`),
  ],
);

export const seoRevisionPushes = pgTable(
  "seo_revision_pushes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    revisionId: uuid("revision_id").references(() => seoRevisions.id, { onDelete: "set null" }),
    projectId: uuid("project_id").notNull().references(() => seoProjects.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => master.id, { onDelete: "cascade" }),
    pushedBy: varchar("pushed_by", { length: 255 }).notNull(),
    overrideReason: text("override_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_seo_revision_pushes_product").on(t.productId),
    check("seo_revision_pushes_source_check", sql`${t.revisionId} IS NOT NULL OR ${t.overrideReason} IS NOT NULL`),
  ],
);

export type SeoRevision = typeof seoRevisions.$inferSelect;
export type SeoRevisionEvent = typeof seoRevisionEvents.$inferSelect;
export type SeoRevisionComment = typeof seoRevisionComments.$inferSelect;
```

If `master` is declared *after* this point in `schema.ts`, the arrow in `.references(() => master.id)` still resolves lazily, so no reordering is needed. If `check` or `AnyPgColumn` is not imported yet, add it to the existing `drizzle-orm/pg-core` import (`aplusComments` already uses `AnyPgColumn`; `aplus2Versions` already uses `check`).

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/lib/db/seo-revisions-schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the migration SQL** `drizzle/migrations/NNNN_seo_revisions.sql`

```sql
-- NNNN_seo_revisions.sql
--
-- Additive only. SEO content review rounds: frozen revisions, their decision log,
-- per-field comments, and a record of which revision was pushed to which product.
-- Spec: docs/superpowers/specs/2026-10-01-seo-revision-review-design.md

CREATE TABLE IF NOT EXISTS "seo_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "seo_projects"("id") ON DELETE CASCADE,
  "revision_number" integer NOT NULL,
  "status" varchar(20) NOT NULL,
  "content" jsonb NOT NULL,
  "submitted_by_email" varchar(255) NOT NULL,
  "submitted_by_name" varchar(255),
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_at" timestamp with time zone,
  "final_via" varchar(10),
  "final_reason" text,
  "is_current" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "seo_revisions_status_check" CHECK ("status" IN ('pm_review', 'am_review', 'client_review', 'approved', 'changes_requested')),
  CONSTRAINT "seo_revisions_final_via_check" CHECK ("final_via" IS NULL OR "final_via" IN ('client', 'am_final'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_seo_revisions_project_number" ON "seo_revisions" ("project_id", "revision_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_seo_revisions_one_open" ON "seo_revisions" ("project_id") WHERE status IN ('pm_review', 'am_review', 'client_review');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_seo_revisions_one_current" ON "seo_revisions" ("project_id") WHERE is_current;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_revision_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "revision_id" uuid NOT NULL REFERENCES "seo_revisions"("id") ON DELETE CASCADE,
  "step" varchar(10) NOT NULL,
  "action" varchar(20) NOT NULL,
  "actor_email" varchar(255) NOT NULL,
  "actor_name" varchar(255),
  "acted_as" varchar(10) NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "seo_revision_events_step_check" CHECK ("step" IN ('submit', 'pm', 'am', 'client')),
  CONSTRAINT "seo_revision_events_action_check" CHECK ("action" IN ('submit', 'approve', 'request_changes', 'send_to_client', 'approve_final')),
  CONSTRAINT "seo_revision_events_acted_as_check" CHECK ("acted_as" IN ('assigned', 'override', 'client', 'author'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seo_revision_events_revision" ON "seo_revision_events" ("revision_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_revision_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "revision_id" uuid NOT NULL REFERENCES "seo_revisions"("id") ON DELETE CASCADE,
  "asin" varchar(20) NOT NULL,
  "field_key" varchar(64) NOT NULL,
  "parent_comment_id" uuid REFERENCES "seo_revision_comments"("id") ON DELETE CASCADE,
  "audience" varchar(10) NOT NULL,
  "author_email" varchar(255) NOT NULL,
  "author_name" varchar(255),
  "body" text NOT NULL,
  "resolved_by" varchar(255),
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "seo_revision_comments_audience_check" CHECK ("audience" IN ('internal', 'client'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seo_revision_comments_revision" ON "seo_revision_comments" ("revision_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_revision_pushes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "revision_id" uuid REFERENCES "seo_revisions"("id") ON DELETE SET NULL,
  "project_id" uuid NOT NULL REFERENCES "seo_projects"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "master"("id") ON DELETE CASCADE,
  "pushed_by" varchar(255) NOT NULL,
  "override_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "seo_revision_pushes_source_check" CHECK ("revision_id" IS NOT NULL OR "override_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seo_revision_pushes_product" ON "seo_revision_pushes" ("product_id");
```

Check `master`'s real table name before relying on `REFERENCES "master"`: `grep -n 'export const master = pgTable' -A1 src/lib/db/schema.ts`. Use the quoted name shown there.

- [ ] **Step 6: Write `scripts/_apply-NNNN.ts`.** Copy `scripts/_apply-0122.ts` verbatim, then change only: `MIGRATION = "NNNN_seo_revisions.sql"`, and replace the verification block (everything from `const cols = await sql\`` through the final `console.log`) with:

```ts
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('seo_revisions', 'seo_revision_events', 'seo_revision_comments', 'seo_revision_pushes')
    `;
    if (tables.length !== 4) throw new Error(`expected 4 tables, found ${tables.length}`);
    const idx = await sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'seo_revisions'
        AND indexname IN ('uq_seo_revisions_one_open', 'uq_seo_revisions_one_current', 'uq_seo_revisions_project_number')
    `;
    if (idx.length !== 3) throw new Error(`expected 3 seo_revisions unique indexes, found ${idx.length}`);
    console.log("NNNN applied OK: 4 tables, 3 unique indexes.");
```

**Do NOT run it.** Applying it is a prod schema change that needs Manu's explicit OK (Task 14).

- [ ] **Step 7: Typecheck, then commit**

Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -oE "^[^(]+\.tsx?" | sort -u`. Expected: baseline files only.

```bash
git add -- drizzle/migrations/NNNN_seo_revisions.sql scripts/_apply-NNNN.ts src/lib/db/schema.ts src/lib/db/seo-revisions-schema.test.ts
git commit -m "feat(seo): tables for SEO review revisions, events, comments, pushes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- drizzle/migrations/NNNN_seo_revisions.sql scripts/_apply-NNNN.ts src/lib/db/schema.ts src/lib/db/seo-revisions-schema.test.ts
```

---

### Task 2: Revision rules (pure)

**Files:**
- Create: `src/lib/seo/revision-rules.ts`
- Test: `src/lib/seo/revision-rules.test.ts`

**Interfaces:**
- Consumes: `hasSuperPowers` from `@/lib/roles`.
- Produces:
  - `REVISION_STATUSES`, `type RevisionStatus`, `OPEN_STATUSES`, `isOpen(status): boolean`
  - `type RevisionAction = "approve" | "request_changes" | "send_to_client" | "approve_final"`
  - `type RevisionStep = "pm" | "am" | "client"`, `type ActedAs = "assigned" | "override" | "client"`
  - `stepFor(status): RevisionStep | null`
  - `actionsFor(step): RevisionAction[]`
  - `nextStatus(status, action): RevisionStatus | null`
  - `actionNeedsNote(action): boolean`
  - `interface Approver { name: string; email: string | null }`, `interface Approvers { pm: Approver | null; am: Approver | null }`
  - `staffActedAs(step: "pm" | "am", actor: { email: string; role: string }, approvers: Approvers, submittedByEmail: string): "assigned" | "override" | null`
  - `stageLabel(status): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/seo/revision-rules.test.ts
import { describe, it, expect } from "vitest";
import { actionNeedsNote, actionsFor, isOpen, nextStatus, stageLabel, staffActedAs, stepFor } from "./revision-rules";

const approvers = { pm: { name: "Pat PM", email: "pat@marketfoundry.agency" }, am: { name: "Ann AM", email: "ann@marketfoundry.agency" } };

describe("transitions", () => {
  it.each([
    ["pm_review", "approve", "am_review"],
    ["pm_review", "request_changes", "changes_requested"],
    ["am_review", "send_to_client", "client_review"],
    ["am_review", "approve_final", "approved"],
    ["am_review", "request_changes", "changes_requested"],
    ["client_review", "approve", "approved"],
    ["client_review", "request_changes", "changes_requested"],
  ] as const)("%s + %s → %s", (from, action, to) => {
    expect(nextStatus(from, action)).toBe(to);
  });
  it.each([
    ["pm_review", "send_to_client"],
    ["pm_review", "approve_final"],
    ["client_review", "send_to_client"],
    ["client_review", "approve_final"],
    ["approved", "approve"],
    ["changes_requested", "approve"],
  ] as const)("%s + %s is forbidden", (from, action) => {
    expect(nextStatus(from, action)).toBeNull();
  });
  it("step and actions per state", () => {
    expect(stepFor("pm_review")).toBe("pm");
    expect(stepFor("am_review")).toBe("am");
    expect(stepFor("client_review")).toBe("client");
    expect(stepFor("approved")).toBeNull();
    expect(actionsFor("am")).toEqual(["send_to_client", "approve_final", "request_changes"]);
    expect(actionsFor("pm")).toEqual(["approve", "request_changes"]);
  });
  it("open states and notes", () => {
    expect(isOpen("client_review")).toBe(true);
    expect(isOpen("changes_requested")).toBe(false);
    expect(actionNeedsNote("request_changes")).toBe(true);
    expect(actionNeedsNote("approve_final")).toBe(true);
    expect(actionNeedsNote("approve")).toBe(false);
    expect(stageLabel("client_review")).toBe("With client");
  });
});

describe("staffActedAs", () => {
  it("assigned PM (case-insensitive email) acts as assigned", () => {
    expect(staffActedAs("pm", { email: "PAT@marketfoundry.agency ", role: "editor" }, approvers, "sam@x.com")).toBe("assigned");
  });
  it("the AM cannot act on the PM step unless super", () => {
    expect(staffActedAs("pm", { email: "ann@marketfoundry.agency", role: "admin" }, approvers, "sam@x.com")).toBeNull();
  });
  it("owner / super_admin act as override", () => {
    expect(staffActedAs("am", { email: "boss@x.com", role: "owner" }, approvers, "sam@x.com")).toBe("override");
    expect(staffActedAs("am", { email: "boss@x.com", role: "super_admin" }, approvers, "sam@x.com")).toBe("override");
  });
  it("the author is blocked even as assigned PM or as owner (Review Focus 2 sibling)", () => {
    expect(staffActedAs("pm", { email: "pat@marketfoundry.agency", role: "editor" }, approvers, "Pat@MarketFoundry.agency")).toBeNull();
    expect(staffActedAs("pm", { email: "boss@x.com", role: "owner" }, approvers, "boss@x.com")).toBeNull();
  });
  it("unmatched approver (email null) → only override can act (Review Focus 2)", () => {
    const unmatched = { pm: { name: "Pat Typo", email: null }, am: null };
    expect(staffActedAs("pm", { email: "pat@marketfoundry.agency", role: "editor" }, unmatched, "sam@x.com")).toBeNull();
    expect(staffActedAs("pm", { email: "boss@x.com", role: "owner" }, unmatched, "sam@x.com")).toBe("override");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/seo/revision-rules.test.ts`
Expected: FAIL, "Failed to resolve import ./revision-rules".

- [ ] **Step 3: Implement**

```ts
// src/lib/seo/revision-rules.ts
/** SEO review revision rules (spec §3). Pure — no DB, no session. */
import { hasSuperPowers } from "@/lib/roles";

export const REVISION_STATUSES = ["pm_review", "am_review", "client_review", "approved", "changes_requested"] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];
export const OPEN_STATUSES: readonly RevisionStatus[] = ["pm_review", "am_review", "client_review"];
export type RevisionAction = "approve" | "request_changes" | "send_to_client" | "approve_final";
export type RevisionStep = "pm" | "am" | "client";
export type ActedAs = "assigned" | "override" | "client";

export interface Approver { name: string; email: string | null }
export interface Approvers { pm: Approver | null; am: Approver | null }

const TRANSITIONS: Record<string, Partial<Record<RevisionAction, RevisionStatus>>> = {
  pm_review: { approve: "am_review", request_changes: "changes_requested" },
  am_review: { send_to_client: "client_review", approve_final: "approved", request_changes: "changes_requested" },
  client_review: { approve: "approved", request_changes: "changes_requested" },
};

export function isOpen(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

export function stepFor(status: string): RevisionStep | null {
  if (status === "pm_review") return "pm";
  if (status === "am_review") return "am";
  if (status === "client_review") return "client";
  return null;
}

export function actionsFor(step: RevisionStep): RevisionAction[] {
  if (step === "am") return ["send_to_client", "approve_final", "request_changes"];
  return ["approve", "request_changes"];
}

export function nextStatus(status: string, action: RevisionAction): RevisionStatus | null {
  return TRANSITIONS[status]?.[action] ?? null;
}

/** request_changes and approve_final need a written reason (spec §3). */
export function actionNeedsNote(action: RevisionAction): boolean {
  return action === "request_changes" || action === "approve_final";
}

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

/**
 * Who a staff user acts as on the PM/AM step: the client's assigned person, an
 * Owner/Super Admin override, or nobody. The author never acts on their own revision.
 */
export function staffActedAs(
  step: "pm" | "am",
  actor: { email: string; role: string },
  approvers: Approvers,
  submittedByEmail: string,
): "assigned" | "override" | null {
  const me = norm(actor.email);
  if (!me || me === norm(submittedByEmail)) return null;
  const assigned = approvers[step];
  if (assigned?.email && norm(assigned.email) === me) return "assigned";
  if (hasSuperPowers(actor.role)) return "override";
  return null;
}

export function stageLabel(status: string): string {
  switch (status) {
    case "pm_review": return "PM review";
    case "am_review": return "AM review";
    case "client_review": return "With client";
    case "approved": return "Approved";
    case "changes_requested": return "Changes requested";
    default: return status;
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/lib/seo/revision-rules.test.ts`
Expected: PASS (21 tests).

- [ ] **Step 5: Commit**

```bash
git add -- src/lib/seo/revision-rules.ts src/lib/seo/revision-rules.test.ts
git commit -m "feat(seo): revision review rules (transitions, who may act)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/seo/revision-rules.ts src/lib/seo/revision-rules.test.ts
```

---

### Task 3: Approver matching (PM / AM per client)

**Files:**
- Modify: `src/lib/sales-summary-header.ts` (add an export at the end; reuse the file's private `norm` and `pickUser`)
- Create: `src/lib/seo/revision-approvers.ts`
- Test: `src/lib/sales-summary-header.test.ts` (append a `describe`), `src/lib/seo/revision-approvers.test.ts`

**Interfaces:**
- Consumes: `TeamUserRow` (`{ name, email, image }`) from `sales-summary-header.ts`; `Approvers` from `revision-rules.ts`.
- Produces: `resolveClientApprovers(raw: Record<string, string>, users: TeamUserRow[]): Approvers`; `loadClientApprovers(clientIdCode: string): Promise<Approvers>`.

- [ ] **Step 1: Write the failing test** (append to `src/lib/sales-summary-header.test.ts`; add `resolveClientApprovers` to its import from `./sales-summary-header`)

```ts
describe("resolveClientApprovers", () => {
  const users = [
    { name: "Pat Smith", email: "pat@1o8.agency", image: null },
    { name: "Pat Smith", email: "pat@marketfoundry.agency", image: null },
    { name: "Ann Lee", email: "ann@marketfoundry.agency", image: null },
  ];
  it("maps ProjectManager_MF / AccountManager_MF by name, MF domain wins over @1o8 duplicates", () => {
    expect(resolveClientApprovers({ ProjectManager_MF: " pat  smith ", AccountManager_MF: "Ann Lee" }, users)).toEqual({
      pm: { name: "Pat Smith", email: "pat@marketfoundry.agency" },
      am: { name: "Ann Lee", email: "ann@marketfoundry.agency" },
    });
  });
  it("a name with no matching user keeps the name with email null (Review Focus 2)", () => {
    expect(resolveClientApprovers({ ProjectManager_MF: "Pat Smyth" }, users)).toEqual({ pm: { name: "Pat Smyth", email: null }, am: null });
  });
  it("missing keys → null", () => {
    expect(resolveClientApprovers({}, users)).toEqual({ pm: null, am: null });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/sales-summary-header.test.ts`
Expected: FAIL, "resolveClientApprovers is not a function".

- [ ] **Step 3: Implement** (append to `src/lib/sales-summary-header.ts`)

```ts
/** PM / AM for the SEO review gates (spec D4). Same name → user matching as the header. */
export function resolveClientApprovers(
  raw: Record<string, string>,
  users: TeamUserRow[],
): { pm: { name: string; email: string | null } | null; am: { name: string; email: string | null } | null } {
  const one = (key: string) => {
    const value = raw[key]?.trim();
    if (!value) return null;
    const k = norm(value);
    const user = pickUser(users.filter((u) => u.name && norm(u.name) === k));
    return { name: user?.name?.trim() || value, email: user?.email ?? null };
  };
  return { pm: one("ProjectManager_MF"), am: one("AccountManager_MF") };
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/lib/sales-summary-header.test.ts`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 5: Write the failing loader test**

```ts
// src/lib/seo/revision-approvers.test.ts
import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ aacRows: [] as unknown[], userRows: [] as unknown[] }));
vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: (t: { __name?: string }) => ({ where: async () => (t.__name === "aac" ? h.aacRows : h.userRows) }) }) },
}));
vi.mock("@/lib/db/schema", () => ({
  aac: { __name: "aac", clientIdCode: "aac.client_id_code", rawData: "aac.raw_data" },
  users: { __name: "users", name: "users.name", email: "users.email", image: "users.image" },
}));
vi.mock("drizzle-orm", () => ({ eq: () => ({}), isNotNull: () => ({}) }));

import { loadClientApprovers } from "./revision-approvers";

describe("loadClientApprovers", () => {
  it("parses a JSON-string rawData and resolves PM/AM", async () => {
    h.aacRows = [{ rawData: JSON.stringify({ ProjectManager_MF: "Pat Smith", AccountManager_MF: "Nobody Here" }) }];
    h.userRows = [{ name: "Pat Smith", email: "pat@marketfoundry.agency", image: null }];
    expect(await loadClientApprovers("TRS_SC_US")).toEqual({
      pm: { name: "Pat Smith", email: "pat@marketfoundry.agency" },
      am: { name: "Nobody Here", email: null },
    });
  });
  it("unknown client → both null", async () => {
    h.aacRows = [];
    expect(await loadClientApprovers("NOPE")).toEqual({ pm: null, am: null });
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx vitest run src/lib/seo/revision-approvers.test.ts`
Expected: FAIL, "Failed to resolve import ./revision-approvers".

- [ ] **Step 7: Implement**

```ts
// src/lib/seo/revision-approvers.ts
import { db } from "@/lib/db";
import { aac, users } from "@/lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { resolveClientApprovers } from "@/lib/sales-summary-header";
import type { Approvers } from "./revision-rules";

function parseRawData(rawData: unknown): Record<string, string> {
  if (typeof rawData === "string") {
    try { return JSON.parse(rawData); } catch { return {}; }
  }
  if (rawData && typeof rawData === "object") return rawData as Record<string, string>;
  return {};
}

/** The client's assigned PM and AM, matched to users by name (aac.rawData stores names). */
export async function loadClientApprovers(clientIdCode: string): Promise<Approvers> {
  const [row] = await db.select({ rawData: aac.rawData }).from(aac).where(eq(aac.clientIdCode, clientIdCode));
  if (!row) return { pm: null, am: null };
  const team = await db.select({ name: users.name, email: users.email, image: users.image }).from(users).where(isNotNull(users.name));
  return resolveClientApprovers(parseRawData(row.rawData), team);
}
```

- [ ] **Step 8: Run it and confirm it passes**

Run: `npx vitest run src/lib/seo/revision-approvers.test.ts src/lib/sales-summary-header.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -- src/lib/sales-summary-header.ts src/lib/sales-summary-header.test.ts src/lib/seo/revision-approvers.ts src/lib/seo/revision-approvers.test.ts
git commit -m "feat(seo): resolve each client's PM and AM for review gates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/sales-summary-header.ts src/lib/sales-summary-header.test.ts src/lib/seo/revision-approvers.ts src/lib/seo/revision-approvers.test.ts
```

---

### Task 4: Field math (snapshot, overlay, push update, drift). Pure.

**Files:**
- Create: `src/lib/seo/revision-fields.ts`, `src/lib/seo/revision-push.ts`
- Test: `src/lib/seo/revision-fields.test.ts`, `src/lib/seo/revision-push.test.ts`

**Interfaces:**
- Consumes: `FIELD_MAP`, `extractMappedFields` from `@/app/api/seo/projects/[id]/migrate-to-products/field-map`.
- Produces:
  - `type RevisionFields = Record<string, string>` (FIELD_MAP key → text); `type RevisionContent = Record<string, RevisionFields>` (asin → fields)
  - `interface FieldSource { itemName: string | null; itemHighlight: string | null; genericKeywords: string | null; contentSeo: unknown }`
  - `snapshotFields(gc: unknown): RevisionFields`
  - `currentValue(product: FieldSource, key: string): string | null`
  - `overlayProduct<T extends FieldSource>(product: T, fields: RevisionFields): T`
  - `changedKeys(product: FieldSource, fields: RevisionFields): string[]`
  - `FIELD_LABELS: Record<string, string>`, `PDP_HIDDEN_KEYS: string[]`
  - `bqNameFor(key: string): string`
  - `buildPushUpdate(product: FieldSource & { rawColumnValues: unknown; changeLog: unknown }, fields: RevisionFields, userEmail: string, nowIso: string): { updates: Record<string, unknown>; fieldsChanged: number }`
  - `findDrift(changeLog: unknown, fields: RevisionFields, approvedAtIso: string): Array<{ key: string; changedAt: string; changedBy: string }>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/seo/revision-fields.test.ts
import { describe, it, expect } from "vitest";
import { changedKeys, currentValue, FIELD_LABELS, overlayProduct, PDP_HIDDEN_KEYS, snapshotFields } from "./revision-fields";
import { FIELD_MAP } from "@/app/api/seo/projects/[id]/migrate-to-products/field-map";

const product = { itemName: "Old title", itemHighlight: null, genericKeywords: "old kw", contentSeo: { DetailedBulletPoint1: "old b1", KeyFeature1: "kf" }, extra: 1 };

describe("revision fields", () => {
  it("snapshot keeps only FIELD_MAP keys with non-empty text, trimmed", () => {
    expect(snapshotFields({ Title: " New ", DetailedBulletPoint_1: "b1", _aplusQA: [1], Title_CharLength: 3, ProductDescription: "  " })).toEqual({
      Title: "New", DetailedBulletPoint_1: "b1",
    });
    expect(snapshotFields(null)).toEqual({});
  });
  it("overlay writes core + contentSeo targets and leaves everything else alone", () => {
    const out = overlayProduct(product, { Title: "New title", DetailedBulletPoint_1: "new b1", BackendSearchTerms: "new kw" });
    expect(out.itemName).toBe("New title");
    expect(out.genericKeywords).toBe("new kw");
    expect(out.contentSeo).toEqual({ DetailedBulletPoint1: "new b1", KeyFeature1: "kf" });
    expect(out.extra).toBe(1);
    expect(product.itemName).toBe("Old title"); // not mutated
  });
  it("currentValue and changedKeys read through FIELD_MAP", () => {
    expect(currentValue(product, "DetailedBulletPoint_1")).toBe("old b1");
    expect(currentValue(product, "Title")).toBe("Old title");
    expect(changedKeys(product, { Title: "Old title", DetailedBulletPoint_1: "new b1" })).toEqual(["DetailedBulletPoint_1"]);
  });
  it("every FIELD_MAP key has a label; hidden keys are backend + content bullets", () => {
    for (const k of Object.keys(FIELD_MAP)) expect(FIELD_LABELS[k]).toBeTruthy();
    expect(PDP_HIDDEN_KEYS).toContain("BackendSearchTerms");
    expect(PDP_HIDDEN_KEYS).toContain("ContentBulletPoint_1");
  });
});
```

```ts
// src/lib/seo/revision-push.test.ts
import { describe, it, expect } from "vitest";
import { buildPushUpdate, findDrift } from "./revision-push";
import { overlayProduct } from "./revision-fields";

const product = { itemName: "Old", itemHighlight: null, genericKeywords: null, contentSeo: { DetailedBulletPoint1: "old" }, rawColumnValues: {}, changeLog: [] };
const fields = { Title: "New", DetailedBulletPoint_1: "new b1", BackendSearchTerms: "kw" };

describe("buildPushUpdate", () => {
  it("PREVIEW = PUSH: the pushed values equal the preview overlay for every key", () => {
    const { updates } = buildPushUpdate(product, fields, "a@x.com", "2026-10-04T10:00:00.000Z");
    const preview = overlayProduct(product, fields);
    expect(updates.itemName).toBe(preview.itemName);
    expect(updates.genericKeywords).toBe(preview.genericKeywords);
    expect(updates.contentSeo).toEqual(preview.contentSeo);
  });
  it("marks dirty, logs only changed fields, mirrors raw values", () => {
    const { updates, fieldsChanged } = buildPushUpdate(product, { ...fields, DetailedBulletPoint_1: "old" }, "a@x.com", "2026-10-04T10:00:00.000Z");
    expect(updates.isDirty).toBe(true);
    expect(fieldsChanged).toBe(3);
    const log = updates.changeLog as Array<{ field: string; newValue: string }>;
    expect(log.map((e) => e.field)).toEqual(["ItemName", "GenericKeyword1"]);
    expect((updates.rawColumnValues as Record<string, string>).ItemName).toBe("New");
  });
});

describe("findDrift (Review Focus 5)", () => {
  it("flags mapped fields edited in the catalog after approval, ignores older or unrelated edits", () => {
    const changeLog = [
      { field: "ItemName", changedAt: "2026-10-05T09:00:00.000Z", changedBy: "cat@x.com" },
      { field: "DetailedBulletPoint1", changedAt: "2026-10-01T09:00:00.000Z", changedBy: "cat@x.com" },
      { field: "Color", changedAt: "2026-10-06T09:00:00.000Z", changedBy: "cat@x.com" },
    ];
    expect(findDrift(changeLog, fields, "2026-10-04T00:00:00.000Z")).toEqual([
      { key: "Title", changedAt: "2026-10-05T09:00:00.000Z", changedBy: "cat@x.com" },
    ]);
  });
  it("tolerates a missing or malformed changeLog", () => {
    expect(findDrift(null, fields, "2026-10-04T00:00:00.000Z")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/lib/seo/revision-fields.test.ts src/lib/seo/revision-push.test.ts`
Expected: FAIL, "Failed to resolve import".

- [ ] **Step 3: Implement `revision-fields.ts`**

```ts
// src/lib/seo/revision-fields.ts
/** Listing-field math shared by the review preview and Push to Products (spec §7: preview = push). Pure. */
import { FIELD_MAP, extractMappedFields } from "@/app/api/seo/projects/[id]/migrate-to-products/field-map";

export type RevisionFields = Record<string, string>;
export type RevisionContent = Record<string, RevisionFields>;
export interface FieldSource { itemName: string | null; itemHighlight: string | null; genericKeywords: string | null; contentSeo: unknown }

export function snapshotFields(gc: unknown): RevisionFields {
  if (!gc || typeof gc !== "object") return {};
  const out: RevisionFields = {};
  for (const [key, m] of extractMappedFields(gc as Record<string, unknown>)) out[key] = m.value;
  return out;
}

function contentSeoOf(product: FieldSource): Record<string, string> {
  return product.contentSeo && typeof product.contentSeo === "object" ? { ...(product.contentSeo as Record<string, string>) } : {};
}

export function currentValue(product: FieldSource, key: string): string | null {
  const m = FIELD_MAP[key];
  if (!m) return null;
  const v = m.target === "core" ? (product as unknown as Record<string, unknown>)[m.field] : contentSeoOf(product)[m.field];
  return typeof v === "string" && v.trim() ? v : null;
}

/** A copy of the product with the revision's text in place — what the PDP preview renders and what a push writes. */
export function overlayProduct<T extends FieldSource>(product: T, fields: RevisionFields): T {
  const out = { ...product } as T & Record<string, unknown>;
  const seo = contentSeoOf(product);
  for (const [key, value] of Object.entries(fields)) {
    const m = FIELD_MAP[key];
    if (!m) continue;
    if (m.target === "core") out[m.field] = value;
    else seo[m.field] = value;
  }
  out.contentSeo = seo;
  return out;
}

export function changedKeys(product: FieldSource, fields: RevisionFields): string[] {
  return Object.keys(fields).filter((k) => FIELD_MAP[k] && (currentValue(product, k) ?? "") !== fields[k]);
}

/** Change-log / raw-values name for a FIELD_MAP key (matches the existing migrate route). */
export function bqNameFor(key: string): string {
  if (key === "Title") return "ItemName";
  if (key === "BackendSearchTerms") return "GenericKeyword1";
  const m = FIELD_MAP[key];
  return m?.target === "contentSeo" ? m.field : key;
}

const n = (k: string) => k.replace(/^.*_(\d)$/, "$1");
export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  Object.keys(FIELD_MAP).map((k) => [
    k,
    k === "Title" ? "Title"
      : k === "ItemHighlight" ? "Item highlight"
      : k === "ProductDescription" ? "Description"
      : k === "BackendSearchTerms" ? "Backend search terms"
      : k.startsWith("DetailedBulletPoint_") ? `Bullet ${n(k)}`
      : k.startsWith("ConciseBulletPoint_") ? `Concise bullet ${n(k)}`
      : k.startsWith("ContentBulletPoint_") ? `Content bullet ${n(k)}`
      : k.startsWith("KeyFeaturesBulletPoint_") ? `Key feature ${n(k)}`
      : k,
  ]),
);

/** Fields the PDP card never shows; the review page lists them in a strip under the preview. */
export const PDP_HIDDEN_KEYS: string[] = Object.keys(FIELD_MAP).filter((k) => k === "BackendSearchTerms" || k.startsWith("ContentBulletPoint_"));
```

- [ ] **Step 4: Implement `revision-push.ts`** (the logic moved from `migrate-to-products/route.ts` lines 188–235)

```ts
// src/lib/seo/revision-push.ts
import { FIELD_MAP } from "@/app/api/seo/projects/[id]/migrate-to-products/field-map";
import { bqNameFor, currentValue, overlayProduct, type FieldSource, type RevisionFields } from "./revision-fields";

type PushSource = FieldSource & { rawColumnValues: unknown; changeLog: unknown };
type LogEntry = { field: string; oldValue: string | null; newValue: string; changedBy: string; changedAt: string };

export function buildPushUpdate(product: PushSource, fields: RevisionFields, userEmail: string, nowIso: string) {
  const overlaid = overlayProduct(product, fields);
  const rawValues = { ...((product.rawColumnValues as Record<string, string>) ?? {}) };
  const changeLog: LogEntry[] = [...((Array.isArray(product.changeLog) ? product.changeLog : []) as LogEntry[])];
  let fieldsChanged = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (!FIELD_MAP[key]) continue;
    const bq = bqNameFor(key);
    const oldValue = currentValue(product, key);
    rawValues[bq] = value;
    if (oldValue !== value) changeLog.push({ field: bq, oldValue, newValue: value, changedBy: userEmail, changedAt: nowIso });
    fieldsChanged++;
  }
  const updates: Record<string, unknown> = {
    contentSeo: overlaid.contentSeo,
    rawColumnValues: rawValues,
    changeLog,
    isDirty: true,
    updatedAt: new Date(nowIso),
  };
  for (const key of Object.keys(fields)) {
    const m = FIELD_MAP[key];
    if (m?.target === "core") updates[m.field] = (overlaid as unknown as Record<string, unknown>)[m.field];
  }
  return { updates, fieldsChanged };
}

/** Mapped fields edited in the catalog after the revision was approved (spec §7 drift warning). */
export function findDrift(changeLog: unknown, fields: RevisionFields, approvedAtIso: string) {
  if (!Array.isArray(changeLog)) return [];
  const byBq = new Map(Object.keys(fields).map((k) => [bqNameFor(k), k]));
  const latest = new Map<string, { key: string; changedAt: string; changedBy: string }>();
  for (const e of changeLog as Array<{ field?: string; changedAt?: string; changedBy?: string }>) {
    const key = e?.field ? byBq.get(e.field) : undefined;
    if (!key || !e.changedAt || e.changedAt <= approvedAtIso) continue;
    const prev = latest.get(key);
    if (!prev || e.changedAt > prev.changedAt) latest.set(key, { key, changedAt: e.changedAt, changedBy: e.changedBy ?? "" });
  }
  return [...latest.values()];
}
```

- [ ] **Step 5: Run them and confirm they pass**

Run: `npx vitest run src/lib/seo/revision-fields.test.ts src/lib/seo/revision-push.test.ts`
Expected: PASS (7 tests). In the "logs only changed fields" test, `fieldsChanged` counts all 3 written fields while the log has 2 entries, because `DetailedBulletPoint_1` was unchanged.

- [ ] **Step 6: Commit**

```bash
git add -- src/lib/seo/revision-fields.ts src/lib/seo/revision-fields.test.ts src/lib/seo/revision-push.ts src/lib/seo/revision-push.test.ts
git commit -m "feat(seo): shared field math so the review preview equals the push

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/seo/revision-fields.ts src/lib/seo/revision-fields.test.ts src/lib/seo/revision-push.ts src/lib/seo/revision-push.test.ts
```

---

### Task 5: Revision DB layer (submit, decide, list, comments, pushes)

**Files:**
- Create: `src/lib/seo/revision-db.ts`
- Test: `src/lib/seo/revision-db.test.ts`

**Interfaces:**
- Consumes: Task 1 tables, `nextStatus` / `isOpen` (Task 2), `snapshotFields` (Task 4).
- Produces:
  - `class RevisionConflictError extends Error`, `class RevisionInputError extends Error`
  - `submitRevision(projectId: string, author: { email: string; name: string | null }): Promise<SeoRevision>`
  - `decideRevision(p: { revisionId: string; projectId: string; expectedStatus: string; action: RevisionAction; step: RevisionStep; actor: { email: string; name: string | null }; actedAs: "assigned" | "override" | "client"; note: string | null }): Promise<SeoRevision>`
  - `listRevisions(projectId): Promise<SeoRevision[]>` (newest first)
  - `getRevisionWithProject(revisionId): Promise<{ revision: SeoRevision; project: { id: string; name: string; clientIdCode: string | null } } | null>`
  - `listEvents(revisionId): Promise<SeoRevisionEvent[]>`
  - `listComments(revisionId): Promise<SeoRevisionComment[]>`
  - `addComment(c: { revisionId: string; asin: string; fieldKey: string; parentCommentId: string | null; audience: "internal" | "client"; authorEmail: string; authorName: string | null; body: string }): Promise<SeoRevisionComment>`
  - `setCommentResolved(commentId: string, revisionId: string, resolvedBy: string | null): Promise<void>`
  - `currentApprovedRevision(projectId): Promise<SeoRevision | null>`
  - `recordPushes(rows: Array<{ revisionId: string | null; projectId: string; productId: string; pushedBy: string; overrideReason: string | null }>): Promise<void>`

- [ ] **Step 1: Write the failing test.** It pins the race-safe WHERE clause and the conflict mapping (Review Focus 1), using the same mocked-`eq`/`and` technique as `save/route.test.ts`.

```ts
// src/lib/seo/revision-db.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  updates: [] as Array<{ table: unknown; set: Record<string, unknown>; where: unknown }>,
  inserts: [] as Array<{ table: unknown; values: unknown }>,
  updateResult: [] as unknown[],
  selectResult: [] as unknown[],
  insertError: null as unknown,
}));
vi.mock("drizzle-orm", async (orig) => ({
  ...(await orig<typeof import("drizzle-orm")>()),
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  and: (...parts: unknown[]) => ({ op: "and", parts }),
}));
vi.mock("@/lib/db", () => {
  const tx = {
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: unknown) => {
          h.updates.push({ table, set, where });
          const p = Promise.resolve([]);
          return Object.assign(p, { returning: async () => h.updateResult });
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        h.inserts.push({ table, values });
        const run = async () => { if (h.insertError) throw h.insertError; return [{ id: "new", ...(values as object) }]; };
        return Object.assign(run(), { returning: run });
      },
    }),
    select: () => ({ from: () => ({ where: async () => h.selectResult }) }),
  };
  return { db: { ...tx, transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

import { decideRevision, RevisionConflictError, submitRevision, RevisionInputError } from "./revision-db";
import { seoRevisions } from "@/lib/db/schema";

beforeEach(() => {
  h.updates.length = 0; h.inserts.length = 0; h.updateResult = []; h.selectResult = []; h.insertError = null;
});

const base = { revisionId: "R1", projectId: "P1", actor: { email: "pat@x.com", name: "Pat" }, note: null };

describe("decideRevision", () => {
  it("updates only if the revision is still in the expected status (race-safe)", async () => {
    h.updateResult = [{ id: "R1", status: "am_review" }];
    await decideRevision({ ...base, expectedStatus: "pm_review", action: "approve", step: "pm", actedAs: "assigned" });
    const u = h.updates.find((x) => x.table === seoRevisions)!;
    expect(u.set.status).toBe("am_review");
    expect(u.where).toEqual({ op: "and", parts: [{ op: "eq", col: seoRevisions.id, val: "R1" }, { op: "eq", col: seoRevisions.status, val: "pm_review" }] });
  });
  it("0 rows updated → RevisionConflictError (Review Focus 1)", async () => {
    h.updateResult = [];
    await expect(decideRevision({ ...base, expectedStatus: "pm_review", action: "approve", step: "pm", actedAs: "override" })).rejects.toBeInstanceOf(RevisionConflictError);
  });
  it("a forbidden action throws RevisionInputError before touching the DB", async () => {
    await expect(decideRevision({ ...base, expectedStatus: "pm_review", action: "send_to_client", step: "pm", actedAs: "assigned" })).rejects.toBeInstanceOf(RevisionInputError);
    expect(h.updates).toHaveLength(0);
  });
  it("approval clears the previous current revision first, then marks this one current with final_via", async () => {
    h.updateResult = [{ id: "R1", status: "approved" }];
    await decideRevision({ ...base, expectedStatus: "am_review", action: "approve_final", step: "am", actedAs: "assigned", note: "small fix" });
    const [clear, mark] = h.updates.filter((x) => x.table === seoRevisions);
    expect(clear.set).toEqual({ isCurrent: false });
    expect(mark.set).toMatchObject({ status: "approved", isCurrent: true, finalVia: "am_final", finalReason: "small fix" });
  });
});

describe("submitRevision", () => {
  it("no S6 content → RevisionInputError", async () => {
    h.selectResult = [{ asin: "A1", generatedContent: {} }];
    await expect(submitRevision("P1", { email: "s@x.com", name: "S" })).rejects.toBeInstanceOf(RevisionInputError);
  });
  it("unique violation (another open revision) → RevisionConflictError", async () => {
    h.selectResult = [{ asin: "A1", generatedContent: { Title: "t" }, n: 0 }]; // serves both the content read and the max() read
    h.insertError = Object.assign(new Error("dup"), { code: "23505" });
    await expect(submitRevision("P1", { email: "s@x.com", name: "S" })).rejects.toBeInstanceOf(RevisionConflictError);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/seo/revision-db.test.ts`
Expected: FAIL, "Failed to resolve import ./revision-db".

- [ ] **Step 3: Implement**

```ts
// src/lib/seo/revision-db.ts
import { db } from "@/lib/db";
import { seoAsins, seoProjects, seoRevisions, seoRevisionEvents, seoRevisionComments, seoRevisionPushes } from "@/lib/db/schema";
import type { SeoRevision, SeoRevisionComment, SeoRevisionEvent } from "@/lib/db/schema";
import { and, asc, desc, eq, max } from "drizzle-orm";
import { nextStatus, type RevisionAction, type RevisionStep } from "./revision-rules";
import { snapshotFields, type RevisionContent } from "./revision-fields";

export class RevisionConflictError extends Error {}
export class RevisionInputError extends Error {}

function pgCode(e: unknown): string | undefined {
  const cause = (e as { cause?: { code?: string } })?.cause;
  return cause?.code ?? (e as { code?: string })?.code;
}

export async function submitRevision(projectId: string, author: { email: string; name: string | null }): Promise<SeoRevision> {
  const rows = await db.select({ asin: seoAsins.asin, generatedContent: seoAsins.generatedContent }).from(seoAsins).where(eq(seoAsins.projectId, projectId));
  const content: RevisionContent = {};
  for (const r of rows) {
    const fields = snapshotFields(r.generatedContent);
    if (Object.keys(fields).length > 0) content[r.asin] = fields;
  }
  if (Object.keys(content).length === 0) throw new RevisionInputError("No S6 content to submit");
  try {
    return await db.transaction(async (tx) => {
      const [{ n }] = (await tx.select({ n: max(seoRevisions.revisionNumber) }).from(seoRevisions).where(eq(seoRevisions.projectId, projectId))) as Array<{ n: number | null }>;
      const [rev] = await tx.insert(seoRevisions).values({
        projectId, revisionNumber: (n ?? 0) + 1, status: "pm_review", content,
        submittedByEmail: author.email, submittedByName: author.name,
      }).returning();
      await tx.insert(seoRevisionEvents).values({ revisionId: rev.id, step: "submit", action: "submit", actorEmail: author.email, actorName: author.name, actedAs: "author", note: null });
      return rev;
    });
  } catch (e) {
    if (pgCode(e) === "23505") throw new RevisionConflictError("A revision of this project is still in review");
    throw e;
  }
}

export async function decideRevision(p: {
  revisionId: string; projectId: string; expectedStatus: string; action: RevisionAction; step: RevisionStep;
  actor: { email: string; name: string | null }; actedAs: "assigned" | "override" | "client"; note: string | null;
}): Promise<SeoRevision> {
  const next = nextStatus(p.expectedStatus, p.action);
  if (!next) throw new RevisionInputError(`Cannot ${p.action} a revision in ${p.expectedStatus}`);
  return db.transaction(async (tx) => {
    const set: Record<string, unknown> = { status: next, updatedAt: new Date() };
    if (next === "approved") {
      await tx.update(seoRevisions).set({ isCurrent: false }).where(and(eq(seoRevisions.projectId, p.projectId), eq(seoRevisions.isCurrent, true)));
      Object.assign(set, { isCurrent: true, approvedAt: new Date(), finalVia: p.step === "client" ? "client" : "am_final", finalReason: p.step === "client" ? null : p.note });
    }
    const updated = await tx.update(seoRevisions).set(set).where(and(eq(seoRevisions.id, p.revisionId), eq(seoRevisions.status, p.expectedStatus))).returning();
    if (updated.length === 0) throw new RevisionConflictError("Already decided — reload");
    await tx.insert(seoRevisionEvents).values({ revisionId: p.revisionId, step: p.step, action: p.action, actorEmail: p.actor.email, actorName: p.actor.name, actedAs: p.actedAs, note: p.note });
    return updated[0] as SeoRevision;
  });
}
```

The mocked test's `clear.set` is `{ isCurrent: false }`, so keep that update's `set` exactly that, with no `updatedAt`. The approval update runs inside the same transaction, **after** the clear, so the `uq_seo_revisions_one_current` index never sees two current rows.

```ts
export async function listRevisions(projectId: string): Promise<SeoRevision[]> {
  return db.select().from(seoRevisions).where(eq(seoRevisions.projectId, projectId)).orderBy(desc(seoRevisions.revisionNumber));
}

export async function getRevisionWithProject(revisionId: string) {
  const [row] = await db
    .select({ revision: seoRevisions, project: { id: seoProjects.id, name: seoProjects.name, clientIdCode: seoProjects.clientIdCode } })
    .from(seoRevisions)
    .innerJoin(seoProjects, eq(seoProjects.id, seoRevisions.projectId))
    .where(eq(seoRevisions.id, revisionId));
  return row ?? null;
}

export async function listEvents(revisionId: string): Promise<SeoRevisionEvent[]> {
  return db.select().from(seoRevisionEvents).where(eq(seoRevisionEvents.revisionId, revisionId)).orderBy(asc(seoRevisionEvents.createdAt));
}

export async function listComments(revisionId: string): Promise<SeoRevisionComment[]> {
  return db.select().from(seoRevisionComments).where(eq(seoRevisionComments.revisionId, revisionId)).orderBy(asc(seoRevisionComments.createdAt));
}

export async function addComment(c: {
  revisionId: string; asin: string; fieldKey: string; parentCommentId: string | null; audience: "internal" | "client";
  authorEmail: string; authorName: string | null; body: string;
}): Promise<SeoRevisionComment> {
  const [row] = await db.insert(seoRevisionComments).values(c).returning();
  return row;
}

export async function setCommentResolved(commentId: string, revisionId: string, resolvedBy: string | null): Promise<void> {
  await db.update(seoRevisionComments)
    .set({ resolvedBy, resolvedAt: resolvedBy ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(seoRevisionComments.id, commentId), eq(seoRevisionComments.revisionId, revisionId)));
}

export async function listOpenCommentsOfPrevious(projectId: string, revisionNumber: number): Promise<SeoRevisionComment[]> {
  if (revisionNumber <= 1) return [];
  const [prev] = await db.select({ id: seoRevisions.id }).from(seoRevisions)
    .where(and(eq(seoRevisions.projectId, projectId), eq(seoRevisions.revisionNumber, revisionNumber - 1)));
  if (!prev) return [];
  const rows = await listComments(prev.id);
  return rows.filter((c) => !c.resolvedAt);
}

export async function currentApprovedRevision(projectId: string): Promise<SeoRevision | null> {
  const [row] = await db.select().from(seoRevisions).where(and(eq(seoRevisions.projectId, projectId), eq(seoRevisions.isCurrent, true)));
  return row ?? null;
}

export async function recordPushes(rows: Array<{ revisionId: string | null; projectId: string; productId: string; pushedBy: string; overrideReason: string | null }>): Promise<void> {
  if (rows.length) await db.insert(seoRevisionPushes).values(rows);
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/lib/seo/revision-db.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck, then commit**

Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -oE "^[^(]+\.tsx?" | sort -u`. Expected: baseline only.

```bash
git add -- src/lib/seo/revision-db.ts src/lib/seo/revision-db.test.ts
git commit -m "feat(seo): race-safe revision submit/decide, comments and push records

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/seo/revision-db.ts src/lib/seo/revision-db.test.ts
```

---

### Task 6: Staff API: list + submit, revision detail

**Files:**
- Create: `src/app/api/seo/projects/[id]/revisions/route.ts`, `src/app/api/seo/revisions/[revisionId]/route.ts`
- Test: `src/app/api/seo/projects/[id]/revisions/route.test.ts`, `src/app/api/seo/revisions/[revisionId]/route.test.ts`

**Interfaces:**
- Consumes: Task 5 functions, `loadClientApprovers` (Task 3), `staffActedAs`, `stepFor`, `actionsFor`, `isOpen` (Task 2).
- Produces (JSON):
  - `GET /api/seo/projects/[id]/revisions` → `{ revisions: SeoRevision[]; open: SeoRevision | null; current: SeoRevision | null; approvers: Approvers; canSubmit: boolean }`
  - `POST /api/seo/projects/[id]/revisions` → `201 { revision }` | `400 { error }` | `409 { error }`
  - `GET /api/seo/revisions/[revisionId]` → `{ revision; project; products: ProductForReview[]; comments; previousOpenComments; events; approvers; me: { step: RevisionStep | null; actedAs: "assigned" | "override" | null; actions: RevisionAction[] } }`, where `ProductForReview = typeof master.$inferSelect` for the revision's ASINs within the project's client, and `previousOpenComments` = the **unresolved** comments of revision `N-1` of the same project (spec §5: unresolved comments carry over, shown as "still open").
- Add to Task 5's `revision-db.ts`: `listOpenCommentsOfPrevious(projectId: string, revisionNumber: number): Promise<SeoRevisionComment[]>`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/api/seo/projects/[id]/revisions/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  session: { user: { email: "sam@x.com", name: "Sam", role: "editor" } } as unknown,
  project: { id: "P1", clientIdCode: "TRS_SC_US", s6ApprovedAt: new Date() } as unknown,
  revisions: [] as unknown[],
  submit: vi.fn(),
}));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => h.session }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where: async () => (h.project ? [h.project] : []) }) }) } }));
vi.mock("@/lib/seo/revision-db", async (orig) => ({
  ...(await orig<typeof import("@/lib/seo/revision-db")>()),
  listRevisions: async () => h.revisions,
  submitRevision: h.submit,
}));
vi.mock("@/lib/seo/revision-approvers", () => ({ loadClientApprovers: async () => ({ pm: { name: "Pat", email: "pat@x.com" }, am: null }) }));

import { GET, POST } from "./route";
import { RevisionConflictError } from "@/lib/seo/revision-db";

const ctx = { params: Promise.resolve({ id: "P1" }) };
beforeEach(() => { h.revisions = []; h.submit.mockReset(); h.session = { user: { email: "sam@x.com", name: "Sam", role: "editor" } }; h.project = { id: "P1", clientIdCode: "TRS_SC_US", s6ApprovedAt: new Date() }; });

describe("project revisions", () => {
  it("GET: open + current + canSubmit", async () => {
    h.revisions = [{ id: "R2", status: "pm_review", isCurrent: false }, { id: "R1", status: "approved", isCurrent: true }];
    const body = await (await GET(new Request("http://x") as never, ctx)).json();
    expect(body.open.id).toBe("R2");
    expect(body.current.id).toBe("R1");
    expect(body.canSubmit).toBe(false);
    expect(body.approvers.pm.email).toBe("pat@x.com");
  });
  it("POST: viewer → 403; S6 not locked → 400", async () => {
    h.session = { user: { email: "v@x.com", role: "viewer" } };
    expect((await POST(new Request("http://x", { method: "POST" }) as never, ctx)).status).toBe(403);
    h.session = { user: { email: "sam@x.com", role: "editor" } };
    h.project = { id: "P1", clientIdCode: "TRS_SC_US", s6ApprovedAt: null };
    expect((await POST(new Request("http://x", { method: "POST" }) as never, ctx)).status).toBe(400);
  });
  it("POST: conflict → 409, success → 201", async () => {
    h.submit.mockRejectedValueOnce(new RevisionConflictError("still in review"));
    expect((await POST(new Request("http://x", { method: "POST" }) as never, ctx)).status).toBe(409);
    h.submit.mockResolvedValueOnce({ id: "R3" });
    const res = await POST(new Request("http://x", { method: "POST" }) as never, ctx);
    expect(res.status).toBe(201);
    expect(h.submit).toHaveBeenLastCalledWith("P1", { email: "sam@x.com", name: "Sam" });
  });
});
```

```ts
// src/app/api/seo/revisions/[revisionId]/route.test.ts
import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ session: { user: { email: "pat@x.com", name: "Pat", role: "editor" } } as unknown }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => h.session }));
vi.mock("@/lib/seo/revision-db", () => ({
  getRevisionWithProject: async (id: string) => id === "R1"
    ? { revision: { id: "R1", status: "pm_review", submittedByEmail: "sam@x.com", content: { A1: { Title: "t" } } }, project: { id: "P1", name: "TRS_v01", clientIdCode: "TRS_SC_US" } }
    : null,
  listComments: async () => [{ id: "C1", audience: "internal" }],
  listOpenCommentsOfPrevious: async () => [{ id: "C0", body: "still open from r1" }],
  listEvents: async () => [],
}));
vi.mock("@/lib/seo/revision-approvers", () => ({ loadClientApprovers: async () => ({ pm: { name: "Pat", email: "pat@x.com" }, am: null }) }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where: async () => [{ id: "M1", asin: "A1" }] }) }) } }));

import { GET } from "./route";

describe("GET revision detail (staff)", () => {
  it("assigned PM sees approve/request_changes", async () => {
    const body = await (await GET(new Request("http://x") as never, { params: Promise.resolve({ revisionId: "R1" }) })).json();
    expect(body.me).toEqual({ step: "pm", actedAs: "assigned", actions: ["approve", "request_changes"] });
    expect(body.products).toHaveLength(1);
    expect(body.comments).toHaveLength(1);
    expect(body.previousOpenComments).toEqual([{ id: "C0", body: "still open from r1" }]);
  });
  it("unknown revision → 404; client role → 403", async () => {
    expect((await GET(new Request("http://x") as never, { params: Promise.resolve({ revisionId: "NOPE" }) })).status).toBe(404);
    h.session = { user: { email: "c@x.com", role: "client" } };
    expect((await GET(new Request("http://x") as never, { params: Promise.resolve({ revisionId: "R1" }) })).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run "src/app/api/seo/projects/[id]/revisions" "src/app/api/seo/revisions/[revisionId]/route.test.ts"`
Expected: FAIL, "Failed to resolve import ./route".

- [ ] **Step 3: Implement `src/app/api/seo/projects/[id]/revisions/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoProjects } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { isOpen } from "@/lib/seo/revision-rules";
import { listRevisions, submitRevision, RevisionConflictError, RevisionInputError } from "@/lib/seo/revision-db";
import { loadClientApprovers } from "@/lib/seo/revision-approvers";

type Ctx = { params: Promise<{ id: string }> };

async function loadProject(id: string) {
  const [p] = await db.select({ id: seoProjects.id, clientIdCode: seoProjects.clientIdCode, s6ApprovedAt: seoProjects.s6ApprovedAt }).from(seoProjects).where(eq(seoProjects.id, id));
  return p ?? null;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role) && session.user.role !== "viewer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const revisions = await listRevisions(id);
  const open = revisions.find((r) => isOpen(r.status)) ?? null;
  const current = revisions.find((r) => r.isCurrent) ?? null;
  const approvers = project.clientIdCode ? await loadClientApprovers(project.clientIdCode) : { pm: null, am: null };
  const canSubmit = isEditorOrAbove(session.user.role) && !open && !!project.s6ApprovedAt;
  return NextResponse.json({ revisions, open, current, approvers, canSubmit });
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.s6ApprovedAt) return NextResponse.json({ error: "Save & lock S6 before submitting for review" }, { status: 400 });
  try {
    const revision = await submitRevision(id, { email: session.user.email, name: session.user.name ?? null });
    return NextResponse.json({ revision }, { status: 201 });
  } catch (e) {
    if (e instanceof RevisionConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof RevisionInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
```

- [ ] **Step 4: Implement `src/app/api/seo/revisions/[revisionId]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { actionsFor, staffActedAs, stepFor } from "@/lib/seo/revision-rules";
import { getRevisionWithProject, listComments, listEvents, listOpenCommentsOfPrevious } from "@/lib/seo/revision-db";
import { loadClientApprovers } from "@/lib/seo/revision-approvers";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { revisionId } = await params;
  const found = await getRevisionWithProject(revisionId);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { revision, project } = found;
  const asins = Object.keys(revision.content ?? {});
  const [products, comments, events, approvers, previousOpenComments] = await Promise.all([
    asins.length && project.clientIdCode
      ? db.select().from(master).where(and(inArray(master.asin, asins), eq(master.clientIdCode, project.clientIdCode)))
      : Promise.resolve([]),
    listComments(revisionId),
    listEvents(revisionId),
    project.clientIdCode ? loadClientApprovers(project.clientIdCode) : Promise.resolve({ pm: null, am: null }),
    listOpenCommentsOfPrevious(project.id, revision.revisionNumber),
  ]);
  const step = stepFor(revision.status);
  const actedAs = step === "pm" || step === "am" ? staffActedAs(step, { email: session.user.email, role: session.user.role }, approvers, revision.submittedByEmail) : null;
  const actions = step && step !== "client" && actedAs ? actionsFor(step) : [];
  return NextResponse.json({ revision, project, products, comments, previousOpenComments, events, approvers, me: { step, actedAs, actions } });
}
```

`isHubStaff` exists in `src/lib/roles.ts:79`; confirm it returns false for `client`.

- [ ] **Step 5: Run them and confirm they pass**

Run: `npx vitest run "src/app/api/seo/projects/[id]/revisions" "src/app/api/seo/revisions/[revisionId]/route.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck, then commit**

```bash
git add -- "src/app/api/seo/projects/[id]/revisions/route.ts" "src/app/api/seo/projects/[id]/revisions/route.test.ts" "src/app/api/seo/revisions/[revisionId]/route.ts" "src/app/api/seo/revisions/[revisionId]/route.test.ts"
git commit -m "feat(seo): revision list/submit and staff detail API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "src/app/api/seo/projects/[id]/revisions/route.ts" "src/app/api/seo/projects/[id]/revisions/route.test.ts" "src/app/api/seo/revisions/[revisionId]/route.ts" "src/app/api/seo/revisions/[revisionId]/route.test.ts"
```

---

### Task 7: Staff API: decisions, comments, "awaiting me"

**Files:**
- Create: `src/app/api/seo/revisions/[revisionId]/decision/route.ts`, `src/app/api/seo/revisions/[revisionId]/comments/route.ts`, `src/app/api/seo/revisions/route.ts`
- Test: `src/app/api/seo/revisions/[revisionId]/decision/route.test.ts`, `src/app/api/seo/revisions/[revisionId]/comments/route.test.ts`

**Interfaces:**
- Consumes: Task 5, Task 3, Task 2.
- Produces:
  - `POST .../decision` with body `{ action: RevisionAction; expectedStatus: string; note?: string }` → `200 { revision }` | `400` | `403` | `409 { error }`
  - `POST .../comments` with body `{ asin, fieldKey, body, parentCommentId?, audience?: "internal" | "client" }` → `201 { comment }`; `PATCH .../comments` with body `{ commentId, resolved: boolean }` → `200 { ok: true }`
  - `GET /api/seo/revisions?awaiting=me` → `{ items: Array<{ revisionId; projectId; projectName; clientIdCode; revisionNumber; status; unassigned: boolean }> }`

- [ ] **Step 1: Write the failing decision test**

```ts
// src/app/api/seo/revisions/[revisionId]/decision/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ session: null as unknown, decide: vi.fn(), status: "pm_review" }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => h.session }));
vi.mock("@/lib/seo/revision-db", async (orig) => ({
  ...(await orig<typeof import("@/lib/seo/revision-db")>()),
  getRevisionWithProject: async () => ({ revision: { id: "R1", status: h.status, submittedByEmail: "sam@x.com" }, project: { id: "P1", clientIdCode: "TRS_SC_US" } }),
  decideRevision: h.decide,
}));
vi.mock("@/lib/seo/revision-approvers", () => ({ loadClientApprovers: async () => ({ pm: { name: "Pat", email: "pat@x.com" }, am: { name: "Ann", email: "ann@x.com" } }) }));

import { POST } from "./route";
import { RevisionConflictError } from "@/lib/seo/revision-db";

const call = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as never, { params: Promise.resolve({ revisionId: "R1" }) });
beforeEach(() => { h.decide.mockReset(); h.decide.mockResolvedValue({ id: "R1" }); h.status = "pm_review"; h.session = { user: { email: "pat@x.com", name: "Pat", role: "editor" } }; });

describe("POST decision", () => {
  it("assigned PM approves → decideRevision with step pm, assigned", async () => {
    expect((await call({ action: "approve", expectedStatus: "pm_review" })).status).toBe(200);
    expect(h.decide).toHaveBeenCalledWith(expect.objectContaining({ step: "pm", actedAs: "assigned", action: "approve", expectedStatus: "pm_review" }));
  });
  it("request_changes without a note → 400", async () => {
    expect((await call({ action: "request_changes", expectedStatus: "pm_review" })).status).toBe(400);
  });
  it("the AM acting on the PM step → 403; the author → 403", async () => {
    h.session = { user: { email: "ann@x.com", role: "admin" } };
    expect((await call({ action: "approve", expectedStatus: "pm_review" })).status).toBe(403);
    h.session = { user: { email: "sam@x.com", role: "owner" } };
    expect((await call({ action: "approve", expectedStatus: "pm_review" })).status).toBe(403);
  });
  it("stale expectedStatus → 409 without calling the DB; a DB race → 409", async () => {
    expect((await call({ action: "approve", expectedStatus: "am_review" })).status).toBe(409);
    h.decide.mockRejectedValueOnce(new RevisionConflictError("Already decided — reload"));
    expect((await call({ action: "approve", expectedStatus: "pm_review" })).status).toBe(409);
  });
  it("the client step is not decidable here → 403", async () => {
    h.status = "client_review";
    h.session = { user: { email: "boss@x.com", role: "owner" } };
    expect((await call({ action: "approve", expectedStatus: "client_review" })).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run "src/app/api/seo/revisions/[revisionId]/decision"`
Expected: FAIL, "Failed to resolve import ./route".

- [ ] **Step 3: Implement the decision route**

```ts
// src/app/api/seo/revisions/[revisionId]/decision/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { actionNeedsNote, actionsFor, staffActedAs, stepFor, type RevisionAction } from "@/lib/seo/revision-rules";
import { decideRevision, getRevisionWithProject, RevisionConflictError, RevisionInputError } from "@/lib/seo/revision-db";
import { loadClientApprovers } from "@/lib/seo/revision-approvers";

export async function POST(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { revisionId } = await params;
  const body = (await req.json().catch(() => null)) as { action?: RevisionAction; expectedStatus?: string; note?: string } | null;
  if (!body?.action || !body.expectedStatus) return NextResponse.json({ error: "action and expectedStatus are required" }, { status: 400 });
  const note = body.note?.trim() || null;
  if (actionNeedsNote(body.action) && !note) return NextResponse.json({ error: "A note is required" }, { status: 400 });

  const found = await getRevisionWithProject(revisionId);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { revision, project } = found;
  if (revision.status !== body.expectedStatus) return NextResponse.json({ error: "Already decided — reload" }, { status: 409 });
  const step = stepFor(revision.status);
  if (step !== "pm" && step !== "am") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!actionsFor(step).includes(body.action)) return NextResponse.json({ error: `Cannot ${body.action} at the ${step.toUpperCase()} step` }, { status: 400 });

  const approvers = project.clientIdCode ? await loadClientApprovers(project.clientIdCode) : { pm: null, am: null };
  const actedAs = staffActedAs(step, { email: session.user.email, role: session.user.role }, approvers, revision.submittedByEmail);
  if (!actedAs) return NextResponse.json({ error: "Only the assigned approver or an Owner/Super Admin can decide this step" }, { status: 403 });

  try {
    const updated = await decideRevision({
      revisionId, projectId: project.id, expectedStatus: body.expectedStatus, action: body.action, step,
      actor: { email: session.user.email, name: session.user.name ?? null }, actedAs, note,
    });
    return NextResponse.json({ revision: updated });
  } catch (e) {
    if (e instanceof RevisionConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof RevisionInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run "src/app/api/seo/revisions/[revisionId]/decision"`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing comments test**

```ts
// src/app/api/seo/revisions/[revisionId]/comments/route.test.ts
import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ add: vi.fn(async (c: unknown) => ({ id: "C1", ...(c as object) })), resolve: vi.fn() }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => ({ user: { email: "pat@x.com", name: "Pat", role: "editor" } }) }));
vi.mock("@/lib/seo/revision-db", () => ({
  getRevisionWithProject: async () => ({ revision: { id: "R1", content: { A1: { Title: "t" } } }, project: { id: "P1" } }),
  addComment: h.add, setCommentResolved: h.resolve,
}));

import { PATCH, POST } from "./route";
const ctx = { params: Promise.resolve({ revisionId: "R1" }) };
const req = (method: string, body: unknown) => new Request("http://x", { method, body: JSON.stringify(body) }) as never;

describe("staff comments", () => {
  it("defaults to internal audience; rejects an ASIN or field not in the revision", async () => {
    expect((await POST(req("POST", { asin: "A1", fieldKey: "Title", body: "tighter" }), ctx)).status).toBe(201);
    expect(h.add).toHaveBeenLastCalledWith(expect.objectContaining({ audience: "internal", authorEmail: "pat@x.com" }));
    expect((await POST(req("POST", { asin: "ZZ", fieldKey: "Title", body: "x" }), ctx)).status).toBe(400);
    expect((await POST(req("POST", { asin: "A1", fieldKey: "Nope", body: "x" }), ctx)).status).toBe(400);
  });
  it("resolve / unresolve", async () => {
    expect((await PATCH(req("PATCH", { commentId: "C1", resolved: true }), ctx)).status).toBe(200);
    expect(h.resolve).toHaveBeenLastCalledWith("C1", "R1", "pat@x.com");
    await PATCH(req("PATCH", { commentId: "C1", resolved: false }), ctx);
    expect(h.resolve).toHaveBeenLastCalledWith("C1", "R1", null);
  });
});
```

- [ ] **Step 6: Implement the comments route**

```ts
// src/app/api/seo/revisions/[revisionId]/comments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { FIELD_MAP } from "@/app/api/seo/projects/[id]/migrate-to-products/field-map";
import { addComment, getRevisionWithProject, setCommentResolved } from "@/lib/seo/revision-db";

type Ctx = { params: Promise<{ revisionId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { revisionId } = await params;
  const b = (await req.json().catch(() => null)) as { asin?: string; fieldKey?: string; body?: string; parentCommentId?: string; audience?: string } | null;
  const text = b?.body?.trim();
  if (!b?.asin || !b.fieldKey || !text) return NextResponse.json({ error: "asin, fieldKey and body are required" }, { status: 400 });
  const found = await getRevisionWithProject(revisionId);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(b.asin in (found.revision.content ?? {})) || !(b.fieldKey in FIELD_MAP)) return NextResponse.json({ error: "Unknown ASIN or field for this revision" }, { status: 400 });
  const comment = await addComment({
    revisionId, asin: b.asin, fieldKey: b.fieldKey, parentCommentId: b.parentCommentId ?? null,
    audience: b.audience === "client" ? "client" : "internal",
    authorEmail: session.user.email, authorName: session.user.name ?? null, body: text,
  });
  return NextResponse.json({ comment }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { revisionId } = await params;
  const b = (await req.json().catch(() => null)) as { commentId?: string; resolved?: boolean } | null;
  if (!b?.commentId || typeof b.resolved !== "boolean") return NextResponse.json({ error: "commentId and resolved are required" }, { status: 400 });
  await setCommentResolved(b.commentId, revisionId, b.resolved ? session.user.email : null);
  return NextResponse.json({ ok: true });
}
```

Comment rows for a revision are also allowed on the S6 page after `changes_requested`, since the specialist resolves them there, so resolving doesn't check the revision status.

- [ ] **Step 7: Implement the "awaiting me" list** (`src/app/api/seo/revisions/route.ts`; no dedicated unit test, covered in the Task 14 browser pass)

```ts
import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoProjects, seoRevisions } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { hasSuperPowers, isHubStaff } from "@/lib/roles";
import { staffActedAs, stepFor } from "@/lib/seo/revision-rules";
import { loadClientApprovers } from "@/lib/seo/revision-approvers";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (req.nextUrl.searchParams.get("awaiting") !== "me") return NextResponse.json({ error: "awaiting=me is required" }, { status: 400 });
  const rows = await db
    .select({ revisionId: seoRevisions.id, projectId: seoProjects.id, projectName: seoProjects.name, clientIdCode: seoProjects.clientIdCode, revisionNumber: seoRevisions.revisionNumber, status: seoRevisions.status, submittedByEmail: seoRevisions.submittedByEmail })
    .from(seoRevisions)
    .innerJoin(seoProjects, eq(seoProjects.id, seoRevisions.projectId))
    .where(inArray(seoRevisions.status, ["pm_review", "am_review"]));
  const approversByClient = new Map<string, Awaited<ReturnType<typeof loadClientApprovers>>>();
  for (const code of new Set(rows.map((r) => r.clientIdCode).filter((c): c is string => !!c))) approversByClient.set(code, await loadClientApprovers(code));
  const items = rows.flatMap((r) => {
    const step = stepFor(r.status) as "pm" | "am";
    const approvers = (r.clientIdCode && approversByClient.get(r.clientIdCode)) || { pm: null, am: null };
    const unassigned = !approvers[step]?.email;
    const as = staffActedAs(step, { email: session.user.email, role: session.user.role }, approvers, r.submittedByEmail);
    if (as === "assigned" || (unassigned && hasSuperPowers(session.user.role))) {
      return [{ revisionId: r.revisionId, projectId: r.projectId, projectName: r.projectName, clientIdCode: r.clientIdCode, revisionNumber: r.revisionNumber, status: r.status, unassigned }];
    }
    return [];
  });
  return NextResponse.json({ items });
}
```

- [ ] **Step 8: Run all Task 7 tests, then typecheck**

Run: `npx vitest run "src/app/api/seo/revisions"` and then `node_modules/.bin/tsc --noEmit 2>&1 | grep -oE "^[^(]+\.tsx?" | sort -u`.
Expected: PASS (decision 6 + comments 2 + detail 2); baseline tsc.

- [ ] **Step 9: Commit**

```bash
git add -- "src/app/api/seo/revisions/route.ts" "src/app/api/seo/revisions/[revisionId]/decision/route.ts" "src/app/api/seo/revisions/[revisionId]/decision/route.test.ts" "src/app/api/seo/revisions/[revisionId]/comments/route.ts" "src/app/api/seo/revisions/[revisionId]/comments/route.test.ts"
git commit -m "feat(seo): PM/AM decisions, revision comments, awaiting-me list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "src/app/api/seo/revisions/route.ts" "src/app/api/seo/revisions/[revisionId]/decision/route.ts" "src/app/api/seo/revisions/[revisionId]/decision/route.test.ts" "src/app/api/seo/revisions/[revisionId]/comments/route.ts" "src/app/api/seo/revisions/[revisionId]/comments/route.test.ts"
```

---

### Task 8: Push to Products ships the approved revision (+ product revision line API)

**Files:**
- Modify: `src/app/api/seo/projects/[id]/migrate-to-products/route.ts` (GET and POST)
- Create: `src/app/api/products/[id]/seo-revision/route.ts`
- Test: `src/app/api/seo/projects/[id]/migrate-to-products/route.test.ts`

**Interfaces:**
- Consumes: `currentApprovedRevision`, `recordPushes` (Task 5); `buildPushUpdate`, `findDrift` (Task 4); `extractMappedFields`; `hasSuperPowers`.
- Produces:
  - `GET .../migrate-to-products` → `{ source: "revision" | "none"; revision: { id; revisionNumber; approvedAt; finalVia } | null; asins: Array<{ asin; productId: string | null; changes: string[]; drift: Array<{ key; changedAt; changedBy }> }> }`
  - `POST .../migrate-to-products` with body `{ confirmDrift?: boolean; override?: { reason: string } }` → `200 { success, migratedCount, fieldsUpdated, unmatchedAsins }` | `409 { error, drift? }` | `403`
  - `GET /api/products/[id]/seo-revision` → `{ push: { pushedAt; pushedBy; overrideReason; revisionNumber: number | null; projectName: string; approvedAt: string | null; finalVia: string | null; revisionId: string | null } | null }`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/seo/projects/[id]/migrate-to-products/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  session: { user: { email: "sam@x.com", name: "Sam", role: "editor" } } as unknown,
  current: null as unknown,
  products: [] as unknown[],
  masterUpdates: [] as unknown[],
  pushes: vi.fn(),
}));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => h.session }));
vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/seo/revision-db", () => ({ currentApprovedRevision: async () => h.current, recordPushes: h.pushes }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Object.assign(Promise.resolve(h.products), { limit: async () => [{ id: "P1", name: "TRS_v01", brandName: "B", clientIdCode: "TRS_SC_US" }] }) }) }),
    update: () => ({ set: (s: unknown) => ({ where: async () => { h.masterUpdates.push(s); } }) }),
    insert: () => ({ values: async () => undefined }),
  },
}));

import { POST } from "./route";
const call = (body: unknown = {}) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: "P1" }) });

beforeEach(() => {
  h.session = { user: { email: "sam@x.com", name: "Sam", role: "editor" } };
  h.masterUpdates.length = 0; h.pushes.mockReset();
  h.current = { id: "R3", revisionNumber: 3, approvedAt: new Date("2026-10-04T00:00:00Z"), finalVia: "client", content: { A1: { Title: "Approved title" } } };
  h.products = [{ id: "M1", asin: "A1", sku: "S", clientIdCode: "TRS_SC_US", itemName: "Old", itemHighlight: null, genericKeywords: null, contentSeo: {}, rawColumnValues: {}, changeLog: [] }];
});

describe("push approved revision", () => {
  it("no approved revision → 409", async () => {
    h.current = null;
    expect((await call()).status).toBe(409);
  });
  it("pushes the revision's text (not S6) and records the push", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect((h.masterUpdates[0] as { itemName: string }).itemName).toBe("Approved title");
    expect(h.pushes).toHaveBeenCalledWith([{ revisionId: "R3", projectId: "P1", productId: "M1", pushedBy: "sam@x.com", overrideReason: null }]);
  });
  it("catalog drift after approval → 409 with drift until confirmDrift (Review Focus 5)", async () => {
    (h.products[0] as { changeLog: unknown[] }).changeLog = [{ field: "ItemName", changedAt: "2026-10-05T00:00:00.000Z", changedBy: "cat@x.com" }];
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).drift[0]).toMatchObject({ asin: "A1", key: "Title" });
    expect((await call({ confirmDrift: true })).status).toBe(200);
  });
  it("override without an approved revision: owner + reason only", async () => {
    h.current = null;
    expect((await call({ override: { reason: "urgent" } })).status).toBe(403);
    h.session = { user: { email: "boss@x.com", role: "owner" } };
    expect((await call({ override: { reason: " " } })).status).toBe(400);
  });
});
```

The override path needs S6 content. The mocked `select` returns `h.products` for every query, so in the override test the owner call with an empty reason hits 400 before any read. A successful override push is covered in the Task 14 browser pass.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run "src/app/api/seo/projects/[id]/migrate-to-products/route.test.ts"`
Expected: FAIL. The current route pushes `seoAsins.generatedContent`, returns 400/200 in the wrong cases, and never calls `recordPushes`.

- [ ] **Step 3: Rewrite the POST handler.** Replace the body of `POST` from `// Load SEO ASINs with generated content` down to the per-product loop's end with the code below. Keep the session/project loading above it and the `logEvent` + JSON response below it; add `revisionId`, `override` and `drift` to the `logEvent` detail.

```ts
  const body = (await req.json().catch(() => ({}))) as { confirmDrift?: boolean; override?: { reason?: string } };
  const current = await currentApprovedRevision(projectId);
  let contentByAsin: Record<string, Record<string, string>>;
  let overrideReason: string | null = null;
  if (current) {
    contentByAsin = current.content as Record<string, Record<string, string>>;
  } else if (body.override) {
    if (!hasSuperPowers(session.user.role)) return NextResponse.json({ error: "Only an Owner or Super Admin can push without review" }, { status: 403 });
    overrideReason = body.override.reason?.trim() || null;
    if (!overrideReason) return NextResponse.json({ error: "A reason is required to push without review" }, { status: 400 });
    const asinRows = await db.select({ asin: seoAsins.asin, generatedContent: seoAsins.generatedContent }).from(seoAsins).where(eq(seoAsins.projectId, projectId));
    contentByAsin = Object.fromEntries(asinRows.map((a) => [a.asin, snapshotFields(a.generatedContent)]).filter(([, f]) => Object.keys(f as object).length > 0));
  } else {
    return NextResponse.json({ error: "Needs an approved revision" }, { status: 409 });
  }

  const asinCodes = Object.keys(contentByAsin);
  if (asinCodes.length === 0) return NextResponse.json({ error: "No content to push" }, { status: 400 });
  const products = await db.select({
    id: master.id, asin: master.asin, sku: master.sku, clientIdCode: master.clientIdCode,
    itemName: master.itemName, itemHighlight: master.itemHighlight, genericKeywords: master.genericKeywords,
    contentSeo: master.contentSeo, rawColumnValues: master.rawColumnValues, changeLog: master.changeLog,
  }).from(master).where(project.clientIdCode ? and(inArray(master.asin, asinCodes), eq(master.clientIdCode, project.clientIdCode)) : inArray(master.asin, asinCodes));
  const productByAsin = new Map(products.map((p) => [p.asin, p]));

  if (current?.approvedAt && !body.confirmDrift) {
    const approvedIso = new Date(current.approvedAt).toISOString();
    const drift = asinCodes.flatMap((asin) => {
      const p = productByAsin.get(asin);
      return p ? findDrift(p.changeLog, contentByAsin[asin], approvedIso).map((d) => ({ asin, ...d })) : [];
    });
    if (drift.length) return NextResponse.json({ error: "Edited in the catalog after approval — confirm to overwrite", drift }, { status: 409 });
  }

  const userEmail = session.user.email || "system";
  const nowIso = new Date().toISOString();
  const label = current
    ? `SEO ${project.name} r${current.revisionNumber} (${current.finalVia === "client" ? "approved by client" : "AM final"}, ${nowIso.slice(0, 10)})`
    : `SEO ${project.name} (pushed without review: ${overrideReason})`;
  let migratedCount = 0;
  let fieldsUpdated = 0;
  const unmatchedAsins: string[] = [];
  const pushed: Array<{ revisionId: string | null; projectId: string; productId: string; pushedBy: string; overrideReason: string | null }> = [];

  for (const asin of asinCodes) {
    const product = productByAsin.get(asin);
    if (!product) { unmatchedAsins.push(asin); continue; }
    const { updates, fieldsChanged } = buildPushUpdate(product, contentByAsin[asin], userEmail, nowIso);
    if (fieldsChanged === 0) continue;
    await db.update(master).set(updates).where(eq(master.id, product.id));
    await db.insert(activityLog).values({
      productId: product.id, asin: product.asin, sku: product.sku, clientIdCode: product.clientIdCode,
      itemName: (updates.itemName as string) || product.itemName,
      fieldLabel: label, bqName: "SEO_MIGRATION", oldValue: null, newValue: `${fieldsChanged} fields migrated`,
      changedBy: userEmail, editType: "single",
    });
    pushed.push({ revisionId: current?.id ?? null, projectId, productId: product.id, pushedBy: userEmail, overrideReason });
    migratedCount++;
    fieldsUpdated += fieldsChanged;
  }
  await recordPushes(pushed);
```

Update the imports: add `snapshotFields` from `@/lib/seo/revision-fields`, `buildPushUpdate` and `findDrift` from `@/lib/seo/revision-push`, `currentApprovedRevision` and `recordPushes` from `@/lib/seo/revision-db`, and `hasSuperPowers` from `@/lib/roles`. Remove `FIELD_MAP` / `extractMappedFields` from the imports if nothing else in the file uses them. The response's `totalAsins` becomes `asinCodes.length`.

- [ ] **Step 4: Rewrite the GET preview** so it reports the revision source, per-ASIN changed keys and drift. Replace its body after the project load with:

```ts
  const current = await currentApprovedRevision(projectId);
  if (!current) return NextResponse.json({ source: "none", revision: null, asins: [] });
  const content = current.content as Record<string, Record<string, string>>;
  const asinCodes = Object.keys(content);
  const products = await db.select({
    id: master.id, asin: master.asin, itemName: master.itemName, itemHighlight: master.itemHighlight,
    genericKeywords: master.genericKeywords, contentSeo: master.contentSeo, changeLog: master.changeLog,
  }).from(master).where(project.clientIdCode ? and(inArray(master.asin, asinCodes), eq(master.clientIdCode, project.clientIdCode)) : inArray(master.asin, asinCodes));
  const byAsin = new Map(products.map((p) => [p.asin, p]));
  const approvedIso = current.approvedAt ? new Date(current.approvedAt).toISOString() : "";
  return NextResponse.json({
    source: "revision",
    revision: { id: current.id, revisionNumber: current.revisionNumber, approvedAt: current.approvedAt, finalVia: current.finalVia },
    asins: asinCodes.map((asin) => {
      const p = byAsin.get(asin);
      return {
        asin, productId: p?.id ?? null,
        changes: p ? changedKeys(p, content[asin]) : Object.keys(content[asin]),
        drift: p && approvedIso ? findDrift(p.changeLog, content[asin], approvedIso) : [],
      };
    }),
  });
```

(import `changedKeys` from `@/lib/seo/revision-fields`; the GET's project select must include `clientIdCode`).

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run "src/app/api/seo/projects/[id]/migrate-to-products"`
Expected: PASS (4 new + the existing `field-map.test.ts`).

- [ ] **Step 6: Implement `src/app/api/products/[id]/seo-revision/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoProjects, seoRevisionPushes, seoRevisions } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const [row] = await db
    .select({
      pushedAt: seoRevisionPushes.createdAt, pushedBy: seoRevisionPushes.pushedBy, overrideReason: seoRevisionPushes.overrideReason,
      revisionId: seoRevisions.id, revisionNumber: seoRevisions.revisionNumber, approvedAt: seoRevisions.approvedAt, finalVia: seoRevisions.finalVia,
      projectName: seoProjects.name, projectId: seoProjects.id,
    })
    .from(seoRevisionPushes)
    .innerJoin(seoProjects, eq(seoProjects.id, seoRevisionPushes.projectId))
    .leftJoin(seoRevisions, eq(seoRevisions.id, seoRevisionPushes.revisionId))
    .where(eq(seoRevisionPushes.productId, id))
    .orderBy(desc(seoRevisionPushes.createdAt))
    .limit(1);
  return NextResponse.json({ push: row ?? null });
}
```

- [ ] **Step 7: Typecheck, then commit**

```bash
git add -- "src/app/api/seo/projects/[id]/migrate-to-products/route.ts" "src/app/api/seo/projects/[id]/migrate-to-products/route.test.ts" "src/app/api/products/[id]/seo-revision/route.ts"
git commit -m "feat(seo): Push to Products ships only the approved revision, with drift check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "src/app/api/seo/projects/[id]/migrate-to-products/route.ts" "src/app/api/seo/projects/[id]/migrate-to-products/route.test.ts" "src/app/api/products/[id]/seo-revision/route.ts"
```

---

### Task 9: Portal API (access, client-safe shape, list/detail/decision/comments)

**Files:**
- Create: `src/lib/seo/revision-portal.ts`, `src/app/api/portal/seo/revisions/route.ts`, `src/app/api/portal/seo/revisions/[revisionId]/route.ts`, `src/app/api/portal/seo/revisions/[revisionId]/comments/route.ts`
- Test: `src/lib/seo/revision-portal.test.ts`, `src/app/api/portal/seo/revisions/[revisionId]/route.test.ts`

**Interfaces:**
- Consumes: `parseClientIdCodes` (`@/lib/client-codes`), `hasAdminPowers`, `canAccess` (`@/lib/permissions`), Task 5 functions.
- Produces:
  - `portalClientAllowed(session: { user: { role: string; clientIdCode?: string | null } }, clientIdCode: string): boolean`
  - `seoSectionEnabled(clientIdCode: string): Promise<boolean>`
  - `interface ClientRevision { id; revisionNumber; status; projectName; submittedAt: string; content; comments: ClientComment[]; decision: { at: string; byName: string | null; action: string } | null }`
  - `interface ClientComment { id; asin; fieldKey; parentCommentId: string | null; authorName: string | null; body; createdAt: string; resolved: boolean }`
  - `toClientRevision(rev: SeoRevision, projectName: string, comments: SeoRevisionComment[], events: SeoRevisionEvent[]): ClientRevision`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/seo/revision-portal.test.ts
import { describe, it, expect } from "vitest";
import { portalClientAllowed, toClientRevision } from "./revision-portal";

const rev = { id: "R1", revisionNumber: 2, status: "client_review", submittedAt: new Date("2026-10-02T00:00:00Z"), content: { A1: { Title: "t" } }, finalReason: "SECRET-OVERRIDE-REASON", submittedByEmail: "sam@x.com" } as never;
const comments = [
  { id: "C1", asin: "A1", fieldKey: "Title", parentCommentId: null, audience: "internal", authorName: "Pat", body: "SECRET-PM-NOTE", createdAt: new Date(), resolvedAt: null },
  { id: "C2", asin: "A1", fieldKey: "Title", parentCommentId: null, audience: "client", authorName: "Maria", body: "Shorter please", createdAt: new Date(), resolvedAt: null },
] as never;
const events = [
  { step: "pm", action: "request_changes", note: "SECRET-EVENT-NOTE", actorName: "Pat", createdAt: new Date() },
  { step: "client", action: "approve", note: null, actorName: "Maria", createdAt: new Date("2026-10-04T00:00:00Z") },
] as never;

describe("toClientRevision (Review Focus 3)", () => {
  it("keeps client comments and the client's decision, drops everything internal", () => {
    const out = toClientRevision(rev, "TRS_v01", comments, events);
    expect(out.comments.map((c) => c.id)).toEqual(["C2"]);
    expect(out.decision).toEqual({ at: "2026-10-04T00:00:00.000Z", byName: "Maria", action: "approve" });
    const json = JSON.stringify(out);
    for (const secret of ["SECRET-PM-NOTE", "SECRET-EVENT-NOTE", "SECRET-OVERRIDE-REASON", "sam@x.com"]) expect(json).not.toContain(secret);
  });
});

describe("portalClientAllowed (Review Focus 4)", () => {
  it("multi-account client user sees each of their clients, not others", () => {
    const s = { user: { role: "client", clientIdCode: "TRT_SC_US, TRS_SC_US" } };
    expect(portalClientAllowed(s, "TRS_SC_US")).toBe(true);
    expect(portalClientAllowed(s, "REA_SC_US")).toBe(false);
  });
  it("admins may preview; editors and viewers may not", () => {
    expect(portalClientAllowed({ user: { role: "owner" } }, "REA_SC_US")).toBe(true);
    expect(portalClientAllowed({ user: { role: "editor" } }, "REA_SC_US")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/seo/revision-portal.test.ts`
Expected: FAIL, "Failed to resolve import ./revision-portal".

- [ ] **Step 3: Implement `src/lib/seo/revision-portal.ts`**

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import type { SeoRevision, SeoRevisionComment, SeoRevisionEvent } from "@/lib/db/schema";
import { parseClientIdCodes } from "@/lib/client-codes";
import { hasAdminPowers } from "@/lib/roles";
import { canAccess } from "@/lib/permissions";

export interface ClientComment { id: string; asin: string; fieldKey: string; parentCommentId: string | null; authorName: string | null; body: string; createdAt: string; resolved: boolean }
export interface ClientRevision {
  id: string; revisionNumber: number; status: string; projectName: string; submittedAt: string;
  content: Record<string, Record<string, string>>; comments: ClientComment[];
  decision: { at: string; byName: string | null; action: string } | null;
}

export function portalClientAllowed(session: { user: { role: string; clientIdCode?: string | null } }, clientIdCode: string): boolean {
  const role = session.user.role;
  if (role === "client" || role === "prospect") return parseClientIdCodes(session.user.clientIdCode).includes(clientIdCode);
  return hasAdminPowers(role);
}

export async function seoSectionEnabled(clientIdCode: string): Promise<boolean> {
  const [row] = await db.select({ allowedSections: aac.allowedSections }).from(aac).where(eq(aac.clientIdCode, clientIdCode));
  return canAccess("seo", (row?.allowedSections as string[] | null) ?? [], false);
}

const iso = (d: Date | string) => new Date(d).toISOString();

/** The ONLY shape the portal may return. Whitelist, never spread a DB row. */
export function toClientRevision(rev: SeoRevision, projectName: string, comments: SeoRevisionComment[], events: SeoRevisionEvent[]): ClientRevision {
  const clientEvent = [...events].reverse().find((e) => e.step === "client");
  return {
    id: rev.id,
    revisionNumber: rev.revisionNumber,
    status: rev.status,
    projectName,
    submittedAt: iso(rev.submittedAt),
    content: rev.content as Record<string, Record<string, string>>,
    comments: comments.filter((c) => c.audience === "client").map((c) => ({
      id: c.id, asin: c.asin, fieldKey: c.fieldKey, parentCommentId: c.parentCommentId, authorName: c.authorName,
      body: c.body, createdAt: iso(c.createdAt), resolved: !!c.resolvedAt,
    })),
    decision: clientEvent ? { at: iso(clientEvent.createdAt), byName: clientEvent.actorName, action: clientEvent.action } : null,
  };
}
```

Check how `canAccess` treats a department grant before relying on it: read `src/lib/permissions.ts:85-108`. Thread Q found that `canAccess` does **not** cascade department → subsection. If the portal SEO card is gated by a different section id than `"seo"`, use the id that `src/app/portal/seo/page.tsx` / the portal card uses (`grep -rn '"seo' src/app/portal/page.tsx`).

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/lib/seo/revision-portal.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing detail/decision route test**

```ts
// src/app/api/portal/seo/revisions/[revisionId]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ session: null as unknown, decide: vi.fn(), status: "client_review", enabled: true }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => h.session }));
vi.mock("@/lib/seo/revision-db", async (orig) => ({
  ...(await orig<typeof import("@/lib/seo/revision-db")>()),
  getRevisionWithProject: async () => ({ revision: { id: "R1", revisionNumber: 2, status: h.status, submittedAt: new Date(), content: { A1: { Title: "t" } } }, project: { id: "P1", name: "TRS_v01", clientIdCode: "TRS_SC_US" } }),
  listComments: async () => [], listEvents: async () => [], decideRevision: h.decide,
}));
vi.mock("@/lib/seo/revision-portal", async (orig) => ({ ...(await orig<typeof import("@/lib/seo/revision-portal")>()), seoSectionEnabled: async () => h.enabled }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where: async () => [] }) }) } }));

import { GET, POST } from "./route";
const ctx = { params: Promise.resolve({ revisionId: "R1" }) };
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as never, ctx);

beforeEach(() => { h.decide.mockReset(); h.decide.mockResolvedValue({ id: "R1" }); h.status = "client_review"; h.enabled = true; h.session = { user: { email: "maria@client.com", name: "Maria", role: "client", clientIdCode: "TRT_SC_US,TRS_SC_US" } }; });

describe("portal revision", () => {
  it("second client of a multi-account user: GET 200", async () => {
    expect((await GET(new Request("http://x") as never, ctx)).status).toBe(200);
  });
  it("another client's user → 403; SEO section off → 403", async () => {
    h.session = { user: { email: "x@other.com", role: "client", clientIdCode: "REA_SC_US" } };
    expect((await GET(new Request("http://x") as never, ctx)).status).toBe(403);
    h.session = { user: { email: "maria@client.com", role: "client", clientIdCode: "TRS_SC_US" } };
    h.enabled = false;
    expect((await GET(new Request("http://x") as never, ctx)).status).toBe(403);
  });
  it("client approves → step client, actedAs client", async () => {
    expect((await post({ action: "approve", expectedStatus: "client_review" })).status).toBe(200);
    expect(h.decide).toHaveBeenCalledWith(expect.objectContaining({ step: "client", actedAs: "client", action: "approve" }));
  });
  it("only while in client_review; request_changes needs a note", async () => {
    expect((await post({ action: "request_changes", expectedStatus: "client_review" })).status).toBe(400);
    h.status = "am_review";
    expect((await post({ action: "approve", expectedStatus: "client_review" })).status).toBe(409);
  });
  it("a hub admin previewing the portal cannot decide for the client", async () => {
    h.session = { user: { email: "boss@x.com", role: "owner" } };
    expect((await post({ action: "approve", expectedStatus: "client_review" })).status).toBe(403);
  });
});
```

- [ ] **Step 6: Implement the portal routes**

```ts
// src/app/api/portal/seo/revisions/[revisionId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { actionNeedsNote, type RevisionAction } from "@/lib/seo/revision-rules";
import { decideRevision, getRevisionWithProject, listComments, listEvents, RevisionConflictError } from "@/lib/seo/revision-db";
import { portalClientAllowed, seoSectionEnabled, toClientRevision } from "@/lib/seo/revision-portal";

type Ctx = { params: Promise<{ revisionId: string }> };

async function load(revisionId: string, session: { user: { role: string; clientIdCode?: string | null } }) {
  const found = await getRevisionWithProject(revisionId);
  if (!found?.project.clientIdCode) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!portalClientAllowed(session, found.project.clientIdCode) || !(await seoSectionEnabled(found.project.clientIdCode))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { found };
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { revisionId } = await params;
  const r = await load(revisionId, session);
  if (r.error) return r.error;
  const { revision, project } = r.found;
  if (!["client_review", "approved", "changes_requested"].includes(revision.status)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [comments, events] = await Promise.all([listComments(revisionId), listEvents(revisionId)]);
  return NextResponse.json({ revision: toClientRevision(revision, project.name, comments, events) });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "client") return NextResponse.json({ error: "Only the client can approve here" }, { status: 403 });
  const { revisionId } = await params;
  const body = (await req.json().catch(() => null)) as { action?: RevisionAction; expectedStatus?: string; note?: string } | null;
  if (body?.action !== "approve" && body?.action !== "request_changes") return NextResponse.json({ error: "action must be approve or request_changes" }, { status: 400 });
  const note = body.note?.trim() || null;
  if (actionNeedsNote(body.action) && !note) return NextResponse.json({ error: "Tell us what to change" }, { status: 400 });
  const r = await load(revisionId, session);
  if (r.error) return r.error;
  const { revision, project } = r.found;
  if (revision.status !== "client_review" || body.expectedStatus !== "client_review") return NextResponse.json({ error: "Already decided — reload" }, { status: 409 });
  try {
    await decideRevision({
      revisionId, projectId: project.id, expectedStatus: "client_review", action: body.action, step: "client",
      actor: { email: session.user.email, name: session.user.name ?? null }, actedAs: "client", note,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RevisionConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
```

The route never returns the staff `note` of a `request_changes`, and the client's own note is stored as an event note. The spec asks for "≥1 comment **or** a note"; this route requires a note. That's the simpler, stricter reading of the rule. Record it in the Task 14 report as a deliberate choice.

```ts
// src/app/api/portal/seo/revisions/[revisionId]/comments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { FIELD_MAP } from "@/app/api/seo/projects/[id]/migrate-to-products/field-map";
import { addComment, getRevisionWithProject } from "@/lib/seo/revision-db";
import { portalClientAllowed, seoSectionEnabled } from "@/lib/seo/revision-portal";

export async function POST(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "client") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { revisionId } = await params;
  const b = (await req.json().catch(() => null)) as { asin?: string; fieldKey?: string; body?: string; parentCommentId?: string } | null;
  const text = b?.body?.trim();
  if (!b?.asin || !b.fieldKey || !text) return NextResponse.json({ error: "asin, fieldKey and body are required" }, { status: 400 });
  const found = await getRevisionWithProject(revisionId);
  if (!found?.project.clientIdCode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!portalClientAllowed(session, found.project.clientIdCode) || !(await seoSectionEnabled(found.project.clientIdCode))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (found.revision.status !== "client_review") return NextResponse.json({ error: "This revision is no longer open for comments" }, { status: 409 });
  if (!(b.asin in (found.revision.content ?? {})) || !(b.fieldKey in FIELD_MAP)) return NextResponse.json({ error: "Unknown ASIN or field" }, { status: 400 });
  const c = await addComment({ revisionId, asin: b.asin, fieldKey: b.fieldKey, parentCommentId: b.parentCommentId ?? null, audience: "client", authorEmail: session.user.email, authorName: session.user.name ?? null, body: text });
  return NextResponse.json({ comment: { id: c.id, asin: c.asin, fieldKey: c.fieldKey, parentCommentId: c.parentCommentId, authorName: c.authorName, body: c.body, createdAt: new Date(c.createdAt).toISOString(), resolved: false } }, { status: 201 });
}
```

```ts
// src/app/api/portal/seo/revisions/route.ts — revisions awaiting this client user
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoProjects, seoRevisions } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { parseClientIdCodes } from "@/lib/client-codes";
import { hasAdminPowers } from "@/lib/roles";
import { seoSectionEnabled } from "@/lib/seo/revision-portal";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  const codes = role === "client" || role === "prospect"
    ? parseClientIdCodes(session.user.clientIdCode)
    : hasAdminPowers(role) && req.nextUrl.searchParams.get("client") ? [req.nextUrl.searchParams.get("client")!] : [];
  const allowed: string[] = [];
  for (const c of codes) if (await seoSectionEnabled(c)) allowed.push(c);
  if (allowed.length === 0) return NextResponse.json({ items: [] });
  const items = await db
    .select({ revisionId: seoRevisions.id, revisionNumber: seoRevisions.revisionNumber, submittedAt: seoRevisions.submittedAt, projectName: seoProjects.name, clientIdCode: seoProjects.clientIdCode, content: seoRevisions.content })
    .from(seoRevisions)
    .innerJoin(seoProjects, eq(seoProjects.id, seoRevisions.projectId))
    .where(and(eq(seoRevisions.status, "client_review"), inArray(seoProjects.clientIdCode, allowed)))
    .orderBy(desc(seoRevisions.submittedAt));
  return NextResponse.json({
    items: items.map(({ content, submittedAt, ...i }) => ({ ...i, submittedAt: new Date(submittedAt).toISOString(), asinCount: Object.keys(content ?? {}).length })),
  });
}
```

- [ ] **Step 7: Run all Task 9 tests, then typecheck**

Run: `npx vitest run src/lib/seo/revision-portal.test.ts "src/app/api/portal/seo/revisions"` and then `node_modules/.bin/tsc --noEmit 2>&1 | grep -oE "^[^(]+\.tsx?" | sort -u`.
Expected: PASS (3 + 5); baseline tsc.

- [ ] **Step 8: Commit**

```bash
git add -- src/lib/seo/revision-portal.ts src/lib/seo/revision-portal.test.ts src/app/api/portal/seo/revisions/route.ts "src/app/api/portal/seo/revisions/[revisionId]/route.ts" "src/app/api/portal/seo/revisions/[revisionId]/route.test.ts" "src/app/api/portal/seo/revisions/[revisionId]/comments/route.ts"
git commit -m "feat(seo): client portal review API with client-safe payloads

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/seo/revision-portal.ts src/lib/seo/revision-portal.test.ts src/app/api/portal/seo/revisions/route.ts "src/app/api/portal/seo/revisions/[revisionId]/route.ts" "src/app/api/portal/seo/revisions/[revisionId]/route.test.ts" "src/app/api/portal/seo/revisions/[revisionId]/comments/route.ts"
```

---

### Task 10: Shared review UI (PDP preview, comments, decision bar)

**Files:**
- Modify: `src/components/products/product-pdp.tsx` (add a `familyEnabled` prop)
- Create: `src/components/seo/revision/revision-preview.tsx`, `src/components/seo/revision/comment-thread.tsx`, `src/components/seo/revision/decision-bar.tsx`
- Test: `src/components/seo/revision/revision-preview.test.tsx`, `src/components/seo/revision/decision-bar.test.tsx`

**Interfaces:**
- Consumes: `overlayProduct`, `changedKeys`, `FIELD_LABELS`, `PDP_HIDDEN_KEYS`, `currentValue` (Task 4); `ProductPdp`.
- Produces:
  - `ProductPdp` prop `familyEnabled?: boolean` (default `true`; `false` skips `/api/products/[id]/family`)
  - `<RevisionPreview products={Product[]} content={RevisionContent} familyEnabled={boolean} selectedField={{ asin: string; key: string } | null} onSelectField={(asin, key) => void} commentCounts={Record<string, number>} tone="hub" | "portal" />`, where the `commentCounts` key is `${asin}::${key}`
  - `<CommentThread comments={Array<{ id; authorName; body; createdAt; resolved; audience? }>} onAdd={(body, audience?) => Promise<void>} onResolve?={(id, resolved) => Promise<void>} allowAudience={boolean} readOnly={boolean} />`
  - `<DecisionBar actions={RevisionAction[]} actedAs={"assigned" | "override" | "client" | null} waitingFor={string | null} onDecide={(action, note) => Promise<void>} />`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/seo/revision/revision-preview.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/products/product-pdp", () => ({
  ProductPdp: ({ product, familyEnabled }: { product: { itemName: string }; familyEnabled?: boolean }) => (
    <div data-testid="pdp" data-family={String(familyEnabled)}>{product.itemName}</div>
  ),
}));
import { RevisionPreview } from "./revision-preview";

const products = [{ id: "M1", asin: "A1", itemName: "Old title", itemHighlight: null, genericKeywords: "old kw", contentSeo: {} }] as never;
const content = { A1: { Title: "New title", BackendSearchTerms: "new kw" } };

describe("RevisionPreview", () => {
  it("shows the proposed text by default and the current text when toggled", () => {
    render(<RevisionPreview products={products} content={content} familyEnabled={false} selectedField={null} onSelectField={() => {}} commentCounts={{}} tone="hub" />);
    expect(screen.getByTestId("pdp").textContent).toBe("New title");
    expect(screen.getByTestId("pdp").dataset.family).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Current" }));
    expect(screen.getByTestId("pdp").textContent).toBe("Old title");
  });
  it("lists changed fields and the hidden backend terms with a char count", () => {
    render(<RevisionPreview products={products} content={content} familyEnabled selectedField={null} onSelectField={() => {}} commentCounts={{ "A1::Title": 2 }} tone="hub" />);
    expect(screen.getByText("Title")).toBeTruthy();
    expect(screen.getByText("new kw")).toBeTruthy();
    expect(screen.getByText(/6 chars/)).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });
  it("selecting a field reports asin + key", () => {
    const onSelect = vi.fn();
    render(<RevisionPreview products={products} content={content} familyEnabled selectedField={null} onSelectField={onSelect} commentCounts={{}} tone="hub" />);
    fireEvent.click(screen.getByRole("button", { name: /Backend search terms/ }));
    expect(onSelect).toHaveBeenCalledWith("A1", "BackendSearchTerms");
  });
});
```

```tsx
// src/components/seo/revision/decision-bar.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DecisionBar } from "./decision-bar";

describe("DecisionBar", () => {
  it("nobody may act → shows who it's waiting for, no buttons", () => {
    render(<DecisionBar actions={[]} actedAs={null} waitingFor="Pat Smith (PM)" onDecide={vi.fn()} />);
    expect(screen.getByText(/Waiting for Pat Smith \(PM\)/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("override buttons are labelled; request changes needs a note", async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    render(<DecisionBar actions={["approve", "request_changes"]} actedAs="override" waitingFor={null} onDecide={onDecide} />);
    expect(screen.getByRole("button", { name: "Approve (override)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Request changes (override)" }));
    expect(onDecide).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText(/What should change/), { target: { value: "Bullet 3 too long" } });
    fireEvent.click(screen.getByRole("button", { name: "Request changes (override)" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith("request_changes", "Bullet 3 too long"));
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/components/seo/revision`
Expected: FAIL, "Failed to resolve import".

- [ ] **Step 3: Add `familyEnabled` to `ProductPdp`.** In `src/components/products/product-pdp.tsx`, add `familyEnabled?: boolean;` to `type Props` (after `readOnly?: boolean;`), destructure it with a default `familyEnabled = true`, and add `enabled: familyEnabled,` to the `useQuery` options for `["product-family", productId]`. Nothing else in that file changes.

- [ ] **Step 4: Implement `revision-preview.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/lib/db/schema";
import { ProductPdp } from "@/components/products/product-pdp";
import { changedKeys, currentValue, FIELD_LABELS, overlayProduct, PDP_HIDDEN_KEYS, type RevisionContent } from "@/lib/seo/revision-fields";

interface Props {
  products: Product[];
  content: RevisionContent;
  familyEnabled: boolean;
  selectedField: { asin: string; key: string } | null;
  onSelectField: (asin: string, key: string) => void;
  commentCounts: Record<string, number>;
  tone: "hub" | "portal";
}

export function RevisionPreview({ products, content, familyEnabled, selectedField, onSelectField, commentCounts, tone }: Props) {
  const asins = Object.keys(content);
  const [asin, setAsin] = useState(asins[0] ?? "");
  const [mode, setMode] = useState<"proposed" | "current">("proposed");
  const product = products.find((p) => p.asin === asin) ?? null;
  const fields = useMemo(() => content[asin] ?? {}, [content, asin]);
  const shown = useMemo(() => (product && mode === "proposed" ? overlayProduct(product, fields) : product), [product, fields, mode]);
  const changed = useMemo(() => new Set(product ? changedKeys(product, fields) : Object.keys(fields)), [product, fields]);
  const accent = tone === "portal" ? "border-portal-accent text-portal-accent" : "border-amber-500 text-amber-600 dark:text-amber-400";
  const enc = new TextEncoder();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {asins.map((a) => (
          <button key={a} type="button" onClick={() => setAsin(a)}
            className={`rounded-full border px-3 py-1 font-mono text-xs ${a === asin ? accent : "border-border text-muted-foreground"}`}>{a}</button>
        ))}
        <div className="ml-auto inline-flex rounded-full border border-border p-0.5 text-xs">
          {(["proposed", "current"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-full px-3 py-1 ${mode === m ? accent : "text-muted-foreground"}`}>
              {m === "proposed" ? "Proposed" : "Current"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-border bg-card p-4">
          {shown ? <ProductPdp product={shown} productId={shown.id} readOnly familyEnabled={familyEnabled} /> : <p className="text-sm text-muted-foreground">This ASIN is not in the catalog.</p>}
        </div>
        <aside className="space-y-1 rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fields · click to comment</p>
          {Object.keys(fields).map((key) => {
            const count = commentCounts[`${asin}::${key}`] ?? 0;
            const active = selectedField?.asin === asin && selectedField.key === key;
            return (
              <button key={key} type="button" onClick={() => onSelectField(asin, key)}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs ${active ? "bg-muted" : "hover:bg-muted/60"}`}>
                <span className="flex items-center gap-1.5">
                  {changed.has(key) && <span className="size-1.5 rounded-full bg-emerald-500" title="Changed" />}
                  {FIELD_LABELS[key] ?? key}
                </span>
                {count > 0 && <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold">{count}</span>}
              </button>
            );
          })}
        </aside>
      </div>

      {PDP_HIDDEN_KEYS.some((k) => fields[k]) && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {tone === "portal" ? "Hidden search terms and content bullets (not visible to shoppers)" : "Not shown on the PDP"}
          </p>
          {PDP_HIDDEN_KEYS.filter((k) => fields[k]).map((k) => {
            const value = mode === "proposed" ? fields[k] : (product ? currentValue(product, k) : null) ?? "";
            return (
              <div key={k} className="mb-2">
                <p className="text-xs font-semibold">{FIELD_LABELS[k]}</p>
                <p className="text-sm">{value}</p>
                <p className="text-[10px] text-muted-foreground tabular-nums">{value.length} chars · {enc.encode(value).length} bytes</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

The test's "6 chars" assertion targets `new kw` (6 characters). If the label text "Title" appears twice (the field list plus the `ProductPdp` mock), change the test to `getAllByText("Title").length > 0`. Don't weaken it further.

- [ ] **Step 5: Implement `comment-thread.tsx` and `decision-bar.tsx`**

```tsx
// src/components/seo/revision/comment-thread.tsx
"use client";

import { useState } from "react";

export interface ThreadComment { id: string; authorName: string | null; body: string; createdAt: string; resolved: boolean; audience?: string }

export function CommentThread({ comments, onAdd, onResolve, allowAudience, readOnly }: {
  comments: ThreadComment[];
  onAdd: (body: string, audience?: "internal" | "client") => Promise<void>;
  onResolve?: (id: string, resolved: boolean) => Promise<void>;
  allowAudience: boolean;
  readOnly: boolean;
}) {
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<"internal" | "client">("internal");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments on this field yet.</p>}
      {comments.map((c) => (
        <div key={c.id} className={`rounded-lg border border-border p-2 text-xs ${c.resolved ? "opacity-60" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{c.authorName ?? "—"}{c.audience === "client" && allowAudience ? " · visible to client" : ""}</span>
            {onResolve && (
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <input type="checkbox" checked={c.resolved} onChange={(e) => void onResolve(c.id, e.target.checked)} /> Resolved
              </label>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{c.createdAt.slice(0, 10)}</p>
        </div>
      ))}
      {!readOnly && (
        <form className="space-y-1" onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          setBusy(true);
          try { await onAdd(text.trim(), allowAudience ? audience : undefined); setText(""); } finally { setBusy(false); }
        }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Add a comment…" className="w-full rounded-lg border border-border bg-background p-2 text-xs" />
          <div className="flex items-center justify-between">
            {allowAudience ? (
              <select value={audience} onChange={(e) => setAudience(e.target.value as "internal" | "client")} className="rounded border border-border bg-background px-1 text-[10px]">
                <option value="internal">Internal only</option>
                <option value="client">Visible to client</option>
              </select>
            ) : <span />}
            <button type="submit" disabled={busy || !text.trim()} className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold disabled:opacity-50">Comment</button>
          </div>
        </form>
      )}
    </div>
  );
}
```

```tsx
// src/components/seo/revision/decision-bar.tsx
"use client";

import { useState } from "react";
import type { RevisionAction } from "@/lib/seo/revision-rules";
import { actionNeedsNote } from "@/lib/seo/revision-rules";

const LABEL: Record<RevisionAction, string> = {
  approve: "Approve", request_changes: "Request changes", send_to_client: "Send to client", approve_final: "Approve as final",
};

export function DecisionBar({ actions, actedAs, waitingFor, onDecide }: {
  actions: RevisionAction[];
  actedAs: "assigned" | "override" | "client" | null;
  waitingFor: string | null;
  onDecide: (action: RevisionAction, note: string | null) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (actions.length === 0) return <p className="text-sm text-muted-foreground">{waitingFor ? `Waiting for ${waitingFor}` : "No action needed."}</p>;
  const suffix = actedAs === "override" ? " (override)" : "";
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="What should change, or why is this final? (required for Request changes and Approve as final)"
        className="w-full rounded-lg border border-border bg-background p-2 text-xs" />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button key={a} type="button" disabled={busy}
            onClick={async () => {
              if (actionNeedsNote(a) && !note.trim()) { setError("Add a note first."); return; }
              setError(null); setBusy(true);
              try { await onDecide(a, note.trim() || null); } finally { setBusy(false); }
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${a === "request_changes" ? "border border-border" : "bg-emerald-600 text-white hover:bg-emerald-500"}`}>
            {LABEL[a]}{suffix}
          </button>
        ))}
      </div>
    </div>
  );
}
```

On the portal, `DecisionBar` is rendered with `actedAs="client"`. The emerald approve button is not hub orange, so the no-hub-orange test stays green.

- [ ] **Step 6: Run the tests, then typecheck**

Run: `npx vitest run src/components/seo/revision` and then `node_modules/.bin/tsc --noEmit 2>&1 | grep -oE "^[^(]+\.tsx?" | sort -u`.
Expected: PASS (3 + 2); baseline tsc.

- [ ] **Step 7: Commit**

```bash
git add -- src/components/products/product-pdp.tsx src/components/seo/revision/revision-preview.tsx src/components/seo/revision/revision-preview.test.tsx src/components/seo/revision/comment-thread.tsx src/components/seo/revision/decision-bar.tsx src/components/seo/revision/decision-bar.test.tsx
git commit -m "feat(seo): PDP-based revision preview, comment thread, decision bar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/products/product-pdp.tsx src/components/seo/revision/revision-preview.tsx src/components/seo/revision/revision-preview.test.tsx src/components/seo/revision/comment-thread.tsx src/components/seo/revision/decision-bar.tsx src/components/seo/revision/decision-bar.test.tsx
```

---

### Task 11: Staff review page + S6 integration

**Precondition:** run `git log origin/main --oneline -- "src/app/seo/[id]/seo/page.tsx" src/components/seo/phases`. If Thread W's one-page SEO Manager has landed, STOP and ask Manu (see Global Constraints).

**Files:**
- Create: `src/app/seo/[id]/review/[revisionId]/page.tsx`, `src/components/seo/revision/revision-strip.tsx`
- Modify: `src/app/seo/[id]/seo/page.tsx`
- Test: `src/components/seo/revision/revision-strip.test.tsx`

**Interfaces:**
- Consumes: Task 6/7/8 endpoints; Task 10 components.
- Produces: `<RevisionStrip projectId={string} refreshKey={number} onOpenChange={(open: boolean) => void} onCurrentChange={(current: { id: string; revisionNumber: number } | null) => void} />`

- [ ] **Step 1: Write the failing strip test**

```tsx
// src/components/seo/revision/revision-strip.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RevisionStrip } from "./revision-strip";

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
const reply = (body: unknown) => fetchMock.mockResolvedValue({ ok: true, json: async () => body });

describe("RevisionStrip", () => {
  it("open revision → stage + waiting-for text, link to review, onOpenChange(true)", async () => {
    reply({ revisions: [{ id: "R2", revisionNumber: 2, status: "pm_review", submittedAt: "2026-10-02T00:00:00Z", isCurrent: false }], open: { id: "R2", revisionNumber: 2, status: "pm_review" }, current: null, approvers: { pm: { name: "Pat Smith", email: "pat@x.com" }, am: null }, canSubmit: false });
    const onOpen = vi.fn();
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={onOpen} onCurrentChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/r2 · PM review · waiting for Pat Smith/)).toBeTruthy());
    expect(screen.getByRole("link", { name: /Open review/ }).getAttribute("href")).toBe("/seo/P1/review/R2");
    expect(onOpen).toHaveBeenLastCalledWith(true);
  });
  it("unmatched PM → says so", async () => {
    reply({ revisions: [{ id: "R2", revisionNumber: 2, status: "pm_review", isCurrent: false }], open: { id: "R2", revisionNumber: 2, status: "pm_review" }, current: null, approvers: { pm: { name: "Pat Smyth", email: null }, am: null }, canSubmit: false });
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={() => {}} onCurrentChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/No user matched "Pat Smyth"/)).toBeTruthy());
  });
  it("changes requested → lists that revision's comments grouped by ASIN with resolve ticks", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revisions: [{ id: "R2", revisionNumber: 2, status: "changes_requested", isCurrent: false }], open: null, current: null, approvers: { pm: null, am: null }, canSubmit: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ comments: [{ id: "C1", asin: "A1", fieldKey: "Title", authorName: "Ann", body: "Too long", resolvedAt: null }] }) });
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={() => {}} onCurrentChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Comments to address \(1 open\)/)).toBeTruthy());
    expect(screen.getByRole("checkbox")).toBeTruthy();
  });
  it("no revisions → nothing open, onOpenChange(false)", async () => {
    reply({ revisions: [], open: null, current: null, approvers: { pm: null, am: null }, canSubmit: true });
    const onOpen = vi.fn();
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={onOpen} onCurrentChange={() => {}} />);
    await waitFor(() => expect(onOpen).toHaveBeenLastCalledWith(false));
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/seo/revision/revision-strip.test.tsx`
Expected: FAIL, "Failed to resolve import ./revision-strip".

- [ ] **Step 3: Implement `revision-strip.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { stageLabel } from "@/lib/seo/revision-rules";
import { FIELD_LABELS } from "@/lib/seo/revision-fields";

interface Rev { id: string; revisionNumber: number; status: string; submittedAt?: string; isCurrent: boolean }
interface State { revisions: Rev[]; open: Rev | null; current: Rev | null; approvers: { pm: { name: string; email: string | null } | null; am: { name: string; email: string | null } | null } }

export function RevisionStrip({ projectId, refreshKey, onOpenChange, onCurrentChange }: {
  projectId: string; refreshKey: number;
  onOpenChange: (open: boolean) => void;
  onCurrentChange: (current: { id: string; revisionNumber: number } | null) => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [openComments, setOpenComments] = useState<Array<{ id: string; asin: string; fieldKey: string; authorName: string | null; body: string; resolvedAt: string | null }>>([]);
  const [commentsKey, setCommentsKey] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch(`/api/seo/projects/${projectId}/revisions`).then((r) => r.json()).then((s: State) => {
      if (!alive) return;
      setState(s);
      onOpenChange(!!s.open);
      onCurrentChange(s.current ? { id: s.current.id, revisionNumber: s.current.revisionNumber } : null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [projectId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // After "changes requested" the specialist works through that revision's comments here in S6 (spec §5).
  const latestId = state?.revisions[0]?.status === "changes_requested" ? state.revisions[0].id : null;
  useEffect(() => {
    if (!latestId) { setOpenComments([]); return; }
    let alive = true;
    fetch(`/api/seo/revisions/${latestId}`).then((r) => r.json()).then((d) => { if (alive) setOpenComments(d.comments ?? []); }).catch(() => {});
    return () => { alive = false; };
  }, [latestId, commentsKey]);

  if (!state || state.revisions.length === 0) return null;
  const latest = state.revisions[0];
  const who = latest.status === "pm_review" ? state.approvers.pm : latest.status === "am_review" ? state.approvers.am : null;
  const waiting = latest.status === "client_review" ? "the client"
    : who?.email ? who.name
    : who ? null
    : latest.status === "pm_review" || latest.status === "am_review" ? null : undefined;

  return (
    <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">r{latest.revisionNumber} · {stageLabel(latest.status)}{waiting ? ` · waiting for ${waiting}` : ""}</span>
        {who && !who.email && <span className="text-red-500">No user matched &quot;{who.name}&quot; in the client team — an Owner/Super Admin must decide</span>}
        {(latest.status === "pm_review" || latest.status === "am_review") && !who && <span className="text-red-500">No {latest.status === "pm_review" ? "PM" : "AM"} set for this client — an Owner/Super Admin must decide</span>}
        {state.current && <span className="text-emerald-600">Approved text: r{state.current.revisionNumber}</span>}
        <Link href={`/seo/${projectId}/review/${latest.id}`} className="ml-auto font-bold underline">Open review</Link>
        <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-muted-foreground underline">{showHistory ? "Hide history" : "History"}</button>
      </div>
      {latestId && openComments.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="font-bold">Comments to address ({openComments.filter((c) => !c.resolvedAt).length} open) — unresolved ones carry over to the next round</p>
          {Object.entries(openComments.reduce<Record<string, typeof openComments>>((g, c) => { (g[c.asin] ??= []).push(c); return g; }, {})).map(([asin, list]) => (
            <div key={asin}>
              <p className="font-mono text-[10px] text-muted-foreground">{asin}</p>
              {list.map((c) => (
                <label key={c.id} className="flex items-start gap-2 py-0.5">
                  <input type="checkbox" checked={!!c.resolvedAt} onChange={async (e) => {
                    await fetch(`/api/seo/revisions/${latestId}/comments`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId: c.id, resolved: e.target.checked }) });
                    setCommentsKey((n) => n + 1);
                  }} />
                  <span className={c.resolvedAt ? "line-through opacity-60" : ""}><b>{FIELD_LABELS[c.fieldKey] ?? c.fieldKey}</b> · {c.authorName ?? "—"}: {c.body}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
      {showHistory && (
        <ul className="mt-2 space-y-1">
          {state.revisions.map((r) => (
            <li key={r.id}><Link href={`/seo/${projectId}/review/${r.id}`} className="hover:underline">r{r.revisionNumber} · {stageLabel(r.status)}{r.isCurrent ? " · current approved" : ""}</Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/components/seo/revision/revision-strip.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement the review page** `src/app/seo/[id]/review/[revisionId]/page.tsx`

```tsx
"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { Product } from "@/lib/db/schema";
import { stageLabel, type RevisionAction } from "@/lib/seo/revision-rules";
import { FIELD_LABELS } from "@/lib/seo/revision-fields";
import { RevisionPreview } from "@/components/seo/revision/revision-preview";
import { CommentThread } from "@/components/seo/revision/comment-thread";
import { DecisionBar } from "@/components/seo/revision/decision-bar";

interface Detail {
  revision: { id: string; revisionNumber: number; status: string; content: Record<string, Record<string, string>>; submittedByName: string | null };
  project: { id: string; name: string };
  products: Product[];
  comments: Array<{ id: string; asin: string; fieldKey: string; authorName: string | null; body: string; createdAt: string; resolvedAt: string | null; audience: string }>;
  previousOpenComments: Array<{ id: string; asin: string; fieldKey: string; authorName: string | null; body: string }>;
  events: Array<{ id: string; step: string; action: string; actorName: string | null; actedAs: string; note: string | null; createdAt: string }>;
  approvers: { pm: { name: string; email: string | null } | null; am: { name: string; email: string | null } | null };
  me: { step: string | null; actedAs: "assigned" | "override" | null; actions: RevisionAction[] };
}

export default function SeoRevisionReviewPage({ params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const { id, revisionId } = use(params);
  const [data, setData] = useState<Detail | null>(null);
  const [field, setField] = useState<{ asin: string; key: string } | null>(null);
  const load = useCallback(async () => {
    const res = await fetch(`/api/seo/revisions/${revisionId}`);
    if (res.ok) setData(await res.json());
    else toast.error((await res.json().catch(() => ({}))).error ?? "Could not load the revision");
  }, [revisionId]);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of data?.comments ?? []) c[`${m.asin}::${m.fieldKey}`] = (c[`${m.asin}::${m.fieldKey}`] ?? 0) + 1;
    return c;
  }, [data]);

  if (!data) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  const { revision, project, me, approvers } = data;
  const who = revision.status === "pm_review" ? approvers.pm : revision.status === "am_review" ? approvers.am : null;
  const waitingFor = revision.status === "client_review" ? "the client" : who ? `${who.name}${who.email ? "" : " (no matching user — override needed)"}` : null;
  const thread = field ? data.comments.filter((c) => c.asin === field.asin && c.fieldKey === field.key) : [];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <Link href={`/seo/${id}/seo`} className="text-xs text-muted-foreground hover:underline">← Back to S6</Link>
        <h1 className="text-xl font-bold">{project.name} · r{revision.revisionNumber}</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">{stageLabel(revision.status)}</span>
        <span className="text-xs text-muted-foreground">submitted by {revision.submittedByName ?? "—"}</span>
      </div>

      <RevisionPreview products={data.products} content={revision.content} familyEnabled selectedField={field}
        onSelectField={(asin, key) => setField({ asin, key })} commentCounts={counts} tone="hub" />

      {field && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-bold">{field.asin} · {FIELD_LABELS[field.key] ?? field.key}</p>
          <CommentThread
            comments={thread.map((c) => ({ id: c.id, authorName: c.authorName, body: c.body, createdAt: c.createdAt, resolved: !!c.resolvedAt, audience: c.audience }))}
            allowAudience readOnly={false}
            onAdd={async (body, audience) => {
              const res = await fetch(`/api/seo/revisions/${revisionId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asin: field.asin, fieldKey: field.key, body, audience }) });
              if (!res.ok) toast.error((await res.json().catch(() => ({}))).error ?? "Comment failed");
              await load();
            }}
            onResolve={async (commentId, resolved) => {
              await fetch(`/api/seo/revisions/${revisionId}/comments`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId, resolved }) });
              await load();
            }}
          />
        </div>
      )}

      {data.previousOpenComments.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-xs">
          <p className="mb-2 font-bold">Still open from r{revision.revisionNumber - 1}</p>
          <ul className="space-y-1">
            {data.previousOpenComments.map((c) => (
              <li key={c.id}>{c.asin} · {FIELD_LABELS[c.fieldKey] ?? c.fieldKey} · {c.authorName ?? "—"}: {c.body}</li>
            ))}
          </ul>
        </div>
      )}

      <DecisionBar actions={me.actions} actedAs={me.actedAs} waitingFor={waitingFor}
        onDecide={async (action, note) => {
          const res = await fetch(`/api/seo/revisions/${revisionId}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, expectedStatus: revision.status, note }) });
          if (!res.ok) toast.error((await res.json().catch(() => ({}))).error ?? "Decision failed");
          await load();
        }} />

      <div className="rounded-xl border border-border bg-card p-4 text-xs">
        <p className="mb-2 font-bold">History</p>
        <ul className="space-y-1">
          {data.events.map((e) => (
            <li key={e.id}>{e.createdAt.slice(0, 16).replace("T", " ")} · {e.step.toUpperCase()} · {e.action.replace("_", " ")} · {e.actorName ?? "—"}{e.actedAs === "override" ? " (override)" : ""}{e.note ? ` — ${e.note}` : ""}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire S6** (`src/app/seo/[id]/seo/page.tsx`)

1. Import `RevisionStrip` from `@/components/seo/revision/revision-strip`.
2. Add state next to `const [isApproved, setIsApproved] = useState(false);` (line ~246):
```tsx
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [approvedRevision, setApprovedRevision] = useState<{ id: string; revisionNumber: number } | null>(null);
  const [revisionRefresh, setRevisionRefresh] = useState(0);
```
3. Render the strip as the first child of the page's main content container (the element that wraps the step UI, directly above the step indicator):
```tsx
      <RevisionStrip projectId={projectId} refreshKey={revisionRefresh}
        onOpenChange={(open) => { setRevisionOpen(open); if (open) { setIsApproved(true); setStep("final"); } }}
        onCurrentChange={setApprovedRevision} />
```
4. Replace `saveFinal` (line ~943) with save-then-submit:
```tsx
  const saveFinal = useCallback(async () => {
    try {
      const saved = await fetch(`/api/seo/projects/${projectId}/save`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "s7_seo", data: { rows, config: { size_placement: sizePlacement, in_progress: false } } }) });
      if (!saved.ok) throw new Error("Save failed");
      setIsApproved(true);
      const sub = await fetch(`/api/seo/projects/${projectId}/revisions`, { method: "POST" });
      if (!sub.ok) throw new Error((await sub.json().catch(() => ({}))).error ?? "Submit for review failed");
      setRevisionRefresh((n) => n + 1);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  }, [rows, projectId, sizePlacement]);
```
5. Relabel the button at line ~2349: `Save & Lock S6` → `Save & Submit for review`.
6. Hide "Unlock for Editing" (line ~2415) while a revision is open: wrap it in `{!revisionOpen && ( … )}`.
7. Push gating in the "Push Content to Products" card (line ~2423). Directly under the title row add:
```tsx
                {!approvedRevision && (
                  <p className="text-[10px] text-muted-foreground">Needs an approved revision — submit for review first.</p>
                )}
                {approvedRevision && <p className="text-[10px] text-emerald-600">Pushes approved text r{approvedRevision.revisionNumber}.</p>}
```
   and add `|| !approvedRevision` to that button's `disabled`. Then replace the body of `executeMigration` (line ~844) with a helper that handles drift and the override:
```tsx
  const postMigration = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/seo/projects/${projectId}/migrate-to-products`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && Array.isArray(body.drift)) {
      const list = body.drift.map((d: { asin: string; key: string; changedBy: string; changedAt: string }) => `${d.asin} · ${FIELD_LABELS[d.key] ?? d.key} (${d.changedBy}, ${d.changedAt.slice(0, 10)})`).join("\n");
      if (window.confirm(`These fields were edited in the catalog after approval:\n${list}\n\nOverwrite them?`)) return postMigration({ ...payload, confirmDrift: true });
      return null;
    }
    if (!res.ok) throw new Error(body.error ?? "Push failed");
    return body;
  };
  const executeMigration = async () => {
    setMigrationRunning(true);
    try { const r = await postMigration({}); if (r) setMigrationResult(r); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setMigrationRunning(false); }
  };
  const pushWithoutReview = async () => {
    const reason = window.prompt("Push without review — why? (recorded)")?.trim();
    if (!reason) return;
    setMigrationRunning(true);
    try { const r = await postMigration({ override: { reason } }); if (r) setMigrationResult(r); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setMigrationRunning(false); }
  };
```
   Keep the existing state names the file already uses (`setMigrationRunning`, `setMigrationResult`); check them with `grep -n "setMigration" "src/app/seo/[id]/seo/page.tsx"`, and if they differ, use the file's names. Import `FIELD_LABELS` from `@/lib/seo/revision-fields` and `hasSuperPowers` from `@/lib/roles`; read the role with `const { data: session } = useSession();` (add `import { useSession } from "next-auth/react";` if the file lacks it). Under the "Needs an approved revision" line add:
```tsx
                {!approvedRevision && hasSuperPowers(session?.user?.role) && (
                  <button type="button" onClick={pushWithoutReview} className="text-[10px] font-bold text-red-500 underline">Push without review (Owner override)</button>
                )}
```

- [ ] **Step 7: Run the tests, then typecheck**

Run: `npx vitest run src/components/seo/revision "src/app/seo"` and `node_modules/.bin/tsc --noEmit 2>&1 | grep -oE "^[^(]+\.tsx?" | sort -u`.
Expected: PASS; baseline tsc.

- [ ] **Step 8: Commit**

```bash
git add -- "src/app/seo/[id]/review/[revisionId]/page.tsx" src/components/seo/revision/revision-strip.tsx src/components/seo/revision/revision-strip.test.tsx "src/app/seo/[id]/seo/page.tsx"
git commit -m "feat(seo): staff review page and S6 submit/lock/push integration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "src/app/seo/[id]/review/[revisionId]/page.tsx" src/components/seo/revision/revision-strip.tsx src/components/seo/revision/revision-strip.test.tsx "src/app/seo/[id]/seo/page.tsx"
```

---

### Task 12: Finding work (stage badge, "Needs my review") + product SEO line

**Files:**
- Modify: `src/app/api/seo/projects/route.ts` (list GET adds `review_stage`), `src/app/seo/manager/page.tsx`, `src/app/seo/clients/[clientId]/seo-client-view.tsx`, `src/components/products/product-detail-form.tsx`
- Create: `src/components/products/seo-revision-line.tsx`
- Test: `src/components/products/seo-revision-line.test.tsx`

**Interfaces:**
- Consumes: `GET /api/seo/revisions?awaiting=me` (Task 7), `GET /api/products/[id]/seo-revision` (Task 8), `stageLabel` (Task 2).
- Produces: `review_stage: string | null` on every project in `GET /api/seo/projects` (the open revision's status, else null); `<SeoRevisionLine productId={string} />`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/products/seo-revision-line.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SeoRevisionLine } from "./seo-revision-line";

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });

describe("SeoRevisionLine", () => {
  it("renders the pushed revision with approval source", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ push: { projectName: "TRS_v01", projectId: "P1", revisionId: "R3", revisionNumber: 3, approvedAt: "2026-10-04T10:00:00Z", finalVia: "client", pushedAt: "2026-10-05T09:00:00Z", pushedBy: "abid@x.com", overrideReason: null } }) });
    render(<SeoRevisionLine productId="M1" />);
    await waitFor(() => expect(screen.getByText(/SEO: TRS_v01 r3 · approved 2026-10-04 \(client\) · pushed 2026-10-05 by abid@x.com/)).toBeTruthy());
    expect(screen.getByRole("link").getAttribute("href")).toBe("/seo/P1/review/R3");
  });
  it("override push says so; no push renders nothing", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ push: { projectName: "TRS_v01", projectId: "P1", revisionId: null, revisionNumber: null, approvedAt: null, finalVia: null, pushedAt: "2026-10-05T09:00:00Z", pushedBy: "boss@x.com", overrideReason: "urgent" } }) });
    const { container, rerender } = render(<SeoRevisionLine productId="M1" />);
    await waitFor(() => expect(screen.getByText(/pushed without review/)).toBeTruthy());
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ push: null }) });
    rerender(<SeoRevisionLine productId="M2" />);
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/products/seo-revision-line.test.tsx`
Expected: FAIL, "Failed to resolve import".

- [ ] **Step 3: Implement `seo-revision-line.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Push { projectName: string; projectId: string; revisionId: string | null; revisionNumber: number | null; approvedAt: string | null; finalVia: string | null; pushedAt: string; pushedBy: string; overrideReason: string | null }

export function SeoRevisionLine({ productId }: { productId: string }) {
  const [push, setPush] = useState<Push | null>(null);
  useEffect(() => {
    let alive = true;
    setPush(null);
    fetch(`/api/products/${productId}/seo-revision`).then((r) => (r.ok ? r.json() : { push: null })).then((b) => { if (alive) setPush(b.push); }).catch(() => {});
    return () => { alive = false; };
  }, [productId]);
  if (!push) return null;
  const pushed = `pushed ${push.pushedAt.slice(0, 10)} by ${push.pushedBy}`;
  const text = push.revisionId
    ? `SEO: ${push.projectName} r${push.revisionNumber} · approved ${push.approvedAt?.slice(0, 10) ?? "—"} (${push.finalVia === "client" ? "client" : "AM final"}) · ${pushed}`
    : `SEO: ${push.projectName} · pushed without review (${push.overrideReason}) · ${pushed}`;
  return push.revisionId
    ? <Link href={`/seo/${push.projectId}/review/${push.revisionId}`} className="text-xs text-muted-foreground hover:underline">{text}</Link>
    : <p className="text-xs text-muted-foreground">{text}</p>;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/components/products/seo-revision-line.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Place the line.** In `src/components/products/product-detail-form.tsx`, import `SeoRevisionLine` and render `<SeoRevisionLine productId={product.id} />` directly inside the `<SeoSection …>` wrapper's `EditListingSection`, above `<SeoSection`. Find it with `grep -n "<SeoSection" src/components/products/product-detail-form.tsx`.

- [ ] **Step 6: Add `review_stage` to the projects list.** In `src/app/api/seo/projects/route.ts` GET, after the projects are loaded, run one extra query and merge it:
```ts
  const openRows = projectIds.length
    ? await db.select({ projectId: seoRevisions.projectId, status: seoRevisions.status }).from(seoRevisions)
        .where(and(inArray(seoRevisions.projectId, projectIds), inArray(seoRevisions.status, ["pm_review", "am_review", "client_review"])))
    : [];
  const stageByProject = new Map(openRows.map((r) => [r.projectId, r.status]));
```
and add `review_stage: stageByProject.get(p.id) ?? null` to each returned project object. Use the variable that already holds the project ids in that handler; if there isn't one, build `const projectIds = rows.map((p) => p.id)`.

- [ ] **Step 7: Show the badge and the filter.**
   - In both `src/app/seo/manager/page.tsx` and `src/app/seo/clients/[clientId]/seo-client-view.tsx`, next to each `<ProjectStatusPicker …/>`, add: `{p.review_stage && <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-bold text-sky-600 dark:text-sky-400">{stageLabel(p.review_stage)}</span>}` (import `stageLabel`; add `review_stage?: string | null` to the local project type).
   - In `manager/page.tsx`, add:
```tsx
  const [awaiting, setAwaiting] = useState<Array<{ projectId: string; revisionId: string; unassigned: boolean }>>([]);
  const [onlyMine, setOnlyMine] = useState(false);
  useEffect(() => {
    fetch("/api/seo/revisions?awaiting=me").then((r) => (r.ok ? r.json() : { items: [] })).then((b) => setAwaiting(b.items ?? [])).catch(() => {});
  }, []);
  const awaitingIds = useMemo(() => new Set(awaiting.map((a) => a.projectId)), [awaiting]);
```
     In the filter row (next to the existing client filter / "Select" controls), render:
```tsx
        <button type="button" onClick={() => setOnlyMine((v) => !v)}
          className={`rounded-full border px-3 py-1 text-xs font-bold ${onlyMine ? "border-amber-500 text-amber-600" : "border-border text-muted-foreground"}`}>
          Needs my review ({awaiting.length})
        </button>
```
     and apply `onlyMine ? projects.filter((p) => awaitingIds.has(p.id)) : projects` wherever the page derives the list it groups by client (find it with `grep -n "groupBy\|reduce\|clientGroups" src/app/seo/manager/page.tsx`). On each card, when `awaiting.find((a) => a.projectId === p.id)?.unassigned`, render `<span className="text-[8px] font-bold text-red-500">unassigned</span>` next to the stage badge.

- [ ] **Step 8: Run the tests, then typecheck**

Run: `npx vitest run src/components/products src/app/seo "src/app/api/seo/projects"` and `node_modules/.bin/tsc --noEmit 2>&1 | grep -oE "^[^(]+\.tsx?" | sort -u`.
Expected: PASS; baseline tsc.

- [ ] **Step 9: Commit**

```bash
git add -- src/components/products/seo-revision-line.tsx src/components/products/seo-revision-line.test.tsx src/components/products/product-detail-form.tsx src/app/api/seo/projects/route.ts src/app/seo/manager/page.tsx "src/app/seo/clients/[clientId]/seo-client-view.tsx"
git commit -m "feat(seo): review stage badge, needs-my-review filter, product SEO line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/products/seo-revision-line.tsx src/components/products/seo-revision-line.test.tsx src/components/products/product-detail-form.tsx src/app/api/seo/projects/route.ts src/app/seo/manager/page.tsx "src/app/seo/clients/[clientId]/seo-client-view.tsx"
```

---

### Task 13: Client portal pages

**Files:**
- Modify: `src/app/portal/seo/page.tsx` (add the "Waiting for your review" section at the top)
- Create: `src/app/portal/seo/review/[revisionId]/page.tsx`
- Test: `src/app/portal/seo/review/[revisionId]/page.test.tsx`

**Interfaces:**
- Consumes: Task 9 endpoints; Task 10 components (`tone="portal"`, `familyEnabled={false}`).
- Produces: the portal pages only.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/portal/seo/review/[revisionId]/page.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/components/seo/revision/revision-preview", () => ({
  RevisionPreview: (p: { familyEnabled: boolean; tone: string }) => <div data-testid="preview" data-family={String(p.familyEnabled)} data-tone={p.tone} />,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import Page from "./page";

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
const detail = (status: string, decision: unknown = null) => ({ ok: true, json: async () => ({ revision: { id: "R2", revisionNumber: 2, status, projectName: "TRS_v01", submittedAt: "2026-10-02T00:00:00Z", content: { A1: { Title: "t" } }, comments: [], decision } }) });

describe("portal review page", () => {
  it("uses the portal tone without variation loading, and approves the whole revision", async () => {
    fetchMock.mockResolvedValueOnce(detail("client_review")).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }).mockResolvedValueOnce(detail("approved", { at: "2026-10-04T00:00:00Z", byName: "Maria", action: "approve" }));
    render(<Page params={Promise.resolve({ revisionId: "R2" })} />);
    await waitFor(() => expect(screen.getByTestId("preview").dataset.family).toBe("false"));
    expect(screen.getByTestId("preview").dataset.tone).toBe("portal");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/portal/seo/revisions/R2", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(screen.getByText(/Approved by Maria/)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run "src/app/portal/seo/review"`
Expected: FAIL, "Failed to resolve import ./page".

- [ ] **Step 3: Implement the portal review page**

```tsx
// src/app/portal/seo/review/[revisionId]/page.tsx
"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { Product } from "@/lib/db/schema";
import { FIELD_LABELS } from "@/lib/seo/revision-fields";
import { RevisionPreview } from "@/components/seo/revision/revision-preview";
import { CommentThread } from "@/components/seo/revision/comment-thread";
import { DecisionBar } from "@/components/seo/revision/decision-bar";

interface ClientRevision {
  id: string; revisionNumber: number; status: string; projectName: string; submittedAt: string;
  content: Record<string, Record<string, string>>;
  comments: Array<{ id: string; asin: string; fieldKey: string; authorName: string | null; body: string; createdAt: string; resolved: boolean }>;
  decision: { at: string; byName: string | null; action: string } | null;
}

export default function PortalSeoReviewPage({ params }: { params: Promise<{ revisionId: string }> }) {
  const { revisionId } = use(params);
  const [rev, setRev] = useState<ClientRevision | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [field, setField] = useState<{ asin: string; key: string } | null>(null);
  const load = useCallback(async () => {
    const res = await fetch(`/api/portal/seo/revisions/${revisionId}`);
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? "Could not load"); return; }
    const body = await res.json();
    setRev(body.revision);
    setProducts(body.products ?? []);
  }, [revisionId]);
  useEffect(() => { void load(); }, [load]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of rev?.comments ?? []) c[`${m.asin}::${m.fieldKey}`] = (c[`${m.asin}::${m.fieldKey}`] ?? 0) + 1;
    return c;
  }, [rev]);

  if (!rev) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  const open = rev.status === "client_review";
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Link href="/portal/seo" className="text-xs text-muted-foreground hover:underline">← Back</Link>
      <h1 className="text-xl font-bold">Review <span className="font-medium text-portal-accent">{rev.projectName}</span> · r{rev.revisionNumber}</h1>
      <RevisionPreview products={products} content={rev.content} familyEnabled={false} selectedField={field}
        onSelectField={(asin, key) => setField({ asin, key })} commentCounts={counts} tone="portal" />
      {field && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-bold">{field.asin} · {FIELD_LABELS[field.key] ?? field.key}</p>
          <CommentThread comments={rev.comments.filter((c) => c.asin === field.asin && c.fieldKey === field.key)} allowAudience={false} readOnly={!open}
            onAdd={async (body) => {
              const res = await fetch(`/api/portal/seo/revisions/${revisionId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asin: field.asin, fieldKey: field.key, body }) });
              if (!res.ok) toast.error((await res.json().catch(() => ({}))).error ?? "Comment failed");
              await load();
            }} />
        </div>
      )}
      {open ? (
        <DecisionBar actions={["approve", "request_changes"]} actedAs="client" waitingFor={null}
          onDecide={async (action, note) => {
            const res = await fetch(`/api/portal/seo/revisions/${revisionId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, expectedStatus: "client_review", note }) });
            if (!res.ok) toast.error((await res.json().catch(() => ({}))).error ?? "Something went wrong");
            await load();
          }} />
      ) : rev.decision ? (
        <p className="text-sm">{rev.decision.action === "approve" ? "Approved" : "Changes requested"} by {rev.decision.byName ?? "—"} · {rev.decision.at.slice(0, 10)}</p>
      ) : null}
    </div>
  );
}
```

**Products for the preview:** the portal detail route (Task 9) must also return `products`, meaning the `master` rows for the revision's ASINs within the revision's client. Add to its GET, before the return:
```ts
  const asins = Object.keys(revision.content ?? {});
  const products = asins.length ? await db.select().from(master).where(and(inArray(master.asin, asins), eq(master.clientIdCode, project.clientIdCode!))) : [];
```
and return `{ revision: toClientRevision(...), products }` (imports `db`, `master`, `and`, `eq`, `inArray`). Catalog rows for the client's own products are already visible to that client in the portal's products pages, so this exposes nothing new. **Re-run the Task 9 route test after this change.** Its `@/lib/db` mock already returns `[]`.

- [ ] **Step 4: Add the list section to `src/app/portal/seo/page.tsx`.** At the top of the page body, fetch `/api/portal/seo/revisions` once. If `items.length > 0`, render:
```tsx
      <section className="mb-6 rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-xs font-bold text-portal-accent">Waiting for your review ({items.length})</p>
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.revisionId}>
              <Link href={`/portal/seo/review/${i.revisionId}`} className="text-sm hover:underline">
                {i.projectName} · r{i.revisionNumber} · {i.asinCount} ASINs · sent {i.submittedAt.slice(0, 10)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
```
For multi-account users, group by client:
```tsx
  const byClient = items.reduce<Record<string, typeof items>>((g, i) => { (g[i.clientIdCode ?? ""] ??= []).push(i); return g; }, {});
```
and render the `<section>` once per `Object.entries(byClient)`, titled with the client's display name (the page's existing client-name lookup; `grep -n "clientName" src/app/portal/seo/page.tsx`). If the page renders per-client blocks through `portal-stacked-clients.tsx`, put each client's section inside its block and filter `items` by that block's `clientIdCode`.

- [ ] **Step 5: Run the tests (including the portal colour guard), then typecheck**

Run: `npx vitest run "src/app/portal/seo" "src/app/api/portal/seo" src/components/reports/v2/no-hub-orange.test.ts` and `node_modules/.bin/tsc --noEmit 2>&1 | grep -oE "^[^(]+\.tsx?" | sort -u`.
Expected: the new test PASSES; no-hub-orange's result is identical to before (one pre-existing failure on `reports-controls-bar.tsx` is known on main; nothing new); baseline tsc.

- [ ] **Step 6: Commit**

```bash
git add -- "src/app/portal/seo/page.tsx" "src/app/portal/seo/review/[revisionId]/page.tsx" "src/app/portal/seo/review/[revisionId]/page.test.tsx" "src/app/api/portal/seo/revisions/[revisionId]/route.ts"
git commit -m "feat(seo): client portal review list and PDP review page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "src/app/portal/seo/page.tsx" "src/app/portal/seo/review/[revisionId]/page.tsx" "src/app/portal/seo/review/[revisionId]/page.test.tsx" "src/app/api/portal/seo/revisions/[revisionId]/route.ts"
```

---

### Task 14: Gates, migration apply (OK-gated), browser pass

**Files:** none new in the repo. Headless scripts go under `scripts/_tmp-rev-*.ts` (untracked, never commit).

- [ ] **Step 1: Full gates.** Run `npx vitest run` (full suite). Compare the failing-file list with plain `origin/main` (on 2026-10-01: 14 files / 34 tests, all pre-existing). Then run `node_modules/.bin/tsc --noEmit`: baseline files only.
- [ ] **Step 2: Confirm the prerequisite.** Run `git merge-base --is-ancestor <PR #53 merge commit> origin/main`. It must succeed before any prod use.
- [ ] **Step 3: Ask Manu for the migration OK** (a schema change on prod). Only then run `npx tsx scripts/_apply-NNNN.ts`. Expected output: "DDL committed on attempt 1." then "NNNN applied OK: 4 tables, 3 unique indexes." Never re-run it after that.
- [ ] **Step 4: Ask Manu for a prod-write OK for a test round on ONE named project** (the local dev server writes to the prod DB). Then run the headless pass on PORT 3100 (`preview_start`), minting session JWTs as in the Thread AA recipe (`scripts/_tmp-aa-sectiona.ts` pattern; the client-role session per memory "portal-client-session-headless-verify"):
  - Specialist: S6 → Save & Submit → strip shows `r1 · PM review · waiting for <PM>`.
  - Assigned PM: review page → comment on Title → Approve.
  - Assigned AM: Send to client.
  - Client user: `/portal/seo` lists it → PDP preview, portal tone, no JS errors → comment → Request changes (with note) → staff sees `changes_requested`; the client comment is visible to staff, and internal comments are absent from the portal network response (check the JSON).
  - Specialist edits, submits r2 → back at PM (not the client).
  - Race: POST the same PM decision twice in parallel → one 200, one 409.
  - AM: Approve as final (reason) → Push preview → Push → `seo_revision_pushes` row → product page shows the SEO line.
  - Screenshots of each screen; 0 JS errors.
- [ ] **Step 5: Clean up the test round** only as Manu directs (deleting prod rows needs its own OK).
- [ ] **Step 6: Report** results, the deliberate choices (a client "request changes" requires a note; comments attach via the field list beside the preview rather than clickable PDP text), and hand over to `superpowers:finishing-a-development-branch`.
