# Rufus Coverage Rubric (5 canonical query types — v5 Appendix A.1)

| Query type | Listing source | Required COSMO mapping |
|---|---|---|
| What is this for? | title + bullet 1 | IS_A + USED_FOR_FUNC |
| What do customers like / not like? | bullets 2-3 + description | USED_TO + CAPABLE_OF |
| What's the difference X vs Y? | bullet 2 + A+ comparison module | IS_A + xIS_A |
| Is this good for [use case]? | bullets 3-4 + description | USED_FOR_EVE + USED_IN_LOC |
| What comes with it? | bullet 5 + image PT06 | USED_WITH |

## Coverage formula

`rufus_coverage_pct = (covered_canonical_count / 5) × 0.5 + (covered_phase2_count / phase2_total) × 0.5`

50% weight to canonical, 50% to Phase 2 generated questions.

## Hard gate

`rufus_coverage_pct >= 80`. Below threshold → S9 fails.
