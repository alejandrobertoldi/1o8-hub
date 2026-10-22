# 1o8 SEO Manager

Amazon Listing Optimization — RUFUS & COSMO AI System

A standalone web application for managing the full 7-phase Amazon SEO workflow:
S1 Intake → S2 Keywords → S3 Reviews → S4 Rufus → S5 COSMO → S6 Compliance → S7 SEO Content

## Quick Start

### 1. Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) account (free tier)
- An [Anthropic](https://console.anthropic.com) API key
- A Google Cloud project with OAuth2 credentials

### 2. Setup

```bash
# Clone the repo
git clone <your-repo-url>
cd 1o8-seo-manager

# Install dependencies
npm install

# Copy env template
cp .env.local.example .env.local
# Edit .env.local with your API keys
```

### 3. Database Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to SQL Editor
3. Paste and run the contents of `supabase-schema.sql`
4. Copy your Supabase URL and keys into `.env.local`

### 4. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable the Google Docs API and Google Drive API
4. Go to Credentials → Create OAuth 2.0 Client ID
5. Add `http://localhost:3000/api/auth/callback/google` as redirect URI
6. Copy Client ID and Secret into `.env.local`

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

## Project Structure

```
app/                    # Next.js App Router pages
├── page.tsx            # Dashboard (project list)
├── projects/
│   ├── new/            # Create new project
│   └── [id]/           # Project workspace
│       ├── intake/     # S1 - Intake & Discovery
│       ├── keywords/   # S2 - Keyword Tiering
│       ├── reviews/    # S3 - Review Analysis
│       ├── rufus/      # S4 - Rufus Intelligence
│       ├── cosmo/      # S5 - COSMO Mapping
│       ├── compliance/ # S6 - Compliance Check
│       ├── seo/        # S7 - Content Generation
│       └── export/     # Export to Google Docs
│
components/             # Reusable React components
lib/
├── types.ts            # TypeScript definitions
├── db.ts               # Supabase client
├── parsers/            # CSV/TSV parsers
│   ├── intake.ts       # INTAKE tab parser
│   ├── cerebro.ts      # Helium 10 Cerebro parser
│   └── reviews.ts      # Amazon review parser
└── prompts/            # Claude API prompt builders
```

## Tech Stack

- **Next.js 14** — React framework
- **Tailwind CSS** — Styling
- **Supabase** — PostgreSQL database + auth
- **Anthropic Claude API** — AI content generation
- **Google APIs** — Docs/Drive export
- **Vercel** — Hosting

## Configuration

The SEO optimization rules come from `AMAZON_SEO_GPT_v5_COMPLETE.md` — the authoritative 4,446-line configuration that governs all character limits, compliance rules, keyword tiers, and content generation standards.
