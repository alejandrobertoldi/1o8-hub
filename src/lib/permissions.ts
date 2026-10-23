/* eslint-disable react-doctor/js-set-map-lookups */
/**
 * Hierarchical permission resolution for department-based access control.
 *
 * Supports both flat ("seo") and dot-notation ("design.aplus") grants.
 * A department-level grant (e.g., "design") automatically includes all
 * subsections (e.g., "design.aplus", "design.files").
 */

/** All departments and their subsections */
export const DEPARTMENTS = {
  seo: {
    label: "SEO",
    subsections: {
      seo: { label: "SEO Manager" },
    },
  },
  design: {
    label: "Design",
    subsections: {
      brandstory: { label: "Brand Story" },
      aplus: { label: "A+ Content" },
      aplus2: { label: "A+ Content (v2)" },
      "listing-images": { label: "Listing Images" },
      storefront: { label: "Storefront" },
      files: { label: "Files" },
    },
  },
  timeline: {
    label: "Timeline",
    subsections: {
      timeline: { label: "Project Timeline" },
    },
  },
  ppc: {
    label: "PPC",
    subsections: {
      sales: { label: "Sales Summary" },
    },
  },
  catalog: {
    label: "Catalog",
    subsections: {
      products: { label: "Product Catalog" },
      sync: { label: "Amazon Sync" },
      attributes: { label: "Attributes" },
      reviews: { label: "Reviews" },
    },
  },
  finances: {
    label: "Finances",
    subsections: {
      "finance-reports": { label: "Finance Reports" },
    },
  },
  clients: {
    label: "Clients",
    subsections: {
      clients: { label: "Client Summary" },
      reports: { label: "Reports" },
      portal: { label: "Client Portal" },
    },
  },
} as const;

export type DepartmentId = keyof typeof DEPARTMENTS;

/**
 * Check if a user can access a section.
 *
 * Resolution rules:
 * 1. Admin bypasses all checks
 * 2. Exact match (flat ID or department ID) → allow
 * 3. Dot-notation ("design.aplus") → matches dot form OR flat subsection ID
 *
 * Subsection visibility is NOT inherited from department grants. Each
 * checkbox in the admin UI maps 1:1 to allowedSections membership, so an
 * admin who unchecks "Brand Story" reliably hides it for that user even
 * if the "Design" department checkbox is still on.
 *
 * Migration note: existing dept-only grants are expanded to include all
 * subsection IDs explicitly (see scripts/migrations/.../portal-sections-explicit.sql)
 * so removing the implicit cascade does not silently revoke access.
 */
export function canAccess(
  section: string,
  allowedSections: string[],
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;

  // Direct match (flat ID or department ID)
  if (allowedSections.includes(section)) return true;

  // Dot-notation request (e.g., "design.aplus") accepts either the dot form
  // or its flat subsection ID, but does NOT cascade from the department.
  if (section.includes(".")) {
    const parts = section.split(".");
    const sub = parts[parts.length - 1];
    if (allowedSections.includes(sub)) return true;
    return false;
  }

  // Also honor "design.aplus" style grants for flat "aplus" lookups
  for (const [deptId, dept] of Object.entries(DEPARTMENTS)) {
    if (section in dept.subsections) {
      if (allowedSections.includes(`${deptId}.${section}`)) return true;
    }
  }

  return false;
}

/** All configurable section IDs for user admin page (departments + subsections) */
export const CONFIGURABLE_SECTIONS = [
  // Standalone
  { id: "calendar", label: "Calendar", type: "standalone" as const, dept: null },
  { id: "team", label: "Team", type: "standalone" as const, dept: null },
  // Clients
  { id: "clients", label: "Clients", type: "department" as const, dept: null },
  { id: "reports", label: "Reports", type: "subsection" as const, dept: "clients" as DepartmentId },
  // Catalog
  { id: "catalog", label: "Catalog", type: "department" as const, dept: null },
  { id: "products", label: "Products", type: "subsection" as const, dept: "catalog" as DepartmentId },
  { id: "sync", label: "Amazon Sync", type: "subsection" as const, dept: "catalog" as DepartmentId },
  { id: "reviews", label: "Reviews", type: "subsection" as const, dept: "catalog" as DepartmentId },
  // Timeline
  { id: "timeline", label: "Timeline", type: "department" as const, dept: null },
  // Design
  { id: "design", label: "Design", type: "department" as const, dept: null },
  { id: "brandstory", label: "Brand Story", type: "subsection" as const, dept: "design" as DepartmentId },
  { id: "aplus", label: "A+ Content", type: "subsection" as const, dept: "design" as DepartmentId },
  { id: "aplus2", label: "A+ Content (v2)", type: "subsection" as const, dept: "design" as DepartmentId },
  { id: "listing-images", label: "Listing Images", type: "subsection" as const, dept: "design" as DepartmentId },
  { id: "storefront", label: "Storefront", type: "subsection" as const, dept: "design" as DepartmentId },
  { id: "files", label: "Files", type: "subsection" as const, dept: "design" as DepartmentId },
  // PPC
  { id: "ppc", label: "PPC", type: "department" as const, dept: null },
  { id: "sales", label: "Sales", type: "subsection" as const, dept: "ppc" as DepartmentId },
  { id: "sales-overview", label: "Sales Summary", type: "subsection" as const, dept: "ppc" as DepartmentId },
  { id: "sales-inventory", label: "Sales · Inventory", type: "subsection" as const, dept: "ppc" as DepartmentId },
  { id: "sales-forecast", label: "Sales · Forecast", type: "subsection" as const, dept: "ppc" as DepartmentId },
  { id: "sales-monitor", label: "Sales Monitor", type: "subsection" as const, dept: "ppc" as DepartmentId },
  // Portal dashboard widgets (standalone, not tied to a card route)
  { id: "portal-activity", label: "Recent Activity", type: "department" as const, dept: null },
  // Reports sub-cards (top-level "reports" already declared under Clients)
  { id: "reports-overview", label: "Reports · Overview", type: "subsection" as const, dept: "clients" as DepartmentId },
  { id: "reports-period-comparative", label: "Reports · Period Comparative", type: "subsection" as const, dept: "clients" as DepartmentId },
  { id: "reports-inventory", label: "Reports · Inventory", type: "subsection" as const, dept: "clients" as DepartmentId },
  { id: "reports-order-geography", label: "Reports · Order Geography", type: "subsection" as const, dept: "clients" as DepartmentId },
  { id: "reports-share-of-voice", label: "Reports · Share of Voice", type: "subsection" as const, dept: "clients" as DepartmentId },
  { id: "reports-subscribe-save", label: "Reports · Subscribe & Save", type: "subsection" as const, dept: "clients" as DepartmentId },
  { id: "reports-advertising-audit", label: "Reports · Advertising Audit", type: "subsection" as const, dept: "clients" as DepartmentId },
  // SEO
  { id: "seo", label: "SEO", type: "department" as const, dept: null },
  // Finances
  { id: "finances", label: "Finances", type: "department" as const, dept: null },
  // Admin subsections
  { id: "activity", label: "Activity", type: "admin" as const, dept: null },
  { id: "import", label: "Import", type: "admin" as const, dept: null },
  { id: "publish", label: "Sync & Export", type: "admin" as const, dept: null },
  { id: "export", label: "Export", type: "admin" as const, dept: null },
];

