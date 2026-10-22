# NTA Listing-Intake Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `attribute_template_requests` Google-Sheets pipeline so it can generate a "Minimum + Necessary" listings Sheet for NTA clients (after a blank CLR upload) and import filled-in rows back into `master` as INSERTs (not just UPDATEs).

**Architecture:** Reuse-heavy. One new query helper (`getMinimumNecessaryAttributes`), three surgical edits to existing route handlers (filter logic + INSERT branch in finalize), one new onboarding step, one preset button on the existing dialog. No new tables, no migration.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, PostgreSQL (Supabase), Vitest, Google Sheets/Drive REST clients, React 19 + Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-05-13-nta-listing-intake-sheet-design.md`

---

## File Structure

**Created:**
- `src/lib/category-meta-queries.ts` already exists — append `getMinimumNecessaryAttributes` to it.
- `src/lib/onboarding/identity-resolver.ts` — NEW pure function for ASIN→SKU→INSERT routing.
- Tests next to each modified file (Vitest convention in this repo).

**Modified:**
- `src/lib/category-meta-queries.ts` — add new export.
- `src/app/api/attributes/template-requests/route.ts` — filter accepts `"Essential"`.
- `src/app/api/attributes/template-requests/[id]/finalize/route.ts` — filter accepts `"Essential"`, identity-resolver call replaces ASIN-only lookup, INSERT branch added, response gains `inserted[]`.
- `src/lib/onboarding/steps.ts` — add `generate_listing_sheet` step + Gantt mapping.
- `src/components/attributes/template-dialog.tsx` — add `Essential` to `LEVEL_OPTIONS`, add "Minimum + Necessary" preset button.
- Onboarding UI component for step 8 — add card for the new sub-step (file located in Task 9).

---

### Task 1: Failing test for `getMinimumNecessaryAttributes`

**Files:**
- Test: `src/lib/category-meta-queries.test.ts` (create if absent, otherwise append)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/category-meta-queries.test.ts — append (or create)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMinimumNecessaryAttributes } from "./category-meta-queries";

vi.mock("./category-meta-queries", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./category-meta-queries")>();
  return {
    ...mod,
    getAttributesForCategory: vi.fn(),
  };
});
import * as queries from "./category-meta-queries";

const ID_COLS = ["SKU", "ASIN", "ItemName", "ProductType"];

const baseRow = (over: Partial<{
  generalLabel: string;
  requirement: string | null;
  isEssential: boolean;
  isKey: boolean;
}> = {}) => ({
  id: 1,
  generalLabel: over.generalLabel ?? "x",
  description: null,
  bqDataType: "STRING",
  requirement: over.requirement ?? null,
  validValues: null,
  example: null,
  isEssential: over.isEssential ?? false,
  isKey: over.isKey ?? false,
});

describe("getMinimumNecessaryAttributes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns empty (except identity cols) when no schema attrs match", async () => {
    (queries.getAttributesForCategory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const out = await getMinimumNecessaryAttributes("ATVPDKIKX0DER", "HAT");
    expect(out.map((r) => r.generalLabel)).toEqual(ID_COLS);
  });

  it("includes Required, Conditionally Required, isEssential and excludes others", async () => {
    (queries.getAttributesForCategory as ReturnType<typeof vi.fn>).mockResolvedValue([
      baseRow({ generalLabel: "color",         requirement: "Required" }),
      baseRow({ generalLabel: "size",          requirement: "Conditionally Required" }),
      baseRow({ generalLabel: "bullet_1",      requirement: null, isEssential: true }),
      baseRow({ generalLabel: "ignored_recom", requirement: "Recommended" }),
      baseRow({ generalLabel: "ignored_opt",   requirement: "Optional" }),
    ]);
    const labels = (await getMinimumNecessaryAttributes("ATVPDKIKX0DER", "HAT"))
      .map((r) => r.generalLabel);
    expect(labels).toEqual([...ID_COLS, "color", "size", "bullet_1"]);
  });

  it("orders Required → Cond.Required → Essential-only, alpha within bucket", async () => {
    (queries.getAttributesForCategory as ReturnType<typeof vi.fn>).mockResolvedValue([
      baseRow({ generalLabel: "z_req",   requirement: "Required" }),
      baseRow({ generalLabel: "a_req",   requirement: "Required" }),
      baseRow({ generalLabel: "z_cond",  requirement: "Conditionally Required" }),
      baseRow({ generalLabel: "a_cond",  requirement: "Conditionally Required" }),
      baseRow({ generalLabel: "z_ess",   isEssential: true }),
      baseRow({ generalLabel: "a_ess",   isEssential: true }),
    ]);
    const labels = (await getMinimumNecessaryAttributes("ATVPDKIKX0DER", "HAT"))
      .map((r) => r.generalLabel);
    expect(labels).toEqual([...ID_COLS, "a_req", "z_req", "a_cond", "z_cond", "a_ess", "z_ess"]);
  });

  it("de-duplicates an attribute that is both Required and isEssential", async () => {
    (queries.getAttributesForCategory as ReturnType<typeof vi.fn>).mockResolvedValue([
      baseRow({ generalLabel: "color", requirement: "Required", isEssential: true }),
    ]);
    const labels = (await getMinimumNecessaryAttributes("ATVPDKIKX0DER", "HAT"))
      .map((r) => r.generalLabel);
    expect(labels.filter((l) => l === "color")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/category-meta-queries.test.ts`
