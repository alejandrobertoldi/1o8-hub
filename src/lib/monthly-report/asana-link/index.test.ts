import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
const token = vi.hoisted(() => ({ present: true }));
vi.mock("@/lib/onboarding/create-asana-project", () => ({ hasAsanaToken: () => token.present, asanaFetch: vi.fn() }));
const afterMock = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after: afterMock }));
import { ensurePeriodTask, syncPeriodSubtasks, scheduleAsanaEnsureAndSync, type LinkDeps } from "./index";

const dir = [{ name: "Hamid Zeb", email: "hamid@marketfoundry.agency" }, { name: "Amir Zeb", email: "amir@marketfoundry.agency" }, { name: "Jake Kosten", email: "jake@marketfoundry.agency" }];
const rep = (code: string, status: string) => ({ clientIdCode: code, status, rawData: { ProjectManager_MF: "Hamid Zeb", AccountManager_MF: "Amir Zeb" } });

const leases = new Map<string, { owner: string; until: number }>();
beforeEach(() => {
  leases.clear();
  token.present = true;
  vi.stubEnv("MONTHLY_REPORT_ASANA_ENABLED", "true");
  vi.stubEnv("MONTHLY_REPORT_ASANA_TEST_PREFIX", undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); });

function fake(reports: ReturnType<typeof rep>[]) {
  let link: Awaited<ReturnType<LinkDeps["getLink"]>> = null;
  let n = 0;
  const calls = { parent: 0, parentNames: [] as string[], sub: [] as string[], completed: [] as [string, boolean][] };
  const deps: LinkDeps = {
    loadReports: async () => reports,
    loadDirectory: async () => dir,
    getLink: async () => link,
    saveLink: async (row) => { link = row; },
    acquireLease: async (period, owner, ms) => {
      const cur = leases.get(period);
      if (cur && cur.until > Date.now()) return false;
      leases.set(period, { owner, until: Date.now() + ms });
      return true;
    },
    releaseLease: async (period, owner) => { if (leases.get(period)?.owner === owner) leases.delete(period); },
    sleep: () => new Promise<void>((r) => setTimeout(r, 2)),
    asana: {
      findParentByName: async () => null,
      findSubtask: async () => null,
      createParent: async (input) => { calls.parent++; calls.parentNames.push(input.name); return { gid: "P", url: "uP" }; },
      createSubtask: async (_p, input) => { calls.sub.push(input.name); n++; return { gid: `S${n}`, url: `uS${n}` }; },
      setCompleted: async (gid, c) => { calls.completed.push([gid, c]); },
    },
  };
  return { deps, calls, getLink: () => link };
}

describe("ensurePeriodTask", () => {
  it("creates parent + PM/AM/CEO subtasks with L9 deadlines", async () => {
    const f = fake([rep("A", "generated")]);
    await ensurePeriodTask("2026-10", f.deps);
    expect(f.calls.parent).toBe(1);
    expect(f.calls.sub).toEqual([
      "1o8 | Monthly Reports | PM Review — Hamid Zeb",
      "1o8 | Monthly Reports | AM Review — Amir Zeb",
      "1o8 | Monthly Reports | CEO Review, Approve and Send",
    ]);
    expect(f.getLink()!.subtasks.map((s) => [s.stage, s.dueOn])).toEqual([["pm", "2026-11-04"], ["am", "2026-11-05"], ["ceo", "2026-11-06"]]);
  });
  it("second ensure is a no-op", async () => {
    const f = fake([rep("A", "generated")]);
    await ensurePeriodTask("2026-10", f.deps);
    await ensurePeriodTask("2026-10", f.deps);
    expect(f.calls.parent).toBe(1);
    expect(f.calls.sub).toHaveLength(3);
  });
  it("never throws when the Asana parent create fails", async () => {
    const f = fake([rep("A", "generated")]);
    f.deps.asana.createParent = async () => { throw new Error("Asana API 503"); };
    await expect(ensurePeriodTask("2026-10", f.deps)).resolves.toBeUndefined();
  });
});