/**
 * The sections 1o8 actually uses (2026-10-23), shown as columns in Admin → Users.
 * The rest of CONFIGURABLE_SECTIONS are MarketFoundry's Amazon modules (catalog,
 * A+ content, PPC, sales…) and stay defined for the client portal, just hidden.
 * Finances is hidden for now too.
 */
export const HUB_SECTION_IDS = ["calendar", "team", "clients", "timeline", "seo", "activity"] as const;
export const HUB_CONFIGURABLE_SECTIONS = CONFIGURABLE_SECTIONS.filter((s) =>
  (HUB_SECTION_IDS as readonly string[]).includes(s.id),
);

/** Design Hub cards/nav children. Granting the parent `design` department
 * without these leaves `/portal/design` empty for client-role users
 * (`canAccess` does not cascade department → subsection).
 */
export const DESIGN_PORTAL_SUBSECTIONS = [
  "brandstory",
  "aplus",
  "aplus2",
  "listing-images",
  "storefront",
  "files",
] as const;

/**
 * When the dashboard eye-toggle flips a parent department, also grant/revoke
 * these children so the landing page is not an empty shell. Subsection eye
 * toggles (sales-overview, brandstory, …) still send a single id.
 */
export const PORTAL_PARENT_TOGGLE_CHILDREN: Record<string, readonly string[]> = {
  design: DESIGN_PORTAL_SUBSECTIONS,
};

/** Ids written for a `{ sectionId, enabled }` portal-section delta. */
export function portalSectionDeltaIds(sectionId: string): string[] {
  const extra = PORTAL_PARENT_TOGGLE_CHILDREN[sectionId];
  return extra ? [sectionId, ...extra] : [sectionId];
}

/** Default portal sections assigned to new client users during onboarding.
 *
 * Includes both the parent department IDs (used to show top-level nav items)
 * and the subsection IDs (used to show individual cards/links). Admins can
 * uncheck any of these to hide that specific section for a user.
 */
export const DEFAULT_CLIENT_SECTIONS = [
  // Standalone / dept-level
  "timeline",
  "sales",
  "products",
  "reviews",
  "seo",
  "design",
  "reports",
  "finances",
  // Design subsections (so /portal/design landing renders cards)
  ...DESIGN_PORTAL_SUBSECTIONS,
  // Finance subsections
  "finance-reports",
  // Sales subsections (so /portal/sales landing renders cards)
  "sales-overview",
  "sales-inventory",
  "sales-forecast",
  "sales-monitor",
  // Reports subsections (so /portal/reports landing renders cards)
  "reports-overview",
  "reports-period-comparative",
  "reports-inventory",
  "reports-order-geography",
  "reports-share-of-voice",
  "reports-subscribe-save",
  "reports-advertising-audit",
  // Portal dashboard widgets
  "portal-activity",
];

/** All valid section IDs accepted by the API */
export const VALID_SECTION_IDS: string[] = [
  ...CONFIGURABLE_SECTIONS.map((s) => s.id),
  ...Object.values(DEPARTMENTS).flatMap((dept) => Object.keys(dept.subsections)),
].filter((id, i, arr) => arr.indexOf(id) === i);

/** Cross-department connections (subsections that span departments) */
export const CROSS_DEPARTMENT_LINKS: Record<string, { dept: DepartmentId; label: string }[]> = {
  aplus: [
    { dept: "catalog", label: "Catalog" },
  ],
  aplus2: [
    { dept: "catalog", label: "Catalog" },
  ],
  sales: [
    { dept: "catalog", label: "Catalog" },
  ],
  reports: [
    { dept: "finances", label: "Finances" },
  ],
};
