// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  withSharedConnection: vi.fn(),
  withMcp: vi.fn(),
  sharedConnectionStatus: vi.fn(),
}));
vi.mock("./store", () => ({ withSharedConnection: h.withSharedConnection, sharedConnectionStatus: h.sharedConnectionStatus }));
vi.mock("./client", () => ({ withMcp: h.withMcp, boundedFetch: vi.fn(), SERVER_URL: "https://mcp.helium10.com/mcp" }));

import { helium10ApiKey, keyTransportOptions, withHelium10, helium10Connected, withCallLog, redactKey } from "./session";

const KEY = "h10_test_key_0123456789abcdef0123456789abcdef";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Helium 10 session (API key first, OAuth fallback)", () => {
  it("reads the key from HELIUM10_API_KEY, trimmed; blank means no key", () => {
    vi.stubEnv("HELIUM10_API_KEY", `  ${KEY} `);
    expect(helium10ApiKey()).toBe(KEY);
    vi.stubEnv("HELIUM10_API_KEY", "   ");
    expect(helium10ApiKey()).toBeNull();
  });

  it("sends the key as a Bearer token on the MCP transport (never in the URL)", () => {
    const opts = keyTransportOptions(KEY);
    expect(opts.requestInit.headers).toEqual({ Authorization: `Bearer ${KEY}` });
  });

  it("with a key: uses the key connection and never touches the OAuth store", async () => {
    vi.stubEnv("HELIUM10_API_KEY", KEY);
    const client = { callTool: vi.fn(async () => "ok"), listTools: vi.fn() };
    const connect = vi.fn(async (_key: string, run: (c: typeof client) => Promise<string>) => run(client));
    expect(await withHelium10(async (c) => c.callTool({ name: "get_keywords_by_asin", arguments: {} }), { connectWithKey: connect as never })).toBe("ok");
    expect(connect).toHaveBeenCalledWith(KEY, expect.any(Function));
    expect(h.withSharedConnection).not.toHaveBeenCalled();
  });

  it("without a key: falls back to today's shared OAuth connection", async () => {
    vi.stubEnv("HELIUM10_API_KEY", "");
    h.withSharedConnection.mockImplementation(async (run: (p: unknown) => unknown) => run("provider"));
    h.withMcp.mockImplementation(async (_p: unknown, run: (c: unknown) => unknown) => run({ callTool: vi.fn(), listTools: vi.fn() }));
    expect(await withHelium10(async () => "oauth")).toBe("oauth");
    expect(h.withMcp).toHaveBeenCalledWith("provider", expect.any(Function));
  });

  it("a key-path error never carries the key", async () => {
    vi.stubEnv("HELIUM10_API_KEY", KEY);
    const connect = vi.fn(async () => { throw new Error(`401 Unauthorized for Bearer ${KEY}`); });
    const err = await withHelium10(async () => "x", { connectWithKey: connect as never }).catch((e: Error) => e);
    expect((err as Error).message).toBe("401 Unauthorized for Bearer [redacted]");
    expect(redactKey(`a${KEY}b`, KEY)).toBe("a[redacted]b");
  });

  it("connected = true with a key, else the OAuth connection's status", async () => {
    vi.stubEnv("HELIUM10_API_KEY", KEY);
    expect(await helium10Connected()).toBe(true);
    vi.stubEnv("HELIUM10_API_KEY", "");
    h.sharedConnectionStatus.mockResolvedValue(false);
    expect(await helium10Connected()).toBe(false);
  });

  it("logs one line per tool call (usage against the monthly quota), without arguments", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const original = vi.fn(async (_req: unknown) => "r");
    const wrapped = withCallLog({ callTool: original, listTools: vi.fn() }, "key");
    expect(await wrapped.callTool({ name: "get_asin_reviews_history", arguments: { asin: "B0SECRET" } } as never)).toBe("r");
    expect(original).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[helium10] tool call", { tool: "get_asin_reviews_history", auth: "key" });
    log.mockRestore();
  });
});