describe("ensurePeriodTask resilience and locking", () => {
    it("two concurrent ensures create one parent and one set of subtasks", async () => {
    const f = fake([rep("A", "generated")]);
    await Promise.all([ensurePeriodTask("2026-10", f.deps), ensurePeriodTask("2026-10", f.deps)]);
    expect(f.calls.parent).toBe(1);
    expect(f.calls.sub).toHaveLength(3);
  });
  it("ensure and sync racing lose no subtask", async () => {
    const reports = [rep("A", "generated")];
    const f = fake(reports);
    await ensurePeriodTask("2026-10", f.deps); // links PM/AM/CEO
    // drop the AM subtask from the stored link so the next ensure has to re-create it
    const full = f.getLink()!;
    await f.deps.saveLink({ ...full, subtasks: full.subtasks.filter((s) => s.stage !== "am") });
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const orig = f.deps.asana.createSubtask;
    f.deps.asana.createSubtask = async (p, input) => { await gate; return orig(p, input); };
    reports[0].status = "am_review"; // sync will want to tick PM while ensure is mid-create
    const e = ensurePeriodTask("2026-10", f.deps);
    await new Promise((r) => setTimeout(r, 0));
    const s = syncPeriodSubtasks("2026-10", f.deps);
    await new Promise((r) => setTimeout(r, 0));
    release();
    await Promise.all([e, s]);
    expect(f.getLink()!.subtasks.map((x) => x.stage).sort()).toEqual(["am", "ceo", "pm"]);
    expect(f.getLink()!.subtasks.find((x) => x.stage === "pm")!.completed).toBe(true); // sync's tick must survive ensure's save
  });
  it("an expired lease can be taken over", async () => {
    const f = fake([rep("A", "generated")]);
    leases.set("2026-10", { owner: "dead", until: Date.now() - 1000 });
    await ensurePeriodTask("2026-10", f.deps);
    expect(f.calls.parent).toBe(1);
  });
  it("one failing reviewer subtask does not block the others", async () => {
    const f = fake([rep("A", "generated")]);
    const orig = f.deps.asana.createSubtask;
    f.deps.asana.createSubtask = async (p, input) => {
      if (input.assignee === "hamid@marketfoundry.agency") throw new Error("boom");
      return orig(p, input);
    };
    await ensurePeriodTask("2026-10", f.deps);
    expect(f.getLink()!.subtasks.map((s) => s.stage)).toEqual(["am", "ceo"]);
    expect(f.getLink()!.lastError).toContain("hamid@marketfoundry.agency");
  });
});

describe("syncPeriodSubtasks", () => {
  it("ticks the PM subtask once the report moved to AM, then no writes when nothing changed", async () => {
    const reports = [rep("A", "generated")];
    const f = fake(reports);
    await ensurePeriodTask("2026-10", f.deps);
    reports[0].status = "am_review";
    await syncPeriodSubtasks("2026-10", f.deps);
    expect(f.calls.completed).toEqual([["S1", true]]);
    await syncPeriodSubtasks("2026-10", f.deps);
    expect(f.calls.completed).toEqual([["S1", true]]);
  });
  it("does nothing (and never throws) for a period without a link row", async () => {
    const f = fake([rep("A", "am_review")]);
    await expect(syncPeriodSubtasks("2026-10", f.deps)).resolves.toBeUndefined();
    expect(f.calls.completed).toEqual([]);
  });
  it("gives up after 5 attempts when the lease is held, with no Asana writes", async () => {
    const reports = [rep("A", "generated")];
    const f = fake(reports);
    await ensurePeriodTask("2026-10", f.deps);
    reports[0].status = "am_review";
    leases.set("2026-10", { owner: "other", until: Date.now() + 60_000 });
    let tries = 0;
    const acq = f.deps.acquireLease;
    f.deps.acquireLease = async (...a) => { tries++; return acq(...a); };
    await expect(syncPeriodSubtasks("2026-10", f.deps)).resolves.toBeUndefined();
    expect(tries).toBe(5);
    expect(f.calls.completed).toEqual([]);
  });
  it("a failed tick leaves the flag unchanged and sets lastError; the next clean sync clears it", async () => {
    const reports = [rep("A", "generated")];
    const f = fake(reports);
    await ensurePeriodTask("2026-10", f.deps);
    reports[0].status = "am_review";
    const ok = f.deps.asana.setCompleted;
    f.deps.asana.setCompleted = async () => { throw new Error("Asana 500"); };
    await syncPeriodSubtasks("2026-10", f.deps);
    expect(f.getLink()!.subtasks[0].completed).toBe(false);
    expect(f.getLink()!.lastError).toContain("Asana 500");
    f.deps.asana.setCompleted = ok;
    await syncPeriodSubtasks("2026-10", f.deps);
    expect(f.getLink()!.subtasks[0].completed).toBe(true);
    expect(f.getLink()!.lastError).toBeNull();
  });
});

