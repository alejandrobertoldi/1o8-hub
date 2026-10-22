# Variation Builder — Bulk Add/Remove by Column Filter + Instant Reaction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make single ASIN add/remove feel instant (no full refetch), and let users filter the product pool by any column and bulk add/remove the matching ASINs to/from the variation and to/from groups.

**Architecture:** Load the full client product pool once (fetch-until-complete, cap 2000) so filtering and "select all matching" are correct. Replace the post-mutation `refetchQueries` calls with an in-memory **membership overlay** (`Map<id, boolean>`) + a debounced background reconcile refetch — the checkbox/row react synchronously. Reuse the existing `AacColumnFilterBar` for multi-select column filtering, replacing the single-value header dropdowns. Bulk actions reuse the existing `/assign` and group `members` endpoints (already accept `productIds[]`).

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, Vitest, Tailwind, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-10-variation-builder-bulk-filter-design.md`

**Sequencing note:** All tasks edit the same large file (`src/app/variations/[id]/page.tsx`), so run them **sequentially** (1→4), not in parallel. Task 5 is final QA.

**Verification note:** This page has no existing component tests and verification is RENDER-based per project rules. Task 1 extracts pure logic into a lib module and unit-tests it (Vitest). Tasks 2–4 are verified by authed render QA in Task 5. Do NOT claim done on a green build alone.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/variations/client-product-pool.ts` | Pure pool fetch-until-complete + `getColValue` (shared, testable) | **Create** |
| `src/lib/variations/client-product-pool.test.ts` | Unit tests for the above | **Create** |
| `src/app/variations/[id]/page.tsx` | Builder UI: pool query, overlay, filter bar, bulk toolbar | **Modify** |
| `src/components/clients/aac-column-filter.tsx` | Reused as-is | No change |
| `src/app/api/variations/[id]/assign/route.ts` | Reused as-is (accepts `productIds[]`, `unassign`) | No change |
| `src/app/api/variations/[id]/groups/[groupId]/members/route.ts` | Reused as-is (accepts `productIds[]`) | No change |

---

## Task 1: Load the full client pool (D2)

Extract a testable fetch-until-complete helper + shared `getColValue`, unit-test it, then switch the page's pool query to use it and drop pool pagination.

**Files:**
- Create: `src/lib/variations/client-product-pool.ts`
- Create: `src/lib/variations/client-product-pool.test.ts`
- Modify: `src/app/variations/[id]/page.tsx` (pool query ~998-1019; pager block; `getColValue` ~1347-1361)

- [ ] **Step 1: Write the failing test**

Create `src/lib/variations/client-product-pool.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchAllClientProducts, getColValue, type PoolProduct } from "./client-product-pool";

function mkProduct(id: string, extra: Partial<PoolProduct> = {}): PoolProduct {
  return {
    id, asin: id, sku: null, itemName: null, mainImageUrl: null,
    variationId: null, variationGroup: null, parentageLevel: null, status: null,
    variations: null, rawColumnValues: null, ...extra,
  };
}

function mockPages(pages: PoolProduct[][], total: number) {
  let call = 0;
  return vi.fn(async () => {
    const data = pages[call] ?? [];
    call += 1;
    return { ok: true, json: async () => ({ data, pagination: { total } }) } as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchAllClientProducts", () => {
  it("accumulates across pages until total is reached", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => mkProduct(`a${i}`));
    const page2 = Array.from({ length: 50 }, (_, i) => mkProduct(`b${i}`));
    vi.stubGlobal("fetch", mockPages([page1, page2], 150));
    const res = await fetchAllClientProducts("ACME");
    expect(res.products).toHaveLength(150);
    expect(res.total).toBe(150);
    expect(res.capped).toBe(false);
  });

  it("caps the result and flags capped=true when total exceeds the cap", async () => {
    const full = Array.from({ length: 100 }, (_, i) => mkProduct(`x${i}`));
    vi.stubGlobal("fetch", mockPages([full, full, full], 5000));
    const res = await fetchAllClientProducts("ACME", { cap: 200 });
    expect(res.products).toHaveLength(200);
    expect(res.capped).toBe(true);
  });

  it("stops when a page returns fewer rows than total claims (defensive)", async () => {
    vi.stubGlobal("fetch", mockPages([[mkProduct("only")], []], 999));
    const res = await fetchAllClientProducts("ACME");
    expect(res.products).toHaveLength(1);
  });
});

describe("getColValue", () => {
  it("reads standard columns and theme-attr keys from the variations blob", () => {
    const p = mkProduct("p1", {
      status: "Active", variationId: "VID1", variationGroup: "G1",
      parentageLevel: "Child",
      variations: { VariationThemeName: "FLAVOR/SIZE", Flavor: "Vanilla", Size: "Large" },
    });
    expect(getColValue(p, "status")).toBe("Active");
    expect(getColValue(p, "varId")).toBe("VID1");
    expect(getColValue(p, "group")).toBe("G1");
    expect(getColValue(p, "theme")).toBe("FLAVOR/SIZE");
    expect(getColValue(p, "parentage")).toBe("Child");
    expect(getColValue(p, "Flavor")).toBe("Vanilla");
    expect(getColValue(p, "Missing")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/variations/client-product-pool.test.ts`
