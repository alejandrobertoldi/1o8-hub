export type HelpCategory = "getting-started" | "processes" | "reference";

export type HelpGuide = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  category: HelpCategory;
  version?: string;
  metaNote?: string;
  videoUrl?: string;
};

export const HELP_CATEGORIES: { id: HelpCategory; label: string }[] = [
  { id: "getting-started", label: "Getting Started" },
  { id: "processes", label: "Processes & SOPs" },
  { id: "reference", label: "Reference" },
];

// 1o8 (2026-11-05): MarketFoundry's Amazon SOPs (A+, Brand Story, listing images,
// SEO Manager, monthly Amazon report, the old onboarding and hours guides) are
// archived in _archive/marketfoundry-amazon/help/.
export const HELP_GUIDES: HelpGuide[] = [
  {
    slug: "log-hours-process",
    title: "Logging Your Hours",
    subtitle: "1o8 — Internal Reference",
    description:
      "How to log time on My timesheet against a client and an Asana task, use the timer, fix entries, and log PTO and holidays.",
    category: "processes",
    version: "v2.0 · November 2026",
    metaNote: "8 h / workday · quarter-hour steps",
  },
  {
    slug: "onboarding-process",
    title: "Client Onboarding Process",
    subtitle: "1o8 — Internal Reference",
    description:
      "Onboarding = a complete client profile: the checklist by section (driven by the client's services), Fill / N/A, and the five setup steps.",
    category: "processes",
    version: "v2.0 · November 2026",
    metaNote: "10 sections · by service · 5 setup steps",
  },
  {
    slug: "client-data-process",
    title: "Connecting Client Data",
    subtitle: "1o8 — Internal Reference",
    description:
      "How to connect GA4, Meta Ads, Google Ads, Klaviyo and Shopify so a client's Main KPIs and reports fill in, and how to check the daily sync.",
    category: "processes",
    version: "v1.0 · November 2026",
    metaNote: "5 sources · daily sync · read-only",
  },
];

/**
 * App-navigation mirror for the Help index. Each section maps to a hub top-nav
 * dropdown (source of truth: src/components/layout/top-nav.tsx). Items with a
 * `slug` have a published SOP and link to /help/{slug}; the rest link to the
 * live app route so users can explore the same tree they navigate in the app.
 */
export type HelpTreeNode = { label: string; href: string; slug?: string };
export type HelpTreeSection = {
  id: string;
  label: string;
  icon: string;
  items: HelpTreeNode[];
};

export const HELP_TREE: HelpTreeSection[] = [
  {
    id: "hours",
    label: "Hours",
    icon: "HR",
    items: [
      { label: "My timesheet", href: "/hours", slug: "log-hours-process" },
      { label: "Hours analytics", href: "/hours/analytics" },
      { label: "Time off requests", href: "/calendar/requests" },
      { label: "Team time off", href: "/calendar/team" },
    ],
  },
  {
    id: "clients",
    label: "Clients",
    icon: "CL",
    items: [
      { label: "Client Onboarding", href: "/onboarding", slug: "onboarding-process" },
      { label: "Client Summary", href: "/clients" },
      { label: "Brand Guidelines", href: "/clients/brand-guidelines" },
      { label: "Client Reports", href: "/reports", slug: "client-data-process" },
      { label: "Case Studies", href: "/case-studies" },
      { label: "Client Portal", href: "/portal" },
    ],
  },
  {
    id: "team",
    label: "Team",
    icon: "TM",
    items: [
      { label: "Directory", href: "/team" },
      { label: "Assignments", href: "/team/assignments" },
      { label: "Readiness", href: "/team/readiness" },
    ],
  },
  {
    id: "departments",
    label: "Departments",
    icon: "DP",
    items: [
      { label: "Email · Send dates", href: "/email/send-dates" },
      { label: "Paid Media · Campaign calendar", href: "/paid-media/campaigns" },
      { label: "Web · Launch calendar", href: "/web/launches" },
      { label: "SEO · Blog Writer", href: "/seo/blog-writer" },
      { label: "New Business", href: "/new-business" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: "AD",
    items: [
      { label: "Sync & Export", href: "/publish" },
      { label: "Users", href: "/admin/users" },
      { label: "Shared Logins", href: "/admin/logins" },
      { label: "System Health", href: "/admin/system-health" },
      { label: "Configuration", href: "/admin/config" },
      { label: "Support", href: "/admin/support" },
    ],
  },
];

export function getGuide(slug: string): HelpGuide | undefined {
  return HELP_GUIDES.find((g) => g.slug === slug);
}

export function guidesByCategory(): Record<HelpCategory, HelpGuide[]> {
  const out: Record<HelpCategory, HelpGuide[]> = {
    "getting-started": [],
    processes: [],
    reference: [],
  };
  for (const g of HELP_GUIDES) out[g.category].push(g);
  return out;
}
