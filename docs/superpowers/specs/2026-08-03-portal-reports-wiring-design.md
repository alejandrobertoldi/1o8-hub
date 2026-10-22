# Portal Reports Wiring — Design Spec

**Date:** 2026-08-03
**Status:** Approved design → ready for writing-plans
**Builds on:** `docs/superpowers/specs/2026-07-27-reports-redesign-design.md` (locked the `surface: "hub" | "portal"` architecture; this spec is the deferred "wire the portal surface" half of that work, now extended to all six sections instead of just Overview)
**Brand authority:** `DESIGN.md` (dual-accent rule: hub = orange, portal = charcoal, never mixed)

---

## 1. Purpose & problem

The hub side of the reports rebuild ("reports-v2") is finished: `/reports/overview`, `/reports/advertising-audit`, `/reports/inventory`, `/reports/period-comparative`, `/reports/share-of-voice`, and `/reports/subscribe-save` are all thin 20–53 line page shells that pull a shared `useReportControls()` hook and render one `src/components/reports/v2/*` section component.

**Corrected 2026-08-03 (see §9):** only `PerformanceOverviewV2` actually accepts a `surface` prop today — it is the one page that passes `surface="hub"`. The `surface: "hub" | "portal"` architecture exists and works (`getSurfacePalette` in `primitives/palette.ts`, `accentFor` in `primitives/chart-colors.ts`), and the overview's sub-components all consume it. But the other five section components were built hub-only and hardcode hub orange, so wiring the portal requires threading `surface` into them first. §9 carries the verified per-file inventory.

The client-portal side never got that swap. `src/app/portal/reports2/*` has route folders with matching names (`overview`, `advertising-audit`, `inventory`, `period-comparative`, `share-of-voice`, `subscribe-save`) but each one is a separate, hand-rolled 130–270 line implementation: its own date-picker state, its own `/api/portal/me/client` fetch, and the *old* pre-v2 KPI card components (`total-sales-card`, etc.) on a hardcoded dark canvas. A second, older, now-orphaned implementation also exists at `src/app/portal/reports/page.tsx` — a Power BI iframe embed, not linked from anywhere in the app anymore.

This spec wires the portal to the same v2 components the hub already uses, scoped to one client's data, and retires the dead iframe page.

---

## 2. Scope

### In scope

- Thread a `surface` prop into the five section components that lack one, replacing hardcoded hub orange with `accentFor(surface)` / `getSurfacePalette(surface)` (§9 lists the exact files and lines). Also `InventoryDateBadge`, which the portal inventory page reuses as `extras`.
- A source-level regression guard test asserting no v2 section component reintroduces hub orange outside an approved allowlist.
- Delete the orphaned `/portal/reports` Power BI iframe page and its sole API dependency.
- Rename `src/app/portal/reports2/*` → `src/app/portal/reports/*` (the freed URL).
- Rewrite the six section pages under the renamed `portal/reports/*` as thin shells rendering the same `src/components/reports/v2/*` components the hub uses, with `surface="portal"`.
- New `usePortalReportControls()` hook + provider: resolves the account from the logged-in client's own session (or `?client=` for admin preview), no free client-select.
- Server/client-side permission enforcement per section page (today only the index card grid hides a link; direct navigation to a disabled section currently loads it anyway).
- Update the handful of internal links/nav entries that point at `/portal/reports2`.

### Out of scope (untouched)

- `business-model-audit` (portal-only, no hub equivalent) — only its one internal link path changes.
- `src/app/reports/monthly/*` (separate report type).
- The hub's top-nav report tab strip (`src/components/layout/top-nav.tsx`) — stays hub-only. Portal keeps a simple "← Back to reports" link instead (see §5).
- Any backend/API/schema change. `aac.powerbiEmbedUrl` and its external sync (`src/lib/sync-tables.ts`) are left alone — the column has a real, unrelated producer; only its two portal-side consumers (the iframe page and the embed-url route) go away.
- AI-generated insight copy, chart/table redesign — this is a wiring change, not a visual redesign; the six v2 section components render as-is.

