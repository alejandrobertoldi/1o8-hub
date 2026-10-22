# Help / SOP Section — Design Spec

**Date:** 2026-06-02
**Status:** v1 complete (2026-06-02) — framework + onboarding guide shipped. Follow-on docs deferred per "Follow-on plans" table.
**Owner:** Manu

## Summary

Add a **Help / SOP** section to the 1o8Hub (internal hub, not the client portal). It is a single in-app destination holding both team process SOPs (client onboarding, SEO pipeline, design/content process) and app how-to guides. Every guide renders **natively** in the visual language of `docs/onboarding-process.html`, which is the canonical layout template. No iframes, no client-portal exposure.

## Decisions (locked — do not re-litigate)

- **Audience:** all internal hub roles (admin, editor, viewer). Not shown in the client portal. Enforced for free by the existing proxy — clients only reach `/portal/*`, `/aplus2`, and whitelisted APIs, so `/help` is hub-only with no new gating.
- **Content scope:** one section covering both SOPs and app how-to guides.
- **Source content:** reuse the existing `docs/*.html` content, re-skinned into the template (not iframed as-is).
- **Layout template:** `docs/onboarding-process.html` is THE template. Its aesthetic (dark doc-header, light canvas, gold section titles, card kit) is the design language for the whole section.
- **Rendering model:** unified — every guide rendered natively in the template look. No iframes.
- **Content model:** each guide is an HTML fragment (template-classed) rendered server-side into a scoped `.help-doc` container via `dangerouslySetInnerHTML`. Content is first-party/internal, so this is acceptable risk.
- **Navigation:** a single top-level "Help" nav item (not under Admin), visible to all hub roles. No `?` header icon in v1.
- **Doc header:** keep the template's own dark doc-header (logo + title + version) at the top of each guide's canvas, below the hub top-nav.
- **v1 scope:** ship the framework + the onboarding guide fully migrated. Remaining docs migrate in follow-on plans.

## Out of scope (YAGNI)

- No in-app editing / CRUD, no database table.
- No search (v1).
- No client-portal exposure, no per-guide visibility flags.
- No markdown/MDX renderer.
- No `/api` route and no `src/proxy.ts` changes (hub-only is already enforced).

## Architecture

### File layout

```
src/app/help/
  layout.tsx              # provides the scoped .help-doc canvas wrapper; hub TopNav renders above (internal route)
  page.tsx                # /help — index: guides grouped by category, template-styled
  [slug]/page.tsx         # /help/<slug> — Server Component: reads fragment, renders doc-header + content
  [slug]/not-found.tsx    # unknown slug → friendly 404 within the template (optional, can reuse default)

src/lib/help/registry.ts  # single source of truth for guides (see below)
src/content/help/<slug>.html   # each guide body as a template-classed HTML fragment
src/styles/help-doc.css   # onboarding-process.html CSS, every rule namespaced under .help-doc

public/help/              # screenshots referenced by guides (step2.png … step7.png,
                          # step3-asana-menu.png, step3-asana-link.png, step6-tree.png,
                          # edit-client-dialog.png). logo.png already exists in public/.
```

### Routing & layout integration

- `/help` and `/help/[slug]` are **internal routes** → they get the hub `TopNav` + the `glass-panel` `<main>` (dark, `pt-6 lg:pt-8 px-6 pb-6`) from `LayoutRouter` automatically. **No `LayoutRouter` change needed.**
- The `.help-doc` wrapper is a **centered rounded document card** (`max-width: ~1000px; margin: 0 auto; border-radius; overflow: hidden; box-shadow`) sitting inside the hub's dark `<main>` over the ambient background. The template's dark header bar is the top of this card; the light canvas (`#f8f7f4`) is the body. This reads as "a document opened inside the app" and avoids fighting the existing layout padding.

### Scoped template design system — `src/styles/help-doc.css`

