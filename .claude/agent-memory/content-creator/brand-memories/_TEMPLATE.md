# Brand Memory — {brand}

The persistent memory file for the {brand} brand. Read by the `content-creator`, `brand-voice-keeper`, `content-strategist`, `auditor`, and `newsletter-orchestrator` agents at the start of every piece.

This file grows monotonically. Approved patterns accumulate. Rejected patterns join the watch list. Never deleted — only archived after 90 days of inactivity.

---

## Brand Identity

**Brand name:** {brand}
**Brand slug (file naming):** {slug — must match the filename}
**Primary URL:** {URL or "N/A"}
**Owner / Operator:** {name}
**Established:** {date the brand-memory was created}

**One-line value prop:** {what the brand sells / does, in one specific sentence}

**Why the brand exists:** {one paragraph — what problem the brand solves, what makes it credible}

---

## ICP — Audience Segmentation

The single most important section after voice anchors. Every piece is calibrated for this segmentation.

**Floor reader** (least familiar with the technical/domain depth):
- Who they are: {e.g. "indie hackers who code part-time, use Claude Code as chat, ship side projects on weekends"}
- What they know: {e.g. "JS/Python at intermediate level, can read a CLI command, can paste config"}
- What they don't know: {e.g. "MCP servers, hooks, multi-agent patterns, advanced CLAUDE.md architecture"}
- Reading mode: {e.g. "skim-first, deep-read if hooked"}

**Middle reader** (regular user, productive but not power-user):
- Who they are: {e.g. "founders shipping a SaaS, use Claude Code daily for 4-6 hours"}
- What they know: {e.g. "all of floor reader + agents + hooks + commands at working level"}
- What they don't know: {e.g. "deep multi-agent orchestration, custom MCP server building"}
- Reading mode: {e.g. "deep-read if topic is relevant to current ship cycle"}

**Ceiling reader** (deepest technical / domain familiarity):
- Who they are: {e.g. "AI-native engineers running multi-agent pipelines, building Claude tools commercially"}
- What they know: {e.g. "everything above + the implementation details + the failure modes + the trade-offs"}
- What they want: {e.g. "the nuance, the edge case, the technique that's not yet in the docs"}
- Reading mode: {e.g. "scans for novelty, leaves if it's a recap"}

The piece must work for the floor and reward the ceiling.

---

## Voice Anchors — Calibration Paragraph Pairs

The single fastest way to lock voice across sessions. Each pair = an off-brand version + the on-brand version of the same sentence/paragraph. The contrast does the work that abstract style guides cannot.

**Add 3+ pairs minimum. More is better.**

### Pair 1
- ✗ Off-brand: {a paragraph that sounds like the marketing department wrote it}
- ✓ On-brand: {the same paragraph rewritten in the brand's actual voice}
- **What's different:** {one sentence on the specific shift — e.g. "removed hedging, added specific number, dropped 'we' for 'I'"}

### Pair 2
- ✗ Off-brand: {a paragraph that hedges, generalises, or uses banned filler}
- ✓ On-brand: {the same paragraph specific, direct, no hedging}
- **What's different:** {one sentence}

### Pair 3
- ✗ Off-brand: {a paragraph that frames the brand as the entity with the problem the brand solves}
- ✓ On-brand: {the same paragraph framed from outside / pattern-recognition / authority}
- **What's different:** {one sentence}

### Pair 4 (optional but recommended)
- ✗ Off-brand: {a paragraph at the wrong tone — too academic, too casual, etc.}
- ✓ On-brand: {the same paragraph at the brand's actual tone}
- **What's different:** {one sentence}

---

## Banned Phrases (brand-specific)

Beyond the universal banned phrases in `.claude/knowledge-base.md` (em dashes, marketing voice, softer clichés, AI-detector tells, etc.), the {brand} brand additionally bans:

- {e.g. "money-back guarantee"} — {why: e.g. "permanent brand rule, never offer this"}
- {e.g. "AI-powered"} — {why: e.g. "overused in our industry, instant credibility loss"}
- {e.g. "we"} — {why: e.g. "brand is solo-operator, always 'I'"}
- {e.g. "delve into"} — {why: e.g. "AI-detector tell, banned even at hard-rule level}

---

## Signature Phrases (brand-defining, max 1 use per piece)

Phrases that uniquely signal the {brand} brand. Once a phrase becomes overused, it loses meaning. Keep this list short.

- {e.g. "Direct, specific, no hedging"} — used 1x per piece max
- {e.g. "If it can be cut, it should be"} — used 1x per piece max
- {e.g. "The system gets sharper"} — used 1x per piece max

---

## Approved Patterns (3+ confirmations across pieces)

Voice patterns / structural moves / phrasing choices that have been confirmed across 3+ pieces with positive verdict (no rejections, often explicit user praise). Future drafts cite these directly.

| Pattern | Confirmed in | Boost | Example phrasing |
|---|---|---|---|
| (none yet — will accumulate as pieces ship) | — | — | — |

---

## Approved Patterns — Candidates (1-2 confirmations)

Patterns observed in 1-2 pieces with positive verdict. Need 3 confirmations to graduate.

| Pattern | Confirmed in | Verdict | Notes |
|---|---|---|---|
| (none yet — will accumulate) | — | — | — |

---

## Watch List (1 rejection, needs 2nd to ban)

Patterns the user has rejected once. If a similar pattern is rejected a second time, it graduates to the brand-specific banned-phrases list above.

| Pattern | Rejected in | Replacement | Notes |
|---|---|---|---|
| (none yet) | — | — | — |

---

## User Phrases / Structures to Reuse (verbatim)

When the user explicitly praises a phrasing or rewrites a paragraph their way, capture the exact wording here. Future drafts borrow these phrasings directly.

| Phrasing | From piece | Context |
|---|---|---|
| (none yet — will accumulate as the user gives verdicts) | — | — |

---

## Content History

Chronological record of every piece shipped under this brand.

| Date | Platform | Title / Topic | Verdict | Key voice patterns used |
|---|---|---|---|---|
| (none yet) | — | — | — | — |

After 90 days: archive entries to `{brand}-archive-{quarter}.md`.

---

## Brand-Specific Operating Notes

Anything unique about producing for {brand} that doesn't fit the categories above.

- {e.g. "Newsletter ships every Tuesday, never any other day"}
- {e.g. "Always include a code block in technical posts"}
- {e.g. "Subject line for newsletters max 45 chars (10% under universal cap because audience opens on mobile heavily)"}

---

## Quarterly Review Notes

Per `.claude/knowledge-base.md`, every 5+ shipped pieces trigger a brand-memory review. Notes from those reviews go here:

| Review date | Findings | Updates approved |
|---|---|---|
| (first review after 5+ pieces) | — | — |