### Locked decisions (do not re-litigate)

1. Target is `portal/reports2` (the linked, nav-reachable page), not the orphaned `portal/reports` iframe. The iframe page is deleted, not preserved.
2. `reports2` is renamed to `reports` now that the old URL is free — no permanent "2" suffix.
3. The manual "Refresh ↻" button (force re-query Redshift/BigQuery, bypass cache) is hub/internal-only. Portal pages never render it; clients see data as last refreshed by the team/cron.
4. Permission gating moves from index-only (hide the card) to per-page (block direct navigation too). A client who lacks a section sees an explicit "not available" message if they navigate there directly.
5. Portal keeps today's simple back-link pattern for switching between report sections — no new top-nav tab strip.

---

## 3. Architecture

### Controls hook: `usePortalReportControls()`

New file: `src/components/reports/v2/use-portal-report-controls.ts`. Same *shape* as the hub's `ReportControls` (`use-report-controls.ts`) so the section components don't need to know which surface fed them — but a different source for the account:

```ts
export interface PortalReportControls {
  // client identity (resolved, not selectable)
  clientIdCode: string;
  clientName: string;
  clientStatus: string | null;
  accountId: string;               // rawData.IntentwiseID
  allowedSections: string[];
  isAdminPreview: boolean;
  isProspect: boolean;
  /** Page gate. Admin preview and prospects bypass, so an admin can open any
      section of the client they are previewing. */
  canAccessSection: (sectionId: string) => boolean;
  /** The *client's own* grant, ignoring admin-preview bypass. The index card
      grid needs this to keep showing "Hidden from client" at 40% opacity —
      see §9 correction 4. */
  clientHasSection: (sectionId: string) => boolean;

  // resolution state
  loading: boolean;
  notFound: boolean;               // no client linked / client row missing

  // date range — identical shape/logic to the hub hook (shared resolveRange)
  mode: RangeMode;
  setMode: (m: RangeMode) => void;
  customStart: string; setCustomStart: (v: string) => void;
  customEnd: string; setCustomEnd: (v: string) => void;
  year: number; setYear: (y: number) => void;
  week: number; setWeek: (w: number) => void;
  start: string;
  end: string;
}
```

Resolution logic (mirrors what `portal/reports2/page.tsx` and `/api/portal/me/client` already do today, consolidated into one place):

