// ═══════════════════════════════════════════════════════════════
// Client onboarding = the client profile is complete.
//
// Every item is read from the profile itself (AAC row, Brand Voice, Brand
// Guidelines, KPI sources, Asana/Drive setup), so the checklist can't drift
// from what's actually filled in. Items depend on the services the client
// pays for ("Service: X" on the AAC row): Klaviyo only matters with Email,
// Meta / Google Ads with Paid Media, and so on.
//
// The few things the hub can't see (we were given access to their Meta
// Business, the welcome email went out) are checked by hand. Any item can be
// marked "N/A" for one client. Both live on the AAC row as
// `Onboarding: <item key>` = "done" | "na".
// ═══════════════════════════════════════════════════════════════

import { clientServices } from "@/lib/clients/sow";
import { parseClientKpis, MAIN_KPIS_FIELD } from "@/lib/clients/kpis";

export const CHECK_FIELD_PREFIX = "Onboarding: ";
export const checkField = (key: string) => `${CHECK_FIELD_PREFIX}${key}`;

/** AAC service names → what they need from the profile. */
const SERVICE_NEEDS = {
  email: ["Email", "Email Marketing", "Email Setup"],
  meta: ["Meta", "Paid Media"],
  googleAds: ["Google", "Paid Media"],
  web: ["Website", "Website Design", "Website Maintenance", "CRO"],
  seo: ["SEO", "Blogs"],
  social: ["Organic Social", "Influencer Marketing"],
} as const;
export type ServiceNeed = keyof typeof SERVICE_NEEDS;

/**
 * Which service-dependent items apply. With no services checked yet we can't
 * tell, so everything applies (nothing is hidden by mistake); the Contract
 * section flags the missing services.
 */
export function serviceNeeds(raw: Record<string, unknown>): Record<ServiceNeed, boolean> & { anyService: boolean } {
  const services = new Set(clientServices(raw));
  const any = services.size > 0;
  const need = (n: ServiceNeed) => !any || SERVICE_NEEDS[n].some((s) => services.has(s));
  return {
    anyService: any,
    email: need("email"),
    meta: need("meta"),
    googleAds: need("googleAds"),
    web: need("web"),
    seo: need("seo"),
    social: need("social"),
  };
}

export type ChecklistInput = {
  clientIdCode: string;
  rawData: Record<string, unknown>;
  clientType: string | null;
  onboardingDate: string | null;
  asanaProjectGid: string | null;
  brandVoice: {
    blogUrl: string;
    valueProp: string;
    tone: string;
    personality: string[];
    audience: { floor: string; middle: string; ceiling: string };
    voiceExamples: { offBrand: string; onBrand: string }[];
    signaturePhrases: string[];
    bannedPhrases: string[];
    competitors: { name: string; url: string }[];
    referencePosts: string[];
    keywords: unknown[];
    productFacts: string;
    internalLinks: unknown[];
  } | null;
  guidelines: { hasLogo: boolean; colors: number; hasTypography: boolean } | null;
  klaviyoConnected: boolean;
  driveFoldersCreated: boolean;
  /** client_onboarding_steps rows marked completed (setup_timeline, send_onboarding_email…). */
  completedSteps: ReadonlySet<string>;
};

export type ItemState = "done" | "missing" | "na";
export type ChecklistItem = {
  key: string;
  label: string;
  /** Where in the profile to fill it (path under /clients/<code>). */
  href: string;
  state: ItemState;
  /** Checked by hand (the hub can't detect it). */
  manual?: boolean;
  /** Why it applies, e.g. "Email" for Klaviyo. */
  service?: string;
};
export type ChecklistSection = { key: string; label: string; items: ChecklistItem[]; done: number; total: number };
export type ClientChecklist = { sections: ChecklistSection[]; done: number; total: number; percentage: number };

const OVERVIEW = "";
const VOICE = "/brand-voice";
const GUIDELINES = "/brand-guidelines";
const SOCIAL = "/web-social";
const ONBOARDING = "/onboarding";

const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== "");

