# Help / SOP Section (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hub-only `/help` section that renders SOP/how-to guides natively in the `docs/onboarding-process.html` visual template, shipping the framework plus the fully-migrated Client Onboarding guide.

**Architecture:** A scoped `.help-doc` CSS design system (ported + namespaced from `onboarding-process.html`), a typed guide registry, and HTML content fragments rendered server-side via `dangerouslySetInnerHTML`. Routes `/help` (index) and `/help/[slug]` (guide) are internal routes — they inherit the hub `TopNav` from `LayoutRouter` and are blocked from clients by the existing proxy. No DB, no iframe, no `/api`, no proxy changes.

**Tech Stack:** Next.js 16 App Router (Server Components), React 19, Tailwind v4 + one plain scoped CSS file, Vitest + Testing Library, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-06-02-help-sop-section-design.md`

---

## File structure

| File | Responsibility |
|------|----------------|
| `public/help/*.png` | Screenshots referenced by guides (copied from `docs/`) |
| `src/styles/help-doc.css` | Scoped design system — all rules under `.help-doc` |
| `src/lib/help/registry.ts` | Typed guide registry + `getGuide` / `guidesByCategory` helpers |
| `src/lib/help/load-guide.ts` | `loadGuideHtml(slug)` — fs read of a content fragment (with traversal guard) |
| `src/content/help/onboarding-process.html` | Onboarding guide body fragment (template-classed) |
| `src/components/help/help-doc-header.tsx` | The dark doc-header bar (logo + title + subtitle + version/meta) |
| `src/app/help/layout.tsx` | Imports the scoped CSS, centers the document card |
| `src/app/help/page.tsx` | `/help` index — guides grouped by category as tiles |
| `src/app/help/[slug]/page.tsx` | `/help/<slug>` — renders doc-header + fragment |
| `next.config.ts` | `outputFileTracingIncludes` for `src/content/help/**` |
| `src/components/layout/top-nav.tsx` | Top-level "Help" nav item |

---

### Task 1: Copy guide screenshots into `public/help/`

Guides reference images with absolute `/help/*.png` paths. The onboarding fragment references these nine; copy them from `docs/`. (`logo.png` already exists at `public/logo.png`, served as `/logo.png` — do not copy it.)

**Files:**
- Create: `public/help/{step2,step3,step3-asana-menu,step3-asana-link,step4,step5,step6,step7,edit-client-dialog}.png`

- [ ] **Step 1: Copy the referenced screenshots**

```bash
mkdir -p public/help
cp docs/step2.png docs/step3.png docs/step3-asana-menu.png docs/step3-asana-link.png \
   docs/step4.png docs/step5.png docs/step6.png docs/step7.png docs/edit-client-dialog.png \
   public/help/
```

- [ ] **Step 2: Verify all nine landed**

Run: `ls public/help/`
Expected: the nine `.png` files listed above, no errors.

- [ ] **Step 3: Commit**

```bash
git add public/help
git commit -m "feat(help): add onboarding guide screenshots to public/help"
```

---

### Task 2: Scoped Help design-system CSS

Port the `<style>` block from `docs/onboarding-process.html` (lines 9–295) into `src/styles/help-doc.css`, **namespacing every selector under `.help-doc`** so nothing leaks into the hub shell (standing rule: report/print CSS with global `body`/`*` rules bleeds — see `feedback_report_css_isolation`). Then append the extension CSS (prose, TOC, code, tables, index tiles) that the template lacks.

**Files:**
- Create: `src/styles/help-doc.css`

- [ ] **Step 1: Create the file with the namespaced base + extensions**

Namespacing rules (apply to the lines 9–295 style block as you copy it):
- `:root {` → `.help-doc {` (the CSS custom properties live on the card, not globally).
- `* { box-sizing: border-box; margin: 0; padding: 0; }` → `.help-doc *, .help-doc *::before, .help-doc *::after { box-sizing: border-box; margin: 0; padding: 0; }`
- `body { … }` → merge its declarations into the `.help-doc { … }` rule and add card styling. Final `.help-doc` rule:
  ```css
  .help-doc {
    /* custom props from :root */
    --brand: #E8A700; --brand-dim: #f5c842; --bg: #f8f7f4; --card: #ffffff;
    --border: #e5e3dc; --text: #1a1a1a; --muted: #6b6b6b;
    --badge-active: #dcfce7; --badge-active-text: #166534;
    --badge-inactive: #fee2e2; --badge-inactive-text: #991b1b;
    --badge-warn: #fef9c3; --badge-warn-text: #854d0e;
    --step-done: #22c55e; --step-num: #E8A700;
    /* from body */
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.6;
    /* card framing inside the dark hub shell */
    border-radius: 14px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.18);
  }
  ```
- Every other selector in the block (`.header`, `.header-logo`, `.header-title`, `.header-sub`, `.header-meta`, `.container`, `h2.section-title`, `.overview-grid`, `.ov-card`, `.ov-card .num`, `.ov-card .label`, `.steps-list`, `.step-card`, `.step-header`, `.step-num`, `.step-body`, `.step-title`, `.step-desc`, `.badge`, `.badge-aia`, `.badge-nta`, `.badge-optional`, `.badge-vc`, `.type-pill` + variants, `.substeps`, `.substep`, `.substep:last-child`, `.substep-dot`, `.substep-label`, `.substep-desc`, `.folder-tree`, `.folder-root`, `.folder-line`, `.folder-name`, `.folder-type`, `.status-grid`, `.status-card` + variants, `.status-card-title` + variants, `.dot-status` + variants, `.consequence-list`, `.consequence-list li`, `.c-icon`, `.flow-arrow`, `.flow-pill` + variants, `.arrow`, `.confirm-note`) → prefix with `.help-doc ` (e.g. `.help-doc .step-card { … }`, `.help-doc h2.section-title { … }`).
- The `@media print` block → scope each inner selector: `@media print { .help-doc { background: #fff; } .help-doc .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .help-doc .step-card, .help-doc .status-card, .help-doc .ov-card { break-inside: avoid; } }`

Then append this extension CSS at the end of the file verbatim:

```css
/* ── Extensions for migrated docs + index tiles ── */
.help-doc .container p { margin: 0 0 12px; }
.help-doc .container ul, .help-doc .container ol { margin: 0 0 12px 20px; }
.help-doc .container li { margin-bottom: 4px; }
.help-doc .container h3 { font-size: 16px; font-weight: 700; margin: 24px 0 8px; }
.help-doc .container h4 { font-size: 14px; font-weight: 700; margin: 16px 0 6px; }
.help-doc .container a { color: var(--brand); text-decoration: none; }
.help-doc .container a:hover { text-decoration: underline; }

.help-doc .toc { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; margin-bottom: 24px; }
.help-doc .toc h3 { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin: 0 0 8px; }
.help-doc .toc ul { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0; }
.help-doc .toc a { font-size: 13px; }

.help-doc code { background: #f1f1f1; padding: 1px 6px; border-radius: 4px; font-size: 12px; font-family: "SF Mono","Fira Mono",monospace; }
.help-doc pre { background: #1e1e21; color: #e4e4e7; border-radius: 10px; padding: 16px 18px; overflow-x: auto; font-size: 12.5px; line-height: 1.6; margin: 0 0 16px; }
.help-doc pre code { background: transparent; padding: 0; color: inherit; font-size: inherit; }

.help-doc table { width: 100%; border-collapse: collapse; margin: 0 0 16px; font-size: 13px; }
.help-doc th, .help-doc td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.help-doc th { font-weight: 700; color: var(--muted); text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }

.help-doc .help-tile { display: block; text-decoration: none; color: var(--text); transition: border-color .15s, box-shadow .15s; }
.help-doc .help-tile:hover { border-color: var(--brand); box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
.help-doc .help-tile-title { font-size: 15px; font-weight: 700; }
.help-doc .help-tile-desc { font-size: 13px; color: var(--muted); margin-top: 6px; line-height: 1.5; }

.help-doc .container > section:first-child .section-title { margin-top: 0; }
```

- [ ] **Step 2: Sanity-check no global selectors escaped**

Run: `grep -nE '^\s*(body|html|\*|:root)\b' src/styles/help-doc.css`
Expected: **no output** (every rule must be under `.help-doc`).

- [ ] **Step 3: Commit**

```bash
git add src/styles/help-doc.css
git commit -m "feat(help): scoped .help-doc design system from onboarding template"
```

---

### Task 3: Guide registry + helpers (TDD)

**Files:**
- Create: `src/lib/help/registry.ts`
- Test: `src/lib/help/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { HELP_GUIDES, HELP_CATEGORIES, getGuide, guidesByCategory } from "./registry";

describe("help registry", () => {
  it("has unique slugs", () => {
    const slugs = HELP_GUIDES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("every guide references a known category", () => {
    const ids = new Set(HELP_CATEGORIES.map((c) => c.id));
    for (const g of HELP_GUIDES) expect(ids.has(g.category)).toBe(true);
  });
  it("includes the onboarding guide under processes", () => {
    const g = getGuide("onboarding-process");
    expect(g).toBeDefined();
    expect(g?.category).toBe("processes");
  });
  it("getGuide returns undefined for an unknown slug", () => {
    expect(getGuide("nope")).toBeUndefined();
  });
  it("guidesByCategory groups guides under their category id", () => {
    expect(guidesByCategory().processes.some((g) => g.slug === "onboarding-process")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/help/registry.test.ts`
Expected: FAIL — cannot resolve `./registry`.

- [ ] **Step 3: Implement the registry**

```ts
export type HelpCategory = "getting-started" | "processes" | "reference";

export type HelpGuide = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  category: HelpCategory;
  version?: string;
  metaNote?: string;
};

export const HELP_CATEGORIES: { id: HelpCategory; label: string }[] = [
  { id: "getting-started", label: "Getting Started" },
  { id: "processes", label: "Processes & SOPs" },
  { id: "reference", label: "Reference" },
];

export const HELP_GUIDES: HelpGuide[] = [
  {
    slug: "onboarding-process",
    title: "Client Onboarding Process",
    subtitle: "1o8 Marketplace — Internal Reference",
    description:
      "End-to-end client onboarding: 11 steps from client creation to FeedbackWhiz, plus status-change Drive consequences.",
    category: "processes",
    version: "v1.0 · June 2026",
    metaNote: "11 steps · 29 sub-tasks",
  },
];

export function getGuide(slug: string): HelpGuide | undefined {
  return HELP_GUIDES.find((g) => g.slug === slug);
}

export function guidesByCategory(): Record<HelpCategory, HelpGuide[]> {
  const out: Record<HelpCategory, HelpGuide[]> = {
    "getting-started": [],
    processes: [],
    reference: [],
  };
  for (const g of HELP_GUIDES) out[g.category].push(g);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/help/registry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/help/registry.ts src/lib/help/registry.test.ts
git commit -m "feat(help): guide registry with category + lookup helpers"
```

---

### Task 4: Onboarding content fragment

The fragment is the **inner HTML of the `.container`** from `docs/onboarding-process.html` (the doc-header is rendered separately by `HelpDocHeader` in Task 6). Image `src`s are rewritten to absolute `/help/*` paths.

**Files:**
- Create: `src/content/help/onboarding-process.html`

- [ ] **Step 1: Extract the container body and rewrite image paths**

```bash
mkdir -p src/content/help
sed -n '316,799p' docs/onboarding-process.html > src/content/help/onboarding-process.html
sed -i '' -E 's#src="(step[0-9a-z-]*\.png|edit-client-dialog\.png)"#src="/help/\1"#g' src/content/help/onboarding-process.html
```

- [ ] **Step 2: Verify the fragment looks right**

Run: `head -3 src/content/help/onboarding-process.html; echo '---'; grep -c 'step-card' src/content/help/onboarding-process.html; grep -o 'src="[^"]*"' src/content/help/onboarding-process.html | sort -u`
Expected: starts with the `<!-- Overview -->` comment / `<h2 class="section-title"...>`; `step-card` count is `11`; every `src=` begins with `/help/` (no bare `step*.png` or `edit-client-dialog.png`).

- [ ] **Step 3: Confirm it does NOT include the doc-header or a stray `</div>`**

Run: `grep -c 'class="header"' src/content/help/onboarding-process.html`
Expected: `0` (the dark header is rendered by the component, not the fragment). If non-zero, you captured too many lines — re-run Step 1 with the correct range.

- [ ] **Step 4: Commit**

```bash
git add src/content/help/onboarding-process.html
git commit -m "feat(help): onboarding guide content fragment"
```

---

### Task 5: Content loader (TDD)

**Files:**
- Create: `src/lib/help/load-guide.ts`
- Test: `src/lib/help/load-guide.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { loadGuideHtml } from "./load-guide";

describe("loadGuideHtml", () => {
  it("loads the onboarding fragment with template classes and /help image paths", async () => {
    const html = await loadGuideHtml("onboarding-process");
    expect(html).toBeTruthy();
    expect(html).toContain("step-card");
    expect(html).toContain("/help/step2.png");
  });
  it("returns null for an unknown slug", async () => {
    expect(await loadGuideHtml("does-not-exist")).toBeNull();
  });
  it("returns null for a traversal attempt", async () => {
    expect(await loadGuideHtml("../secrets")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/help/load-guide.test.ts`
Expected: FAIL — cannot resolve `./load-guide`.

- [ ] **Step 3: Implement the loader**

```ts
import { promises as fs } from "node:fs";
import path from "node:path";

const HELP_CONTENT_DIR = path.join(process.cwd(), "src", "content", "help");

/** Reads a help guide HTML fragment by slug. Returns null if missing or the slug is unsafe. */
export async function loadGuideHtml(slug: string): Promise<string | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null; // traversal / injection guard
  try {
    return await fs.readFile(path.join(HELP_CONTENT_DIR, `${slug}.html`), "utf8");
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/help/load-guide.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/help/load-guide.ts src/lib/help/load-guide.test.ts
git commit -m "feat(help): guide fragment loader with traversal guard"
```

---

### Task 6: Doc-header component (TDD)

**Files:**
- Create: `src/components/help/help-doc-header.tsx`
- Test: `src/components/help/help-doc-header.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpDocHeader } from "./help-doc-header";

describe("HelpDocHeader", () => {
  it("renders title, subtitle, version and meta note", () => {
    render(
      <HelpDocHeader
        title="Client Onboarding Process"
        subtitle="1o8 Marketplace — Internal Reference"
        version="v1.0 · June 2026"
        metaNote="11 steps · 29 sub-tasks"
      />
    );
    expect(screen.getByText("Client Onboarding Process")).toBeTruthy();
    expect(screen.getByText("1o8 Marketplace — Internal Reference")).toBeTruthy();
    expect(screen.getByText("11 steps · 29 sub-tasks")).toBeTruthy();
  });

  it("omits the meta block when no version or metaNote", () => {
    const { container } = render(<HelpDocHeader title="Help & SOPs" subtitle="Internal Reference" />);
    expect(container.querySelector(".header-meta")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/help/help-doc-header.test.tsx`
Expected: FAIL — cannot resolve `./help-doc-header`.

- [ ] **Step 3: Implement the component**

```tsx
export type HelpDocHeaderProps = {
  title: string;
  subtitle: string;
  version?: string;
  metaNote?: string;
};

export function HelpDocHeader({ title, subtitle, version, metaNote }: HelpDocHeaderProps) {
  return (
    <div className="header">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="1o8"
        className="header-logo"
        style={{ objectFit: "contain", background: "transparent" }}
      />
      <div>
        <div className="header-title">{title}</div>
        <div className="header-sub">{subtitle}</div>
      </div>
      {(version || metaNote) && (
        <div className="header-meta">
          {version}
          {metaNote && (
            <>
              <br />
              <span style={{ color: "#666" }}>{metaNote}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/help/help-doc-header.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/help/help-doc-header.tsx src/components/help/help-doc-header.test.tsx
git commit -m "feat(help): doc-header component"
```

---

### Task 7: Help layout + index page

**Files:**
- Create: `src/app/help/layout.tsx`
- Create: `src/app/help/page.tsx`

- [ ] **Step 1: Create the layout (imports scoped CSS, centers the card)**

```tsx
import "@/styles/help-doc.css";

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1000px] py-2">{children}</div>;
}
```

- [ ] **Step 2: Create the index page**

```tsx
import Link from "next/link";
import { HELP_CATEGORIES, guidesByCategory } from "@/lib/help/registry";
import { HelpDocHeader } from "@/components/help/help-doc-header";

export const metadata = { title: "Help & SOPs · 1o8Hub" };

export default function HelpIndexPage() {
  const grouped = guidesByCategory();
  return (
    <div className="help-doc">
      <HelpDocHeader title="Help & SOPs" subtitle="1o8 Marketplace — Internal Reference" />
      <div className="container">
        {HELP_CATEGORIES.map((cat) => {
          const guides = grouped[cat.id];
          if (!guides.length) return null;
          return (
            <section key={cat.id}>
              <h2 className="section-title">{cat.label}</h2>
              <div className="overview-grid">
                {guides.map((g) => (
                  <Link key={g.slug} href={`/help/${g.slug}`} className="ov-card help-tile">
                    <div className="help-tile-title">{g.title}</div>
                    <div className="help-tile-desc">{g.description}</div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `src/app/help/*` or `src/lib/help/*`.

- [ ] **Step 4: Manual check (dev server)**

Run: `PORT=3000 npm run dev`, sign in as an internal user, open `http://localhost:3000/help`.
Expected: a centered light document card with the dark "Help & SOPs" header and a "Processes & SOPs" section containing one tile — "Client Onboarding Process" — that links to `/help/onboarding-process`. (Empty categories are hidden.)

- [ ] **Step 5: Commit**

```bash
git add src/app/help/layout.tsx src/app/help/page.tsx
git commit -m "feat(help): /help index page + scoped layout"
```

---

### Task 8: Guide detail page

**Files:**
- Create: `src/app/help/[slug]/page.tsx`

- [ ] **Step 1: Create the dynamic guide page**

```tsx
import { notFound } from "next/navigation";
import { getGuide, HELP_GUIDES } from "@/lib/help/registry";
import { loadGuideHtml } from "@/lib/help/load-guide";
import { HelpDocHeader } from "@/components/help/help-doc-header";

export function generateStaticParams() {
  return HELP_GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  return { title: guide ? `${guide.title} · Help · 1o8Hub` : "Help · 1o8Hub" };
}

export default async function HelpGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const html = await loadGuideHtml(slug);
  if (!html) notFound();

  return (
    <div className="help-doc">
      <HelpDocHeader
        title={guide.title}
        subtitle={guide.subtitle}
        version={guide.version}
        metaNote={guide.metaNote}
      />
      <div className="container" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual check (dev server)**

With the dev server running, open `http://localhost:3000/help/onboarding-process`.
Expected: dark doc-header ("Client Onboarding Process" / "v1.0 · June 2026" / "11 steps · 29 sub-tasks"), then the Overview cards, all 11 step cards with substeps, the Drive folder tree, and the status-change section. The step screenshots load from `/help/*.png` (no broken images). An unknown slug (`/help/nope`) renders the 404.

- [ ] **Step 4: Commit**

```bash
git add "src/app/help/[slug]/page.tsx"
git commit -m "feat(help): /help/[slug] guide detail page"
```

---

### Task 9: Ensure content fragments deploy on Vercel

`fs` reads of files Next.js hasn't traced fail on Vercel. Add the content dir to `outputFileTracingIncludes` (belt-and-suspenders alongside `generateStaticParams`, which reads fragments at build time).

**Files:**
- Modify: `next.config.ts` (the existing `outputFileTracingIncludes` object)

- [ ] **Step 1: Add the `/help/[slug]` include**

Change the existing block:

```ts
  outputFileTracingIncludes: {
    "/api/reports/monthly/pdf": [
      "./node_modules/@sparticuz/chromium/**/*",
    ],
  },
