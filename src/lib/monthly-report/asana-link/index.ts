import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aac, monthlyReportAsanaLinks, monthlyReports, users, type AsanaLinkSubtask } from "@/lib/db/schema";
import { hasAsanaToken } from "@/lib/onboarding/create-asana-project";
import { reviewDeadlines } from "./deadlines";
import { reviewersForPeriod, type PeriodReport, type Reviewer } from "./reviewers";
import { planNewSubtasks, planSubtaskSync } from "./plan";
import * as asana from "./asana";

type Directory = { name: string | null; email: string }[];
type LinkRow = typeof monthlyReportAsanaLinks.$inferSelect;
type LinkInsert = Omit<LinkRow, "updatedAt">;
export interface LinkDeps {
  loadReports(period: string): Promise<PeriodReport[]>;
  loadDirectory(): Promise<Directory>;
  getLink(period: string): Promise<LinkInsert | null>;
  saveLink(row: LinkInsert): Promise<void>;
  /** Lease row (never a held connection): true iff this owner now holds the period's lease. */
  acquireLease(period: string, owner: string, ms: number): Promise<boolean>;
  releaseLease(period: string, owner: string): Promise<void>;
  /** Injectable so tests don't wait between sync lease attempts. */
  sleep?(ms: number): Promise<void>;
  asana: {
    findParentByName: typeof asana.findParentByName;
    findSubtask: typeof asana.findSubtask;
    createParent: typeof asana.createParent;
    createSubtask: typeof asana.createSubtask;
    setCompleted: typeof asana.setCompleted;
  };
}

