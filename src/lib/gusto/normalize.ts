/**
 * Gusto payloads → the hub's shapes. Pure and deliberately tolerant: Gusto's
 * time off API has changed shape across versions (a `days` map of date →
 * hours in v1, start/end dates and nested policies later), and the hub hasn't
 * been connected to a live account yet, so each reader accepts the variants.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

export type GustoEmployee = { uuid: string; name: string; emails: string[] };

export function normalizeEmployee(raw: unknown): GustoEmployee | null {
  const e = obj(raw);
  const uuid = str(e.uuid) ?? str(e.id);
  if (!uuid) return null;
  const emails = [e.work_email, e.email, e.personal_email].map(str).filter((x): x is string => !!x).map((x) => x.toLowerCase());
  const name = [str(e.first_name), str(e.last_name)].filter(Boolean).join(" ") || str(e.full_name) || uuid;
  return { uuid, name, emails: [...new Set(emails)] };
}

export type GustoTimeOffStatus = "pending" | "approved" | "denied" | "cancelled";

export function normalizeStatus(v: unknown): GustoTimeOffStatus | null {
  const s = (str(v) ?? "").toLowerCase();
  if (s === "approved") return "approved";
  if (s === "pending" || s === "requested" || s === "submitted") return "pending";
  if (s === "denied" || s === "declined" || s === "rejected") return "denied";
  if (s === "cancelled" || s === "canceled" || s === "deleted" || s === "withdrawn") return "cancelled";
  return null;
}

export type GustoTimeOff = {
  externalId: string;
  employeeUuid: string;
  status: GustoTimeOffStatus;
  kind: string | null;
  startDate: string;
  endDate: string;
  /** Dates with hours booked, when Gusto gives a per-day breakdown. */
  days: string[] | null;
  hours: number | null;
  note: string | null;
};

/** Per-day hours from `days` as a map ({"2026-11-03": "8.0"}) or a list ([{date, hours}]). */
function dayHours(v: unknown): { date: string; hours: number }[] {
  if (Array.isArray(v)) {
    return v
      .map((d) => obj(d))
      .map((d) => ({ date: str(d.date) ?? "", hours: num(d.hours) ?? num(d.amount) ?? 0 }))
      .filter((d) => isDate(d.date));
  }
  return Object.entries(obj(v))
    .filter(([date]) => isDate(date))
    .map(([date, hours]) => ({ date: date.slice(0, 10), hours: num(hours) ?? 0 }));
}

export function normalizeTimeOff(raw: unknown): GustoTimeOff | null {
  const r = obj(raw);
  const externalId = str(r.uuid) ?? str(r.id);
  const employeeUuid = str(r.employee_uuid) ?? str(obj(r.employee).uuid) ?? str(r.employee_id);
  const status = normalizeStatus(r.status);
  if (!externalId || !employeeUuid || !status) return null;

  const perDay = dayHours(r.days).sort((a, b) => a.date.localeCompare(b.date));
  const booked = perDay.filter((d) => d.hours > 0);
  const startDate = (isDate(r.start_date) ? r.start_date.slice(0, 10) : null) ?? perDay[0]?.date ?? null;
  const endDate = (isDate(r.end_date) ? r.end_date.slice(0, 10) : null) ?? perDay.at(-1)?.date ?? startDate;
  if (!startDate || !endDate) return null;

  const policy = obj(r.time_off_policy);
  const kind = (str(r.policy_type) ?? str(policy.policy_type) ?? str(r.request_type) ?? str(r.time_off_type))?.toLowerCase() ?? null;
  const hours = perDay.length ? booked.reduce((s, d) => s + d.hours, 0) : num(r.hours) ?? num(r.amount);
  return {
    externalId,
    employeeUuid,
    status,
    kind,
    startDate,
    endDate: endDate < startDate ? startDate : endDate,
    days: perDay.length ? booked.map((d) => d.date) : null,
    hours,
    note: str(r.employee_note) ?? str(r.notes) ?? str(r.note),
  };
}

export type GustoBalance = { employeeUuid: string; policyName: string; policyType: string | null; hours: number | null };

/** Balances as a flat list ({employee_uuid, policy_name, balance}) or grouped per employee. */
export function normalizeBalances(raw: unknown): GustoBalance[] {
  const list = Array.isArray(raw) ? raw : (obj(raw).time_off_balances as unknown[]) ?? [];
  const out: GustoBalance[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    const b = obj(item);
    const nested = (b.time_off_balances ?? b.balances ?? b.policies) as unknown;
    const employeeUuid = str(b.employee_uuid) ?? str(obj(b.employee).uuid);
    if (Array.isArray(nested)) {
      for (const n of nested) {
        const one = normalizeBalance({ employee_uuid: employeeUuid, ...obj(n) });
        if (one) out.push(one);
      }
      continue;
    }
    const one = normalizeBalance(b);
    if (one) out.push(one);
  }
  return out;
}

function normalizeBalance(raw: Json): GustoBalance | null {
  const policy = obj(raw.time_off_policy);
  const employeeUuid = str(raw.employee_uuid) ?? str(obj(raw.employee).uuid);
  const policyType = (str(raw.policy_type) ?? str(policy.policy_type))?.toLowerCase() ?? null;
  const policyName = str(raw.policy_name) ?? str(raw.name) ?? str(policy.name) ?? policyType;
  if (!employeeUuid || !policyName) return null;
  return {
    employeeUuid,
    policyName,
    policyType,
    hours: num(raw.balance) ?? num(raw.balance_hours) ?? num(raw.available_hours) ?? num(raw.hours),
  };
}
