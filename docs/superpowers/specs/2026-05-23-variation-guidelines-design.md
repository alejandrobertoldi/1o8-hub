# Variation Content Guidelines — Design Spec

**Date:** 2026-05-23
**Status:** Approved

## Problem

The variation builder organises products into groups (by size, flavor, colour, etc.) and can create SEO projects per group. Today, SEO content generation has no group- or variation-specific messaging context — every ASIN in a project gets the same client-level brand guidelines. Groups that tell meaningfully different product stories (e.g. Lavender vs Citrus scent families) generate interchangeable copy.

## Goal

Allow editors to author structured content guidelines at the variation and group level, so SEO (and any future content pipeline) receives the tightest, most relevant context for each group of products.

---

## Data Model

### New JSONB type: `ContentGuidelines`

```ts
type ContentGuidelines = {
  keyFeatures:    string[];   // key selling points / product benefits
  messagingAngle: string;     // one-liner editorial angle
  targetAudience: string;     // who this is for
  doList:         string[];   // content dos
  dontList:       string[];   // content don'ts
};
```

All fields are optional within the JSONB — absent fields fall through to the next tier in the cascade.

### Schema changes (1 migration, 2 columns)

| Table             | Column                | Type   | Default |
|-------------------|-----------------------|--------|---------|
| `variations`      | `content_guidelines`  | JSONB  | null    |
| `variation_groups`| `content_guidelines`  | JSONB  | null    |

No new tables. No changes to `seoProjects`.

### Cascade precedence (full override, no merging)

```
Group guidelines (highest — used if any field is non-empty)
  ↑ falls back to
Variation defaults (used if group has nothing set)
  ↑ falls back to
Brand guidelines voice section (client baseline)
```

A tier is "present" when its `content_guidelines` JSONB is non-null and at least one field contains a non-empty string or non-empty array. Resolution happens at generation time — nothing is denormalised into `seoProjects`.

---

## Variation Builder UI

### Variation-level defaults block

Location: new collapsible card between the page header and the "Client Products Pool" section.

- Label: **"Content Guidelines — Variation Defaults"**
- Collapsed state: one-line summary of what's set, or "No defaults set — inheriting brand guidelines"
- Expanded state: inline form with five fields (see field specs below)
- Save: `PATCH /api/variations/[id]` with `{ contentGuidelines: {...} }` on blur

### Per-group guidelines panel

Location: each existing group collapsible card gains a two-tab inner row: **Products** (current) | **Guidelines**.

- Guidelines tab: same five-field form
- Empty fields show placeholder text: `"Inheriting from variation: <value>"` when a variation default exists, or `"Inheriting from brand guidelines"` otherwise
- Save: `PATCH /api/variations/[id]/groups/[groupId]` with `{ contentGuidelines: {...} }` on blur

### Field specs (shared between variation and group forms)

| Field            | Input type          | Placeholder                              |
|------------------|---------------------|------------------------------------------|
| `messagingAngle` | Single text input   | "e.g. Lead with sleep benefits"         |
| `targetAudience` | Single text input   | "e.g. Adults 25–45 seeking better sleep"|
| `keyFeatures`    | Chip/tag input      | "Add a feature, press Enter"            |
| `doList`         | Chip/tag input      | "Add a do, press Enter"                 |
| `dontList`       | Chip/tag input      | "Add a don't, press Enter"              |

---

## Brand Guidelines Page

A new **"Variation Guidelines"** card is added at the bottom of `/clients/[clientIdCode]/brand-guidelines`, after the existing voice/color/logo cards.

- Reads all variations for the client via a new API endpoint: `GET /api/clients/[clientIdCode]/brand-guidelines` (extend existing response) or a dedicated `GET /api/variations?clientId=...`
- Renders as an accordion: one row per variation, showing variation name + lock status
- Expanding a variation shows:
  - Variation defaults (or "None set")
  - Sub-rows per group, each showing effective guidelines with a "(group override)" or "(from variation)" label
- Entirely **read-only** — no editing here
- Each variation name is a link to `/variations/[id]` to edit

---

## SEO Integration

When Claude generates content for a product, the effective guidelines for that product's group are resolved at generation time and injected into the prompt as a structured block **after** the existing `brandGuidelines` section:

```
## Variation Content Guidelines
Messaging angle: Lead with sleep benefits, not fragrance
Target audience: Adults 25–45 seeking better sleep
Key features: calming scent, vegan formula, dermatologist tested
Do: Use sensory language, reference bedtime routine
Don't: Avoid price comparisons, don't mention competitors
```

Resolution logic (in `src/app/api/seo/projects/[id]/load/route.ts` or the generation route):

1. Load the SEO project's `variationId`
2. For each ASIN, determine its `variationGroup` membership
3. Load the group's `contentGuidelines` — if non-empty, use it; else load variation's `contentGuidelines`; else fall back to brand guidelines voice section
4. Render as the block above and append to the Claude prompt context

No new columns on `seoProjects`. The `variationId` FK already present is sufficient.

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add `contentGuidelines` JSONB to `variations` + `variationGroups` |
| `drizzle/migrations/` | New migration file (needs explicit user approval before running on prod) |
| `src/app/api/variations/[id]/route.ts` | Accept `contentGuidelines` in PATCH handler |
| `src/app/api/variations/[id]/groups/[groupId]/route.ts` | Accept `contentGuidelines` in PATCH handler |
| `src/app/variations/[id]/page.tsx` | Add variation defaults card + group guidelines tab |
| `src/components/clients/brand-guidelines-page.tsx` | Add Variation Guidelines card |
| `src/app/api/clients/[clientIdCode]/brand-guidelines/route.ts` | Include variation guidelines in response |
| `src/app/api/seo/projects/[id]/load/route.ts` | Resolve + inject effective guidelines into prompt context |

---

## Constraints

- DEV DB IS PROD — migration must be reviewed and run with explicit user permission
- No new DB tables
- No denormalisation into `seoProjects`
- All fields in `ContentGuidelines` are optional; null/empty = cascade to next tier
- The chip/tag input pattern should match existing UI patterns in the builder