- `clientCode = isAdmin ? searchParams.get("client") : session.user.clientIdCode` (first code if comma-separated).
- Fetch the client row via `/api/portal/me/client` (already handles the admin-preview `?client=` override server-side).
- `allowedSections`: for a real client session, `session.user.allowedSections` (already resolved server-side). For admin preview, fetch `/api/clients` and use the previewed client's `allowedSections` — same as today's index page.
- `canAccessSection(id)` = `isAdminPreview || isProspect || canAccess(`reports-${id}`, allowedSections, false)`. This one function replaces the duplicated inline boolean currently in `portal/reports2/page.tsx`'s card loop, and is what each section page's gate calls too.
- Date-range state/logic (`mode`, `year`, `week`, `customStart/End`, `resolveRange`) is copy-identical to the hub hook — same shared `@/lib/report-date-range` helpers, just a second small hook rather than parameterizing the existing one (the hub hook's client-*list* fetching has no portal equivalent, so sharing one hook would mean threading an "is this hub or portal" branch through it — a new, smaller hook is simpler and keeps each one single-purpose).

State lives in a `PortalReportControlsProvider`, mounted by a new `src/app/portal/reports/layout.tsx` (parallel to `src/app/reports/layout.tsx`), so the date-range selection persists when a client switches between report pages within one visit — matching hub behavior.

### `ReportsControlsBar` extensions

`src/components/reports/v2/reports-controls-bar.tsx` gains four new optional props, all defaulting to today's behavior (hub call sites need zero changes):

- `showClientSelect?: boolean = true` — `false` on portal hides the `<select>` and renders `clientLabel` as static text instead.
- `showRefreshButton?: boolean = true` — `false` on portal omits the `RefreshButton` entirely.
- `clientLabel?: string` — e.g. `"Acme Co · AC01"`, shown as a small subtitle under the "Client Reports" heading (portal only; replaces the free-select dropdown's implicit identification).
- `backHref?: string` — when set, renders a small "← Back to reports" link before the heading (portal only; hub has no equivalent need since it has the top-nav tab strip).

**Corrected 2026-08-03 (see §9 correction 3):** the bar currently types its prop `controls: ReportControls` and unconditionally destructures `clients`, `clientsLoading`, `selectedClient`, `setSelectedClient` and `bumpRefresh` (lines 31–35) — none of which `PortalReportControls` has. Passing a portal controls object would fail `tsc`. `ReportControls` must therefore first be split into a `ReportRangeControls` base (the date-range fields plus `accountId`, which both surfaces share) and the full `ReportControls extends ReportRangeControls` (adding the client-list and refresh fields). The bar's prop widens to accept the base plus the extras as optional, so hub call sites still typecheck unchanged.

### Section pages

Each of the six portal pages becomes a shell structurally identical to its hub counterpart:

```tsx
"use client";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalReportControls } from "@/components/reports/v2/use-portal-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { AdvertisingAuditSection } from "@/components/reports/v2/advertising-audit-section";

export default function PortalAdvertisingAuditPage() {
  const controls = usePortalReportControls();
  if (controls.loading) return <PortalReportState kind="loading" />;
  if (controls.notFound) return <PortalReportState kind="not-found" />;
  if (!controls.canAccessSection("advertising-audit")) return <PortalReportState kind="unavailable" />;

  const { accountId, start, end, clientName, clientIdCode } = controls;
  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar
          surface="portal"
          controls={controls}
          sectionLabel="Advertising Audit"
          showClientSelect={false}
          showRefreshButton={false}
          clientLabel={`${clientName} · ${clientIdCode}`}
          backHref="/portal/reports"
        />
      </PageMetaSlot>
      <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
        <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
          <div className="mb-5 text-mf-ink">
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">Advertising audit</h1>
            <p className="mt-2.5 max-w-[760px] text-mf-muted">Ad spend, performance and campaign efficiency — campaign breakdowns, ACoS vs goal, segmentation and keyword gaps.</p>
          </div>
          {!accountId && <MissingAccountIdBanner />}
          <AdvertisingAuditSection accountId={accountId} start={start} end={end} refreshKey={0} />
        </main>
      </div>
    </div>
  );
}
```

`inventory` and `subscribe-save` keep the same `showDates={false}` / `extras={...}` special-casing their hub equivalents already use (snapshot date badge; year selector) — copied verbatim, just fed by the portal hook.

One shared presentational file, `src/components/reports/v2/portal-report-state.tsx`, covers the repeated states so none of them are copy-pasted across six pages. It exports two components:

- `PortalReportState({ kind: "loading" | "not-found" | "unavailable" })` — the loading state, the "no client linked to your session" message, and the "not available — contact your account manager" message. Each *replaces* the report body.
- `MissingAccountIdBanner()` — the red "Missing IntentwiseID for this client" strip that every current portal report page inlines (e.g. `portal/reports2/overview/page.tsx:274-280`). This renders *above* the report body rather than replacing it, so it is a separate component, not a fourth `kind`. **Corrected 2026-08-03 (§9 correction 2):** the earlier draft of this spec referenced a `MissingIntentwiseIdBanner` component as if it already existed; no such component exists anywhere in `src/`.

### Index page (card grid)

`portal/reports/page.tsx` (renamed from `reports2/page.tsx`) keeps its current visual design and admin-preview eye-toggle feature untouched, but:

- Drops its own local `client`/`loading` state and `useEffect` fetch, consuming `usePortalReportControls()` from the layout's provider instead.
- Replaces the inline `canAccess(permissionId, effectiveAllowedSections, false)` / `isProspect` boolean with `controls.clientHasSection(card.id)` — **not** `canAccessSection`. **Corrected 2026-08-03 (§9 correction 4):** the index deliberately distinguishes the two. Today `enabled = isProspect || canAccess(...)` excludes the admin-preview bypass, and `if (!isAdminPreview && !enabled) return null` uses `isAdminPreview` only to decide whether a *disabled* card is still shown (at 40% opacity, labelled "Hidden from client", as a `<div>` not a `<Link>`, with the eye toggle). Wiring the index to `canAccessSection` would make every card read as enabled during admin preview, destroying the admin's view of what the client actually has — a regression, not a dedup.
- Internal links change from `/portal/reports2/...` to `/portal/reports/...`.

No visible behavior change — this is a dedup of logic that now has a shared home.

---

## 4. Deletions

- `src/app/portal/reports/page.tsx` (old Power BI iframe — replaced by the renamed `reports2` tree at the same path).
- `src/app/api/portal/embed-url/route.ts` (confirmed via repo-wide grep: its only caller is the page above).

`aac.powerbiEmbedUrl` (the DB column) and `src/lib/sync-tables.ts` (which populates it from an external source) are **not** touched — the column has a life outside the portal reports page and deleting the column would be a schema change, out of scope.

---

## 5. Reference updates (rename fallout, no logic change)

| File | Change |
|---|---|
| `src/app/portal/page.tsx` | `href`/`PROSPECT_SHOWCASE_HREF` entries: `/portal/reports2` → `/portal/reports` |
| `src/components/layout/portal-shell.tsx` | Nav entry href: `/portal/reports2` → `/portal/reports` (the `pathname.startsWith("/portal/reports")` title-check already matches either) |
| `src/components/portal/admin-preview-toggle.tsx` | Drop the now-dead `reports2: "reports"` map entry |
| `src/lib/permissions.ts`, `src/lib/portal-audits.ts`, `src/app/api/portal/audit/route.ts` | Comment text only (`reports2` → `reports`), no functional change |
| `src/app/portal/reports/business-model-audit/page.tsx` (moved) | "← Back to Reports" link: `/portal/reports2` → `/portal/reports` |

---

## 6. Permission gating detail

Today: `portal/reports2/page.tsx` computes, per card, `enabled = isProspect || canAccess(`reports-${card.id}`, effectiveAllowedSections, false)`, and `isAdminPreview` bypasses the check entirely so an admin previewing a client can see (and toggle) every card regardless of that client's current grants. Direct navigation to `/portal/reports2/{id}` has no equivalent check — the page loads unconditionally.

New behavior: the same three-way rule (`isAdminPreview` bypass → `isProspect` bypass → `canAccess`) is centralized in `controls.canAccessSection(id)` and enforced at the top of every section page. A disallowed section renders an inline message ("This report isn't available for your account — reach out to your account manager for access.") instead of the KPI/chart content — consistent with the existing "your report is being prepared" empty-state pattern elsewhere in the portal, and never a silent redirect.

---

## 7. Testing strategy

- `usePortalReportControls` resolution logic (client-code selection between session vs. `?client=` admin override, `canAccessSection`'s three-way rule) is pure enough to unit test with `vitest` — mock `fetch` for `/api/portal/me/client` and `/api/clients`.
- Section pages themselves are thin shells with no new business logic (the v2 section components are already tested/dogfooded on the hub side) — verified by `tsc --noEmit` + manual dogfood of all six sections as a real client-role user and as admin-preview, not new unit tests.
- Dogfood checklist: real client session sees own data only, with no client-select control; admin `?client=` preview shows the picked client's data; a section outside `allowedSections` shows the "not available" message on direct navigation, not the report; Refresh button absent on every portal report page; "← Back to reports" returns to the card grid; inventory/subscribe-save keep their date-control special-casing.

Commands: `node_modules/.bin/tsc --noEmit` (background, ~2 min); `node_modules/.bin/vitest run <path>` (doesn't typecheck — always follow with tsc before claiming done). Never `next build`.

---

## 8. Risks & open items

- `usePortalReportControls` and `useReportControls` duplicate the date-range state machine (mode/year/week/custom start-end) rather than sharing one implementation. Accepted: unifying them would require threading a hub-vs-portal branch through the client-fetching half of the hub hook, which is more coupling than the ~15 lines of duplicated date logic are worth.
- The six new "not available" gates are new user-facing states with no prior analogue on the hub side (admin always sees everything) — copy/tone is a first draft in §6, easy to adjust after Manu sees it live.

---

## 9. Corrections applied after code verification (2026-08-03)

Every factual claim this spec makes about existing code was re-verified against the worktree at `f5ac9c87` before the implementation plan was written. Eight claims were wrong. They are recorded here rather than silently patched, so the plan's extra tasks have visible provenance.

**1. "Every section component already accepts a `surface` prop" — false for five of six.** Verified per file:

| Component | Hub-orange source | Fix |
|---|---|---|
| `performance-overview-v2.tsx` | none — already takes `surface`, uses `palette.eyebrowClass` | none |
| `period-comparative-section.tsx` | `getSurfacePalette("hub")` literal at :147 (feeds `palette.accent` at :299 and `KpiCard palette=` at :384) **and** `PERIODS[0].color = "#FF751F"` at :96 (consumed at :233, :252, :317, :354) | add `surface`; both sources |
| `subscribe-save-section.tsx` | `CURRENT_COLOR = "#FF751F"` at :60, used at :133 and :153 inside sub-component `SnsChart` (:127-174) | add `surface`; thread one level |
| `share-of-voice-section.tsx` | `BRAND_COLOR = "#FF751F"` at :76, used at :223 and :230 inside `ComparisonLineChart` (:202-236) **and** at :392 and :410 in the exported body (:321) | add `surface`; thread **two** levels, because `KeywordSeriesCharts` (:238-318) sits between them and renders `ComparisonLineChart` 3× without passing colors |
| `advertising-audit-section.tsx` | `SectionHeading` at :143-145 hardcodes the `text-brand` class — which `primitives/palette.test.ts:28` explicitly *bans* from the portal palette | add `surface`; use `palette.eyebrowClass`; forward `surface` to `KeywordsGapsV2` at :739 |
| `inventory-section.tsx` | only `STACK[0]`, a categorical slot — **left unchanged by decision** (below) | none |

Plus one component the spec never mentioned: `keywords-gaps-v2.tsx:212` hardcodes `barColor = accentIndex === 0 ? "#FF751F" : "#006BBB"` inside `KeywordsGapsBlock` (:211). It takes no `surface` prop and is rendered only from `advertising-audit-section.tsx:739`.

All five files import a *component* named `Surface` from `./primitives/surface`, so the palette type must be aliased on import, exactly as `performance-overview-v2.tsx:3` does it:
`import { getSurfacePalette, type Surface as SurfaceKind } from "./primitives/palette";`

**2. `MissingIntentwiseIdBanner` does not exist.** §3's sample page code referenced it as an existing component. Repo-wide grep returns nothing. The real pattern is an inline red strip duplicated in all six portal pages. It becomes a new `MissingAccountIdBanner` (§3).

**3. `ReportsControlsBar` cannot accept a `PortalReportControls` as written.** It types `controls: ReportControls` and destructures six fields the portal shape lacks. Requires the `ReportRangeControls` base split (§3).

**4. Wiring the index page to `canAccessSection` would be a regression, not a dedup.** The index needs the client's own grant, not the admin-preview bypass. Hence the added `clientHasSection` (§3).

**5. `InventoryDateBadge` is hub-styled.** `src/components/reports/inventory-date-badge.tsx:26-27` hardcodes `border-[#FF751F]`, `text-[#FF751F]` and `bg-[#3C4043]`. The portal inventory page reuses it as `extras`, so it needs a `surface` prop. (Today's portal inventory page has its own neutral inline badge, which is why this never surfaced.)

**6. `/api/portal/me/client` does not return `allowedSections`.** It returns exactly `{ clientIdCode, clientName, clientStatus, rawData }` (route :47-52). The spec's resolution logic is still correct — sections come from `session.user.allowedSections` or the `/api/clients` preview fetch — but the hook must not expect them from this endpoint.

**7. Portal page count and shape.** The six portal pages are 136–321 lines (not "130–270"), and `portal/reports2/overview/page.tsx` re-implements `formatDate`/`getWeekNumber`/`getSundayOfWeek` locally (:40-74) as well as extra date-picker affordances the hub bar lacks: week clamping to the current week (:214-215), a `getMaxWeek` filter (:235-236), and a custom-range day count (:258-267). Adopting `ReportsControlsBar` drops those three affordances. Accepted as hub parity, but it is a real behavior change, not a pure swap. Likewise portal subscribe-save defaults its year to the current year (:24-25) whereas hub defaults to `currentYear - 1` (`reports/subscribe-save/page.tsx:14`) — portal adopts the hub default.

**7a. A fourth dropped affordance, found during the final-review fix wave (2026-08-04): the Week-mode year range narrowed.** The pre-image (`git show 5897da0d:src/app/portal/reports2/overview/page.tsx:219`) offered `Array.from({length: 6}, (_, i) => currentYear - 5 + i)` — six *past* years. The shared bar (`reports-controls-bar.tsx:130`) offers `Array.from({length: 6}, (_, i) => new Date().getFullYear() - 2 + i)` — 2 past years, the current year, and 3 *future* years. Net effect for a portal client on the four `showDates` pages: 2021/2022/2023 drop off the Week picker and three always-empty future years appear. Mitigated because Custom mode's `DatePicker`s still reach any historical date. Any actual clamp belongs in the same follow-up as the `(Nd)` day count noted above, since the fix site is the shared bar and changing it would also change hub behavior.

### Decisions taken on the above (Manu, 2026-08-03, via direct question)

- **Categorical slot-0 orange stays shared on both surfaces.** `advertising-audit-section.tsx:131 SLOT_COLORS` and `inventory-section.tsx:69 STACK` are 4-slot categorical data palettes whose slot 0 happens to be `#FF751F`. They are *not* brand-emphasis colors, and `primitives/chart-colors.ts` already documents `CHART_DATA` as "SHARED categorical DATA colors — identical on hub and portal". Recoloring slot 0 to `accentFor("portal")` (`#2A5059`, dark teal) would place it adjacent to slot 1 `#006BBB` (blue) and likely break the validated CVD spacing these palettes were checked for. Left unchanged; `inventory-section.tsx` therefore needs no edit at all.
- **Period-comparative trio: accept teal-next-to-blue and verify live.** The current-period line *is* an emphasis color and must become `accentFor(surface)`, giving portal `#2A5059` / `#006BBB` / `#05893E`. Previous-year is already dashed; current vs previous-month differ only by stroke width (2.25 vs 2). Added to the §7 dogfood checklist as an explicit legibility check rather than pre-emptively adding a second dash pattern.

### Deferred, deliberately not in this plan

`focus:border-brand` — a hub-orange focus ring on `<select>`/`<input>` controls — appears at 8 sites inside five v2 sections (`subscribe-save-section.tsx:245`, `share-of-voice-section.tsx:124` and `:431`, `keywords-gaps-v2.tsx:147`, `inventory-section.tsx:124`, `advertising-audit-section.tsx:348` and `:592`). On portal these flash orange on focus. Given the decision above to leave the far more visible categorical slots shared, fixing a transient focus state is not worth 8 extra edit sites in this change. Logged for a follow-up.

**An eighth `focus:border-brand` site this list omits, found during the final-review fix wave (2026-08-04):** `src/components/ui/date-picker.tsx:73` carries `hover:border-brand/50` and `focus:border-brand`, and both `DatePicker`s render on portal Custom mode (`reports-controls-bar.tsx:143`, `:145`). Unlike the shared `ReportsControlsBar` `<select>` fields (fixed in the same wave via a `surface === "portal"` conditional on `fieldCls`), this one cannot be fixed surface-conditionally without threading a new prop into a generic `ui/` primitive used well beyond reports — which is why it stays deferred alongside the other 7.
