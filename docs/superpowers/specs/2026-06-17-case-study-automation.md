# Case Study Automation — Design Spec

**Date:** 2026-06-17
**Owner:** Manu
**Status:** APPROVED — design signed off 2026-06-17; awaiting implementation plan
**Builds on:** `docs/superpowers/specs/2026-05-28-case-study-redesign.md` (the 13-section CAR redesign, shipped in commit `c6294602`, phases 1–5)

---

## 1. Goal, audience, non-goals

### Goal

The 13-section case study renderer + per-section editor already ships. This spec adds an **automation layer** that runs **server-side in the Next.js app** (self-serve: any admin clicks Generate) to fill what is currently manual:

1. **Campaigns/PPC numbers** from Intentwise (currently sourced from local `ppc_snapshots`).
2. **Design "screenview" images** auto-pulled from Google Drive (currently manual URL paste).
3. **Narrative copy** ("what 1o8 did for this client and how it impacted their business") AI-drafted from real hub work signals + Intentwise numbers, then admin-edited before publish (currently fully hand-entered).

### Audience

Unchanged from the redesign spec: primary = 1o8 new-prospect sales pitch; secondary = existing clients via `/portal/case-study` (published-only).

### The MCP → Redshift substitution (explicit)

The user originally asked for data "from the Intentwise MCP server." **The deployed Vercel app cannot call an MCP server** — MCP tools exist only inside an interactive Claude session, not in the Next.js runtime. The app instead reads the **same Intentwise data** through:
- its **existing Redshift connection** (`src/lib/redshift.ts` → `analytics.intentwise.com:5439`, schema `intentwise_ecommerce_graph`), and/or
- the **Intentwise AI Gateway connector** (confirmed by user to return identical data to Redshift).

Net effect for the user is identical numbers from the same source of truth; only the runtime mechanism differs. This is a deliberate, signed-off substitution.

### Non-goals

- No new section types, no change to the 13-section vocabulary, no change to `SectionContent` shapes (`src/lib/case-study/types.ts`).
- No DB redesign beyond what auto-fill needs (see §7). Reuse `case_studies` + `case_study_sections`.
- `ppc_snapshots` and all `/ppc/*` features are **untouched** — the case study simply reads PPC from Intentwise instead.
- No PDF redesign (PDF route keeps working with the same content shapes).
- No DAM / image-upload redesign — Drive auto-pull fills `imageUrls[]`; admin override via existing URL textarea stays.
- AI drafts **narrative text only** — never KPI numbers, never invents stats, never fabricates work.
- No revision history / audit log / approval workflow.
- No public sharable links (stays auth-gated).

---

## 2. Data source map

| Input | Today | After this work | Mechanism |
|---|---|---|---|
| Sales / Results | Redshift `account_summary` | unchanged | existing Redshift pool (`fetchSalesContent`) |
| **Campaigns / PPC** | local `ppc_snapshots` (SP-API/Rainforest) | **Intentwise `campaign_summary`** (ad_spend, sales, ACOS, NtB revenue/orders by campaign+date) | NEW query on existing Redshift pool |
| Subscribe & Save | Redshift `replenishment_offer_metrics` | unchanged | existing Redshift pool (`fetchSnsContent`) |
| **Design images** | manual URL paste | **auto-pulled screenviews** from Drive | `driveClient` + `driveFolders` registry |
| **Narrative copy** | manual hand-entry | **AI-drafted** from evidence packet | Anthropic API (`ai-config.server.ts`) |

`campaign_summary` confirmed (2026-06-17 schema check) to live in the **same** `intentwise_ecommerce_graph` schema the app already connects to — so PPC-from-Intentwise is a new query on the existing connection, no new credentials.

---

## 3. PPC source swap (Intentwise `campaign_summary`)

### 3.1 New query module

`src/lib/case-study/queries/ppc-intentwise.ts` (NEW) — queries Redshift `intentwise_ecommerce_graph.campaign_summary` for an `accountId` over the date range, aggregating to the `PpcPeriodCells` + `PpcChartPoint[]` shape the existing `ppc` section already consumes. Columns: `ad_spend`, ad sales, `ntb_revenue`/`ntb_orders`, ACOS (computed = spend/sales), date.

