# MFHub Data Map

Approved in chat on 2026-09-09: build an admin-only explorer inside MFHub with automatic connections and editable annotations.

## Experience
Revision requested 2026-09-09: make the default view a pyramidal, table-first hierarchy. Supabase overview expands into tables; a selected table branches into sources (create/update), destinations (read), and a separate deletion branch. Page/API/job cards expand to show the columns involved and row-selection fields. Inventory API handlers and maintained scripts in addition to pages so non-page data flows are visible. Dynamic payloads remain explicitly unresolved; field references do not prove end-to-end value transformations. Keep the existing page map as a secondary view and preserve annotations. Do not reintroduce operation labels on connector lines; use the top legend and card badges.

Route `/admin/data-map`, linked from the admin navigation. A collapsible vertical route tree and zoomable, pannable canvas show every page and Supabase table. Selecting a page reveals READ, CREATE, UPDATE and DELETE connections; selecting a table reverses the lookup. A detail panel lists schema columns and source evidence. Search and operation filters reduce clutter. Users can connect a page to a table by dragging a connector or using accessible controls. Manual annotations are saved in this browser, removable and exportable/importable as JSON; they do not change application queries.

## Data and accuracy
Generate a versioned manifest from Next.js page files, TypeScript imports, API requests and Drizzle operations. Resolve HTTP methods separately so GET does not inherit POST writes. Traverse referenced functions/components, not every export in an imported module. Preserve source paths and one-based lines. All extracted edges represent static possibilities, not proof a query ran. Flag unresolved requests, raw SQL and dynamic queries. Shared root layout/auth infrastructure is outside the page-specific map and disclosed in the interface. Include every route even without a resolved edge.

Extract declared tables and columns from the Drizzle schema without importing the database. Generate the manifest before local development or explicitly with npm run data-map:generate, and commit the snapshot with source changes. Production prebuild validates the committed JSON instead of running the generator: Vercel excludes scripts/, including the generator and maintained scripts that contribute lineage. An admin-protected endpoint checks information_schema using the existing database connection, returning only table/column metadata and reporting mismatches. Offline code mapping remains usable if this check fails. Never return records or credentials.

## Architecture
`src/lib/data-map/types.ts`: serializable contracts. `analyze.ts`: build-time AST scanner. `scripts/generate-data-map.ts`: inventory and manifest generation. `src/generated/data-map.json`: generated inventory. Server page enforces admin role before passing data to the canvas. Schema endpoint independently enforces the same role. Client components own filtering, navigation and annotation state. Reuse MFHub theme and navigation.

## Validation
Fixtures cover imported helpers, HTTP method separation, aliases, dynamic routes, unresolvable fetches and unused exports. Route tests cover denied access and database failure. UI tests cover page/table selection, filters and annotation persistence. Generate against the whole repository, typecheck/build and exercise canvas interactions in a browser.

## Screenshot and field-flow revision — approved 2026-09-09

User reference: annotated Variation Builder and Product Detail screenshots, with database fields between them. This revision adds a default Visual field flow view; the table hierarchy and page map remain available.

### Canvas experience
- Place draggable page screenshot cards around expandable Supabase table cards. The default selected-field layout is origin controls on the left, storage fields in the center, consuming controls on the right. A page can both write and display the same field.
- Click a control hotspot or database field to reveal only its flow. Green arrows point toward stored fields; blue arrows point toward displaying controls. Keep the top legend and omit text on connector lines. Show copies/transformations between database fields as separate inspectable connections.
- Search every declared column and known JSON path. Expand table → column → JSON key; keep distinct internal IDs, business codes and similarly named fields. Expose additional writers, deletes, scripts, imports and computations in the inspector.
- A connection inspector shows the UI label, exact storage path, originating handler, transformations, conditions, consumer binding, evidence and confidence. A query fetching a column alone is not evidence that a page displays it.
- Allow screenshot upload/replacement, rectangular hotspot placement and field connection editing. Store screenshots in browser IndexedDB and annotation metadata locally; provide a versioned portable backup including images. Existing annotation exports remain supported. Replacing a screenshot flags its hotspots for review rather than silently assuming alignment.

### Evidence model and coverage
Extend the generated manifest with storage field identities (schema/table/column/JSON path), UI controls (route/component/label), and directed write/read/copy/derive edges. Each edge carries source evidence and either code-confirmed, manually documented or unresolved status. Preserve existing table edges as candidates rather than automatically promoting them to display bindings.

Use a hybrid approach: generate schema, route and query candidates automatically; add explicit evidence-backed field bindings for dynamic form registries and JSON dispatchers. Pure AST inference misses these semantics; a fully manual canvas would drift. Do not claim exhaustive origins for every existing row value: this maps field flows, not historical per-record audit events.

### Verified initial examples
- Variation creation: src/app/variations/page.tsx requests a next code, then POST /api/variations stores variations.code. variations.id uses a database-generated UUID. Follow product membership/sync handlers to establish when that business code is copied to master.variations.VariationID; do not conflate it with master.variation_ref.
- Theme: src/app/variations/[id]/page.tsx transforms the selected raw theme into themeAttributes and sends variationThemeRaw. PATCH /api/variations/[id] writes variations.theme_attributes and jsonb_set copies the raw theme into master.variations.VariationThemeName on included products. Product variation controls read through getProductFieldValue.
- Size: PATCH /api/products/[id] canonicalizes the Size key into master.variations.Size, removing stale duplicate keys. Product PDP reads through getProductFieldValue; that helper has legacy JSON/raw fallbacks which must remain explicit. Verify builder and other consumers individually.

### Page screenshots
Inventory every route template and capture one representative rendered state per page, plus relevant tabs/dialogs for mapped controls. Dynamic routes require a concrete valid example and record context. Screenshot cards record route, state, viewport, capture time and revision; they are visual references, not embedded live pages. Capture actual authenticated pages, never fabricate screenshots. Do not ship private record screenshots in public assets or the generated manifest; keep captures in the admin's browser storage. Browser-local capture import is the initial transport; automatic authenticated crawling is a separate implementation choice requiring a reliable capture environment.

Retain a visible coverage list: captured, not captured, blocked by auth/network, or missing representative record. The earlier local database handshake failure may block capture; code mapping and uploaded screenshots must still work. Do not claim all pages have screenshots while gaps remain.

### Implementation order and acceptance
1. Add typed field/control/edge contracts and fixtures for variation code versus UUID, theme synchronization, Size writes, and legacy read fallbacks.
2. Build the screenshot canvas and hotspot editor, field selection, directed flows, evidence inspector, persistence and backup. Preserve existing views and admin access.
3. Populate the three verified examples, then expand route/field coverage across the project. Mark unresolved candidates explicitly.
4. Capture representative page states and track missing coverage. Verify hotspot positions under pan/zoom, screenshot replacement, field selection, import/export, image persistence and access control.
5. Validate end-to-end that selecting Size shows PDP write → exact JSON key → verified consumers; selecting theme shows both stored forms; selecting Variation ID distinguishes business code from UUID. Run focused tests/lint/typecheck and report existing full-build blockers separately.

Approved by the user with “proceed” and implemented as the default Visual field flow view. See docs/superpowers/plans/2026-09-09-visual-field-flow.md for verification and remaining coverage. Six route screenshots are captured; all 131 routes remain inventoried. Automatic query candidates remain distinct from verified UI bindings. Screenshot git revision tracking and exhaustive capture/control coverage remain outstanding.
