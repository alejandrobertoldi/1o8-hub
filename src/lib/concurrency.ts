/**
 * Run `fn` over `items` with at most `limit` tasks in flight at once.
 * Results are returned in input order. A task that throws resolves to `null`
 * in its slot (so one failing client never aborts the whole warm run) — callers
 * that need to count successes should filter nulls.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  const cap = Math.max(1, Math.min(limit, items.length || 1));

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i], i);
      } catch {
        results[i] = null;
      }
    }
  }

  await Promise.all(Array.from({ length: cap }, () => worker()));
  return results;
}
