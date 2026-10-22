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
