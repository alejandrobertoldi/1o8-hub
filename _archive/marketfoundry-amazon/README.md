# Archived: MarketFoundry Amazon modules

MarketFoundry is an Amazon-marketplace agency; 1o8 Agency is a digital marketing
agency. These page routes were removed from the 1o8 Hub on 2026-10-20 and parked
here unchanged (same folder structure as `src/app/`) in case we need them again:

| Former nav group | Routes |
|---|---|
| Catalog | `/products`, `/variations`, `/variety-packs`, `/amazon-sync`, `/reviews`, `/attribute-audit`, `/admin/attributes`, `/attributesMaster`, `/admin/sp-api` |
| Design | `/design/*` (Brand Story, A+ Content, Listing Images, Storefront), portal `/portal/design/*` |
| PPC | `/ppc`, `/holiday-deals`, `/sales-monitor`, `/sales-summary/*` (incl. forecast tools), `/inventory` |
| Client tabs | `/clients/[clientIdCode]/forecast` |

Only the **pages** moved. Their API routes (`src/app/api/...`), libraries and
components are still in `src/`, so restoring a module is just moving its folder
back to `src/app/` and re-adding its nav entry in
`src/components/layout/top-nav.tsx` (and `app-sidebar.tsx` / `portal-shell.tsx`).

This folder is excluded from TypeScript (`tsconfig.json`) and is outside
`src/app`, so Next.js does not build it.

Two tests that read the archived pages' source were moved here as well:
`src/lib/listing-image-slots.test.ts` and `src/lib/storefront/layout.test.ts`.
Put them back when you restore Design.

## Second pass (2026-11-02): API routes, crons and remaining pages

The Amazon **API routes**, cron workers and the pages still live were moved
here too, keeping their `src/...` paths:

- API: products (most), aplus, aplus2, storefront, design, design-status,
  attributes (audit/categories/detail/promote), attributes-master, variations,
  amazon-sync, amazon-live, reviews, category-definitions, inventory-rec-*,
  inventory-capacity-limits, variety-packs, sales-summary, impact,
  holiday-deals, guidelines, forecasts, compare, ppc, finances, intentwise-test,
  admin/sp-api, debug/subscribe-save-weeks, clients/sales-sparklines,
  all of `api/reports/*` and `api/internal/refresh/*`, and the Amazon parts of
  `api/portal/*` (audit, design, finance, inventory-rec-snapshots, products,
  reports, reviews, timeline, upload).
- Gantt / Timeline: `api/gantt`, `api/clients/[clientIdCode]/gantt`,
  `api/webhooks/asana`, `lib/asana-sync.ts`, pages `/timeline`,
  `/clients/[clientIdCode]/timeline`, `/portal/timeline`.
- Crons: amazon-sync, amazon-sync-rainforest, impact, monthly-reports,
  ppc-snapshot, redshift-archive-drain/enqueue, refresh-order-geography,
  refresh-reports, refresh-sales, refresh-sales-inventory, reviews-sync,
  snapshot-cleanup.
- Pages: `/guidelines`, `/finances`, `/calculator`, `/tools/rev-calculator`,
  `/clients/[clientIdCode]/inventory`, the Amazon `/reports/*` pages
  (overview, advertising-audit, inventory, fba-inventory-map, order-geography,
  period-comparative, share-of-voice, subscribe-save, monthly) and the Amazon
  portal sections (aplus, attributes, finance, products, reports, reviews,
  sales, sales-monitor, tools).
- Dead components: `components/analytics/inventory-final`,
  `inventory-forecast-table`, `inventory-sent-snapshot`.
- Tests that read archived files: `lib/monthly-report/vercel-chromium.test.ts`,
  `components/reports/print/section-renderers.routes.test.ts`.

Still live on purpose because kept 1o8 code calls them: `api/products` (GET,
used by Publish), `api/products/[id]/revert{,-field}` (Publish),
`api/products/variation-groups` and `variety-pack-batch` (SEO),
`api/attributes` (Import mapping) and `api/attributes/template-requests/*`
(client onboarding), and the Drive image proxies `api/aplus2/image`,
`api/storefront/image`, `api/design/listing-images/image`,
`api/design-status/brand-story-image` (case studies, SEO revisions).
Components and most libraries used only by archived code were left in `src/`.
