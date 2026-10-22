# S9 — Score & Hard Gate

Map to new — consolidates v5 scoring rubrics. **Mandatory.** Must pass to publish.

## Hard Gate

- `rufus_coverage_pct >= 80`
- `cosmo_coverage_pct >= 75`
- `prohibited_word_violations.length === 0`
- All byte budgets `ok === true`
- `cosmo_relationship_categories_evaluated.length === 16`
- S7 and S8 each `approved` OR explicitly `skipped` (NOT `pending_decision`)

If any check fails on first run: auto-rerun S6 once, re-score, return final result. No third pass.

## Inputs

- Approved S6 listings, Q&A, passage map
- Approved S5 COSMO triples
- Approved S4 Rufus questions (canonical + Phase 2)
- (If user opted in) deep probe — Claude simulates Rufus answering canonical queries from listing alone.

## Output Schema

```json
{
  "rufus_coverage_pct": 87.5,
  "rufus_5_canonical_coverage": {
    "what_is_this_for":          { "covered": true,  "locations": ["title", "bullet1"] },
    "customer_likes_dislikes":   { "covered": true,  "locations": ["bullet2", "description"] },
    "x_vs_y":                    { "covered": false, "locations": [] },
    "good_for_use_case":         { "covered": true,  "locations": ["bullet3"] },
    "what_comes_with_it":        { "covered": true,  "locations": ["bullet5", "image_pt06"] }
  },
  "cosmo_coverage_pct": 78.0,
  "cosmo_density_per_100_words": 4.2,
  "cosmo_relationship_categories_evaluated": ["USED_FOR_FUNC", "..."],
  "buyer_journey_alignment": {
    "title":       { "expected_stage": "Decision",      "detected_stage": "Decision",      "points": 25 },
    "bullets_1_2": { "expected_stage": "Consideration", "detected_stage": "Consideration", "points": 25 },
    "bullets_3_5": { "expected_stage": "Decision",      "detected_stage": "Decision",      "points": 25 },
    "description": { "expected_stage": "Awareness->Consideration", "detected_stage": "Consideration", "points": 25 }
  },
  "byte_budget_status": { "title": { "used": 70, "max": 75, "ok": true }, "item_highlight": { "used": 120, "max": 125, "ok": true } },
  "prohibited_word_violations": [],
  "missing_rufus_questions": ["RQ4 (x_vs_y)"],
  "missing_cosmo_triples": ["T_018"],
  "overall_grade": "B",
  "probe_transcript": null
}
```

## Persistence

- Insert (do not upsert) into `seo_scores` — keeps run history.
- On pass: stamp `seo_projects.s9_approved_at`.
- On first fail: increment `seo_scores.rerun_count`, trigger S6 with miss list, re-score.
- On second fail: surface to checkpoint review. Do NOT stamp `s9_approved_at`.