- Port the entire `<style>` block from `docs/onboarding-process.html`, **namespacing every selector under `.help-doc`** (e.g. `.help-doc { … }`, `.help-doc .step-card { … }`, `.help-doc .section-title { … }`).
- **Critical:** no bare `body`, `html`, or `*` rules may leak globally. The light background, base font-size, and color live ONLY inside `.help-doc`. (This honors the standing rule that report/print CSS with global rules bleeds into the app — see `feedback_report_css_isolation`.)
- The base class vocabulary carried over: `header` (doc-header), `section-title`, `overview-grid`/`ov-card`, `steps-list`/`step-card`/`step-num`/`step-body`/`step-title`/`step-desc`, `substeps`/`substep`/`substep-dot`/`substep-label`/`substep-desc`, `badge` variants, `type-pill` variants, `folder-tree`, `status-grid`/`status-card`, `flow-arrow`/`flow-pill`, `confirm-note`, plus the `@media print` block (scoped).
- **Extensions needed for re-skinning the other docs** (onboarding lacks these): prose typography (`p`, `ul`/`ol`, `h3`/`h4`, links), a `toc` table-of-contents block, `code`/`pre` prompt blocks, and `table`/callout styles. All scoped under `.help-doc`. This is the bulk of the design-system work and is reused by every migrated guide.
- Dark mode: the doc card stays light in both hub themes (it's a "document"); ensure text colors are explicit so the card is unaffected by the hub's dark-mode token flips.

### Guide registry — `src/lib/help/registry.ts`

```ts
export type HelpCategory = "getting-started" | "processes" | "reference";

export type HelpGuide = {
  slug: string;          // URL segment, e.g. "onboarding-process"
  title: string;         // doc-header title, e.g. "Client Onboarding Process"
  subtitle: string;      // doc-header sub, e.g. "1o8 Marketplace — Internal Reference"
  description: string;   // one-liner for the index tile
  category: HelpCategory;
  version?: string;      // header-meta, e.g. "v1.0 · June 2026"
  metaNote?: string;     // header-meta second line, e.g. "11 steps · 29 sub-tasks"
};

export const HELP_CATEGORIES: { id: HelpCategory; label: string }[] = [
  { id: "getting-started", label: "Getting Started" },
  { id: "processes",       label: "Processes & SOPs" },
  { id: "reference",       label: "Reference" },
];

export const HELP_GUIDES: HelpGuide[] = [ /* see "Guides" below */ ];
```

The registry drives: the index grouping, the `[slug]` lookup/validation, and the doc-header contents. Adding a guide = add a registry entry + drop a `src/content/help/<slug>.html` fragment.

### Content fragments & loading

- Each guide's content is the inner `<body>` markup of its source doc, re-marked-up with the `.help-doc` class vocabulary, saved to `src/content/help/<slug>.html`.
- `[slug]/page.tsx` is a **Server Component**: validate `slug` against the registry (404 if unknown), `fs.readFile` the fragment, render:
  ```tsx
  <div className="help-doc">
    <HelpDocHeader guide={guide} />     {/* dark bar: logo + title + subtitle + version/meta */}
    <div className="container" dangerouslySetInnerHTML={{ __html: fragmentHtml }} />
  </div>
  ```
- **Vercel bundling:** add `outputFileTracingIncludes` to `next.config` so `src/content/help/**` ships in the serverless bundle (fs reads of non-traced files fail on Vercel otherwise). Verify in a production build, not just local.
- Image references inside fragments use absolute `/help/<img>.png` paths (served from `public/help/`). Screenshots are generic UI captures, acceptable as public assets; the SOP *text* is what stays hub-gated via the route.

### Index page — `/help`

- Renders inside the same `.help-doc` card.
- Dark doc-header: title "Help & SOPs", subtitle "1o8 Marketplace — Internal Reference".
- Body: for each category in `HELP_CATEGORIES`, a `section-title` header followed by a grid of `ov-card`-style tiles (one per guide in that category) — tile = title + `description` + links to `/help/<slug>`. Categories with no guides are omitted.

### Navigation — `src/components/layout/top-nav.tsx`

- Add a top-level item to `topLevelItems` (line ~150):
  ```ts
  { title: "Help", href: "/help", icon: HelpCircle, visible: true },
  ```
- `HelpCircle` imported from `lucide-react`. `visible: true` (all hub roles). Not placed in the Admin section.

## Guides

### v1 (this implementation plan)

| slug                 | title                       | category        | source                         |
|----------------------|-----------------------------|-----------------|--------------------------------|
| `onboarding-process` | Client Onboarding Process   | processes       | `docs/onboarding-process.html` (near-verbatim — already uses template classes) |

v1 also delivers: routes, `help-doc.css` (incl. extensions), registry, index page, nav item, `public/help/` assets, `next.config` tracing.

### Follow-on plans (one per doc, sequenced by value; confirm evergreen-vs-one-off before migrating)

| slug                          | source                              | notes                                  |
|-------------------------------|-------------------------------------|----------------------------------------|
| `seo-manager-process`         | `docs/seo-manager-process.html`     | TOC + flowchart + prose extensions     |
| `content-guidelines`          | `docs/content-guidelines-explainer.html` | tier diagrams                      |
| `seo-prompts-reference`       | `docs/seo-prompts-reference.html`   | code/prompt blocks; category: reference|
| `brand-story-section`         | `docs/brand-story-section.html`     | feature doc                            |
| `case-study-redesign`         | `docs/case-study-redesign.html`     | confirm if evergreen                   |
| `design-audit`                | `docs/design-audit.html`            | likely one-off report — confirm before migrating |
| `seo-manager-complete`        | `docs/seo-manager-complete.html`    | 172 KB — largest; may split or defer   |

## Testing / verification

- `npx tsc --noEmit` clean.
- `npm run lint` clean on new files.
- `npm run build` succeeds AND `/help/onboarding-process` renders the fragment in a **production** build (proves `outputFileTracingIncludes` works — local `npm run dev` is not sufficient evidence for the Vercel fs concern).
- Manual (PORT=3000): `/help` index lists onboarding under "Processes & SOPs"; `/help/onboarding-process` shows the dark doc-header + light canvas + all 11 step cards + images load from `/help/*.png`.
- CSS isolation check: navigate `/help` then a dark hub page (e.g. `/products`) — confirm no light-background or font-size bleed into the hub shell (no global rule escaped `.help-doc`).
- Role check: confirm a client-role session is blocked from `/help` (existing proxy), and the "Help" nav item is absent there (clients don't render the hub TopNav).

## Open items to confirm during follow-on (not blocking v1)

- Which of the follow-on docs are evergreen SOPs vs one-off reports (drop the latter).
- Whether `seo-manager-complete` (172 KB) supersedes `seo-manager-process` or both are kept.
