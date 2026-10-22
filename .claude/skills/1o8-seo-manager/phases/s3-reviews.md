# S3 — Reviews

Map to v5 §3.

## Inputs

- `project_id`
- Reviews CSV (per-ASIN reviews) OR Rainforest API pull

## Slots

- `{{reviews_csv}}` — flat review table
- `{{product_summary}}` — from S1

## Prompt

Analyze the customer reviews below.

Reviews:
{{reviews_csv}}

Product summary:
{{product_summary}}

For each review, classify:
- `sentiment` ∈ {"positive","neutral","negative"}
- `key_themes` — comma-separated theme tags
- `usage_mentioned` — what the customer did with the product
- `packaging_feedback`, `price_feedback`, `heat_level_feedback` (if applicable; null otherwise)
- `rufus_usable_insight` — short paraphrase Rufus could quote (≤120 chars)
- `bullet_mapping` — which target bullet (1-5) this insight should land in

## Output Schema

```json
{
  "reviews": [
    {
      "review_id": "R...",
      "asin": "B0...",
      "sentiment": "positive",
      "key_themes": "ease-of-use, durability",
      "usage_mentioned": "daily morning routine",
      "rufus_usable_insight": "Lasts through 8-hour shifts.",
      "bullet_mapping": "3"
    }
  ]
}
```

## Persistence

- Bulk insert into `seo_reviews` (per project, replace on re-run).
- Stamp `seo_projects.s3_approved_at` after user review.
