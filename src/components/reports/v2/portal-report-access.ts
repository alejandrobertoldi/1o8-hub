import { canAccess } from "@/lib/permissions";

export interface SectionAccess {
  /** May the CURRENT VIEWER open this section's page? Admin preview bypasses,
   *  so an admin can inspect any section of the client they are previewing.
   *  This is the per-page gate. */
  canAccessSection: (sectionId: string) => boolean;
  /** Does the CLIENT hold this grant? Ignores the admin-preview bypass, so the
   *  index card grid can keep rendering ungranted cards at 40% opacity labelled
   *  "Hidden from client" with the eye toggle. */
  clientHasSection: (sectionId: string) => boolean;
}

/** Two deliberately different questions. See SectionAccess above — conflating
 *  them is a regression, not a simplification (spec §9 correction 4).
 *
 *  Section ids arrive bare ("overview", "share-of-voice") and are prefixed here
 *  to match the reports-* ids in permissions.ts CONFIGURABLE_SECTIONS. */
export function makeSectionAccess({
  isAdminPreview,
  isProspect,
  allowedSections,
}: {
  isAdminPreview: boolean;
  isProspect: boolean;
  allowedSections: string[];
}): SectionAccess {
  const clientHasSection = (sectionId: string): boolean =>
    isProspect || canAccess(`reports-${sectionId}`, allowedSections, false);

  return {
    clientHasSection,
    canAccessSection: (sectionId: string): boolean =>
      isAdminPreview || clientHasSection(sectionId),
  };
}
