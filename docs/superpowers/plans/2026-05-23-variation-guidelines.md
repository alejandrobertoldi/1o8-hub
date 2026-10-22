# Variation Content Guidelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured content guidelines (keyFeatures, messagingAngle, targetAudience, doList, dontList) to variations and their groups so SEO generation receives per-group messaging context.

**Architecture:** Guidelines are authored inline in the variation builder at two levels (variation defaults + group overrides). Cascade at content-gen time: group → variation → brand guidelines. Read-only summary surfaced in brand guidelines page. No new DB tables; two new JSONB columns.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, PostgreSQL/Supabase, React Query, shadcn/ui, Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-05-23-variation-guidelines-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/variation-guidelines.ts` | Create | `ContentGuidelines` type, `isGuidelinesPresent()`, `resolveGuidelines()`, `renderGuidelinesBlock()` |
| `src/lib/variation-guidelines.test.ts` | Create | Unit tests for the three utility functions |
| `drizzle/migrations/0062_variation_content_guidelines.sql` | Create | ALTER TABLE to add `content_guidelines` JSONB to `variations` + `variation_groups` |
| `src/lib/db/schema.ts` | Modify | Import `ContentGuidelines`, add `.contentGuidelines` JSONB column to `variations` + `variationGroups` |
| `src/app/api/variations/[id]/route.ts` | Modify | Accept `contentGuidelines` in PATCH body |
| `src/app/api/variations/[id]/groups/[groupId]/route.ts` | Modify | Accept `contentGuidelines` in PATCH body |
| `src/app/variations/[id]/page.tsx` | Modify | Add `ChipInput`, `ContentGuidelinesForm`, variation defaults card, per-group Guidelines tab |
| `src/app/api/clients/[clientIdCode]/brand-guidelines/route.ts` | Modify | Add `variationGuidelines` array to GET response |
| `src/components/clients/brand-guidelines-page.tsx` | Modify | Add read-only `VariationGuidelinesCard` |
| `src/app/api/seo/projects/[id]/load/route.ts` | Modify | Resolve variation guidelines in `s1_intake` case |
| `src/app/seo/[id]/seo/page.tsx` | Modify | Store `variationGuidelines` state, pass resolved text to generate call |
| `src/app/api/seo/claude/seo/route.ts` | Modify | Accept + inject `variationGuidelinesText` into Claude prompt |

---

## Task 1: Utility helpers + types

**Files:**
- Create: `src/lib/variation-guidelines.ts`
- Create: `src/lib/variation-guidelines.test.ts`

- [ ] **Step 1: Create `src/lib/variation-guidelines.ts`**

```typescript
export type ContentGuidelines = {
  keyFeatures?: string[];
  messagingAngle?: string;
  targetAudience?: string;
  doList?: string[];
  dontList?: string[];
};

/** True when at least one field contains meaningful data */
export function isGuidelinesPresent(gl: ContentGuidelines | null | undefined): gl is ContentGuidelines {
  if (!gl) return false;
  return (
    (Array.isArray(gl.keyFeatures) && gl.keyFeatures.length > 0) ||
    !!gl.messagingAngle?.trim() ||
    !!gl.targetAudience?.trim() ||
    (Array.isArray(gl.doList) && gl.doList.length > 0) ||
    (Array.isArray(gl.dontList) && gl.dontList.length > 0)
  );
}

/**
 * Returns the highest-priority non-empty guidelines.
 * group → variationDefaults → null (caller falls back to brand voice).
 */
export function resolveGuidelines(
  groupGuidelines: ContentGuidelines | null | undefined,
  variationDefaults: ContentGuidelines | null | undefined
): ContentGuidelines | null {
  if (isGuidelinesPresent(groupGuidelines)) return groupGuidelines;
  if (isGuidelinesPresent(variationDefaults)) return variationDefaults;
  return null;
}

/** Renders ContentGuidelines as a plain-text block for Claude prompts */
export function renderGuidelinesBlock(gl: ContentGuidelines): string {
  const lines: string[] = ["## Variation Content Guidelines"];
  if (gl.messagingAngle) lines.push(`Messaging angle: ${gl.messagingAngle}`);
  if (gl.targetAudience) lines.push(`Target audience: ${gl.targetAudience}`);
  if (gl.keyFeatures?.length) lines.push(`Key features: ${gl.keyFeatures.join(", ")}`);
  if (gl.doList?.length) lines.push(`Do: ${gl.doList.join(", ")}`);
  if (gl.dontList?.length) lines.push(`Don't: ${gl.dontList.join(", ")}`);
  return lines.join("\n");
}
```

- [ ] **Step 2: Write tests in `src/lib/variation-guidelines.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import {
  isGuidelinesPresent,
  resolveGuidelines,
  renderGuidelinesBlock,
  type ContentGuidelines,
} from "./variation-guidelines";

