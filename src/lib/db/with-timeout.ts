// Supabase's transaction-mode pooler (port 6543) doesn't honor a client-side
// statement_timeout, and each Vercel serverless instance holds exactly one DB
// connection (see index.ts) — so if that one connection ever gets wedged, every
// request routed to that instance hangs forever with no error. This bounds the
// wait so a route can fail fast and let the caller retry (likely landing on a
// different, healthy instance) instead of leaving the browser spinning.
export class DbTimeoutError extends Error {
  constructor(ms: number, label?: string) {
    // The old message said "Database query timed out", which sent an
    // investigation after the queries for a day. This wraps a WHOLE handler —
    // auth, every query, assembly and serialization — so it is a wall-clock
    // budget for the request, and the DB is only one of the things it can be
    // waiting on. Say that.
    super(
      `${label ?? "Request"} exceeded its ${ms}ms budget ` +
        `(whole handler: auth + queries + serialization, not one query)`,
    );
    this.name = "DbTimeoutError";
  }
}

/**
 * Bounds how long a handler may take before the caller gets an error.
 *
 * IMPORTANT — this does NOT cancel the work. `Promise.race` only stops *waiting*;
 * the handler keeps running and keeps its DB connections, which is why a burst of
 * timeouts makes the next request worse rather than better. Real cancellation has
 * to come from the work itself (an AbortSignal threaded to each query), so until
 * that exists we at least (a) observe the abandoned work and report what it
 * really cost, and (b) swallow its late rejection so it can't surface as an
 * unhandled rejection long after the response was sent.
 */
export async function withDbTimeout<T>(
  promise: Promise<T>,
  ms = 20_000,
  label?: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  let settled = false;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Watch what we're abandoning: this is the only way to learn how long the
      // orphaned work actually held its connection.
      const abandonedAt = Date.now();
      promise.then(
        () => {
          if (!settled) {
            console.warn(
              `[withDbTimeout] ${label ?? "handler"} finished ` +
                `${Date.now() - abandonedAt}ms AFTER the ${ms}ms timeout ` +
                `(it held its connection for the whole time)`,
            );
          }
        },
        (err) => {
          if (!settled) {
            console.warn(
              `[withDbTimeout] ${label ?? "handler"} rejected ` +
                `${Date.now() - abandonedAt}ms after the ${ms}ms timeout:`,
              err instanceof Error ? err.message : err,
            );
          }
        },
      );
      reject(new DbTimeoutError(ms, label));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeout]);
    settled = true;
    return result;
  } finally {
    clearTimeout(timer!);
  }
}