const PREFIX = "1o8 | Monthly Reports";
/** First period the Hub drives in Asana (L7): the Jul–Sep backlog is never written, whatever the flag says. */
export const FIRST_ASANA_PERIOD = "2026-10";
/** Off by default: Asana writes need MONTHLY_REPORT_ASANA_ENABLED=true (exactly). */
export const isAsanaLinkEnabled = () => process.env.MONTHLY_REPORT_ASANA_ENABLED === "true";
// YYYY-MM compares correctly as a string.
const asanaLinkActive = (period: string) => isAsanaLinkEnabled() && hasAsanaToken() && period >= FIRST_ASANA_PERIOD;
// Sandbox runs (e.g. "[TEST] ") — prefixes every created name; the finders then match the prefixed names only.
const testPrefix = () => process.env.MONTHLY_REPORT_ASANA_TEST_PREFIX || "";
// resolvePeriod().label is the long form ("September 2026"); the Asana titles use the short form ("Sep 2026").
const periodLabel = (period: string) =>
  new Date(`${period}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const notes = (period: string) =>
  `Monthly client reports for ${periodLabel(period)}. Review and approve in the Hub: ${asana.MR_ASANA.hubUrl}\n` +
  `This task and its subtasks are created and ticked automatically by the Hub — please act in the Hub, not here.`;

const parentName = (period: string) => `${testPrefix()}${PREFIX} | ${periodLabel(period)}`;
function subtaskName(r: Reviewer): string {
  if (r.stage === "pm") return `${testPrefix()}${PREFIX} | PM Review — ${r.name}`;
  if (r.stage === "am") return `${testPrefix()}${PREFIX} | AM Review — ${r.name}`;
  return `${testPrefix()}${PREFIX} | CEO Review, Approve and Send`;
}

export function dbLinkDeps(): LinkDeps {
  return {
    // ALL reports of the period, blocked included — the planners filter blocked themselves.
    loadReports: (period) =>
      db.select({ clientIdCode: monthlyReports.clientIdCode, status: monthlyReports.status, rawData: aac.rawData })
        .from(monthlyReports).innerJoin(aac, eq(aac.clientIdCode, monthlyReports.clientIdCode))
        .where(eq(monthlyReports.period, period)),
    loadDirectory: () => db.select({ name: users.name, email: users.email }).from(users),
    async getLink(period) {
      const [row] = await db.select().from(monthlyReportAsanaLinks).where(eq(monthlyReportAsanaLinks.period, period)).limit(1);
      return row ?? null;
    },
    async saveLink(row) {
      await db.insert(monthlyReportAsanaLinks).values({ ...row, updatedAt: new Date() })
        .onConflictDoUpdate({ target: monthlyReportAsanaLinks.period, set: { ...row, updatedAt: new Date() } });
    },
    async acquireLease(period, owner, ms) {
      const rows = await db.execute(sql`
        INSERT INTO monthly_report_asana_locks (period, locked_until, owner)
        VALUES (${period}, now() + ${ms} * interval '1 millisecond', ${owner})
        ON CONFLICT (period) DO UPDATE SET locked_until = EXCLUDED.locked_until, owner = EXCLUDED.owner
        WHERE monthly_report_asana_locks.locked_until < now()
        RETURNING period`);
      return (rows as unknown as unknown[]).length > 0;
    },
    async releaseLease(period, owner) {
      await db.execute(sql`DELETE FROM monthly_report_asana_locks WHERE period = ${period} AND owner = ${owner}`);
    },
    asana: {
      findParentByName: asana.findParentByName, findSubtask: asana.findSubtask,
      createParent: asana.createParent, createSubtask: asana.createSubtask, setCompleted: asana.setCompleted,
    },
  };
}

const LEASE_MS = 120_000;
const SYNC_ATTEMPTS = 5;
const SYNC_RETRY_MS = 1000;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
// asanaFetch throws "Asana API <status>: …" (with a "[both Asana tokens tried]" suffix when it fell back).
const isAsanaNotFound = (e: unknown) => errMsg(e).includes("Asana API 404");

/** Create the period's Asana parent (once) and any missing reviewer subtasks. Never throws. */
export async function ensurePeriodTask(period: string, deps: LinkDeps = dbLinkDeps()): Promise<void> {
  if (!asanaLinkActive(period)) return;
  const owner = randomUUID();
  try {
    if (!(await deps.acquireLease(period, owner, LEASE_MS))) return; // another run is on it
    try {
      await ensureLocked(period, deps);
    } finally {
      await deps.releaseLease(period, owner).catch(() => {});
    }
  } catch (e) {
    console.error("[monthly-asana] ensure failed", period, e);
  }
}

async function ensureLocked(period: string, deps: LinkDeps): Promise<void> {
  let link: LinkInsert | null = null;
  try {
    const [reports, directory] = await Promise.all([deps.loadReports(period), deps.loadDirectory()]);
    if (!reports.length) return;
    const d = reviewDeadlines(period);
    link = await deps.getLink(period);
    const { reviewers, unresolved } = reviewersForPeriod(reports, directory);
    if (!link) {
      const ceo = reviewers.find((r) => r.stage === "ceo");
      if (!ceo) return; // only blocked reports — nothing to review yet
      const name = parentName(period);
      const parent = (await deps.asana.findParentByName(name))
        ?? (await deps.asana.createParent({ name, notes: notes(period), assignee: ceo.email, dueOn: d.ceo }));
      link = { period, parentGid: parent.gid, parentUrl: parent.url, parentCompleted: false, subtasks: [], lastError: null };
      await deps.saveLink(link);
    }
    for (const u of unresolved) console.error(`[monthly-asana] no email for ${u.stage} "${u.name}" on ${u.clientIdCodes.join(", ")}`);
    const errors: string[] = [];
    for (const r of planNewSubtasks(link.subtasks, reviewers)) {
      const dueOn = r.stage === "pm" ? d.pm : r.stage === "am" ? d.am : d.ceo;
      try {
        const name = subtaskName(r);
        const created = (await deps.asana.findSubtask(link.parentGid, name, r.email))
          ?? (await deps.asana.createSubtask(link.parentGid, { name, notes: notes(period), assignee: r.email, dueOn }));
        const entry: AsanaLinkSubtask = { gid: created.gid, url: created.url, stage: r.stage, email: r.email, name: r.name, dueOn, completed: false };
        link = { ...link, subtasks: [...link.subtasks, entry] };
        await deps.saveLink(link); // persist after each create so a crash never duplicates a subtask
      } catch (e) {
        console.error("[monthly-asana] subtask failed", period, r.stage, r.email, e);
        errors.push(`${r.stage} ${r.email}: ${errMsg(e)}`);
      }
    }
    const lastError = errors.length ? errors.join("; ") : null;
    if (lastError !== link.lastError) await deps.saveLink({ ...link, lastError });
  } catch (e) {
    console.error("[monthly-asana] ensure failed", period, e);
    if (link) await deps.saveLink({ ...link, lastError: errMsg(e) }).catch(() => {});
  }
}

/** Tick/untick reviewer subtasks + parent to match Hub review state. Never throws. */
export async function syncPeriodSubtasks(period: string, deps: LinkDeps = dbLinkDeps()): Promise<void> {
  if (!asanaLinkActive(period)) return;
  const owner = randomUUID();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  try {
    let got = false;
    for (let i = 0; i < SYNC_ATTEMPTS && !got; i++) {
      if (i > 0) await sleep(SYNC_RETRY_MS);
      got = await deps.acquireLease(period, owner, LEASE_MS);
    }
    if (!got) {
      console.error("[monthly-asana] sync skipped: period locked", period);
      return;
    }
    try {
      await syncLocked(period, deps);
    } finally {
      await deps.releaseLease(period, owner).catch(() => {});
    }
  } catch (e) {
    console.error("[monthly-asana] sync failed", period, e);
  }
}

async function syncLocked(period: string, deps: LinkDeps): Promise<void> {
  let link: LinkInsert | null = null;
  try {
    link = await deps.getLink(period); // re-read inside the lock
    if (!link) return;
    const [reports, directory] = await Promise.all([deps.loadReports(period), deps.loadDirectory()]);
    const plan = planSubtaskSync(link.subtasks, reports, directory, link.parentCompleted);
    const errors: string[] = [];
    // Each write stands alone: one bad gid must never freeze the rest of the period (spec §7).
    for (const [gids, value] of [[plan.complete, true], [plan.reopen, false]] as const) {
      for (const gid of gids) {
        try {
          await deps.asana.setCompleted(gid, value);
          link = { ...link, subtasks: link.subtasks.map((s) => (s.gid === gid ? { ...s, completed: value } : s)) };
          await deps.saveLink(link);
        } catch (e) {
          if (isAsanaNotFound(e)) {
            // Deleted in Asana by hand: forget it; the next ensure recreates that reviewer's subtask.
            console.error("[monthly-asana] subtask gone (404), dropping it", period, gid);
            link = { ...link, subtasks: link.subtasks.filter((s) => s.gid !== gid) };
            await deps.saveLink(link);
          } else {
            console.error("[monthly-asana] tick failed", period, gid, e);
            errors.push(`${gid}: ${errMsg(e)}`);
          }
        }
      }
    }
    if (plan.parent) {
      try {
        await deps.asana.setCompleted(link.parentGid, plan.parent === "complete");
        link = { ...link, parentCompleted: plan.parent === "complete" };
        await deps.saveLink(link);
      } catch (e) {
        console.error("[monthly-asana] parent update failed", period, link.parentGid, e);
        errors.push(`parent ${link.parentGid}: ${errMsg(e)}`);
      }
    }
    const lastError = errors.length ? errors.join("; ") : null;
    if (lastError !== link.lastError) await deps.saveLink({ ...link, lastError });
  } catch (e) {
    console.error("[monthly-asana] sync failed", period, e);
    if (link) await deps.saveLink({ ...link, lastError: errMsg(e) }).catch(() => {});
  }
}

/** Ensure the period's task then sync its subtasks, after the response. Never throws, even outside a request scope. */
export function scheduleAsanaEnsureAndSync(
  period: string,
  ensure: (p: string) => Promise<void> = ensurePeriodTask,
  sync: (p: string) => Promise<void> = syncPeriodSubtasks,
): void {
  try {
    after(async () => {
      await ensure(period).catch(() => {});
      await sync(period).catch(() => {});
    });
  } catch (e) {
    console.error("[monthly-asana] schedule failed", period, e);
  }
}