```

to:

```ts
  outputFileTracingIncludes: {
    "/api/reports/monthly/pdf": [
      "./node_modules/@sparticuz/chromium/**/*",
    ],
    "/help/[slug]": [
      "./src/content/help/**/*",
    ],
  },
```

- [ ] **Step 2: Production build proof (this is the real test for the fs concern)**

Run: `npm run build`
Expected: build succeeds; `/help/[slug]` appears in the route output (statically generated for `onboarding-process` via `generateStaticParams`), no fs/ENOENT errors.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "chore(help): include content fragments in serverless trace"
```

---

### Task 10: Add the "Help" nav item

**Files:**
- Modify: `src/components/layout/top-nav.tsx` (lucide import block near top; `topLevelItems` at ~line 150)

- [ ] **Step 1: Import the icon**

Add `HelpCircle` to the existing `from "lucide-react"` import in `top-nav.tsx` (insert alphabetically/anywhere in the named-import list). Verify it isn't already imported first:

Run: `grep -n "HelpCircle" src/components/layout/top-nav.tsx`
Expected before edit: no output. If present, skip this step.

- [ ] **Step 2: Add the top-level nav item**

Change `topLevelItems` (currently):

```ts
  const topLevelItems: NavItem[] = [
    { title: "Calendar", href: "/calendar", icon: CalendarDays, visible: checkAccess("calendar") },
  ];
```

