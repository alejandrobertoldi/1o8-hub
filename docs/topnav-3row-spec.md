# 1o8Hub TopNav — 3-Row Header Spec

## Overview

A sticky 3-row header (`<header sticky top-0 z-50 bg-sidebar text-sidebar-foreground border-b border-sidebar-border>`). Desktop only (`lg:` breakpoint and up). On mobile, replaced by a hamburger menu.

Layout: a flex row with **two children**:
1. **Logo column** (left) — fixed-width, spans all 3 rows but aligned to top.
2. **Right column** (flex-1) — contains rows 1, 2, 3 stacked vertically.

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │ Row 1: Utilities (h-14)                                  │
│   LOGO   ├──────────────────────────────────────────────────────────┤
│ (108     │ Row 2: Page-header slot · Nav · Wordmark                 │
│  Market- ├──────────────────────────────────────────────────────────┤
│  place)  │ Row 3: Page meta slot (border-t, only when populated)    │
└──────────┴──────────────────────────────────────────────────────────┘
```

---

## Logo column

- **Image**: `/1o8Mlogo.png`, 70×70 px, `object-contain`, `rounded-md`.
- **Container**: `hidden lg:flex items-start justify-center shrink-0 px-5 pt-2 group`.
- **Hover**: scales image to 1.05.
- **Alignment**: top-aligned (`items-start pt-2`) — the 3 rows extend taller than the logo, but the logo anchors at the top.

---

## Row 1 — Utilities

**Height**: `h-14` (56 px). **Padding**: `px-4 lg:px-6`. **Layout**: `flex items-center`.

**Left**: `flex-1` spacer (pushes utilities right).

**Right** (`flex items-center gap-1.5`):
1. **Search trigger** — bordered button, opens command palette. Class: `rounded-md border border-sidebar-border bg-sidebar-accent/50 px-3 py-1.5 text-xs`. Icon `Search h-3.5 w-3.5`. Text "Search...". Kbd hint "⌘K".
2. **Open issues alert** (admin, when `openIssues > 0`) — link `/admin/issues`, red bg `bg-red-50 hover:bg-red-100`, icon `MessageSquareText h-3.5 w-3.5`, count.
3. **Pending users alert** (admin, when `pendingCount > 0`) — link `/admin/users`, amber bg, icon `UserPlus h-3.5 w-3.5`, count.
4. **Feedback button** — opens dialog. Icon `MessageSquareText h-4 w-4`, `rounded-md p-2 text-muted-foreground`.
5. **Theme toggle** — dark/light switch.
6. **User menu** — avatar + name + role badge.

> Note: a "deploy info" badge previously sat between search and alerts; it was removed.

---

## Row 2 — Nav

**Wrapper**: `<nav className="hidden lg:flex items-center text-sm font-medium px-4 lg:px-6">`.

**3 children**, in order:

### 2a. Page-header slot (left)
```jsx
<div id="page-header-slot" className="flex-1 flex items-center min-w-0" />
```
- Pages portal a header into here via `<PageHeaderSlot>` from `@/components/layout/page-header-slot`.
- `flex-1` so it acts as a left spacer when empty.
- Currently unused on `/sales-summary` (the page's title was relocated to row 3).

### 2b. Navigation menu (center)
- `<NavigationMenu viewport={false}>` from shadcn/ui.
- Top-level items: `Calendar`.
- Section dropdowns: `Clients`, `Catalog`, `Design`, `PPC`, `SEO`, `Finances`, `Admin`.
- Each trigger: `h-10 px-4 py-2 text-sm font-medium bg-transparent rounded-none`.
  - Active section: `text-brand border-b-2 border-brand`.
  - Inactive: `text-muted-foreground hover:text-sidebar-foreground`.
- Dropdown content: `grid w-[320px] gap-1 p-3` with item rows (icon `h-4 w-4` + label).

### 2c. Wordmark (right)
```jsx
<div className="flex-1 flex justify-end">
  <Link href="/">
    <span className="text-2xl font-[family-name:var(--font-geist-sans)] tracking-tighter leading-tight">
      <span className="font-bold text-sidebar-foreground">1o8</span>
      <span className="font-normal text-[#E8A700]">Hub</span>
    </span>
  </Link>
</div>
```
- "1o8" = bold, sidebar-foreground.
- "Hub" = normal weight, brand gold `#E8A700`.
- Geist Sans, `tracking-tighter`, `leading-tight`, `text-2xl` (24 px).

---

## Row 3 — Page meta slot

```jsx
<div
  id="page-meta-slot"
  className="hidden lg:flex items-center justify-between gap-4 pl-2 pr-4 lg:pl-3 lg:pr-6 py-0.5 border-t border-sidebar-border/40 empty:hidden"
/>
```

- **Border-top**: separates row 3 from row 2.
- **`empty:hidden`**: row hides itself when no portal content.
- **Asymmetric padding**: `pl-2 lg:pl-3` (tight to the logo edge) / `pr-4 lg:pr-6`.
- **Vertical padding**: `py-0.5` (very tight).
- **Layout**: `flex items-center justify-between gap-4` — splits content into left group and right group.

### Filled by `<PageMetaSlot>` from page