Expected: FAIL — `Cannot find module './client-product-pool'`.

- [ ] **Step 3: Create the implementation**

Create `src/lib/variations/client-product-pool.ts`:

```typescript
// Pure helpers for the Variation Builder product pool.
// Kept out of the page component so they are unit-testable and shared.

export type PoolProduct = {
  id: string;
  asin: string | null;
  sku: string | null;
  itemName: string | null;
  mainImageUrl: string | null;
  variationId: string | null;
  variationGroup: string | null;
  parentageLevel: string | null;
  status: string | null;
  variations: Record<string, string | undefined> | null;
  rawColumnValues: Record<string, string> | null;
  varietyPackItemCount?: number;
  vpFlavors?: string[] | null;
  isVp?: boolean;
};

export const POOL_CAP = 2000;
export const POOL_PAGE_SIZE = 100; // matches the /api/products hard cap

/**
 * Fetch every product for a client by paging through /api/products until
 * `total` is reached (or `cap`). Returns the full in-memory pool so the
 * builder can filter and "select all matching" across the entire catalog.
 */
export async function fetchAllClientProducts(
  clientId: string,
  opts?: { search?: string; cap?: number; signal?: AbortSignal },
): Promise<{ products: PoolProduct[]; total: number; capped: boolean }> {
  const cap = opts?.cap ?? POOL_CAP;
  const products: PoolProduct[] = [];
  let page = 1;
  let total = 0;

  for (;;) {
    const params = new URLSearchParams({
      client: clientId,
      pageSize: String(POOL_PAGE_SIZE),
      page: String(page),
      includeInactive: "true",
    });
    if (opts?.search) params.set("search", opts.search);

    const res = await fetch(`/api/products?${params}`, { signal: opts?.signal });
    if (!res.ok) throw new Error("Failed to load products");
    const json = await res.json();
    total = json.pagination.total as number;
    const batch = json.data as PoolProduct[];
    products.push(...batch);

    if (batch.length === 0 || products.length >= total || products.length >= cap) break;
    page += 1;
  }

  const capped = total > cap;
  return { products: capped ? products.slice(0, cap) : products, total, capped };
}

/** Extract a sortable/filterable string value from a product by column key. */
export function getColValue(p: PoolProduct, col: string): string {
  switch (col) {
    case "asin": return p.asin ?? "";
    case "sku": return p.sku ?? "";
    case "status": return p.status ?? "";
    case "title": return p.itemName ?? "";
    case "varId": return p.variationId ?? "";
    case "group": return p.variationGroup ?? "";
    case "theme": return p.variations?.VariationThemeName ?? "";
    case "parentage": return p.parentageLevel ?? "";
    default: return p.variations?.[col] ?? ""; // theme attr keys
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/variations/client-product-pool.test.ts`
Expected: PASS (3 + 1 tests green).

- [ ] **Step 5: Wire the helper into the page query**