### 3.2 Wiring

- `src/lib/case-study/generate.ts` and `refreshCaseStudyAutofill` call the new Intentwise PPC fetcher instead of `fetchPpcContent` (which reads `ppc_snapshots`).
- **Decision:** Intentwise is **primary**. `ppc_snapshots`-based `fetchPpcContent` (`src/lib/case-study/queries/ppc.ts`) stays in the tree as a fallback when Intentwise returns no rows for the account (graceful degradation), and so the existing tests keep passing. The orchestrator tries Intentwise first, falls back to local on empty.
- Numerics formatted to display strings via existing `src/lib/case-study/format.ts` helpers; raw chart points stay numeric.

### 3.3 Account resolution

Reuses existing `resolveAccountId(clientIdCode)` (`generate.ts:35`) → `aac.raw_data.IntentwiseID`. Same `accountId` already used for sales/SnS.

---

## 4. Drive screenview auto-pull

### 4.1 The rule (deterministic)

For each image-bearing section, resolve the client's section folder via the `driveFolders` registry (`clientIdCode` + `folderType`), then select files where ALL hold:

1. **Token:** filename matches `/screenview/i` (case-insensitive — covers `_screenview`, `_ScreenView`, `BS_ScreenView`, `ScreenView - Homepage`).
2. **Raster only:** `mimeType` ∈ {`image/png`, `image/jpeg`, `image/webp`}. **Exclude** `image/vnd.adobe.photoshop`, `application/x-photoshop`, `.psd`, `.psb` (real data shows 1GB PSD/PSB files share the token).
3. **Newest version:** when filenames carry a `_V<nn>` token (e.g. `_V01`, `_V02`), pick the **highest** version. When the folder itself is versioned (subfolders `..._V01`, `..._V02`), descend into the highest-version subfolder first.

Fill the section's `imageUrls[]` with the resolved file(s), newest-first, capped at that section's slot count.

### 4.2 Section → folderType map

| Section | folderType (driveFolders) | Notes |
|---|---|---|
| `cover` | `client_logos` | logo already resolved via `aac.client_logo_url` — unchanged |
| `brand_story` | `brand_story_master` / `brand_story_version` | **confirmed reliable** — clean convention exists |
| `product_listing` | `listing_images` | best-effort |
| `storefront` | `graphics` | best-effort |
| `aplus` | `aplus` | best-effort; **screenviews only, not individual modules** (the `/screenview/i` token enforces this) |

### 4.3 Coverage honesty (NOT a silent cap)

In the 2026-06-17 Drive snapshot, only **Brand Story** screenviews clearly follow the new naming convention. Other sections are **best-effort**: if no qualifying screenview is found, the section's `imageUrls[]` stays empty and falls back to **manual entry** (existing URL textarea). The generate flow must `log`/surface which sections got auto-images vs. need manual images — never present empty as "done."

### 4.4 Image delivery

Drive `viewUrl` / file id resolved to a renderable image URL. If the app already proxies Drive images for the portal (`/api/drive/file/{id}` per `project_portal_design_data_access` memory), reuse that proxy so portal (client-role) users can load the images under the existing permission model. Confirm during planning whether case-study images need the portal proxy or render directly.

### 4.5 New module

`src/lib/case-study/drive-screenviews.ts` (NEW) — `resolveScreenviews(clientIdCode, folderType, maxCount)` → `string[]` of image URLs, applying §4.1 rules. Pure, unit-testable with mocked `driveClient`.

---

## 5. AI narrative engine

### 5.1 Evidence packet (facts only)

`src/lib/case-study/evidence.ts` (NEW) — `buildEvidencePacket(clientIdCode, dateStart, dateEnd)` assembles a structured JSON object of **facts**, no prose:

