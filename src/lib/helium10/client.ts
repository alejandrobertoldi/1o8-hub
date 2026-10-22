import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { PendingState } from "./credentials";
import { readKeywordPayload } from "./keywords";

export const SERVER_URL = "https://mcp.helium10.com/mcp";
export type ConnectionData = {
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  verifier?: string;
  pending?: PendingState;
};
export class HeliumProvider implements OAuthClientProvider {
  authorizationUrl?: string;
  constructor(public data: ConnectionData, private origin: string) {}
  get redirectUrl() { return `${this.origin}/api/seo/helium10/callback`; }
  get clientMetadata() {
    return { client_name: "1o8 Hub SEO", redirect_uris: [this.redirectUrl], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope: "mcp:tools" };
  }
  state() {
    if (!this.data.pending) throw new Error("Reconnect the shared Helium 10 account from SEO Manager.");
    return this.data.pending.state;
  }
  clientInformation() { return this.data.client; }
  saveClientInformation(client: OAuthClientInformationMixed) { this.data.client = client; }
  tokens() { return this.data.tokens; }
  saveTokens(tokens: OAuthTokens) { this.data.tokens = { ...tokens, refresh_token: tokens.refresh_token ?? this.data.tokens?.refresh_token }; }
  redirectToAuthorization(url: URL) { this.authorizationUrl = url.toString(); }
  saveCodeVerifier(verifier: string) { this.data.verifier = verifier; }
  codeVerifier() {
    if (!this.data.verifier) throw new Error("Reconnect the shared Helium 10 account from SEO Manager.");
    return this.data.verifier;
  }
  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "client") delete this.data.client;
    if (scope === "all" || scope === "tokens") delete this.data.tokens;
    if (scope === "all" || scope === "verifier") delete this.data.verifier;
  }
}

// Bound every HTTP operation, including discovery and token refresh.
export const boundedFetch: typeof fetch = (input, init) => fetch(input, {
  ...init, cache: "no-store",
  signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
});

export async function withMcp<T>(provider: HeliumProvider, run: (client: Client) => Promise<T>): Promise<T> {
  if (!provider.tokens()) throw new Error("Reconnect the shared Helium 10 account from SEO Manager.");
  const client = new Client({ name: "mfhub-seo", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(SERVER_URL), { authProvider: provider, fetch: boundedFetch });
  try {
    await client.connect(transport, { timeout: 45_000 });
    return await run(client);
  } finally { await client.close(); }
}

type ResearchClient = {
  listTools(params?: { cursor?: string }, options?: { timeout: number }): Promise<{ tools: { name: string }[]; nextCursor?: string }>;
  callTool(params: { name: string; arguments: Record<string, unknown> }, schema?: undefined, options?: { timeout: number }): Promise<unknown>;
};
export async function fetchAsinKeywords(client: ResearchClient, asins: string[], marketplace: string, deadline = Date.now() + 220_000): Promise<unknown[]> {
  let cursor: string | undefined, name: string | undefined;
  const visited = new Set<string>();
  do {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Helium 10 tool discovery timed out.");
    const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: Math.min(45_000, remaining) });
    // Only explicitly recognized read-only research tools, never an arbitrary model-selected tool.
    name = page.tools.find(tool => tool.name === "get_keywords_by_asin" || tool.name === "helium_10_get_keywords_by_asin")?.name;
    cursor = page.nextCursor;
    if (cursor && visited.has(cursor)) throw new Error("Helium 10 repeated a tool discovery page.");
    if (cursor) visited.add(cursor);
  } while (!name && cursor && visited.size < 50);
  if (!name) throw new Error("Helium 10 reverse-ASIN keyword research is not available for this account.");
  const rows: unknown[] = [];
  for (const asin of asins) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Helium 10 batch timed out. Existing inputs were preserved.");
    const result = await client.callTool({ name, arguments: { asin, marketplace, exclude_variations: true } }, undefined, { timeout: Math.min(45_000, remaining) });
    rows.push(...readKeywordPayload(result));
  }
  return rows;
}
