import { and, desc, eq, gte, ilike, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aac, asanaAssigneeMap, asanaSyncState, asanaTasks, clientOnboardingSteps, monthlyReportAsanaLinks, monthlyReportGenerateFailures, monthlyReports, users } from "@/lib/db/schema";
import { buildDailyCacheKey, buildSummaryCacheKey, getCachedData, getCachedDataMany } from "@/lib/sales-cache";
import { recentWeekRanges } from "@/lib/iso-week";
import { getStepDef, isStepSatisfied } from "@/lib/onboarding/steps";
import { hasAsanaToken } from "@/lib/onboarding/create-asana-project";
import { isHubStaff } from "@/lib/roles";
import { dueStrip, groupTasks } from "./group-tasks";
import { accountsForUser } from "./my-accounts";
import { assigneeKey } from "@/lib/readiness/match";
import { blockedAlerts, clientReadinessAlerts, goLiveAlerts, lateAlerts, noDueDateAlert, rankAlerts, sowAlerts } from "./alerts";
import { OPEN_REVIEW_STATUSES, generationFailedItems, reportsWaitingOn } from "./reviews";
import type { AsanaLinkSubtask } from "@/lib/db/schema";
import type { AccountCard, DashAlert, DashTask, MyDashboardPayload, ReviewItem, Section } from "./types";

const SUBTASK_TITLES: Record<AsanaLinkSubtask["stage"], string> = {
  pm: "Monthly Reports \u2014 PM Review",
  am: "Monthly Reports \u2014 AM Review",
  ceo: "Monthly Reports \u2014 CEO Review, Approve and Send",
};

/** A query stuck on a wedged pool connection must fail its own box, not hang the whole page. */
export const SECTION_TIMEOUT_MS = 10_000;