- **Client meta:** name, sector, marketplaces present (SC/VC), reporting period.
- **Numbers:** sales totals + deltas (from `account_summary`), campaign spend/sales/ACOS/NtB (from `campaign_summary`), SnS active subs + growth (from `replenishment_offer_metrics`). Reuses the same fetchers used for auto-fill so numbers are consistent with the KPI slots.
- **Work signals (the "what we did"):** counts/flags aggregated from hub tables — number of A+ modules built, listings optimized, SEO phases completed, campaigns managed, SnS active (bool), storefront pages. Each item is a fact ("8 A+ modules built"), never a claim. Exact source tables mapped during planning (A+ tables, `products`, `seo_*`, campaign data, etc.).

### 5.2 Drafting

`src/lib/case-study/narrative.ts` (NEW) — `draftNarrative(packet, sectionsEnabled)`:
- Sends the packet + a strict system prompt to Claude (model + key via `src/lib/ai-config.server.ts`).
- **System prompt rules:** use ONLY facts in the packet; never state a number not in the packet; never claim work not in the work-signals list; brand voice (confident, concise, sales-oriented); output strictly typed JSON keyed by section + field name.
- Low temperature.
- Returns a partial map of `{ sectionType → { fieldName → string } }` covering **narrative text fields only**: headlines (`head1/2/3`), `body`/`body1`/`body2`, `tagline`, pillar `desc`, etc. KPI `value`/`sc`/`vc`/`unit` fields are **excluded** from the AI output schema entirely.

### 5.3 Merge into content

The drafter output is merged into each `case_study_sections.content` JSONB: AI fills narrative keys, data fetchers fill numeric keys, Drive resolver fills `imageUrls[]`. Conflicts impossible by construction (disjoint key sets).

---

## 6. Generate / Refresh / Re-draft flow

### 6.1 Generate (full)

Admin clicks Generate (existing `case-study-generate-modal.tsx`). Backend, in parallel where possible:
1. Resolve `accountId` + `clientLogoUrl` (existing).
2. Fetch Intentwise sales / campaigns / SnS.
3. Resolve Drive screenviews per section (§4).
4. Build evidence packet (§5.1) and draft narrative (§5.2).
5. Assemble the 13 sections (numbers + images + prose) and persist.
Admin then reviews/edits in the per-section drawer and publishes.

### 6.2 Refresh Data (numbers + images only)

The existing "Refresh Data" button re-runs **data fetchers + Drive screenview resolution only**. It **never overwrites narrative prose** (protects admin edits) — consistent with the redesign spec's refresh-only-autofill philosophy (`refreshCaseStudyAutofill`).

### 6.3 Re-draft Narrative (explicit, separate)

A **new explicit action** ("Re-draft narrative") regenerates prose from a fresh evidence packet. Separate button so prose regeneration is always a deliberate choice, never a side effect of a data refresh. Overwrites narrative keys; leaves numbers + images + admin-tuned KPI values intact.

---

## 7. Schema / API changes

- **Schema:** no new tables. If work-signal aggregation needs no persistence (computed at generate time), **no migration required**. Confirm during planning; prefer compute-on-generate over new columns.
- **API:**
  - `POST /api/case-studies` (generate) — extend orchestration to call the new Intentwise PPC fetcher, Drive resolver, and narrative drafter.
  - `POST /api/case-studies/[id]/refresh` — restrict to data + images (no prose).
  - `POST /api/case-studies/[id]/redraft` (NEW) — narrative re-draft.
- **No change** to per-section PATCH, portal read path, or content type definitions.

---

## 8. New / changed files

### New
| File | Purpose |
|---|---|
| `src/lib/case-study/queries/ppc-intentwise.ts` | PPC from Intentwise `campaign_summary` |
| `src/lib/case-study/drive-screenviews.ts` | Drive screenview resolver (§4) |
| `src/lib/case-study/evidence.ts` | Evidence packet builder (§5.1) |
| `src/lib/case-study/narrative.ts` | AI narrative drafter (§5.2) |
| `src/app/api/case-studies/[id]/redraft/route.ts` | Re-draft narrative action |
| `*.test.ts` for each new module | unit tests (mocked Redshift / driveClient / Anthropic) |

