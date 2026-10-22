# A+2 Basic (BA+) Content Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second A+2 content tier — Basic A+ ("BA+", Amazon Standard modules) — to the existing schema-driven A+2 builder, alongside the current Premium A+ ("PA+") tier.

**Architecture:** Everything is driven by `src/lib/aplus2/module-specs.ts`. We add a `tier` field to the module-spec interface, tag the 19 existing specs `"PA+"`, add 8 new `basic_*` specs tagged `"BA+"`, and add 2 new item-data shapes. Two pure helpers (`moduleTypesForTier`, `maxModulesForTier`) make the picker filter and the module cap testable without DB/React. The picker, module-create cap, create API, new-set dialog, versions API, and set-list preview are wired to the existing `aplus2_sets.content_type` column. **Zero DB migration** — `content_type` is already `varchar(3)` default `"PA+"`, `module_type` is plain `text`, item `data` is `jsonb`, and the Zod item validator is data-driven.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM (postgres/Supabase), Zod, TanStack Query, shadcn/ui, Vitest + Testing Library (jsdom, `globals: true`).

**Source spec:** `docs/superpowers/specs/2026-06-02-aplus2-basic-content-type-design.md`

---

## Pre-flight notes (read once)

- **Run a single test file:** `npx vitest run tests/lib/aplus2/<name>.test.ts`
- **Run the whole suite:** `npm run test`
- **Build (type-check):** `npm run build` — adding a required `tier` field to `Aplus2ModuleSpec` makes TypeScript fail until all 19 existing specs carry it, so Task 1 must add the field and tag all 19 in the same commit.
- **Quote bracketed paths** in every shell command (e.g. `"src/app/api/aplus2/versions/[versionId]/modules/route.ts"`). Fish/zsh treat `[...]` as a glob otherwise.
- **NEVER `git push`** — Vercel auto-deploys `main`. Stage explicit files only (never `git add .`/`-A`). Use a HEREDOC for the commit trailer.
- **Commit trailer** — every commit ends with:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **Vitest globals are on** — `describe/it/expect` are global, but the test files below import them explicitly from `vitest` (works either way).

### Gap resolutions baked into this plan (per spec approval)

- **Q4 (image min + aspect):** `desktopSize` *already* drives both the upload-box aspect ratio (`aplus2-image-slot.tsx:41` → `containerAspect={spec.desktopSize}` → CSS `aspectRatio` at `:114`) and the displayed min-size label (`:113`). So setting each BA+ slot's `desktopSize` to the Amazon minimum **is** the "minimum + aspect reference" rule — **no interface field and no new code** are needed for the reference itself. **Hard rejection** of undersized/wrong-aspect uploads is genuinely net-new (it never existed for PA+ either) and is isolated in **Task 10, marked OPTIONAL/deferrable**, gated so it cannot break existing PA+ uploads.
- **Finding 2 (canvas width):** `Aplus2ContentPreview` is mounted **only** on the set-list page (`src/app/aplus2/[clientIdCode]/page.tsx:182,186`) for thumbnails — the editor has no shared preview canvas. There is no existing width constraint, so `canvasWidth` defaults to `1464` (visual no-op for PA+) and is passed `970` for BA+ sets. Making it tier-aware requires `content_type` on the set-list API too (Task 7).

---

## File Structure

**Modify:**
- `src/lib/aplus2/module-specs.ts` — `tier` field + 2 item-data types + tag 19 PA+ + 8 `basic_*` specs + 2 helpers (Tasks 1, 2)
- `src/app/api/aplus2/versions/[versionId]/modules/route.ts` — tier-aware cap (Task 4)
- `src/app/api/aplus2/sets/[setId]/versions/route.ts` — surface `contentType` in GET (Task 5)
- `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/page.tsx` — `SetDto.contentType`, pass `set` to picker, tier-aware disable (Task 6)
- `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-add-module.tsx` — tier filter (Task 6)
- `src/app/api/aplus2/sets/route.ts` — `contentType` in create schema/insert/slug + list GET (Task 7)
- `src/app/aplus2/[clientIdCode]/_components/new-set-dialog.tsx` — tier selector (Task 8)
- `src/app/aplus2/[clientIdCode]/page.tsx` — pass `canvasWidth` per tier (Task 9)
- `src/app/aplus2/[clientIdCode]/_components/aplus2-content-preview.tsx` — `canvasWidth` prop (Task 9)
- `src/app/api/aplus2/versions/[versionId]/assets/route.ts` — OPTIONAL min/aspect enforcement (Task 10)

**Create (tests):**
- `tests/lib/aplus2/module-specs.test.ts` (Tasks 1, 2, 6 helper)
- `tests/lib/aplus2/zod-schemas.test.ts` (Task 3)
- `tests/lib/aplus2/cap.test.ts` (Task 4 helper)
- `tests/components/aplus2-content-preview.test.tsx` (Task 9)

**No change (verified):** `src/lib/aplus2/zod-schemas.ts` (data-driven — Task 3 proves it), DB schema / migrations (zero migration).

---

## Task 1: Spec interface `tier` field + 2 item-data types + tag 19 PA+ + helpers

**Files:**
- Modify: `src/lib/aplus2/module-specs.ts` (`:11-31`, `:37-60`, `:132-142`, `:163-521`, append helpers at EOF)
- Test: `tests/lib/aplus2/module-specs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/aplus2/module-specs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  APLUS2_MODULE_TYPES,
  APLUS2_MODULE_SPECS,
  moduleTypesForTier,
  maxModulesForTier,
} from "@/lib/aplus2/module-specs";

const PREMIUM_TYPES = [
  "background_image_text", "comparison_table_1", "comparison_table_2",
  "comparison_table_3", "dual_images_text", "four_images_text", "full_image",
  "full_video", "hotspots_1", "hotspots_2", "navigation_carousel", "qa",
  "regimen_carousel", "simple_image_carousel", "single_image_text",
  "technical_specifications", "text", "video_image_carousel", "video_text",
] as const;

describe("module-specs tier field", () => {
  it("tags all 19 existing specs as PA+", () => {
    for (const t of PREMIUM_TYPES) {
      expect(APLUS2_MODULE_SPECS[t].tier, t).toBe("PA+");
    }
  });

  it("every spec has a tier of PA+ or BA+", () => {
    for (const t of APLUS2_MODULE_TYPES) {
      expect(["PA+", "BA+"]).toContain(APLUS2_MODULE_SPECS[t].tier);
    }
  });
});

describe("moduleTypesForTier", () => {
  it("returns exactly the 19 premium types for PA+", () => {
    expect(moduleTypesForTier("PA+").sort()).toEqual([...PREMIUM_TYPES].sort());
  });
});

describe("maxModulesForTier", () => {
  it("BA+ allows 5, PA+ allows 7, unknown defaults to 7", () => {
    expect(maxModulesForTier("BA+")).toBe(5);
    expect(maxModulesForTier("PA+")).toBe(7);
    expect(maxModulesForTier("PA+")).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/aplus2/module-specs.test.ts`
