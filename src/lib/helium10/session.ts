// One way into Helium 10 for every caller: the API key from Helium 10 → Settings → MCP
// (sent as a Bearer token to the same MCP server) when HELIUM10_API_KEY is set, otherwise the
// shared OAuth connection. Each tool call costs 1 of the account's monthly MCP calls, so every
// call is logged (tool name only, never arguments or the key).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { boundedFetch, SERVER_URL, withMcp } from "./client";
import { sharedConnectionStatus, withSharedConnection } from "./store";

export function helium10ApiKey(): string | null {
  const key = process.env.HELIUM10_API_KEY?.trim();
  return key ? key : null;
}

export function keyTransportOptions(key: string) {
  return { requestInit: { headers: { Authorization: `Bearer ${key}` } }, fetch: boundedFetch };
}

export function redactKey(message: string, key: string): string {
  return message.split(key).join("[redacted]");
}

type ToolClient = { callTool: (...args: never[]) => Promise<unknown> };

/** Log each tool call (one quota unit) with its name and which auth path made it. */
export function withCallLog<C extends ToolClient>(client: C, auth: "key" | "oauth"): C {
  if (typeof client?.callTool !== "function") return client;
  const call = client.callTool.bind(client) as (...args: unknown[]) => Promise<unknown>;
  (client as { callTool: unknown }).callTool = (...args: unknown[]) => {
    const name = (args[0] as { name?: unknown } | undefined)?.name;
    console.info("[helium10] tool call", { tool: typeof name === "string" ? name : "unknown", auth });
    return call(...args);
  };
  return client;
}

async function connectWithKey<T>(key: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: "mfhub-seo", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(SERVER_URL), keyTransportOptions(key));
  try {
    await client.connect(transport, { timeout: 45_000 });
    return await run(client);
  } finally { await client.close(); }
}

type Deps = { connectWithKey?: <T>(key: string, run: (client: Client) => Promise<T>) => Promise<T> };

export async function withHelium10<T>(run: (client: Client) => Promise<T>, deps: Deps = {}): Promise<T> {
  const key = helium10ApiKey();
  if (!key) return withSharedConnection((provider) => withMcp(provider, (client) => run(withCallLog(client, "oauth"))));
  try {
    return await (deps.connectWithKey ?? connectWithKey)(key, (client) => run(withCallLog(client, "key")));
  } catch (error) {
    if (error instanceof Error && error.message.includes(key)) error.message = redactKey(error.message, key);
    throw error;
  }
}

/** Connected for the SEO Manager badge: always with a key, else the shared OAuth connection's state. */
export async function helium10Connected(): Promise<boolean> {
  return helium10ApiKey() ? true : sharedConnectionStatus();
}