### Changed
| File | Change |
|---|---|
| `src/lib/case-study/generate.ts` | Use Intentwise PPC (fallback to local), call Drive resolver + narrative drafter; assemble |
| `src/app/api/case-studies/route.ts` | Wire new orchestration into POST |
| `src/app/api/case-studies/[id]/refresh/route.ts` | Data + images only; no prose |
| `src/components/case-study/case-study-generate-modal.tsx` | Surface which sections got auto-images vs. need manual; add "Re-draft narrative" affordance (or in toolbar) |

---

## 9. Risks

- **AI narrative quality on a sales asset.** Mitigation: facts-only packet, strict no-fabrication prompt, low temperature, mandatory admin edit gate before publish, narrative-only key scope.
- **Screenview coverage gap.** Only brand_story is reliably named today; others best-effort. Mitigation: graceful manual fallback + explicit per-section "auto vs manual" surfacing (§4.3).
- **PSD/legacy files matching the token.** Mitigation: hard raster-mime allowlist (§4.1).
- **Intentwise `campaign_summary` shape drift.** Mitigation: query module isolated + unit-tested; fallback to `ppc_snapshots` on empty.
- **Redshift latency in serverless generate.** Existing fetchers already run in this path; add the campaign query to the same `Promise.all`. Watch timeout (pool `query_timeout` is 90s).

---

## 10. Acceptance criteria

1. Generate for a test client (e.g. `C23_SC_US`) auto-fills PPC numbers from Intentwise `campaign_summary` (verified non-null, matching a manual Intentwise query within rounding).
2. Generate auto-populates brand_story `imageUrls[]` with the newest `_screenview` raster from the client's brand-story folder; PSD/PSB files are excluded.
3. Sections with no qualifying screenview surface as "needs manual image," not silently empty.
4. AI narrative drafts populate narrative text fields for enabled sections, contain no numbers absent from the packet, and claim no work absent from the work-signals list (spot-checked).
5. "Refresh Data" updates numbers + images without touching admin-edited prose.
6. "Re-draft narrative" regenerates prose without touching numbers/images.
7. `ppc_snapshots` and `/ppc/*` features are unaffected.
8. Portal client view renders the generated case study (incl. Drive images) when status = published.
9. tsc + eslint clean; new unit tests pass; existing case-study tests pass.

---

## 11. References

- Redesign spec (shipped): `docs/superpowers/specs/2026-05-28-case-study-redesign.md`
- Redshift/Intentwise client: `src/lib/redshift.ts`
- Existing data fetchers: `src/lib/case-study/queries/{sales,ppc,sns}.ts`
- Generate orchestrator: `src/lib/case-study/generate.ts`
- Drive client + registry: `src/lib/drive-client.ts`, `src/lib/drive-upload.ts`, `driveFolders` table in `src/lib/db/schema.ts`
- AI config (server): `src/lib/ai-config.server.ts`
- Content shapes: `src/lib/case-study/types.ts`
- Intentwise `campaign_summary` (entity `campaign`): `ntb_revenue`, `ntb_orders`, `ad_spend`, in schema `intentwise_ecommerce_graph`
- Example Drive screenview: `C23_SC_US_Brandstory_V02_screenview.png` (folder versioned `_V01`/`_V02`)
- **Populated reference template:** `docs/case-study-standalone-template.html` (committed; 2.3MB standalone export, base64 images embedded — strip `src="data:..."` before parsing prose). Verified 2026-06-17 to contain 12 `<section class="slide…" data-label="…">` shells matching the shipped vocabulary exactly (Cover, The Brief, Results at a Glance, Our Approach, Storefront, Brand Story, Product Listings, A+ Content, Subscribe and Save, Store and Promotions, PPC Performance, Next Steps; optional "Two Marketplaces"/channels omitted in this export). **No architecture impact** — confirms the shipped renderer. Use it during implementation as the **canonical voice/tone exemplar** for the `narrative.ts` system prompt: extract its real narrative prose as the few-shot example so AI drafts match 1o8's sales voice.
