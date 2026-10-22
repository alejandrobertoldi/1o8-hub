import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { asanaFetch, hasAsanaToken, createAsanaOrgProbe } from "./create-asana-project";

const MF = "mf-token";
const LEGACY = "legacy-1o8-token";

function jsonRes(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function authOf(call: unknown[]): string {
  const init = call[1] as RequestInit;
  return (init.headers as Record<string, string>).Authorization;
}

const ORIGINAL = {
  legacy: process.env.ASANA_ACCESS_TOKEN,
  mf: process.env.ASANA_ACCESS_TOKEN_MF,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  process.env.ASANA_ACCESS_TOKEN = LEGACY;
  process.env.ASANA_ACCESS_TOKEN_MF = MF;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL.legacy === undefined) delete process.env.ASANA_ACCESS_TOKEN;
  else process.env.ASANA_ACCESS_TOKEN = ORIGINAL.legacy;
  if (ORIGINAL.mf === undefined) delete process.env.ASANA_ACCESS_TOKEN_MF;
  else process.env.ASANA_ACCESS_TOKEN_MF = ORIGINAL.mf;
});

describe("asanaFetch token routing", () => {
  it("tries the 1o8 token first", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { data: { gid: "1" } }));
    await asanaFetch("/projects/123/tasks");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authOf(fetchMock.mock.calls[0])).toBe(`Bearer ${MF}`);
  });

  it("falls back to the 1o8 token when the MF token 404s (legacy project read)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(404, { errors: [{ message: "Not found." }] }))
      .mockResolvedValueOnce(jsonRes(200, { data: { gid: "legacy" } }));
    const out = await asanaFetch("/projects/1216723494693529/tasks");
    expect(out).toEqual({ data: { gid: "legacy" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authOf(fetchMock.mock.calls[1])).toBe(`Bearer ${LEGACY}`);
  });

  it("falls back on 403 as well as 404", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(403, { errors: [{ message: "Forbidden" }] }))
      .mockResolvedValueOnce(jsonRes(200, { data: [] }));
    await asanaFetch("/tasks/999/stories");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back for a WRITE to an existing legacy project (comments, sections, assignees)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(404))
      .mockResolvedValueOnce(jsonRes(200, { data: { gid: "s1" } }));
    await asanaFetch("/projects/1216723494693529/sections", {
      method: "POST",
      body: JSON.stringify({ data: { name: "x" } }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authOf(fetchMock.mock.calls[1])).toBe(`Bearer ${LEGACY}`);
  });

  it("NEVER falls back on POST /projects — a retry would create the project in the 1o8 org", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(403, { errors: [{ message: "Forbidden" }] }));
    await expect(
      asanaFetch("/projects", { method: "POST", body: JSON.stringify({ data: {} }) })
    ).rejects.toThrow(/403/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authOf(fetchMock.mock.calls[0])).toBe(`Bearer ${MF}`);
  });

  it("NEVER falls back on POST /custom_fields — it is workspace-scoped by the token", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(404));
    await expect(
      asanaFetch("/custom_fields", { method: "POST", body: JSON.stringify({ data: {} }) })
    ).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry on errors other than 403/404", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(500, { errors: [{ message: "boom" }] }));
    await expect(asanaFetch("/tasks/1")).rejects.toThrow(/500/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("makes ONE attempt when both env vars hold the same token", async () => {
    process.env.ASANA_ACCESS_TOKEN_MF = LEGACY;
    fetchMock.mockResolvedValueOnce(jsonRes(404));
    await expect(asanaFetch("/tasks/1")).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("behaves exactly as before when ASANA_ACCESS_TOKEN_MF is unset", async () => {
    delete process.env.ASANA_ACCESS_TOKEN_MF;
    fetchMock.mockResolvedValueOnce(jsonRes(200, { data: { gid: "1" } }));
    await asanaFetch("/tasks/1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authOf(fetchMock.mock.calls[0])).toBe(`Bearer ${LEGACY}`);
  });

  it("throws when no token at all is configured", async () => {
    delete process.env.ASANA_ACCESS_TOKEN;
    delete process.env.ASANA_ACCESS_TOKEN_MF;
    await expect(asanaFetch("/tasks/1")).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createAsanaOrgProbe", () => {
  it("reports the MF token slot for a project the MF token can see", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { data: { gid: "p1" } }));

    const idx = await createAsanaOrgProbe().tokenIndexForProject("p1");

    expect(idx).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authOf(fetchMock.mock.calls[0])).toBe(`Bearer ${MF}`);
  });

  it("reports the 1o8 token slot for a legacy project the MF token cannot see", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(404))
      .mockResolvedValueOnce(jsonRes(200, { data: { gid: "1216723494693529" } }));

    const idx = await createAsanaOrgProbe().tokenIndexForProject("1216723494693529");

    expect(idx).toBe(1);
    expect(authOf(fetchMock.mock.calls[1])).toBe(`Bearer ${LEGACY}`);
  });

  it("reports no slot when neither token can see the project", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(404)).mockResolvedValueOnce(jsonRes(404));

    expect(await createAsanaOrgProbe().tokenIndexForProject("gone")).toBeNull();
  });

  it("checks an address with ONLY the given token and never falls back", async () => {
    // This is the whole point: the old validateAsanaUser used the falling-back
    // asanaFetch, so a 1o8-only address passed a check for an MF project and the
    // assignment then failed silently.
    fetchMock.mockResolvedValueOnce(jsonRes(404));

    const exists = await createAsanaOrgProbe().addressExistsForToken(
      "aqib.abbasi@pinwheel.agency",
      0
    );

    expect(exists).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authOf(fetchMock.mock.calls[0])).toBe(`Bearer ${MF}`);
  });

  it("probes a given project only once", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { data: { gid: "p1" } }));
    const probe = createAsanaOrgProbe();

    await probe.tokenIndexForProject("p1");
    await probe.tokenIndexForProject("p1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on a server error instead of reporting the address as absent", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(500, { errors: [{ message: "boom" }] }));

    await expect(
      createAsanaOrgProbe().addressExistsForToken("manu@marketfoundry.agency", 0)
    ).rejects.toThrow(/500/);
  });
});

describe("hasAsanaToken", () => {
  it("is true when either token is set and false when neither is", () => {
    expect(hasAsanaToken()).toBe(true);
    delete process.env.ASANA_ACCESS_TOKEN;
    expect(hasAsanaToken()).toBe(true);
    delete process.env.ASANA_ACCESS_TOKEN_MF;
    expect(hasAsanaToken()).toBe(false);
    process.env.ASANA_ACCESS_TOKEN_MF = MF;
    expect(hasAsanaToken()).toBe(true);
  });
});
