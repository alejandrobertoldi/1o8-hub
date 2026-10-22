import { hasSuperPowers, isHubStaff } from "@/lib/roles";
import { addDays } from "./group-tasks";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveTargetUser(viewer: { id: string; role: string | null }, requested: string | null):
  { ok: true; id: string; canPick: boolean } | { ok: false; status: 403 | 404 } {
  if (!isHubStaff(viewer.role)) return { ok: false, status: 403 };
  // Viewing other people's dashboards (and the picker) is Owner / Super Admin only.
  const canPick = hasSuperPowers(viewer.role);
  if (!requested || requested === viewer.id) return { ok: true, id: viewer.id, canPick };
  if (!canPick) return { ok: false, status: 403 };
  // A malformed id would reach Postgres as a failed uuid cast (500); non-admins are refused above first.
  if (!UUID_RE.test(requested)) return { ok: false, status: 404 };
  return { ok: true, id: requested, canPick };
}

/** The browser's local date (team spans PK/ES/US). Only trusted within ±1 day of server UTC. */
export function resolveToday(param: string | null, now: Date = new Date()): string {
  const utc = now.toISOString().slice(0, 10);
  if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return utc;
  const d = new Date(`${param}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== param) return utc;
  return param === utc || param === addDays(utc, 1) || param === addDays(utc, -1) ? param : utc;
}
