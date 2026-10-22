# COSMO Coverage Rubric

## Coverage components

1. **Keyword reflection** — % of T1+T2 keywords represented as entities in `seo_cosmo_maps.triples`. Target: ≥70%.
2. **Density** — `triples_used_in_listing / (total_words_of_listing / 100)`. Target: 3.0-5.0 per 100 words.
3. **Category breadth** — must evaluate all 16 categories from `prompts/cosmo-relationships.ts`. Empty categories OK; missing categories = fail.

## Aggregation

`cosmo_coverage_pct = 0.5 × keyword_reflection_pct + 0.3 × density_score + 0.2 × category_breadth_pct`

Where:
- `density_score` = 100 if 3.0 ≤ density ≤ 5.0; else 100 × (1 - distance from band).
- `category_breadth_pct` = (categories_evaluated / 16) × 100.

## Hard gate

`cosmo_coverage_pct >= 75`.