describe("isGuidelinesPresent", () => {
  it("returns false for null", () => expect(isGuidelinesPresent(null)).toBe(false));
  it("returns false for empty object", () => expect(isGuidelinesPresent({})).toBe(false));
  it("returns false for all empty arrays and blank strings", () =>
    expect(isGuidelinesPresent({ keyFeatures: [], messagingAngle: "", doList: [] })).toBe(false));
  it("returns true when keyFeatures has items", () =>
    expect(isGuidelinesPresent({ keyFeatures: ["organic"] })).toBe(true));
  it("returns true when messagingAngle is set", () =>
    expect(isGuidelinesPresent({ messagingAngle: "Lead with sleep benefits" })).toBe(true));
});

describe("resolveGuidelines", () => {
  const groupGl: ContentGuidelines = { messagingAngle: "from group" };
  const varGl: ContentGuidelines = { messagingAngle: "from variation" };

  it("returns group guidelines when present", () =>
    expect(resolveGuidelines(groupGl, varGl)).toBe(groupGl));
  it("falls back to variation when group is empty", () =>
    expect(resolveGuidelines({}, varGl)).toBe(varGl));
  it("returns null when both are empty", () =>
    expect(resolveGuidelines(null, null)).toBeNull());
});

describe("renderGuidelinesBlock", () => {
  it("includes all populated fields", () => {
    const gl: ContentGuidelines = {
      messagingAngle: "Lead with sleep",
      targetAudience: "Adults 25-45",
      keyFeatures: ["vegan", "organic"],
      doList: ["Use sensory language"],
      dontList: ["Avoid price talk"],
    };
    const block = renderGuidelinesBlock(gl);
    expect(block).toContain("## Variation Content Guidelines");
    expect(block).toContain("Lead with sleep");
    expect(block).toContain("Adults 25-45");
    expect(block).toContain("vegan, organic");
    expect(block).toContain("Use sensory language");
    expect(block).toContain("Avoid price talk");
  });

  it("omits lines for missing fields", () => {
    const block = renderGuidelinesBlock({ messagingAngle: "Only angle" });
    expect(block).not.toContain("Target audience:");
    expect(block).not.toContain("Key features:");
  });
});
```

- [ ] **Step 3: Run tests to confirm they pass**

```bash
cd /Users/manu/1o8Hub && npm run test -- variation-guidelines
```

Expected: 8 passing tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/variation-guidelines.ts src/lib/variation-guidelines.test.ts
git commit -m "$(cat <<'EOF'
feat(variations): add ContentGuidelines type and utility helpers

isGuidelinesPresent, resolveGuidelines, renderGuidelinesBlock with
tests. Foundation for three-tier cascade: group → variation → brand.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: DB migration

**Files:**
- Create: `drizzle/migrations/0062_variation_content_guidelines.sql`

> ⚠️ **DEV DB IS PROD** — do not run this migration until you have explicit user confirmation.

- [ ] **Step 1: Create migration file**

```sql
-- drizzle/migrations/0062_variation_content_guidelines.sql
-- Adds content_guidelines JSONB to variations (variation-level defaults)
-- and variation_groups (per-group overrides).
-- Cascade: group guidelines > variation defaults > brand guidelines voice.

BEGIN;

ALTER TABLE variations
  ADD COLUMN IF NOT EXISTS content_guidelines jsonb;

ALTER TABLE variation_groups
  ADD COLUMN IF NOT EXISTS content_guidelines jsonb;

COMMIT;
```

- [ ] **Step 2: Get explicit user confirmation before running**

Paste the SQL above and ask the user: "Ready to run this migration on prod? It adds two nullable JSONB columns with no default — zero risk to existing rows."

- [ ] **Step 3: Run migration after confirmation**

```bash
cd /Users/manu/1o8Hub && npm run db:migrate
```

Expected output: migration `0062_variation_content_guidelines` applied.

- [ ] **Step 4: Commit**

```bash
git add drizzle/migrations/0062_variation_content_guidelines.sql
git commit -m "$(cat <<'EOF'
feat(db): add content_guidelines JSONB to variations and variation_groups

Nullable JSONB columns for variation-level defaults and per-group
overrides. No default value, zero impact on existing rows.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Schema type declarations

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Import `ContentGuidelines` and add column to `variations` table**

Read `src/lib/db/schema.ts` around line 1887 (the `variations` table). Add the import at the top of the file and the column inside the table definition.

At the top of the file, add the import alongside other imports (the type is defined in a separate lib file to avoid circular deps):

```typescript
// Near the top, after existing imports
import type { ContentGuidelines } from "@/lib/variation-guidelines";
```

Inside the `variations` pgTable definition (after the `description` field, before `status`):

```typescript
contentGuidelines: jsonb("content_guidelines").$type<ContentGuidelines>(),
```

- [ ] **Step 2: Add column to `variationGroups` table**

Inside the `variationGroups` pgTable definition (after `isVarietyPack`, before `varietyPackDetails`):

