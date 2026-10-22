import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/onboarding/create-asana-project", () => ({ asanaFetch: vi.fn() }));
import { runAsanaSync, type AsanaSyncDeps } from "./asana-sync";
import type { AsanaApiTask, AsanaTaskRow } from "./asana-map";

const task = (gid: string, assigneeEmail: string | null = "a@marketfoundry.agency"): AsanaApiTask => ({
  gid, name: `t${gid}`, completed: false, due_on: null, permalink_url: `u${gid}`,
  assignee: assigneeEmail ? { gid: "1", name: "A", email: assigneeEmail } : null,
  memberships: [{ project: { gid: "p", name: "SOP_SC_US | Sopreme" } }],
});

function deps(pages: { data: AsanaApiTask[]; next: string | null }[]): AsanaSyncDeps & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { fetchPage: [], upsert: [], closeMissing: [] };
  let i = 0;
  return {
    calls,
    fetchPage: vi.fn(async (offset: string | null) => { calls.fetchPage.push(offset); const p = pages[i++]; return { data: p.data, nextOffset: p.next }; }),
    upsert: vi.fn(async (rows: AsanaTaskRow[]) => { calls.upsert.push(rows.map((r) => r.gid)); }),
    closeMissing: vi.fn(async (gids: string[]) => { calls.closeMissing.push(gids); return 2; }),
  };
}

describe("runAsanaSync", () => {
  it("follows pagination, upserts every page, closes rows not seen", async () => {
    const d = deps([{ data: [task("1"), task("2")], next: "off1" }, { data: [task("3")], next: null }]);
    const res = await runAsanaSync(d);
    expect(d.calls.fetchPage).toEqual([null, "off1"]);
    expect(d.calls.upsert).toEqual([["1", "2"], ["3"]]);
    expect(d.calls.closeMissing).toEqual([["1", "2", "3"]]);
    expect(res).toEqual({ open: 3, pages: 2, closed: 2 });
  });

  it("stores unassigned tasks too (filtering happens at read time)", async () => {
    const d = deps([{ data: [task("1", null)], next: null }]);
    await runAsanaSync(d);
    expect(d.calls.upsert).toEqual([["1"]]);
  });

  it("refuses to close out when the run fetched nothing", async () => {
    const d = deps([{ data: [], next: null }]);
    await expect(runAsanaSync(d)).rejects.toThrow(/zero open tasks/i);
    expect(d.closeMissing).not.toHaveBeenCalled();
  });

  it("does not close out when a later page fails", async () => {
    const d = deps([{ data: [task("1")], next: "off1" }]);
    (d.fetchPage as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({ data: [task("1")], nextOffset: "off1" }))
      .mockImplementationOnce(async () => { throw new Error("Asana API 429"); });
    await expect(runAsanaSync(d)).rejects.toThrow("429");
    expect(d.closeMissing).not.toHaveBeenCalled();
  });

  it("stops after the page safety cap", async () => {
    const d = deps(Array.from({ length: 60 }, (_, k) => ({ data: [task(String(k))], next: `o${k}` })));
    await expect(runAsanaSync(d)).rejects.toThrow(/page cap/i);
    expect(d.closeMissing).not.toHaveBeenCalled();
  });
});