Expected: FAIL with "getMinimumNecessaryAttributes is not a function" or equivalent.

- [ ] **Step 3: Commit failing test**

```bash
git add src/lib/category-meta-queries.test.ts
git commit -m "test(category-meta): failing tests for getMinimumNecessaryAttributes"
```

---

### Task 2: Implement `getMinimumNecessaryAttributes`

**Files:**
- Modify: `src/lib/category-meta-queries.ts` — append a new exported function.

- [ ] **Step 1: Read the current export shape** to confirm `getAttributesForCategory` returns `AttributeCategoryRow[]` with `requirement`, `isEssential`, `generalLabel`.

```bash
grep -n "export" /Users/manu/1o8Hub/src/lib/category-meta-queries.ts
```

- [ ] **Step 2: Add the helper**

```ts
// Append to src/lib/category-meta-queries.ts

const IDENTITY_COLS = ["SKU", "ASIN", "ItemName", "ProductType"] as const;

/**
 * Filter to "Minimum + Necessary" attributes for a (marketplace, productType):
 *   Amazon-Required ∪ Amazon-Conditionally-Required ∪ Hub-isEssential
 * Identity columns are always first regardless of flags.
 * See docs/superpowers/specs/2026-05-13-nta-listing-intake-sheet-design.md §2.
 */
export async function getMinimumNecessaryAttributes(
  marketplaceId: string,
  productType: string,
): Promise<AttributeCategoryRow[]> {
  const all = await getAttributesForCategory(marketplaceId, productType);
  const byId = new Map<string, AttributeCategoryRow>();
  for (const r of all) byId.set(r.generalLabel, r);

  const identity: AttributeCategoryRow[] = [];
  for (const gl of IDENTITY_COLS) {
    const found = byId.get(gl);
    if (found) {
      identity.push(found);
      byId.delete(gl);
    }
  }

  const required: AttributeCategoryRow[] = [];
  const conditional: AttributeCategoryRow[] = [];
  const essentialOnly: AttributeCategoryRow[] = [];

  for (const r of byId.values()) {
    if (r.requirement === "Required") required.push(r);
    else if (r.requirement === "Conditionally Required") conditional.push(r);
    else if (r.isEssential) essentialOnly.push(r);
  }
  const cmp = (a: AttributeCategoryRow, b: AttributeCategoryRow) =>
    a.generalLabel.localeCompare(b.generalLabel);
  required.sort(cmp);
  conditional.sort(cmp);
  essentialOnly.sort(cmp);

  return [...identity, ...required, ...conditional, ...essentialOnly];
}
```

- [ ] **Step 3: Run tests to verify pass**

Run: `npm test -- src/lib/category-meta-queries.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/category-meta-queries.ts
git commit -m "feat(category-meta): add getMinimumNecessaryAttributes helper"
```

---

### Task 3: Failing test for identity-resolver

**Files:**
- Test: `src/lib/onboarding/identity-resolver.test.ts` — CREATE.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/onboarding/identity-resolver.test.ts
import { describe, it, expect } from "vitest";
import { resolveRowIdentity, type SheetRow, type MasterCandidate } from "./identity-resolver";

