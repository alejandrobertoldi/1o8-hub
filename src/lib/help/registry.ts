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

export const HELP_GUIDES: HelpGuide[] = [
  {
    slug: "aplus-content-process",
    title: "A+ Content Process",
    subtitle: "1o8 — Internal Reference",
    description:
      "Create ASIN, Variation, and Group A+ sets, filter group members by theme attributes, and manage modules, versions, alt text, and Drive folders.",
    category: "processes",
    version: "v1.1 · September 2026",
    metaNote: "3 scopes · 5/7 modules · versioned",
  },
  {
    slug: "seo-helium10-process",
    title: "SEO Manager: Complete Process",
    subtitle: "1o8 — Internal Reference",
    description: "The full S0–S8 workflow on one page: setup, Cerebro keyword and review CSVs, Alexa for Shopping, COSMO, one-set bullets, keyword tables, team and client review, and push to products.",
    category: "processes",
    version: "v2.0 · October 2026",
    metaNote: "S0–S8 · research → review → push",
  },
  {
    slug: "log-hours-process",
    title: "Logging Your Hours",
    subtitle: "1o8 — Internal Reference",
    description:
      "How to record time against a client in the MF Hub, fix overlapping entries, and download a spreadsheet of your hours.",
    category: "processes",
    version: "v1.1 · September 2026",
    metaNote: "7 fields · download report",
  },
  {
    slug: "onboarding-process",
    title: "Client Onboarding Process",
    subtitle: "1o8 — Internal Reference",
    description:
      "End-to-end client onboarding: 11 steps from client creation to FeedbackWhiz, plus status-change Drive consequences.",
    category: "processes",
    version: "v1.0 · June 2026",
    metaNote: "11 steps · 29 sub-tasks",
  },
  {
    slug: "design-upload-process",
    title: "Design Image Upload Process",
    subtitle: "1o8 — Internal Reference",
    description:
      "How design images are uploaded, versioned, and moved through the 6-status review workflow in Listing Images.",
    category: "processes",
    version: "v1.0 · June 2026",
    metaNote: "9 slots · 6 statuses · versioned",
  },
  {
    slug: "monthly-report-process",
    title: "Monthly Report Process",
    subtitle: "1o8 — Internal Reference",
    description:
      "How last month's Amazon report is generated, reviewed (PM → AM → CEO), annotated with client notes, and emailed to the client.",
    category: "processes",
    version: "v1.3 · September 2026",
    metaNote: "PM → AM → CEO · own-client approvals · auto-send",
  },
  {
    slug: "brand-story-process",
    title: "Brand Story Process",
    subtitle: "1o8 — Internal Reference",
    description:
      "How a client's Amazon Brand Story is built, versioned, and moved through the status workflow in Design → Brand Story, including AI alt text.",
    category: "processes",
    version: "v1.1 · September 2026",
    metaNote: "19 modules · 4 types · versioned",
    videoUrl:
      "https://drive.google.com/file/d/1NEF_VRaY2_1aYRYLfuCP3BFTHxAIJpB8/view?usp=drive_link",
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
      { label: "Log hours", href: "/hours-log", slug: "log-hours-process" },
      { label: "Admin hours", href: "/hours-admin" },
      { label: "Hour categories", href: "/admin/hour-categories" },
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
      { label: "Client Timelines", href: "/timeline" },
      { label: "Client Reports", href: "/reports" },
      { label: "Monthly Report", href: "/reports/monthly", slug: "monthly-report-process" },
      { label: "Client Portal", href: "/portal" },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    icon: "CA",
    items: [
      { label: "Products", href: "/products" },
      { label: "Variations", href: "/variations" },
      { label: "Variety Packs", href: "/variety-packs" },
      { label: "Amazon Sync", href: "/amazon-sync" },
      { label: "Attributes", href: "/admin/attributes" },
      { label: "AttributesMaster Table", href: "/attributesMaster" },
      { label: "Attribute Audit", href: "/attribute-audit" },
    ],
  },
  {
    id: "design",
    label: "Design",
    icon: "DS",
    items: [
      { label: "Overview", href: "/design" },
      { label: "Brand Story", href: "/design/brand-story", slug: "brand-story-process" },
      { label: "A+ Content", href: "/design/aplus2", slug: "aplus-content-process" },
      { label: "Listing Images", href: "/design/listing-images", slug: "design-upload-process" },
      { label: "Storefront", href: "/design/storefront" },
    ],
  },
  {
    id: "ppc",
    label: "PPC",
    icon: "PP",
    items: [
      { label: "PPC Performance", href: "/ppc" },
      { label: "Holiday Deals", href: "/holiday-deals" },
      { label: "Sales Monitor", href: "/sales-monitor" },
      { label: "Sales Summary", href: "/sales-summary" },
      { label: "Forecast Tool", href: "/sales-summary/forecast-tool" },
      { label: "Inventory Forecast", href: "/inventory" },
      { label: "Sales Forecast", href: "/sales-summary/forecast" },
    ],
  },
  {
    id: "seo",
    label: "SEO",
    icon: "SE",
    items: [
      { label: "SEO Dashboard", href: "/seo" },
      { label: "SEO Manager", href: "/help/seo-helium10-process", slug: "seo-helium10-process" },
      { label: "Guidelines", href: "/guidelines" },
      { label: "SEO Config", href: "/seo/config" },
    ],
  },
  {
    id: "finances",
    label: "Finances",
    icon: "FI",
    items: [
      { label: "Finance Reports", href: "/finances" },
      { label: "Rev Calculator", href: "/tools/rev-calculator" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: "AD",
    items: [
      { label: "Activity", href: "/activity" },
      { label: "Import", href: "/import" },
      { label: "Sync & Export", href: "/publish" },
      { label: "Users", href: "/admin/users" },
      { label: "SP-API Credentials", href: "/admin/sp-api" },
      { label: "Shared Logins", href: "/admin/logins" },
      { label: "Observability", href: "/admin/observability" },
      { label: "Event Logs", href: "/admin/logs" },
      { label: "Support", href: "/admin/support" },
      { label: "App Repo", href: "/admin/repo" },
      { label: "AI Config", href: "/admin/ai" },
      { label: "Asana Config", href: "/admin/asana" },
      { label: "Drive Folder Tree", href: "/admin/drive-folder-config" },
      { label: "Data Sync", href: "/admin/sync" },
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
