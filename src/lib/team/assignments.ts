import { db } from "@/lib/db";
import { aac, users } from "@/lib/db/schema";
import { TEAM_ROLES } from "@/lib/constants";

export type AssignmentRole = { key: string; label: string };
export type AssignmentAccount = { clientIdCode: string; clientName: string; roles: Record<string, string> };
export type Assignments = {
  roles: AssignmentRole[];
  accounts: AssignmentAccount[];
  /** normalised name → user id, so a name can link to the person's card */
  people: Record<string, { id: string; name: string }>;
};

export const normName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * The "By Team Member" sheet view, live: every ACTIVE account in the AAC table
 * with the person in each of the nine 1o8 account-team roles (TEAM_ROLES).
 */
export async function listAssignments(): Promise<Assignments> {
  const [clients, people] = await Promise.all([
    db.select({ code: aac.clientIdCode, name: aac.clientName, status: aac.clientStatus, raw: aac.rawData }).from(aac),
    db.select({ id: users.id, name: users.name, status: users.employmentStatus }).from(users),
  ]);
  const accounts = clients
    .filter((c) => (c.status ?? "").toLowerCase() === "active")
    .map((c) => {
      const raw = (c.raw ?? {}) as Record<string, string>;
      const roles: Record<string, string> = {};
      for (const key of Object.keys(TEAM_ROLES)) {
        const person = String(raw[key] ?? "").trim();
        if (person) roles[key] = person;
      }
      return { clientIdCode: c.code, clientName: c.name ?? c.code, roles };
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
  return {
    roles: Object.entries(TEAM_ROLES).map(([key, label]) => ({ key, label })),
    accounts,
    people: Object.fromEntries(
      people.filter((p) => p.name && p.status === "active").map((p) => [normName(p.name!), { id: p.id, name: p.name! }]),
    ),
  };
}