export function buildClientChecklist(input: ChecklistInput): ClientChecklist {
  const raw = input.rawData;
  const s = (k: string) => String(raw[k] ?? "").trim();
  const needs = serviceNeeds(raw);
  const bv = input.brandVoice;
  const gl = input.guidelines;

  type Def = Omit<ChecklistItem, "state"> & { done: boolean; applies?: boolean };
  const sections: { key: string; label: string; defs: Def[] }[] = [
    {
      key: "basics",
      label: "Basics",
      defs: [
        { key: "status", label: "Client status", href: OVERVIEW, done: has(s("ClientStatus")) },
        { key: "client_type", label: "Client type", href: OVERVIEW, done: has(input.clientType) },
        { key: "start_date", label: "Start date", href: OVERVIEW, done: has(input.onboardingDate) },
        { key: "website", label: "Website", href: SOCIAL, done: has(s("BrandURL")) },
      ],
    },
    {
      key: "contract",
      label: "Contract",
      defs: [
        { key: "services", label: "Services checked", href: OVERVIEW, done: needs.anyService },
        { key: "tier", label: "Tier", href: OVERVIEW, done: has(s("Tier")) },
        { key: "retainer", label: "Retainer type", href: OVERVIEW, done: has(s("RetainerType")) },
        { key: "sow", label: "SOW", href: OVERVIEW, done: has(s("SOW")) },
        { key: "term", label: "Term / last day", href: OVERVIEW, done: has(s("Term")) || has(s("Last Day of Term")) },
        { key: "hours", label: "Estimated hours / month", href: OVERVIEW, done: has(s("Estimated Hours TOTAL")) },
      ],
    },
    {
      key: "team",
      label: "Team",
      defs: [
        { key: "team_strategist", label: "Executive Strategist", href: OVERVIEW, done: has(s("ExecutiveStrategist_MF")) },
        { key: "team_am", label: "Account Manager", href: OVERVIEW, done: has(s("AccountManager_MF")) },
        { key: "team_pm", label: "Project Manager", href: OVERVIEW, done: has(s("ProjectManager_MF")) },
        { key: "team_creative", label: "Creative Manager", href: OVERVIEW, done: has(s("DesignManager_MF")) },
        { key: "team_email", label: "Email Manager", href: OVERVIEW, done: has(s("EmailManager_1o8")), applies: needs.email, service: "Email" },
        { key: "team_web", label: "Web Manager", href: OVERVIEW, done: has(s("WebManager_1o8")), applies: needs.web, service: "Website" },
        { key: "team_seo", label: "SEO Manager", href: OVERVIEW, done: has(s("SEOManager_MF")), applies: needs.seo, service: "SEO" },
        { key: "team_paid", label: "Paid Media Manager", href: OVERVIEW, done: has(s("PPCManager_MF")), applies: needs.meta || needs.googleAds, service: "Paid Media" },
        { key: "team_social", label: "Social Media Manager", href: OVERVIEW, done: has(s("SocialMediaManager_108")), applies: needs.social, service: "Organic Social" },
      ],
    },
    {
      key: "contacts",
      label: "Contacts",
      defs: [
        { key: "contact_main", label: "Main client contact", href: OVERVIEW, done: has(s("ClientContactEmail1")) },
        { key: "contact_billing", label: "Billing contact", href: OVERVIEW, done: [1, 2, 3, 4].some((i) => has(s(`Billingemail${i}`))) },
      ],
    },
    {
      key: "brand_voice",
      label: "Brand Voice",
      defs: [
        { key: "bv_value_prop", label: "What the brand does", href: VOICE, done: has(bv?.valueProp) },
        { key: "bv_audience", label: "Audience", href: VOICE, done: !!bv && Object.values(bv.audience ?? {}).some(has) },
        { key: "bv_tone", label: "Tone & personality", href: VOICE, done: has(bv?.tone) || has(bv?.personality) },
        { key: "bv_examples", label: "Off-brand vs. on-brand example", href: VOICE, done: !!bv?.voiceExamples.some((e) => has(e.offBrand) && has(e.onBrand)) },
        { key: "bv_words", label: "Words we use / never use", href: VOICE, done: has(bv?.signaturePhrases) || has(bv?.bannedPhrases) },
        { key: "bv_competitors", label: "Competitors", href: VOICE, done: !!bv?.competitors.some((c) => has(c.name)) },
        { key: "bv_blog", label: "Blog / site URL", href: VOICE, done: has(bv?.blogUrl), applies: needs.seo, service: "SEO" },
        { key: "bv_reference_posts", label: "Reference posts", href: VOICE, done: has(bv?.referencePosts), applies: needs.seo, service: "SEO" },
        { key: "bv_keywords", label: "Pillar keywords", href: VOICE, done: has(bv?.keywords), applies: needs.seo, service: "SEO" },
        { key: "bv_product_facts", label: "Product facts", href: VOICE, done: has(bv?.productFacts), applies: needs.seo, service: "SEO" },
        { key: "bv_internal_links", label: "Internal links", href: VOICE, done: has(bv?.internalLinks), applies: needs.seo, service: "SEO" },
      ],
    },
    {
      key: "brand_guidelines",
      label: "Brand Guidelines",
      defs: [
        { key: "bg_logo", label: "Logo", href: GUIDELINES, done: !!gl?.hasLogo },
        { key: "bg_colors", label: "Brand colors", href: GUIDELINES, done: (gl?.colors ?? 0) > 0 },
        { key: "bg_typography", label: "Typography", href: GUIDELINES, done: !!gl?.hasTypography },
      ],
    },
    {
      key: "web_social",
      label: "Website & Social",
      defs: [
        ...(["Instagram", "Facebook", "TikTok", "LinkedIn", "YouTube", "Pinterest", "XTwitter"] as const).map((k) => ({
          key: `social_${k.toLowerCase()}`,
          label: k === "XTwitter" ? "X (Twitter)" : k,
          href: SOCIAL,
          done: has(s(k)),
          applies: needs.social,
          service: "Organic Social",
        })),
      ],
    },
    {
      key: "kpis",
      label: "KPIs",
      defs: (() => {
        const kpis = parseClientKpis(s(MAIN_KPIS_FIELD) || null);
        return [
          { key: "kpi_defined", label: "Main KPIs chosen", href: OVERVIEW, done: kpis.length > 0 || has(s("Main KPI")) },
          { key: "kpi_targets", label: "A target on every KPI", href: OVERVIEW, done: kpis.length > 0 && kpis.every((k) => has(k.target)) },
        ];
      })(),
    },
    {
      key: "connections",
      label: "Connections",
      defs: [
        { key: "conn_ga4", label: "GA4 property", href: OVERVIEW, done: has(s("GA4Property")) },
        { key: "access_ga4", label: "GA4 access granted to 1o8", href: ONBOARDING, done: false, manual: true },
        { key: "conn_shopify", label: "Shopify store", href: OVERVIEW, done: has(s("ShopifyStore")), applies: needs.web, service: "Website" },
        { key: "access_shopify", label: "Shopify admin access (collaborator)", href: ONBOARDING, done: false, manual: true, applies: needs.web, service: "Website" },
        { key: "conn_klaviyo", label: "Klaviyo key", href: OVERVIEW, done: input.klaviyoConnected, applies: needs.email, service: "Email" },
        { key: "access_klaviyo", label: "Klaviyo user access", href: ONBOARDING, done: false, manual: true, applies: needs.email, service: "Email" },
        { key: "conn_meta", label: "Meta ad account", href: OVERVIEW, done: has(s("MetaAdAccount")), applies: needs.meta, service: "Meta" },
        { key: "access_meta", label: "Meta Business partner access", href: ONBOARDING, done: false, manual: true, applies: needs.meta, service: "Meta" },
        { key: "conn_google_ads", label: "Google Ads customer ID", href: OVERVIEW, done: has(s("GoogleAdsCustomerId")), applies: needs.googleAds, service: "Google" },
        { key: "access_google_ads", label: "Google Ads access (MCC link)", href: ONBOARDING, done: false, manual: true, applies: needs.googleAds, service: "Google" },
      ],
    },
    {
      key: "operations",
      label: "Operations",
      defs: [
        { key: "ops_asana", label: "Asana project", href: ONBOARDING, done: has(input.asanaProjectGid) || input.completedSteps.has("setup_asana") },
        { key: "ops_timeline", label: "Timeline set up", href: ONBOARDING, done: input.completedSteps.has("setup_timeline") },
        { key: "ops_drive", label: "Drive folders", href: ONBOARDING, done: input.driveFoldersCreated || input.completedSteps.has("drive_folders") },
        { key: "ops_welcome_email", label: "Welcome email sent", href: ONBOARDING, done: input.completedSteps.has("send_onboarding_email"), manual: true },
      ],
    },
  ];

  const built: ChecklistSection[] = sections
    .map(({ key, label, defs }) => {
      const items: ChecklistItem[] = defs
        .filter((d) => d.applies !== false)
        .map((d) => {
          const mark = s(checkField(d.key)).toLowerCase();
          const state: ItemState = mark === "na" ? "na" : d.done || (d.manual && mark === "done") ? "done" : "missing";
          return { key: d.key, label: d.label, href: d.href, manual: d.manual, service: d.service, state };
        });
      const counted = items.filter((i) => i.state !== "na");
      return { key, label, items, done: counted.filter((i) => i.state === "done").length, total: counted.length };
    })
    .filter((sec) => sec.items.length > 0);

  const done = built.reduce((a, sec) => a + sec.done, 0);
  const total = built.reduce((a, sec) => a + sec.total, 0);
  return { sections: built, done, total, percentage: total ? Math.round((done / total) * 100) : 0 };
}
