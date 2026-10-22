# S8 — Listing Images (optional)

Map to v5 §9.

## Default state

`pending_decision`. Same gate semantics as S7.

## Inputs

- Approved S6 listings
- Approved S4 Rufus image_strategy
- Approved S5 COSMO triples

## Slot per ASIN

Exactly 9 image rows. Technical names fixed:

| # | technical_name | role |
|---|---|---|
| 1 | MAIN | white background, product hero |
| 2 | PT01 | benefit / value prop |
| 3 | PT02 | feature callout |
| 4 | PT03 | use case / lifestyle |
| 5 | PT04 | scale or size reference |
| 6 | PT05 | comparison or differentiator |
| 7 | PT06 | what's in the box / accessories (USED_WITH) |
| 8 | PT07 | trust signal / certification |
| 9 | PT08 | final CTA / brand badge |

All PNG, 2000×2000, RGB.

## Output Schema

```json
{
  "images": [
    {
      "image_number": 1,
      "technical_name": "MAIN",
      "image_type": "white_bg_hero",
      "image_purpose": "...",
      "cosmo_relationship": "IS_A",
      "buyer_stage": "Awareness",
      "overlay_text": "Not Applicable",
      "alt_text": "<95-100 chars>",
      "image_direction": "...",
      "ai_image_prompt": "..."
    }
  ]
}
```

## Validation

- 9 rows, technical names exactly the list above.
- All formats PNG, 2000×2000, RGB (defaulted in DB; override forbidden).
- Alt text 95-100 chars per row.
- Overlay text ≤100 chars; for MAIN must be the literal `Not Applicable`.

## Persistence

- Replace `seo_images` for the ASIN (bump `version`).
- Stamp `seo_projects.s8_approved_at`.
