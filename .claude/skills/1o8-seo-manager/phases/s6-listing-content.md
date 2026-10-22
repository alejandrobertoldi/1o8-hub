# S6 — Listing Content (4 batches, atomic transaction)

Map to v5 §7. Four sequential batches with internal APPROVED gate per batch. Final write is one PG transaction.

## Batches

1. **Titles** — produce title per ASIN, ≤75 chars, hyphen-only, no colons, word-repeat cap 2. ALSO produce **item_highlight** per ASIN, ≤125 chars, comma-separated Title-Case phrases, no colons, no words repeated from the title (carries overflow keywords).
2. **Bullets** — 4 versions × 5 = 20 fields. ALL CAPS HEADER: prefix mandatory. Bullets 1-4 universal, bullet 5 variation-specific.
3. **Description** — 1000-1200 chars, no colons.
4. **Backend** — single string ≤500 bytes UTF-8. Internally tracked by category (`core`, `supplement`, `symptom`, `audience`, `longtail`) but emitted as one merged field.

After all 4 batches APPROVED, generate the **Q&A artifact** (12-15 pairs) AND the **passage map** (every passage tagged with which Rufus question_ids + COSMO triple_ids it covers).

## Slots

- `{{approved_keywords_json}}`
- `{{rufus_phase3}}`
- `{{cosmo_triples}}`
- `{{brand_voice}}`
- `{{words_to_avoid}}`
- `{{variation_family_summary}}`
- `{{asin_specific_attributes}}`

## Per-batch passes (titles & bullets)

The titles and bullets batches are not a single Claude call — each runs a fixed
pass chain. Both in-chat and in-app runners MUST apply the same chain:

| Batch | Pass chain |
|---|---|
| Titles | generation → humanize → **CMOS editorial** (3 calls) |
| Bullets | generation → humanize → **CMOS editorial** → coherence (4 calls) |

- **CMOS editorial** = Chicago Manual of Style (18th ed.) grammar/style pass.
  Rules + guardrails in `rubrics/cmos-editorial.md`. Applies to the `Title` field
  (NOT `item_highlight`) and to bullet bodies; never changes voice/tone, keywords,
  ALL CAPS headers, ASINs, or JSON field names. Best-effort: on any failure, keep
  the pre-CMOS output unchanged.

## Prompt skeleton (per batch)

(Full prompt in runner; this file documents the contract. Each batch ends with the runner re-prompting "APPROVED" or surfacing edits.)

## Output Schema (final, after all 4 batches + Q&A + passage map)

```json
{
  "listings": [
    {
      "asin_id": "uuid",
      "title": "...",
      "item_highlight": "...",
      "bullets": {
        "detailed": ["HEADER 1: ...", "HEADER 2: ...", "HEADER 3: ...", "HEADER 4: ...", "HEADER 5: ..."],
        "concise": ["HEADER 1: ...", "...", "...", "...", "..."],
        "content": ["...", "...", "...", "...", "..."],
        "key_features": ["...", "...", "...", "...", "..."]
      },
      "product_description": "...",
      "backend_search_terms": "...",
      "backend_categories": { "core": "...", "supplement": "...", "symptom": "...", "audience": "...", "longtail": "..." },
      "byte_usage": { "title": { "used": 70, "max": 75, "ok": true }, "item_highlight": { "used": 120, "max": 125, "ok": true }, "...": {} },
      "compliance_violations": []
    }
  ],
  "qa_pairs": [
    {
      "id": "QA_001",
      "question": "...",
      "answer_short": "...",
      "answer_long": "...",
      "intent_tier": "consideration",
      "source_rufus_question_id": "RQ3",
      "source_review_themes": ["..."]
    }
  ],
  "passage_map_by_asin": {
    "<asin_id>": [
      {
        "section": "title",
        "text": "...",
        "rufus_question_ids": ["RQ1"],
        "cosmo_triple_ids": ["T_001", "T_005"],
        "keywords_used": ["..."]
      }
    ]
  }
}
```

## Validation

- **CMOS editorial pass applied** to titles and bullets (per `rubrics/cmos-editorial.md`): no meaningless intensifiers (§5.225), no pleonasms (§5.195), compound modifiers hyphenated before nouns (§7.85), bullets B1–B5 parallel within each ASIN (§5.249-252), abstract claims made concrete where inferable (§5.254). Skipping this pass is a phase failure, not a warning.
- Each listing has 20 bullet fields exactly. Each bullet starts with `^[A-Z][A-Z0-9 ]*: ` (ALL CAPS HEADER:).
- Title length ≤ 75, no `:`, no repeated word > 2 times.
- `item_highlight` length ≤ 125, no `:`.
- Description length ∈ [1000, 1200], no `:`.
- `backend_search_terms` byte length ≤ 500 (UTF-8).
- Compliance scan against `rubrics/amazon-compliance.md` produces zero unbypassed violations.
- Q&A pairs count ∈ [12, 15].
- Passage map covers ≥80% of canonical Rufus questions (else S6 returns warning, S9 will fail).

## Persistence (atomic)

Inside one PG transaction:
1. Upsert `seo_listings` per ASIN (bumping `version`).
2. Upsert `seo_qa` rows; compute `aplus_qa_subset` (5 pairs, Decision-stage), `customer_qa_export` (full set), `passage_map_qa` (Rufus + COSMO links).
3. Upsert `seo_aplus_plans` row with module headers only (positions 1-7, position 7 = `premium_qa` shell). Full A+ body filled in S7.
4. Upsert `seo_passage_map` with all passages.

If any step fails, rollback all four. Stamp `seo_projects.s6_approved_at` only after the transaction commits.
