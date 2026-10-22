# S5 — COSMO

Map to v5 §5. **All 16 relationship categories MUST be evaluated** per ASIN. Categories may have zero triples for an ASIN, but every category MUST appear in the `relationship_categories_evaluated` array.

## Inputs

- `project_id`
- Approved S2 keywords
- Approved S4 Rufus optimization summary

## Slots

- `{{keywords_by_tier_json}}`
- `{{rufus_summary}}`
- `{{product_summary}}`

## Prompt

Build the COSMO graph for this product.

Keywords by tier:
{{keywords_by_tier_json}}

Rufus summary:
{{rufus_summary}}

Product:
{{product_summary}}

For EACH of the 16 relationship categories from `prompts/cosmo-relationships.ts`, generate triples.

Density target: 3-5 explicit relationships per 100 words of eventual listing content (the runner will validate at S6 / S9).
Coverage target: at least 70% of T1+T2 keywords reflected in graph entities.

## Output Schema

```json
{
  "triples": [
    {
      "id": "T_001",
      "entity1": "...",
      "relationship": "USED_FOR_FUNC",
      "entity2": "...",
      "confidence": 0.92,
      "confidence_level": "High",
      "supporting_keyword_tier": "T1"
    }
  ],
  "relationship_categories_evaluated": [
    "USED_FOR_FUNC", "USED_TO", "CAPABLE_OF", "USED_FOR_EVE",
    "USED_ON", "USED_IN_LOC", "USED_AS", "IS_A", "xIS_A",
    "USED_IN_BODY", "USED_WITH", "USED_FOR_AUD", "USED_BY",
    "xINTERESTED_IN", "xWANT", "xLIKES"
  ],
  "keyword_coverage": { "T1": 0.92, "T2": 0.78, "T3": 0.61, "T4": 0.42 },
  "competitive_positioning": "..."
}
```

## Validation

- `relationship_categories_evaluated.length === 16`.
- Every triple has unique `id` (`T_001`, `T_002`, …).
- `relationship` ∈ the 16 listed.
- `confidence_level` ∈ {"High","Medium","Low"}.

## Persistence

- Update `seo_cosmo_maps` row (one per project; unique constraint).
- Stamp `seo_projects.s5_approved_at` after user review.