const row = (over: Partial<SheetRow> = {}): SheetRow => ({ sku: "", asin: "", ...over });
const cand = (over: Partial<MasterCandidate>): MasterCandidate => ({
  id: "", sku: null, asin: null, ...over,
});

describe("resolveRowIdentity", () => {
  it("matches by ASIN when ASIN is present and exists", () => {
    const r = resolveRowIdentity(
      row({ sku: "SKU1", asin: "ASIN1" }),
      [cand({ id: "p1", sku: "OTHER", asin: "ASIN1" })],
    );
    expect(r).toEqual({ action: "update", productId: "p1", backfillAsin: false });
  });

  it("falls back to SKU match when ASIN not present", () => {
    const r = resolveRowIdentity(
      row({ sku: "SKU1" }),
      [cand({ id: "p2", sku: "SKU1", asin: null })],
    );
    expect(r).toEqual({ action: "update", productId: "p2", backfillAsin: false });
  });

  it("backfillAsin=true when SKU matches and row provides a new ASIN", () => {
    const r = resolveRowIdentity(
      row({ sku: "SKU1", asin: "NEWASIN" }),
      [cand({ id: "p3", sku: "SKU1", asin: null })],
    );
    expect(r).toEqual({ action: "update", productId: "p3", backfillAsin: true });
  });

  it("INSERT when no match and SKU is present", () => {
    const r = resolveRowIdentity(
      row({ sku: "BRANDNEW", asin: "" }),
      [cand({ id: "p4", sku: "OTHER", asin: null })],
    );
    expect(r).toEqual({ action: "insert" });
  });

  it("REJECT when no SKU at all", () => {
    const r = resolveRowIdentity(row({ sku: "", asin: "" }), []);
    expect(r).toEqual({ action: "reject", reason: "missing-sku" });
  });

  it("ASIN takes precedence over SKU when both match different rows", () => {
    const r = resolveRowIdentity(
      row({ sku: "SKU1", asin: "ASIN1" }),
      [
        cand({ id: "byAsin", sku: "DIFFERENT", asin: "ASIN1" }),
        cand({ id: "bySku",  sku: "SKU1",      asin: "OTHER" }),
      ],
    );
    expect(r.action).toBe("update");
    if (r.action === "update") expect(r.productId).toBe("byAsin");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/onboarding/identity-resolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Commit failing test**

```bash
git add src/lib/onboarding/identity-resolver.test.ts
git commit -m "test(identity-resolver): failing tests for ASIN→SKU→INSERT routing"
```

---

### Task 4: Implement identity-resolver

**Files:**
- Create: `src/lib/onboarding/identity-resolver.ts`

- [ ] **Step 1: Write the module**

```ts
// src/lib/onboarding/identity-resolver.ts
/**
 * Pure routing for NTA listing-intake Sheet rows:
 *   ASIN match → UPDATE
 *   SKU match within client → UPDATE (set backfillAsin if row brings a new ASIN)
 *   No match + SKU present → INSERT
 *   No SKU → REJECT
 * Caller is responsible for fetching the candidate set already scoped by clientIdCode.
 */

export interface SheetRow {
  sku: string;
  asin: string;
}

export interface MasterCandidate {
  id: string;
  sku: string | null;
  asin: string | null;
}

export type Resolution =
  | { action: "update"; productId: string; backfillAsin: boolean }
  | { action: "insert" }
  | { action: "reject"; reason: "missing-sku" };

export function resolveRowIdentity(
  row: SheetRow,
  candidates: MasterCandidate[],
): Resolution {
  const sku = row.sku.trim();
  const asin = row.asin.trim();

  if (asin) {
    const hit = candidates.find((c) => c.asin === asin);
    if (hit) return { action: "update", productId: hit.id, backfillAsin: false };
  }

  if (sku) {
    const hit = candidates.find((c) => c.sku === sku);
    if (hit) {
      const backfillAsin = !!asin && hit.asin !== asin;
      return { action: "update", productId: hit.id, backfillAsin };
    }
    return { action: "insert" };
  }

  return { action: "reject", reason: "missing-sku" };
}
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/lib/onboarding/identity-resolver.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 3: Commit**

```bash
git add src/lib/onboarding/identity-resolver.ts
git commit -m "feat(onboarding): identity-resolver for sheet-to-master routing"
```

---

### Task 5: Wire `Essential` into the create-Sheet filter

**Files:**
- Modify: `src/app/api/attributes/template-requests/route.ts` (lines around 265–269)

- [ ] **Step 1: Read current filter**

```bash
grep -n "filtered = attrs.filter" /Users/manu/1o8Hub/src/app/api/attributes/template-requests/route.ts
```

- [ ] **Step 2: Add the `Essential` branch**

Edit the filter inside `buildTemplateSheets()`:

```ts
const filtered = attrs.filter((a) => {
  if (a.requirement && levels.includes(a.requirement)) return true;
  if (levels.includes("Key") && a.isKey) return true;
  if (levels.includes("Essential") && a.isEssential) return true;
  return false;
});
```

- [ ] **Step 3: Manual smoke test**

Run: `npm run build`
Expected: clean build, no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/attributes/template-requests/route.ts
git commit -m "feat(attribute-templates): accept Essential as a level value"
```

---

### Task 6: Mirror `Essential` into the finalize filter

**Files:**
- Modify: `src/app/api/attributes/template-requests/[id]/finalize/route.ts` (filter near top of PATCH handler — same `filtered = attrs.filter(...)` shape)

- [ ] **Step 1: Locate the filter**

```bash
grep -n "filtered = attrs.filter" /Users/manu/1o8Hub/src/app/api/attributes/template-requests/\[id\]/finalize/route.ts
```

- [ ] **Step 2: Add `Essential` branch identically**

```ts
const filtered = attrs.filter((a) => {
  if (a.requirement && record.levels.includes(a.requirement)) return true;
  if (record.levels.includes("Key") && a.isKey) return true;
  if (record.levels.includes("Essential") && a.isEssential) return true;
  return false;
});
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/api/attributes/template-requests/[id]/finalize/route.ts'
git commit -m "feat(attribute-templates): finalize accepts Essential level"
```

---

### Task 7: INSERT branch in finalize

**Files:**
- Modify: `src/app/api/attributes/template-requests/[id]/finalize/route.ts`

This task replaces the ASIN-only identity lookup with the new resolver, adds the INSERT branch, and extends the response shape. The existing diff/UPDATE path is preserved.

- [ ] **Step 1: Read the full finalize handler**

```bash
cat /Users/manu/1o8Hub/src/app/api/attributes/template-requests/\[id\]/finalize/route.ts
```

Identify the block that builds `asinToProductId` and the block that applies updates to `master`. The INSERT branch slots in between row-resolution and DB writes.

- [ ] **Step 2: Pull candidate master rows once per finalize**

Replace the pattern that builds `asinToProductId` with a single client-scoped fetch and pass into the resolver. After the existing `defs` block:

```ts
import { resolveRowIdentity, type MasterCandidate } from "@/lib/onboarding/identity-resolver";
import { setProductFieldValue } from "@/lib/product-mapper";

const clientMasterRows = await db
  .select({ id: master.id, sku: master.sku, asin: master.asin })
  .from(master)
  .where(eq(master.clientIdCode, record.clientIdCode));
const candidates: MasterCandidate[] = clientMasterRows.map((r) => ({
  id: r.id,
  sku: r.sku,
  asin: r.asin,
}));
```

- [ ] **Step 3: Per-row routing loop** (replace the existing per-tab loop body that maps to `asinToProductId`)

For each row in each parsed tab (`def.productType` = tab title), call the resolver and dispatch:

```ts
type InsertRecord = { sku: string; productType: string };
const inserts: InsertRecord[] = [];
const updates: Array<{ productId: string; backfillAsin: string | null; values: Record<string, string> }> = [];
const rejected: Array<{ row: number; reason: string }> = [];

const sheetSkus = new Set<string>();

for (let i = 0; i < defs.length; i++) {
  const def = defs[i];
  const tab = valueRanges[i]?.values ?? [];
  const headers = (tab[4] ?? []) as string[];           // row 5 = attribute headers
  const dataRows = tab.slice(5);                          // row 6+ = data

  const skuColIdx = headers.findIndex((h) => h === "SKU");
  const asinColIdx = headers.findIndex((h) => h === "ASIN");
  if (skuColIdx < 0) continue;                           // tab not usable

  for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
    const cells = (dataRows[rIdx] ?? []) as string[];
    if (cells.every((c) => !c || String(c).trim() === "")) continue;
    const sku = String(cells[skuColIdx] ?? "").trim();
    const asin = asinColIdx >= 0 ? String(cells[asinColIdx] ?? "").trim() : "";

    if (sku && sheetSkus.has(sku)) {
      return NextResponse.json(
        { error: `Duplicate SKU "${sku}" in sheet at row ${rIdx + 6}` },
        { status: 400 },
      );
    }
    if (sku) sheetSkus.add(sku);

    const resolution = resolveRowIdentity({ sku, asin }, candidates);

    // Build the field/value map for this row using the filtered headers
    const values: Record<string, string> = {};
    headers.forEach((h, cIdx) => {
      if (!h || h === "SKU" || h === "ASIN") return;
      const v = String(cells[cIdx] ?? "").trim();
      if (v !== "") values[h] = v;
    });

    if (resolution.action === "reject") {
      rejected.push({ row: rIdx + 6, reason: resolution.reason });
      continue;
    }
    if (resolution.action === "insert") {
      // Validate Required completeness for INSERT
      const requiredMissing = filtered
        .filter((a) => a.requirement === "Required")
        .filter((a) => !values[a.generalLabel])
        .map((a) => a.generalLabel);
      if (requiredMissing.length > 0) {
        rejected.push({ row: rIdx + 6, reason: `missing-required:${requiredMissing.join(",")}` });
        continue;
      }
      // Compose and insert
      let newRow: Partial<typeof master.$inferInsert> = {
        clientIdCode: record.clientIdCode,
        sku,
        asin: asin || null,
        productType: def.productType,
      };
      for (const [bqName, val] of Object.entries(values)) {
        newRow = { ...newRow, ...setProductFieldValue(newRow as never, bqName, val) };
      }
      await db.insert(master).values(newRow as typeof master.$inferInsert);
      inserts.push({ sku, productType: def.productType });
      continue;
    }
    // resolution.action === "update"
    updates.push({
      productId: resolution.productId,
      backfillAsin: resolution.backfillAsin && asin ? asin : null,
      values,
    });
  }
}
```

- [ ] **Step 4: Apply UPDATE branch using existing diff logic**

Keep the existing `computeDiff()` call but feed it the `updates` collection. After the diff is applied per-product, also write `backfillAsin` when present:

```ts
for (const u of updates) {
  // existing per-product update path here, scoped by u.productId, applying u.values
  if (u.backfillAsin) {
    await db.update(master).set({ asin: u.backfillAsin }).where(eq(master.id, u.productId));
  }
}
```

(Adapt to match the existing code path — the precise structure of the UPDATE block in the current file is unchanged except for the source of `productId`.)

- [ ] **Step 5: Extend response**

At the end of the handler, include `inserted` and `rejected` in the response payload:

```ts
return NextResponse.json({
  ...existingResponse,
  inserted: inserts,
  rejected,
});
```

- [ ] **Step 6: Add integration test**

`src/app/api/attributes/template-requests/[id]/finalize/route.test.ts` — create or extend with:

```ts
import { describe, it, expect } from "vitest";
import { resolveRowIdentity } from "@/lib/onboarding/identity-resolver";

// Mocked end-to-end test of the row classifier; full route test is heavier
// — keep this thin: assert ASIN/SKU/no-match routing happens, fixture-driven.

describe("finalize row routing (smoke)", () => {
  it("classifies fixture rows into update/insert/reject buckets", () => {
    const candidates = [
      { id: "p1", sku: "EXISTING-SKU", asin: "B00ABC" },
      { id: "p2", sku: "ONLY-SKU",     asin: null },
    ];
    expect(resolveRowIdentity({ sku: "anything", asin: "B00ABC" }, candidates).action).toBe("update");
    expect(resolveRowIdentity({ sku: "ONLY-SKU", asin: "" }, candidates).action).toBe("update");
    expect(resolveRowIdentity({ sku: "BRANDNEW", asin: "" }, candidates).action).toBe("insert");
    expect(resolveRowIdentity({ sku: "", asin: "" }, candidates).action).toBe("reject");
  });
});
```

- [ ] **Step 7: Run all tests + build**

```bash
npm test -- src/lib/onboarding src/app/api/attributes/template-requests
npm run build
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add 'src/app/api/attributes/template-requests/[id]/finalize/route.ts' \
        'src/app/api/attributes/template-requests/[id]/finalize/route.test.ts'
git commit -m "feat(finalize): INSERT branch + ASIN→SKU→insert routing"
```

---

### Task 8: Onboarding step 8.4 in step registry

**Files:**
- Modify: `src/lib/onboarding/steps.ts`

- [ ] **Step 1: Add the step definition**

Insert after the `amazon_import_catalog` entry (around line 121–128):

```ts
{
  key: "generate_listing_sheet",
  label: "Generate Listings Sheet (Min. + Necessary)",
  description: "Create a Google Sheet with minimum + necessary attributes for the client to fill in. Imported back as new master listings.",
  order: 8.4,
  parent: "amazon_access",
  clientTypeFilter: "NTA",
},
```

Add to `STEP_TO_GANTT`:

```ts
generate_listing_sheet: { taskName: "Amazon Access", subtaskTitle: "Generate Listings Sheet" },
```

- [ ] **Step 2: Build to confirm types**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/onboarding/steps.ts
git commit -m "feat(onboarding): step 8.4 Generate Listings Sheet (NTA)"
```

---

### Task 9: Onboarding UI card for step 8.4

**Files:**
- Locate the existing onboarding step-8 UI:

```bash
grep -rln "amazon_import_attributes\|amazon_import_catalog" /Users/manu/1o8Hub/src/app /Users/manu/1o8Hub/src/components
```

- Modify the file that renders steps under `parent === "amazon_access"`. Likely candidate: `src/app/clients/[clientIdCode]/onboarding/page.tsx` or a child component.

- [ ] **Step 1: Add a card for `generate_listing_sheet`**

Render only when `client.clientType === "NTA"` AND step 8.2 (`amazon_import_attributes`) is complete. Card body:

```tsx
<div className="rounded-md border p-4 space-y-3">
  <div className="font-medium">Generate Listings Sheet</div>
  <div className="text-sm text-muted-foreground">
    Builds a Google Sheet with Amazon-Required + Hub-Essential attributes
    for the client to fill in. Imports back as new master listings.
  </div>

  {existingRequest ? (
    <div className="space-y-2">
      <a href={existingRequest.sheetUrl} target="_blank" rel="noopener noreferrer"
         className="inline-flex items-center gap-1 text-primary hover:underline">
        Open Sheet <ExternalLink className="h-3 w-3" />
      </a>
      <Button variant="secondary" onClick={() => navigator.clipboard.writeText(existingRequest.sheetUrl)}>
        Copy link
      </Button>
      <Button
        onClick={() => finalizeMutation.mutate(existingRequest.id)}
        disabled={existingRequest.status !== "in_progress"}>
        Mark Imported
      </Button>
      <Badge>{existingRequest.status}</Badge>
    </div>
  ) : (
    <Button
      onClick={() => generateMutation.mutate()}
      disabled={!step82Complete}>
      Generate Listings Sheet
    </Button>
  )}
</div>
```

- [ ] **Step 2: Wire mutations** to existing endpoints

```ts
const generateMutation = useMutation({
  mutationFn: async () => {
    const res = await fetch("/api/attributes/template-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientIdCode,
        productType: "all",
        scope: "new",
        levels: ["Required", "Conditionally Required", "Essential"],
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["onboarding", clientIdCode] }),
});

const finalizeMutation = useMutation({
  mutationFn: async (id: string) => {
    const res = await fetch(`/api/attributes/template-requests/${id}/finalize`, { method: "PATCH" });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  onSuccess: (data) => {
    toast.success(`Imported ${data.inserted?.length ?? 0} new listings, updated ${data.updates?.length ?? 0}`);
    queryClient.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
  },
});
```

- [ ] **Step 3: Fetch `existingRequest`** — most recent `attribute_template_requests` row for this client with `scope=new` AND `levels @> ["Essential"]`. Add to the existing onboarding query OR a sibling query.

- [ ] **Step 4: Build + manual click-through on PORT=3000**

```bash
PORT=3000 npm run dev
```

Navigate to an NTA client's onboarding page. Confirm:
- Card visible only for NTA clients.
- Button disabled until step 8.2 complete.
- Click → Sheet created in client's `Templates/InProgress` folder.
- After Sheet creation, "Mark Imported" button appears.

- [ ] **Step 5: Commit**

```bash
git add <onboarding-page-file>
git commit -m "feat(onboarding): UI card for step 8.4 Generate Listings Sheet"
```

---

### Task 10: `TemplateDialog` preset + Essential level

**Files:**
- Modify: `src/components/attributes/template-dialog.tsx`

- [ ] **Step 1: Add `Essential` to `LEVEL_OPTIONS`**

```ts
const LEVEL_OPTIONS = [
  { value: "Required", label: "Required" },
  { value: "Conditionally Required", label: "Cond. Required" },
  { value: "Essential", label: "Essential (Hub)" },
  { value: "Key", label: "Key" },
  { value: "Recommended", label: "Recommended" },
  { value: "Optional", label: "Optional" },
] as const;
```

- [ ] **Step 2: Add preset button above the level checkboxes**

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    setScope("new");
    setLevels(new Set(["Required", "Conditionally Required", "Essential"]));
  }}
>
  Minimum + Necessary preset
</Button>
```

- [ ] **Step 3: Manual test**

Open the Attributes page, open the dialog, click preset, confirm scope=new and three levels checked.

- [ ] **Step 4: Commit**

```bash
git add src/components/attributes/template-dialog.tsx
git commit -m "feat(template-dialog): Minimum + Necessary preset + Essential level"
```

---

### Task 11: End-to-end smoke + final commit

- [ ] **Step 1: Full test suite**

```bash
npm test
```

Expected: all suites green (ignore the 6 pre-existing failures noted in `primer.md`).

- [ ] **Step 2: Full build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 3: Manual scenario walk-through (dev server)**

```bash
PORT=3000 npm run dev
```

Scenario:
1. Pick an NTA test client with a blank CLR uploaded.
2. From `/clients/.../onboarding`, click "Generate Listings Sheet" — confirm Sheet opens with only Min+Necessary columns, 10 empty product rows.
3. Fill 2 rows: one with SKU only (new product), one with SKU + an ASIN that matches an existing master row.
4. Click "Mark Imported" — confirm response shows 1 inserted, 1 updated.
5. Inspect `master` table: 1 new row with `client_id_code = X, asin = NULL`; 1 row with the merged values.

- [ ] **Step 4: STOP — do not push**

Per the global push-confirmation rule in `primer.md`. Report all commits to the user; wait for explicit "push" instruction.

```bash
git log origin/main..HEAD --oneline
```

---

## Self-Review

- **Spec coverage:** every spec section has a task — §2 definition → Task 2; §2 identity → Task 4; §3 architecture (reuse) → Tasks 5/6/7; §4.1 helper → Task 2; §4.2 create-filter → Task 5; §4.3 finalize INSERT → Task 7; §4.4 setProductFieldValue → already exists (uses it in Task 7); §4.5 dialog preset → Task 10; §4.6 onboarding step → Tasks 8 + 9; §5 no schema change → no migration task; §6 tests → Tasks 1, 3, 7-step-6; §7 out-of-scope respected (no image/variation/AIA tasks).
- **Placeholder scan:** no TBD/TODO. Task 9's "locate the file" step is a `grep` command, not a placeholder. The UPDATE branch in Task 7 says "Adapt to match the existing code path" — this is a necessary instruction because the existing file's exact structure is not pasted in full; the engineer reads it and edits, which is how the existing pattern works.
- **Type consistency:** `Resolution.action: "update" | "insert" | "reject"` used consistently in Tasks 3, 4, 7. `MasterCandidate` shape consistent. `SheetRow` shape consistent.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-nta-listing-intake-sheet.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Given context is currently at ~22%, **a fresh session for execution is strongly recommended** regardless of which mode you pick. See the starting prompt in the next message.