In `src/app/variations/[id]/page.tsx`, add to the imports near the top (after the existing `@/` imports):

```typescript
import {
  fetchAllClientProducts,
  getColValue as poolGetColValue,
  POOL_CAP,
  type PoolProduct,
} from "@/lib/variations/client-product-pool";
```

Replace the `clientProducts` query (currently `src/app/variations/[id]/page.tsx:998-1019`) with:

```typescript
  // Fetch the FULL client product pool (paged until complete, capped at POOL_CAP)
  // so filtering + "select all matching" are correct across the whole catalog.
  const { data: clientProducts } = useQuery({
    queryKey: ["client-products", variation?.clientId, productSearch],
    queryFn: () =>
      fetchAllClientProducts(variation!.clientId, {
        search: productSearch || undefined,
      }),
    enabled: !!variation?.clientId,
  });
```

- [ ] **Step 6: Replace the local `getColValue` with the shared one**

Delete the local `getColValue` `useCallback` (currently `src/app/variations/[id]/page.tsx:1347-1361`, including the `type ClientProduct = ...` line on 1348) and replace with:

```typescript
  // Product type + value extractor now live in the shared pool lib (DRY).
  type ClientProduct = PoolProduct;
  const getColValue = poolGetColValue;
```

(Leaving `getColValue` as a same-named binding means existing call sites — sort, filters, `columnUniqueValues` — keep working unchanged. The `ClientProduct` alias keeps existing type references valid.)

- [ ] **Step 7: Remove the pool pagination UI + add a capped notice**

Delete the pager block (the JSX guarded by `clientProducts.total > clientProducts.pageSize`, currently around `src/app/variations/[id]/page.tsx:1905-1925`). Also delete the now-unused `productPage` state (line 912) and any `setProductPage` references.

Then, in the filter-bar area (see Task 3 for the surrounding rewrite), the capped notice is added. For this task, if Task 3 is not yet applied, temporarily add directly above the table container (line ~1755):

```tsx
              {clientProducts.capped && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-2">
                  Showing the first {POOL_CAP} products for this client. Use search to narrow the pool.
                </p>
              )}
```

- [ ] **Step 8: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors referencing `page.tsx` or `client-product-pool.ts`. (Build verification per project rule: a red build from parallel-session pollution is possible — confirm errors are unrelated before proceeding.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/variations/client-product-pool.ts src/lib/variations/client-product-pool.test.ts src/app/variations/[id]/page.tsx
git commit -m "feat(variations): load full client pool for builder filtering" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Instant reaction — membership overlay (D1)

Replace the refetch-on-every-toggle with an in-memory overlay + debounced reconcile. The checkbox, row highlight, and sort react synchronously.

**Files:**
- Modify: `src/app/variations/[id]/page.tsx` (fetcher `bulkAssign` ~269-283; `IncludeCheckbox` 740-797; `IncludeAllCheckbox` 685-738; state ~926-930; mutations ~1056-1200; `displayProducts` 1383-1425; render 1760-1824)

- [ ] **Step 1: Extend the `bulkAssign` fetcher to support `unassign`**

In `src/app/variations/[id]/page.tsx`, change the `bulkAssign` function body type (currently 269-283) so the body accepts `unassign`:

```typescript
async function bulkAssign(
  variationId: string,
  body: {
    productIds: string[];
    groupId?: string | null;
    tagIds?: string[];
    unassign?: boolean;
  }
): Promise<void> {
  const res = await fetch(`/api/variations/${variationId}/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Assign failed");
}
```

- [ ] **Step 2: Add overlay state + reconcile**

Add `useRef` to the React import if not present. Add this state right after `const [lockError, setLockError] = useState(false);` (line 930):

```typescript
  // Optimistic membership overlay: productId -> included? (true=added, false=removed)
  // Lets add/remove react instantly without refetching the whole variation.
  const [optimisticMembership, setOptimisticMembership] = useState<Map<string, boolean>>(new Map());
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Add this near the other mutations (after `invalidateProducts`, ~line 1060):

