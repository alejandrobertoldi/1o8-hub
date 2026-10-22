// ═══════════════════════════════════════════════════════════════
// Client Drive folder routing — single source of truth for which
// parent folder a client's root folder lives in, based on status.
// Used by BOTH folder creation (onboarding step) and folder movement
// (status-change handlers) so the two can never disagree.
// ═══════════════════════════════════════════════════════════════

/** Prospect clients: the folder tree is created here while status is "Prospect". */
export const PROSPECT_CLIENTS_FOLDER_ID = "1e-DTv3VlgOvT8WA9rGoP_WV0ZtTzvkT7";

/** Inactive / archive clients: the folder moves here while status is "Inactive". */
export const INACTIVE_CLIENTS_FOLDER_ID = "1NTvrc3buwtsL2_E9ACkX4dFY-0o1SelT";

/**
 * Resolve the Drive parent folder a client's ROOT folder should live in.
 *
 * - "Prospect" → Prospect folder
 * - "Inactive" → Inactive folder
 * - "Active" and any other / blank / null value → shared-drive root
 *
 * Comparison is case-sensitive, matching the exact status strings used in
 * the app ("Prospect", "Active", "Inactive").
 *
 * @param status            The client's status (aac.client_status).
 * @param sharedDriveRootId The shared-drive root folder ID (GOOGLE_SHARED_DRIVE_ID).
 */
export function resolveClientFolderParent(
  status: string | null | undefined,
  sharedDriveRootId: string
): string {
  switch (status) {
    case "Prospect":
      return PROSPECT_CLIENTS_FOLDER_ID;
    case "Inactive":
      return INACTIVE_CLIENTS_FOLDER_ID;
    default:
      return sharedDriveRootId;
  }
}
