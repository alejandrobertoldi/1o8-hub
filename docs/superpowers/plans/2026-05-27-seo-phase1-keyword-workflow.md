# SEO Manager Phase 1 — Keyword Workflow Overhaul (P10 + P11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the noisy Helium 10 → Claude tiering pipeline with a deterministic pre-tier filter, and refactor S7 content generation so each section (title / bullets / description / backend) draws from a mutually exclusive keyword pool.

**Architecture:**
- **Filter** (P10): User uploads H10 Cerebro CSV → optional pre-tier filter form in S2 UI → only survivors go to S2 Claude tiering. Filter logic lives in a new pure module `src/lib/parsers/cerebro-filter.ts`. UI inserted into the existing `src/app/seo/[id]/keywords/page.tsx`. H10 export recipe documented in a new spec.
- **Distribution** (P11): S7 reads `KeywordPrimaryUseLocation` (already set by S2's Claude prompt — currently *ignored* by S7 which hardcodes tier slicing at `seo/route.ts:464-467`). Each batch receives a disjoint keyword pool. Description batch additionally absorbs leftover T1/T2 keywords not present in the live title/bullets content. Logic extracted into `src/lib/seo/keyword-distribution.ts` for TDD.
- **Docs**: New spec `docs/superpowers/specs/2026-05-27-h10-export-recipe.md`. The pipeline reference HTML (`docs/seo-manager-complete.html`) is updated in Phase 7, not here.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Tailwind, Claude API (already wired).

---

## File Structure

**New files:**
- `src/lib/parsers/cerebro-filter.ts` — pure filter functions + `CerebroFilterConfig` type
- `src/lib/parsers/cerebro-filter.test.ts` — Vitest unit tests
- `src/lib/seo/keyword-distribution.ts` — pure distribution helpers
- `src/lib/seo/keyword-distribution.test.ts` — Vitest unit tests
- `docs/superpowers/specs/2026-05-27-h10-export-recipe.md` — recipe spec

**Modified files:**
- `src/app/seo/[id]/keywords/page.tsx` — add filter form between upload and tier button; wire survivors into the tier-API call
- `src/app/api/seo/claude/keywords/route.ts:30-35` — tighten S2 mutual-exclusion + tier-↔location 1:1 rule
- `src/app/api/seo/claude/seo/route.ts:464-467, 631, 705-706, 745-760, 828-830` — replace tier slicing with location-based distribution + leftover detection

---

## Tasks

### Task 1: Define filter types and pure filter function

**Files:**
- Create: `src/lib/parsers/cerebro-filter.ts`
- Create: `src/lib/parsers/cerebro-filter.test.ts`

**Why:** Keep filter logic out of React. Pure function = trivial TDD + reusable.

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/parsers/cerebro-filter.test.ts
import { describe, it, expect } from "vitest";
import { applyCerebroFilters, defaultFilterConfig } from "./cerebro-filter";
import type { CerebroRow } from "./cerebro";

const row = (overrides: Partial<CerebroRow>): CerebroRow => ({
  keyword_phrase: "test phrase",
  search_volume: 1000,
  keyword_sales: 0,
  cerebro_iq_score: 0,
  search_volume_trend: 0,
  competing_products: 0,
  cpr: 0,
  title_density: 0,
  position: 50,
  relative_rank: 0,
  competitor_rank: 0,
  ranking_count: 0,
  organic: 0,
  ppc_bid: 0,
  sponsored: 0,
  amazon_recommended: 0,
  ...overrides,
});

describe("applyCerebroFilters", () => {
  it("drops rows below minSearchVolume", () => {
    const rows = [row({ search_volume: 50 }), row({ search_volume: 500 })];
    const result = applyCerebroFilters(rows, { ...defaultFilterConfig, minSearchVolume: 100 });
    expect(result.kept.length).toBe(1);
    expect(result.kept[0].search_volume).toBe(500);
    expect(result.dropped).toEqual([{ reason: "low_volume", count: 1 }]);
  });

  it("drops rows above maxOrganicRank when set (0 means disabled)", () => {
    const rows = [row({ position: 10 }), row({ position: 100 })];
    const result = applyCerebroFilters(rows, { ...defaultFilterConfig, maxOrganicRank: 50 });
    expect(result.kept.length).toBe(1);
    expect(result.kept[0].position).toBe(10);
  });

  it("disables maxOrganicRank when 0", () => {
    const rows = [row({ position: 10 }), row({ position: 100 })];
    const result = applyCerebroFilters(rows, { ...defaultFilterConfig, maxOrganicRank: 0 });
    expect(result.kept.length).toBe(2);
  });

  it("drops rows containing any excludeWord (case-insensitive substring)", () => {
    const rows = [
      row({ keyword_phrase: "knee sleeve" }),
      row({ keyword_phrase: "knee SOCK" }),
      row({ keyword_phrase: "knee brace" }),
    ];
    const result = applyCerebroFilters(rows, { ...defaultFilterConfig, excludeWords: ["sock"] });
    expect(result.kept.map((r) => r.keyword_phrase)).toEqual(["knee sleeve", "knee brace"]);
  });

  it("filters by word count bounds", () => {
    const rows = [
      row({ keyword_phrase: "knee" }),                              // 1 word
      row({ keyword_phrase: "knee sleeve" }),                       // 2
      row({ keyword_phrase: "knee compression sleeve for running" }),// 5
    ];
    const result = applyCerebroFilters(rows, {
      ...defaultFilterConfig,
      minWordCount: 2,
      maxWordCount: 4,
    });
    expect(result.kept.map((r) => r.keyword_phrase)).toEqual(["knee sleeve"]);
  });

  it("aggregates multiple drop reasons", () => {
    const rows = [
      row({ search_volume: 10 }),
      row({ keyword_phrase: "junk term" }),
      row({ search_volume: 500 }),
    ];
    const result = applyCerebroFilters(rows, {
      ...defaultFilterConfig,
      minSearchVolume: 100,
      excludeWords: ["junk"],
    });
    expect(result.kept.length).toBe(1);
    expect(result.dropped).toEqual(
      expect.arrayContaining([
        { reason: "low_volume", count: 1 },
        { reason: "excluded_word", count: 1 },
      ])
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx vitest run src/lib/parsers/cerebro-filter.test.ts
```

Expected: FAIL — `Cannot find module './cerebro-filter'`.

- [ ] **Step 3: Implement filter module**

```typescript
// src/lib/parsers/cerebro-filter.ts
import type { CerebroRow } from "./cerebro";

export interface CerebroFilterConfig {
  /** Minimum search volume (inclusive). 0 = disabled. */
  minSearchVolume: number;
  /** Maximum organic position/rank (inclusive). 0 = disabled. */
  maxOrganicRank: number;
  /** Minimum word count in keyword phrase. 0 = disabled. */
  minWordCount: number;
  /** Maximum word count. 0 = disabled. */
  maxWordCount: number;
  /** Drop any phrase containing one of these substrings (case-insensitive). */
  excludeWords: string[];
}

export const defaultFilterConfig: CerebroFilterConfig = {
  minSearchVolume: 100,
  maxOrganicRank: 0,
  minWordCount: 0,
  maxWordCount: 0,
  excludeWords: [],
};

export type DropReason =
  | "low_volume"
  | "rank_too_low"
  | "word_count_too_low"
  | "word_count_too_high"
  | "excluded_word";

export interface CerebroFilterResult {
  kept: CerebroRow[];
  dropped: { reason: DropReason; count: number }[];
}

export function applyCerebroFilters(
  rows: CerebroRow[],
  config: CerebroFilterConfig,
): CerebroFilterResult {
  const counts: Record<DropReason, number> = {
    low_volume: 0,
    rank_too_low: 0,
    word_count_too_low: 0,
    word_count_too_high: 0,
    excluded_word: 0,
  };
  const excludeLower = config.excludeWords.map((w) => w.toLowerCase()).filter(Boolean);
  const kept: CerebroRow[] = [];

  for (const r of rows) {
    if (config.minSearchVolume > 0 && r.search_volume < config.minSearchVolume) {
      counts.low_volume++;
      continue;
    }
    if (config.maxOrganicRank > 0 && r.position > 0 && r.position > config.maxOrganicRank) {
      counts.rank_too_low++;
      continue;
    }
    const wc = r.keyword_phrase.trim().split(/\s+/).filter(Boolean).length;
    if (config.minWordCount > 0 && wc < config.minWordCount) {
      counts.word_count_too_low++;
      continue;
    }
    if (config.maxWordCount > 0 && wc > config.maxWordCount) {
      counts.word_count_too_high++;
      continue;
    }
    const phraseLower = r.keyword_phrase.toLowerCase();
    if (excludeLower.some((w) => phraseLower.includes(w))) {
      counts.excluded_word++;
      continue;
    }
    kept.push(r);
  }

  const dropped = (Object.entries(counts) as [DropReason, number][])
    .filter(([, c]) => c > 0)
    .map(([reason, count]) => ({ reason, count }));

  return { kept, dropped };
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run src/lib/parsers/cerebro-filter.test.ts
```

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/cerebro-filter.ts src/lib/parsers/cerebro-filter.test.ts
git commit -m "$(cat <<'EOF'
feat(seo): add Cerebro pre-tier filter module (P10)

Pure filter function with config: minSearchVolume, maxOrganicRank,
min/max word count, excludeWords. Aggregated drop reasons returned
alongside survivors so the UI can show "X dropped because Y".

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wire the filter form into the S2 keywords page

**Files:**
- Modify: `src/app/seo/[id]/keywords/page.tsx`

**Why:** The filter must be applied client-side BEFORE the tier-API call so noise is gone before we pay Claude tokens.

**Estimated LOC:** ~120 React lines added. Suitable for inline execution.

- [ ] **Step 1: Read the current handler that fires the tier API call**

```bash
grep -n "claude/keywords\|tieredKeywords\|setTieredKeywords" "/Users/manu/1o8Hub/src/app/seo/[id]/keywords/page.tsx"
```

Note: identify (a) where `clientResult.keywords` becomes the payload to `/api/seo/claude/keywords`, and (b) where the survivor count would render.

- [ ] **Step 2: Add the filter state + memo**

Near the existing `useState` declarations (~L90-100), add:

```typescript
import {
  applyCerebroFilters,
  defaultFilterConfig,
  type CerebroFilterConfig,
} from "@/lib/parsers/cerebro-filter";

// ... inside the component:
const [filterConfig, setFilterConfig] = useState<CerebroFilterConfig>(defaultFilterConfig);

const filteredClient = useMemo(() => {
  if (!clientResult) return null;
  return applyCerebroFilters(clientResult.keywords, filterConfig);
}, [clientResult, filterConfig]);
```

- [ ] **Step 3: Insert the filter form JSX**

Place this block between the existing "Step 2 — Upload" panel and the tier-button row (~L395 area, right after the upload result preview):

```tsx
{clientResult && (
  <div className="mt-3 rounded-lg border border-border bg-card p-3 space-y-3">
    <div className="text-xs font-bold text-brand-400">
      Step 2.5 — Pre-Tier Filter (optional)
    </div>
    <p className="text-[11px] text-muted-foreground">
      Applied client-side BEFORE tiering. Saves Claude tokens. H10 export recipe
      is in <code>docs/superpowers/specs/2026-05-27-h10-export-recipe.md</code>.
    </p>
    <div className="grid grid-cols-2 gap-3 text-xs">
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Min search volume</span>
        <input
          type="number"
          className="rounded border bg-background px-2 py-1"
          value={filterConfig.minSearchVolume}
          onChange={(e) =>
            setFilterConfig((c) => ({ ...c, minSearchVolume: Number(e.target.value) || 0 }))
          }
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Max organic rank (0 = off)</span>
        <input
          type="number"
          className="rounded border bg-background px-2 py-1"
          value={filterConfig.maxOrganicRank}
          onChange={(e) =>
            setFilterConfig((c) => ({ ...c, maxOrganicRank: Number(e.target.value) || 0 }))
          }
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Min words (0 = off)</span>
        <input
          type="number"
          className="rounded border bg-background px-2 py-1"
          value={filterConfig.minWordCount}
          onChange={(e) =>
            setFilterConfig((c) => ({ ...c, minWordCount: Number(e.target.value) || 0 }))
          }
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Max words (0 = off)</span>
        <input
          type="number"
          className="rounded border bg-background px-2 py-1"
          value={filterConfig.maxWordCount}
          onChange={(e) =>
            setFilterConfig((c) => ({ ...c, maxWordCount: Number(e.target.value) || 0 }))
          }
        />
      </label>
      <label className="col-span-2 flex flex-col gap-1">
        <span className="text-muted-foreground">Exclude words (comma-separated)</span>
        <input
          type="text"
          className="rounded border bg-background px-2 py-1"
          placeholder="e.g. seed, plant, capsule"
          value={filterConfig.excludeWords.join(", ")}
          onChange={(e) =>
            setFilterConfig((c) => ({
              ...c,
              excludeWords: e.target.value
                .split(",")
                .map((w) => w.trim())
                .filter(Boolean),
            }))
          }
        />
      </label>
    </div>
    {filteredClient && (
      <div className="text-xs text-muted-foreground">
        <strong className="text-foreground">{filteredClient.kept.length}</strong> of{" "}
        {clientResult.keywords.length} keywords pass the filter.
        {filteredClient.dropped.length > 0 && (
          <span>
            {" "}Dropped:{" "}
            {filteredClient.dropped
              .map((d) => `${d.count} ${d.reason.replace(/_/g, " ")}`)
              .join(", ")}
          </span>
        )}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Swap the tier-API payload to use survivors**

Find the keyword payload in the tier-button handler (search for `"/api/seo/claude/keywords"`). Replace the keyword source:

```typescript
// BEFORE:
//   keywords: clientResult.keywords.concat(...competitor stuff)
// AFTER:
const clientKeywords = filteredClient?.kept ?? clientResult.keywords;
// ... continue building payload using `clientKeywords` ...
```

Keep competitor results untouched (filter is client-keywords-only).

- [ ] **Step 5: Smoke test in dev**

```bash
PORT=3000 npm run dev
```

In a browser: open `/seo/<projectId>/keywords`, upload a Cerebro CSV, change Min SV to 500, confirm the survivor count drops. Click Tier Keywords and confirm the request body in the Network tab carries only the survivors.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/seo/[id]/keywords/page.tsx'
git commit -m "$(cat <<'EOF'
feat(seo): pre-tier filter UI on S2 keywords page (P10)

Filters Cerebro upload before sending to Claude tiering: min search
volume, max organic rank, word-count bounds, exclude-words list.
Shows live survivor count + drop reasons. Default min SV = 100.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Document the H10 Cerebro export recipe

**Files:**
- Create: `docs/superpowers/specs/2026-05-27-h10-export-recipe.md`

**Why:** Even with the in-app filter, cleaner data comes from filtering in H10 BEFORE export. This is the canonical recipe the team copy-pastes into Cerebro.

- [ ] **Step 1: Write the recipe**

```markdown
# Helium 10 Cerebro Export Recipe

**Status:** Active — ship this filter setup to every account manager before they upload to 1o8Hub S2.

## Why

The 1o8Hub SEO Manager has a pre-tier filter in S2 (Step 2.5 on
`/seo/[id]/keywords`), but Cerebro lets you filter at the source.
Filtering in H10 before export gives a cleaner CSV, smaller file
(faster upload), and lower Claude token cost during tiering.

## Recommended Filter Settings

In Helium 10 Cerebro, after running a competitor ASIN search, apply:

| Filter | Recommended Value | Notes |
|---|---|---|
| Minimum Search Volume | **300** | Drops long-tail noise. 1o8Hub UI re-applies 100 as safety net. |
| Maximum Search Volume | _leave blank_ | Caps the head — usually unnecessary. |
| Position (organic rank) | **1 to 50** | Only keywords where at least one tracked ASIN ranks top 50. |
| Word count | **1 to 6** | Drops degenerate 7+ word queries (usually parsing artifacts). |
| Exclude (Phrases Contain) | wrong-form noise — see below | Pre-strip wrong product types. |
| Title Density | _leave blank_ | |
| CPR | _leave blank_ | |

## Exclude Phrase Examples (per category)

Copy the relevant block into "Phrases Contain → Exclude":

- **Supplements** — `seed, plant, capsule (if selling powder), drops, gummy (if not the form)`
- **Apparel** — `pattern, fabric only, by the yard, sewing`
- **Kitchen** — `replacement part, accessory only, manual, instructions`
- **Pets** — `for humans, food only (if selling treats), bag only`

## Output Columns to Include

Leave all default columns enabled. The parser at
`src/lib/parsers/cerebro.ts` reads these specifically:

- Keyword Phrase (required)
- Search Volume (required)
- Cerebro IQ Score
- Competing Products
- Title Density
- CPR
- Position
- Organic
- H10 PPC Suggested Bid

## After Export

1. Save the CSV with a descriptive name: `cerebro-<brand>-<asin>-<YYYY-MM-DD>.csv`.
2. Open the 1o8Hub project at `/seo/[id]/keywords`.
3. Upload the CSV to "Step 2 — Upload the Helium 10 Cerebro CSV export".
4. **Optional but recommended:** apply Step 2.5 pre-tier filter to fine-tune
   (stacks on top of H10 filtering).
5. Click "Tier Keywords" to run Claude classification.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-27-h10-export-recipe.md
git commit -m "$(cat <<'EOF'
docs(seo): add H10 Cerebro export recipe (P10)

Canonical pre-export filter settings for account managers so the
uploaded CSV is clean before the in-app filter re-applies its own
safety net.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Define keyword-distribution pure functions

**Files:**
- Create: `src/lib/seo/keyword-distribution.ts`
- Create: `src/lib/seo/keyword-distribution.test.ts`

**Why:** Lift distribution logic out of the 1082-line `seo/route.ts` so it's unit-testable. This is where mutual exclusion is enforced.

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/seo/keyword-distribution.test.ts
import { describe, it, expect } from "vitest";
import {
  distributeKeywords,
  computeLeftoverKeywords,
  type S7Keyword,
} from "./keyword-distribution";

const kw = (text: string, location: string, tier = "T2"): S7Keyword => ({
  KeywordText: text,
  KeywordSearchVolume: 1000,
  KeywordPriorityTier: tier,
  KeywordPrimaryUseLocation: location,
});

describe("distributeKeywords", () => {
  it("routes keywords to their KeywordPrimaryUseLocation", () => {
    const kws = [
      kw("brand sleeve", "Title", "T1"),
      kw("knee sleeve compression", "Bullet Points", "T2"),
      kw("knee pain relief", "Description", "T3"),
      kw("knee sleve", "Backend Search Terms", "T4"),
    ];
    const d = distributeKeywords(kws);
    expect(d.title.map((k) => k.KeywordText)).toEqual(["brand sleeve"]);
    expect(d.bullets.map((k) => k.KeywordText)).toEqual(["knee sleeve compression"]);
    expect(d.description.map((k) => k.KeywordText)).toEqual(["knee pain relief"]);
    expect(d.backend.map((k) => k.KeywordText)).toEqual(["knee sleve"]);
  });

  it("falls back to tier mapping when location is missing", () => {
    const kws: S7Keyword[] = [
      { ...kw("a", "", "T1"), KeywordPrimaryUseLocation: "" },
      { ...kw("b", "", "T2"), KeywordPrimaryUseLocation: "" },
      { ...kw("c", "", "T3"), KeywordPrimaryUseLocation: "" },
      { ...kw("d", "", "T4"), KeywordPrimaryUseLocation: "" },
    ];
    const d = distributeKeywords(kws);
    expect(d.title.length).toBe(1);
    expect(d.bullets.length).toBe(1);
    expect(d.description.length).toBe(1);
    expect(d.backend.length).toBe(1);
  });

  it("excludes negative keywords from every section", () => {
    const kws: S7Keyword[] = [
      { ...kw("legit", "Title", "T1") },
      { ...kw("bad term", "Title", "T1"), KeywordIsNegative: true },
    ];
    const d = distributeKeywords(kws);
    expect(d.title.length).toBe(1);
    expect(d.title[0].KeywordText).toBe("legit");
  });

  it("dedupes by KeywordText (case-insensitive)", () => {
    const kws = [
      kw("knee sleeve", "Title", "T1"),
      kw("Knee Sleeve", "Bullet Points", "T2"),
    ];
    const d = distributeKeywords(kws);
    // First wins; the duplicate is dropped, not placed elsewhere
    expect(d.title.length + d.bullets.length).toBe(1);
  });

  it("guarantees no keyword appears in more than one section", () => {
    const kws = [
      kw("x", "Title", "T1"),
      kw("y", "Bullet Points", "T2"),
      kw("z", "Description", "T3"),
      kw("w", "Backend Search Terms", "T4"),
    ];
    const d = distributeKeywords(kws);
    const all = [...d.title, ...d.bullets, ...d.description, ...d.backend];
    const texts = all.map((k) => k.KeywordText.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe("computeLeftoverKeywords", () => {
  it("returns keywords not present in any string field of currentRows", () => {
    const allowed = [
      kw("knee sleeve", "Title", "T1"),
      kw("compression support", "Bullet Points", "T2"),
      kw("calf protection", "Bullet Points", "T2"),
    ];
    const currentRows = [
      {
        ASIN: "A1",
        Title: "Brand Knee Sleeve for Sports",
        DetailedBulletPoint_1: "Provides compression support all day",
        DetailedBulletPoint_2: "Stays in place during runs",
      },
    ];
    const leftovers = computeLeftoverKeywords(allowed, currentRows);
    expect(leftovers.map((k) => k.KeywordText)).toEqual(["calf protection"]);
  });

  it("returns [] when all keywords are present", () => {
    const allowed = [kw("knee sleeve", "Title", "T1")];
    const currentRows = [{ ASIN: "A1", Title: "Brand Knee Sleeve" }];
    expect(computeLeftoverKeywords(allowed, currentRows)).toEqual([]);
  });

  it("matching is case-insensitive", () => {
    const allowed = [kw("KNEE SLEEVE", "Title", "T1")];
    const currentRows = [{ ASIN: "A1", Title: "knee sleeve" }];
    expect(computeLeftoverKeywords(allowed, currentRows)).toEqual([]);
  });

  it("ignores the ASIN field", () => {
    const allowed = [kw("A1", "Title", "T1")];
    const currentRows = [{ ASIN: "A1", Title: "Brand Title" }];
    // Should NOT match because we skip the ASIN field
    expect(computeLeftoverKeywords(allowed, currentRows).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx vitest run src/lib/seo/keyword-distribution.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement keyword-distribution module**

```typescript
// src/lib/seo/keyword-distribution.ts
export interface S7Keyword {
  KeywordText: string;
  KeywordSearchVolume: number;
  KeywordPriorityTier: string;
  KeywordPrimaryUseLocation: string;
  KeywordIsNegative?: boolean;
  [key: string]: unknown;
}

export interface DistributedKeywords {
  title: S7Keyword[];
  bullets: S7Keyword[];
  description: S7Keyword[];
  backend: S7Keyword[];
}

const TIER_FALLBACK: Record<string, keyof DistributedKeywords> = {
  T1: "title",
  T2: "bullets",
  T3: "description",
  T4: "backend",
};

const LOCATION_TO_SECTION: Record<string, keyof DistributedKeywords> = {
  Title: "title",
  "Bullet Points": "bullets",
  Bullets: "bullets",
  Description: "description",
  "Backend Search Terms": "backend",
  Backend: "backend",
};

function sectionFor(kw: S7Keyword): keyof DistributedKeywords {
  const loc = kw.KeywordPrimaryUseLocation;
  if (loc && LOCATION_TO_SECTION[loc]) return LOCATION_TO_SECTION[loc];
  return TIER_FALLBACK[kw.KeywordPriorityTier] ?? "backend";
}

export function distributeKeywords(keywords: S7Keyword[]): DistributedKeywords {
  const result: DistributedKeywords = {
    title: [],
    bullets: [],
    description: [],
    backend: [],
  };
  const seen = new Set<string>();
  for (const k of keywords) {
    if (k.KeywordIsNegative) continue;
    const key = (k.KeywordText || "").toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result[sectionFor(k)].push(k);
  }
  return result;
}

export function computeLeftoverKeywords(
  candidates: S7Keyword[],
  currentRows: Array<Record<string, unknown>>,
): S7Keyword[] {
  const haystack = currentRows
    .map((r) =>
      Object.entries(r)
        .filter(([k, v]) => typeof v === "string" && k !== "ASIN" && k !== "asin")
        .map(([, v]) => String(v))
        .join(" ")
    )
    .join(" ")
    .toLowerCase();
  return candidates.filter(
    (k) => !haystack.includes((k.KeywordText || "").toLowerCase()),
  );
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run src/lib/seo/keyword-distribution.test.ts
```

Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/keyword-distribution.ts src/lib/seo/keyword-distribution.test.ts
git commit -m "$(cat <<'EOF'
feat(seo): extract pure keyword-distribution module (P11)

distributeKeywords routes keywords to title/bullets/description/backend
based on KeywordPrimaryUseLocation (S2's existing field) with tier
fallback. Guarantees mutual exclusion + drops negatives + case-insensitive
dedup.

computeLeftoverKeywords finds title/bullet keywords NOT present in the
current title/bullets row content — used by the description batch to
absorb unused upstream keywords (P11 "remaining unused").

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire distribution into S7 route.ts (replace tier slicing)

**Files:**
- Modify: `src/app/api/seo/claude/seo/route.ts`

**Why:** Make S7 actually respect what S2 planned. Eliminates the T1 leak into both title and bullets prompts.

- [ ] **Step 1: Add import**

At the top of `src/app/api/seo/claude/seo/route.ts`, near the other lib imports (~L14-16):

```typescript
import {
  distributeKeywords,
  computeLeftoverKeywords,
} from "@/lib/seo/keyword-distribution";
```

- [ ] **Step 2: Replace tier slicing block at L464-467**

Find:

```typescript
  const tier1 = keywords.filter((k: any) => k.KeywordPriorityTier === "T1").slice(0, 20);
  const tier2 = keywords.filter((k: any) => k.KeywordPriorityTier === "T2").slice(0, 20);
  const tier3 = keywords.filter((k: any) => k.KeywordPriorityTier === "T3").slice(0, 15);
  const tier4 = keywords.filter((k: any) => k.KeywordPriorityTier === "T4").slice(0, 30);
```

Replace with:

```typescript
  const distributed = distributeKeywords(keywords);
  const titleKws = distributed.title.slice(0, 8);
  const bulletKws = distributed.bullets.slice(0, 20);
  const descKws = distributed.description.slice(0, 20);
  const backendKws = distributed.backend.slice(0, 60);
```

- [ ] **Step 3: Update title batch user prompt (L631)**

In the `case "titles"` block, find:

```typescript
Tier 1 Keywords:\n${tier1.map((k: any) => `- ${k.KeywordText} (SV: ${k.SearchVolume})`).join("\n")}
```

Replace with:

```typescript
Approved Title Keywords (use ALL of these — these are RESERVED for the title only and do NOT appear in bullets/description/backend):\n${titleKws.map((k: any) => `- ${k.KeywordText} (SV: ${k.KeywordSearchVolume})`).join("\n")}
```

- [ ] **Step 4: Update bullets batch user prompt (L705-706)**

In the `case "bullets"` block, find:

```typescript
Tier 1:\n${tier1.map((k: any) => `- ${k.KeywordText}`).join("\n")}
Tier 2:\n${tier2.map((k: any) => `- ${k.KeywordText}`).join("\n")}
```

Replace with:

```typescript
Approved Bullet Keywords (use ALL of these — RESERVED for bullets, NOT used in title):\n${bulletKws.map((k: any) => `- ${k.KeywordText}`).join("\n")}
```

- [ ] **Step 5: Update description batch — inject leftover detection**

In the `case "description"` block, BEFORE the `userPrompt = ...` assignment, add:

```typescript
      const titleBulletAllowed = [...distributed.title, ...distributed.bullets];
      const leftovers = computeLeftoverKeywords(titleBulletAllowed, currentRows || []);
      const allDescKws = [...descKws, ...leftovers].slice(0, 30);
```

Then inside the description's user prompt template (the `userPrompt = \`...\``), add this line right after the Rufus block and before the variety pack context:

```typescript
Approved Description Keywords (T3 + any title/bullet keywords NOT present in current title/bullets — use ALL of them):\n${allDescKws.map((k: any) => `- ${k.KeywordText}`).join("\n")}
```

Insert it on a new line between the existing `Rufus Q&A` block (~L757) and `${varietyPackContext}` (~L758).

- [ ] **Step 6: Update backend batch user prompt (L828-830)**

In the `case "backend"` block, find:

```typescript
Tier 4 keywords (primary source):\n${tier4.map((k: any) => k.KeywordText).join(", ")}

Tier 3 (gap fill if bytes remain):\n${tier3.map((k: any) => k.KeywordText).join(", ")}
```

Replace with:

```typescript
Approved Backend Keywords (use ALL of these — RESERVED for backend, NOT used in title/bullets/description):\n${backendKws.map((k: any) => k.KeywordText).join(", ")}
```

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no new TypeScript errors in `src/app/api/seo/claude/seo/route.ts`.

- [ ] **Step 8: Smoke test in dev**

```bash
PORT=3000 npm run dev
```

In a project that already has S2 keywords tiered:
1. Open the S7 content screen
2. Generate Titles — confirm the prompt body in `/admin/observability` includes "Approved Title Keywords" with the top-8 T1 only
3. Generate Bullets — confirm the prompt body shows "Approved Bullet Keywords" with T2 only (no T1)
4. Generate Description — confirm leftover keywords appear if title/bullets didn't use everything
5. Generate Backend — confirm only T4 / location=Backend keywords are listed

- [ ] **Step 9: Commit**

```bash
git add src/app/api/seo/claude/seo/route.ts
git commit -m "$(cat <<'EOF'
refactor(seo): route S7 batches via location-based distribution (P11)

Replaces hardcoded tier1/tier2/tier3/tier4 slicing (route.ts:464-467)
with distributeKeywords() from keyword-distribution.ts. Each batch
now receives a disjoint keyword pool driven by S2's KeywordPrimaryUseLocation.

Description batch additionally absorbs leftover T1/T2 keywords not
present in current title/bullets via computeLeftoverKeywords().

Resolves the prior T1 leak where Tier 1 was passed to BOTH title and
bullet prompts simultaneously (L631 + L705).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Reinforce the S2 tier-↔location 1:1 rule

**Files:**
- Modify: `src/app/api/seo/claude/keywords/route.ts:30-35`

**Why:** S7 now strictly trusts `KeywordPrimaryUseLocation`. A misclassification in S2 (e.g. a T1 keyword tagged with `loc: "Bullet Points"`) silently demotes the keyword. Tighten the prompt so Claude can't drift.

- [ ] **Step 1: Edit the TIERING RULES block**

In `src/app/api/seo/claude/keywords/route.ts`, find:

```typescript
TIERING RULES (SEO placement):
- T1: High purchase intent → Title. Match: Exact. 5-8 keywords total across all batches.
- T2: Mid-funnel → Bullet Points. Match: Phrase. 10-15 keywords total.
- T3: Semantic expansion → Description. Match: Phrase. 15-20 keywords total.
- T4: Long-tail/awareness → Backend. Match: Exact or Broad. Everything else.
- No keyword in more than one tier.
```

Replace with:

```typescript
TIERING RULES (SEO placement — tier and primary use location are 1:1; the downstream content generator routes purely on loc):
- T1: High purchase intent → loc: "Title". Match: Exact. 5-8 keywords total across all batches.
- T2: Mid-funnel → loc: "Bullet Points". Match: Phrase. 10-15 keywords total.
- T3: Semantic expansion → loc: "Description". Match: Phrase. 15-20 keywords total.
- T4: Long-tail / awareness → loc: "Backend Search Terms". Match: Exact or Broad. Everything else.
- HARD RULE: Every keyword has EXACTLY one tier AND EXACTLY one location, and the pair MUST match the table above. T1 with loc="Bullet Points" is forbidden — pick a tier that matches the loc or fix the loc.
- HARD RULE: No keyword in more than one tier. No duplicate keyword phrases across batches (compare lowercase).
- Intent (int) is independent of tier — Informational keywords can still land in T1 if purchase intent is high.
```

- [ ] **Step 2: Sanity test**

```bash
PORT=3000 npm run dev
```

Run a Cerebro upload + tiering on a real project. Confirm the keyword table at `/seo/<id>/keywords` shows tier and location consistently (every T1 row has location "Title", etc.).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/seo/claude/keywords/route.ts
git commit -m "$(cat <<'EOF'
chore(seo): strengthen S2 tier↔location 1:1 rule (P11)

S7 now strictly routes on KeywordPrimaryUseLocation with no fallback
for misclassifications. Tighten the S2 system prompt so the tier/loc
pair is explicit and hard-enforced.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage (Phase 1 = P10 + P11):**

- ✅ P10 (a) pre-import filter in S2 — Tasks 1 + 2
- ✅ P10 (b) document H10 export filter recipe — Task 3
- ✅ P11 Title → top-priority — Task 5 Step 2 (`titleKws.slice(0, 8)`)
- ✅ P11 Bullets → feature/benefit, no title leak — Task 5 Step 4 (`bulletKws` only)
- ✅ P11 Description → remaining unused — Task 5 Step 5 (`computeLeftoverKeywords` + `descKws`)
- ✅ P11 Backend → unique hidden — Task 5 Step 6 + existing `perAsinWords` strip at `seo/route.ts:1013-1037` preserved

**Placeholders:** none — every step contains exact code or exact commands.

**Type consistency:** `S7Keyword`, `DistributedKeywords`, `CerebroFilterConfig`, `CerebroFilterResult`, `DropReason` all defined once in their respective modules and re-used consistently. Field names match the existing route.ts payload: `KeywordText`, `KeywordSearchVolume`, `KeywordPriorityTier`, `KeywordPrimaryUseLocation`, `KeywordIsNegative`.

**Out of scope (deferred to later phases):**

- Title structure formula (P1) — Phase 2
- Bullet length/strength tweaks (P3, P4, P5, P6) — Phase 2
- Tone polish (P7, P14, P15, P16) — Phase 3
- Meta-rules (P12, P13, P17, P19, P20, P22, P23) — Phase 4
- Description length 1000→2000 (P8) — Phase 5
- Backend exclusion verification (P9) — Phase 6
- Pipeline HTML reference rewrite — Phase 7

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-seo-phase1-keyword-workflow.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task with two-stage review between tasks.
2. **Inline Execution** — I execute tasks in this session using `executing-plans` with batch checkpoints.

Which approach?
