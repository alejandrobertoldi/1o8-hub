import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { aac, teamDirectoryProfiles, userDepartmentLeads, users } from "@/lib/db/schema";
import { TEAM_ROLES } from "@/lib/constants";
import { TEAM_DEPARTMENTS, displayJobTitles } from "./departments";
import { WEEKDAYS } from "./directory-sheet";

export type DirectoryAccount = { clientIdCode: string; clientName: string; roles: string[] };

export type DirectoryPerson = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  phone: string | null;
  jobTitles: string[];
  departments: string[];
  leadsDepartments: string[];
  company: string | null;
  expertise: string | null;
  employmentType: string | null;
  location: string | null;
  timeZone: string | null;
  workDays: string[];
  workStartLocal: string | null;
  workEndLocal: string | null;
  workStartChicago: string | null;
  workEndChicago: string | null;
  source: string | null;
  accounts: DirectoryAccount[];
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * Active team members with their directory profile and the ACTIVE client
 * accounts they're staffed on (AAC raw_data role columns, see TEAM_ROLES).
 * Visible to every hub user: nothing here is above tier 0 (no pay, address,
 * DOB, emergency contacts; VPN codes are never imported).
 */
export async function listDirectory(): Promise<DirectoryPerson[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      phone: users.phone,
      jobTitle: users.jobTitle,
      jobTitles: users.jobTitles,
      departments: users.departments,
      profile: teamDirectoryProfiles,
    })
    .from(users)
    .innerJoin(teamDirectoryProfiles, eq(teamDirectoryProfiles.userId, users.id))
    .where(eq(users.employmentStatus, "active"))
    .orderBy(asc(users.name));

  const [leads, clients] = await Promise.all([
    rows.length
      ? db.select().from(userDepartmentLeads).where(inArray(userDepartmentLeads.userId, rows.map((r) => r.id)))
      : Promise.resolve([]),
    db.select({ code: aac.clientIdCode, name: aac.clientName, status: aac.clientStatus, raw: aac.rawData }).from(aac),
  ]);

  // name → accounts, from every active client's role columns
  const accountsByName = new Map<string, DirectoryAccount[]>();
  for (const c of clients) {
    if ((c.status ?? "").toLowerCase() !== "active") continue;
    const raw = (c.raw ?? {}) as Record<string, string>;
    const rolesByPerson = new Map<string, string[]>();
    for (const [key, label] of Object.entries(TEAM_ROLES)) {
      const person = String(raw[key] ?? "").trim();
      if (!person) continue;
      const k = norm(person);
      rolesByPerson.set(k, [...(rolesByPerson.get(k) ?? []), label]);
    }
    for (const [k, roles] of rolesByPerson) {
      accountsByName.set(k, [...(accountsByName.get(k) ?? []), { clientIdCode: c.code, clientName: c.name ?? c.code, roles }]);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    image: r.image,
    phone: r.phone,
    jobTitles: displayJobTitles(r.jobTitle, r.jobTitles),
    departments: r.departments,
    leadsDepartments: leads.filter((l) => l.userId === r.id).map((l) => l.department),
    company: r.profile.company,
    expertise: r.profile.expertise,
    employmentType: r.profile.employmentType,
    location: r.profile.location,
    timeZone: r.profile.timeZone,
    workDays: r.profile.workDays,
    workStartLocal: r.profile.workStartLocal,
    workEndLocal: r.profile.workEndLocal,
    workStartChicago: r.profile.workStartChicago,
    workEndChicago: r.profile.workEndChicago,
    source: r.profile.source,
    accounts: (r.name ? accountsByName.get(norm(r.name)) ?? [] : []).sort((a, b) => a.clientName.localeCompare(b.clientName)),
  }));
}

const time = z
  .string()
  .trim()
  .regex(/^(\d{1,2}:\d{2}\s?(AM|PM))?$/i, "Use a time like 09:00 AM")
  .transform((v) => (v ? v.toUpperCase().replace(/\s?(AM|PM)$/, " $1") : null));
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .default("")
    .transform((v) => v || null);

/** Fields an admin can set when adding or editing a person in the directory. */
export const directoryInputSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(255),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  title: opt(120),
  departments: z.array(z.enum(TEAM_DEPARTMENTS)).max(6).default([]),
  phone: opt(40),
  company: opt(120),
  expertise: opt(120),
  employmentType: opt(80),
  location: opt(160),
  timeZone: opt(60),
  workDays: z.array(z.enum(WEEKDAYS.map(([, k]) => k) as [string, ...string[]])).default([]),
  workStartLocal: time.default(""),
  workEndLocal: time.default(""),
  workStartChicago: time.default(""),
  workEndChicago: time.default(""),
});
export type DirectoryInput = z.infer<typeof directoryInputSchema>;

export function splitDirectoryInput(input: DirectoryInput) {
  const { name, email, title, departments, phone, ...profile } = input;
  return {
    user: { name, email, jobTitle: title, jobTitles: title ? [title] : [], departments, phone },
    profile,
  };
}
