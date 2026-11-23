# Client Monthly Report (1o8): design

Status: approved 2026-11-23 · phase 1 built (numbers, layout, PDF); phases 2-4 pending

## Goal

Every month, each active DTC client gets a PDF report built from the hub's Main KPIs, written up by Claude in 1o8's house style, reviewed by PM → AM → ES, and emailed by the AM from the hub with the PDF attached and the account team on copy.

Out of scope for now: weekly reports (later, as a cut of the monthly one), client portal access, Amazon/Intentwise data.

## What we reuse from MarketFoundry

MarketFoundry's monthly report (`src/lib/monthly-report`, `src/components/monthly-report`; routes only in `mfHub-main`) is Amazon/Intentwise-only, has no AI text and no text editing. We keep the plumbing and replace the content:

| Keep | Replace / add |
|---|---|
| React report rendered at a print route, turned into PDF by puppeteer-core + @sparticuz/chromium (`pdf-render.ts`) | Data layer: `kpi_daily` (Shopify, GA4, Meta, Google Ads, Klaviyo) instead of Redshift |
| Upload of PDF to the client's Drive folder (`drive-store.ts`) | Sections for DTC (below) |
| Review stepper UI pattern (`ReviewPipeline.tsx`) | AI writing + rich-text editor per section + versions |
| Resend sending, delivery status (`resend-status.ts`) | Approval PM → AM → ES, reviewers from the client's team roles (not name matching, not a hard-coded CEO email) |
| | PDF attached to the email; CC the whole account team |
| | 1o8 branding, sender, links; no portal link |

## Report contents (one month, one client)

A section appears only when its source is connected for that client. Every number is compared with the previous month and, when the hub has the data, the same month last year.

1. **Cover**: client logo, month, prepared by (AM).
2. **Executive summary** (AI): 3 to 5 sentences plus the 3 headline numbers.
3. **Main KPIs**: net sales, orders, AOV, sessions, conversion rate, total ad spend, MER, email revenue; 13-month net sales trend.
4. **Sales** (Shopify): net sales, orders, AOV, new vs returning, daily chart.
5. **Paid media**: blended (spend, platform revenue, ROAS, CPA, MER), then Meta and Google Ads.
6. **Traffic** (GA4): sessions, users, conversion rate, top channels.
7. **Email** (Klaviyo): revenue (flows vs campaigns), engagement, deliverability.
8. **Wins, watch-outs and next month's focus** (AI).

Each section is numbers and charts (computed, never by AI) plus a commentary block (AI-drafted, editable).

## AI writing

- Model: the hub's AI config (Admin → AI), default the latest Claude model. Key: `ANTHROPIC_API_KEY`.
- Input: only the computed numbers for the sections that exist (current, previous month, last year, trend) plus the client's name and services. No raw rows.
- Style: the SEO writer's default style guide (`seo-writer/clients/style-guide.md`) stored in the hub as an editable setting (Admin → Writing style guide). Rules that apply to a report: Writing, Formatting, AI-detection avoidance, Chicago editorial rules. SEO, intro-hook and CTA rules are blog-only and are left out of the prompt.
- Voice: 1o8 speaking to the client ("we", "your store"), not the brand's own voice.
- Output: JSON with one commentary per section + executive summary + wins/watch-outs/focus. Parsed and validated; a section whose text fails validation stays empty with "Couldn't write this section, write it or retry".
- Guardrail: every figure Claude mentions must come from the input; the prompt says so and a check flags any percentage or dollar amount in the text that isn't in the data.
- "Rewrite with AI" per section, with an optional instruction ("shorter", "mention the BFCM launch").

## Editing

- Each commentary block is a rich-text editor (bold, italics, bullets, links). Library: Tiptap.
- Anyone at the current review step can edit. Every save keeps the previous version (who, when); a reviewer can view and restore older versions.
- Numbers and charts are not editable; to change them, fix the data and press "Refresh numbers", which keeps the edited text.
- Per report, a reviewer can hide a section (e.g. a launch month with no email).

## Approval flow

`draft → pm_review → am_review → es_review → approved → sent` (plus `send_failed`).

| Step | Who | Actions |
|---|---|---|
| Draft generated | system | Notifies the PM |
| PM review | the client's Project Manager (or Project Manager 2) | Edit, approve, regenerate |
| AM review | the client's Account Manager | Edit, approve, send back to PM with a note |
| ES review | the client's Executive Strategist (Aalap) | Edit, approve, send back to AM with a note |
| Approved | the Account Manager | Preview the email, send |

- Reviewers come from the client's team roles (`ProjectManager_MF`, `ProjectManager2_1o8`, `AccountManager_MF`, `ExecutiveStrategist_MF`) resolved to hub users. Owners and super admins can act on any step as a fallback.
- Every action is logged (who, what, when, note), shown as a timeline on the report.
- Each step emails the next reviewer and shows on their My Dashboard.

## Sending

- The AM opens "Send": To = client contacts from the AAC (ClientContactEmail1-5), editable; CC = every team member assigned to the client; Reply-To = AM.
- Subject and a short message (AI-drafted from the executive summary, editable).
- PDF attached (`<CODE> Monthly Report <Month YYYY>.pdf`). No portal link.
- The PDF is also saved in the client's Drive folder (`Reports/Monthly`).
- Delivery status from Resend on the report page.

## Generation

- Daily cron: from the 3rd of the month, create the previous month's draft for every active client with at least one connected source that doesn't have one yet (Vercel Hobby allows one daily cron run per job).
- Manual "Generate" / "Regenerate" button per client (PM, admins).
- Pages: `/reports/monthly` (grid of clients × status for a month, filters "mine" / step) and `/reports/monthly/[code]/[period]` (report with editor, timeline, send).

## Data model (new tables)

- `client_reports`: id, client code, period (YYYY-MM), status, data snapshot (JSONB), hidden sections, pdf Drive URL, sent info (to, cc, resend id, sent at, error), created/updated.
- `client_report_sections`: report id, section key, current text (rich-text JSON + HTML), updated by/at.
- `client_report_section_versions`: section id, text, author, created at, source (`ai`, `edit`, `ai_rewrite`).
- `client_report_events`: report id, actor, action, from/to status, note, created at.
- `hub_settings` row (or a small table) for the writing style guide.

MarketFoundry's `monthly_reports` tables stay untouched and unused.

## Phases

1. Data + report layout + PDF download (no AI, no flow).
2. Claude writing + editor + versions.
3. Approval flow + notifications.
4. Send with attachment + CC + Drive copy.

## Open questions

- Sender address: needs a 1o8 domain verified in Resend (e.g. `reports@1o8.agency`).
- How far back `kpi_daily` goes per client (decides whether the year-over-year column shows).
