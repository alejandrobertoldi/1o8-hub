import { NextResponse } from "next/server";
import { recycleDbPool } from "./index";
import { DbTimeoutError, withDbTimeout } from "./with-timeout";

/**
 * Wraps a route handler in a wall-clock budget. If it runs over (typically a
 * pooler connection wedged by a Vercel sandbox freeze, see db/index.ts), the
 * pool is recycled and the caller gets a fast 503 to retry, instead of a page
 * stuck on "Loading…" until the 60s platform limit.
 */
export function guarded<A extends unknown[]>(label: string, ms: number, handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await withDbTimeout(handler(...args), ms, label);
    } catch (err) {
      if (err instanceof DbTimeoutError) {
        recycleDbPool(`${label} timed out`);
        return NextResponse.json({ error: "The database took too long to answer. Try again." }, { status: 503, headers: { "Retry-After": "1" } });
      }
      throw err;
    }
  };
}