to:

```ts
  const topLevelItems: NavItem[] = [
    { title: "Calendar", href: "/calendar", icon: CalendarDays, visible: checkAccess("calendar") },
    { title: "Help", href: "/help", icon: HelpCircle, visible: true },
  ];
```

- [ ] **Step 3: Verify type-check + manual nav**

Run: `npx tsc --noEmit`
Expected: no new errors.
Manual: with the dev server running, confirm "Help" appears in the top-level nav for an internal user and routes to `/help`.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/top-nav.tsx
git commit -m "feat(help): top-level Help nav item"
```

---

### Task 11: Full verification pass

No new code — prove the feature end-to-end before declaring done.

- [ ] **Step 1: Tests, types, lint, build**

```bash
npx vitest run src/lib/help src/components/help
npx tsc --noEmit
npm run lint
npm run build
```
Expected: all help tests pass; no new tsc errors; lint clean on the new files (the pre-existing `react-doctor` "rule not found" warnings on unrelated files are not regressions); build succeeds with `/help` and `/help/[slug]` in the route list.

- [ ] **Step 2: CSS isolation check**

With the dev server running: visit `/help`, then navigate to a dark hub page (e.g. `/products` or `/`).
Expected: the hub shell is unchanged — no light background, no `14px` base font, no margin reset bleeding from `help-doc.css`. (Confirms namespacing held.)

- [ ] **Step 3: Role gate check**

Confirm a `client`-role session cannot reach `/help` (existing proxy redirects/blocks) and that the portal shell never shows a "Help" nav item (clients don't render the hub `TopNav`).

- [ ] **Step 4: Update the spec status**

Mark v1 complete in `docs/superpowers/specs/2026-06-02-help-sop-section-design.md` (change the header `Status:` line). Commit:

```bash
git add docs/superpowers/specs/2026-06-02-help-sop-section-design.md
git commit -m "docs(help): mark v1 framework + onboarding guide complete"
```

---

## Self-review notes

- **Spec coverage:** routes (Tasks 7,8) · scoped design system w/ extensions + isolation rule (Task 2) · registry (Task 3) · HTML-fragment model + loader (Tasks 4,5) · doc-header kept (Task 6) · index w/ categories (Task 7) · nav item all-roles (Task 10) · Vercel fs / production-build proof (Task 9, Task 11) · CSS-isolation + role checks (Task 11). v1 scope = framework + onboarding only; follow-on docs are intentionally deferred per spec.
- **Type consistency:** `HelpGuide`, `HelpCategory`, `getGuide`, `guidesByCategory`, `loadGuideHtml`, `HelpDocHeader`/`HelpDocHeaderProps` names match across registry, loader, pages, and component.
- **No placeholders:** the only non-inlined content (the lines 9–295 CSS port and the lines 316–799 fragment) is produced by exact, deterministic transformations against a committed source file, with explicit verification steps — not "fill in later."
