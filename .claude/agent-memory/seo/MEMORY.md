# SEO Agent Memory

Persistent knowledge across sessions. Read at startup. Updated after every task.
Curate when file exceeds 200 lines — archive data older than 90 days.

---

## Tool Access Status

| Tool | Status | Last Checked | Notes |
|------|--------|--------------|-------|
| PageSpeed Insights API | Unknown | — | No auth required |
| Google Search Console | Unknown | — | Requires user auth — set in CLAUDE.local.md |
| Ahrefs free tools | Unknown | — | No auth required |
| Screaming Frog CLI | Unknown | — | Check with `which screamingfrog` |
| curl / direct crawl | Available | — | robots.txt, sitemap, headers |

---

## Active Domains

| Domain | Last Audit | Tier | Health Score | Next Due |
|--------|-----------|------|-------------|----------|
| 1o8hub.vercel.app | 2026-05-05 | T1 | 22/100 (caveat: internal tool) | 2026-08-05 |

---

## Ranking Alerts

| Date | Domain | Keyword | Position Change | Cause | Status |
|------|--------|---------|----------------|-------|--------|

---

## Known Patterns

_(Recurring observations across audits — nominated to knowledge-base when confirmed 2+ times)_

- **Auth-gated B2B tools fail standard SEO weighting unintentionally.** robots.txt and sitemap.xml getting 307'd to a login page is a common Next.js + NextAuth misconfiguration. The middleware matcher excludes auth callbacks but forgets crawler endpoints. Confirmed once on 1o8hub.vercel.app (2026-05-05). [Promote to KB if confirmed on 1+ additional client domain.]

---

## Resolved Patterns

_(Patterns that have been fixed or explained)_

---

## Backlink Opportunities

| Domain | Type | Target URL | Prospect | Status | Added |
|--------|------|-----------|---------|--------|-------|

---

## Audit History

| Date | Domain | Tier | Verdict | Key Findings |
|------|--------|------|---------|-------------|
| 2026-05-05 | 1o8hub.vercel.app | T1 | PASS-WITH-CAVEATS | Auth-gated tool — score misleading. 2 real issues: robots.txt (C1) + sitemap.xml (C2) auth-redirected. Strong security baseline. Full report: `audits/1o8hub-vercel-app/T1-050526.md` |

---

## Competitor Registry

| Domain | Tracked For | DA/DR | Content Cadence | Last Scanned |
|--------|------------|-------|----------------|-------------|

---

## Pending Recommendations

| ID | Domain | Recommendation | Priority | Status | Added | Verified |
|----|--------|---------------|---------|--------|-------|---------|

---

## Audit Output Log

| ID | Date | Domain | Tier | Verdict | Findings | Actionable % | Self-Review Score |
|----|------|--------|------|---------|----------|-------------|------------------|

---

## Calibration

| Rec ID | Prediction | Actual | Outcome | Date Verified |
|--------|-----------|--------|---------|--------------|

---

## What Worked

_(VERIFIED-POSITIVE outcomes — tactics with confirmed positive impact)_

---

## What Didn't Work

_(VERIFIED-NEGATIVE outcomes — tactics tried and disproven with learnings)_