```typescript
contentGuidelines: jsonb("content_guidelines").$type<ContentGuidelines>(),
```

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
cd /Users/manu/1o8Hub && npm run build 2>&1 | grep -E "error|Error" | grep -v "pre-existing" | head -20
```

Expected: only the 3 pre-existing tsc errors, no new ones.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat(schema): declare contentGuidelines JSONB on variations + variationGroups

Typed with ContentGuidelines from @/lib/variation-guidelines.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: PATCH routes — accept contentGuidelines

**Files:**
- Modify: `src/app/api/variations/[id]/route.ts`
- Modify: `src/app/api/variations/[id]/groups/[groupId]/route.ts`

- [ ] **Step 1: Update variation PATCH handler**

In `src/app/api/variations/[id]/route.ts`, inside the `PATCH` function after the `body.description` check (around line 234), add:

```typescript
if (body.contentGuidelines !== undefined)
  updates.contentGuidelines = body.contentGuidelines;
```

- [ ] **Step 2: Update group PATCH handler**

In `src/app/api/variations/[id]/groups/[groupId]/route.ts`, inside the `PATCH` function after the `body.varietyPackDetails` check (around line 25), add:

```typescript
if (body.contentGuidelines !== undefined)
  updates.contentGuidelines = body.contentGuidelines;
```

- [ ] **Step 3: Verify build is clean**

```bash
cd /Users/manu/1o8Hub && npm run build 2>&1 | grep -E "^.*error TS" | head -10
```

Expected: same 3 pre-existing errors only.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/variations/[id]/route.ts" "src/app/api/variations/[id]/groups/[groupId]/route.ts"
git commit -m "$(cat <<'EOF'
feat(api): accept contentGuidelines in variation + group PATCH handlers

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Variation builder UI — shared form components

**Files:**
- Modify: `src/app/variations/[id]/page.tsx`

This task adds two local components (`ChipInput` and `ContentGuidelinesForm`) before the main `VariationBuilderPage` component function. They will be used by Tasks 6 and 7.

- [ ] **Step 1: Add `ChipInput` component**

In `src/app/variations/[id]/page.tsx`, find the `// ── Types ──` comment (around line 100). Insert the following two components **before** the `// ── Types ──` section:

```typescript
// ── Shared Guidelines Components ─────────────────────────────────────

function ChipInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function addChip() {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInput("");
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 p-2 min-h-[2.5rem]">
      {value.map((chip) => (
        <span
          key={chip}
          className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-foreground border border-stone-200 dark:border-zinc-700"
        >
          {chip}
          <button
            type="button"
            onClick={() => onChange(value.filter((c) => c !== chip))}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[120px] bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        placeholder={placeholder}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addChip();
          }
          if (e.key === "Backspace" && !input && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={addChip}
      />
    </div>
  );
}

function ContentGuidelinesForm({
  value,
  onChange,
  inheritedFrom,
}: {
  value: ContentGuidelines;
  onChange: (v: ContentGuidelines) => void;
  inheritedFrom?: ContentGuidelines | null;
}) {
  return (
    <div className="space-y-3 py-3 px-4">
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Messaging Angle
        </Label>
        <Input
          value={value.messagingAngle ?? ""}
          onChange={(e) => onChange({ ...value, messagingAngle: e.target.value })}
          placeholder={
            inheritedFrom?.messagingAngle
              ? `Inheriting: "${inheritedFrom.messagingAngle}"`
              : "e.g. Lead with sleep benefits"
          }
          className="text-xs h-7"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Target Audience
        </Label>
        <Input
          value={value.targetAudience ?? ""}
          onChange={(e) => onChange({ ...value, targetAudience: e.target.value })}
          placeholder={
            inheritedFrom?.targetAudience
              ? `Inheriting: "${inheritedFrom.targetAudience}"`
              : "e.g. Adults 25–45 seeking better sleep"
          }
          className="text-xs h-7"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Key Features
        </Label>
        <ChipInput
          value={value.keyFeatures ?? []}
          onChange={(chips) => onChange({ ...value, keyFeatures: chips })}
          placeholder="Add a feature, press Enter"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Do</Label>
          <ChipInput
            value={value.doList ?? []}
            onChange={(chips) => onChange({ ...value, doList: chips })}
            placeholder="Add a do"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Don&apos;t
          </Label>
          <ChipInput
            value={value.dontList ?? []}
            onChange={(chips) => onChange({ ...value, dontList: chips })}
            placeholder="Add a don't"
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `ContentGuidelines` import to the page**

At the top of `src/app/variations/[id]/page.tsx`, alongside the existing imports, add:

```typescript
import type { ContentGuidelines } from "@/lib/variation-guidelines";
```

- [ ] **Step 3: Build to verify components compile**

```bash
cd /Users/manu/1o8Hub && npm run build 2>&1 | grep -E "^.*error TS" | head -10
```

Expected: same 3 pre-existing errors only.

- [ ] **Step 4: Commit**

```bash
git add "src/app/variations/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(variations-ui): add ChipInput and ContentGuidelinesForm components