```typescript
  // Debounced background reconcile: refresh real data ~1.2s after the last
  // change, then clear the optimistic overlay (no flicker — truth has landed).
  const scheduleReconcile = useCallback(() => {
    if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
    reconcileTimer.current = setTimeout(async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey }),
        queryClient.refetchQueries({ queryKey: ["client-products"] }),
      ]);
      setOptimisticMembership(new Map());
    }, 1200);
  }, [queryClient]); // queryKey is stable (["variation", id])

  useEffect(() => () => {
    if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
  }, []);

  // Add/remove products to/from the variation. Updates the overlay synchronously,
  // fires one batched request, reverts on error, and schedules a reconcile.
  const toggleMembership = useCallback(async (ids: string[], include: boolean) => {
    if (ids.length === 0) return;
    setOptimisticMembership((prev) => {
      const next = new Map(prev);
      for (const pid of ids) next.set(pid, include);
      return next;
    });
    try {
      await bulkAssign(id, include ? { productIds: ids } : { productIds: ids, unassign: true });
      toast.success(
        include
          ? `Added ${ids.length} to variation`
          : `Removed ${ids.length} from variation`
      );
    } catch {
      setOptimisticMembership((prev) => {
        const next = new Map(prev);
        for (const pid of ids) next.delete(pid);
        return next;
      });
      toast.error("Failed to update");
    }
    scheduleReconcile();
  }, [id, scheduleReconcile]);
```

- [ ] **Step 3: Compute `effectiveAssignedIds` and use it for the top table**

Add right after the `assignedProductIds` useMemo (after line 1300):

```typescript
  // Real membership merged with the optimistic overlay — drives the top
  // product table (checkbox state, row highlight, include-first sort).
  const effectiveAssignedIds = useMemo(() => {
    if (optimisticMembership.size === 0) return assignedProductIds;
    const ids = new Set(assignedProductIds);
    for (const [pid, inc] of optimisticMembership) {
      if (inc) ids.add(pid);
      else ids.delete(pid);
    }
    return ids;
  }, [assignedProductIds, optimisticMembership]);
```

In `displayProducts` (1383-1425), change the two `belongsToVariation` references and the dependency array to use `effectiveAssignedIds`:
- Line ~1390: `assignedProductIds.has(p.id)` → `effectiveAssignedIds.has(p.id)`
- Dependency array (line 1425): replace `assignedProductIds` with `effectiveAssignedIds`.

- [ ] **Step 4: Convert `IncludeCheckbox` to a controlled dumb checkbox**

Replace the entire `IncludeCheckbox` component (740-797) with:

```tsx
function IncludeCheckbox({
  included,
  onToggle,
}: {
  included: boolean;
  onToggle: () => void;
}) {
  return (
    <Checkbox
      checked={included}
      onCheckedChange={onToggle}
      className={cn(
        included && "data-[state=checked]:bg-brand data-[state=checked]:border-brand"
      )}
    />
  );
}
```

Update its usage (1818-1823) to:

```tsx
                            <IncludeCheckbox
                              included={isIncluded}
                              onToggle={() => toggleMembership([p.id], !isIncluded)}
                            />
```

And change `isIncluded` (line 1806) to read the effective set:

```tsx
                      const isIncluded = effectiveAssignedIds.has(p.id);
```

- [ ] **Step 5: Convert `IncludeAllCheckbox` to controlled**

Replace the entire `IncludeAllCheckbox` component (685-738) with:

```tsx
function IncludeAllCheckbox({
  products,
  assignedProductIds,
  onToggleAll,
}: {
  products: { id: string }[];
  assignedProductIds: Set<string>;
  onToggleAll: (include: boolean, ids: string[]) => void;
}) {
  const allIncluded = products.length > 0 && products.every((p) => assignedProductIds.has(p.id));
  const someIncluded = products.some((p) => assignedProductIds.has(p.id));

  function toggleAll() {
    if (products.length === 0) return;
    if (allIncluded) {
      onToggleAll(false, products.map((p) => p.id));
    } else {
      onToggleAll(true, products.filter((p) => !assignedProductIds.has(p.id)).map((p) => p.id));
    }
  }

  return (
    <Checkbox
      checked={allIncluded ? true : someIncluded ? "indeterminate" : false}
      onCheckedChange={toggleAll}
      disabled={products.length === 0}
      className={cn(
        allIncluded && "data-[state=checked]:bg-brand data-[state=checked]:border-brand"
      )}
      aria-label="Include all products"
    />
  );
}
```

