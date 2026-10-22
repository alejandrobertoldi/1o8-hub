# Handoff — Portal UX Review & Token Sweep (2026-04-21)

## What was done this session

Full UX review of `/portal/*` using `ui-ux-pro-max` skill, then fixes applied across the portal.

### 1. Dual-accent rule codified
Portal uses blue `#2563EB` (light) / `#60A5FA` (dark) for **all** headers. Hub uses gold `#E8A700` / `#F8BF1C`. Never mix.

**DESIGN.md** (`/Users/manu/1o8Hub/DESIGN.md`) updated with:
- `--portal-accent` + `--portal-accent-hover` token rows
- Explicit rule: all `/portal/*` h1 headers fully blue across both spans (jammed-word brand pattern preserved; aria-label carries spaced version)
- "Never use raw hex `#2563EB` in className — always the token"

**globals.css** (`/Users/manu/1o8Hub/src/app/globals.css`) defines the CSS vars in `:root` + `.dark` and exposes as `text-portal-accent` / `bg-portal-accent` / `border-portal-accent` via `@theme inline`.

### 2. Portal landing pages rewritten (consistent chrome)
- `src/app/portal/page.tsx` (ClientDashboard + AdminPortalLanding)
- `src/app/portal/sales/page.tsx`
- `src/app/portal/finance/page.tsx`
- `src/app/portal/design/page.tsx`

All now: sticky header + `-mx-6 lg:-mx-10` bleed + back-link + `aria-label` + both-span portal-accent h1 + `bg-card` / `border-border` tokens + `opacity-60 group-hover:opacity-100` on "View" CTA (no more hover-only on touch).

### 3. `portal/page.tsx` specific UX fixes
- `confirm()` → `AlertDialog` with trash icon on Remove button
- Persistent admin-preview banner (blue, shows "viewing as {client}" + exit-preview link)
- `SECTION_CARDS.id = "finance"` corrected to `"finances"` (matches CLIENT_SECTIONS + permission key)
- Escape-key close on client-assignment dropdown (keyboard a11y)
- `aria-label` on split-color h1s
- Mailto CTA on empty-state card

### 4. Token sweep across 12 other portal pages
Subagent swapped raw `text-[#2563eb]`/`text-[#60a5fa]` → `text-portal-accent`, `bg-white dark:bg-[#1a1c2a]` → `bg-card`, and both-span blue on split headers with `aria-label`. Files: `sales/overview`, `sales/forecast`, `sales/inventory`, `timeline`, `finance/reports`, `design/storefront`, `design/listing-images`, `design/brandstory`, `products`, `reports`, `seo`, `aplus`.

**Preserved (not swept):** `const BLUE = "#2563eb"` + `LINE_COLORS` array in `portal/sales/overview/page.tsx` — chart data colors.

## Verification status
- `tsc --noEmit` on touched files: 0 errors
- Lint: only 1 pre-existing warning (`filter((c) => true)` dead code at `portal/page.tsx:431`), unrelated to this work
- **Not yet verified:** visual dogfood via dev server. Dev server should be started and every portal landing visually checked for regression.

## Next step (exact)
1. Start dev server: `PORT=3000 npm run dev`
2. Visit `/portal` as admin → check the Admin landing (gold→blue heading, active-client cards, Remove button AlertDialog)
3. Visit `/portal?client=<code>` → confirm new blue "Admin preview" banner shows
4. Click each section card → verify back-link + blue headers + semantic card surfaces
5. Toggle dark mode → re-verify each page
6. If all good, commit with message: `feat(portal): dual-accent token + UX pass (blue portal headers, AlertDialog, admin banner)`

## Pending from prior sessions (unchanged)
- Per-ASIN inventory tracking
- Forecast Impressions fix
- Push to Sales Forecast E2E verification
- Variation builder Color column
- Campaigns table pagination
- Error message sanitization (60+ routes)
- Google Sheets attribute template plan — not started (primer.md still points to it as next work)

## Copy-paste resume prompt

> Continuing the portal UX pass from 2026-04-21. Full handoff at `docs/superpowers/handoffs/2026-04-21-portal-ux-review.md`. Read that first. Current state: all code edits done, type-check clean, dev-server verification pending. Start dev server on PORT=3000, visually check every portal landing (light + dark), flag any regression, then commit.
