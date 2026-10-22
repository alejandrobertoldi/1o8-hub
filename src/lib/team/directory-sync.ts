/**
 * Team sheet → hub sync (1o8_Performance_Team tab). The hub is the source of
 * truth for the team: this import creates people who aren't in the hub yet and
 * only FILLS EMPTY fields on people who are, so it never undoes an admin's
 * edit. `overwrite: true` makes the sheet win for the fields it carries.
 * It never deletes anyone and never changes role or employment status —
 * removing someone from the team is an admin action in the hub (alumni).
 */
import { parse as parseCsv } from "csv-parse/sync";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { teamDirectoryProfiles, userDepartmentLeads, users } from "@/lib/db/schema";
import { TEAM_DEPARTMENTS, isOrgLevelDepartment, type TeamDepartment } from "./departments";
import { leadRank, parseTeamSheet, placeholderEmail, type SheetTeamMember } from "./directory-sheet";

export type TeamSyncSummary = {
  inSheet: number;
  created: string[];
  updated: number;
  leadsAssigned: string[];
  notActiveInHub: string[];
  warnings: string[];
  dryRun: boolean;
};

export async function loadTeamSheetGrid(): Promise<string[][]> {
  const id = process.env.AAC_SPREADSHEET_ID;
  const gid = process.env.TEAM_SHEET_GID;
  if (!id || !gid) throw new Error("AAC_SPREADSHEET_ID / TEAM_SHEET_GID are not set (see .env.example)");
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`, { redirect: "follow" });
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith("<")) {
    throw new Error(`Could not download the team sheet (${res.status}). Is it shared by link?`);
  }
  return parseCsv(text, { relax_column_count: true }) as string[][];
}

const blank = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

export async function syncTeamDirectory(
  grid: string[][],
  opts: { overwrite?: boolean; dryRun?: boolean } = {},
): Promise<TeamSyncSummary> {
  const { members, warnings } = parseTeamSheet(grid);
  const summary: TeamSyncSummary = {
    inSheet: members.length,
    created: [],
    updated: 0,
    leadsAssigned: [],
    notActiveInHub: [],
    warnings,
    dryRun: !!opts.dryRun,
  };

  const existingUsers = await db.select().from(users);
  const byName = new Map(existingUsers.filter((u) => u.name).map((u) => [u.name!.trim().toLowerCase(), u]));
  const byEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]));
  const profiles = new Map((await db.select().from(teamDirectoryProfiles)).map((p) => [p.userId, p]));
  const pick = <T,>(current: T, incoming: T) => (opts.overwrite ? (blank(incoming) ? current : incoming) : blank(current) ? incoming : current);

  const resolved: { member: SheetTeamMember; userId: string | null }[] = [];

  for (const m of members) {
    const user = byName.get(m.name.toLowerCase()) ?? byEmail.get(placeholderEmail(m.name));
    if (!user) {
      summary.created.push(m.name);
      if (opts.dryRun) {
        resolved.push({ member: m, userId: null });
        continue;
      }
      const [created] = await db
        .insert(users)
        .values({
          email: placeholderEmail(m.name),
          name: m.name,
          role: "editor",
          employmentStatus: "active",
          jobTitle: m.title,
          jobTitles: m.title ? [m.title] : [],
          departments: m.departments,
          phone: m.phone,
        })
        .returning({ id: users.id });
      await db.insert(teamDirectoryProfiles).values({ userId: created.id, ...directoryValues(m), source: "sheet", sheetSyncedAt: new Date() });
      resolved.push({ member: m, userId: created.id });
      continue;
    }

    if (user.employmentStatus !== "active") summary.notActiveInHub.push(`${m.name} (${user.employmentStatus})`);
    summary.updated++;
    resolved.push({ member: m, userId: user.id });
    if (opts.dryRun) continue;

    const title = pick(user.jobTitle, m.title);
    await db
      .update(users)
      .set({
        jobTitle: title,
        jobTitles: opts.overwrite && m.title ? [m.title] : user.jobTitles.length ? user.jobTitles : title ? [title] : [],
        departments: pick(user.departments as TeamDepartment[], m.departments),
        phone: pick(user.phone, m.phone),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const current = profiles.get(user.id);
    const incoming = directoryValues(m);
    type Fields = typeof incoming;
    const merged: Fields = current
      ? (Object.fromEntries(
          (Object.keys(incoming) as (keyof Fields)[]).map((k) => [k, pick<unknown>(current[k], incoming[k])]),
        ) as unknown as Fields)
      : incoming;
    await db
      .insert(teamDirectoryProfiles)
      .values({ userId: user.id, ...merged, source: "sheet", sheetSyncedAt: new Date() })
      .onConflictDoUpdate({
        target: teamDirectoryProfiles.userId,
        set: { ...merged, sheetSyncedAt: new Date(), updatedAt: sql`now()` },
      });
  }

  // Department leads: only for departments that have none yet (an admin's pick always wins).
  const leads = await db.select().from(userDepartmentLeads);
  const ledDepartments = new Set(leads.map((l) => l.department));
  for (const dept of TEAM_DEPARTMENTS) {
    if (isOrgLevelDepartment(dept) || ledDepartments.has(dept)) continue;
    const best = resolved
      .filter((r) => r.member.departments.includes(dept) && leadRank(r.member.title) > 0)
      .sort((a, b) => leadRank(b.member.title) - leadRank(a.member.title))[0];
    if (!best) continue;
    summary.leadsAssigned.push(`${dept}: ${best.member.name}`);
    if (!opts.dryRun && best.userId) {
      await db.insert(userDepartmentLeads).values({ userId: best.userId, department: dept }).onConflictDoNothing();
    }
  }

  return summary;
}

function directoryValues(m: SheetTeamMember) {
  return {
    company: m.company,
    expertise: m.expertise,
    employmentType: m.employmentType,
    location: m.location,
    timeZone: m.timeZone,
    workDays: m.workDays,
    workStartLocal: m.workStartLocal,
    workEndLocal: m.workEndLocal,
    workStartChicago: m.workStartChicago,
    workEndChicago: m.workEndChicago,
  };
}
