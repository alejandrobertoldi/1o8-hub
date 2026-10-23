# 1o8 Hub — local draft

This folder is a full copy of MarketFoundry's hub (`../mfHub-main`), set up to
run on this machine with no external services connected. Same design, layout,
navigation and modules. Client and team data come from the 1o8 Google Sheet.

## Start it

```bash
npm run db:local     # terminal 1: local Postgres on :54330 (keep it running)
npm run dev -- --port 3108   # terminal 2
```

Open http://localhost:3108 and click **Local dev login** (only shown by `next dev`).
You sign in as the owner account (`DEV_LOGIN_EMAIL` in `.env.local`).

## First-time setup (already done once)

```bash
npm install
npx drizzle-kit push --force   # creates every table from src/lib/db/schema.ts
npm run seed:local             # owner + team + clients from the sheet
npm run seed-hub-features
npm run seed-holidays
```

## Where the sheet data goes

| Sheet tab | Hub table | Notes |
|---|---|---|
| AAC 1o8 | `aac` (raw_data JSON) | 1o8 columns are aliased to MarketFoundry names the UI reads, e.g. `ClientIDCode - ASANA` → `ClientIDCode`, `AccountManager1_1o8` → `AccountManager_MF`, `CreativeManager_1o8` → `DesignManager_MF`, `PaidManager_1o8` → `PPCManager_MF`. Services are stored as `Service: <name>`. Rows with no code are skipped. |
| 1o8_Performance_Team | `users` + `team_directory_profiles` | See "Team directory" below. Emails are **placeholders** (`firstname.lastname@1o8.agency`) until real ones are set. VPN codes are never imported. |

Re-run `npm run seed:local` any time to pull the latest sheet.

## Brand voice (per client)

Each client has a **Brand Voice** tab (`/clients/<CODE>/brand-voice`, table
`client_brand_voice`, migration `0133`). It has the same fields as the 1o8 SEO
blog tool (`~/Documents/1o8/Ops/SEO/seo-writer`): value prop, why the brand
exists, three audience levels, personality and tone, off-brand vs. on-brand
examples, signature/banned phrases, competitors, reference posts, pillar
keywords, product facts and internal links.

```bash
npm run import:seo-writer -- --dry-run   # preview
npm run import:seo-writer                # KSS, LPS, MSN, SPF matched by website domain
npm run import:seo-writer -- --map some-slug=CODE   # when the domain doesn't match
```

The importer never reads seo-writer's `config.json` (it holds API keys and tokens).

## 1o8 design

The hub uses the 1o8 brand (`docs/brand/1O8-BRAND.md`): Yellow `#F7BF1D`
accent, Ink `#2C2B35` text, Inter, light theme by default, 1o8 logo
(`public/1o8_Logo_*.png`, `1o8_Mark_*.png`, `favicon.png`). In light mode,
brand-coloured text renders as deep gold `#8A6700` for contrast (see the end of
`src/app/globals.css`).

## Local-only changes vs. mfHub

- `src/lib/db/index.ts`, `src/lib/archive/drainer.ts`: `DATABASE_SSL=disable` turns off TLS for local Postgres.
- `src/lib/auth.ts`, `src/app/auth/signin/page.tsx`: "Local dev login" (dev server only).
- `src/app/api/team/route.ts`: team directory filters on `@1o8.agency` instead of `@marketfoundry.agency`.
- `scripts/local/*`: local Postgres + sheet seed + seo-writer import.
- Rebrand: colors/fonts in `globals.css` + `layout.tsx`, logos via `src/components/brand/brand-logo.tsx`,
  "MarketFoundry" UI copy renamed to "1o8", client Team section shows the nine 1o8 roles (`TEAM_ROLES`).

## Not connected yet

Google OAuth, BigQuery, Google Drive, Redshift/Intentwise, SP-API, Rainforest,
Helium 10, Anthropic, Resend, Asana. Pages that depend on them load empty or
show their own error state.

## Scope cleanup (2026-10-20)

1o8 is a digital marketing agency, not an Amazon agency, so these were removed:

- **Nav groups Catalog, Design, PPC** (+ AttributesMaster table, SP-API credentials, portal Design).
  Pages parked in `_archive/marketfoundry-amazon/` (see its README to restore). APIs and libs are still in `src/`.
- **Client page:** Forecast tab, Brand Registry, Walmart, Intentwise, PPC goals, Other Details
  (Levanta, FeedbackWhiz, Expo West).