Chip input handles Enter-to-add, backspace-to-remove-last, blur-to-add.
Form handles five guideline fields with inherited-value placeholders.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Variation builder — variation-level defaults card

**Files:**
- Modify: `src/app/variations/[id]/page.tsx`

- [ ] **Step 1: Add `variationGuidelines` state to the main component**

Inside the main page component function (search for `const [seoDialogOpen` around line 908), add alongside the existing state variables:

```typescript
const [variationGuidelines, setVariationGuidelines] = useState<ContentGuidelines>(
  () => (variation?.contentGuidelines as ContentGuidelines) ?? {}
);
const [guidelinesOpen, setGuidelinesOpen] = useState(false);
```

- [ ] **Step 2: Add save mutation for variation guidelines**

After the existing `updateMut` mutation declaration (search for `const updateMut = useMutation`), add:

```typescript
const saveVariationGuidelinesMut = useMutation({
  mutationFn: (gl: ContentGuidelines) =>
    updateVariation(id, { contentGuidelines: gl }),
  onError: () => toast.error("Failed to save guidelines"),
});
```

- [ ] **Step 3: Sync local state when variation data loads**

Find the `useEffect` or `useMemo` that initialises state from `variation` data, or add a new `useEffect` after the state declarations:

```typescript
useEffect(() => {
  if (variation?.contentGuidelines) {
    setVariationGuidelines(variation.contentGuidelines as ContentGuidelines);
  }
}, [variation?.id]);
```

- [ ] **Step 4: Insert the variation defaults card in JSX**

Find the comment `{/* ── Client Products Pool ──────────────────────────────── */}` (around line 1639). Insert the following block **immediately before** that comment:

```tsx
{/* ── Variation Content Guidelines (defaults) ────────────────── */}
<Collapsible open={guidelinesOpen} onOpenChange={setGuidelinesOpen} className="mb-6">
  <div className="flex items-center justify-between rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-5 py-3">
    <div className="flex items-center gap-2 min-w-0">
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 text-left">
          {guidelinesOpen ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="text-xs font-bold uppercase tracking-wider text-brand">
            Content Guidelines — Variation Defaults
          </span>
        </button>
      </CollapsibleTrigger>
      {!guidelinesOpen && (
        <span className="text-xs text-muted-foreground truncate ml-1">
          {isGuidelinesPresent(variationGuidelines)
            ? [
                variationGuidelines.messagingAngle,
                variationGuidelines.keyFeatures?.join(", "),
              ]
                .filter(Boolean)
                .join(" · ")
                .substring(0, 80)
            : "No defaults set — inheriting brand guidelines"}
        </span>
      )}
    </div>
    {saveVariationGuidelinesMut.isPending && (
      <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />
    )}
  </div>
  <CollapsibleContent>
    <div className="rounded-b-xl border-x border-b border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
      <ContentGuidelinesForm
        value={variationGuidelines}
        onChange={(gl) => {
          setVariationGuidelines(gl);
          saveVariationGuidelinesMut.mutate(gl);
        }}
      />
    </div>
  </CollapsibleContent>
</Collapsible>
```

- [ ] **Step 5: Add `isGuidelinesPresent` import**

Add to the imports at the top of the file:

```typescript
import { isGuidelinesPresent } from "@/lib/variation-guidelines";
```

- [ ] **Step 6: Build + verify**

```bash
cd /Users/manu/1o8Hub && npm run build 2>&1 | grep -E "^.*error TS" | head -10
```

Expected: same 3 pre-existing errors only.

- [ ] **Step 7: Commit**

