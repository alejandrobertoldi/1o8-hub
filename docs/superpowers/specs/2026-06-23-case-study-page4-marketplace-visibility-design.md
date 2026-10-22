# Case Study Page 4 Marketplace Visibility

Date: 2026-06-23
Status: Approved design

## Problem

Page 4 currently renders both Seller Central and Vendor Central cards for every
client. The AAC client record already identifies the client's Amazon operating
model through `rawData.Marketplace`, so the page should show only the channel or
channels that apply to that client.

## Required behavior

Normalize AAC `rawData.Marketplace` case-insensitively and derive visibility:

| Marketplace value indicates | Page 4 cards | Layout |
| --- | --- | --- |
| Seller Central only (`SC`) | Seller Central only | One full-width card |
| Vendor Central only (`VC`) | Vendor Central only | One full-width card |
| Both SC and VC | Seller Central and Vendor Central | Existing two-column layout |
| Missing or unrecognized | Seller Central and Vendor Central | Existing two-column layout |

The fallback intentionally preserves today's behavior rather than hiding valid
content when source metadata is incomplete.

## Architecture

### API data

Extend both case-study read endpoints to return the raw Marketplace string as
`clientMarketplace`:

- `GET /api/case-studies?clientIdCode=...` selects `aac.rawData` alongside the
  client name for the internal case-study page.
- `GET /api/case-studies/[id]` looks up the matching AAC record for the detail
  payload used by the portal.

This keeps internal and client-facing rendering identical.

### Shared renderer data

Add `clientMarketplace?: string` to `CaseStudyData` and pass it through the
shared and renderer `CaseStudyGlobals` definitions from `CaseStudyView`.

Keep marketplace visibility outside `ChannelsContent`. It is client metadata,
not editable case-study narrative, and existing studies should update
immediately without regeneration or database migration.

### Marketplace parsing

Use one small helper near the case-study types or channel renderer to classify
the source string as:

- `seller`
- `vendor`
- `both`
- `unknown`

Parsing must be case-insensitive and tolerate AAC values containing labels such
as `Amazon SC`, `Seller Central`, `Amazon VC`, `Vendor Central`, or a combined
value containing both indicators. Match explicit tokens or phrases so unrelated
words do not accidentally activate a channel.

### Page 4 rendering

`ChannelsSection` derives the visible cards from the classification:

- one visible card: render a one-column grid spanning the available width;
- two visible cards: retain the current two-column grid;
- unknown: render both cards.

Card content, colors, KPI fields, channel ordering, and editor fields remain
unchanged. Seller Central remains first when both cards render.

## Editing

The Page 4 editor continues to expose both Seller Central and Vendor Central
content. Visibility is controlled only by the AAC Marketplace attribute, so an
editor cannot create a contradiction between the client record and the rendered
case study.

## Refresh and existing studies

No generation or refresh changes are required. Marketplace is read whenever the
case study is fetched, so existing studies adopt the correct visibility on the
next page load.

Changing AAC Marketplace later also updates Page 4 on the next load.

## Testing

Add focused tests for:

1. SC-only values render Seller Central and omit Vendor Central.
2. VC-only values render Vendor Central and omit Seller Central.
3. Combined SC and VC values render both in the existing order.
4. Missing and unrecognized values render both as the safe fallback.
5. A single visible card uses the full-width grid.
6. The internal and portal API payloads include `clientMarketplace`.

Run the focused test files, then `npm run build`. Perform a browser render check
on an SC client such as `DRC_SC_US` and confirm Page 4 shows one full-width Seller
Central card.

## Non-goals

- Inferring marketplace from `clientIdCode`
- Changing AAC metadata
- Regenerating case-study sections
- Removing either channel from the editor
- Rewriting Page 4 narrative or KPI content
- Changing any other case-study page
