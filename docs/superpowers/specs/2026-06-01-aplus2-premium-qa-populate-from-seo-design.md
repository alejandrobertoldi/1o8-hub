# A+2 Premium Q&A — Populate from SEO Manager

**Date:** 2026-06-01
**Status:** Approved (design), pending implementation plan

## Goal

In the A+2 Premium Q&A module editor (module type `qa` / M07), let an editor pick an
SEO Manager project and one-click populate the module's Q&A pairs from that project's
generated Premium A+ Q&A subset.

## Source of truth

- **A+2 side:** `aplus2_module_items.data` JSONB, shaped `{ type: "qa", question, answer }`.
  Module spec `qa` in `src/lib/aplus2/module-specs.ts`: `minItems 2`, `maxItems 5`,
  `question` ≤120 chars, `answer` ≤250 chars (multiline). Set identified by
  `(clientIdCode, marketplace, scopeIdentifier)`.
- **SEO side:** Q&A is generated in **S6** (S7 is still a stub — do not touch it).
  Stored in `seo_qa` table. Field **`aplusQaSubset`** is the purpose-built Premium A+
  subset: ≤5 pairs, decision-intent, shaped `{ id, question, answer }`. Keyed by
  `project_id` + `asin_id` (latest `version`). `seo_projects.clientIdCode` links to the client.

## Decisions (locked)

| Decision        | Choice                                                                 |
|-----------------|------------------------------------------------------------------------|
| Data source     | `seo_qa.aplusQaSubset` (the ≤5 Premium A+ subset)                       |
| ASIN match      | Auto-match by the set's ASIN (`scopeIdentifier`, then `coveredAsins`)   |
| Fill behavior   | Replace all existing pairs                                             |
| Project list    | Only the set's client (`seo_projects.clientIdCode = set.clientIdCode`)  |
| Confirm prompt  | Keep a confirm-before-replace dialog                                   |
| Overlong text   | Silently truncate to 120/250 on populate; surface a brief toast note   |

## Architecture

```
seo_projects (clientIdCode) ─┐
                             ├─ match by set ASIN ─→ seo_qa.aplusQaSubset (≤5 {question, answer})
aplus2_set (clientIdCode,    │                                  │
            scopeIdentifier, ┘                                  ▼
            coveredAsins)                 replace aplus2_module_items.data (type:"qa")
```

### Endpoint 1 — list choosable projects

`GET /api/aplus2/modules/[moduleId]/seo-qa-sources`

1. Resolve module → version → set; read `clientIdCode`, `scopeIdentifier`, `coveredAsins`.
2. Build candidate ASIN list = `[scopeIdentifier, ...coveredAsins]` (deduped).
3. Find `seo_projects` for `clientIdCode`; for each, find the latest-version `seo_qa`
   row whose `seo_asins.asin` is in the candidate list and whose `aplusQaSubset` is non-empty.
4. Response: `{ sources: Array<{ projectId, projectName, asin, asinId, pairCount }> }`.
   Empty array when nothing matches.

### Endpoint 2 — populate

`POST /api/aplus2/modules/[moduleId]/populate-qa`  body: `{ projectId: string }`

1. Guard: module must be type `qa`.
2. Re-resolve the matching `seo_qa` row server-side from `projectId` + the module's set ASINs
   (never trust client-supplied Q&A content).
3. Map `aplusQaSubset` → items, truncating `question`→120 and `answer`→250.
4. Transaction: delete all `aplus2_module_items` for the module, insert the new pairs at
   positions `1..N`, each `data = { type: "qa", question, answer }`.
5. Response: `{ items: [...], truncated: boolean }` so the UI can re-render and note truncation.

### UI (in `aplus2-module-editor.tsx`, only when `moduleType === "qa"`)

A small toolbar above the "Q&A Pairs" section:
- `Select` dropdown sourced from endpoint 1 — option label `ProjectName · ASIN · N pairs`.
- "Populate from SEO" button — disabled until a project is selected and while loading;
  disabled with helper text "No SEO Q&A available for this client" when sources is empty.
- On click → confirm dialog ("Replace the current Q&A pairs with SEO content?") → POST
  endpoint 2 → refresh module items using the same mechanism the existing add/remove item
  flow uses → toast on success (note truncation if any).

## Edge cases

- **Subset has 1 pair** (below `minItems` 2): still loads it. `minItems` is only a delete-guard;
  populate sets items directly. Not blocked.
- **No matching `seo_qa` / empty subset:** project is omitted from the dropdown.
- **Overlong S6 text:** truncated to 120/250 so rows pass existing zod validation.
- **Multiple matching ASINs in one project:** prefer the `scopeIdentifier` match, else the
  first covered ASIN that has a non-empty subset.

## Out of scope (YAGNI)

- No second per-ASIN dropdown (auto-match chosen).
- No editing the SEO source from this screen (read-only pull).
- No changes to the S7 stub or the SEO pipeline itself.
- No new DB columns or migrations — reuses existing tables.

## Files expected to change

- New: `src/app/api/aplus2/modules/[moduleId]/seo-qa-sources/route.ts`
- New: `src/app/api/aplus2/modules/[moduleId]/populate-qa/route.ts`
- Edit: `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-module-editor.tsx`
  (qa toolbar + dropdown + populate handler; possibly a small child component)
- Possibly: a tiny shared helper for ASIN-match resolution used by both routes.