Expected: FAIL — `moduleTypesForTier`/`maxModulesForTier` are not exported; `tier` is `undefined`.

- [ ] **Step 3: Add the `tier` field to the interface**

In `src/lib/aplus2/module-specs.ts`, add `tier` to `Aplus2ModuleSpec` (currently `:132-142`):

```ts
export interface Aplus2ModuleSpec {
  type: Aplus2ModuleType;
  /** Content tier this module belongs to. Drives the add-module picker filter. */
  tier: "PA+" | "BA+";
  label: string;
  description: string;
  textFields: Aplus2TextFieldSpec[];
  imageSlots: Aplus2ImageSlotSpec[];
  repeatableGroup?: Aplus2RepeatableGroupSpec;
  video?: Aplus2VideoSpec;
  layoutControls?: Aplus2LayoutControl[];
  layout?: Aplus2LayoutItem[];
}
```

- [ ] **Step 4: Add the 2 new item-data types**

Add to `Aplus2ItemDataType` (currently `:37-47`) — append before the closing line:

```ts
export type Aplus2ItemDataType =
  | "qa"
  | "comparison_row_1"
  | "comparison_row_2"
  | "comparison_row_3"
  | "carousel_slide"
  | "hotspot"
  | "regimen_step"
  | "tech_spec_row"
  | "image_caption"
  | "panel"
  | "highlight_bullet"
  | "basic_comparison_row";
```

Add to the `Aplus2ItemData` discriminated union (currently `:50-60`) — append before the closing `;`:

```ts
  | { type: "highlight_bullet"; text: string }
  | { type: "basic_comparison_row"; metric: string; metric_type: string;
      value_1: string; value_2: string; value_3: string;
      value_4: string; value_5: string; value_6: string };
```

- [ ] **Step 5: Tag all 19 existing specs with `tier: "PA+"`**

In `APLUS2_MODULE_SPECS` (`:163-521`), add `tier: "PA+",` as the line directly after each `type: "...",`. All 19 must be tagged or the build fails. Example for the first one:

```ts
  background_image_text: {
    type: "background_image_text",
    tier: "PA+",
    label: "Premium Background Image with Text",
    // ...unchanged...
  },
```

Repeat for: `background_image_text`, `comparison_table_1`, `comparison_table_2`, `comparison_table_3`, `dual_images_text`, `four_images_text`, `full_image`, `full_video`, `hotspots_1`, `hotspots_2`, `navigation_carousel`, `qa`, `regimen_carousel`, `simple_image_carousel`, `single_image_text`, `technical_specifications`, `text`, `video_image_carousel`, `video_text`.

- [ ] **Step 6: Add the two helpers at the end of the file**

Append after the `getAplus2ModuleLayout` function (or at EOF, after `APLUS2_MODULE_SPECS`):

```ts
/** All module types belonging to a tier — drives the add-module picker. */
export function moduleTypesForTier(tier: "PA+" | "BA+"): Aplus2ModuleType[] {
  return APLUS2_MODULE_TYPES.filter((t) => APLUS2_MODULE_SPECS[t].tier === tier);
}

/** Hard module cap per tier. BA+ = 5 (Amazon Standard), PA+ = 7. */
export function maxModulesForTier(contentType: string): number {
  return contentType === "BA+" ? 5 : 7;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/lib/aplus2/module-specs.test.ts`
Expected: PASS (the BA+ assertion in `moduleTypesForTier` is not yet exercised — Task 2 adds the 8 specs).

- [ ] **Step 8: Type-check**

Run: `npm run build`
Expected: compiles (all 19 specs carry `tier`).

- [ ] **Step 9: Commit**

```bash
git add src/lib/aplus2/module-specs.ts tests/lib/aplus2/module-specs.test.ts
git commit -m "$(cat <<'EOF'
feat(aplus2): add tier field + BA+ item-data types + tier helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add the 8 `basic_*` module specs

**Files:**
- Modify: `src/lib/aplus2/module-specs.ts` (`APLUS2_MODULE_TYPES` `:11-31`; `APLUS2_MODULE_SPECS` — append 8 entries)
- Test: `tests/lib/aplus2/module-specs.test.ts` (extend)

- [ ] **Step 1: Write the failing test (append to the existing file)**

Append to `tests/lib/aplus2/module-specs.test.ts`:

```ts
const BASIC_TYPES = [
  "basic_text", "basic_header_image_text", "basic_single_image_text",
  "basic_three_image_text", "basic_four_image_text",
  "basic_single_image_highlights", "basic_technical_specifications",
  "basic_comparison_table",
] as const;

