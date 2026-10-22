import { db } from "@/lib/db";
import { adminEventLog } from "@/lib/db/schema";

type LogEventParams = {
  userEmail?: string | null;
  userName?: string | null;
  section: string;
  action: string;
  status?: "success" | "error" | "warning";
  resourceType?: string;
  resourceId?: string;
  resourceLabel?: string;
  message?: string;
  detail?: Record<string, unknown>;
  durationMs?: number;
};

function toRow(params: LogEventParams) {
  return {
    userEmail: params.userEmail ?? null,
    userName: params.userName ?? null,
    section: params.section,
    action: params.action,
    status: params.status ?? "success",
    resourceType: params.resourceType ?? null,
    resourceId: params.resourceId ?? null,
    resourceLabel: params.resourceLabel ?? null,
    message: params.message ?? null,
    detail: params.detail ?? null,
    durationMs: params.durationMs ?? null,
  };
}

/**
 * Awaitable event write. Never rejects — a failed audit write must not fail
 * the action being audited.
 *
 * Prefer this over `logEvent` in any route the platform can freeze the moment
 * it returns. An un-awaited Postgres write is abandoned mid-protocol (Parse/
 * Bind/Execute sent, Sync never sent), leaving the backend in `state=active` /
 * `wait_event=Client:ClientRead` holding a Supavisor pool slot that neither
 * `statement_timeout` nor `idle_in_transaction_session_timeout` reaps. That is
 * what caused the 2026-08-04 production outage.
 *
 * Wrap the returned promise in `after()` from `next/server` at the call site:
 * response latency is unchanged, and the invocation stays alive to finish it.
 */
export async function logEventAsync(params: LogEventParams): Promise<void> {
  try {
    await db.insert(adminEventLog).values(toRow(params)).execute();
  } catch (err) {
    console.error(
      "[event-logger] Failed to write event:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Fire-and-forget event logger. Writes to admin_event_log.
 * Never throws — errors are silently logged to console.
 *
 * Retained unchanged for its 11 existing call sites. New call sites in request
 * handlers should use `logEventAsync` inside `after()` instead — see above.
 */
export function logEvent(params: LogEventParams): void {
  void logEventAsync(params);
}