export async function section<T>(fn: () => Promise<T>, timeoutMs = SECTION_TIMEOUT_MS): Promise<Section<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs / 1000}s`)), timeoutMs);
  });
  try { return { data: await Promise.race([fn(), timeout]), error: null }; }
  catch (e) { console.error("[me/dashboard]", e); return { data: null, error: e instanceof Error ? e.message : String(e) }; }
  finally { clearTimeout(timer); }
}

// Synchronous twin of section(): keeps in-memory builds isolated so one throw never 500s the route.
function trySection<T>(fn: () => T): Section<T> {
  try { return { data: fn(), error: null }; }
  catch (e) { console.error("[me/dashboard]", e); return { data: null, error: e instanceof Error ? e.message : String(e) }; }
}

function parseRaw(raw: unknown): Record<string, string> {
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return {}; } }
  return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
}

type CachedClient = { clientIdCode: string; accountIds: string[]; latestSalesDate: string | null; current?: { product_sales: number }; previous?: { product_sales: number } | null };

export async function loadMyDashboard(personId: string, viewer: { id: string; canPick: boolean }, today: string): Promise<MyDashboardPayload | null> {
  const [person] = await db.select({ id: users.id, name: users.name, email: users.email, image: users.image, asanaEmail: users.asanaEmail }).from(users).where(eq(users.id, personId)).limit(1);
  if (!person?.email) return null;
  // Work email plus the Asana login when it differs (e.g. a shared klaviyo@ inbox).
  const asanaEmails = [...new Set([person.email, person.asanaEmail].filter((e): e is string => !!e).map((e) => e.toLowerCase()))];

  // Last COMPLETE Sun–Sat week: the only whole week the sales cron warms (weeks[0] is partial).
  const week = recentWeekRanges(new Date(`${today}T12:00:00Z`), 2)[1];

  // All independent reads start together; each keeps its own section() isolation.
  const [syncState, asanaRows, stepRows, activeAac, summary, staff, reportRows, failureRows, linkRows] = await Promise.all([
    section(async () => (await db.select().from(asanaSyncState).where(eq(asanaSyncState.id, 1)).limit(1))[0] ?? null),
    section(() => db.select().from(asanaTasks)
      .where(and(eq(asanaTasks.completed, false), inArray(sql`lower(${asanaTasks.assigneeEmail})`, asanaEmails)))),
    section(() => db.select().from(clientOnboardingSteps)
      .where(and(eq(clientOnboardingSteps.assigneeId, person.id), ne(clientOnboardingSteps.status, "completed")))),
    section(() => db.select({ clientIdCode: aac.clientIdCode, clientName: aac.clientName, clientLogoUrl: aac.clientLogoUrl, rawData: aac.rawData })
      .from(aac).where(ilike(aac.clientStatus, "active"))),
    section(async () => {
      const cached = await getCachedData<{ clients: CachedClient[] }>("summary", buildSummaryCacheKey(week.start, week.end));
      return cached?.clients ?? null;
    }),
    viewer.canPick
      ? section(async () =>
          (await db.select({ id: users.id, name: users.name, role: users.role, email: users.email }).from(users))
            .filter((u) => isHubStaff(u.role) && u.email?.toLowerCase().endsWith("@1o8.agency"))
            .map(({ id, name }) => ({ id, name }))
            .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")))
        .then((r) => r.data)
      : Promise.resolve(null),
    section(() => db.select({ id: monthlyReports.id, clientIdCode: monthlyReports.clientIdCode, period: monthlyReports.period, status: monthlyReports.status, updatedAt: monthlyReports.updatedAt })
      .from(monthlyReports).where(inArray(monthlyReports.status, OPEN_REVIEW_STATUSES))),
    // Own section: the table may not be migrated yet, and that must never break the box (data stays null, no items).
    section(() => db.select().from(monthlyReportGenerateFailures).where(gte(monthlyReportGenerateFailures.attempts, 3))),
    // Own section, degrades silently: migration 0127 may not be applied yet.
    section(() => db.select().from(monthlyReportAsanaLinks).orderBy(desc(monthlyReportAsanaLinks.period)).limit(1)),
  ]);
  const link = linkRows.data?.[0] ?? null;
  const email = person.email.toLowerCase();
  const subtaskTasks: DashTask[] = (link?.subtasks ?? [])
    .filter((st) => !st.completed && st.email.toLowerCase() === email)
    .map((st) => ({ id: st.gid, source: "asana" as const, title: SUBTASK_TITLES[st.stage], clientIdCode: null, dueOn: st.dueOn, status: null, priority: null, url: st.url }));
  const syncRow = syncState.data;

  // Tasks fail as a unit if any of its three inputs failed (same as the old single section).
  const taskError = asanaRows.error ?? stepRows.error ?? activeAac.error;
  const taskList: Section<DashTask[]> = taskError
    ? { data: null, error: taskError }
    : trySection(() => {
        const activeCodes = new Set((activeAac.data ?? []).map((r) => r.clientIdCode));
        const steps = (stepRows.data ?? []).filter((s) => activeCodes.has(s.clientIdCode) && !isStepSatisfied({ key: s.stepKey, status: s.status }));
        return [
            ...(asanaRows.data ?? []).map((r) => ({ id: r.gid, source: "asana" as const, title: r.name, clientIdCode: r.clientIdCode, dueOn: r.dueOn, status: r.taskStatus, priority: r.priority, url: r.permalinkUrl, goLiveDate: r.goLiveDate ?? null })),
            ...subtaskTasks.filter((st) => !(asanaRows.data ?? []).some((r) => r.gid === st.id)),
            ...steps.map((s) => ({ id: s.id, source: "hub" as const, title: getStepDef(s.stepKey)?.label ?? s.stepKey, clientIdCode: s.clientIdCode, dueOn: null, status: s.status, priority: null, url: `/clients/${encodeURIComponent(s.clientIdCode)}/onboarding` })),
        ];
      });

  const accounts: Section<ReturnType<typeof accountsForUser>> = activeAac.error
    ? { data: null, error: activeAac.error }
    : trySection(() => accountsForUser(person.name, (activeAac.data ?? []).map((r) => ({ clientIdCode: r.clientIdCode, clientName: r.clientName, clientLogoUrl: r.clientLogoUrl, raw: parseRaw(r.rawData) }))));
  const myCodes = (accounts.data ?? []).map((a) => a.clientIdCode);
  const tasks = taskList.data ?? [];
  const byCode = new Map((summary.data ?? []).map((c) => [c.clientIdCode, c]));
  const dailyKeyFor = (c: CachedClient | undefined) => (c?.accountIds?.length ? buildDailyCacheKey(week.start, week.end, c.accountIds.join(",")) : null);

  // My clients' open Asana tasks (any assignee, for client readiness) and the batched daily sparkline read run together.
  const [clientRows, dailyMap, excludedRows] = await Promise.all([
    myCodes.length
      ? section(() => db.select({ clientIdCode: asanaTasks.clientIdCode, dueOn: asanaTasks.dueOn, assigneeName: asanaTasks.assigneeName, assigneeEmail: asanaTasks.assigneeEmail })
          .from(asanaTasks).where(and(eq(asanaTasks.completed, false), inArray(asanaTasks.clientIdCode, myCodes))))
      : Promise.resolve<Section<never[]>>({ data: [], error: null }),
    section(() => getCachedDataMany<{ days: { report_date: string; product_sales: number | string }[] }>(
      "daily",
      (accounts.data ?? []).map((a) => dailyKeyFor(byCode.get(a.clientIdCode))).filter((k): k is string => k != null),
    )),
    // Assignees left out of Readiness (client contacts), so client readiness matches the board. Degrades to none.
    section(() => db.select({ key: asanaAssigneeMap.assigneeKey }).from(asanaAssigneeMap).where(eq(asanaAssigneeMap.excluded, true))),
  ]);
  const excludedKeys = new Set((excludedRows.data ?? []).map((r) => r.key));

  // Each of my clients' readiness across all assignees (open / due today / overdue).
  const perClient = new Map<string, { open: number; dueToday: number; overdue: number }>();
  for (const r of clientRows.data ?? []) {
    if (!r.clientIdCode) continue;
    if ((r.assigneeName || r.assigneeEmail) && excludedKeys.has(assigneeKey({ name: r.assigneeName, email: r.assigneeEmail }))) continue;
    const c = perClient.get(r.clientIdCode) ?? { open: 0, dueToday: 0, overdue: 0 };
    c.open += 1;
    if (r.dueOn === today) c.dueToday += 1;
    if (r.dueOn && r.dueOn < today) c.overdue += 1;
    perClient.set(r.clientIdCode, c);
  }

  // 1o8 alerts: Go Lives, long-overdue tasks, my clients' readiness, blocked tasks, tasks without a due date.
  const alerts: Section<DashAlert[]> = clientRows.error
    ? { data: null, error: clientRows.error }
    : trySection(() => {
        const nameByCode = new Map((accounts.data ?? []).map((a) => [a.clientIdCode, a.clientName]));
        return rankAlerts([
          ...goLiveAlerts(tasks, today),
          ...lateAlerts(tasks, today),
          ...clientReadinessAlerts([...perClient].map(([code, c]) => ({ clientIdCode: code, clientName: nameByCode.get(code) ?? code, ...c }))),
          ...sowAlerts(
            (accounts.data ?? []).map((a) => ({
              clientIdCode: a.clientIdCode,
              clientName: a.clientName,
              raw: parseRaw((activeAac.data ?? []).find((r) => r.clientIdCode === a.clientIdCode)?.rawData),
            })),
            today,
          ),
          ...blockedAlerts(tasks),
          ...noDueDateAlert(tasks),
        ]);
      });

  const cards: Section<AccountCard[]> = dailyMap.error ? { data: null, error: dailyMap.error } : trySection(() => {
      const grouped = groupTasks(tasks, today);
      const overdueIds = new Set(grouped.overdue.map((t) => t.id));
      const daily = dailyMap.data;
    return (accounts.data ?? []).map((a): AccountCard => {
        const c = byCode.get(a.clientIdCode);
        const last = c?.current ? Number(c.current.product_sales) : null;
        const prev = c?.previous ? Number(c.previous.product_sales) : null;
        const key = dailyKeyFor(c);
        const days = key && daily ? daily.get(key)?.days : undefined;
        const spark = (days ?? []).map((d) => Number(d.product_sales) || 0);
        const sparkDates = (days ?? []).map((d) => String(d.report_date).slice(0, 10));
        const mine = tasks.filter((t) => t.clientIdCode === a.clientIdCode);
        return {
          ...a, salesLastWeek: last, salesWeekBefore: prev,
          changePct: last != null && prev ? ((last - prev) / prev) * 100 : null,
          spark, sparkDates, openTasks: mine.length, overdueTasks: mine.filter((t) => overdueIds.has(t.id)).length,
          alertCount: (alerts.data ?? []).filter((x) => x.clientIdCode === a.clientIdCode).length,
          readiness: (() => {
            const r = perClient.get(a.clientIdCode);
            return r?.open ? { ...r, pct: Math.round((1 - r.overdue / r.open) * 1000) / 10 } : null;
          })(),
        };
      });
  });

  // Monthly reports waiting on this person (PM/AM by client team name, CEO by email). Active clients only.
  const reviews: Section<ReviewItem[]> = reportRows.error || activeAac.error
    ? { data: null, error: reportRows.error ?? activeAac.error }
    : trySection(() => {
        const clientByCode = new Map((activeAac.data ?? []).map((c) => [c.clientIdCode, c]));
        const waiting = reportsWaitingOn(person, (reportRows.data ?? []).flatMap((r) => {
          const c = clientByCode.get(r.clientIdCode);
          return c ? [{ ...r, clientName: c.clientName, rawData: c.rawData }] : [];
        }), today);
        const failed = generationFailedItems(person, (failureRows.data ?? []).flatMap((f) => {
          const c = clientByCode.get(f.clientIdCode);
          return c ? [{ clientIdCode: f.clientIdCode, period: f.period, clientName: c.clientName, rawData: c.rawData }] : [];
        }), today);
        return [...waiting, ...failed];
      });

  return {
    viewer: { id: viewer.id, canPickPerson: viewer.canPick },
    person: { id: person.id, name: person.name, email: person.email, image: person.image },
    today,
    sync: { lastSuccessAt: syncRow?.lastSuccessAt?.toISOString() ?? null, lastError: syncState.error ?? syncRow?.lastError ?? null, connected: hasAsanaToken() },
    tasks: taskList.error ? { data: null, error: taskList.error } : trySection(() => groupTasks(tasks, today)),
    dueStrip: taskList.error ? { data: null, error: taskList.error } : trySection(() => dueStrip(tasks, today)),
    alerts,
    reviews,
    reviewsAsanaUrl: link?.parentUrl ?? null,
    accounts: cards.error || accounts.error
      ? { data: null, error: cards.error ?? accounts.error }
      : { data: { cards: cards.data ?? [], matchedName: person.name, salesWeek: summary.data ? week : null }, error: null },
    staff,
  };
}
