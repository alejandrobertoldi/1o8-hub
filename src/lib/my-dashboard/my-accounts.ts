import { CLIENT_TEAM_ROLES, normName } from "@/lib/sales-summary-header";
import type { MyAccount } from "./types";

export interface AacRoleRow { clientIdCode: string; clientName: string | null; clientLogoUrl: string | null; raw: Record<string, string> }

/** aac.rawData stores team members by NAME (not user id) — match on the normalised name. */
export function accountsForUser(name: string | null, rows: AacRoleRow[]): MyAccount[] {
  const me = name ? normName(name) : "";
  if (!me) return [];
  const out: MyAccount[] = [];
  for (const r of rows) {
    const roles = CLIENT_TEAM_ROLES.filter(([key]) => r.raw[key] && normName(r.raw[key]) === me).map(([, label]) => label);
    if (roles.length) out.push({ clientIdCode: r.clientIdCode, clientName: r.clientName || r.clientIdCode, clientLogoUrl: r.clientLogoUrl, roles });
  }
  return out.sort((a, b) => a.clientIdCode.localeCompare(b.clientIdCode));
}
