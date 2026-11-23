import { isHubStaff } from "@/lib/roles";

/** Hub staff read reports; anyone but viewers generates and edits them (approval steps come in phase 3). */
export const canReadReports = (role: string | null | undefined) => isHubStaff(role);
export const canEditReports = (role: string | null | undefined) => isHubStaff(role) && role !== "viewer";
