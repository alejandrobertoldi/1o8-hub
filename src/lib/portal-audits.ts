/**
 * Static client report HTMLs served in the portal Reports section.
 * Keyed by clientIdCode. The file lives at src/content/portal-audits/<key>.html
 * (NOT in public/ — these contain client financials and must stay behind auth).
 *
 * Shown as a card on /portal/reports (bypasses allowed_sections so prospects
 * with no granted sections can still see their audit) and served by
 * /api/portal/audit. The key set is also the path-traversal allowlist.
 */
export const PORTAL_AUDITS: Record<string, { label: string; description: string }> = {
  GR1_SC_US: {
    label: "Business Model Audit",
    description: "Amazon US business model audit and recommendations.",
  },
};

export function hasPortalAudit(clientIdCode: string): boolean {
  return clientIdCode in PORTAL_AUDITS;
}
