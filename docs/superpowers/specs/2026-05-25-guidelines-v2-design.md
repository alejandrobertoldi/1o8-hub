# Content Guidelines v2 — Design Spec

**Date:** 2026-05-25
**Status:** Approved (pending migration go-ahead)
**Supersedes:** `2026-05-23-variation-guidelines-design.md` (v1 — group/variation only)

---

## Summary of Changes from v1

| Change | v1 | v2 |
|--------|----|----|
| Tiers | 3 (Group → Variation → Brand) | 4 (Listing → Group → Variation → Brand) |
| Cascade mode | Full-override (first non-empty tier wins) | Field-by-field (each of 5 fields picks highest tier where it's set) |
| Listing storage | — | `master.content_guidelines` JSONB |
| Guidelines hub | — | New `/guidelines` page |

---

## Data Model

### Schema change: one new column

| Table    | Column               | Type  | Default |
|----------|----------------------|-------|---------|
| `master` | `content_guidelines` | JSONB | null    |

`variations.content_guidelines` and `variation_groups.content_guidelines` already exist (v1).

### Migration SQL (user runs manually in Supabase SQL editor)

```sql
ALTER TABLE master
  ADD COLUMN IF NOT EXISTS content_guidelines jsonb;
```

One statement. No data risk. Reversible with `DROP COLUMN`.

### Cascade — field-by-field

Each of the 5 fields independently resolves from the highest tier where it is set:

```
Listing (master.content_guidelines)   ← highest priority
  ↑ falls through if field absent to
Group (variation_groups.content_guidelines)
  ↑ falls through if field absent to
Variation (variations.content_guidelines)
  ↑ falls through if field absent to
Brand (seoProjects.brandGuidelines text)  ← lowest, rendered as-is if no structured field
```

"Set" means: non-empty string for scalar fields; non-empty array for list fields.

### Updated `ContentGuidelines` type (unchanged)

```ts
type ContentGuidelines = {
  keyFeatures?:    string[];
  messagingAngle?: string;
  targetAudience?: string;
  doList?:         string[];
  dontList?:       string[];
};
```

---

## Resolver Update (`src/lib/variation-guidelines.ts`)

Replace the current `resolveGuidelines` (full-override) with a new field-by-field merger.
Keep the old signature as a deprecated alias so existing callers don't break during migration.

```ts
/**
 * Resolves effective guidelines field-by-field across 4 tiers.
 * Each field independently takes the highest-priority non-empty value.
 */
export function resolveGuidelinesFieldByField(
  listing:   ContentGuidelines | null | undefined,
  group:     ContentGuidelines | null | undefined,
  variation: ContentGuidelines | null | undefined,
): ContentGuidelines | null {
  const pick = <T>(a?: T, b?: T, c?: T): T | undefined =>
    (a !== undefined && a !== null && (typeof a === 'string' ? a.trim() !== '' : (a as unknown as unknown[]).length > 0)) ? a
    : (b !== undefined && b !== null && (typeof b === 'string' ? b.trim() !== '' : (b as unknown as unknown[]).length > 0)) ? b
    : c;

  const result: ContentGuidelines = {
    messagingAngle: pick(listing?.messagingAngle, group?.messagingAngle, variation?.messagingAngle),
    targetAudience: pick(listing?.targetAudience, group?.targetAudience, variation?.targetAudience),
    keyFeatures:    pick(listing?.keyFeatures,    group?.keyFeatures,    variation?.keyFeatures),
    doList:         pick(listing?.doList,          group?.doList,         variation?.doList),
    dontList:       pick(listing?.dontList,        group?.dontList,       variation?.dontList),
  };

  return isGuidelinesPresent(result) ? result : null;
}

/** @deprecated Use resolveGuidelinesFieldByField */
export function resolveGuidelines(
  groupGuidelines: ContentGuidelines | null | undefined,
  variationDefaults: ContentGuidelines | null | undefined
): ContentGuidelines | null {
  return resolveGuidelinesFieldByField(null, groupGuidelines, variationDefaults);
}
```

---

## `/guidelines` Page

### Route
`/guidelines` (top-level, auth-required, editor+ role)

Client is selected via a query param: `/guidelines?client=AAC`

### Layout

```
┌─────────────────────────────────────────────────────┐
│  [Client selector dropdown]                          │
│                                                      │
│  Brand guidelines (baseline)          [View →]       │
│  "Brand guidelines text set on project creation…"   │
│                                                      │
│  ▶ Variation: Lavender Scent Line                   │
│    ├─ [Variation defaults form — 5 fields]          │
│    │                                                 │
│    ▶ Group: Lavender — 8oz                          │
│    │  ├─ [Group guidelines form — 5 fields]         │
│    │  ├─ ASIN B01234  "Lavender 8oz Single"         │
│    │  │   └─ [Listing guidelines form — 5 fields]   │
│    │  └─ ASIN B01235  "Lavender 8oz 3-Pack"         │
│    │       └─ [Listing guidelines form — 5 fields]  │
│    │                                                 │
│    ▶ Group: Lavender — 16oz                         │
│       └─ …                                          │
└─────────────────────────────────────────────────────┘
```

- All forms are inline, expanded on click (accordion at each level)
- Save on blur (same pattern as variation builder)
- Each field shows a faint inheritance hint when blank:
  `placeholder="Inheriting: <resolved value from lower tier>"`
- Variation defaults form: `PATCH /api/variations/[id]`
- Group guidelines form: `PATCH /api/variations/[id]/groups/[groupId]`
- Listing guidelines form: `PATCH /api/guidelines/listings/[productId]`

### Data loading

`GET /api/guidelines?clientId=AAC` returns:

```ts
{
  variations: Array<{
    id: string;
    name: string;
    contentGuidelines: ContentGuidelines | null;
    groups: Array<{
      id: string;
      name: string;
      contentGuidelines: ContentGuidelines | null;
      products: Array<{
        id: string;        // master.id
        asin: string;
        itemName: string | null;
        contentGuidelines: ContentGuidelines | null;
      }>;
    }>;
  }>;
}
```

Products in each group come from `variationGroupAssignments JOIN master` — only products formally assigned to the group appear.

---

## API Endpoints

### New: `GET /api/guidelines`

Query: `?clientId=string`

Loads: `variations` → `variation_groups` → `variationGroupAssignments JOIN master`

Returns the hierarchy shape above. Auth: session required, editor+ role.

### New: `PATCH /api/guidelines/listings/[productId]`

Body: `{ contentGuidelines: ContentGuidelines | null }`

Updates `master.content_guidelines` for the given `master.id`.

Validation: productId must belong to client visible to session user (check via `master.clientIdCode` against session).

### Existing (unchanged):
- `PATCH /api/variations/[id]` — variation defaults
- `PATCH /api/variations/[id]/groups/[groupId]` — group guidelines

---

## SEO Pipeline Update

### `s1_intake` load route (`src/app/api/seo/projects/[id]/load/route.ts`)

Currently returns `variation_guidelines: { defaults, groups[] }`.

Add per-ASIN listing guidelines to each ASIN row:

```ts
// For each seoAsin, fetch master.content_guidelines by asin
const masterRows = await db
  .select({ asin: master.asin, contentGuidelines: master.contentGuidelines })
  .from(master)
  .where(inArray(master.asin, asins.map(a => a.asin)));

const listingGuidelinesMap = Object.fromEntries(
  masterRows.map(r => [r.asin, r.contentGuidelines ?? null])
);
```

Return `listing_guidelines: ContentGuidelines | null` alongside each ASIN in the response.

### Generate caller (client-side, wherever `variationGuidelinesText` is built)

Current resolution: `resolveGuidelines(groupGl, variationDefaults)` → first non-empty tier.

New resolution per ASIN:
```ts
const resolved = resolveGuidelinesFieldByField(
  listingGuidelinesMap[asin.asin],       // listing tier
  groupGlForAsin,                         // group tier
  variation_guidelines.defaults           // variation tier
);
const variationGuidelinesText = resolved ? renderGuidelinesBlock(resolved) : "";
```

The rendered block heading remains `## Variation Content Guidelines` (no rename needed — content of block changes, label is fine).

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add `contentGuidelines` JSONB to `master` table |
| `drizzle/migrations/0063_listing_content_guidelines.sql` | `ALTER TABLE master ADD COLUMN content_guidelines jsonb` |
| `src/lib/variation-guidelines.ts` | Add `resolveGuidelinesFieldByField`; deprecate `resolveGuidelines` as alias |
| `src/app/api/guidelines/route.ts` | New GET endpoint — hierarchy data |
| `src/app/api/guidelines/listings/[productId]/route.ts` | New PATCH endpoint — listing guidelines |
| `src/app/guidelines/page.tsx` | New dedicated hub page |
| `src/proxy.ts` | Whitelist `/guidelines` and `/api/guidelines` |
| `src/app/api/seo/projects/[id]/load/route.ts` | Add listing guidelines to `s1_intake` ASIN rows |
| SEO generate caller (TBD path) | Switch to `resolveGuidelinesFieldByField` with listing tier |

---

## Implementation Plan

Tasks in dependency order. No task touches code before the previous task is validated.

### Task 1 — Resolver (pure logic, no DB)
Update `src/lib/variation-guidelines.ts`:
- Add `resolveGuidelinesFieldByField(listing, group, variation)`
- Deprecate `resolveGuidelines` as alias (wraps new function with `null` listing)
- Update unit tests: cover all 4×field scenarios (listing wins, group wins, variation wins, all null → null)

### Task 2 — Schema + migration SQL
- Add `contentGuidelines: jsonb("content_guidelines").$type<ContentGuidelines>()` to `master` table in `schema.ts`
- Write `drizzle/migrations/0063_listing_content_guidelines.sql`
- **User runs migration manually** — show SQL, wait for go-ahead

### Task 3 — Listing PATCH API
- Create `src/app/api/guidelines/listings/[productId]/route.ts`
- PATCH handler: validate auth + clientId ownership, update `master.content_guidelines`

### Task 4 — Guidelines GET API
- Create `src/app/api/guidelines/route.ts`
- GET handler: load full hierarchy (variations → groups → products) for a clientId

### Task 5 — `/guidelines` page
- Create `src/app/guidelines/page.tsx`
- Hierarchy tree UI: accordion per variation → group → listing rows
- Inline edit forms using existing `ContentGuidelinesForm` component (reuse from variation builder)
- Whitelist route in `src/proxy.ts`

### Task 6 — SEO load route update
- In `s1_intake` handler: load `master.content_guidelines` for all ASINs in the project
- Return `listing_guidelines` alongside each ASIN

### Task 7 — SEO generate caller update
- Locate where `variationGuidelinesText` is built (client-side generate caller)
- Switch from `resolveGuidelines` to `resolveGuidelinesFieldByField` with listing tier

### Task 8 — Tests
- New resolver unit tests (Task 1 expands this)
- Integration smoke test: create listing guidelines → verify they appear in resolved output

---

## Constraints (carried from v1)

- DEV DB IS PROD — migration reviewed and run with explicit user permission only
- No new DB tables (listing guidelines go in existing `master`)
- All `ContentGuidelines` fields are optional; null/empty = fall through to next tier
- Field-by-field cascade does NOT merge arrays (e.g. `keyFeatures`) — it picks the array from the highest set tier wholesale
- Variation builder UI is unchanged (group + variation forms stay in place)