Update its usage (1760-1765) to:

```tsx
                        <IncludeAllCheckbox
                          products={displayProducts}
                          assignedProductIds={effectiveAssignedIds}
                          onToggleAll={(include, ids) => toggleMembership(ids, include)}
                        />
```

- [ ] **Step 6: Stop the bulk group-move from doing a full refetch**

In `assignMut.onSuccess` (1194-1198), replace `invalidate();` with `scheduleReconcile();`:

```typescript
    onSuccess: () => {
      scheduleReconcile();
      setSelectedIds(new Set());
      toast.success("Products updated");
    },
```

- [ ] **Step 7: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no new errors in `page.tsx`. Confirm `invalidate`/`invalidateProducts` are still referenced elsewhere (group create/rename/delete) so they aren't dead — they are, leave them.

- [ ] **Step 8: Commit**

```bash
git add src/app/variations/[id]/page.tsx
git commit -m "perf(variations): optimistic membership overlay kills add/remove lag" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: AAC chip filter + capped rendering (D3, D4)

Replace the single-value header dropdowns with the multi-select `AacColumnFilterBar`, and cap rendered rows while bulk acts on all matches.

**Files:**
- Modify: `src/app/variations/[id]/page.tsx` (imports; `columnFilters` state 926; `displayProducts` filter loop 1397-1401; `setFilter`/`activeFilterCount` 1437-1447; filter-bar JSX 1708-1753; tbody map 1805)

- [ ] **Step 1: Import the filter bar**

Add to imports:

```typescript
import { AacColumnFilterBar, type AacFilters } from "@/components/clients/aac-column-filter";
```

- [ ] **Step 2: Change the filter state type**

Change line 926:

```typescript
  const [columnFilters, setColumnFilters] = useState<AacFilters>({});
```

- [ ] **Step 3: Build the filter columns, labels, and rows**

Add after `columnUniqueValues` (after line 1380):

```typescript
  // Columns offered in the chip filter (standard + dynamic theme attrs).
  const filterColumns = useMemo(
    () => ["status", "varId", "group", "theme", "parentage", ...themeAttrKeys],
    [themeAttrKeys]
  );
  const filterLabels = useMemo<Record<string, string>>(
    () => ({
      status: "Status",
      varId: "Variation ID",
      group: "Variation Group",
      theme: "Variation Theme",
      parentage: "Parentage",
      ...Object.fromEntries(
        themeAttrKeys.map((k) => [k, themeAttrLabelMap?.[k.toLowerCase()] ?? k])
      ),
    }),
    [themeAttrKeys, themeAttrLabelMap]
  );
  // Flatten each product into a {col: value} row for AacColumnFilterBar's
  // distinct-value/count computation. Uses the FULL pool so counts are accurate.
  const filterRows = useMemo(
    () =>
      (clientProducts?.products ?? []).map((p) => {
        const row: Record<string, string> = {};
        for (const c of filterColumns) row[c] = getColValue(p, c);
        return row;
      }),
    [clientProducts, filterColumns, getColValue]
  );
```

- [ ] **Step 4: Update the filter application to multi-select**

Replace the column-filter loop in `displayProducts` (1397-1401) with:

```typescript
    // Apply column filters (OR within a column, AND across columns).
    for (const [col, vals] of Object.entries(columnFilters)) {
      if (!vals?.length) continue;
      const set = new Set(vals);
      items = items.filter((p) => set.has(getColValue(p, col)));
    }