describe("basic (BA+) module specs", () => {
  it("registers all 8 basic types in the type union", () => {
    for (const t of BASIC_TYPES) expect(APLUS2_MODULE_TYPES).toContain(t);
  });

  it("every basic spec is tier BA+ and carries no video block", () => {
    for (const t of BASIC_TYPES) {
      const spec = APLUS2_MODULE_SPECS[t];
      expect(spec, t).toBeDefined();
      expect(spec.tier, t).toBe("BA+");
      expect(spec.video, t).toBeUndefined();
    }
  });

  it("moduleTypesForTier('BA+') returns exactly the 8 basic types", () => {
    expect(moduleTypesForTier("BA+").sort()).toEqual([...BASIC_TYPES].sort());
  });

  it("image/repeatable shapes match the spec", () => {
    expect(APLUS2_MODULE_SPECS.basic_text.imageSlots).toHaveLength(0);
    expect(APLUS2_MODULE_SPECS.basic_three_image_text.imageSlots).toHaveLength(3);
    expect(APLUS2_MODULE_SPECS.basic_four_image_text.imageSlots).toHaveLength(4);
    expect(APLUS2_MODULE_SPECS.basic_comparison_table.imageSlots).toHaveLength(6);
    expect(APLUS2_MODULE_SPECS.basic_single_image_text.layoutControls?.[0].key).toBe("text_position");
    expect(APLUS2_MODULE_SPECS.basic_single_image_highlights.repeatableGroup?.itemDataType).toBe("highlight_bullet");
    expect(APLUS2_MODULE_SPECS.basic_comparison_table.repeatableGroup?.itemDataType).toBe("basic_comparison_row");
    expect(APLUS2_MODULE_SPECS.basic_technical_specifications.repeatableGroup?.itemDataType).toBe("tech_spec_row");
    expect(APLUS2_MODULE_SPECS.basic_header_image_text.imageSlots[0].desktopSize).toEqual({ width: 970, height: 600 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/aplus2/module-specs.test.ts`
Expected: FAIL — `basic_*` keys not in the union / specs undefined.

- [ ] **Step 3: Add the 8 keys to `APLUS2_MODULE_TYPES`**

In `APLUS2_MODULE_TYPES` (`:11-31`), append the 8 keys before the closing `] as const;`:

```ts
  "basic_text",
  "basic_header_image_text",
  "basic_single_image_text",
  "basic_three_image_text",
  "basic_four_image_text",
  "basic_single_image_highlights",
  "basic_technical_specifications",
  "basic_comparison_table",
```

- [ ] **Step 4: Add the 8 specs to `APLUS2_MODULE_SPECS`**

Insert before the closing `};` of `APLUS2_MODULE_SPECS` (`:521`):

```ts
  basic_text: {
    type: "basic_text",
    tier: "BA+",
    label: "Basic All Text",
    description: "Standard All Text — headline (optional) with long-form body text",
    textFields: [
      { key: "headlineText", label: "Headline (optional)", maxLength: 160 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 6, maxLength: 6000 },
    ],
    imageSlots: [],
  },

  basic_header_image_text: {
    type: "basic_header_image_text",
    tier: "BA+",
    label: "Basic Image Header with Text",
    description: "Standard Image Header With Text — banner image above headline + body",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 160 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 3, maxLength: 500 },
    ],
    imageSlots: [
      { key: "header_image", label: "Header image", desktopSize: { width: 970, height: 600 } },
    ],
  },

  basic_single_image_text: {
    type: "basic_single_image_text",
    tier: "BA+",
    label: "Basic Single Image with Text",
    description: "Standard Single Left/Right Image — square image beside headline + body",
    textFields: [
      { key: "headlineText", label: "Headline (optional)", maxLength: 160 },
      { key: "bodyText", label: "Body text (optional)", multiline: true, rows: 4, maxLength: 1000 },
    ],
    imageSlots: [
      { key: "main_image", label: "Image", desktopSize: { width: 300, height: 300 } },
    ],
    layoutControls: [
      { key: "text_position", options: ["left", "right"] },
    ],
  },

  basic_three_image_text: {
    type: "basic_three_image_text",
    tier: "BA+",
    label: "Basic Three Images and Text",
    description: "Standard Three Images & Text — three square images, each with caption + body",
    textFields: [
      { key: "headlineText", label: "Module headline", maxLength: 160 },
    ],
    imageSlots: [
      { key: "image_1", label: "Image 1", desktopSize: { width: 300, height: 300 } },
      { key: "image_2", label: "Image 2", desktopSize: { width: 300, height: 300 } },
      { key: "image_3", label: "Image 3", desktopSize: { width: 300, height: 300 } },
    ],
    repeatableGroup: {
      label: "Image Captions", itemLabel: "Caption", minItems: 3, maxItems: 3, defaultCount: 3,
      itemDataType: "image_caption",
      fields: [
        { key: "caption", label: "Image Headline", maxLength: 160 },
        { key: "body", label: "Body Text", multiline: true, rows: 2, maxLength: 1000 },
      ],
    },
  },

  basic_four_image_text: {
    type: "basic_four_image_text",
    tier: "BA+",
    label: "Basic Four Images and Text",
    description: "Standard Four Images & Text — four square images, each with caption + body",
    textFields: [
      { key: "headlineText", label: "Module headline", maxLength: 160 },
    ],
    imageSlots: [
      { key: "image_1", label: "Image 1", desktopSize: { width: 200, height: 200 } },
      { key: "image_2", label: "Image 2", desktopSize: { width: 200, height: 200 } },
      { key: "image_3", label: "Image 3", desktopSize: { width: 200, height: 200 } },
      { key: "image_4", label: "Image 4", desktopSize: { width: 200, height: 200 } },
    ],
    repeatableGroup: {
      label: "Image Captions", itemLabel: "Caption", minItems: 4, maxItems: 4, defaultCount: 4,
      itemDataType: "image_caption",
      fields: [
        { key: "caption", label: "Image Headline", maxLength: 160 },
        { key: "body", label: "Image Body Text", multiline: true, rows: 2, maxLength: 1000 },
      ],
    },
  },

  basic_single_image_highlights: {
    type: "basic_single_image_highlights",
    tier: "BA+",
    label: "Basic Single Image with Highlights",
    description: "Standard Single Image & Highlights — square image with intro text and bullet highlights",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 160 },
      { key: "subheadlineText", label: "Subheadline", maxLength: 50 },
      { key: "bodyText", label: "Intro body text", multiline: true, rows: 4, maxLength: 1000 },
    ],
    imageSlots: [
      { key: "main_image", label: "Image", desktopSize: { width: 300, height: 300 } },
    ],
    repeatableGroup: {
      label: "Highlights", itemLabel: "Highlight", minItems: 1, maxItems: 8, defaultCount: 3,
      itemDataType: "highlight_bullet",
      fields: [
        { key: "text", label: "Highlight", maxLength: 100 },
      ],
    },
  },

  basic_technical_specifications: {
    type: "basic_technical_specifications",
    tier: "BA+",
    label: "Basic Technical Specifications",
    description: "Standard Technical Specifications — label/value spec rows",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 160 },
    ],
    imageSlots: [],
    repeatableGroup: {
      label: "Specifications", itemLabel: "Spec row", minItems: 4, maxItems: 16, defaultCount: 4,
      itemDataType: "tech_spec_row",
      fields: [
        { key: "spec_label", label: "Spec Name", maxLength: 30 },
        { key: "spec_value", label: "Spec Definition", multiline: true, rows: 3, maxLength: 500 },
      ],
    },
  },

  basic_comparison_table: {
    type: "basic_comparison_table",
    tier: "BA+",
    label: "Basic Comparison Chart",
    description: "Standard Comparison Chart — 2 to 6 product columns with metric rows",
    textFields: [
      { key: "headlineText", label: "Title", maxLength: 80 },
    ],
    imageSlots: [
      { key: "product_1", label: "Product 1", desktopSize: { width: 150, height: 300 } },
      { key: "product_2", label: "Product 2", desktopSize: { width: 150, height: 300 } },
      { key: "product_3", label: "Product 3", desktopSize: { width: 150, height: 300 } },
      { key: "product_4", label: "Product 4", desktopSize: { width: 150, height: 300 } },
      { key: "product_5", label: "Product 5", desktopSize: { width: 150, height: 300 } },
      { key: "product_6", label: "Product 6", desktopSize: { width: 150, height: 300 } },
    ],
    repeatableGroup: {
      label: "Comparison Metrics", itemLabel: "Metric", minItems: 1, maxItems: 10, defaultCount: 3,
      itemDataType: "basic_comparison_row",
      fields: [
        { key: "metric", label: "Metric", maxLength: 80 },
        { key: "metric_type", label: "Type", hint: "checkbox or text" },
        { key: "value_1", label: "Product 1 Value", maxLength: 80 },
        { key: "value_2", label: "Product 2 Value", maxLength: 80 },
        { key: "value_3", label: "Product 3 Value", maxLength: 80 },
        { key: "value_4", label: "Product 4 Value", maxLength: 80 },
        { key: "value_5", label: "Product 5 Value", maxLength: 80 },
        { key: "value_6", label: "Product 6 Value", maxLength: 80 },
      ],
    },
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/aplus2/module-specs.test.ts`
Expected: PASS (all describe blocks, including `moduleTypesForTier('BA+')`).

- [ ] **Step 6: Type-check**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 7: Commit**

```bash
git add src/lib/aplus2/module-specs.ts tests/lib/aplus2/module-specs.test.ts
git commit -m "$(cat <<'EOF'
feat(aplus2): add 8 basic_* (BA+) module specs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Prove Zod item-data validation needs no edits

The Zod validator `buildItemDataSchema` (`src/lib/aplus2/zod-schemas.ts:129-138`) builds each item schema from `spec.repeatableGroup.fields` + `itemDataType` at runtime. This task is a **characterization test** — it proves the new types validate with **no code change** to `zod-schemas.ts`. If a test fails, the fix is in the spec (Task 2), not in `zod-schemas.ts`.

**Files:**
- Create: `tests/lib/aplus2/zod-schemas.test.ts`
- Modify: `src/lib/aplus2/zod-schemas.ts` — **expected: none.**

- [ ] **Step 1: Write the test**

Create `tests/lib/aplus2/zod-schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateItemData, defaultItemDataFor } from "@/lib/aplus2/zod-schemas";

describe("highlight_bullet item-data (basic_single_image_highlights)", () => {
  it("accepts a valid bullet", () => {
    const r = validateItemData("basic_single_image_highlights", { type: "highlight_bullet", text: "Waterproof" });
    expect(r.ok).toBe(true);
  });
  it("rejects an over-length bullet (max 100)", () => {
    const r = validateItemData("basic_single_image_highlights", { type: "highlight_bullet", text: "x".repeat(101) });
    expect(r.ok).toBe(false);
  });
  it("rejects an unknown extra field (strictObject)", () => {
    const r = validateItemData("basic_single_image_highlights", { type: "highlight_bullet", text: "ok", bogus: "x" });
    expect(r.ok).toBe(false);
  });
  it("seeds an empty default of the right shape", () => {
    expect(defaultItemDataFor("basic_single_image_highlights")).toEqual({ type: "highlight_bullet", text: "" });
  });
});

describe("basic_comparison_row item-data (basic_comparison_table)", () => {
  it("accepts a valid row", () => {
    const r = validateItemData("basic_comparison_table", {
      type: "basic_comparison_row", metric: "Weight", metric_type: "text",
      value_1: "1kg", value_2: "2kg", value_3: "", value_4: "", value_5: "", value_6: "",
    });
    expect(r.ok).toBe(true);
  });
  it("rejects an over-length value cell (max 80)", () => {
    const r = validateItemData("basic_comparison_table", {
      type: "basic_comparison_row", metric: "Weight", metric_type: "text",
      value_1: "x".repeat(81), value_2: "", value_3: "", value_4: "", value_5: "", value_6: "",
    });
    expect(r.ok).toBe(false);
  });
  it("seeds an empty default with every value column", () => {
    expect(defaultItemDataFor("basic_comparison_table")).toEqual({
      type: "basic_comparison_row", metric: "", metric_type: "",
      value_1: "", value_2: "", value_3: "", value_4: "", value_5: "", value_6: "",
    });
  });
});

describe("reused item-data types still validate", () => {
  it("image_caption on basic_three_image_text", () => {
    const r = validateItemData("basic_three_image_text", { type: "image_caption", caption: "A", body: "B" });
    expect(r.ok).toBe(true);
  });
  it("tech_spec_row on basic_technical_specifications", () => {
    const r = validateItemData("basic_technical_specifications", { type: "tech_spec_row", spec_label: "Material", spec_value: "Steel" });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/lib/aplus2/zod-schemas.test.ts`
Expected: PASS with **no edits** to `zod-schemas.ts`. (If `validateItemData` returns `{ ok: false, error: "module type ... has no repeatable items" }`, Task 2's `repeatableGroup` for that type is missing — fix the spec.)

- [ ] **Step 3: Commit**

```bash
git add tests/lib/aplus2/zod-schemas.test.ts
git commit -m "$(cat <<'EOF'
test(aplus2): characterize BA+ item-data validation (data-driven, no zod edits)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Tier-aware module cap (hard gate)

**Files:**
- Modify: `src/app/api/aplus2/versions/[versionId]/modules/route.ts` (`:14-16` imports, `:42-57` join + cap, `:93` error code)
- Test: `tests/lib/aplus2/cap.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/aplus2/cap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { maxModulesForTier } from "@/lib/aplus2/module-specs";

describe("module cap gate logic", () => {
  it("BA+ rejects a 6th module, allows the 5th", () => {
    const cap = maxModulesForTier("BA+");
    expect(5 > cap).toBe(false); // adding 5th: nextPos=5
    expect(6 > cap).toBe(true);  // adding 6th: nextPos=6 → rejected
  });
  it("PA+ rejects an 8th module, allows the 7th", () => {
    const cap = maxModulesForTier("PA+");
    expect(7 > cap).toBe(false);
    expect(8 > cap).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (helper already exists from Task 1)**

Run: `npx vitest run tests/lib/aplus2/cap.test.ts`
Expected: PASS — this locks the gate arithmetic. The route change below adopts the helper.

- [ ] **Step 3: Update the route imports**

In `src/app/api/aplus2/versions/[versionId]/modules/route.ts`:
- Add `aplus2Sets` to the schema import (`:14`):
```ts
import { aplus2ModuleItems, aplus2Modules, aplus2Sets, aplus2Versions } from "@/lib/db/schema";
```
- Add `maxModulesForTier` to the module-specs import (`:15`):
```ts
import { APLUS2_MODULE_SPECS, APLUS2_MODULE_TYPES, maxModulesForTier, type Aplus2ModuleType } from "@/lib/aplus2/module-specs";
```

- [ ] **Step 4: Join the set to read the tier**

Replace the version lookup (`:42-47`):

```ts
  const [version] = await db
    .select({ id: aplus2Versions.id, contentType: aplus2Sets.contentType })
    .from(aplus2Versions)
    .innerJoin(aplus2Sets, eq(aplus2Sets.id, aplus2Versions.setId))
    .where(eq(aplus2Versions.id, versionId))
    .limit(1);
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
```

- [ ] **Step 5: Replace the hardcoded cap (`:54-57`)**

```ts
    const nextPos = (maxRow?.maxPos ?? 0) + 1;
    const maxModules = maxModulesForTier(version.contentType);
    if (nextPos > maxModules) {
      throw new Error(`This tier allows ${maxModules} modules`);
    }
```

- [ ] **Step 6: Fix the error-code match (`:93`)**

The 409 branch matched the old `"7 modules"` string. Replace:

```ts
    const code = result.error.includes("allows") && result.error.includes("modules") ? 409 : 500;
```

- [ ] **Step 7: Type-check + run tests**

Run: `npm run build && npx vitest run tests/lib/aplus2/cap.test.ts`
Expected: compiles; test PASS.

- [ ] **Step 8: Commit**

```bash
git add "src/app/api/aplus2/versions/[versionId]/modules/route.ts" tests/lib/aplus2/cap.test.ts
git commit -m "$(cat <<'EOF'
feat(aplus2): tier-aware module cap (BA+ 5, PA+ 7) at module-create

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Surface `contentType` through the versions GET API

**Files:**
- Modify: `src/app/api/aplus2/sets/[setId]/versions/route.ts` (`:90-105` GET select)

- [ ] **Step 1: Add `contentType` to the set SELECT**

In the GET handler's `db.select({...})` (`:90-105`), add the field (e.g. after `marketplace:`):

```ts
      marketplace: aplus2Sets.marketplace,
      contentType: aplus2Sets.contentType,
```

(`aplus2Sets` is already imported at `:19`.)

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: compiles. The GET response's `set` object now includes `contentType`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/aplus2/sets/[setId]/versions/route.ts"
git commit -m "$(cat <<'EOF'
feat(aplus2): expose set contentType in versions GET payload

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Tier-filtered add-module picker + tier-aware disable

**Files:**
- Modify: `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/page.tsx` (`SetDto` `:17-22`; `<Aplus2AddModule>` mount `:228`; import `:15`)
- Modify: `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-add-module.tsx` (`:9` import, `:11` signature, `:41` filter)
- Test: covered by `tests/lib/aplus2/module-specs.test.ts` `moduleTypesForTier` assertions (Tasks 1-2).

- [ ] **Step 1: Add `contentType` to `SetDto`**

In `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/page.tsx`, extend `SetDto` (`:17-22`):

```ts
type SetDto = {
  id: string; clientIdCode: string; scopeType: "ASIN" | "PARENT"; scopeIdentifier: string;
  marketplace: string; contentType: "PA+" | "BA+"; parentAsin: string | null; coveredAsins: string[] | null;
  productId: string; asin: string | null; sku: string | null; itemName: string | null;
  summarizedTitle: string | null;
};
```

- [ ] **Step 2: Make `Aplus2AddModule` tier-aware**

In `aplus2-add-module.tsx`:
- Import the helper (`:9`):
```ts
import { APLUS2_MODULE_SPECS, moduleTypesForTier } from "@/lib/aplus2/module-specs";
```
  (Drop `APLUS2_MODULE_TYPES` and the `type Aplus2ModuleType` import only if unused — `Aplus2ModuleType` is still referenced in `mutationFn`, so keep it:)
```ts
import { APLUS2_MODULE_SPECS, moduleTypesForTier, type Aplus2ModuleType } from "@/lib/aplus2/module-specs";
```
- Change the signature (`:11`):
```ts
export function Aplus2AddModule({ versionId, contentType, disabled }: { versionId: string; contentType: "PA+" | "BA+"; disabled?: boolean }) {
```
- Replace the map source (`:41`):
```ts
              {moduleTypesForTier(contentType).map((t) => (
```

- [ ] **Step 3: Pass tier + tier-aware disable at the mount**

In `page.tsx`, the mount is inside a `.map` over versions where `set` is in scope from the fetched payload (`fetchSetSnapshot` → `{ set, versions }`). Replace `:228`:

```tsx
                <Aplus2AddModule
                  versionId={v.id}
                  contentType={set.contentType}
                  disabled={v.modules.length >= maxModulesForTier(set.contentType)}
                />
```

Add the helper import at the top of `page.tsx` (next to the existing `Aplus2AddModule` import `:15`):

```ts
import { maxModulesForTier } from "@/lib/aplus2/module-specs";
```

> **Note for the executor:** confirm the variable holding the fetched set is named `set` in this component's render scope (the fetch returns `{ set: SetDto; versions: VersionDto[] }` at `:35`). If it is destructured under another name (e.g. `data.set`), use that. Do not invent a new fetch.

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: compiles. (The `moduleTypesForTier('PA+')` / `('BA+')` correctness is already covered by Task 1-2 tests.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/page.tsx" "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-add-module.tsx"
git commit -m "$(cat <<'EOF'
feat(aplus2): tier-filter add-module picker + tier-aware add disable

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Create API — `contentType` in schema, slug, insert, and list GET

**Files:**
- Modify: `src/app/api/aplus2/sets/route.ts` (`:48-61` list types, `:62-100` list query/map, `:106-111` createSchema, `:198-203` slug, `:218-226` insert)

- [ ] **Step 1: Add `contentType` to `createSchema` (`:106-111`)**

```ts
const createSchema = z.strictObject({
  clientIdCode: z.string().min(1).max(100),
  productId: z.string().uuid(),
  scopeType: z.enum(["ASIN", "PARENT"]),
  marketplace: z.string().min(2).max(5),
  contentType: z.enum(["PA+", "BA+"]).default("PA+"),
});
```

- [ ] **Step 2: Use `body.contentType` for the Drive slug (`:198-203`)**

```ts
  const slug = aplus2VersionSlug({
    clientIdCode: body.clientIdCode,
    scopeIdentifier,
    contentType: body.contentType,
    versionNumber: 1,
  });
```

- [ ] **Step 3: Persist `contentType` in the set insert (`:218-226`)**

```ts
        .values({
          clientIdCode: body.clientIdCode,
          productId: body.productId,
          scopeType: body.scopeType,
          scopeIdentifier,
          marketplace,
          contentType: body.contentType,
          parentAsin,
          coveredAsins,
        })
```

- [ ] **Step 4: Add `content_type` to the list GET (so set-list thumbnails can be tier-aware — Task 9)**

In the GET raw SQL (`:62-82`), add `s.content_type` to the SELECT and the result type, and map it:
- Result type (`:48-61`): add `content_type: string;`
- SQL select list (`:64`): add `s.content_type,` after `s.marketplace,`
- Mapped row (`:86-100`): add `contentType: r.content_type,`

```ts
  const rows = await db.execute<{
    set_id: string;
    scope_type: string;
    scope_identifier: string;
    marketplace: string;
    content_type: string;
    parent_asin: string | null;
    covered_asins: string[] | null;
    product_id: string;
    asin: string | null;
    sku: string | null;
    item_name: string | null;
    version_count: number;
    latest_status: string | null;
    latest_version_number: number | null;
  }>(sql`
    SELECT
      s.id AS set_id, s.scope_type, s.scope_identifier, s.marketplace, s.content_type,
      s.parent_asin, s.covered_asins, s.product_id,
      m.asin, m.sku, m.item_name,
      COALESCE(vc.cnt, 0)::int AS version_count,
      lv.status AS latest_status,
      lv.version_number AS latest_version_number
    FROM ${aplus2Sets} s
    JOIN ${master} m ON m.id = s.product_id
    LEFT JOIN (
      SELECT set_id, COUNT(*)::int AS cnt
      FROM ${aplus2Versions} GROUP BY set_id
    ) vc ON vc.set_id = s.id
    LEFT JOIN LATERAL (
      SELECT status, version_number FROM ${aplus2Versions}
      WHERE set_id = s.id ORDER BY version_number DESC LIMIT 1
    ) lv ON true
    WHERE s.client_id_code = ${clientIdCode}
    ORDER BY s.marketplace ASC, s.scope_identifier ASC
  `);
```

And in the `sets: rows.map(...)` block, add:
```ts
      marketplace: r.marketplace,
      contentType: r.content_type,
```

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: compiles. (`contentType` is a known column on `aplus2Sets` — `schema.ts:1833`.)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/aplus2/sets/route.ts
git commit -m "$(cat <<'EOF'
feat(aplus2): accept + persist contentType on set create; expose in list

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: New-set dialog tier selector

**Files:**
- Modify: `src/app/aplus2/[clientIdCode]/_components/new-set-dialog.tsx` (`:35-36` state, `:62-69` reset, `:73-77` POST body, `:139-149` UI)

- [ ] **Step 1: Add tier state (`:36`, after `marketplace`)**

```ts
  const [marketplace, setMarketplace] = useState<string>("");
  const [contentType, setContentType] = useState<"PA+" | "BA+">("PA+");
```

- [ ] **Step 2: Reset on close (`:62-69`)**

```ts
  useEffect(() => {
    if (!open) {
      setSearch("");
      setProductId(null);
      setScopeType("ASIN");
      setMarketplace("");
      setContentType("PA+");
    }
  }, [open]);
```

- [ ] **Step 3: Include `contentType` in the POST body (`:76`)**

```ts
        body: JSON.stringify({ clientIdCode, productId, scopeType, marketplace, contentType }),
```

- [ ] **Step 4: Add the tier `Select` after the Marketplace block (`:149`)**

Insert immediately after the closing `</div>` of the Marketplace field, inside the `space-y-4` container:

```tsx
          <div>
            <Label className="text-xs">Content type</Label>
            <Select value={contentType} onValueChange={(v) => setContentType(v as "PA+" | "BA+")}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PA+">Premium A+ (PA+)</SelectItem>
                <SelectItem value="BA+">Basic A+ (BA+)</SelectItem>
              </SelectContent>
            </Select>
          </div>
```

(`Select*` and `Label` are already imported at `:7-8`.)

- [ ] **Step 5: Manual verification (dev server)**

Run: `PORT=3000 npm run dev`, open `/aplus2/<clientIdCode>`, click **New A+ Set**, confirm the **Content type** selector shows PA+/BA+ and defaults to PA+. Create a BA+ set → it opens the editor empty. (No automated test — UI wiring; `createSchema` validation is covered by Task 7's type check.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/aplus2/[clientIdCode]/_components/new-set-dialog.tsx"
git commit -m "$(cat <<'EOF'
feat(aplus2): tier selector (PA+/BA+) in new-set dialog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Tier-aware ~970px preview canvas

**Files:**
- Modify: `src/app/aplus2/[clientIdCode]/_components/aplus2-content-preview.tsx` (`:192-214` — add `canvasWidth` prop, restructure root)
- Modify: `src/app/aplus2/[clientIdCode]/page.tsx` (`SetRow` type + `:182,186` mounts)
- Test: `tests/components/aplus2-content-preview.test.tsx`

- [ ] **Step 1: Write the failing render test**

Create `tests/components/aplus2-content-preview.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Aplus2ContentPreview } from "@/app/aplus2/[clientIdCode]/_components/aplus2-content-preview";

describe("Aplus2ContentPreview canvasWidth", () => {
  it("defaults the canvas max-width to 1464px", () => {
    const { getByTestId } = render(<Aplus2ContentPreview modules={[]} variant="desktop" />);
    expect(getByTestId("aplus2-canvas").style.maxWidth).toBe("1464px");
  });
  it("constrains the canvas to 970px when canvasWidth=970 (BA+)", () => {
    const { getByTestId } = render(<Aplus2ContentPreview modules={[]} variant="desktop" canvasWidth={970} />);
    expect(getByTestId("aplus2-canvas").style.maxWidth).toBe("970px");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/aplus2-content-preview.test.tsx`
Expected: FAIL — no `canvasWidth` prop / no `aplus2-canvas` testid.

- [ ] **Step 3: Add the prop and a single always-rendered root container**

Replace the component (`:192-214`) so the empty-state and module-list share one width-constrained root:

```tsx
/** Stacks every module of a version top-to-bottom for one device variant. */
export function Aplus2ContentPreview({
  modules,
  variant,
  canvasWidth = 1464,
}: {
  modules: ModuleDto[];
  variant: Variant;
  canvasWidth?: number;
}) {
  const ordered = [...modules].sort((a, b) => a.position - b.position);
  return (
    <div data-testid="aplus2-canvas" style={{ maxWidth: canvasWidth, marginInline: "auto" }}>
      {ordered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">
          No modules yet.
        </p>
      ) : (
        ordered.map((m) => (
          <ModulePreview key={m.id} module={m} variant={variant} />
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/aplus2-content-preview.test.tsx`
Expected: PASS.

- [ ] **Step 5: Pass `canvasWidth` per tier from the set-list page**

In `src/app/aplus2/[clientIdCode]/page.tsx`:
- Add `contentType` to the `SetRow` type (`:14-28`, after `marketplace`):
```ts
  marketplace: string;
  contentType: "PA+" | "BA+";
```
- At both mounts (`:182` desktop, `:186` mobile), pass the prop. `s` is the set row in the `.map`:
```tsx
                              <Aplus2ContentPreview modules={snap?.modules ?? []} variant="desktop" canvasWidth={s.contentType === "BA+" ? 970 : 1464} />
```
```tsx
                              <Aplus2ContentPreview modules={snap?.modules ?? []} variant="mobile" canvasWidth={s.contentType === "BA+" ? 970 : 1464} />
```

> **Executor note:** confirm the set-row variable in the `.map` is `s` (it is, per `openEditor(s)` at the same region). If the mobile preview's `modules` source differs, keep the existing `modules={...}` expression — only add `canvasWidth`.

- [ ] **Step 6: Type-check + full suite**

Run: `npm run build && npm run test`
Expected: compiles; all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/aplus2/[clientIdCode]/_components/aplus2-content-preview.tsx" "src/app/aplus2/[clientIdCode]/page.tsx" tests/components/aplus2-content-preview.test.tsx
git commit -m "$(cat <<'EOF'
feat(aplus2): tier-aware preview canvas width (BA+ 970, PA+ 1464)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 (OPTIONAL — deferrable): hard-enforce image min size + aspect on upload

> **Status:** This is the only genuinely net-new infra in the project. It did **not** exist for PA+. The "minimum + aspect reference" guidance (Q4) is already satisfied without it (the upload box is shaped to `desktopSize` and shows the min label). Skipping this task ships a complete, usable BA+ tier. Do this task only if hard rejection of undersized/wrong-aspect uploads is required for v1. **It must be gated so it never rejects existing PA+ behavior** — apply only when the parent set is BA+.

**Files:**
- Modify: `src/app/api/aplus2/versions/[versionId]/assets/route.ts` (the POST upload handler)
- Test: a unit test over the extracted dimension-check helper.

- [ ] **Step 1: Inspect the current upload handler**

Run: `sed -n '1,80p' "src/app/api/aplus2/versions/[versionId]/assets/route.ts"`
Identify: where the uploaded `File` is read, where `slotKey`/`moduleId` arrive, and whether the set/tier is already joined. Note the image-decode library available (check `package.json` for `sharp`/`image-size`; if none, decode dimensions client-side in `aplus2-image-slot.tsx` before upload instead).

- [ ] **Step 2: Write the failing test for the pure check**

Create `tests/lib/aplus2/image-validate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { checkImageAgainstSlot } from "@/lib/aplus2/image-validate";

describe("checkImageAgainstSlot (min size + aspect, ±2% tolerance)", () => {
  const slot = { width: 970, height: 600 };
  it("accepts an image at the minimum, correct ratio", () => {
    expect(checkImageAgainstSlot(slot, { width: 970, height: 600 }).ok).toBe(true);
  });
  it("accepts a larger image with the same ratio", () => {
    expect(checkImageAgainstSlot(slot, { width: 1940, height: 1200 }).ok).toBe(true);
  });
  it("rejects an undersized image", () => {
    expect(checkImageAgainstSlot(slot, { width: 800, height: 495 }).ok).toBe(false);
  });
  it("rejects a wrong-aspect image", () => {
    expect(checkImageAgainstSlot(slot, { width: 970, height: 970 }).ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/aplus2/image-validate.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement the pure helper**

Create `src/lib/aplus2/image-validate.ts`:

```ts
type Dim = { width: number; height: number };

/** Validate an uploaded image against a slot's desktopSize, treated as a
 * minimum + aspect reference (Q4). Aspect tolerance ±2%. */
export function checkImageAgainstSlot(
  slot: Dim,
  uploaded: Dim,
): { ok: true } | { ok: false; error: string } {
  if (uploaded.width < slot.width || uploaded.height < slot.height) {
    return { ok: false, error: `Image must be at least ${slot.width}×${slot.height}px (got ${uploaded.width}×${uploaded.height})` };
  }
  const targetRatio = slot.width / slot.height;
  const actualRatio = uploaded.width / uploaded.height;
  if (Math.abs(actualRatio - targetRatio) / targetRatio > 0.02) {
    return { ok: false, error: `Image aspect ratio must match ${slot.width}:${slot.height}` };
  }
  return { ok: true };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/aplus2/image-validate.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire it into the upload route — BA+ only**

In the assets POST handler: after parsing the upload, join `aplus2Sets` (via the version) to read `contentType`; if `contentType === "BA+"`, look up the slot spec by `slotKey` across `APLUS2_MODULE_SPECS` (or the module's `moduleType`), decode the uploaded image dimensions, and call `checkImageAgainstSlot`. On `{ ok: false }` return `400` with the error. **Leave PA+ uploads unchanged.** (Exact insertion depends on Step 1's findings — write the join + decode using the same `db`/`eq` patterns already in the file.)

- [ ] **Step 7: Type-check + tests + manual upload check**

Run: `npm run build && npx vitest run tests/lib/aplus2/image-validate.test.ts`
Then manually: upload an undersized image to a BA+ slot (expect rejection) and a valid one to a PA+ slot (expect success, unchanged).

- [ ] **Step 8: Commit**

```bash
git add src/lib/aplus2/image-validate.ts tests/lib/aplus2/image-validate.test.ts "src/app/api/aplus2/versions/[versionId]/assets/route.ts"
git commit -m "$(cat <<'EOF'
feat(aplus2): enforce min size + aspect on BA+ image uploads (Q4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after Tasks 1-9, before claiming done)

- [ ] **Full suite:** `npm run test` → all PASS.
- [ ] **Build:** `npm run build` → no type/lint errors.
- [ ] **Manual smoke (`PORT=3000 npm run dev`):**
  1. New A+ Set → **Content type = BA+** → create → editor opens empty.
  2. Add module → picker shows **only the 8 `basic_*`** types.
  3. Add 5 modules → the 6th add is rejected (toast: "This tier allows 5 modules") and the Add button disables at 5.
  4. Open a PA+ set → picker shows the **19 Premium** types; cap still 7.
  5. Set-list page → the BA+ set's thumbnail preview is width-constrained (~970px) vs PA+ (1464).
- [ ] Per the project rule, **do not `git push`** — report ready-for-review and await explicit push confirmation.

---

## Self-Review (run against the spec)

**1. Spec coverage:**
- §2 Q1/Q2 (8 curated types) → Task 2 ✓
- §2 Q3 (5-module cap, PA+ 7) → Tasks 1 (helper) + 4 (gate) ✓
- §2 Q4 (min + aspect) → resolved: `desktopSize` already carries the ratio + min label (no code); hard enforcement → Task 10 (optional) ✓
- §2 Q5 (~970px canvas) → Task 9 ✓
- §2 Q6 (no video) → Task 2 specs omit `video`; asserted in Task 1-2 test ✓
- §2 Approach 2 (tier field, immutable, empty, tier-filtered picker) → Tasks 1, 6, 7, 8 ✓ (immutability = no mutation path exposed; empty = create inserts set+v1 only, unchanged)
- §5 (2 new + 2 reused item-data types) → Tasks 1 (types) + 3 (validation) ✓
- §6.1-6.7 (all touch points) → Tasks 1,2 (specs), 4 (cap), 5 (versions GET), 6 (picker+page), 7 (create+list), 8 (dialog), 9 (canvas) ✓
- §9 tests 1-6 → Tasks 1,2 (registry), 3 (zod), 4 (cap), 6 (picker via helper), 7/8 (create flow — type+manual), 9 (canvas) ✓

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N" — all code is inline. Task 10 Step 6 intentionally defers an insertion point to executor inspection because the assets route was not read in planning; it is flagged OPTIONAL and gives the exact pattern to follow.

**3. Type consistency:** `moduleTypesForTier(tier: "PA+" | "BA+")` and `maxModulesForTier(contentType: string)` are defined in Task 1 and used identically in Tasks 4, 6, 9. `contentType` typed `"PA+" | "BA+"` consistently across `SetDto`, `SetRow`, picker props, dialog state, and `createSchema`. New item-data field names (`text`; `metric`/`metric_type`/`value_1..6`) match between the union (Task 1), specs (Task 2), and zod tests (Task 3).

**Known minor risk (documented, not blocking):** the set-list `canvasWidth` (Task 9) is cosmetic and only takes effect if a thumbnail card is wider than 970px; if cards are already narrower it is a visual no-op — acceptable per the spec's "~970px" intent.
