import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aac, asanaTasks, asanaSyncState } from "@/lib/db/schema";
import { asanaFetch } from "@/lib/onboarding/create-asana-project";
import {
  mapAsanaTask,
  ASANA_COMPLETED_WINDOW_DAYS,
  ASANA_OPT_FIELDS,
  ASANA_REPORTING_PROJECT_GID,
  type AsanaApiTask,
  type AsanaTaskRow,
} from "./asana-map";

/** 393 open tasks on 2026-10-07 ⇒ 4 pages. 50 pages = 5,000 open tasks: past that, something is wrong. */
const MAX_PAGES = 50;

export interface AsanaSyncDeps {
  fetchPage(offset: string | null): Promise<{ data: AsanaApiTask[]; nextOffset: string | null }>;
  upsert(rows: AsanaTaskRow[]): Promise<void>;
  /** Mark every stored open row whose gid is NOT in `openGids` as completed. Returns rows changed. */
  closeMissing(openGids: string[]): Promise<number>;
  /** AAC client codes; enables 1o8-style bare-code matching ("KSS | …") in mapAsanaTask. */
  knownClientCodes?(): Promise<ReadonlySet<string>>;
}

export async function runAsanaSync(deps: AsanaSyncDeps): Promise<{ open: number; pages: number; closed: number }> {
  const seen: string[] = [];
  let openCount = 0;
  let offset: string | null = null;
  let pages = 0;
  const knownCodes = deps.knownClientCodes ? await deps.knownClientCodes() : undefined;
  do {
    if (pages >= MAX_PAGES) throw new Error(`Asana sync hit the page cap (${MAX_PAGES}); refusing to close out`);
    const page = await deps.fetchPage(offset);
    pages++;
    const rows = page.data.map((t) => mapAsanaTask(t, knownCodes));
    if (rows.length) await deps.upsert(rows);
    seen.push(...rows.map((r) => r.gid));
    openCount += rows.filter((r) => !r.completed).length;
    offset = page.nextOffset;
  } while (offset);

  // An empty run is far more likely an outage/permission change than a team with zero open tasks.
  if (seen.length === 0) throw new Error("Asana returned zero open tasks; refusing to mark everything completed");
  const closed = await deps.closeMissing(seen);
  // `seen` also holds recently completed tasks (completed_since window); report open ones only.
  return { open: openCount, pages, closed };
}

export function dbAsanaSyncDeps(): AsanaSyncDeps {
  return {
    async fetchPage(offset) {
      const params = new URLSearchParams({
        project: ASANA_REPORTING_PROJECT_GID,
        // Incomplete tasks + tasks completed in the last N days: time can still be
        // logged against recently finished work (Time Tracking 2.0 rule).
        completed_since: new Date(Date.now() - ASANA_COMPLETED_WINDOW_DAYS * 86_400_000).toISOString(),
        limit: "100",
        opt_fields: ASANA_OPT_FIELDS,
      });
      if (offset) params.set("offset", offset);
      const json = (await asanaFetch(`/tasks?${params}`)) as { data: AsanaApiTask[]; next_page: { offset: string } | null };
      return { data: json.data, nextOffset: json.next_page?.offset ?? null };
    },
    async upsert(rows) {
      const now = new Date();
      await db
        .insert(asanaTasks)
        .values(rows.map((r) => ({ ...r, syncedAt: now })))
        .onConflictDoUpdate({
          target: asanaTasks.gid,
          set: {
            name: sql`excluded.name`, assigneeEmail: sql`excluded.assignee_email`, assigneeName: sql`excluded.assignee_name`,
            dueOn: sql`excluded.due_on`, completed: sql`excluded.completed`, clientIdCode: sql`excluded.client_id_code`,
            originProjectName: sql`excluded.origin_project_name`, taskStatus: sql`excluded.task_status`,
            priority: sql`excluded.priority`, permalinkUrl: sql`excluded.permalink_url`,
            asanaModifiedAt: sql`excluded.asana_modified_at`, syncedAt: sql`excluded.synced_at`,
            internalId: sql`excluded.internal_id`, serviceTags: sql`excluded.service_tags`,
            projectNames: sql`excluded.project_names`, completedAt: sql`excluded.completed_at`,
            goLiveDate: sql`excluded.go_live_date`,
          },
        });
    },
    async knownClientCodes() {
      const rows = await db.select({ code: aac.clientIdCode }).from(aac);
      return new Set(rows.map((r) => r.code));
    },
    async closeMissing(openGids) {
      const res = await db
        .update(asanaTasks)
        .set({ completed: true, syncedAt: new Date() })
        .where(and(eq(asanaTasks.completed, false), notInArray(asanaTasks.gid, openGids)))
        .returning({ gid: asanaTasks.gid });
      return res.length;
    },
  };
}

export async function recordSyncState(result: { ok: true; open: number } | { ok: false; error: string }): Promise<void> {
  const now = new Date();
  const values = result.ok
    ? { id: 1, lastAttemptAt: now, lastSuccessAt: now, lastError: null, openCount: result.open }
    : { id: 1, lastAttemptAt: now, lastError: result.error.slice(0, 2000) };
  await db.insert(asanaSyncState).values(values).onConflictDoUpdate({ target: asanaSyncState.id, set: values });
}
