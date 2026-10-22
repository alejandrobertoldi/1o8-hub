# S4 — Rufus (3 sub-phases)

Map to v5 §4. **Partially manual:** the user must paste questions into live Amazon Rufus and paste responses back.

## Sub-phases

### Phase 1 — IMMUTABLE 5 questions

The 5 canonical questions live in `src/lib/seo/prompts/canonical-rufus-questions.ts`. Never edit. Never reorder. Never substitute.

Flow:
1. Runner reads canonical questions, displays them to user.
2. User pastes Q1 into live Amazon Rufus, pastes Rufus response back.
3. Repeat for Q2-Q5.
4. Runner stamps `seo_rufus.phase1_approved_at` only after all 5 responses are recorded.

### Phase 2 — Generated probing questions (≤496 char batches)

After Phase 1 responses are in, generate 10-15 follow-up questions targeting gaps in v5's 5 canonical query types (see `rubrics/rufus-coverage.md`).

Batch each question payload at ≤496 characters (Amazon Rufus input limit).

### Phase 3 — Optimization synthesis

Once Phase 1 + Phase 2 responses are collected, synthesize:
- `seo_strategy` (one paragraph)
- `listing_plan` (per-section bullet list)
- `image_strategy` (per-image-slot direction — feeds S8)
- `audience_segmentation` (3-5 personas)
- `action_list` (string[])

## Slots

- `{{phase1_responses}}`
- `{{phase2_questions_and_responses}}`
- `{{baseline_summary}}`

## Output Schemas

### Phase 1

```json
{
  "phase1_questions": [
    { "id": "RQ1", "text": "What is this product for?", "intent_tier": "discovery", "batch_char_count": 32 }
  ],
  "phase1_answers": ["Rufus response …"]
}
```

### Phase 2

```json
{
  "phase2_questions": [
    { "id": "PQ_001", "text": "Does this work on sensitive skin?", "intent_tier": "consideration", "batch_char_count": 36 }
  ],
  "phase2_answers": ["Rufus response …"]
}
```

### Phase 3

```json
{
  "phase3_questions": [],
  "phase3_answers": [],
  "rows": [
    { "question_id": "RQ1", "category": "discovery", "rufus_response_summary": "...", "listing_implication": "..." }
  ],
  "optimization_summary": {
    "seo_strategy": "...",
    "listing_plan": "...",
    "image_strategy": "...",
    "audience_segmentation": "...",
    "action_list": ["..."]
  }
}
```

## Persistence

- Update `seo_rufus` row (one per project; unique constraint).
- Stamp per-sub-phase approval timestamps.
- Stamp `seo_projects.s4_approved_at` after Phase 3.
