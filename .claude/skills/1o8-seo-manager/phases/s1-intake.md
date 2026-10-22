# S1 — Intake

Map to v5 §1 + §1.13.

## Inputs

- `project_id` (uuid)
- Brand guidelines markdown (snapshot from `seo_projects.brand_guidelines_lock`, populated at project creation by `renderBrandGuidelinesMd()` from `client_brand_guidelines`)
- Variation theme (if any)
- ASIN list with: `asin`, `sku`, `amazon_url`, `website_url`, `parentage_level`, `variation_*` fields, existing listing content (Columns M-AM)

## Slots

- `{{client_id_code}}`
- `{{brand_name}}`
- `{{brand_voice}}`
- `{{words_to_avoid}}`
- `{{positioning}}`
- `{{variation_theme}}`
- `{{asin_grid_json}}` — full ASIN list as JSON

## Prompt

You are intake-validating an Amazon SEO project for {{brand_name}} ({{client_id_code}}).

Brand Voice: {{brand_voice}}
Positioning: {{positioning}}
Words to avoid: {{words_to_avoid}}
Variation theme: {{variation_theme}}

ASIN intake grid:
{{asin_grid_json}}

Tasks:
1. For each ASIN, run a `baseline_analysis` (see schema below) on the existing listing content. Score quality 0-100.
2. Flag compliance issues from the existing content against the prohibited word list (referenced from `rubrics/amazon-compliance.md`).
3. List the top 3 improvements per ASIN.
4. Identify keyword integration: "strong" | "moderate" | "weak".

## Output Schema

```json
{
  "asins": [
    {
      "asin": "B0XXXXXXXX",
      "baseline_analysis": {
        "quality_score": 73,
        "keyword_integration": "moderate",
        "compliance_flags": ["uses 'cures'"],
        "top_improvements": ["..."]
      }
    }
  ]
}
```

## Validation

- Every ASIN in `{{asin_grid_json}}` must have a row in output.
- `quality_score` ∈ [0, 100].
- `keyword_integration` ∈ {"strong", "moderate", "weak"}.

## Persistence

- Update `seo_asins.baseline_analysis` per row.
- Stamp `seo_projects.s1_approved_at` after user review.
