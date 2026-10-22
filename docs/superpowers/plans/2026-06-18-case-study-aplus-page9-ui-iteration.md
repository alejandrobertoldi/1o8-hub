# Case Study Page 9 — A+ UI iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make page-9 A+ stacks dominant, shrink the lone tier card, add per-module show/hide in the editor, make the section editor open per-page, and fix the stale A+ "missing image" banner.

**Architecture:** Pure renderer/editor/wiring changes on top of the existing screenviews feature. The resolver and generate/refresh logic are UNCHANGED. Per-module hiding is a new `hiddenImages: string[]` field on `AplusContent` (stable proxy URLs), filtered at render and toggled in the editor; it survives Refresh for free because refresh spreads existing content and mutates only `screenviews/hasBasic/hasPremium`.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Vitest + Testing Library, Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-18-case-study-aplus-page9-ui-iteration-design.md`

## Global Constraints

- Work in worktree `/Users/manu/1o8Hub/.worktrees/aplus-page9` on branch `feat/case-study-aplus-screenviews`. Do NOT touch the main checkout (a parallel session holds it on `fix/aplus2-bulk-alt-text` with uncommitted WIP).
- node_modules must be present in the worktree: `cp -c /Users/manu/1o8Hub/node_modules /Users/manu/1o8Hub/.worktrees/aplus-page9/node_modules` (APFS clone; NOT a symlink — Turbopack rejects symlinks). Also clone `.env.local` if tests/build need env.
- NO resolver/ranking change. NO composite PNG. NO image upload control.
- hub gold is `var(--c-yellow)` (`#E8A700`) — never blue.
- `npm run build` is the real gate (lint misses SectionContent union-cast TS errors). Run a fresh build before claiming done.
- Stage explicit files only (never `git add .` — tree is parallel-session polluted). Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- NEVER push without explicit per-action OK from the user.

---

### Task 1: Renderer layout + per-module filtering + type field

**Files:**
- Modify: `src/lib/case-study/types.ts` (add `hiddenImages?` to `AplusContent`, ~line 240)
- Modify: `src/lib/case-study/generate.ts` (`emptyAplus`, ~line 284-293)
- Modify: `src/components/case-study/sections/aplus.tsx` (grid, `TierCard`, filtering)
- Test: `src/components/case-study/sections/aplus.test.tsx`

**Interfaces:**
- Produces: `AplusContent.hiddenImages?: string[]` — stable `/api/aplus2/image?driveFileId=…` URLs to omit. Consumed by Task 2 (editor) and the renderer.
- `TierCard({ tier, accent, compact })` — `compact?: boolean` toggles narrow width + smaller value font; sets `data-tier-compact="true"` when compact.

- [ ] **Step 1: Add the type field**

In `src/lib/case-study/types.ts`, inside `interface AplusContent` (after `hasPremium?: boolean;`, ~line 242):

```ts
  hiddenImages?: string[];              // proxy URLs hidden from page 9 (per-module show/hide)
```

- [ ] **Step 2: Initialize it in emptyAplus**

In `src/lib/case-study/generate.ts`, in `emptyAplus()` where it returns the object (it already sets `screenviews: []`), add:

```ts
    hiddenImages: [],
```

- [ ] **Step 3: Write the failing renderer tests**

Append to `src/components/case-study/sections/aplus.test.tsx` (inside the `describe`):

```tsx
  it("omits images listed in hiddenImages", () => {
    const screenviews = [
      { asin: "B01", contentType: "PA+" as const, images: ["/api/aplus2/image?driveFileId=a", "/api/aplus2/image?driveFileId=b"] },
    ];
    const { container } = render(
      <AplusSection section={{ id: "s", sortOrder: 8, content: content({ screenviews, hiddenImages: ["/api/aplus2/image?driveFileId=a"] }) }} globals={globals} />,
    );
    const srcs = Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(srcs).toEqual(["/api/aplus2/image?driveFileId=b"]);
  });

  it("skips a stack whose images are all hidden", () => {
    const screenviews = [
      { asin: "B01", contentType: "PA+" as const, images: ["/api/aplus2/image?driveFileId=a"] },
      { asin: "B02", contentType: "PA+" as const, images: ["/api/aplus2/image?driveFileId=c"] },
    ];
    const { container } = render(
      <AplusSection section={{ id: "s", sortOrder: 8, content: content({ screenviews, hiddenImages: ["/api/aplus2/image?driveFileId=a"] }) }} globals={globals} />,
    );
    const srcs = Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(srcs).toEqual(["/api/aplus2/image?driveFileId=c"]);
  });

  it("uses compact styling for a lone tier card", () => {
    const { container } = render(
      <AplusSection section={{ id: "s", sortOrder: 8, content: content({ hasBasic: false }) }} globals={globals} />,
    );
    expect(container.querySelector('[data-tier-compact="true"]')).toBeTruthy();
  });
```