describe("scheduleAsanaEnsureAndSync", () => {
  it("with the default ensure/sync the after() callback never rejects", async () => {
    afterMock.mockReset();
    scheduleAsanaEnsureAndSync("2026-10"); // db mocked as {}: both fail internally and swallow
    expect(afterMock).toHaveBeenCalledTimes(1);
    await expect(Promise.resolve(afterMock.mock.calls[0][0]())).resolves.toBeUndefined();
  });
  it("runs ensure then sync; callback resolves even when both reject", async () => {
    afterMock.mockReset();
    const order: string[] = [];
    scheduleAsanaEnsureAndSync("2026-10",
      () => { order.push("ensure"); return Promise.reject(new Error("a")); },
      () => { order.push("sync"); return Promise.reject(new Error("b")); });
    await expect(Promise.resolve(afterMock.mock.calls[0][0]())).resolves.toBeUndefined();
    expect(order).toEqual(["ensure", "sync"]);
  });
  it("does not throw if after() throws (outside a request scope)", () => {
    afterMock.mockImplementationOnce(() => { throw new Error("outside request scope"); });
    expect(() => scheduleAsanaEnsureAndSync("2026-10")).not.toThrow();
  });
});

/** Deps where every call is recorded — the gate must return before touching any of them. */
function untouchable() {
  const touched: string[] = [];
  const rec = (k: string) => async () => { touched.push(k); return null as never; };
  const deps: LinkDeps = {
    loadReports: rec("loadReports"), loadDirectory: rec("loadDirectory"), getLink: rec("getLink"), saveLink: rec("saveLink"),
    acquireLease: rec("acquireLease"), releaseLease: rec("releaseLease"),
    asana: {
      findParentByName: rec("findParentByName"), findSubtask: rec("findSubtask"),
      createParent: rec("createParent"), createSubtask: rec("createSubtask"), setCompleted: rec("setCompleted"),
    },
  };
  return { deps, touched };
}

describe("off-by-default switch and first-period guard (I1)", () => {
  it("disabled (flag unset) → ensure and sync touch nothing", async () => {
    vi.stubEnv("MONTHLY_REPORT_ASANA_ENABLED", undefined);
    const u = untouchable();
    await ensurePeriodTask("2026-10", u.deps);
    await syncPeriodSubtasks("2026-10", u.deps);
    expect(u.touched).toEqual([]);
  });
  it("flag set to anything but \"true\" is still off", async () => {
    vi.stubEnv("MONTHLY_REPORT_ASANA_ENABLED", "1");
    const u = untouchable();
    await ensurePeriodTask("2026-10", u.deps);
    await syncPeriodSubtasks("2026-10", u.deps);
    expect(u.touched).toEqual([]);
  });
  it("no Asana token → touches nothing", async () => {
    token.present = false;
    const u = untouchable();
    await ensurePeriodTask("2026-10", u.deps);
    await syncPeriodSubtasks("2026-10", u.deps);
    expect(u.touched).toEqual([]);
  });
  it("a backlog period before 2026-10 touches nothing even when enabled", async () => {
    const u = untouchable();
    await ensurePeriodTask("2026-09", u.deps);
    await syncPeriodSubtasks("2026-09", u.deps);
    await ensurePeriodTask("2025-12", u.deps);
    expect(u.touched).toEqual([]);
  });
  it("later periods (incl. next year) pass the guard", async () => {
    const f = fake([rep("A", "generated")]);
    await ensurePeriodTask("2027-01", f.deps);
    expect(f.calls.parentNames).toEqual(["1o8 | Monthly Reports | Jan 2027"]);
  });
  it("MONTHLY_REPORT_ASANA_TEST_PREFIX prefixes the parent and every subtask name", async () => {
    vi.stubEnv("MONTHLY_REPORT_ASANA_TEST_PREFIX", "[TEST] ");
    const f = fake([rep("A", "generated")]);
    await ensurePeriodTask("2026-10", f.deps);
    expect(f.calls.parentNames).toEqual(["[TEST] 1o8 | Monthly Reports | Oct 2026"]);
    expect(f.calls.sub).toEqual([
      "[TEST] 1o8 | Monthly Reports | PM Review — Hamid Zeb",
      "[TEST] 1o8 | Monthly Reports | AM Review — Amir Zeb",
      "[TEST] 1o8 | Monthly Reports | CEO Review, Approve and Send",
    ]);
  });
});

