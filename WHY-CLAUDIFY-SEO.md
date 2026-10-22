# Why Claudify SEO Instead of the Free Packs

An honest, dated comparison. Every claim below carries the date it was verified so you can check it
yourself. Last verified: 24 Jul 2026.

## The short version

The free Claude SEO packs are genuinely good stateless audit engines. The largest,
AgriciDaniel/claude-seo (MIT licensed, 12,220 stars and 1,787 forks per the GitHub API, retrieved
24 Jul 2026; v2.2.4 with 32 commands, 18 agents, 25 skills, 8 optional MCP extensions, 410 tests),
has decisively won the free category on breadth, install polish, and release cadence. We are not
going to tell you otherwise.

The structural difference is this: **their pack audits; ours learns.** A stateless audit engine
restarts from zero every run. Audit number fifty is exactly as smart as audit number one. This
layer records what it predicted, checks what actually happened 14 to 28 days later, and gets
sharper on YOUR domain with every cycle.

## The dated claims table

Verified against the free pack's full 483-file tree and against this layer on disk, both on
24 Jul 2026.

| Capability | AgriciDaniel/claude-seo v2.2.4 (verified 24 Jul 2026) | Claudify SEO layer (verified on disk 24 Jul 2026) |
|---|---|---|
| Learning loop / memory | Absent. No memory files anywhere in the tree; agents are stateless per run. Its seo-drift tool is a SQLite snapshot differ, not learning | Per-agent MEMORY.md, per-domain geo maps and keyword maps, knowledge nominations, and an auditor promotion pipeline |
| Calibration / prediction records | Absent. Falsifiability metadata is attached at emit time, but nothing records, re-checks, or scores it later | A prediction_record at output time for every measurable recommendation, 14-28 day verification, a Calibration table with residuals, contract guards G1-G6 |
| Outcome grading | Absent. Audit N does not make audit N+1 smarter | Post-Publish Analyst Contract: Output, then Track, then Verify; VERIFIED-POSITIVE and VERIFIED-NEGATIVE outcomes feed What Worked / What Didn't |
| Quality-gate auditor | Absent. All 18 agents are parallel specialists with no fresh-context adversarial reviewer (their issue #177, 20 Jul 2026: subagents silently wrote no findings on large sites and nothing caught it) | A dedicated auditor agent in fresh context, plus self-review scoring floors on every agent output |
| Native AI share-of-voice | Paywalled. Share-of-voice needs paid SE Ranking; LLM citation time-series needs paid Profound; ai-mentions needs paid DataForSEO | /ai-visibility runs natively on WebSearch/WebFetch with honest sample-size labeling, corroborated by the free official surfaces (GSC generative-AI reports, Bing Citation Share); no third-party subscription required |
| Hooks enforcement | One hook (a PostToolUse schema validator) | 17 hooks: completeness gates, claim checks, safe-run snapshots, session quality tracking, compaction handoff chain |
| Knowledge pipeline | Static reference files updated by the maintainer via releases | Runtime nominations validated by the auditor and promoted into the knowledge base as your own domain evidence accumulates |

## Where the free pack is strong (we do not contest this)

Audit surface area, Google API credential tiering, the extension ecosystem, install experience,
test count, and weekly release cadence. Its GEO skill is credible: passage citability scoring, an
AI-crawler robots.txt table, SSR-for-AI-bots checks, and an llms.txt check that is honestly
weighted at zero. If all you want is a broad free audit, it is a fine choice.

## Why the learning loop is the part you cannot copy-paste

Breadth can be forked. A learning loop cannot, because its value is not in the code; it is in the
accumulated record of predictions, outcomes, and residuals for your specific domain. Two examples
of what that record does:

1. **It catches the recommendations that did not work.** Every SEO tool emits recommendations.
   Almost none check, three weeks later, whether the predicted movement happened. This layer's
   Calibration table does, and a recommendation type that repeatedly verifies negative on your
   domain stops being recommended.
2. **It keeps a fresh-context auditor between the work and you.** Producer agents review their own
   output badly (the free pack's issue #177 above is what that failure mode looks like at scale).
   Here, an auditor with no stake in the work reviews it in fresh context before it reaches you.

## Keeping this page honest

This comparison is maintained as a dated claims list. If a row stops being true (the free pack
ships memory, or a calibration loop), the row gets updated with the new date, not quietly deleted.
Checked sources: the AgriciDaniel/claude-seo repository README, docs/COMMANDS.md, hooks/hooks.json,
and the GitHub API repository endpoint, all retrieved 24 Jul 2026.