```bash
git add "src/app/variations/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(variations-ui): add variation-level content guidelines defaults card

Collapsible card above products pool. Saves on change via PATCH.
Shows inline summary when collapsed.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Variation builder — per-group guidelines tab

**Files:**
- Modify: `src/app/variations/[id]/page.tsx`

Each group card currently has a collapsible body showing the product list. This task adds a Products | Guidelines tab row to each group body.

- [ ] **Step 1: Add per-group guidelines state**

Add a new state variable alongside the existing group-related state:

```typescript
const [groupGuidelinesTabs, setGroupGuidelinesTabs] = useState<Record<string, "products" | "guidelines">>({});
const [groupGuidelinesState, setGroupGuidelinesState] = useState<Record<string, ContentGuidelines>>({});
```

- [ ] **Step 2: Initialise group guidelines from loaded data**

Add inside or alongside the `useEffect` from Task 6:

```typescript
useEffect(() => {
  if (variation?.groups) {
    const initial: Record<string, ContentGuidelines> = {};
    for (const g of variation.groups) {
      if (g.contentGuidelines) initial[g.id] = g.contentGuidelines as ContentGuidelines;
    }
    setGroupGuidelinesState((prev) => ({ ...initial, ...prev }));
  }
}, [variation?.id]);
```

- [ ] **Step 3: Add save function for group guidelines**

After the `saveVariationGuidelinesMut` from Task 6, add:

```typescript
async function saveGroupGuidelines(groupId: string, gl: ContentGuidelines) {
  try {
    const res = await fetch(`/api/variations/${id}/groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentGuidelines: gl }),
    });
    if (!res.ok) toast.error("Failed to save group guidelines");
  } catch {
    toast.error("Failed to save group guidelines");
  }
}
```

- [ ] **Step 4: Add tab switcher and Guidelines panel inside each group card**

Find the group rendering loop inside the `{/* ── Groups Section ──────────────────────────────────── */}` block (around line 1951). Inside each group's `<CollapsibleContent>` block (around line 2026), **before** the existing product list `<div className="px-5 pb-4 space-y-1">`, insert:

```tsx
{/* Tab row */}
<div className="flex gap-0 border-b border-stone-100 dark:border-zinc-800 px-5 pt-3">
  <button
    className={cn(
      "text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 border-b-2 transition-colors",
      (groupGuidelinesTabs[g.id] ?? "products") === "products"
        ? "border-brand text-brand"
        : "border-transparent text-muted-foreground hover:text-foreground"
    )}
    onClick={() => setGroupGuidelinesTabs((prev) => ({ ...prev, [g.id]: "products" }))}
  >
    Products
  </button>
  <button
    className={cn(
      "text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 border-b-2 transition-colors",
      groupGuidelinesTabs[g.id] === "guidelines"
        ? "border-brand text-brand"
        : "border-transparent text-muted-foreground hover:text-foreground"
    )}
    onClick={() => setGroupGuidelinesTabs((prev) => ({ ...prev, [g.id]: "guidelines" }))}
  >
    Guidelines
  </button>
</div>
```

Then wrap the existing product list with a conditional:

```tsx
{(groupGuidelinesTabs[g.id] ?? "products") === "products" ? (
  /* EXISTING product list JSX here — no changes needed inside */
  <div className="px-5 pb-4 space-y-1">
    {/* ...existing product rows... */}
  </div>
) : (
  <ContentGuidelinesForm
    value={groupGuidelinesState[g.id] ?? {}}
    inheritedFrom={variationGuidelines}
    onChange={(gl) => {
      setGroupGuidelinesState((prev) => ({ ...prev, [g.id]: gl }));
      saveGroupGuidelines(g.id, gl);
    }}
  />
)}
```

Note: The existing product list JSX inside `<CollapsibleContent>` spans from approximately line 2027 to the end of the group card. Wrap it exactly as shown — the existing JSX does not need to change, just be wrapped in the `(groupGuidelinesTabs[g.id] ?? "products") === "products"` branch.

- [ ] **Step 5: Build + verify**

```bash
cd /Users/manu/1o8Hub && npm run build 2>&1 | grep -E "^.*error TS" | head -10
```

Expected: same 3 pre-existing errors only.

- [ ] **Step 6: Commit**

```bash
git add "src/app/variations/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(variations-ui): add Products|Guidelines tabs to each variation group

Guidelines tab shows ContentGuidelinesForm with variation-level
inherited values as placeholders. Saves on change via PATCH.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Brand guidelines route — include variation guidelines

**Files:**
- Modify: `src/app/api/clients/[clientIdCode]/brand-guidelines/route.ts`

- [ ] **Step 1: Add variations import + query**

In `src/app/api/clients/[clientIdCode]/brand-guidelines/route.ts`, add to the import from `@/lib/db/schema`:

```typescript
import { ..., variations, variationGroups } from "@/lib/db/schema";
```

Then at the end of the GET handler, before `return NextResponse.json(...)`, add:

```typescript
// Load variations + group guidelines for this client
const clientVariations = await db
  .select({
    id: variations.id,
    name: variations.name,
    code: variations.code,
    status: variations.status,
    contentGuidelines: variations.contentGuidelines,
  })
  .from(variations)
  .where(eq(variations.clientId, clientIdCode));

const variationGuidelinesData = await Promise.all(
  clientVariations.map(async (v) => {
    const groups = await db
      .select({
        id: variationGroups.id,
        name: variationGroups.name,
        contentGuidelines: variationGroups.contentGuidelines,
      })
      .from(variationGroups)
      .where(eq(variationGroups.variationId, v.id))
      .orderBy(variationGroups.sortOrder);
    return { ...v, groups };
  })
);
```

- [ ] **Step 2: Add `variationGuidelines` to the response**

In the `return NextResponse.json(...)` call, add:

```typescript
return NextResponse.json({
  state: bg ? { ... } : null,  // existing
  activeVersion,
  versions,
  notes,
  logoFiles,
  variationGuidelines: variationGuidelinesData,  // add this
});
```

- [ ] **Step 3: Build + verify**

```bash
cd /Users/manu/1o8Hub && npm run build 2>&1 | grep -E "^.*error TS" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/clients/[clientIdCode]/brand-guidelines/route.ts"
git commit -m "$(cat <<'EOF'
feat(api): include variation guidelines in brand-guidelines GET response

Adds variationGuidelines array with nested groups to the response.
Used by the brand guidelines page read-only summary card.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Brand guidelines page — Variation Guidelines card

**Files:**
- Modify: `src/components/clients/brand-guidelines-page.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/clients/brand-guidelines-page.tsx` fully before editing.

- [ ] **Step 2: Add `VariationGuidelinesCard` component**

The file currently imports `BrandBookCard`, `BrandSummaryCards`, etc. and renders them from state. Add a new component at the top of the file (after imports):

```tsx
import type { ContentGuidelines } from "@/lib/variation-guidelines";
import { isGuidelinesPresent } from "@/lib/variation-guidelines";
import Link from "next/link";
import { ChevronRight, ChevronDown } from "lucide-react";
import { useState } from "react";

type VariationGuidelinesEntry = {
  id: string;
  name: string;
  code: string;
  status: string;
  contentGuidelines: ContentGuidelines | null;
  groups: Array<{ id: string; name: string; contentGuidelines: ContentGuidelines | null }>;
};

function GuidelinesChips({ gl }: { gl: ContentGuidelines }) {
  const chips = [
    gl.messagingAngle && { label: "Angle", value: gl.messagingAngle },
    gl.targetAudience && { label: "Audience", value: gl.targetAudience },
    gl.keyFeatures?.length && { label: "Features", value: gl.keyFeatures.join(", ") },
    gl.doList?.length && { label: "Do", value: gl.doList.join(", ") },
    gl.dontList?.length && { label: "Don't", value: gl.dontList.join(", ") },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="space-y-1.5 py-2">
      {chips.map((c) => (
        <div key={c.label} className="flex gap-2 text-xs">
          <span className="text-muted-foreground w-16 shrink-0">{c.label}</span>
          <span className="text-foreground">{c.value}</span>
        </div>
      ))}
    </div>
  );
}

function VariationGuidelinesCard({ entries }: { entries: VariationGuidelinesEntry[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-stone-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-stone-200 dark:border-zinc-800">
        <h2 className="text-xs font-bold uppercase tracking-wider text-brand">
          Variation Guidelines
        </h2>
      </div>
      <div className="divide-y divide-stone-100 dark:divide-zinc-800">
        {entries.map((v) => (
          <div key={v.id}>
            <button
              onClick={() => toggle(v.id)}
              className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-stone-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              {openIds.has(v.id) ? (
                <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
              )}
              <Link
                href={`/variations/${v.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-bold text-brand hover:underline"
              >
                {v.name}
              </Link>
              <span className="text-[10px] text-muted-foreground">{v.code}</span>
              {isGuidelinesPresent(v.contentGuidelines) && (
                <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[200px]">
                  {v.contentGuidelines!.messagingAngle ?? v.contentGuidelines!.keyFeatures?.join(", ")}
                </span>
              )}
            </button>
            {openIds.has(v.id) && (
              <div className="px-5 pb-4 space-y-4">
                {isGuidelinesPresent(v.contentGuidelines) && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      Variation Defaults
                    </p>
                    <GuidelinesChips gl={v.contentGuidelines!} />
                  </div>
                )}
                {v.groups.map((g) => (
                  <div key={g.id}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      {g.name}{" "}
                      <span className="normal-case">
                        {isGuidelinesPresent(g.contentGuidelines)
                          ? "(group override)"
                          : isGuidelinesPresent(v.contentGuidelines)
                          ? "(from variation)"
                          : "(brand guidelines)"}
                      </span>
                    </p>
                    {isGuidelinesPresent(g.contentGuidelines) ? (
                      <GuidelinesChips gl={g.contentGuidelines!} />
                    ) : isGuidelinesPresent(v.contentGuidelines) ? (
                      <GuidelinesChips gl={v.contentGuidelines!} />
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Using brand voice guidelines
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the card into the page**

In the `BrandGuidelinesPage` component, update the `InitialState` type to include `variationGuidelines`:

```typescript
export interface InitialState {
  bg: any | null;
  activeVersion: any | null;
  versions: any[];
  notes: any[];
  logoFiles: any[];
  variationGuidelines?: VariationGuidelinesEntry[];  // add this
}
```

At the bottom of the JSX return (after the last existing card), add:

```tsx
{state.variationGuidelines && state.variationGuidelines.length > 0 && (
  <VariationGuidelinesCard entries={state.variationGuidelines} />
)}
```

Also update the `refresh()` function to include `variationGuidelines` from the API response:

```typescript
async function refresh() {
  const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines`);
  if (!r.ok) return;
  const data = await r.json();
  setState((prev) => ({
    ...prev,
    bg: data.state ? { ...data.state } : null,
    activeVersion: data.activeVersion,
    versions: data.versions,
    notes: data.notes,
    logoFiles: data.logoFiles ?? prev.logoFiles,
    variationGuidelines: data.variationGuidelines ?? prev.variationGuidelines,
  }));
}
```

- [ ] **Step 4: Update the server page to pass variationGuidelines**

In `src/app/clients/[clientIdCode]/brand-guidelines/page.tsx`, the `<BrandGuidelinesPage>` receives `initialState`. Update the server page to fetch and pass variation guidelines. Since the server page queries the DB directly, add a variation guidelines query:

```typescript
// In the server page, after existing DB queries:
const clientVariations = await db
  .select({
    id: variations.id,
    name: variations.name,
    code: variations.code,
    status: variations.status,
    contentGuidelines: variations.contentGuidelines,
  })
  .from(variations)
  .where(eq(variations.clientId, clientIdCode));

const variationGuidelinesData = await Promise.all(
  clientVariations.map(async (v) => {
    const groups = await db
      .select({ id: variationGroups.id, name: variationGroups.name, contentGuidelines: variationGroups.contentGuidelines })
      .from(variationGroups)
      .where(eq(variationGroups.variationId, v.id))
      .orderBy(asc(variationGroups.sortOrder));
    return { ...v, groups };
  })
);
```

Add `variations, variationGroups` to the schema import. Update `initialState` prop to include `variationGuidelines: variationGuidelinesData`.

- [ ] **Step 5: Build + verify**

```bash
cd /Users/manu/1o8Hub && npm run build 2>&1 | grep -E "^.*error TS" | head -10
```

- [ ] **Step 6: Commit**

```bash
git add src/components/clients/brand-guidelines-page.tsx "src/app/clients/[clientIdCode]/brand-guidelines/page.tsx"
git commit -m "$(cat <<'EOF'
feat(brand-guidelines): add read-only Variation Guidelines card

Accordion per variation; sub-rows per group with tier label
(group override / from variation / brand guidelines). Links to builder.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: SEO load route — resolve variation guidelines in s1_intake

**Files:**
- Modify: `src/app/api/seo/projects/[id]/load/route.ts`

- [ ] **Step 1: Add imports**

At the top of the file, add:

```typescript
import { variations, variationGroups } from "@/lib/db/schema";
import { resolveGuidelines, renderGuidelinesBlock, type ContentGuidelines } from "@/lib/variation-guidelines";
```

- [ ] **Step 2: Resolve guidelines in the `s1_intake` case**

In the `s1_intake` case (around line 18), after loading the project and asins, add:

```typescript
// Resolve variation guidelines for this project
let variation_guidelines: {
  defaults: ContentGuidelines | null;
  groups: Array<{ name: string; contentGuidelines: ContentGuidelines | null }>;
} | null = null;

if (project?.variationId) {
  const [varRow] = await db
    .select({ contentGuidelines: variations.contentGuidelines })
    .from(variations)
    .where(eq(variations.id, project.variationId))
    .limit(1);

  const groupRows = await db
    .select({ name: variationGroups.name, contentGuidelines: variationGroups.contentGuidelines })
    .from(variationGroups)
    .where(eq(variationGroups.variationId, project.variationId))
    .orderBy(variationGroups.sortOrder);

  variation_guidelines = {
    defaults: (varRow?.contentGuidelines as ContentGuidelines) ?? null,
    groups: groupRows.map((g) => ({
      name: g.name,
      contentGuidelines: (g.contentGuidelines as ContentGuidelines) ?? null,
    })),
  };
}
```

- [ ] **Step 3: Include `variation_guidelines` in the `s1_intake` response**

In the `return NextResponse.json(...)` for `s1_intake`, add `variation_guidelines` to the `project` object:

```typescript
return NextResponse.json({
  project: {
    // ...existing fields...
    variation_guidelines,
  },
  asins: asins.map(...),
});
```

- [ ] **Step 4: Build + verify**

```bash
cd /Users/manu/1o8Hub && npm run build 2>&1 | grep -E "^.*error TS" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/seo/projects/[id]/load/route.ts"
git commit -m "$(cat <<'EOF'
feat(seo-load): resolve variation guidelines in s1_intake response

Loads variation defaults + per-group contentGuidelines for projects
linked to a variation. Returned as variation_guidelines in project object.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: SEO page — thread variationGuidelines state

**Files:**
- Modify: `src/app/seo/[id]/seo/page.tsx`

- [ ] **Step 1: Add state + import**

In `src/app/seo/[id]/seo/page.tsx`, add to imports:

```typescript
import { resolveGuidelines, renderGuidelinesBlock, type ContentGuidelines } from "@/lib/variation-guidelines";
```

Add state variable alongside `guidelines` state (around line 216):

```typescript
const [variationGuidelines, setVariationGuidelines] = useState<{
  defaults: ContentGuidelines | null;
  groups: Array<{ name: string; contentGuidelines: ContentGuidelines | null }>;
} | null>(null);
```

- [ ] **Step 2: Load variationGuidelines from s1_intake**

Find where `setGuidelines(s1.project?.brand_guidelines||"")` is called (around line 316). Add immediately after:

```typescript
setVariationGuidelines(s1.project?.variation_guidelines ?? null);
```

- [ ] **Step 3: Resolve per-batch variation guidelines**

Find the `generate` call site where `guidelines:guidelines?guidelines.substring(0,600):undefined` is passed (around line 511). Add `variationGuidelinesText` alongside:

```typescript
// Resolve variation guidelines for the current batch
const firstGroupName = currentBatch?.[0]?.variation_group ?? null;
const groupGl = variationGuidelines?.groups.find(g => g.name === firstGroupName)?.contentGuidelines ?? null;
const resolvedGl = resolveGuidelines(groupGl, variationGuidelines?.defaults ?? null);
const variationGuidelinesText = resolvedGl ? renderGuidelinesBlock(resolvedGl) : undefined;
```

Then in the generate call body, add:

```typescript
variationGuidelinesText,
```

- [ ] **Step 4: Do the same for the other generate call sites**

Search for all occurrences of `guidelines:` in the file (should be ~3 call sites, around lines 511, 834, 2084). Apply the same `variationGuidelinesText` resolution + addition to each call site. The `currentBatch` reference varies — use the appropriate batch variable at each call site.

- [ ] **Step 5: Build + verify**

```bash
cd /Users/manu/1o8Hub && npm run build 2>&1 | grep -E "^.*error TS" | head -10
```

- [ ] **Step 6: Commit**

```bash
git add "src/app/seo/[id]/seo/page.tsx"
git commit -m "$(cat <<'EOF'
feat(seo-page): resolve and thread variation guidelines into generate calls

Loads variation_guidelines from s1_intake, resolves per-batch group
override, passes variationGuidelinesText to all generate call sites.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: SEO generate route — inject variation guidelines block

**Files:**
- Modify: `src/app/api/seo/claude/seo/route.ts`

- [ ] **Step 1: Accept `variationGuidelinesText` in the request body**

In `src/app/api/seo/claude/seo/route.ts`, find the destructuring of `body` (line 455):

```typescript
const { batch, brandName, asins, keywords, cosmo, rufus, reviews, guidelines, sizePlacement, currentRows, feedback, usedKeywords, contentVoice, projectId } = body;
```

Add `variationGuidelinesText` to the destructure:

```typescript
const { batch, brandName, asins, keywords, cosmo, rufus, reviews, guidelines, variationGuidelinesText, sizePlacement, currentRows, feedback, usedKeywords, contentVoice, projectId } = body;
```

- [ ] **Step 2: Inject variation guidelines after the brand guidelines block**

Find the prompt template line (around line 585):

```typescript
${guidelines ? `\nBRAND GUIDELINES (LOCKED):\n${guidelines}\n` : ""}${competitiveBlock}
```

Replace it with:

```typescript
${guidelines ? `\nBRAND GUIDELINES (LOCKED):\n${guidelines}\n` : ""}${variationGuidelinesText ? `\n${variationGuidelinesText}\n` : ""}${competitiveBlock}
```

- [ ] **Step 3: Build + verify**

```bash
cd /Users/manu/1o8Hub && npm run build 2>&1 | grep -E "^.*error TS" | head -10
```

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/manu/1o8Hub && npm run test
```

Expected: same passing/failing counts as baseline (3 pre-existing tsc errors, ~9 pre-existing test failures — no regressions).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/seo/claude/seo/route.ts"
git commit -m "$(cat <<'EOF'
feat(seo-generate): inject variation guidelines block into Claude prompt

Appends ## Variation Content Guidelines block after brand guidelines
when variationGuidelinesText is provided. Three-tier cascade resolved
client-side (group → variation → brand).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- ✅ `ContentGuidelines` type with all 5 fields — Task 1
- ✅ Two JSONB columns, one migration — Tasks 2 + 3
- ✅ PATCH routes accept `contentGuidelines` — Task 4
- ✅ `ChipInput` + `ContentGuidelinesForm` — Task 5
- ✅ Variation defaults card (collapsible, above products pool) — Task 6
- ✅ Per-group Products|Guidelines tabs with inherit placeholders — Task 7
- ✅ Brand guidelines route includes variation data — Task 8
- ✅ Brand guidelines page read-only card with tier labels — Task 9
- ✅ SEO load resolves variation guidelines — Task 10
- ✅ SEO page threads guidelines to all generate call sites — Task 11
- ✅ SEO generate route injects block into prompt — Task 12
- ✅ Three-tier cascade (group → variation → brand) — Tasks 10–12

**No placeholders** — all code is complete and typed.

**Type consistency:**
- `ContentGuidelines` defined in `src/lib/variation-guidelines.ts`, imported everywhere
- `isGuidelinesPresent`, `resolveGuidelines`, `renderGuidelinesBlock` defined in Task 1, used in Tasks 6, 9, 10–12
- `variationGuidelinesText: string | undefined` flows from Task 11 → Task 12 consistently