describe("404-tolerant sync (I2)", () => {
  it("a 404 on one subtask drops it; later ticks and the parent update still happen", async () => {
    const reports = [rep("A", "generated")];
    const f = fake(reports);
    await ensurePeriodTask("2026-10", f.deps); // S1 pm, S2 am, S3 ceo
    reports[0].status = "sent";
    const ok = f.deps.asana.setCompleted;
    f.deps.asana.setCompleted = async (gid, c) => {
      if (gid === "S1") throw new Error('Asana API 404: {"errors":[{"message":"Unknown object"}]} [both Asana tokens tried]');
      return ok(gid, c);
    };
    await syncPeriodSubtasks("2026-10", f.deps);
    expect(f.calls.completed).toEqual([["S2", true], ["S3", true], ["P", true]]);
    const link = f.getLink()!;
    expect(link.subtasks.map((s) => s.gid)).toEqual(["S2", "S3"]);
    expect(link.parentCompleted).toBe(true);
    expect(link.lastError).toBeNull();
    // the next ensure recreates the dropped reviewer's subtask (spec §7)
    f.deps.asana.setCompleted = ok;
    await ensurePeriodTask("2026-10", f.deps);
    expect(f.getLink()!.subtasks.map((s) => s.stage)).toEqual(["am", "ceo", "pm"]);
  });
  it("a non-404 failure is recorded in lastError but does not stop later ticks or the parent", async () => {
    const reports = [rep("A", "generated")];
    const f = fake(reports);
    await ensurePeriodTask("2026-10", f.deps);
    reports[0].status = "sent";
    const ok = f.deps.asana.setCompleted;
    f.deps.asana.setCompleted = async (gid, c) => {
      if (gid === "S2") throw new Error("Asana API 500: oops");
      return ok(gid, c);
    };
    await syncPeriodSubtasks("2026-10", f.deps);
    expect(f.calls.completed).toEqual([["S1", true], ["S3", true], ["P", true]]);
    const link = f.getLink()!;
    expect(link.subtasks.map((s) => [s.gid, s.completed])).toEqual([["S1", true], ["S2", false], ["S3", true]]);
    expect(link.parentCompleted).toBe(true);
    expect(link.lastError).toContain("Asana API 500");
  });
  it("a failed parent update is recorded and the subtask ticks are kept", async () => {
    const reports = [rep("A", "generated")];
    const f = fake(reports);
    await ensurePeriodTask("2026-10", f.deps);
    reports[0].status = "sent";
    const ok = f.deps.asana.setCompleted;
    f.deps.asana.setCompleted = async (gid, c) => {
      if (gid === "P") throw new Error("Asana API 500: parent");
      return ok(gid, c);
    };
    await syncPeriodSubtasks("2026-10", f.deps);
    const link = f.getLink()!;
    expect(link.subtasks.every((s) => s.completed)).toBe(true);
    expect(link.parentCompleted).toBe(false);
    expect(link.lastError).toContain("parent");
  });
});

describe("reuse before create (I4)", () => {
  it("adopts an existing open parent with the exact name instead of creating one", async () => {
    const f = fake([rep("A", "generated")]);
    const asked: string[] = [];
    f.deps.asana.findParentByName = async (name) => { asked.push(name); return { gid: "OLD", url: "uOLD" }; };
    await ensurePeriodTask("2026-10", f.deps);
    expect(asked).toEqual(["1o8 | Monthly Reports | Oct 2026"]);
    expect(f.calls.parent).toBe(0);
    expect(f.getLink()!.parentGid).toBe("OLD");
    expect(f.getLink()!.parentUrl).toBe("uOLD");
    expect(f.calls.sub).toHaveLength(3);
  });
  it("adopts an existing subtask (same name + assignee) instead of recreating it", async () => {
    const f = fake([rep("A", "generated")]);
    const asked: [string, string, string][] = [];
    f.deps.asana.findSubtask = async (parentGid, name, email) => {
      asked.push([parentGid, name, email]);
      return name.includes("PM Review") ? { gid: "ORPHAN", url: "uORPHAN" } : null;
    };
    await ensurePeriodTask("2026-10", f.deps);
    expect(asked[0]).toEqual(["P", "1o8 | Monthly Reports | PM Review — Hamid Zeb", "hamid@marketfoundry.agency"]);
    expect(asked).toHaveLength(3);
    expect(f.calls.sub).toEqual([
      "1o8 | Monthly Reports | AM Review — Amir Zeb",
      "1o8 | Monthly Reports | CEO Review, Approve and Send",
    ]);
    const pm = f.getLink()!.subtasks.find((s) => s.stage === "pm")!;
    expect([pm.gid, pm.url, pm.dueOn]).toEqual(["ORPHAN", "uORPHAN", "2026-11-04"]);
  });
  it("a failing finder is treated like a failed create for that reviewer (others proceed)", async () => {
    const f = fake([rep("A", "generated")]);
    f.deps.asana.findSubtask = async (_p, name) => { if (name.includes("AM Review")) throw new Error("Asana API 500"); return null; };
    await ensurePeriodTask("2026-10", f.deps);
    expect(f.getLink()!.subtasks.map((s) => s.stage)).toEqual(["pm", "ceo"]);
    expect(f.getLink()!.lastError).toContain("amir@marketfoundry.agency");
  });
});