- [ ] **Step 4: Run the new tests to verify they fail**

Run: `npm run test -- src/components/case-study/sections/aplus.test.tsx`
Expected: the 3 new tests FAIL (images not filtered; no `data-tier-compact`). Existing 3 still pass.

- [ ] **Step 5: Implement the renderer changes**

In `src/components/case-study/sections/aplus.tsx`:

(a) `TierCard` signature + compact styling:

```tsx
function TierCard({ tier, accent, compact }: { tier: AplusTier; accent: boolean; compact?: boolean }) {
  return (
    <div
      data-tier-compact={compact ? "true" : undefined}
      style={{
        background: accent ? "var(--c-yellow)" : "var(--c-ink-90)",
        border: `1px solid ${accent ? "var(--c-yellow)" : "var(--c-line)"}`,
        color: accent ? "var(--c-yellow-ink)" : "var(--c-white)",
        borderRadius: 20,
        padding: compact ? "20px 22px" : "28px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
```

and the value `<div>` font:

```tsx
            fontSize: compact ? "clamp(28px,3vw,44px)" : "clamp(36px,4vw,64px)",
```

(b) In `AplusSection`, replace the head of the function (the `screenviews`/`showBasic`/`showPremium` derivation):

```tsx
  const c = section.content;
  const hidden = new Set(c.hiddenImages ?? []);
  const screenviews = (c.screenviews ?? [])
    .map((sv) => ({ ...sv, images: sv.images.filter((u) => !hidden.has(u)) }))
    .filter((sv) => sv.images.length > 0);
  const showBasic = c.hasBasic !== false;     // legacy undefined → show
  const showPremium = c.hasPremium !== false;
  const loneCard = showBasic !== showPremium; // exactly one card visible
```

(c) The main grid container — change columns + alignment:

```tsx
          gridTemplateColumns: "1fr minmax(0, 360px)",
          gap: "clamp(32px,5vw,80px)",
          flex: 1,
          alignItems: "start",
```

(d) The tier grid block — narrow the lone card and pass `compact`:

```tsx
          {(showBasic || showPremium) && (
            <div style={{ display: "grid", gridTemplateColumns: showBasic && showPremium ? "1fr 1fr" : "minmax(0, 280px)", gap: 16, marginTop: 4 }}>
              {showBasic && <TierCard tier={c.basic} accent={false} compact={loneCard} />}
              {showPremium && <TierCard tier={c.premium} accent compact={loneCard} />}
            </div>
          )}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- src/components/case-study/sections/aplus.test.tsx`
Expected: all 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/case-study/types.ts src/lib/case-study/generate.ts src/components/case-study/sections/aplus.tsx src/components/case-study/sections/aplus.test.tsx
git commit -m "feat(case-study): page-9 A+ — dominant stacks, compact lone tier card, per-module hiddenImages filter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: A+ section editor — per-module show/hide

**Files:**
- Modify: `src/components/case-study/section-editor/section-aplus.tsx`
- Test: `src/components/case-study/section-editor/section-aplus.test.tsx` (create)

**Interfaces:**
- Consumes: `AplusContent.hiddenImages` and `AplusContent.screenviews` (from `initial`).
- Produces: editor that writes `hiddenImages` into the PATCH payload; no new exports.

- [ ] **Step 1: Write the failing editor test**