```

- [ ] **Step 5: Remove the dead single-select filter plumbing**

Delete `setFilter` (1437-1445) and `activeFilterCount` (1447). Delete the `openFilter` state (927) and the outside-click effect that references it (940-951) and the `filterRef`. (Grep `openFilter` and `setFilter` and confirm no remaining references before deleting.)

- [ ] **Step 6: Replace the filter-bar JSX**

Replace the entire filter-bar `<div className="flex flex-wrap items-center gap-2 mb-3">…</div>` block (1708-1753) with:

```tsx
              {/* Filter bar (multi-select chips) */}
              <div className="flex flex-wrap items-center gap-2">
                <AacColumnFilterBar
                  columns={filterColumns}
                  labels={filterLabels}
                  rows={filterRows}
                  numericCols={new Set()}
                  filters={columnFilters}
                  onChange={setColumnFilters}
                />
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {displayProducts.length}
                  {displayProducts.length !== clientProducts.products.length
                    ? ` of ${clientProducts.products.length}`
                    : ""}{" "}
                  products
                </span>
              </div>
              {clientProducts.capped && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2">
                  Showing the first {POOL_CAP} products for this client. Use search to narrow the pool.
                </p>
              )}
```

(If Task 1 Step 7 added a temporary capped notice above the table, remove that temporary copy now — keep only this one.)

- [ ] **Step 7: Cap rendered rows, bulk acts on all matches**

Add right before the table container (~line 1755, after the filter bar):

```tsx
              {displayProducts.length > RENDER_CAP && (
                <p className="text-[10px] text-muted-foreground mt-2 mb-1">
                  Showing first {RENDER_CAP} of {displayProducts.length} matching — bulk actions apply to all {displayProducts.length}.
                </p>
              )}
```

Add this constant near the top of the component (after `const primaryDim = ...`, ~line 1483, OR as a module const above the component):

```typescript
  const RENDER_CAP = 100;
  const renderedProducts = displayProducts.slice(0, RENDER_CAP);
