# CMOS Editorial Pass (Chicago Manual of Style, 18th ed.)

Grammar/style cleanup applied to **titles** and **bullets** during S6 Listing Content.
This is a copy-edit pass only — it does **not** change voice, tone, or narrative
structure (a separate humanize pass owns those). Source of truth in the in-app
runner: `cmosRows()` in `src/app/api/seo/claude/seo/route.ts`.

## Where it runs in the pipeline

Runs as a discrete Claude call **after** humanization, once per batch:

| Batch | Pass order |
|---|---|
| Titles | generation → humanize → **CMOS** (3 calls) |
| Bullets | generation → humanize → **CMOS** → coherence (4 calls) |

- Operates only on `HUMANIZE_FIELDS[batch]`. For the **titles** batch that is the
  `Title` field only — `item_highlight` is NOT touched by CMOS.
- On any failure (non-2xx, unparseable JSON, length mismatch) the pass returns the
  pre-CMOS rows unchanged — it is best-effort, never blocking.
- Output must be a JSON array with the exact same structure and row count as input;
  only the listed fields are merged back over the originals.

## The five rules (apply these ONLY)

### §5.225 — Intensifiers
Remove meaningless intensifiers; replace with the specific factual claim they gesture at.
- Remove: very, really, quite, extremely, incredibly, amazing, revolutionary,
  game-changing, next-level, cutting-edge, state-of-the-art, powerful, exceptional,
  superior, ultimate
- `very durable` → `holds 200 lbs`
- `incredibly easy` → `ready in 30 seconds`
- `amazing results` → state the actual result

### §5.195 — Pleonasms
Remove redundant word pairs where one word already implies the other.
- `free gift` → `gift` · `completely unique` → `unique` · `new innovation` → `innovation`
- `added bonus` → `bonus` · `end result` → `result` · `past history` → `history`
- `future plans` → `plans` · `true fact` → `fact` · `close proximity` → `proximity`

### §7.85 — Compound modifiers
Hyphenate compound modifiers that appear before a noun.
- `heavy duty grip` → `heavy-duty grip` · `easy to clean surface` → `easy-to-clean surface`
- `long lasting hold` → `long-lasting hold` · `fast acting formula` → `fast-acting formula`
- `water resistant coating` → `water-resistant coating` · `non stick surface` → `non-stick surface`

### §5.249-252 — Parallel structure
Within each ASIN's `DetailedBulletPoint` series (B1–B5), all 5 bullets must open with
the same grammatical pattern. If B1 starts with an imperative clause, B2–B5 must too.
If B1 starts with a result phrase, all must. Do NOT mix patterns within one ASIN.

### §5.254 — Concrete over abstract
Replace vague superlatives/abstract claims with specific, verifiable ones wherever the
specific information can be inferred from context.
- `exceptional quality` → describe what makes it exceptional
- `premium materials` → name the material if known
- `best-in-class performance` → state the performance metric

## Hard guardrails (never violate)

- Keep MUST-KEEP keywords verbatim — do NOT drop or substitute any required phrase.
- Do NOT change: keywords, JSON field names, ASIN values, the `ALL CAPS HEADER:` prefix
  before the colon in bullets, voice/tone, or narrative structure.
- Do NOT exceed the per-field character limits in `rubrics/byte-budgets.md`.