- **Products card → Asana tasks** (`src/components/clients/client-asana-summary.tsx`,
  `GET /api/clients/[code]/asana-summary`): Open / Due today / Overdue + the next 5 tasks, read from
  `asana_tasks`. That table is filled by the My Dashboard Asana sync, which still points at
  MarketFoundry's reporting project (`ASANA_REPORTING_PROJECT_GID` in `src/lib/my-dashboard/asana-map.ts`)
  and maps tasks to clients by project-name prefix. It needs 1o8's Asana token + project setup.
- **Client tabs:** Overview · Client Settings (Brand Voice, Brand Guidelines) · Case Study.
- **Dark mode** is the default theme.

## Asana

1o8 shares the Asana workspace with MarketFoundry. Every 1o8 task is multi-homed in
**"AAA - 1o8 Agency Reporting"** (`ASANA_REPORTING_PROJECT_GID`), so the hub only syncs that
project (read-only) into `asana_tasks`. A task is linked to a client when its client project or its own name
starts with an AAC code: `KSS | K9 Sport Sack`, `STS  - Star Sweat`, `EXT: MSN | Mission`,
`MSN | 12 Days of Gifting`. Bare codes only count if they exist in the AAC table, and MF-style
`SOP_SC_US` codes keep working.

1. In Asana: profile photo → **Settings → Apps → Manage developer apps** (or https://app.asana.com/0/my-apps)
   → **Create new token** → name it "1o8 Hub local" → copy it.
2. Paste it into `.env.local` as `ASANA_ACCESS_TOKEN="…"` (the file is gitignored; never commit it).
3. Restart `npm run dev`, then run `npm run sync:asana`. The client Overview card fills in.

The token sees only what its owner can see in Asana, so the owner needs access to the reporting project.
In production, use a service-account token in Vercel env vars. The existing cron in
`vercel.json` (every 15 min, needs `CRON_SECRET`) keeps it fresh.


## Team directory

`/team` → **Directory**, **Org chart** and **Assignments** (all visible to every internal user). Data: `users` (name, title, departments,
phone) + `team_directory_profiles` (company, expertise, type, location, time zone, work days,
local/Chicago hours; migration `0134`). "Accounts" is computed live from the AAC role columns.

- **Visible to all internal staff.** Only admins (owner / super admin / admin) can add, edit
  or remove people (`/api/team/directory`, `/api/team/directory/[userId]`). Removing is soft:
  the person becomes `alumni` and loses any lead seat; their account and hours stay.
- **Departments (1o8):** Account Management, Project Management, Creative, Email Marketing,
  Paid Media, Web Development, SEO, Social Media, Finance, HR. Owners and the CEO form the
  "Leadership" band. MF's enum values stay in the DB type (Postgres enums are append-only).
- **Sheet sync:** `npm run sync:team` (`-- --dry-run`, `-- --overwrite`). It creates people who
  are missing and fills empty fields. It never overwrites hub edits (unless `--overwrite`), never
  removes anyone, and sets department leads only where none exist (Director/Lead over Manager).

### Person card (`/team/[userId]`)

Clicking a directory row, its edit button or a person in the org chart opens the same card.
Anyone on the team gets the tier-0 view (title, departments, the **Directory** section).
The owner and the person themselves also see personal and pay data (MF's rules, unchanged).
Admins edit the Directory section inline (`PATCH /api/team/directory/[userId]`, partial).

### Org chart (`org_positions`, migration `0135`)

Seats, not departments: each seat has a title, the seat it reports to, and a person or
nobody ("Open"). Seeded once from the "2026 Org Chart" tab (`npm run seed:org-chart`; the
transcription lives in `src/lib/team/org-chart-seed.ts`; `-- --reset` replaces all seats).
After that the hub is the source of truth. Admins click **Edit chart** to assign people, add
seats or roles, and remove seats (the seats under it go too). If someone becomes alumni,
their seat shows as Open.

### Assignments

Live version of the "By Team Member" tab: a person × role heatmap across every **active**
account (from the AAC role columns), plus "Select a team member" (their accounts and roles) and
"Select an account" (its team as a mini org chart). `GET /api/team/assignments`.

## Hours (Time Tracking 2.0)

Replaces MF's start/end-time tracker (parked in `_archive/marketfoundry-hours/`). Same model as the
"TIME TRACKING 2.0 (Pilot)" sheet, on the `time_logs` table (migration `0136`):

- **Entry:** date, decimal hours (0.25 steps, ≤ 24), client (only **active** AAC clients + `1O8`
  internal), department / type of work, project, optional notes. The billing type is derived:
  Client work / Internal (non-billable) / PTO / Holiday.
- **Project Number:** client code + the 5 digits of the Asana task's "1o8 Internal ID"
  (`MSN08132`). `CODE00000` is general account work; `1O800000` and `1O89000x` are internal codes and PTO.
  The list shows the client's Asana tasks that are open or were **completed in the last 14 days**.
  Paid Media / Email & SMS / Web Dev / Creative / SEO & Content / Social narrow it to that team's
  tasks (from the "1o8 | Internal … Team" projects). If a team has no tagged tasks, all of them show.
- **Rules:** minimum 8 h per workday (PTO included). Under-minimum days show in red.
  Rules and lists live in `src/lib/time-logs/catalog.ts`.
- **Pages:** `/hours` My timesheet (everyone; admins can switch to any person) ·
  `/hours/insights` (admins): compliance, client vs internal vs PTO, top projects, **client hours vs
  estimate** (AAC "Estimated Hours" per month, prorated to the range), and hours by person/client × department.
  Each client's Overview also shows "Hours this month" vs. its estimate.
- **Asana sync** (`npm run sync:asana`) now also stores each task's Internal ID, team tags, projects and
  completion date, and pulls tasks completed in the last 14 days.

## Holiday calendars

One calendar per country the team works from: **US, MX, BO, BR, PE, PH, TN**
(`VALID_COUNTRY_CODES` in `src/lib/constants.ts`; flags in `src/components/country-flag.tsx`).
MF's PK, ES, PT and FI were removed (migration `0137`). `npm run seed-holidays` loads 2026–2027:
national days only, and lunar/Islamic dates (PH, TN) are marked **(estimated)**, so review them each year.
Everyone on the team is assigned a calendar by location.

**Show / hide (admins):** the Content Calendar (`/calendar`) has a row of flag chips. Turning a country
off hides its holidays from the general calendar for everyone (`holiday_calendar_settings`,
migration `0138`, `GET/PUT /api/holidays/calendars`). It never changes the time-off day count of the
people assigned to that calendar.

## Team calendars from Asana (Email → Send dates, Paid Media → Campaign calendar)

Both use the same component (`src/components/task-calendar/task-date-calendar.tsx`, `GET /api/task-calendar?tag=`),
with the Content Calendar's month header (‹ Month Year › · Today).
- `/email/send-dates`: tag `Email`. `/paid-media/campaigns`: tag `Paid Media`, i.e. campaigns on their launch date.
  `/web/launches`: tag `Web Dev`, i.e. launches / go-lives (few web tasks have a Go Live Date yet).

### Email → Send dates (`/email/send-dates`)

Month calendar of every email task (Asana tasks in "1O8 | Internal Email Team", service tag `Email`)
on its **Go Live Date** (the send date, Asana custom field `ASANA_GO_LIVE_FIELD_GID`, stored in
`asana_tasks.go_live_date`, migration `0137`). You can filter by client and assignee and hide sent ones.
A send that's past its date and not completed is flagged red. Open email tasks with no Go Live Date are
listed below the calendar. Data comes from the Asana sync (open tasks + tasks completed in the last 14 days).


## Readiness (`/team?view=readiness`)

Live version of the "Readiness" tab in the **1o8 Agency Dashboard** sheet (1jfpMcTFnZzIux7A27HvNJzip1zouGintbR1w4FHWgSo).
It counts open Asana tasks (the `asana_tasks` mirror), **due today** and **overdue**, by team member and by
department. **Readiness = 1 − overdue / open.** "Today" is Chicago's date.

- **Assignee mapping** (`asana_assignee_map`, migration `0139`): each Asana assignee → team member
  (email first, then name and nickname rules in `src/lib/readiness/match.ts`), plus department and
  excluded. It was seeded from the sheet's Department + Exclude columns. Admins edit it at the bottom of the board.
  Client contacts (mission.com, goelk.com, brahminusa.com) are excluded.
- **Daily snapshot** (`readiness_snapshots`): one per day per total / department / person.
  - Production: the cron `/api/cron/readiness-snapshot` runs at 12:00 UTC (7 am Chicago). It syncs Asana, then saves.
  - Locally: run `npm run snapshot:readiness`. Opening the board after 6 am Chicago also saves the day's
    snapshot if none exists yet.
  - Admins can **Sync Asana** and **Save snapshot** (replaces today's) from the board.
- **Compare** with yesterday, 7 days, 30 days or any saved day. Deltas use the closest saved day on or before it.
  The **trend** chart plots readiness per department over saved days. History starts on 2026-10-21.

## Service providers (`/admin/service-providers`, admins only)

Agencies and freelancers 1o8 contracts but who are **not employees** (seeded: WODO — agency, Web,
`projects.wodo@gmail.com`; Althea Ordonez — freelancer, Email). Table `service_providers` (migration 0140):
name, type (agency/freelancer), Readiness department, services, emails, contact, website, location, time
zone, status (active/inactive), notes.

- They never appear in the team directory, org chart or people pickers.
- Asana assignees are linked to a provider by any of its emails, else its exact name
  (`asana_assignee_map.provider_id`). A team-member match always wins.
- Readiness shows them with a **Provider** badge and an All / Team / Providers filter; they still count in
  their department and in the totals. Snapshots keep `provider_id`.
- In the Readiness "Asana assignee mapping" editor, an assignee can be linked to a team member *or* a provider.
- Deleting a provider unlinks its Asana assignee (its tasks stay on the board). Set it to Inactive instead to
  keep the link.

### Readiness on My Dashboard (`/me`)

A Readiness card shows **Mine** (the person's open / due today / overdue Asana tasks) and **<Dept> team** (their
Readiness department), with the change vs the latest earlier snapshot. API: `/api/readiness/person?user=<id>`.
Colors everywhere on Readiness: due today = orange, overdue = red (`src/lib/readiness/tone.ts`).

### My Dashboard alerts (1o8)

MarketFoundry's Amazon alerts (PPC alerts, stale sales data) are no longer produced (functions kept in
`src/lib/my-dashboard/alerts.ts`). Alerts now come from Asana, ranked critical → warning → info:

- **Go Live**: my open tasks whose Go Live Date passed (critical) or is in the next 7 days (warning).
- **Late**: my tasks 3+ days overdue (critical from 7 days).
- **Client readiness**: my clients (AM/PM on the AAC row) under 70% readiness across all their open tasks (critical under 50%).
- **Blocked / On hold**: my tasks with that 1O8 Status.
- **No due date**: one summary line with the count.

Thresholds are constants at the top of the 1o8 section in `alerts.ts`. The panel shows 8 and expands.
Also fixed: tasks match the person's Asana email too (`users.asana_email`), and the admin person picker lists
`@1o8.agency` staff (it was filtering `@marketfoundry.agency`).

### Readiness focus filter

Team → Readiness has a **View** selector (Everyone / a team / a person). KPIs, the table and the trend follow it
(the trend shows that person's line from the daily snapshots: `/api/readiness/history?person=<key>`). The
crosshair next to a name focuses on that person.

## Hours insights dashboard (`/hours/insights`)

Replaces the "Dashboard" tab of the team's TIME TRACKING 2026 sheet (1Loe53VHgfbnfcz73wbRrBqMqbTkeOh3ZtMi1FfTKLkM),
which covers all time, with a period view that **opens on the current month**. Period shortcuts (this/last month,
this/last week Mon–Sun, quarter, YTD, custom) and filters: Team (Readiness department), Person, Type of work.
KPIs (total, client / internal / PTO, logged vs 8 h × workdays, people logging), hours by client, hours by person
(client vs internal vs PTO), hours per week, type of work, and the Person × Client matrix (the sheet's Summary
tab). The TIME TRACKING 2.0 tables stay below under "Details". The sheet's history is not imported.

## Team menu (2026-10-21)

Team is a dropdown with three pages: **Directory** (`/team`, tabs Directory · Org chart), **Assignments**
(`/team/assignments`) and **Readiness** (`/team/readiness`). Old `/team?view=assignments|readiness` links
forward to the new pages.

## Clients without catalog data

- Clients home (`/`): the Amazon catalog hero, ASIN status chips, catalog counts and sales sparklines are gone
  until client KPIs are connected. It shows **Client readiness** (agency-wide + per client card) from Asana:
  `/api/readiness/clients` (assignees excluded on the Readiness board are left out, same as the board).
- My Dashboard → My accounts: each card shows the client's readiness (all assignees); "Mine" shows your own tasks.
  Sales only appear when a client has a sales source.
- Client Overview: Marketplace and Country removed.
- Client Settings → **Website & Social** (first sub-tab): website (AAC `BrandURL`) + Instagram, Facebook, TikTok,
  LinkedIn, X, YouTube, Pinterest, saved as keys on the AAC row; handles/domains are normalized to links.

## Hours insights tabs

Overview & velocity (KPIs: total hours, active clients + top client, active members, avg hours/member + run-rate
per active day; weekly hours vs capacity goal = 40 h × people, prorated), Clients (portfolio cards with share,
entries and team assigned; hours vs estimate when not scoped), Team (performance table, person × client,
compliance), Timesheet (searchable entries, latest 2,000). Scope: period, team, person, client, type of work.

## Contract, SOW warnings and design links (client page)

- Client Overview header: Merchant ID removed; a **SOW badge** shows the computed state.
- **Contract & services** section (AAC columns): Tier, Retainer type, SOW, Term, Last day of term, SOW status,
  estimated hours and $/hour, service chips (`Service: X` keys; admins toggle them) and the SOW scope text.
- SOW state comes from "Last Day of Term" (free text parsed by `src/lib/clients/sow.ts`): expired, expiring
  (≤ 30 days, `SOW_WARNING_DAYS`), active, month-to-month, no end date, no scope. When the sheet's "SOW Status"
  contradicts the date (e.g. says Active after the term ended) the page says so.
- Warnings: banner on the client page, badges + "N SOWs expiring / expired" on the clients home, and My Dashboard
  alerts for your clients (expired = critical, expiring = warning).
- **Design files & links**: Figma (internal), Figma (external), Air board, Running agenda, Client dashboard
  (raw keys FigmaInternalURL, FigmaExternalURL, AirBoardURL, RunningAgendaURL, DashboardURL). Power BI links removed.

- Overview: the AAC "Competitors" and "Promotions" sections (MarketFoundry, empty for every 1o8 client) were removed.
  Competitors now show read-only from **Brand Voice** (the single place they're edited), with an "Edit in Brand Voice" link.

## Going online (first QA, 2026-10-22)

- Git repo initialised here (`main`). `.gitignore` also excludes `/.data/` (local Postgres with real data),
  `q.tmp.*` and `docs/master-table.xlsx` (58 MB MarketFoundry Amazon export).
- `vercel.json` crons trimmed to the daily Readiness snapshot (07:00 Chicago), which also syncs Asana. The Vercel
  account is on Hobby, which only allows daily crons; on Pro, add back `/api/cron/asana-tasks-sync` every 15 min
  (MarketFoundry's Amazon/BigQuery/Redshift/reviews crons are in `../mfHub-main/vercel.json` if ever needed).
- `next build` passes (fixed five inherited type errors in scripts/tests that newer TypeScript types flagged).
- The "Local dev login" only exists in development; online sign-in is Google OAuth. Unknown Google accounts
  land as `pending` until an admin approves them.

## Working locally, releasing to production

Online QA: **https://1o8-hub.vercel.app** (Vercel project `1o8-hub`, team 1o8-agency; database on Supabase;
GitHub `alejandrobertoldi/1o8-hub`). Vercel deploys every push to `main` automatically.

Day to day:
1. Build and test everything locally (`npm run db:local` + the 1o8Hub preview on :3108). Commits stay on this
   Mac: **nothing goes online until `git push`.**
2. Local and online data are separate. Local data is for development; the online database is what the team uses.
   Only code and schema (table structure) travel on a release, never local data.

To release ("publish"):
1. Full test run, `npx tsc --noEmit`, and `npx next build` (stop the dev server first; they share `.next`).
2. If the schema changed: `npm run db:push:prod` (additive changes go straight through; if drizzle-kit asks a
   question, stop and review). Run it **before** pushing, so the new code never meets an old database.
   Data seeds that a migration adds (e.g. new rows in a config table) are applied separately and on purpose.
3. `git push` → Vercel builds and publishes in ~3 minutes. Check https://1o8-hub.vercel.app afterwards.
4. New environment variables go into Vercel (Settings → Environment Variables) and need a Redeploy.

Production environment variables live in Vercel; `.env.vercel` (gitignored) is the local copy used to set them.
