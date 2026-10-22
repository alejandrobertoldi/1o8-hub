import { db } from "@/lib/db";
import { aac, users } from "@/lib/db/schema";
import { ilike } from "drizzle-orm";
import { recipientsForClient } from "./recipients";

export type MonthlyListClient = {
  /** Cache/generate key: Intentwise account id when present, else AAC code. */
  code: string;
  name: string;
  /** Null when the AAC row has no IntentwiseID — listed, but generate is a no-op. */
  accountId: string | null;
  /** AAC client_id_code — stable persist key for stored reports. */
  clientIdCode: string;
  projectManager: string | null;
  accountManager: string | null;
  /** AAC ClientContactEmail1–5 plus portal client/prospect users. */
  recipients?: string[];
};

export type ResolvedMonthlyClient = {
  name: string;
  accountId: string;
  clientIdCode: string;
  projectManager: string | null;
  accountManager: string | null;
};

type AacRow = {
  clientIdCode: string;
  clientName: string | null;
  rawData: unknown;
};

function asRawRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

export function intentwiseIdFromRaw(raw: unknown): string | null {
  const obj = asRawRecord(raw);
  const id = (
    obj.IntentwiseID ??
    obj["Intentwise ID"] ??
    obj.intentwiseID ??
    ""
  );
  const trimmed = String(id).trim();
  return trimmed || null;
}

/** AAC Account Manager (1o8), shown on the report cover. */
export function accountManagerFromRaw(raw: unknown): string | null {
  const obj = asRawRecord(raw);
  const name = obj.AccountManager_MF ?? obj["Account Manager"] ?? "";
  const trimmed = String(name).trim();
  return trimmed || null;
}

/** AAC Project Manager (1o8) — first reviewer on the monthly report. */
export function projectManagerFromRaw(raw: unknown): string | null {
  const obj = asRawRecord(raw);
  const name = obj.ProjectManager_MF ?? obj["Project Manager"] ?? "";
  const trimmed = String(name).trim();
  return trimmed || null;
}

export function monthlyClientsFromAacRows(rows: AacRow[]): MonthlyListClient[] {
  return rows
    .map((r) => {
      const accountId = intentwiseIdFromRaw(r.rawData);
      return {
        code: accountId || r.clientIdCode,
        name: r.clientName ?? r.clientIdCode,
        accountId,
        clientIdCode: r.clientIdCode,
        projectManager: projectManagerFromRaw(r.rawData),
        accountManager: accountManagerFromRaw(r.rawData),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function matchMonthlyClient(
  rows: AacRow[],
  code: string,
): { status: "ok"; client: ResolvedMonthlyClient } | { status: "not_found" } | { status: "no_intentwise"; name: string } {
  const row = rows.find(
    (r) => r.clientIdCode === code || intentwiseIdFromRaw(r.rawData) === code,
  );
  if (!row) return { status: "not_found" };
  const accountId = intentwiseIdFromRaw(row.rawData);
  const name = row.clientName ?? row.clientIdCode;
  if (!accountId) return { status: "no_intentwise", name };
  return {
    status: "ok",
    client: {
      name,
      accountId,
      clientIdCode: row.clientIdCode,
      projectManager: projectManagerFromRaw(row.rawData),
      accountManager: accountManagerFromRaw(row.rawData),
    },
  };
}

async function loadActiveAac(): Promise<AacRow[]> {
  return db
    .select({
      clientIdCode: aac.clientIdCode,
      clientName: aac.clientName,
      rawData: aac.rawData,
    })
    .from(aac)
    .where(ilike(aac.clientStatus, "active"));
}

export async function listActiveMonthlyClients(): Promise<MonthlyListClient[]> {
  const rows = await loadActiveAac();
  const clients = monthlyClientsFromAacRows(rows);
  const people = await db
    .select({
      email: users.email,
      role: users.role,
      clientIdCode: users.clientIdCode,
    })
    .from(users);
  const mapped = people.map((p) => ({
    email: p.email,
    role: String(p.role),
    clientIdCode: p.clientIdCode,
  }));
  const rawByCode = new Map(rows.map((r) => [r.clientIdCode, r.rawData]));
  return clients.map((c) => ({
    ...c,
    recipients: recipientsForClient(rawByCode.get(c.clientIdCode), mapped, c.clientIdCode),
  }));
}

export async function resolveMonthlyClient(
  code: string,
): Promise<
  | { status: "ok"; client: ResolvedMonthlyClient }
  | { status: "not_found" }
  | { status: "no_intentwise"; name: string }
> {
  return matchMonthlyClient(await loadActiveAac(), code);
}
