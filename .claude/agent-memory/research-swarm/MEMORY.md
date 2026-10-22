# Research Swarm Memory

Your engine's experiential memory. Agents read this at startup and append distilled
learnings after runs. It ships seeded with the METHOD lessons the engine was built
from (each one earned by a real research failure); your own markets, base rates,
and patterns accumulate below as you run.

## Previously Researched Markets

(Your runs append here: market, the scoped figure or range, the date, the run id.
Reuse beats re-research; the engine's decay math handles staleness automatically.)

## Source Quality Learnings

- Research firms (Statista, Grand View, IBISWorld, Fortune BI): reliable for
  market sizes, but scope definitions differ 3-6x between firms. Always record
  WHICH scope a figure covers.
- Review and comparison sites: frequently carry stale pricing. Verify every price
  against the vendor's LIVE pricing page and date it.
- Founder case studies and community posts: useful color, medium credibility,
  survivorship-heavy. Failures die silently and never get written up.
- Self-reported metrics (revenue, users, conversion): treat with +/-30%
  uncertainty, always.
- Vendor-published "state of X" data: real data plus a commercial incentive.
  Expect a credibility tax from sophisticated readers; corroborate independently.

## Failure Patterns (the method lessons; each has a matching engine tripwire)

- Platform-total vs product-line conflation: the single most common real citation
  error (a parent company's revenue quoted as one product's). The scope-bound
  entailment gate exists because of it; keep scope_entities on every claim.
- Fast-growing-company metrics stale within months: a figure that was right
  became 5.6x wrong inside a year. Half-life about 90 days for such metrics.
- Citation laundering: multiple articles tracing to one press release read as
  corroboration. Count origins, never citations; when unsure, cluster together.
- "No competitor found" has two readings: blue ocean AND dead zone. Default
  framing is dual; the absence tripwire caps its likelihood ratio at 1.0.
- Single reported ratios from wide input ranges are cherry-picks: report
  pessimistic / base / optimistic, always (the tripwire forces it).
- Inverted break-even arithmetic happens: higher revenue must break even sooner;
  the tripwire checks the direction.
- Circulating statistics without traceable primary sources are often fabricated
  or mutated by content mills. Trace before citing; exclude when untraceable.
- Channel-blended CAC numbers mislead: segment by channel; paid-search CAC can be
  fatal at low ACV where content-led and referral survive.

## Agent Performance Notes

(Appended after runs: which specialist over- or under-delivered, rogue behavior,
prompt fixes that worked. This is how the swarm gets sharper for YOUR domains.)

## Process Learnings

(Appended after runs. Seed rules: inject specific numbers, not summaries, when
passing phase-1 data forward; re-check the competitor landscape on any follow-up
run of a previously-assessed idea; for B2C questions, consumer-sentiment surveys
are often the most decision-relevant single source.)