Currently used by `/sales-summary`. Pattern:

```jsx
<PageMetaSlot>
  <div className="flex items-center gap-4 min-w-0">
    {/* LEFT GROUP: title + redshift status */}
    <div className="flex items-center gap-2 shrink-0">
      <h1 className="text-[2.2rem] tracking-tighter leading-none">
        <span className="font-bold text-sidebar-foreground">Sales</span>
        <span className="font-normal text-brand">Summary</span>
      </h1>
      <button title="Refresh data" /* refresh icon */ />
    </div>
    <div className="min-w-0">
      {/* Redshift data: Sat, Apr 25, 2026 · yesterday */}
      {/* DB refreshed: 5:25 PM UTC (12m ago) */}
      {/* Page refreshed: 5:33:15 PM UTC (0s ago) */}
    </div>
  </div>

  {/* RIGHT GROUP: date slicer */}
  <div className="glass-card rounded-lg border border-border/60 px-3 py-1 text-sm w-fit shrink-0 flex items-center gap-2">
    {/* Mode toggle: Week | Custom */}
    {/* Year select | Week select | date range */}
  </div>
</PageMetaSlot>
```

### Page title (left)
- Font: Geist Sans, `text-[2.2rem]` (~35 px), `tracking-tighter`, `leading-none`.
- "Sales" = `font-bold text-sidebar-foreground` (white).
- "Summary" = `font-normal text-brand` (gold `#E8A700`).
- **Refresh icon** beside it: rotating-arrow SVG, 16×16 px, `text-brand`, spins (`animate-spin`) while fetching.

### Redshift status (next to title)
Three stacked text rows, monospace, decreasing emphasis:
1. `Redshift data: <date> · <relative>` — `text-xs font-mono text-foreground/50` (or `text-amber-400` with pulsing dot if stale > 2 days).
2. `DB refreshed: <time> UTC (<ago>)` — `text-[10px] font-mono text-foreground/35`.
3. `Page refreshed: <time> UTC (<ago>)` — `text-[10px] font-mono text-foreground/35`.

### Date slicer (right)
**Container**: `glass-card rounded-lg border border-border/60 px-3 py-1 text-sm flex items-center gap-2`.

Components in order, separated by `<div className="h-4 w-px bg-border/40" />` dividers:
1. **Mode toggle pill**: `flex gap-0.5 p-0.5 rounded-lg bg-muted/30 border border-border/40`.
   - Buttons: `px-2 py-0.5 rounded-md text-xs font-bold`.
   - Active: `bg-brand text-black shadow-sm`. Inactive: `text-foreground/70`.
   - Labels: `Week`, `Custom`.
2. **Week mode** — `Year` select + `Week` select + date range readout (`<start> – <end>`).
3. **Custom mode** — `<input type="date">` × 2 + day count.
- Selects: `bg-background border border-border/60 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums`.

---

## Page content offset

To eliminate the gap between row 3 and the page's first content (the sticky table headers), the page root uses negative margin to cancel `<main>`'s top padding (`pt-6 lg:pt-8`):

```jsx
<div className="-mt-6 lg:-mt-8">
  {/* page content */}
</div>
```

## Sticky table headers below row 3

The yellow client-card header uses **native CSS sticky** with negative `top` to compensate for `main`'s `pt`:

```jsx
<div
  ref={headerRef}
  className="sticky -top-6 lg:-top-8 z-[49] px-5 py-4 bg-[#F8BF1C] rounded-t-xl"
  style={{ boxShadow: "0 0 0 2px black" }}
>
```
- `-top-6 lg:-top-8` makes it stick exactly at the bottom of the top-nav (right below row 3).
- `z-[49]` keeps it under the nav (`z-50`) but above all other page content.
- Multiple sticky headers (one per ClientCard) stack-replace naturally as you scroll.

Table column-headers (`<thead>`) are still pinned via a JS-driven fixed-position clone (because the table sits inside an `overflow-hidden` container that breaks sticky). Clone z-index = 48.

---

## Key tokens / colors

- Brand gold: `#E8A700` (Tailwind `text-brand` / wordmark).
- Template gold (client-card header bg): `#F8BF1C`.
- Sidebar bg: `bg-sidebar` (CSS var).
- Sidebar border: `border-sidebar-border`.
- Foreground (white-ish on dark): `text-sidebar-foreground`.
- Font family: Geist Sans (`var(--font-geist-sans)`), Geist Mono for status text.

## Z-index layers (top→bottom)
- `z-50` — TopNav `<header>` (always on top).
- `z-49` — pinned client-card header (sticky).
- `z-48` — pinned table thead clone (fixed).
- `z-30` (legacy) — in-page sticky (no longer used).
- `z-10` — `<main>` element (creates stacking context).

---

## File reference

- `src/components/layout/top-nav.tsx` — TopNav component.
- `src/components/layout/page-header-slot.tsx` — `PageHeaderSlot` and `PageMetaSlot` portal helpers.
- `src/components/layout/layout-router.tsx` — routes that use TopNav vs portal-shell.
- `src/app/sales-summary/page.tsx` — primary consumer of `PageMetaSlot`.