```

Change the tbody map (line 1805) from `displayProducts.map((p) => {` to `renderedProducts.map((p) => {`.

- [ ] **Step 8: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no new errors. Confirm no dangling references to `setFilter`, `openFilter`, `activeFilterCount`, `columnUniqueValues` in the JSX (the old dropdowns are gone). `columnUniqueValues` may now be unused — if lint flags it, delete it (1364-1380).

- [ ] **Step 9: Commit**

```bash
git add src/app/variations/[id]/page.tsx
git commit -m "feat(variations): multi-select column chip filter + capped row render" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Bulk actions — select-all + add/remove variation + remove-from-group (D5)

Add "Select all N matching" and extend the bulk toolbar with the four actions. All go through the overlay/reconcile so they feel instant.

**Files:**
- Modify: `src/app/variations/[id]/page.tsx` (new fetcher near 283; new mutation near 1200; filter-bar area for select-all ~1709; bulk toolbar 2161-2222)

- [ ] **Step 1: Add the bulk group-removal fetcher**

Add after the `bulkAssign` function (after line 283):

```typescript
async function bulkRemoveFromGroup(
  variationId: string,
  groupId: string,
  productIds: string[]
): Promise<void> {
  const res = await fetch(
    `/api/variations/${variationId}/groups/${groupId}/members`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds }),
    }
  );
  if (!res.ok) throw new Error("Remove from group failed");
}
```

- [ ] **Step 2: Add the remove-from-group mutation**

Add after `assignMut` (after line 1200):

```typescript
  const removeFromGroupMut = useMutation({
    mutationFn: ({ groupId, productIds }: { groupId: string; productIds: string[] }) =>
      bulkRemoveFromGroup(id, groupId, productIds),
    onSuccess: () => {
      scheduleReconcile();
      setSelectedIds(new Set());
      toast.success("Removed from group");
    },
    onError: (err: Error) => toast.error(err.message),
  });
```

- [ ] **Step 3: Add "Select all N matching"**

Inside the filter-bar `<div>` from Task 3 Step 6, add a button before the count `<span>` (only meaningful when filters/matches exist):

```tsx
                {displayProducts.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-brand"
                    onClick={() => setSelectedIds(new Set(displayProducts.map((p) => p.id)))}
                  >
                    Select all {displayProducts.length}
                  </Button>
                )}
```

- [ ] **Step 4: Extend the bulk toolbar with variation + group-remove actions**

In the bulk toolbar (2161-2222), insert these between the `{selectedArr.length} selected` span block and the "Move to Group" dropdown (after the `<Separator orientation="vertical" className="h-6" />` on line 2168):

```tsx
              <Button
                size="sm"
                variant="ghost"
                className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-brand hover:bg-brand/20"
                onClick={() => { toggleMembership(selectedArr, true); setSelectedIds(new Set()); }}
              >
                <Plus className="size-3.5 mr-1.5" />
                Add to variation
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                onClick={() => { toggleMembership(selectedArr, false); setSelectedIds(new Set()); }}
              >
                <Minus className="size-3.5 mr-1.5" />
                Remove from variation
              </Button>
```

Then add a "Remove from Group" dropdown right after the existing "Move to Group" `</DropdownMenu>` (after line 2207):

```tsx
              {/* Remove from Group */}
              {variation.groups.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      <Minus className="size-3.5 mr-1.5" />
                      Remove from Group
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {variation.groups.map((g) => (
                      <DropdownMenuItem
                        key={g.id}
                        onClick={() =>
                          removeFromGroupMut.mutate({ groupId: g.id, productIds: selectedArr })
                        }
                      >
                        {g.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
```

- [ ] **Step 5: Ensure icon imports**

Confirm `Plus` and `Minus` are imported from `lucide-react` at the top of the file. If not, add them to the existing `lucide-react` import.

- [ ] **Step 6: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no new errors. `Plus`/`Minus` resolve; `removeFromGroupMut` used.

- [ ] **Step 7: Commit**

```bash
git add src/app/variations/[id]/page.tsx
git commit -m "feat(variations): bulk add/remove variation + group via filtered selection" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Render QA (verify behavior, not just build)

**Files:** none (verification only)

- [ ] **Step 1: Start dev server**

Run: `PORT=3000 npm run dev` (background). Wait for ready.

- [ ] **Step 2: Authenticated render QA**

Use the project's authed-browse sequence (single Bash call): `goto localhost:3000 FIRST → cookie-import-browser chrome --domain localhost → read cookies to settle → re-goto → reload`. Navigate to a variation builder URL (`/variations/<id>` — pick a client with many ASINs).

- [ ] **Step 3: Verify each acceptance criterion (screenshot evidence)**

- [ ] Single ASIN checkbox toggle → checkbox + row highlight flip with **no visible page stall** (the lag is gone). Toast appears.
- [ ] Open the chip filter → pick a column (e.g. a theme attribute) → values show with counts → select 2+ values → table narrows; pick a second column → narrows further (AND across).
- [ ] The product count reflects the full pool (not 50); if client > 2000, the capped notice shows.
- [ ] With a filter active, click **Select all N** → N selected → **Add to variation** → all flip instantly, one network request (check Network tab: one PATCH).
- [ ] **Remove from variation** on a selection → rows un-highlight instantly.
- [ ] **Remove from Group** → product leaves that group (visible after the ~1.2s reconcile).
- [ ] Hard-reload the page → server state matches what the UI showed (overlay reconciled correctly).

- [ ] **Step 4: Report**

Summarize pass/fail per criterion with screenshots. If any fail, file as a follow-up; do not mark the feature done.

---

## Self-Review (completed by plan author)

- **Spec coverage:** D1→Task 2; D2→Task 1; D3→Task 3 Steps 1-6; D4→Task 3 Step 7; D5→Task 4. All covered.
- **Placeholder scan:** No TBD/TODO; every code step has concrete code.
- **Type consistency:** `PoolProduct`/`ClientProduct` aliased (Task 1 Step 6); `getColValue` re-bound to `poolGetColValue` so existing call sites keep compiling; `AacFilters` (`Record<string,string[]>`) used consistently in state, filter loop, and `AacColumnFilterBar.onChange`; `toggleMembership(ids, include)` / `onToggleAll(include, ids)` / `removeFromGroupMut({groupId, productIds})` signatures match their call sites.
- **Known follow-ups (out of scope):** row virtualization (deferred per D4); server-side filtering if a client exceeds ~5000 ASINs (deferred per D2).