Create `src/components/case-study/section-editor/section-aplus.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AplusEditor } from "./section-aplus";
import type { AplusContent } from "@/lib/case-study/types";

const initial: AplusContent = {
  sectionLabel: "09 · A+ Content", sectionRight: "", head1: "H1", head2: "H2", head3: "H3", body: "b",
  screenviews: [{ asin: "B01", contentType: "PA+", images: ["/api/aplus2/image?driveFileId=a"] }],
  hasBasic: false, hasPremium: true, hiddenImages: [],
  basic:   { label: "Basic A+",   value: "1", sublabel: "s" },
  premium: { label: "Premium A+", value: "2", sublabel: "s" },
};

describe("AplusEditor module toggles", () => {
  it("flips a module thumbnail between Shown and Hidden", () => {
    render(<AplusEditor caseStudyId="cs" sectionId="s" initial={initial} onSaved={() => {}} />);
    expect(screen.getByText("Shown")).toBeTruthy();
    fireEvent.click(screen.getByText("Shown").closest("button")!);
    expect(screen.getByText("Hidden")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- src/components/case-study/section-editor/section-aplus.test.tsx`
Expected: FAIL — no "Shown"/"Hidden" text rendered yet.

- [ ] **Step 3: Implement the modules section**

In `src/components/case-study/section-editor/section-aplus.tsx`:

Add import at top (after existing imports):

```tsx
import { Label } from "@/components/ui/label";
```

Inside the component, after `const dirty = ...` add:

```tsx
  const hidden = new Set(form.hiddenImages ?? []);
  const toggleImage = (url: string) =>
    setForm((f) => {
      const h = new Set(f.hiddenImages ?? []);
      if (h.has(url)) h.delete(url); else h.add(url);
      return { ...f, hiddenImages: [...h] };
    });
```

Then in the returned JSX, insert this block between the `<AplusTierField label="Premium" .../>` line and the save `<Button>`:

```tsx
      {(form.screenviews ?? []).length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Modules shown on page (click to hide/show)</Label>
          {(form.screenviews ?? []).map((sv) => (
            <div key={`${sv.contentType}-${sv.asin}`} className="border rounded p-2 space-y-2">
              <div className="text-xs font-semibold">{sv.contentType} · {sv.asin}</div>
              <div className="grid grid-cols-3 gap-2">
                {sv.images.map((url) => {
                  const isHidden = hidden.has(url);
                  return (
                    <button
                      type="button"
                      key={url}
                      onClick={() => toggleImage(url)}
                      className={`relative border rounded overflow-hidden ${isHidden ? "opacity-40" : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-full h-auto block" />
                      <span className="absolute top-1 right-1 text-[10px] px-1 rounded bg-black/70 text-white">
                        {isHidden ? "Hidden" : "Shown"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- src/components/case-study/section-editor/section-aplus.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/case-study/section-editor/section-aplus.tsx src/components/case-study/section-editor/section-aplus.test.tsx
git commit -m "feat(case-study): A+ editor — per-module show/hide toggles writing hiddenImages

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Per-page editor drawer + banner fix

**Files:**
- Modify: `src/components/case-study/case-study-view.tsx` (add `onEditSection`, per-slide pencil)
- Modify: `src/components/case-study/section-editor/section-editor-shell.tsx` (add `sectionId` scoping; globals into cover drawer)
- Modify: `src/app/clients/[clientIdCode]/case-study/page.tsx` (edit-mode toggle, scoped open, banner fix)
- Test: `src/components/case-study/case-study-view.test.tsx` (create)

**Interfaces:**
- `CaseStudyView({ data, onEditSection? })` — `onEditSection?: (sectionId: string) => void`; when present, each slide gets a pencil button (`data-edit-pencil`) calling it.
- `SectionEditorShell({ open, onOpenChange, data, sectionId?, onSaved })` — when `sectionId` set, renders ONLY that section's editor (plus Globals iff it is the cover); otherwise the existing all-sections accordion.

- [ ] **Step 1: Write the failing view test**

Create `src/components/case-study/case-study-view.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CaseStudyView } from "./case-study-view";
import type { CaseStudyData } from "@/lib/case-study/types";

const data = {
  id: "cs", clientName: "C", title: "t", status: "draft",
  dateRangeStart: "2026-01-01", dateRangeEnd: "2026-06-01",
  sections: [
    { id: "sec1", sectionType: "cover", sortOrder: 0, content: {} },
  ],
} as unknown as CaseStudyData;

describe("CaseStudyView edit affordance", () => {
  it("shows no pencil without onEditSection", () => {
    const { container } = render(<CaseStudyView data={data} />);
    expect(container.querySelector("[data-edit-pencil]")).toBeNull();
  });

  it("calls onEditSection with the section id when the pencil is clicked", () => {
    const onEdit = vi.fn();
    const { container } = render(<CaseStudyView data={data} onEditSection={onEdit} />);
    const pencil = container.querySelector("[data-edit-pencil]");
    expect(pencil).toBeTruthy();
    fireEvent.click(pencil!);
    expect(onEdit).toHaveBeenCalledWith("sec1");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- src/components/case-study/case-study-view.test.tsx`
Expected: FAIL — `CaseStudyView` does not accept `onEditSection`; no pencil element.

- [ ] **Step 3: Implement the per-slide pencil in CaseStudyView**

Replace the `Props` interface and the `.map(...)` body in `src/components/case-study/case-study-view.tsx`:

```tsx
interface Props {
  data: CaseStudyData;
  onEditSection?: (sectionId: string) => void;
}

export function CaseStudyView({ data, onEditSection }: Props) {
  const globals: CaseStudyGlobals = {
    clientName:      data.clientName,
    clientSector:    data.clientSector ?? "",
    contactEmail:    data.contactEmail ?? "hello@1o8.agency",
    officeLocations: data.officeLocations ?? "Chicago / Portland",
    reportingPeriod: formatReportingPeriod(data.dateRangeStart, data.dateRangeEnd),
  };

  return (
    <>
      <CaseStudyTokens />
      <div data-case-study-ready>
        {data.sections.map((section) => {
          const Renderer = SECTION_RENDERERS[section.sectionType];
          if (!Renderer) return null;
          if (!onEditSection) {
            return <Renderer key={section.id} section={section} globals={globals} />;
          }
          return (
            <div key={section.id} style={{ position: "relative" }}>
              <button
                type="button"
                data-edit-pencil
                onClick={() => onEditSection(section.id)}
                aria-label="Edit this page"
                style={{
                  position: "absolute", top: 12, right: 12, zIndex: 20,
                  background: "var(--c-yellow)", color: "var(--c-yellow-ink)",
                  border: "none", borderRadius: 8, padding: "6px 10px",
                  fontFamily: "var(--f-mono)", fontSize: 12, cursor: "pointer",
                }}
              >
                ✎ Edit
              </button>
              <Renderer section={section} globals={globals} />
            </div>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- src/components/case-study/case-study-view.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Add sectionId scoping to the shell**

In `src/components/case-study/section-editor/section-editor-shell.tsx`, change the signature and body. Replace the function from `export function SectionEditorShell({` through the closing `</Sheet>`:

```tsx
export function SectionEditorShell({
  open,
  onOpenChange,
  data,
  sectionId,
  onSaved,
}: {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  data:         CaseStudyData;
  sectionId?:   string;
  onSaved:      () => void;
}) {
  const scoped = sectionId ? data.sections.find((s) => s.id === sectionId) : undefined;
  const globalsEditor = (
    <GlobalsEditor
      caseStudyId={data.id}
      initial={{
        clientSector:    data.clientSector ?? "",
        contactEmail:    data.contactEmail ?? "",
        officeLocations: data.officeLocations ?? "",
      }}
      onSaved={onSaved}
    />
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        style={{ width: "clamp(480px, 40vw, 720px)", maxWidth: "100vw", overflowY: "auto" }}
      >
        <SheetHeader>
          <SheetTitle>
            {scoped ? `${scoped.sortOrder + 1}. ${SECTION_LABELS[scoped.sectionType]}` : "Edit case study"}
          </SheetTitle>
        </SheetHeader>

        {scoped ? (
          <div className="mt-4 space-y-3">
            {scoped.sectionType === "cover" && globalsEditor}
            {(() => {
              const Editor = EDITORS[scoped.sectionType];
              return Editor ? (
                <Editor caseStudyId={data.id} sectionId={scoped.id} initial={scoped.content} onSaved={onSaved} />
              ) : (
                <div className="text-xs text-muted-foreground">No editor wired for this type yet.</div>
              );
            })()}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {globalsEditor}
            <Accordion type="single" collapsible defaultValue={data.sections[0]?.id}>
              {data.sections.map((section) => {
                const Editor = EDITORS[section.sectionType];
                return (
                  <AccordionItem key={section.id} value={section.id}>
                    <AccordionTrigger className="flex items-center justify-between gap-2">
                      <span>{section.sortOrder + 1}. {SECTION_LABELS[section.sectionType]}</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex justify-end mb-2">
                        <Button size="sm" variant="ghost" onClick={() => jumpTo(section)}>Jump to ↓</Button>
                      </div>
                      {Editor ? (
                        <Editor
                          caseStudyId={data.id}
                          sectionId={section.id}
                          initial={section.content}
                          onSaved={onSaved}
                        />
                      ) : (
                        <div className="text-xs text-muted-foreground">No editor wired for this type yet.</div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 6: Wire page.tsx — edit mode, scoped open, banner fix**

In `src/app/clients/[clientIdCode]/case-study/page.tsx`:

(a) Add state next to the other `useState` calls (~line 22):

```tsx
  const [editMode, setEditMode] = useState(false);
  const [editSectionId, setEditSectionId] = useState<string | null>(null);
```

(b) Fix the aplus banner check (~line 106): replace

```tsx
          if (s.sectionType === "aplus") return !c.imageUrl;
```

with

```tsx
          if (s.sectionType === "aplus") return !((c.screenviews as unknown[] | undefined)?.length);
```

(c) Replace the Edit `<Button>` (~line 158-160) with an edit-mode toggle:

```tsx
            <Button size="sm" variant={editMode ? "default" : "outline"} onClick={() => setEditMode((v) => !v)}>
              <Pencil className="w-4 h-4 mr-1" /> {editMode ? "Editing — click a page" : "Edit"}
            </Button>
```

(d) Pass `onEditSection` to the view (~line 187):

```tsx
        <CaseStudyView
          data={data}
          onEditSection={editMode ? (id) => { setEditSectionId(id); setEditorOpen(true); } : undefined}
        />
```

(e) Pass `sectionId` to the shell (~line 188-193):

```tsx
        <SectionEditorShell
          open={editorOpen}
          onOpenChange={setEditorOpen}
          data={data}
          sectionId={editSectionId ?? undefined}
          onSaved={load}
        />
```

- [ ] **Step 7: Run the full case-study test suite + build**

Run: `npm run test -- src/components/case-study src/lib/case-study`
Expected: all green (aplus 6, aplus editor 1, view 2, screenviews 6, generate 8).

Run: `npm run build`
Expected: build PASS (catches SectionContent union-cast TS errors lint misses).

- [ ] **Step 8: Commit**

```bash
git add src/components/case-study/case-study-view.tsx src/components/case-study/case-study-view.test.tsx src/components/case-study/section-editor/section-editor-shell.tsx "src/app/clients/[clientIdCode]/case-study/page.tsx"
git commit -m "feat(case-study): per-page editor drawer + edit-mode toggle; fix A+ missing-image banner

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verification before completion (render gate)

After Task 3, **verify render, not just build** (DB = prod Supabase; needs network):

1. `cd /Users/manu/1o8Hub/.worktrees/aplus-page9 && PORT=3000 npm run dev`
2. Open the case study for **DRC_SC_US** → page 9. Confirm:
   - Stacks are visibly larger (dominant left column); copy + tiers in the narrow right rail.
   - Basic card hidden; lone Premium card is compact (not full-width).
   - Amber banner no longer lists "A+ Content".
   - Click **Edit** → pencils appear on each slide. Click the A+ pencil → drawer opens scoped to A+ with the Modules list. Hide a module → it disappears from page 9. Click **Refresh Data** → the hidden choice persists.
3. If DB pooler is unreachable (captive DNS at 10.1.0.1 has happened before), report that — do NOT fake the check.

Then STOP and ask the user for explicit push OK before any merge/PR (`finishing-a-development-branch`).

## Self-review notes (coverage)

- Spec Part 1 → Task 1 step 5c. Part 2 → Task 1 steps 5a/5d. Part 3 → type (T1 s1-2), renderer filter (T1 s5b), editor (T2). Part 4 → Task 3 (view + shell + page). Part 5 → Task 3 step 6b.
- `#4` (display cap) intentionally absent — subsumed by Part 3 per-module toggles.
- No resolver/generate-logic file is modified except `emptyAplus` init (additive).
