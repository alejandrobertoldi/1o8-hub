# S7 — Premium A+ (optional)

Map to v5 §8.

## Default state

`pending_decision`. User must explicitly Run or Skip. S9 cannot stamp `s9_approved_at` while S7 is `pending_decision`.

## Inputs

- Approved S6 listings + Q&A subset + module headers
- Approved S5 COSMO triples

## Modules

Exactly 7 modules per ASIN. Position 7 MUST be `premium_qa`. Allowed module types:

- `hero` (1 expected)
- `image_text_split` (multiple allowed)
- `comparison_table_4cell` | `comparison_table_5cell` (max 1 of either total)
- `feature_grid_4` | `feature_grid_5`
- `lifestyle_carousel`
- `premium_qa` (position 7, REQUIRED)

## Slots

- `{{listing_for_asin}}`
- `{{qa_aplus_subset}}` — 5 pairs already computed
- `{{cosmo_triples}}`
- `{{brand_voice}}`

## Output Schema

```json
{
  "modules": [
    {
      "position": 1,
      "module_type": "hero",
      "cosmo_relationship": "USED_FOR_FUNC",
      "fields": { "headline": "...", "subheadline": "...", "body": "..." },
      "images": [
        { "technical_name": "aplus_hero", "alt_text": "...", "overlay_text": "...", "ai_prompt": "...", "dimensions": "1464x600" }
      ]
    },
    { "position": 7, "module_type": "premium_qa", "cosmo_relationship": null, "fields": { "qa_pairs_json": "[{q,a},{q,a},{q,a},{q,a},{q,a}]" }, "images": [] }
  ]
}
```

## Validation

- Modules array length === 7.
- Module at position 7 has `module_type === "premium_qa"`.
- At most one module with `module_type` starting `comparison_table_`.
- Each `premium_qa` pair: question 115-120 chars, answer 245-250 chars, all 5 in Decision stage.

## Persistence

- Update `seo_aplus_plans.modules` (replace).
- Stamp `seo_projects.s7_approved_at`.
